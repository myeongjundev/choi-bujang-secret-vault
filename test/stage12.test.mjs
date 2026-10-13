import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectOperationsStatus } from '../src/operations-status.mjs';
import { readFile } from 'node:fs/promises';
import { runAttackChecks } from '../src/attack-check.mjs';
import { collectCheckSummary, summarizeChecks } from '../src/check-summary.mjs';
import checkSummaryHandler from '../api/checks.mjs';
const config = { publicAppUrl: 'https://fixture.local' };
const matrix = { cases: Array.from({ length: 41 }, (_, i) => ({ id: `case_${i}`, stage: 12, name: 'Practice matrix entry', expected: 'reject', status: 'passed' })) };

test('dashboard counters come from actual calls; fake matrix status never becomes execution evidence', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => { urls.push(url.pathname); assert.ok(options.alephEvidence.caseId);
    assert.match(options.alephEvidence.requestKey, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u);
    assert.deepEqual(Object.keys(options.alephEvidence).sort(), ['caseId', 'requestKey']);
    if (url.pathname === '/api/recovery-plan') return Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 });
    return new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }); };
  const out = await collectOperationsStatus(config, matrix, { fetchImpl });
  assert.equal(urls.length, 7); assert.equal(out.counts.passed, 7); assert.equal(out.counts.failed, 0);
  assert.deepEqual(out.localCounts, { passed: 4, failed: 0 });
  assert.equal(out.counts.officialEngineNotRun, 41); assert.ok(out.attackMatrix.every(row => row.status === 'not_run' && row.requestId === null));
  assert.equal(out.revocation.liveCount, null); assert.equal(out.detection.source, 'local_fixture'); assert.equal(out.recovery.verified, true);
  assert.equal(out.counts.notRun, 3);
  assert.ok(out.checks.filter(row => row.status !== 'not_run').every(row => row.requestId && row.checkedAt));
  assert.ok(out.checks.filter(row => row.source === 'official_engine_unconnected').every(row => row.requestId === null && row.checkedAt === null));
});

test('unreachable and unexpectedly open APIs remain not_run/failed; no private body is recorded', async () => {
  const fetchImpl = async url => { if (url.pathname === '/api/recovery-plan') throw new Error('private details');
    return new Response('private note text must never be retained', { status: 200 }); };
  const out = await collectOperationsStatus(config, matrix, { fetchImpl });
  assert.equal(out.counts.failed, 5); assert.equal(out.counts.notRun, 4);
  assert.equal(out.recovery.verified, false); assert.ok(!JSON.stringify(out).includes('private note text'));
  assert.ok(!JSON.stringify(out).includes('private details'));
});

