import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../xdr/exfiltration/decide.mjs';
import { readAlerts } from '../xdr/exfiltration/read-alerts.mjs';
import { respond, connectDecider } from '../xdr/exfiltration/respond.mjs';
import { ruleFor, withXdr } from '../xdr/ztna-overlay.mjs';
import { runXdr } from '../scripts/xdr-run.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/exfiltration.json', import.meta.url), 'utf8'));
const decisions = fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) }));
const result = { schema: 'aleph.xdr.result.v1', moduleKey: 'exfiltration', decisions };
const sample = (description, { level = 12, bytes = '50000000', files = '100', count, dstip = '203.0.113.200' } = {}) => ({
  id: 'synthetic-event', timestamp: '2026-10-13T03:00:00Z', rule: { level, description, mitre: [] },
  data: { srcip: '192.0.2.200', srcuser: 'user88', dstip, bytes, files, count },
});
const base = async request => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
  decision: 'allow', reasonCode: 'test_baseline', ruleIds: [] });

test('exfiltration executes standalone without depending on event identity, address lists or ordering', async () => {
  const code = await readFile(new URL('../xdr/exfiltration/decide.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /\bimport\s|\bfetch\s*\(|\bprocess\./u);
  const isolated = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  for (const alert of [...fixture.alerts].reverse()) {
    const renamed = { ...alert, id: 'new-event', timestamp: '2026-10-13T03:00:00Z',
      agent: { name: 'different-lab' }, data: { ...alert.data, srcip: '192.0.2.200', srcuser: 'user88',
        ...(alert.data.dstip ? { dstip: '203.0.113.200' } : {}) } };
    assert.deepEqual(isolated.decide(renamed), decide(alert));
    assert.deepEqual(Object.keys(decide(alert)).sort(), ['action', 'confidence', 'reason']);
  }
});
test('exfiltration requires actual transfer corroboration and enforces numeric and threshold boundaries', () => {
  const description = '처음 보는 목적지로 자료가 나갔습니다.';
  assert.equal(decide(sample(description)).action, 'block');
  assert.equal(decide(sample(description, { bytes: '49999999' })).action, 'alert');
  assert.equal(decide(sample(description, { files: '99' })).action, 'alert');
  assert.equal(decide(sample(description, { level: 6 })).action, 'alert');
  const missingDestination = sample(description); delete missingDestination.data.dstip;
  assert.equal(decide(missingDestination).action, 'alert');
  assert.equal(decide(sample(description, { dstip: '' })).action, 'alert');
  assert.equal(decide(sample(description, { dstip: '203.0.113.999' })).action, 'alert');
  assert.equal(decide(sample(description, { dstip: '2001:db8::200' })).action, 'block');
  for (const bytes of [undefined, NaN, -1, '5e8', '50000000oops', true]) {
    const alert = sample(description); alert.data.bytes = bytes;
    assert.equal(decide(alert).action, 'alert');
  }
  assert.equal(decide(sample('압축 파일을 만들었습니다. 외부 전송은 아직 없습니다.')).action, 'alert');
  assert.equal(decide(sample('처음 보는 목적지로 전송이 실패했습니다.', { bytes: '0' })).action, 'alert');
  assert.equal(decide(sample('처음 보는 주소로 작은 파일이 나갔습니다.', { bytes: '400000', files: '2' })).action, 'alert');
  assert.equal(decide(sample('평소 수업 자료 주소로 정기 백업 전송이 끝났습니다.',
    { level: 3, bytes: '320000000', files: '400', count: '8' })).action, 'record');
  assert.equal(decide(sample('자료실 조회입니다.', { level: 15 })).action, 'alert');
  assert.equal(decide(null).action, 'alert');
});
test('exfiltration pattern constants, confidence thresholds, safe reasons and fixture counts agree', async () => {
  const patterns = JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json', import.meta.url), 'utf8'));
  const code = await readFile(new URL('../xdr/exfiltration/decide.mjs', import.meta.url), 'utf8');
  const inspect = await import(`data:text/javascript;base64,${Buffer.from(`${code}\nexport { PATTERNS };`).toString('base64')}`);
  assert.deepEqual(inspect.PATTERNS, patterns.map(({ name, minLevel, minBytes, minFiles, minCount, confidence }) => ({
    name, minLevel, minBytes, ...(minFiles === undefined ? {} : { minFiles }),
    ...(minCount === undefined ? {} : { minCount }), confidence })));
  for (const pattern of patterns) { assert.ok(pattern.condition); assert.ok(pattern.evidence); assert.ok(pattern.sources.length); }
  const counts = { block: 0, alert: 0, record: 0 };
  for (const alert of fixture.alerts) {
    const row = decide(alert); counts[row.action]++;
    assert.equal(row.action, row.confidence >= 0.85 ? 'block' : row.confidence >= 0.5 ? 'alert' : 'record');
    assert.ok(!row.reason.includes(alert.data.srcip));
    assert.ok(!row.reason.includes(alert.data.srcuser));
    if (alert.data.dstip) assert.ok(!row.reason.includes(alert.data.dstip));
  }
  assert.deepEqual(counts, { block: 10, alert: 10, record: 10 });
});
test('exfiltration reader projects 30 safe five-field rows from the original fixture', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, 30);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['account', 'description', 'level', 'sourceIp', 'timestamp']);
  assert.ok(rows.some(row => row.account?.startsWith('account-')));
});
test('exfiltration response persists only destination-scoped blocks and preserves minimal logs and other modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aleph-exfiltration-'));
  await mkdir(join(root, 'xdr'));
  const other = { id: 'other-module', moduleKey: 'privilege' };
  await writeFile(join(root, 'xdr', 'deny-rules.json'), JSON.stringify({ rules: [other] }));
  const rules = await respond(root, fixture, result);
  assert.equal(rules.length, 10);
  for (const rule of rules) {
    const alert = fixture.alerts.find(alert => alert.id === rule.evidenceAlertId);
    assert.equal(Date.parse(rule.expiresAt) - Date.parse(rule.issuedAt), 15 * 60000);
    assert.equal(decide(alert).action, 'block');
    assert.equal(rule.destinationIp, alert.data.dstip);
    assert.ok(!JSON.stringify(rule).includes(alert.data.srcuser));
  }
  await respond(root, fixture, result);
  const stored = JSON.parse(await readFile(join(root, 'xdr', 'deny-rules.json'), 'utf8'));
  assert.deepEqual(stored.rules.find(rule => rule.id === other.id), other);
  assert.equal(stored.rules.length, 11);
  const logs = (await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length, 20);
  assert.ok(logs.every(row => row.action !== 'record' && /^ex_\w+$/u.test(row.reason)));
  assert.ok(logs.every(row => Object.keys(row).sort().join(',') === 'action,alertId,confidence,moduleKey,reason'));
  const bad = { ...result, decisions: decisions.map((row, i) => i ? row : { ...row, confidence: NaN }) };
  await assert.rejects(respond(root, fixture, bad), /판정/u);
  const missingDestinations = { ...fixture, alerts: fixture.alerts.map(alert => ({ ...alert, data: { ...alert.data, dstip: undefined } })) };
  assert.equal((await respond(root, missingDestinations, result)).length, 0);
});
test('exfiltration gates only the confirmed source/destination pair and expires without widening existing policies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aleph-exfiltration-scope-'));
  const rules = await respond(root, fixture, result);
  const gated = connectDecider(base, rules);
  const replay = { attackDenied: 0, normalDenied: 0, ambiguousDenied: 0, otherDestinationDenied: 0 };
  for (const alert of fixture.alerts) {
    const request = { requestId: alert.id, at: new Date(Date.parse(alert.timestamp) + 1000).toISOString() };
    const context = { sourceVerified: true, sourceIp: alert.data.srcip,
      destinationVerified: true, destinationIp: alert.data.dstip };
    if ((await gated(request, context)).decision === 'deny') replay[decide(alert).action === 'block'
      ? 'attackDenied' : decide(alert).action === 'alert' ? 'ambiguousDenied' : 'normalDenied']++;
    if ((await gated(request, { ...context, destinationIp: '192.0.2.199' })).decision === 'deny') replay.otherDestinationDenied++;
    assert.deepEqual(await gated(request, { ...context, destinationVerified: false }), await base(request));
    assert.deepEqual(await gated(request, { ...context, sourceVerified: false }), await base(request));
    assert.deepEqual(await gated(request, { ...context, sourceIp: '192.0.2.201' }), await base(request));
    const clientClaim = { ...request, destinationIp: context.destinationIp, destinationVerified: true };
    assert.deepEqual(await gated(clientClaim, { sourceVerified: true, sourceIp: context.sourceIp }), await base(clientClaim));
    assert.deepEqual(await withXdr(base, rules)(request, { sourceVerified: true, sourceIp: context.sourceIp }), await base(request));
    const expires = Math.max(Date.parse(request.at), ...rules.filter(rule => rule.sourceIp === context.sourceIp)
      .map(rule => Date.parse(rule.expiresAt))) + 1000;
    const expired = { ...request, at: new Date(expires).toISOString() };
    assert.deepEqual(await gated(expired, context), await base(expired));
  }
  assert.deepEqual(replay, { attackDenied: 10, normalDenied: 0, ambiguousDenied: 0, otherDestinationDenied: 0 });
  const alert = fixture.alerts.find(alert => decide(alert).action === 'record');
  const request = { requestId: 'normal', at: alert.timestamp };
  const reject = async request => ({ ...await base(request), decision: 'deny', reasonCode: 'existing_policy' });
  assert.deepEqual(await connectDecider(reject, rules)(request, { sourceVerified: true, sourceIp: alert.data.srcip,
    destinationVerified: true, destinationIp: alert.data.dstip }), await reject(request));
  const original = ruleFor(fixture.alerts[0], decisions[0], 'persistence');
  assert.equal((await withXdr(base, [original])({ requestId: 'legacy', at: original.issuedAt },
    { sourceVerified: true, sourceIp: original.sourceIp })).decision, 'deny');
});
test('exfiltration runner computes every original event without consulting saved decisions', async () => {
  const errors = [];
  const computed = await runXdr({ root: fileURLToPath(new URL('../', import.meta.url)),
    moduleKey: 'exfiltration', writeError: line => errors.push(line) });
  assert.deepEqual(computed.counts, { block: 10, alert: 10, record: 10 });
  assert.deepEqual(computed.decisions, decisions);
  assert.deepEqual(errors, []);
});
