// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if ([3, 4].includes(config.step)) {
    const request = (path, method = 'GET', authorization) => fetch(new URL(path, config.publicAppUrl), {
      method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: authorization ? { Authorization: authorization } : {},
    });
    const results = [];
    for (const [id, path, method, authorization] of [
      ['anonymous_read', '/api/notes', 'GET', undefined],
      ['anonymous_create', '/api/notes', 'POST', undefined],
      ['malformed_token', '/api/notes', 'GET', 'Bearer invalid'],
      ['static_seed', '/data.json', 'GET', undefined],
    ]) {
      const response = await request(path, method, authorization);
      results.push({ attackId: id, expected: id === 'static_seed' ? '404' : '401; 자료 없음', observed: `HTTP ${response.status}` });
      await response.text();
    }
    return results;
  }
  if (config.step === 2) {
    const app = new URL(config.publicAppUrl);
    if (app.protocol !== 'https:' || app.username || app.password || app.pathname !== '/' || app.search || app.hash) {
      throw new Error('실제 HTTPS 배포 주소를 확인하세요.');
    }
    const request = (path) => fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const staticResponse = await request('/data.json');
    const staticBody = await staticResponse.text();
    let staticNotes = false;
    try { staticNotes = Array.isArray(JSON.parse(staticBody).notes) && JSON.parse(staticBody).notes.length > 0; } catch {}
    const apiResponse = await request('/api/notes');
    let count = 0;
    try { const body = await apiResponse.json(); count = Array.isArray(body.notes) ? body.notes.length : 0; } catch {}
    return [
      { attackId: 'static_note_seed', expected: '공개 정적 자료 경로는 404이며 메모 없음',
        observed: `HTTP ${staticResponse.status}; notes present: ${staticNotes}` },
      { attackId: 'anonymous_api_read', expected: '2단계의 공개 API에서 가상 카드 네 건 반환; 인증은 후속 단계',
        observed: `HTTP ${apiResponse.status}; note count: ${count}` },
    ];
  }
  if (config.step !== 1) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
