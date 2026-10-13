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
import { normalizeCheckResults } from '../src/check-results.mjs';
const config = { publicAppUrl: 'https://fixture.local' };
const matrix = { cases: Array.from({ length: 41 }, (_, i) => ({ id: `case_${i}`, stage: 12, name: 'Practice matrix entry', expected: 'reject', status: 'not_run', result: 'not_run' })) };
function corruptedPlan() {
  const input = structuredClone(matrix);
  Object.assign(input.cases[0], { status: 'passed', result: 'blocked' });
  return input;
}

test('dashboard counters come from actual calls; fake matrix status never becomes execution evidence', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => { urls.push(url.pathname); assert.ok(options.alephEvidence.caseId);
    assert.match(options.alephEvidence.requestKey, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u);
    assert.deepEqual(Object.keys(options.alephEvidence).sort(), ['caseId', 'requestKey']);
    if (url.pathname === '/api/recovery-plan') return Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 });
    return new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }); };
  const out = await collectOperationsStatus(config, corruptedPlan(), { fetchImpl });
  assert.equal(urls.length, 7); assert.equal(out.counts.passed, 7); assert.equal(out.counts.failed, 0);
  assert.deepEqual(out.localCounts, { matched: 4, mismatched: 0 });
  assert.equal(out.counts.officialEngineNotRun, 41); assert.ok(out.attackMatrix.every(row => row.status === 'not_run' && row.result === 'not_run' && row.requestId === null));
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
  const observations = await collectOperationsStatus(config, corruptedPlan(), { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  const summary = summarizeChecks(await runAttackChecks(bundleFixture, { fetchImpl: fixtureResponse }), { plannedCases: matrix.cases });
  observations.attackMatrix[0] = { ...observations.attackMatrix[0], status: 'passed', result: 'blocked' };
  const source = await readFile(new URL('../src/operations-browser.mjs', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'fetch', source)(document, async path => {
    if (unavailable) throw new Error('network down');
    if (path === '/api/checks') return Response.json(summary);
    return Response.json(observations);
  });
  assert.ok(elements.get('counts').textContent.includes('보조 HTTP 관측 7항목'));
  assert.ok(elements.get('counts').textContent.includes('미실행 0건'));
  assert.ok(elements.get('local-counts').textContent.includes('로컬 가상 계산 4항목'));
  assert.ok(elements.get('engine-counts').textContent.includes('운영 미연결 3항목 · 미실행 3건'));
  assert.equal(elements.get('matrix').children.length, 41);
  assert.equal(elements.get('submission-checks').children.length, 12);
  assert.equal(elements.get('checks').children.length, 7);
  assert.equal(elements.get('local-checks').children.length, 4);
  assert.equal(elements.get('engine-checks').children.length, 3);
  const renderedRows = elements.get('checks').children.map(row => row.children.map(cell => cell.textContent));
  const liveRows = renderedRows.filter(cells => cells[2] === 'live_http');
  assert.equal(liveRows.length, 7);
  assert.ok(liveRows.every(cells => !cells.includes('미실행') && cells[5] === '기대 결과 일치'));
  assert.ok(elements.get('local-checks').children.every(row => row.children[3].textContent === '기대 조건 일치'));
  assert.ok(elements.get('engine-checks').children.every(row => row.children[4].textContent === '미실행'));
  assert.ok(elements.get('matrix').children.every(row => row.children[3].textContent === '미실행'
    && row.children[4].textContent === '—' && row.children[5].textContent === '—'));
  unavailable = true; await elements.get('refresh').onclick();
  for (const id of ['submission-checks', 'checks', 'local-checks', 'engine-checks', 'matrix']) assert.equal(elements.get(id).children.length, 0);
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
    if (url.pathname === '/api/operations-status') return Response.json({ schema: 'vault.operations.v1', counts: { passed: 7, failed: 0, notRun: 7, officialEngineNotRun: 41 } });
    const status = url.pathname === '/data.json' ? 404 : url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') ? 401 : 200;
    return new Response('{}', { status });
  };
  try {
    const attempts = await runAttackChecks(configuration);
    assert.equal(attempts.length, 12);
    assert.ok(attempts.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed,result,stage'));
    for (const row of attempts.filter(row => row.observed !== 'not_run')) {
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
  if (url.pathname === '/api/operations-status') return Response.json({ schema: 'vault.operations.v1', counts: { passed: 7, failed: 0, notRun: 7, officialEngineNotRun: 41 } });
  return new Response('{}', { status: url.pathname === '/data.json' ? 404 : url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') ? 401 : 200 });
}

test('one unavailable dashboard does not abort other bundle observations or become a blocked attack', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => {
    if (url.pathname === '/api/operations-status') throw new Error('private error must not be retained');
    return fixtureResponse(url);
  } });
  assert.equal(attempts.length, 13);
  assert.equal(attempts.find(row => row.attackId === 'anonymous_read').observed, 'HTTP 401');
  assert.equal(attempts.find(row => row.attackId === 'operations_observation').observed, 'not_run');
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 3);
  assert.ok(!JSON.stringify(attempts).includes('private error'));
});

test('whole-response deadlines end even if transport ignores AbortSignal or the response body stalls', async () => {
  for (const fetchImpl of [async () => new Promise(() => {}), async () => ({ status: 200, text: () => new Promise(() => {}), json: () => new Promise(() => {}) })]) {
    const before = Date.now();
    const attempts = await runAttackChecks(bundleFixture, { fetchImpl, timeoutMs: 30 });
    assert.ok(Date.now() - before < 1000);
    assert.equal(attempts.length, 19);
    assert.equal(attempts.filter(row => row.observed === 'not_run').length, 19);
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
  assert.deepEqual(fromUrl, fromConfig); assert.equal(fromUrl.length, 12);
  await assert.rejects(runAttackChecks('http://fixture.local', options), /invalid_observation_origin/u);
});

test('isolated GET/HEAD-only bundle execution completes without claiming write or restore checks ran', async () => {
  const calls = [];
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async (url, options) => {
    assert.ok(['GET', 'HEAD'].includes(options.method), 'isolated runner rejects mutating requests');
    calls.push({ path: url.pathname, method: options.method });
    return fixtureResponse(url);
  } });
  assert.equal(attempts.length, 12);
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 2);
  assert.equal(calls.length, 18); // auth-config precedes table read; four fixed-case HTTP calls
  assert.ok(!calls.some(row => row.path.startsWith('/api/restore/')));
  for (const id of ['anonymous_create', 'anonymous_notice_put', 'anonymous_restore', 'malformed_restore']) {
    assert.ok(!attempts.some(row => row.attackId === id));
  }
  for (const id of ['s10-restore-unauth', 's11-unsigned-write']) {
    const attempt = attempts.find(row => row.attackId === id);
    assert.equal(attempt.observed, 'not_run'); assert.equal(attempt.result, 'not_run');
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
  assert.equal(attempts.filter(row => row.observed === 'not_run').length, 2);
  assert.ok(!JSON.stringify(attempts.map(row => row.observed)).match(/fixture|leak marker|connected|scope|matched|note count/u));
});

test('dashboard live counts equal HTTP rows while fixture successes remain a separate source', async () => {
  const out = await collectOperationsStatus(config, matrix, { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  assert.equal(out.counts.passed, out.checks.filter(row => row.source === 'live_http' && row.status === 'passed').length);
  assert.equal(out.localCounts.matched, out.checks.filter(row => row.source === 'local_fixture' && row.localMatchesExpected === true).length);
  assert.equal(out.counts.passed, 7); assert.equal(out.localCounts.matched, 4);
  assert.equal(out.counts.officialEngineNotRun, 41);
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  assert.ok(!attempts.some(row => row.attackId === 'operations_observation'));
});

test('submission results and fresh screen summary use the same real responses, including failure and unavailable cases', async () => {
  const options = { fetchImpl: async url => fixtureResponse(url), commit: 'a'.repeat(40) };
  const attempts = await runAttackChecks(bundleFixture, options);
  const summary = await collectCheckSummary(bundleFixture, options);
  assert.deepEqual({ total: summary.total, blocked: summary.blocked, failed: summary.failed, notRun: summary.notRun },
    { total: 12, blocked: 10, failed: 0, notRun: 2 });
  assert.deepEqual(summarizeChecks(attempts, { commit: summary.commit, checkedAt: summary.checkedAt, target: summary.target, rules: summary.rules }), summary);
  const failing = await collectCheckSummary(bundleFixture, { fetchImpl: async url => {
    if (url.pathname === '/api/notes') return new Response('unexpected', { status: 200 });
    if (url.pathname === '/api/operations-status') throw new Error('unavailable');
    return fixtureResponse(url);
  } });
  assert.equal(failing.failed, 2); assert.equal(failing.notRun, 3); assert.equal(failing.blocked, 8);
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
    assert.equal(res.code, 200); assert.equal(res.body.total, 12);
    assert.equal(res.body.blocked, 10); assert.equal(res.body.failed, 0); assert.equal(res.body.notRun, 2);
    assert.equal(res.body.attempts.length, 12);
    assert.ok(res.body.attempts.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed,result,stage'));
    assert.equal(res.body.recordSource, '학생 점검 코드(src/attack-check.mjs)');
    assert.equal(res.body.sources.engine.name, 'ALEPH SDP 엔진');
    assert.ok(!('attackAttempts' in res.body) && !('official' in res.body));
    assert.equal(res.body.target, repositoryConfig.publicAppUrl); assert.ok(Array.isArray(res.body.rules));
    assert.equal(calls, 18); assert.ok(!JSON.stringify(res.body).includes('public-fixture'));
  } finally { globalThis.fetch = originalFetch; }
});

test('unexecuted network cases and successful normal reads never inflate blocked attack totals', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  const blocked = attempts.filter(row => row.result === 'blocked');
  assert.equal(blocked.length, 10);
  assert.equal(blocked.filter(row => /^HTTP (401|403|404)$/u.test(row.observed)).length, 6);
  assert.equal(blocked.filter(row => row.observed === 'HTTP 200; jsonReady=true').length, 4);
  const out = await collectOperationsStatus(config, matrix, { fetchImpl: async url => url.pathname === '/api/recovery-plan'
    ? Response.json({ backupVerified: true, scope: 'notes', backupRevision: 1 })
    : new Response(null, { status: url.pathname === '/' ? 200 : url.pathname === '/data.json' ? 404 : 401 }) });
  assert.ok(out.checks.filter(row => row.source === 'local_fixture').every(row => row.status === 'not_run' && row.requestId === null && row.checkedAt === null));
  assert.ok(out.attackMatrix.every(row => row.status === 'not_run' && row.result === 'not_run' && row.requestId === null && row.checkedAt === null));
  assert.ok(out.checks.filter(row => row.source === 'local_fixture').every(row => !('localStatus' in row) && typeof row.localMatchesExpected === 'boolean'));
});

test('summary exposes per-case unrun evidence and never promotes a planned case to blocked', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  const summary = summarizeChecks(attempts, { plannedCases: corruptedPlan().cases });
  assert.equal(summary.blocked, summary.attempts.filter(row => row.result === 'blocked').length);
  assert.equal(summary.notRun, summary.attempts.filter(row => row.result === 'not_run').length);
  assert.ok(!('official' in summary));
  assert.equal(summary.total, 12); assert.ok(!summary.attempts.some(row => row.attackId.startsWith('case_')));
});

test('bundle emits only the canonical submission contract under the judge Git-command allowlist', async () => {
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
    throw new Error('unexpected_file_read');
  };
  const importer = async url => String(url).endsWith('decider.mjs') ? { RULE_IDS: ['device_registered'] }
    : { runAttackChecks: async () => [
      { attackId: 'anonymous_read', stage: 3, expected: 'HTTP 401', observed: 'HTTP 401', result: 'blocked' },
      { attackId: 'unrun_claim', stage: 12, expected: 'deny', observed: 'not_run', result: 'blocked' },
      { attackId: 'unavailable_claim', stage: 12, expected: 'deny', observed: 'network_error', result: 'breached' },
    ] };
  const fakeProcess = { env: {}, stdout: { write() {} }, stderr: { write(value) { errors.push(value); } } };
  const executable = source.replace(/^import .*;\r?\n/gmu, '').replaceAll('import.meta.dirname', 'scriptDirectory').replaceAll('await import(', 'await importer(');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('execFileSync', 'mkdirSync', 'readFileSync', 'writeFileSync', 'join', 'resolve', 'pathToFileURL',
    'scriptDirectory', 'importer', 'process', 'normalizeCheckResults', executable)(execFileSync, () => {}, readFileSync,
    (_path, value) => writes.push(JSON.parse(value)), join, resolve, pathToFileURL, resolve('scripts'), importer, fakeProcess, normalizeCheckResults);
  assert.deepEqual(errors, []); assert.equal(fakeProcess.exitCode, undefined); assert.equal(writes.length, 1);
  assert.equal(writes[0].attackAttempts.length, 3);
  assert.equal(writes[0].attackAttempts.filter(row => row.result === 'blocked').length, 1);
  assert.ok(writes[0].attackAttempts.slice(1).every(row => row.result === 'not_run' && row.observed === 'not_run'));
  assert.deepEqual(Object.keys(writes[0]).sort(), ['schema','step','commit','repoUrl','checkedAt','changedFiles','policyRules','attackAttempts','explanation','blockedAt','identityProvider','allowedRoutes','originalApiUrl','restoreRoute'].sort());
  assert.equal(calls.filter(args => args[0] === 'show').length, 1);
});

