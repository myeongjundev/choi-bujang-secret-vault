import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../xdr/persistence/decide.mjs';
import { readAlerts } from '../xdr/persistence/read-alerts.mjs';
import { respond, connectDecider } from '../xdr/persistence/respond.mjs';
import { runXdr } from '../scripts/xdr-run.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json', import.meta.url), 'utf8'));
const decisions = fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) }));
const result = { schema: 'aleph.xdr.result.v1', moduleKey: 'persistence', decisions };
const normal = fixture.alerts.find(alert => decide(alert).action === 'record');
const sample = (description, path, level = 12, count) => ({
  id: 'synthetic-event', timestamp: '2026-10-13T03:00:00Z',
  rule: { level, description, mitre: [] }, data: { srcip: '192.0.2.200', path, count },
});

test('persistence executes standalone and does not depend on IDs, accounts, IPs or ordering', async () => {
  const code = await readFile(new URL('../xdr/persistence/decide.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /\bimport\s|\bfetch\s*\(|\bprocess\./u);
  const isolated = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  for (const alert of [...fixture.alerts].reverse()) {
    assert.deepEqual(isolated.decide({ ...alert, id: 'new-event', timestamp: '2026-10-13T03:00:00Z',
      agent: { name: 'different-lab' }, data: { ...alert.data, srcip: '192.0.2.200', srcuser: 'user88' } }), decide(alert));
    assert.deepEqual(Object.keys(decide(alert)).sort(), ['action', 'confidence', 'reason']);
  }
});
test('persistence requires correlated evidence, distinguishing unknown signatures from unsigned services', () => {
  const path = 'C:\\Users\\user88\\AppData\\Local\\Temp\\example.exe';
  assert.equal(decide(sample('서명 없는 새 서비스가 임시 실행 파일을 가리킵니다.', path)).action, 'block');
  assert.equal(decide(sample('서명 미확인 새 서비스가 임시 실행 파일을 가리킵니다.', path)).action, 'alert');
  assert.equal(decide(sample('서명 없는 새 서비스가 임시 실행 파일을 가리킵니다.', path, 6)).action, 'alert');
  assert.equal(decide(sample('서명 없는 새 서비스가 등록됐습니다.', undefined)).action, 'alert');
  assert.equal(decide(sample('서명 없는 서비스 등록이 반복됐습니다.', undefined, 12, '3')).action, 'block');
  assert.equal(decide(sample('서명 없는 서비스 등록이 반복됐습니다.', undefined, 12, '2')).action, 'alert');
  assert.equal(decide(sample('임시 실행 파일이 생겼습니다. 서비스 등록은 없습니다.', path)).action, 'alert');
  assert.equal(decide(sample('기존 서명된 서비스가 같은 파일로 실행 중입니다.', path, 3)).action, 'record');
  assert.equal(decide(sample('시작 폴더의 평소 목록에 없는 프로그램이 추가됐습니다.',
    'C:/Users/user88/Start Menu/Programs/Startup/example.exe')).action, 'block');
  assert.equal(decide(sample('시작 폴더가 한 번 변경됐습니다.', undefined)).action, 'alert');
  assert.equal(decide(sample('자료실 조회입니다.', undefined, 15)).action, 'alert');
  assert.equal(decide({ ...normal, rule: { ...normal.rule, mitre: ['T1543', 'T1053'] } }).action, 'record');
  assert.equal(decide(null).action, 'alert');
});
test('persistence fixture counts, documented patterns and safe reasons are consistent', async () => {
  const patterns = JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json', import.meta.url), 'utf8'));
  const code = await readFile(new URL('../xdr/persistence/decide.mjs', import.meta.url), 'utf8');
  const inspect = await import(`data:text/javascript;base64,${Buffer.from(`${code}\nexport { PATTERNS };`).toString('base64')}`);
  assert.deepEqual(inspect.PATTERNS, patterns.map(({ name, minLevel, confidence }) => ({ name, minLevel, confidence })));
  for (const pattern of patterns) { assert.ok(pattern.condition); assert.ok(pattern.evidence); assert.ok(pattern.sources.length); }
  const counts = { block: 0, alert: 0, record: 0 };
  for (const alert of fixture.alerts) {
    const row = decide(alert); counts[row.action]++;
    assert.equal(row.action, row.confidence >= 0.85 ? 'block' : row.confidence >= 0.5 ? 'alert' : 'record');
    assert.ok(!row.reason.includes(alert.data.srcip));
    if (alert.data.path) assert.ok(!row.reason.includes(alert.data.path));
    assert.ok(!row.reason.includes(alert.data.srcuser));
  }
  assert.deepEqual(counts, { block: 8, alert: 8, record: 8 });
});
test('persistence reader preserves all events and projects only five safe fields', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, fixture.alerts.length);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['account', 'description', 'level', 'sourceIp', 'timestamp']);
  assert.ok(rows.some(row => row.account?.startsWith('account-')));
});
test('persistence response preserves other modules, logs safely, and gates only current confirmed blocks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aleph-persistence-'));
  await mkdir(join(root, 'xdr'));
  const other = { id: 'other-module', moduleKey: 'known-cve' };
  await writeFile(join(root, 'xdr', 'deny-rules.json'), JSON.stringify({ rules: [other] }));
  const rules = await respond(root, fixture, result);
  assert.equal(rules.length, 8);
  for (const rule of rules) {
    assert.equal(Date.parse(rule.expiresAt) - Date.parse(rule.issuedAt), 15 * 60000);
    assert.equal(decisions.find(row => row.alertId === rule.evidenceAlertId).action, 'block');
  }
  await respond(root, fixture, result);
  const stored = JSON.parse(await readFile(join(root, 'xdr', 'deny-rules.json'), 'utf8'));
  assert.deepEqual(stored.rules.find(rule => rule.id === other.id), other);
  assert.equal(stored.rules.length, 9);
  const logs = (await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length, 16);
  assert.ok(logs.every(row => row.action !== 'record' && /^ps_\w+$/u.test(row.reason)));
  assert.ok(logs.every(row => Object.keys(row).sort().join(',') === 'action,alertId,confidence,moduleKey,reason'));
  const bad = { ...result, decisions: decisions.map((row, i) => i ? row : { ...row, confidence: NaN }) };
  await assert.rejects(respond(root, fixture, bad), /판정/u);
  const base = async request => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
    decision: 'allow', reasonCode: 'test_baseline', ruleIds: [] });
  const gated = connectDecider(base, rules);
  const replay = { attackDenied: 0, normalDenied: 0, ambiguousDenied: 0 };
  for (const alert of fixture.alerts) {
    const request = { requestId: alert.id, at: new Date(Date.parse(alert.timestamp) + 1000).toISOString() };
    const context = { sourceVerified: true, sourceIp: alert.data.srcip };
    const observed = await gated(request, context);
    if (observed.decision === 'deny') replay[decide(alert).action === 'block' ? 'attackDenied'
      : decide(alert).action === 'alert' ? 'ambiguousDenied' : 'normalDenied']++;
    assert.deepEqual(await gated(request, { ...context, sourceVerified: false }), await base(request));
    const expires = Math.max(Date.parse(request.at), ...rules.filter(rule => rule.sourceIp === context.sourceIp)
      .map(rule => Date.parse(rule.expiresAt))) + 1000;
    const expired = { ...request, at: new Date(expires).toISOString() };
    assert.deepEqual(await gated(expired, context), await base(expired));
  }
  assert.deepEqual(replay, { attackDenied: 8, normalDenied: 0, ambiguousDenied: 0 });
  const reject = async request => ({ ...await base(request), decision: 'deny', reasonCode: 'existing_policy' });
  const request = { requestId: 'normal', at: normal.timestamp };
  assert.deepEqual(await connectDecider(reject, rules)(request, { sourceVerified: true, sourceIp: normal.data.srcip }), await reject(request));
});
test('persistence runner computes results from every original event, with no saved-answer dependency', async () => {
  const errors = [];
  const computed = await runXdr({ root: fileURLToPath(new URL('../', import.meta.url)),
    moduleKey: 'persistence', writeError: line => errors.push(line) });
  assert.deepEqual(computed.counts, { block: 8, alert: 8, record: 8 });
  assert.deepEqual(computed.decisions, decisions);
  assert.deepEqual(errors, []);
});
