import { createHash } from 'node:crypto';
import { publishDecisions, withXdr } from '../ztna-overlay.mjs';

// This hashes a fixture account label; it is not an identity or session verifier.
export function accountRefFor(account) {
  return typeof account === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,79}$/u.test(account)
    && !/sb_secret_|Bearer|eyJ/iu.test(account)
    ? createHash('sha256').update(account).digest('hex') : null;
}
export function connectDecider(baseDecide, rules) {
  return withXdr(baseDecide, rules.filter(rule => rule.moduleKey === 'privilege' && /^[a-f\d]{64}$/u.test(rule.accountRef ?? '')));
}
export async function respond(root, fixture, result) {
  if (fixture?.moduleKey !== 'privilege' || result?.moduleKey !== 'privilege'
      || !Array.isArray(fixture.alerts) || !Array.isArray(result.decisions)
      || result.decisions.length !== fixture.alerts.length) throw new Error('privilege 응답 형식을 확인하세요.');
  const expected = new Set(fixture.alerts.map(alert => alert.id));
  if (expected.size !== fixture.alerts.length) throw new Error('중복 경보 번호를 확인하세요.');
  const decisions = result.decisions.map(row => {
    if (!expected.delete(row.alertId) || !Number.isFinite(row.confidence)
        || row.confidence < 0 || row.confidence > 1
        || row.action !== (row.confidence >= 0.85 ? 'block' : row.confidence >= 0.5 ? 'alert' : 'record')
        || typeof row.reason !== 'string'
        || !/^pv_(admin_group|recent_admin_use|unusual_admin_use|admin_reentry|unconfirmed|normal|invalid):/u.test(row.reason)) {
      throw new Error('privilege 판정 결과를 확인하세요.');
    }
    return { alertId: row.alertId, action: row.action, confidence: row.confidence,
      reason: row.reason.split(':', 1)[0] };
  });
  return publishDecisions(root, fixture, { ...result, decisions }, { scopeRule(rule, alert) {
    const accountRef = accountRefFor(alert.data?.srcuser);
    return accountRef ? { ...rule, accountRef } : null;
  } });
}
