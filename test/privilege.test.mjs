import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../xdr/privilege/decide.mjs';
import { readAlerts } from '../xdr/privilege/read-alerts.mjs';
import { respond, connectDecider, accountRefFor } from '../xdr/privilege/respond.mjs';
import { ruleFor, withXdr } from '../xdr/ztna-overlay.mjs';
import { runXdr } from '../scripts/xdr-run.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/privilege.json', import.meta.url), 'utf8'));
const decisions = fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) }));
const result = { schema: 'aleph.xdr.result.v1', moduleKey: 'privilege', decisions };
const sample = (description, { level = 12, group, count } = {}) => ({
  id: 'synthetic-event', timestamp: '2026-10-13T03:00:00Z', rule: { level, description, mitre: [] },
  data: { srcip: '192.0.2.200', srcuser: 'user88', group, count },
});
const base = async request => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
  decision: 'allow', reasonCode: 'test_baseline', ruleIds: [] });

test('privilege executes as a standalone pure module independent of identity labels and ordering', async () => {
  const code = await readFile(new URL('../xdr/privilege/decide.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /\bimport\s|\bfetch\s*\(|\bprocess\./u);
  const isolated = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  for (const alert of [...fixture.alerts].reverse()) {
    assert.deepEqual(isolated.decide({ ...alert, id: 'new-event', timestamp: '2026-10-13T03:00:00Z',
      agent: { name: 'different-lab' }, data: { ...alert.data, srcip: '192.0.2.200', srcuser: 'user88' } }), decide(alert));
    assert.deepEqual(Object.keys(decide(alert)).sort(), ['action', 'confidence', 'reason']);
  }
});
test('privilege requires corroboration and keeps failed, cancelled, non-admin and isolated signals as alerts', () => {
  const group = 'administrators';
  assert.equal(decide(sample('원격 주소에서 관리자 그룹에 추가됐습니다.', { group })).action, 'block');
  assert.equal(decide(sample('원격 주소에서 관리자 그룹에 추가됐습니다.', { group: 'project-week3' })).action, 'alert');
  assert.equal(decide(sample('관리자 그룹에 추가됐습니다.', { group, count: '3' })).action, 'alert');
  assert.equal(decide(sample('관리자 그룹에 추가됐습니다.', { group, count: '4' })).action, 'block');
  assert.equal(decide(sample('관리자 그룹 추가가 취소됐습니다.', { group, count: '4' })).action, 'alert');
  assert.equal(decide(sample('방금 관리자가 된 계정이 관리자 명령을 실행했지만 실패했습니다.')).action, 'alert');
  assert.equal(decide(sample('업무 시간 밖 관리자 명령을 실행했습니다.')).action, 'alert');
  assert.equal(decide(sample('처음 보는 주소에서 자료실을 조회했습니다.')).action, 'alert');
  assert.equal(decide(sample('수업 시간 밖 처음 보는 주소에서 관리자 명령을 실행했습니다.')).action, 'block');
  assert.equal(decide(sample('관리자 그룹에서 빠진 계정이 1분 뒤 다시 관리자로 들어왔습니다.', { group, count: '2' })).action, 'block');
  assert.equal(decide(sample('원격 주소에서 관리자 그룹에 추가됐습니다.', { group, level: 6 })).action, 'alert');
  assert.equal(decide(sample('기존 관리 계정이 평소 주소에서 로그인했습니다.', { level: 3 })).action, 'record');
  assert.equal(decide(null).action, 'alert');
});
test('privilege patterns, thresholds, fixture counts and non-disclosing reasons match the submitted module', async () => {
  const patterns = JSON.parse(await readFile(new URL('../xdr/privilege/patterns.json', import.meta.url), 'utf8'));
  const code = await readFile(new URL('../xdr/privilege/decide.mjs', import.meta.url), 'utf8');
  const inspect = await import(`data:text/javascript;base64,${Buffer.from(`${code}\nexport { PATTERNS };`).toString('base64')}`);
  assert.deepEqual(inspect.PATTERNS, patterns.map(({ name, minLevel, confidence }) => ({ name, minLevel, confidence })));
  for (const pattern of patterns) { assert.ok(pattern.condition); assert.ok(pattern.evidence); assert.ok(pattern.sources.length); }
  const counts = { block: 0, alert: 0, record: 0 };
  for (const alert of fixture.alerts) {
    const row = decide(alert); counts[row.action]++;
    assert.equal(row.action, row.confidence >= 0.85 ? 'block' : row.confidence >= 0.5 ? 'alert' : 'record');
    assert.ok(!row.reason.includes(alert.data.srcip));
    assert.ok(!row.reason.includes(alert.data.srcuser));
  }
  assert.deepEqual(counts, { block: 9, alert: 8, record: 9 });
});
test('privilege reader projects exactly one safe five-field row per original event', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, 26);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['account', 'description', 'level', 'sourceIp', 'timestamp']);
  assert.ok(rows.some(row => row.account?.startsWith('account-')));
});
test('privilege response persists account-scoped blocks, preserves other modules and deduplicates minimal logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aleph-privilege-'));
  await mkdir(join(root, 'xdr'));
  const other = { id: 'other-module', moduleKey: 'persistence' };
  await writeFile(join(root, 'xdr', 'deny-rules.json'), JSON.stringify({ rules: [other] }));
  const rules = await respond(root, fixture, result);
  assert.equal(rules.length, 9);
  for (const rule of rules) {
    const alert = fixture.alerts.find(alert => alert.id === rule.evidenceAlertId);
    assert.equal(Date.parse(rule.expiresAt) - Date.parse(rule.issuedAt), 15 * 60000);
    assert.equal(decide(alert).action, 'block');
    assert.equal(rule.accountRef, accountRefFor(alert.data.srcuser));
    assert.ok(!JSON.stringify(rule).includes(alert.data.srcuser));
  }
  await respond(root, fixture, result);
  const stored = JSON.parse(await readFile(join(root, 'xdr', 'deny-rules.json'), 'utf8'));
  assert.deepEqual(stored.rules.find(rule => rule.id === other.id), other);
  assert.equal(stored.rules.length, 10);
  const logs = (await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length, 17);
  assert.ok(logs.every(row => row.action !== 'record' && /^pv_\w+$/u.test(row.reason)));
  assert.ok(logs.every(row => Object.keys(row).sort().join(',') === 'action,alertId,confidence,moduleKey,reason'));
  const bad = { ...result, decisions: decisions.map((row, i) => i ? row : { ...row, confidence: NaN }) };
  await assert.rejects(respond(root, fixture, bad), /판정/u);
  const absentAccounts = { ...fixture, alerts: fixture.alerts.map(alert => ({ ...alert, data: { ...alert.data, srcuser: undefined } })) };
  assert.equal((await respond(root, absentAccounts, result)).length, 0);
  assert.equal(accountRefFor('invalid account label'), null);
});
test('privilege never denies another account on the same IP or accepts client identity claims; scoped rules expire', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aleph-privilege-scope-'));
  const rules = await respond(root, fixture, result);
  const gated = connectDecider(base, rules);
  const replay = { attackDenied: 0, normalDenied: 0, ambiguousDenied: 0, otherAccountDenied: 0 };
  for (const alert of fixture.alerts) {
    const request = { requestId: alert.id, at: new Date(Date.parse(alert.timestamp) + 1000).toISOString() };
    const context = { sourceVerified: true, sourceIp: alert.data.srcip,
      accountVerified: true, accountRef: accountRefFor(alert.data.srcuser) };
    if ((await gated(request, context)).decision === 'deny') replay[decide(alert).action === 'block'
      ? 'attackDenied' : decide(alert).action === 'alert' ? 'ambiguousDenied' : 'normalDenied']++;
    const other = { ...context, accountRef: accountRefFor('user99') };
    if ((await gated(request, other)).decision === 'deny') replay.otherAccountDenied++;
    assert.deepEqual(await gated(request, { ...context, accountVerified: false }), await base(request));
    assert.deepEqual(await gated(request, { ...context, sourceVerified: false }), await base(request));
    // Client data cannot supply the separate verified relay identity context.
    const clientClaim = { ...request, accountRef: context.accountRef, accountVerified: true };
    assert.deepEqual(await gated(clientClaim, { sourceVerified: true, sourceIp: context.sourceIp }), await base(clientClaim));
    assert.deepEqual(await withXdr(base, rules)(request, { sourceVerified: true, sourceIp: context.sourceIp }), await base(request));
    const expires = Math.max(Date.parse(request.at), ...rules.filter(rule => rule.sourceIp === context.sourceIp)
      .map(rule => Date.parse(rule.expiresAt))) + 1000;
    const expired = { ...request, at: new Date(expires).toISOString() };
    assert.deepEqual(await gated(expired, context), await base(expired));
  }
  assert.deepEqual(replay, { attackDenied: 9, normalDenied: 0, ambiguousDenied: 0, otherAccountDenied: 0 });
  const alert = fixture.alerts.find(alert => decide(alert).action === 'record');
  const request = { requestId: 'normal', at: alert.timestamp };
  const reject = async request => ({ ...await base(request), decision: 'deny', reasonCode: 'existing_policy' });
  assert.deepEqual(await connectDecider(reject, rules)(request, { sourceVerified: true, sourceIp: alert.data.srcip,
    accountVerified: true, accountRef: accountRefFor(alert.data.srcuser) }), await reject(request));
  // Existing IP-only modules retain their original matching behavior.
  const original = ruleFor(fixture.alerts[0], decisions[0], 'persistence');
  const legacyRequest = { requestId: 'legacy', at: original.issuedAt };
  assert.equal((await withXdr(base, [original])(legacyRequest, { sourceVerified: true, sourceIp: original.sourceIp })).decision, 'deny');
});
test('privilege runner computes all 26 original events without reading stored answers', async () => {
  const errors = [];
  const computed = await runXdr({ root: fileURLToPath(new URL('../', import.meta.url)),
    moduleKey: 'privilege', writeError: line => errors.push(line) });
  assert.deepEqual(computed.counts, { block: 9, alert: 8, record: 9 });
  assert.deepEqual(computed.decisions, decisions);
  assert.deepEqual(errors, []);
});
