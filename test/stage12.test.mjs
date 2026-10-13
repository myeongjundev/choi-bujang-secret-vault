import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectOperationsStatus } from '../src/operations-status.mjs';
import { readFile } from 'node:fs/promises';
import { runAttackChecks } from '../src/attack-check.mjs';
import { collectCheckSummary, summarizeChecks } from '../src/check-summary.mjs';
import checkSummaryHandler from '../api/checks.mjs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runFixedRuleCheck } from '../src/fixed-rule-check.mjs';
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
  assert.equal(out.counts.notRun, 7);
  assert.ok(out.checks.filter(row => row.status !== 'not_run').every(row => row.requestId && row.checkedAt));
  assert.ok(out.checks.filter(row => row.source === 'official_engine_unconnected').every(row => row.requestId === null && row.checkedAt === null));
});

test('unreachable and unexpectedly open APIs remain not_run/failed; no private body is recorded', async () => {
  const fetchImpl = async url => { if (url.pathname === '/api/recovery-plan') throw new Error('private details');
    return new Response('private note text must never be retained', { status: 200 }); };
  const out = await collectOperationsStatus(config, matrix, { fetchImpl });
  assert.equal(out.counts.failed, 5); assert.equal(out.counts.notRun, 8);
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
    if (path === '/api/checks') return Response.json({ schema: 'vault.checks.v1', total: 9, blocked: 5, failed: 0, notRun: 4 });
    return Response.json(observations);
  });
  assert.ok(elements.get('counts').textContent.includes('실제 HTTP 7건 일치'));
  assert.ok(elements.get('counts').textContent.includes('로컬 가상 시험 4건 일치'));
  assert.ok(elements.get('counts').textContent.includes('7건 미실행'));
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
    if (url.pathname === '/api/checks') return Response.json(await runFixedRuleCheck(url.searchParams.get('case')));
    if (url.pathname === '/api/recovery-plan') return Response.json({ backupVerified: true, scope: 'notes' });
    if (url.pathname === '/api/device-status') return Response.json({ connected: false, approval: 'unavailable' });
    if (url.pathname === '/api/operations-status') return Response.json({ schema: 'vault.operations.v1', counts: { passed: 11, failed: 0, notRun: 3, officialEngineNotRun: 41 } });
    const status = url.pathname === '/data.json' ? 404 : url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') ? 401 : 200;
    return new Response('{}', { status });
  };
  try {
    const attempts = await runAttackChecks(configuration);
    assert.equal(attempts.length, 9);
    assert.ok(attempts.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed,result,stage'));
    for (const row of attempts.filter(row => !row.attackId.startsWith('local_'))) {
      assert.equal(calls.filter(call => call.options.alephEvidence.caseId === row.attackId).length, 1);
    }
    assert.equal(new Set(calls.map(call => call.options.alephEvidence.requestKey)).size, calls.length);
  } finally { globalThis.fetch = originalFetch; }
});

const bundleFixture = { step: 12, publicAppUrl: 'https://fixture.local', sampleMarker: 'absent-fixture-marker',
  originalApiUrl: 'https://fixture.supabase.co/rest/v1/user_notes' };
async function fixtureResponse(url) {
  if (url.pathname === '/api/checks') return Response.json(await runFixedRuleCheck(url.searchParams.get('case')));
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
  assert.equal(attempts.length, 10);
  assert.equal(attempts.find(row => row.attackId === 'anonymous_read').observed, 'HTTP 401');
  assert.equal(attempts.find(row => row.attackId === 'operations_observation').observed, 'not_run');
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 1);
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
  assert.deepEqual(fromUrl, fromConfig); assert.equal(fromUrl.length, 9);
  await assert.rejects(runAttackChecks('http://fixture.local', options), /invalid_observation_origin/u);
});

test('isolated GET/HEAD-only bundle execution completes without claiming write or restore checks ran', async () => {
  const calls = [];
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async (url, options) => {
    assert.ok(['GET', 'HEAD'].includes(options.method), 'isolated runner rejects mutating requests');
    calls.push({ path: url.pathname, method: options.method });
    return fixtureResponse(url);
  } });
  assert.equal(attempts.length, 9);
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 0);
  assert.equal(calls.length, 17); // auth-config precedes table read; four fixed-case HTTP calls
  assert.ok(!calls.some(row => row.path.startsWith('/api/restore/')));
  for (const id of ['anonymous_create', 'anonymous_notice_put', 'anonymous_restore', 'malformed_restore']) {
    assert.ok(!attempts.some(row => row.attackId === id));
  }
  assert.ok(attempts.some(row => row.attackId === 'anonymous_read' && row.observed === 'HTTP 401'));
  assert.ok(!attempts.some(row => row.attackId === 'backup_verification'));
});

