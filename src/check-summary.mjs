// Same per-request results as the submission runner; no saved receipt or body.
import { runBundleChecks } from './bundle-checks.mjs';

export function summarizeChecks(attempts, { commit = null, checkedAt = new Date().toISOString(), plannedCases = [] } = {}) {
  if (!Array.isArray(attempts) || attempts.some(row => !['blocked', 'breached', 'not_run'].includes(row?.result))) {
    throw new Error('invalid_check_results');
  }
  const officialCases = plannedCases.map(({ id, stage, name, expected }) => ({ id, stage, name, expected,
    status: 'not_run', result: 'not_run', source: 'official_engine_unconnected', requestId: null, checkedAt: null }));
  return { schema: 'vault.checks.v1', source: 'fresh_submission_checks', commit: /^[a-f\d]{40}$/u.test(commit ?? '') ? commit : null,
    checkedAt, total: attempts.length, blocked: attempts.filter(row => row.result === 'blocked').length,
    failed: attempts.filter(row => row.result === 'breached').length, notRun: attempts.filter(row => row.result === 'not_run').length,
    attackAttempts: attempts.map(({ attackId, stage, expected, observed, result }) => ({ attackId, stage, expected, observed, result })),
    official: { total: officialCases.length, blocked: 0, failed: 0, notRun: officialCases.length, cases: officialCases } };
}
export async function collectCheckSummary(config, options = {}) {
  return summarizeChecks(await runBundleChecks(config, options), { commit: options.commit, plannedCases: options.plannedCases });
}