test('dashboard renders server observations and clears prior successes if a new read fails', async () => {
  const elements = new Map();
  const element = () => ({ textContent: '', children: [], append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; } });
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  let unavailable = false;
  const observations = await collectOperationsStatus(config, matrix, { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  const source = await readFile(new URL('../src/operations-browser.mjs', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'fetch', source)(document, async path => {
    if (unavailable) throw new Error('network down');
    if (path === '/api/checks') return Response.json({ schema: 'vault.checks.v1', total: 16, blocked: 12, failed: 0, notRun: 4 });
    return Response.json(observations);
  });
  assert.ok(elements.get('counts').textContent.includes('실제 HTTP 7건 일치'));
  assert.ok(elements.get('counts').textContent.includes('로컬 가상 시험 4건 일치'));
  assert.ok(elements.get('counts').textContent.includes('3건 미실행'));
  assert.equal(elements.get('matrix').children.length, 41);
  assert.equal(elements.get('checks').children.length, 14);
  unavailable = true; await elements.get('refresh').onclick();
  assert.equal(elements.get('checks').children.length, 0); assert.equal(elements.get('matrix').children.length, 0);
  assert.equal(elements.get('counts').textContent, '미확인');
  assert.ok(elements.get('status').textContent.includes('통과로 표시하지 않습니다'));
});

test('bundle HTTP observations correlate with their real case IDs without transmitting evidence in headers or URLs', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  const configuration = { step: 12, publicAppUrl: 'https://fixture.local', sampleMarker: 'absent-fixture-marker',
    originalApiUrl: 'https://fixture.supabase.co/rest/v1/user_notes' };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.deepEqual(Object.keys(options.alephEvidence).sort(), ['caseId', 'requestKey']);
    assert.match(options.alephEvidence.requestKey, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u);
    assert.ok(!JSON.stringify(options.headers).includes(options.alephEvidence.requestKey));
    assert.ok(!url.href.includes(options.alephEvidence.requestKey));
    if (url.pathname === '/api/auth-config') return Response.json({ url: 'https://fixture.supabase.co', publishableKey: 'public-fixture' });
    if (url.pathname === '/api/recovery-plan') return Response.json({ backupVerified: true, scope: 'notes' });
    if (url.pathname === '/api/device-status') return Response.json({ connected: false, approval: 'unavailable' });
    if (url.pathname === '/api/operations-status') return Response.json({ schema: 'vault.operations.v1', counts: { passed: 11, failed: 0, notRun: 3, officialEngineNotRun: 41 } });
    const status = url.pathname === '/data.json' ? 404 : url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') ? 401 : 200;
    return new Response('{}', { status });
  };
  try {
    const attempts = await runAttackChecks(configuration);
    assert.equal(attempts.length, 16);
    assert.ok(attempts.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed,result,stage'));
    for (const row of attempts.filter(row => !row.attackId.startsWith('local_'))) {
      assert.equal(calls.filter(call => call.options.alephEvidence.caseId === row.attackId).length, 1);
    }
    assert.equal(new Set(calls.map(call => call.options.alephEvidence.requestKey)).size, calls.length);
  } finally { globalThis.fetch = originalFetch; }
});

const bundleFixture = { step: 12, publicAppUrl: 'https://fixture.local', sampleMarker: 'absent-fixture-marker',
  originalApiUrl: 'https://fixture.supabase.co/rest/v1/user_notes' };
function fixtureResponse(url) {
  if (url.pathname === '/api/auth-config') return Response.json({ url: 'https://fixture.supabase.co', publishableKey: 'public-fixture' });
  if (url.pathname === '/api/recovery-plan') return Response.json({ backupVerified: true, scope: 'notes' });
  if (url.pathname === '/api/device-status') return Response.json({ connected: false, approval: 'unavailable' });
  if (url.pathname === '/api/operations-status') return Response.json({ schema: 'vault.operations.v1', counts: { passed: 11, failed: 0, notRun: 3, officialEngineNotRun: 41 } });
  return new Response('{}', { status: url.pathname === '/data.json' ? 404 : url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') ? 401 : 200 });
}

test('one unavailable dashboard does not abort other bundle observations or become a blocked attack', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => {
    if (url.pathname === '/api/operations-status') throw new Error('private error must not be retained');
    return fixtureResponse(url);
  } });
  assert.equal(attempts.length, 16);
  assert.equal(attempts.find(row => row.attackId === 'anonymous_read').observed, 'HTTP 401');
  assert.equal(attempts.find(row => row.attackId === 'operations_observation').observed, 'not_run');
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 5);
  assert.ok(!JSON.stringify(attempts).includes('private error'));
});

test('whole-response deadlines end even if transport ignores AbortSignal or the response body stalls', async () => {
  for (const fetchImpl of [async () => new Promise(() => {}), async () => ({ status: 200, text: () => new Promise(() => {}), json: () => new Promise(() => {}) })]) {
    const before = Date.now();
    const attempts = await runAttackChecks(bundleFixture, { fetchImpl, timeoutMs: 30 });
    assert.ok(Date.now() - before < 1000);
    assert.equal(attempts.length, 16);
    assert.equal(attempts.filter(row => row.observed === 'not_run').length, 16);
    assert.ok(attempts.filter(row => row.attackId.startsWith('local_')).every(row => row.observed === 'not_run'));
  }
});

test('malformed observation JSON is unavailable evidence, while unsafe original API configuration stops', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => url.pathname === '/api/operations-status'
    ? new Response('not JSON', { status: 200 }) : fixtureResponse(url) });
  assert.equal(attempts.find(row => row.attackId === 'operations_observation').observed, 'not_run');
  assert.ok(!JSON.stringify(attempts).includes('not JSON'));
  await assert.rejects(runAttackChecks({ ...bundleFixture, originalApiUrl: 'https://other.supabase.co/rest/v1/user_notes' },
    { fetchImpl: async url => fixtureResponse(url) }), /invalid_original_api_origin/u);
});

test('R5 config input and public-example URL input execute identical observations', async () => {
  const repositoryConfig = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const options = { fetchImpl: async url => url.pathname === '/api/auth-config'
    ? Response.json({ url: new URL(repositoryConfig.originalApiUrl).origin, publishableKey: 'public-fixture' })
    : fixtureResponse(url) };
  const fromConfig = await runAttackChecks(repositoryConfig, options);
  const fromUrl = await runAttackChecks(repositoryConfig.publicAppUrl, options);
  assert.deepEqual(fromUrl, fromConfig); assert.equal(fromUrl.length, 16);
  await assert.rejects(runAttackChecks('http://fixture.local', options), /invalid_observation_origin/u);
});

