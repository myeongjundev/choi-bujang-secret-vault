const $ = id => document.getElementById(id);
const text = value => value === null || value === undefined ? '—' : String(value);
function cellText(row, field) {
  if (field === 'status') return ({ passed: '기대 결과 일치', failed: '불일치', not_run: '미실행' })[row.status] ?? '미확인';
  if (field === 'result') return ({ blocked: '기대 조건 일치', breached: '불일치', not_run: '미실행' })[row.result] ?? '미확인';
  if (field === 'localMatchesExpected') return row.localMatchesExpected === true ? '기대 조건 일치' : row.localMatchesExpected === false ? '불일치' : '—';
  if (field === 'localOutcome' && row.source !== 'local_fixture') return '해당 없음';
  return text(row[field]);
}
function table(id, rows, fields) {
  $(id).replaceChildren(...rows.map(row => {
    const tr = document.createElement('tr');
    for (const field of fields) { const td = document.createElement('td'); td.textContent = cellText(row, field); tr.append(td); }
    return tr;
  }));
}
async function refresh() {
  function clear() {
    for (const id of ['rules', 'detection', 'revocation', 'recovery', 'counts', 'local-counts', 'engine-counts', 'submission-counts']) $(id).textContent = '미확인';
    for (const id of ['submission-checks', 'checks', 'local-checks', 'engine-checks']) $(id).replaceChildren();
  }
  clear();
  $('refresh').disabled = true; $('status').textContent = '서버에서 새 요청 결과를 관측합니다.';
  try {
    const response = await fetch('/api/operations-status', { cache: 'no-store' });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (data.schema !== 'vault.operations.v1' || !Array.isArray(data.checks)) throw new Error('invalid');
    const summaryResponse = await fetch('/api/checks', { cache: 'no-store' });
    if (!summaryResponse.ok) throw new Error('checks_unavailable');
    const summary = await summaryResponse.json();
    if (['total', 'blocked', 'failed', 'notRun'].some(key => !Number.isInteger(summary[key]) || summary[key] < 0)
      || summary.total !== summary.blocked + summary.failed + summary.notRun
      || !Array.isArray(summary.attempts) || summary.attempts.length !== summary.total) throw new Error('invalid_summary');
    const submissionChecks = summary.attempts.map(({ attackId, stage, expected, observed, result }) => ({ attackId, stage, expected, observed, result,
      source: result === 'not_run' ? 'not_run' : attackId.startsWith('local_') ? 'fixed_fixture_http' : 'live_http' }));
    const httpChecks = data.checks.filter(row => row.source === 'live_http');
    const localChecks = data.checks.filter(row => row.source === 'local_fixture');
    const engineChecks = data.checks.filter(row => row.source === 'official_engine_unconnected');
    $('submission-counts').textContent = `제출 점검 ${summary.total}항목 · 기대 조건 일치 ${summary.blocked}건 · 불일치 ${summary.failed}건 · 미실행 ${summary.notRun}건. 확인 ${summary.checkedAt} · 커밋 ${summary.commit?.slice(0, 12) ?? '미확인'}`;
    $('rules').textContent = data.policyRules.join(', ');
    $('detection').textContent = `${data.detection.action} · 로컬 가상 사건`;
    $('revocation').textContent = '실제 회수 집행 미연결';
    $('recovery').textContent = data.recovery.verified ? `사본 검증됨 · 버전 ${data.recovery.revision}` : '사본 검증 미확인';
    $('counts').textContent = `보조 HTTP 관측 ${httpChecks.length}항목 · 기대 조건 일치 ${httpChecks.filter(row => row.status === 'passed').length}건 · 불일치 ${httpChecks.filter(row => row.status === 'failed').length}건 · 미실행 ${httpChecks.filter(row => row.status === 'not_run').length}건`;
    $('local-counts').textContent = `로컬 가상 계산 ${localChecks.length}항목 · 기대 조건 일치 ${localChecks.filter(row => row.localMatchesExpected === true).length}건 · 불일치 ${localChecks.filter(row => row.localMatchesExpected === false).length}건`;
    $('engine-counts').textContent = `운영 미연결 ${engineChecks.length}항목 · 미실행 ${engineChecks.filter(row => row.status === 'not_run').length}건`;
    table('submission-checks', submissionChecks, ['stage', 'attackId', 'source', 'expected', 'observed', 'result']);
    table('checks', httpChecks, ['id', 'request', 'source', 'expected', 'observed', 'status', 'requestId', 'checkedAt']);
    table('local-checks', localChecks, ['id', 'expected', 'localOutcome', 'localMatchesExpected', 'localCheckedAt']);
    table('engine-checks', engineChecks, ['id', 'request', 'expected', 'observed', 'status', 'requestId', 'checkedAt']);
    $('status').textContent = `실제 HTTP 응답 확인: ${data.checkedAt} · 배포 커밋 ${data.commit?.slice(0,12) ?? '미확인'} · 보조 관측 ID ${data.requestId}`;
  } catch { clear(); $('status').textContent = '서버 결과를 읽지 못했습니다. 시험을 통과로 표시하지 않습니다.'; }
  finally { $('refresh').disabled = false; }
}
$('refresh').onclick = refresh;
await refresh();
