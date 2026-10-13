// Self-contained student checks for the isolated runner.
// Only fresh read responses are evidence; no configuration files or environment.
// Never return tokens, keys, identities, private bodies or transport error text.

const READ_METHODS = new Set(['GET', 'HEAD']);
const STAGES = { anonymous_read: 3, malformed_token: 3, static_seed: 2, direct_anonymous_read: 5,
  anonymous_other_note: 4, public_asset_index: 5, public_asset_app: 5, public_asset_identity: 5, anonymous_notice_get: 8,
  backup_verification: 10, device_adapter_availability: 11, public_connection_asset: 11, operations_observation: 12,
  local_unregistered_device: 6, local_compound_risk: 7, local_unknown_route: 8, local_detection_121: 9 };

function observationOrigin(value) {
  let app;
  try { app = new URL(value); } catch { throw new Error('invalid_observation_origin'); }
  if (typeof value !== 'string' || app.protocol !== 'https:' || app.username || app.password
      || app.pathname !== '/' || app.search || app.hash) throw new Error('invalid_observation_origin');
  return app;
}

// A failed transport/body read is not evidence of a blocked attack.
// Race the entire observation: isolation shims may ignore AbortSignal.
async function observe(url, { fetchImpl, timeoutMs, method = 'GET', headers = {}, caseId, read = response => response.text() }) {
  if (!READ_METHODS.has(method)) throw new Error('invalid_observation_method');
  const controller = new AbortController();
  let timer, status = null;
  try {
    const result = await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { method, headers, redirect: 'error', signal: controller.signal,
          alephEvidence: { caseId, requestKey: globalThis.crypto.randomUUID() } });
        status = response.status;
        return { ran: true, status, value: await read(response) };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('observation_deadline')), timeoutMs); }),
    ]);
    return result;
  } catch { return { ran: false, status }; }
  finally { clearTimeout(timer); controller.abort(); }
}

// Only bounded transport facts are reported for the runner's trace comparison.
const row = (attackId, expected, result, accepts = value => value.status === Number(expected.match(/\d{3}/u)?.[0])) => ({
  attackId, stage: STAGES[attackId], expected,
  observed: result.ran ? `HTTP ${result.status}${typeof result.value?.ready === 'boolean' ? `; jsonReady=${result.value.ready}` : ''}` : 'not_run',
  result: !result.ran ? 'not_run' : accepts(result) ? 'blocked' : 'breached',
});

const hasSampleMarker = (body, config) => typeof config.sampleMarker === 'string'
  && config.sampleMarker.length > 0 && body.includes(config.sampleMarker);

function originalApi(config, authUrl) {
  let auth, original;
  try {
    auth = new URL(authUrl);
    original = config.originalApiUrl === undefined ? new URL('/rest/v1/user_notes', auth) : new URL(config.originalApiUrl);
  } catch { throw new Error('invalid_original_api_origin'); }
  if (auth.protocol !== 'https:' || auth.username || auth.password || auth.port || auth.pathname !== '/'
      || auth.search || auth.hash || !/^(?:[a-z0-9-]+\.)+supabase\.co$/u.test(auth.hostname)
      || original.protocol !== 'https:' || original.origin !== auth.origin || original.username || original.password
      || original.search || original.hash || original.pathname !== '/rest/v1/user_notes') {
    throw new Error('invalid_original_api_origin');
  }
  return original;
}