test('fixed-case API computes only four fictional conditions and never accepts a caller identity or input', async () => {
  const response = () => ({ code: null, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  for (const caseId of ['local_unregistered_device', 'local_compound_risk', 'local_unknown_route', 'local_detection_121']) {
    const res = response();
    await checkSummaryHandler({ method: 'GET', query: { case: caseId, subjectId: 'caller_claim', deviceRegistered: true } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.ready, true); assert.equal(res.body.fixtureType, 'fixed_fixture');
    assert.equal(res.body.caseId, caseId); assert.equal(res.body.engine, 'ALEPH SDP 엔진');
    assert.equal(res.body.engineEnforced, 'not_run');
    assert.equal(res.body.source, caseId === 'local_detection_121' ? '학생 탐지 규칙(src/detect.mjs)' : '학생 판정기(src/decider.mjs)');
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
  assert.equal(summary.attempts.filter(row => row.result === 'blocked' && !row.attackId.startsWith('local_')).length, 6);
  assert.equal(summary.attempts.filter(row => row.result === 'blocked' && row.attackId.startsWith('local_')).length, 2);
  assert.equal(summary.failed, 1); assert.equal(summary.notRun, 3); assert.ok(!('official' in summary));
});

test('execution summary contains no official plan or duplicate representative attempt', async () => {
  const attempts = await runAttackChecks(bundleFixture, { fetchImpl: async url => fixtureResponse(url) });
  const replay = attempts.find(row => row.attackId === 'official_engine_replay');
  assert.equal(replay, undefined); assert.equal(attempts.length, 12);
  const summary = summarizeChecks(attempts, { plannedCases: matrix.cases });
  assert.equal(summary.notRun, 2); assert.ok(!('official' in summary) && !('attackAttempts' in summary));
  assert.equal(summary.sources.engine.name, 'ALEPH SDP 엔진'); assert.match(summary.sources.engine.role, /미실행/u);
});

test('unavailable observations override inconsistent outcome claims in every summary without changing input', () => {
  const attempts = [
    { attackId: 'actual_denial', stage: 3, expected: 'deny', observed: 'HTTP 401', result: 'blocked' },
    { attackId: 'unrun_claim', stage: 12, expected: 'deny', observed: 'not_run', result: 'blocked' },
    { attackId: 'network_error_claim', stage: 12, expected: 'deny', observed: 'network_error', result: 'breached' },
    { attackId: 'no_http_claim', stage: 12, expected: 'deny', observed: 'unavailable', result: 'blocked' },
  ];
  const original = structuredClone(attempts);
  const summary = summarizeChecks(attempts, { plannedCases: matrix.cases });
  assert.deepEqual({ total: summary.total, blocked: summary.blocked, failed: summary.failed, notRun: summary.notRun },
    { total: 4, blocked: 1, failed: 0, notRun: 3 });
  assert.deepEqual(attempts, original);
  assert.ok(summary.attempts.slice(1).every(row => row.result === 'not_run' && row.observed === 'not_run'));
  assert.equal(summary.attempts.filter(row => row.result === 'blocked').length, 1); assert.ok(!('official' in summary));
  const legacy = [{ attackId: 'legacy_read', expected: 'HTTP 401', observed: 'HTTP 401' }];
  assert.deepEqual(normalizeCheckResults(legacy, { allowLegacy: true }), legacy);
  assert.throws(() => normalizeCheckResults(legacy), /invalid_check_results/u);
});