test('isolated GET/HEAD-only bundle execution completes without claiming write or restore checks ran', async () => {
  const calls = [];
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async (url, options) => {
    assert.ok(['GET', 'HEAD'].includes(options.method), 'isolated runner rejects mutating requests');
    calls.push({ path: url.pathname, method: options.method });
    return fixtureResponse(url);
  } });
  assert.equal(attempts.length, 16);
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 4);
  assert.equal(calls.length, 13); // auth-config precedes the direct table read
  assert.ok(!calls.some(row => row.path.startsWith('/api/restore/')));
  for (const id of ['anonymous_create', 'anonymous_notice_put', 'anonymous_restore', 'malformed_restore']) {
    assert.ok(!attempts.some(row => row.attackId === id));
  }
  assert.ok(attempts.some(row => row.attackId === 'anonymous_read' && row.observed === 'HTTP 401'));
  assert.ok(attempts.some(row => row.attackId === 'backup_verification' && row.observed === 'HTTP 200'));
});

test('bundle claims only recorded HTTP statuses and marks non-network fixtures not_run', async () => {
  const traced = new Map();
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async (url, options) => {
    const response = fixtureResponse(url);
    traced.set(options.alephEvidence.caseId, response.status);
    return response;
  } });
  for (const row of attempts) {
    assert.equal(row.observed, traced.has(row.attackId)
      ? `HTTP ${traced.get(row.attackId)}` : 'not_run');
  }
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 4);
  assert.ok(!JSON.stringify(attempts.map(row => row.observed)).match(/fixture|leak marker|connected|scope|matched|note count/u));
});

test('dashboard live counts equal HTTP rows while fixture successes remain a separate source', async () => {
  const out = await collectOperationsStatus(config, matrix, { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  assert.equal(out.counts.passed, out.checks.filter(row => row.source === 'live_http' && row.status === 'passed').length);
  assert.equal(out.localCounts.passed, out.checks.filter(row => row.source === 'local_fixture' && row.status === 'passed').length);
  assert.equal(out.counts.passed, 7); assert.equal(out.localCounts.passed, 4);
  assert.equal(out.counts.officialEngineNotRun, 41);
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  assert.equal(attempts.find(row => row.attackId === 'operations_observation').observed, 'HTTP 200');
});

test('submission results and fresh screen summary use the same real responses, including failure and unavailable cases', async () => {
  const options = { fetchImpl: async url => fixtureResponse(url), commit: 'a'.repeat(40) };
  const attempts = await runAttackChecks(bundleFixture, options);
  const summary = await collectCheckSummary(bundleFixture, options);
  assert.deepEqual({ total: summary.total, blocked: summary.blocked, failed: summary.failed, notRun: summary.notRun },
    { total: 16, blocked: 12, failed: 0, notRun: 4 });
  assert.deepEqual(summarizeChecks(attempts, { commit: summary.commit, checkedAt: summary.checkedAt }), summary);
  const failing = await collectCheckSummary(bundleFixture, { fetchImpl: async url => {
    if (url.pathname === '/api/notes') return new Response('unexpected', { status: 200 });
    if (url.pathname === '/api/operations-status') throw new Error('unavailable');
    return fixtureResponse(url);
  } });
  assert.equal(failing.failed, 2); assert.equal(failing.notRun, 5); assert.equal(failing.blocked, 9);
  assert.equal(failing.total, failing.blocked + failing.failed + failing.notRun);
  assert.throws(() => summarizeChecks([{ result: 'invented' }]), /invalid_check_results/u);
});

test('summary API refuses mutations and arbitrary cases and exposes only a fresh bounded aggregate', async () => {
  const originalFetch = globalThis.fetch;
  const repositoryConfig = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(options.method, 'GET');
    return url.pathname === '/api/auth-config'
      ? Response.json({ url: new URL(repositoryConfig.originalApiUrl).origin, publishableKey: 'public-fixture' })
      : fixtureResponse(url);
  };
  const response = () => ({ code: null, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    for (const req of [{ method: 'POST' }, { method: 'GET', query: { case: 'user-supplied' } }]) {
      const res = response(); await checkSummaryHandler(req, res);
      assert.ok([400, 405].includes(res.code)); assert.equal(calls, 0);
    }
    const res = response(); await checkSummaryHandler({ method: 'GET' }, res);
    assert.equal(res.code, 200); assert.equal(res.body.total, 16);
    assert.equal(res.body.blocked, 12); assert.equal(res.body.failed, 0); assert.equal(res.body.notRun, 4);
    assert.equal(calls, 13); assert.ok(!JSON.stringify(res.body).includes('public-fixture'));
  } finally { globalThis.fetch = originalFetch; }
});