async function runReadChecks(config, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const app = observationOrigin(config.publicAppUrl);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('invalid_observation_timeout');
  const request = (path, caseId, options = {}) => observe(new URL(path, app), { fetchImpl, timeoutMs, caseId, ...options });
  const tasks = [];
  const add = (id, path, expected, options, format) => tasks.push(async () => row(id, expected, await request(path, id, options), format));
  add('anonymous_read', '/api/notes', '401; 자료 없음');
  add('malformed_token', '/api/notes', '401; 자료 없음', { headers: { Authorization: 'Bearer invalid' } });
  add('static_seed', '/data.json', '404');
  if (config.step === 12) add('anonymous_other_note', '/api/notes/00000000-0000-4000-8000-000000000004', '401; 타인 자료 없음');
  if (config.step >= 5) {
    // The public key is transient and never included in an observation.
    tasks.push(async () => {
      const auth = await request('/api/auth-config', 'public_auth_config', { read: response => response.json() });
      if (!auth.ran || auth.status !== 200 || typeof auth.value?.url !== 'string' || typeof auth.value?.publishableKey !== 'string') {
        return row('direct_anonymous_read', '원본 직접 접근 거부; 자료 없음', { ran: false });
      }
      // Validate the returned public Auth origin before forwarding its public key.
      // An explicit original address must match; URL-only callers derive this path.
      const original = originalApi(config, auth.value.url);
      const result = await observe(original, { fetchImpl, timeoutMs, caseId: 'direct_anonymous_read', headers: { apikey: auth.value.publishableKey },
        read: async response => {
          if (!response.ok) { await response.text(); return 0; }
          const data = await response.json(); return Array.isArray(data) ? data.length : -1;
        } });
      return row('direct_anonymous_read', '원본 직접 접근 거부; 자료 없음', result,
        value => [401, 403, 404].includes(value.status) && value.value === 0);
    });
    for (const [id, path] of [['public_asset_index', '/'], ['public_asset_app', '/app.js'], ['public_asset_identity', '/aleph.json']]) {
      add(id, path, '서버 키·시드 표식 없음', { read: async response => {
        const body = await response.text();
        return /sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(body) || hasSampleMarker(body, config);
      } }, value => value.status === 200 && value.value === false);
    }
  }
  // Write/restore checks remain unexecuted by the GET/HEAD-only runner.
  if (config.step >= 8) add('anonymous_notice_get',
    '/api/notices/00000000-0000-4000-8000-000000000008', '401; 공지 본문 없음');
  if (config.step >= 10) {
    add('backup_verification', '/api/recovery-plan', 'HTTP 200; backupVerified true; scope notes; 정책 쓰기 없음',
      { read: response => response.json() }, value => value.status === 200 && value.value?.backupVerified === true && value.value?.scope === 'notes');
  }
  if (config.step >= 11) {
    add('device_adapter_availability', '/api/device-status', '운영 연결 여부를 사실대로 표시; 설치 표시로 승인하지 않음',
      { read: response => response.json() }, value => value.status === 200 && typeof value.value?.connected === 'boolean' && typeof value.value?.approval === 'string');
    add('public_connection_asset', '/connect.js', '서버 키·시드 표식 없음', { read: async response => {
      const body = await response.text(); return /sb_secret_[A-Za-z0-9_-]{12,}/u.test(body) || hasSampleMarker(body, config);
    } }, value => value.status === 200 && value.value === false);
  }
  if (config.step >= 12) add('operations_observation', '/api/operations-status', '실제 관측·가상 시험·미실행 구분; 41종 미실행을 성공으로 세지 않음',
    { read: async response => {
      const value = await response.json();
      if (value.schema !== 'vault.operations.v1' || !value.counts || ['passed', 'failed', 'notRun'].some(key => !Number.isInteger(value.counts[key]) || value.counts[key] < 0)) throw new Error('invalid_observation_response');
      return value.counts;
    } }, value => value.status === 200);

  // Independent read failures do not cancel other observations. At most two
  // deadlines are sequential: public Auth metadata, then the original table.
  const results = await Promise.all(tasks.map(task => task()));
  const attackIds = new Set(['anonymous_read', 'malformed_token', 'static_seed', 'direct_anonymous_read', 'anonymous_notice_get', 'anonymous_other_note']);
  const visibleResults = results.filter(result => attackIds.has(result.attackId) || result.result !== 'blocked');
  if (config.step === 12) {
    const fixedChecks = await Promise.all([
      ['local_unregistered_device', 'fixed fixture unregistered deny'], ['local_compound_risk', 'fixed fixture compound step_up'],
      ['local_unknown_route', 'fixed fixture unknown route deny'], ['local_detection_121', 'fixed fixture revocation proposal'],
    ].map(async ([id, expected]) => {
      const result = await request(`/api/checks?case=${id}`, id, { read: async response => {
        const value = await response.json();
        const source = id === 'local_detection_121' ? '학생 탐지 규칙(src/detect.mjs)' : '학생 판정기(src/decider.mjs)';
        const fixed = value?.source === 'fixed_fixture' || (value?.fixtureType === 'fixed_fixture' && value.source === source);
        if (typeof value?.ready !== 'boolean' || !fixed || (value.caseId !== undefined && value.caseId !== id)) throw new Error('invalid_fixed_fixture_response');
        return value;
      } });
      return row(id, `${expected}; 운영 연결 증거 아님`, result, value => value.status === 200 && value.value.ready === true);
    }));
    const unexecutedWrites = [
      { attackId: 's10-restore-unauth', stage: 10, expected: 'POST /api/restore/:noteId 무인증 복원 거부; GET/HEAD 점검에서는 미실행', observed: 'not_run', result: 'not_run' },
      { attackId: 's11-unsigned-write', stage: 11, expected: 'PUT /api/notes/:id 서명·승인 없는 수정 거부; GET/HEAD 점검에서는 미실행', observed: 'not_run', result: 'not_run' },
    ];
    // Twelve default rows; even if every auxiliary read fails, at most nineteen.
    return [...visibleResults, ...fixedChecks, ...unexecutedWrites];
  }

  // Older stages retain their fictional result rows as unexecuted. Their
  // calculation was never execution evidence, so no student rule is called here.
  const local = [];
  const decisionCase = (id, expected) => local.push({ attackId: id, stage: 6,
    expected: `local fixture ${expected}; 운영 연결 증거 아님`, observed: 'not_run', result: 'not_run' });
  if (config.step >= 6) {
    decisionCase('local_unregistered_device', 'deny');
    if (config.step < 10) {
      decisionCase('local_registered_device', 'allow');
      decisionCase('local_forged_device_flag', 'deny');
      decisionCase('local_wrong_service', 'deny');
    }
  }
  if (config.step >= 7) for (const verified of [false, true]) {
    local.push({ attackId: verified ? 'local_step_up_verified' : 'local_compound_risk', stage: 7,
      expected: `local fixture ${verified ? 'allow' : 'step_up'}; 운영 재인증 증거 아님`, observed: 'not_run', result: 'not_run' });
  }
  if (config.step >= 8 && config.step < 11) {
    decisionCase('local_ambiguous_list', 'deny');
    decisionCase('local_unproven_write', 'deny');
  }
  if (config.step >= 9) for (const count of [120, 121]) {
    local.push({ attackId: `local_detection_${count}`, stage: 9,
      expected: `${count === 120 ? 'observe' : 'propose_revocation'}; 운영 회수 증거 아님`, observed: 'not_run', result: 'not_run' });
  }
  return [...visibleResults, ...local];
}

// Current runner callers can provide only the deployment URL. Configuration
// callers retain the earlier stage and optional public marker/API metadata.
export async function runAttackChecks(input, options) {
  const config = typeof input === 'string' ? { step: 12, publicAppUrl: input } : input;
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid_check_configuration');
  if (Number.isInteger(config.step) && config.step >= 3 && config.step <= 12) return runReadChecks(config, options);
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
  try { app = new URL(config.publicAppUrl); }
  catch { throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.'); }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes) && data.notes.length > 0;
    } catch { /* A non-JSON response is a failed check. */ }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