test('bundle claims only recorded HTTP states and actual ready values from fixed-case responses', async () => {
  const traced = new Map();
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async (url, options) => {
    const response = await fixtureResponse(url);
    const body = await response.clone().text();
    let ready; try { ready = JSON.parse(body).ready; } catch {}
    traced.set(options.alephEvidence.caseId, { status: response.status, ready });
    return response;
  } });
  for (const row of attempts) {
    assert.equal(row.observed, traced.has(row.attackId)
      ? `HTTP ${traced.get(row.attackId).status}${typeof traced.get(row.attackId).ready === 'boolean' ? `; jsonReady=${traced.get(row.attackId).ready}` : ''}` : 'not_run');
  }
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 0);
  assert.ok(!JSON.stringify(attempts.map(row => row.observed)).match(/fixture|leak marker|connected|scope|matched|note count/u));
});

test('dashboard live counts equal HTTP rows while fixture successes remain a separate source', async () => {
  const out = await collectOperationsStatus(config, matrix, { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  assert.equal(out.counts.passed, out.checks.filter(row => row.source === 'live_http' && row.status === 'passed').length);
  assert.equal(out.localCounts.passed, out.checks.filter(row => row.source === 'local_fixture' && row.localStatus === 'passed').length);
  assert.equal(out.counts.passed, 7); assert.equal(out.localCounts.passed, 4);
  assert.equal(out.counts.officialEngineNotRun, 41);
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  assert.ok(!attempts.some(row => row.attackId === 'operations_observation'));
});

test('submission results and fresh screen summary use the same real responses, including failure and unavailable cases', async () => {
  const options = { fetchImpl: async url => fixtureResponse(url), commit: 'a'.repeat(40) };
  const attempts = await runAttackChecks(bundleFixture, options);
  const summary = await collectCheckSummary(bundleFixture, options);
  assert.deepEqual({ total: summary.total, blocked: summary.blocked, failed: summary.failed, notRun: summary.notRun },
    { total: 9, blocked: 9, failed: 0, notRun: 0 });
  assert.deepEqual(summarizeChecks(attempts, { commit: summary.commit, checkedAt: summary.checkedAt }), summary);
  const failing = await collectCheckSummary(bundleFixture, { fetchImpl: async url => {
    if (url.pathname === '/api/notes') return new Response('unexpected', { status: 200 });
    if (url.pathname === '/api/operations-status') throw new Error('unavailable');
    return fixtureResponse(url);
  } });
  assert.equal(failing.failed, 2); assert.equal(failing.notRun, 1); assert.equal(failing.blocked, 7);
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
    assert.equal(res.code, 200); assert.equal(res.body.total, 9);
    assert.equal(res.body.blocked, 9); assert.equal(res.body.failed, 0); assert.equal(res.body.notRun, 0);
    assert.equal(res.body.httpDenied, 5); assert.equal(res.body.fixedFixtureReady, 4);
    assert.equal(res.body.attackAttempts.length, 9);
    assert.equal(res.body.official.total, 41); assert.equal(res.body.official.notRun, 41);
    assert.equal(res.body.official.blocked, 0); assert.equal(res.body.official.failed, 0);
    assert.equal(calls, 17); assert.ok(!JSON.stringify(res.body).includes('public-fixture'));
  } finally { globalThis.fetch = originalFetch; }
});

test('unexecuted network cases and successful normal reads never inflate blocked attack totals', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  const blocked = attempts.filter(row => row.result === 'blocked');
  assert.equal(blocked.length, 9);
  assert.equal(blocked.filter(row => /^HTTP (401|403|404)$/u.test(row.observed)).length, 5);
  assert.equal(blocked.filter(row => row.observed === 'HTTP 200; jsonReady=true').length, 4);
  const out = await collectOperationsStatus(config, matrix, { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  assert.ok(out.checks.filter(row => row.source === 'local_fixture').every(row => row.status === 'not_run' && row.requestId === null && row.checkedAt === null));
  assert.ok(out.attackMatrix.every(row => row.status === 'not_run' && row.requestId === null && row.checkedAt === null));
});

test('summary exposes per-case unrun evidence and never promotes a planned case to blocked', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  const summary = summarizeChecks(attempts, { plannedCases: matrix.cases });
  assert.equal(summary.blocked, summary.attackAttempts.filter(row => row.result === 'blocked').length);
  assert.equal(summary.notRun, summary.attackAttempts.filter(row => row.result === 'not_run').length);
  assert.equal(summary.official.total, 41); assert.equal(summary.official.blocked, 0);
  assert.equal(summary.official.notRun, summary.official.cases.filter(row => row.result === 'not_run').length);
  assert.ok(summary.official.cases.every(row => row.status === 'not_run' && row.requestId === null && row.checkedAt === null));
});

test('bundle builds official unrun evidence under the judge Git-command allowlist without extra Git reads', async () => {
  const source = await readFile(new URL('../scripts/bundle.mjs', import.meta.url), 'utf8');
  const repository = 'https://github.com/fixture/defense';
  const calls = [], writes = [], errors = [];
  const execFileSync = (command, argv) => {
    assert.equal(command, 'git');
    const args = argv.slice(2); calls.push(args);
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return 'a'.repeat(40);
    if (args[0] === 'config' || args.join(' ') === 'remote get-url origin') return repository;
    if (args[0] === 'diff-tree') return 'scripts/bundle.mjs\n';
    if (args.join(' ') === 'show HEAD:aleph.config.json') return JSON.stringify({ step: 12, repoUrl: repository,
      publicAppUrl: 'https://fixture.local', identityProvider: { issuer: 'fixture', audience: 'fixture', jwksUrl: 'https://fixture.local/keys' },
      originalApiUrl: 'https://fixture.supabase.co/rest/v1/user_notes', allowedRoutes: [{ service: 'notes', method: 'GET', pathPattern: '/api/my/notes' }] });
    throw new Error('sandbox_disallowed_git_read');
  };
  const readFileSync = path => {
    if (String(path).endsWith('bundle-notes.json')) return JSON.stringify({ explanation: 'Executed bounded public checks, with unavailable cases separate.' });
    if (String(path).endsWith('attack-matrix.json')) return JSON.stringify(matrix);
    throw new Error('unexpected_file_read');
  };
  const importer = async url => String(url).endsWith('decider.mjs') ? { RULE_IDS: ['device_registered'] }
    : { runAttackChecks: async () => [{ attackId: 'anonymous_read', stage: 3, expected: 'HTTP 401', observed: 'HTTP 401', result: 'blocked' }] };
  const fakeProcess = { env: {}, stdout: { write() {} }, stderr: { write(value) { errors.push(value); } } };
  const executable = source.replace(/^import .*;\r?\n/gmu, '').replaceAll('import.meta.dirname', 'scriptDirectory').replaceAll('await import(', 'await importer(');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('execFileSync', 'mkdirSync', 'readFileSync', 'writeFileSync', 'join', 'resolve', 'pathToFileURL',
    'scriptDirectory', 'importer', 'process', executable)(execFileSync, () => {}, readFileSync,
    (_path, value) => writes.push(JSON.parse(value)), join, resolve, pathToFileURL, resolve('scripts'), importer, fakeProcess);
  assert.deepEqual(errors, []); assert.equal(fakeProcess.exitCode, undefined); assert.equal(writes.length, 1);
  assert.equal(writes[0].officialAttackMatrix.length, 41);
  assert.ok(writes[0].officialAttackMatrix.every(row => row.result === 'not_run' && row.requestId === null && row.checkedAt === null));
  assert.equal(calls.filter(args => args[0] === 'show').length, 1);
});

test('fixed-case API computes only four fictional conditions and never accepts a caller identity or input', async () => {
  const response = () => ({ code: null, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  for (const caseId of ['local_unregistered_device', 'local_compound_risk', 'local_unknown_route', 'local_detection_121']) {
    const res = response();
    await checkSummaryHandler({ method: 'GET', query: { case: caseId, subjectId: 'caller_claim', deviceRegistered: true } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.ready, true); assert.equal(res.body.source, 'fixed_fixture');
    assert.ok(!JSON.stringify(res.body).includes('caller_claim'));
  }
  assert.equal(await runFixedRuleCheck('__proto__'), null); assert.equal(await runFixedRuleCheck('local_step_up_verified'), null);
  const res = response(); await checkSummaryHandler({ method: 'GET', query: { case: ['local_unknown_route'] } }, res);
  assert.equal(res.code, 400);
});

test('fixed-case false or missing responses never become ready success or operational execution', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => {
    if (url.pathname === '/api/checks' && url.searchParams.get('case') === 'local_compound_risk') return Response.json({ source: 'fixed_fixture', ready: false });
    if (url.pathname === '/api/checks' && url.searchParams.get('case') === 'local_detection_121') throw new Error('unavailable');
    return fixtureResponse(url);
  } });
  const falseCase = attempts.find(row => row.attackId === 'local_compound_risk');
  assert.equal(falseCase.observed, 'HTTP 200; jsonReady=false'); assert.equal(falseCase.result, 'breached');
  const unavailable = attempts.find(row => row.attackId === 'local_detection_121');
  assert.equal(unavailable.observed, 'not_run'); assert.equal(unavailable.result, 'not_run');
  const summary = summarizeChecks(attempts, { plannedCases: matrix.cases });
  assert.equal(summary.httpDenied, 5); assert.equal(summary.fixedFixtureReady, 2);
  assert.equal(summary.failed, 1); assert.equal(summary.notRun, 1); assert.equal(summary.official.notRun, 41);
});
