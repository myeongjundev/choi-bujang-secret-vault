// Same per-request results as the submission runner; no saved receipt or body.
import { runAttackChecks } from './attack-check.mjs';
import { normalizeCheckResults } from './check-results.mjs';
import { SOURCES, SOURCE_OF } from './sources.mjs';
import { RULE_IDS } from './decider.mjs';

export function summarizeChecks(attempts, { commit = null, checkedAt = new Date().toISOString(), target = null, rules = [] } = {}) {
  if (!Array.isArray(attempts)) throw new Error('invalid_check_results');
  attempts = normalizeCheckResults(attempts.map(row => row && typeof row === 'object' && !Array.isArray(row)
    ? { attackId: row.attackId, stage: row.stage, expected: row.expected, observed: row.observed, result: row.result } : row));
  if (attempts.some(row => typeof row.attackId !== 'string' || !row.attackId
    || !Number.isInteger(row.stage) || row.stage < 1 || row.stage > 12
    || typeof row.expected !== 'string' || !row.expected || typeof row.observed !== 'string' || !row.observed)) throw new Error('invalid_check_results');
  return { checkedAt, commit: /^[a-f\d]{40}$/u.test(commit ?? '') ? commit : null, target, rules: [...rules],
    total: attempts.length, blocked: attempts.filter(row => row.result === 'blocked').length,
    failed: attempts.filter(row => row.result === 'breached').length, notRun: attempts.filter(row => row.result === 'not_run').length,
    recordSource: SOURCE_OF.attackCheck, sources: SOURCES,
    attempts,
  };
}
export async function collectCheckSummary(config, options = {}) {
  return summarizeChecks(await runAttackChecks(config, options), { commit: options.commit, target: config.publicAppUrl, rules: RULE_IDS });
}
