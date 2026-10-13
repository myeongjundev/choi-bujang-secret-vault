// An outcome label cannot turn an unavailable observation into execution.
export function normalizeCheckResults(attempts, { allowLegacy = false } = {}) {
  if (!Array.isArray(attempts) || attempts.some(row => !['blocked', 'breached', 'not_run'].includes(row?.result)
    && !(allowLegacy && row && typeof row === 'object' && !('result' in row)))) {
    throw new Error('invalid_check_results');
  }
  return attempts.map(row => {
    if (!('result' in row)) return { ...row };
    const notRun = row.result === 'not_run' || typeof row.observed !== 'string'
      || !/^HTTP [1-5]\d{2}(?:;|$)/u.test(row.observed);
    return { ...row, observed: notRun ? 'not_run' : row.observed, result: notRun ? 'not_run' : row.result };
  });
}
