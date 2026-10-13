const countFields = ['total', 'blocked', 'failed', 'notRun'];

// Public summary only. This reader does not query approval, notes or sessions.
export function createCheckSummaryReader({ document, fetchImpl = fetch }) {
  const cells = [...document.querySelectorAll('#ops-stats dd')];
  const meta = document.getElementById('ops-meta');
  const button = document.getElementById('ops-refresh');
  let sequence = 0;
  function clear() {
    for (const cell of cells) cell.textContent = '-';
  }
  return async function refresh() {
    const current = ++sequence;
    clear();
    meta.textContent = '서버 점검 기록을 읽습니다.';
    if (button) button.disabled = true;
    try {
      const response = await fetchImpl('/api/checks', { method: 'GET', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('checks_unavailable');
      const record = await response.json();
      if (current !== sequence) return;
      if (!record || typeof record !== 'object' || Array.isArray(record)
        || countFields.some(key => !Number.isSafeInteger(record[key]) || record[key] < 0)
        || record.total !== record.blocked + record.failed + record.notRun) throw new Error('invalid_summary');
      for (const cell of cells) {
        if (countFields.includes(cell.dataset.k)) cell.textContent = String(record[cell.dataset.k]);
      }
      const commit = typeof record.commit === 'string' && /^[a-f\d]{12,40}$/u.test(record.commit) ? record.commit : '-';
      const checkedAt = typeof record.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(record.checkedAt) ? record.checkedAt : '-';
      const engine = record.sources?.engine?.name ?? record.provenance?.engine;
      const engineName = typeof engine === 'string' && engine.length <= 80 ? engine : '미확인';
      meta.textContent = `기록 시각 ${checkedAt} · 검사한 커밋 ${commit} · 제공 엔진 ${engineName} · 운영 집행 미실행`;
    } catch {
      if (current === sequence) {
        clear();
        meta.textContent = '서버 점검 기록을 읽지 못했습니다. 수치를 표시하지 않습니다.';
      }
    } finally {
      if (current === sequence && button) button.disabled = false;
    }
  };
}

if (typeof document !== 'undefined') {
  const refresh = createCheckSummaryReader({ document });
  document.getElementById('ops-refresh')?.addEventListener('click', refresh);
  await refresh();
}
