import test from 'node:test';
import assert from 'node:assert/strict';
import { document, Element } from './dom.mjs';
import { createStudentView } from '../extension.mjs';

globalThis.document = document;
const view = createStudentView();
const stamp = '2026-10-19T00:10:00Z';
const check = { status: 'ok', mode: 'connected', checkedAt: stamp, data: { transportChecked: true, audienceAuthorization: 'verified', modelCount: 2 } };
// 18단계의 완성된 입력 계약으로도 17단계의 기본 요약·상태 검사를 유지한다.
const event = { id: 'fixture-event-17', evidence: [{ id: 'fixture-evidence-17', text: '합성 접속 관측' }],
  rules: [{ id: 'fixture-rule-17', text: '합성 접근 규칙' }],
  state: { access: 'unknown', session: 'unknown', device: 'unknown' }, supportedActions: [] };
const explanation = { status: 'ok', data: { summary: '<img src=x onerror=alert(1)> 합성 사건 해석',
  evidenceIds: ['fixture-evidence-17'], proposals: [], requiresHumanConfirmation: true, executed: false } };

test('목록 점검과 사건 설명을 구분하고 시험·검증 권한, 모델 수·시각을 표시한다', () => {
  const ok = view.renderAiConnection(check).textContent;
  for (const text of ['앱 권한 확인 후 점검(verified)', '모델 수: 2', stamp, '사건 설명은 아직 실행하지 않았습니다']) assert.ok(ok.includes(text));
  assert.match(view.renderAiConnection({ ...check, explanationAccepted: true }).textContent, /아직 실행하지 않았습니다/);
  const trial = view.renderAiConnection({ ...check, data: { ...check.data, audienceAuthorization: 'test' } }).textContent;
  assert.match(trial, /시험 연결 점검\(test\)/);
  assert.match(trial, /실제 앱 이용 권한/);
  assert.doesNotMatch(view.renderAiConnection({ ...check, data: { ...check.data, transportChecked: false } }).textContent, /앱 권한 확인 후 점검/);
});

test('대기·진행·취소·성공·재연결 전환에서 옛 결과와 오류를 남기지 않는다', () => {
  assert.match(view.renderAiConnection({ status: 'idle', data: check.data }).textContent, /AI 연결 점검 전/);
  assert.match(view.renderAiConnection({ status: 'loading', data: check.data }).textContent, /AI 연결 점검 중/);
  const failed = view.renderAiConnection({ ...check, status: 'error', error: { code: 'ON_AI_PROVISIONING_PENDING', message: '합성 권한 대기' } }).textContent;
  assert.match(failed, /ON_AI_PROVISIONING_PENDING/);
  assert.match(failed, /앱 연결·권한 준비 중/);
  assert.doesNotMatch(failed, /모델 수: 2/);
  const cancelled = view.renderAiConnection({ ...check, status: 'error', error: { code: 'CANCELLED', message: '합성 취소' } }).textContent;
  assert.match(cancelled, /이전 응답은 현재 결과가 아닙니다/);
  assert.doesNotMatch(view.renderAiConnection(check).textContent, /합성 취소|권한 준비 중/);
  const reset = view.renderAiConnection({ status: 'idle', data: check.data, error: { code: 'CANCELLED', message: '합성 취소' } }).textContent;
  assert.doesNotMatch(reset, /모델 수:|합성 취소|앱 권한 확인 후 점검/);
});

test('인증·접근·한도·시간·제한·시간 초과·모델 없음 안내를 코드별로 구분한다', () => {
  const cases = [
    ['WB_CLCO_AUTH_REQUIRED', /인증/], ['WB_CLCO_ACCESS_BLOCKED', /접근이 제한/],
    ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', /반 사용량/], ['WB_CLCO_LIMIT_REACHED', /이용 한도/],
    ['WB_CLCO_SESSION_CLOSED', /이용 시간/], ['WB_CLCO_RATE_LIMITED', /요청 제한/],
    ['WB_CLCO_TIMEOUT', /시간 초과/], ['ON_AI_MODEL_LIST_EMPTY', /쓸 수 있는 모델/],
    ['AI_REQUEST_UNVERIFIED', /네트워크/],
  ];
  for (const [code, hint] of cases) {
    const root = view.renderAiConnection({ status: 'error', error: { code, message: '합성 안전 오류' } });
    assert.ok(root.textContent.includes(code));
    assert.ok(root.textContent.includes('합성 안전 오류'));
    assert.match(root.textContent, hint);
    assert.match(root.textContent, /버튼을 직접/);
    assert.equal(root.all(node => Object.keys(node.listeners).length > 0).length, 0);
  }
});

test('사건 설명 성공에만 현재 사건 표식을 붙이고 텍스트를 HTML로 해석하지 않는다', () => {
  const root = view.renderExplanation({ event, explanation, checkedAt: stamp });
  assert.equal(root.getAttribute('data-student-explanation-event'), 'fixture-event-17');
  assert.ok(root.textContent.includes(explanation.data.summary));
  assert.equal(root.all(node => node.tag === 'img').length, 0);
  for (const status of ['idle', 'loading', 'error']) {
    const failed = view.renderExplanation({ event, explanation: { ...explanation, status, error: { code: 'REQUEST_TIMEOUT', message: '합성 시간 초과' } } });
    assert.equal(failed.getAttribute('data-student-explanation-event'), null);
    assert.doesNotMatch(failed.textContent, /합성 사건 해석/);
    if (status === 'error') assert.match(failed.textContent, /REQUEST_TIMEOUT[\s\S]*기존 기록은 그대로/);
  }
  assert.equal(view.renderExplanation({ explanation }).getAttribute('data-student-explanation-event'), null);
});

test('추가 필드·원문 오류·비밀 모양 입력은 화면과 사건 성공 표식에 들어가지 않는다', () => {
  const marker = 'fixture-extra-private';
  const root = view.renderAiConnection({ ...check, data: { ...check.data, extra: marker }, error: { raw: marker } });
  assert.ok(!root.textContent.includes(marker));
  const hidden = view.renderAiConnection({ status: 'error', error: { code: 'WB_CLCO_AUTH_REQUIRED', message: 'Bearer fixture-credential', raw: marker } });
  assert.doesNotMatch(hidden.textContent, /Bearer fixture-credential|fixture-extra-private/);
  const unknown = view.renderAiConnection({ status: 'error', error: { code: 'UNSAFE_UNKNOWN', message: marker } });
  assert.doesNotMatch(unknown.textContent, /UNSAFE_UNKNOWN|fixture-extra-private/);
  const rejected = view.renderExplanation({ event: { id: 'fixture-event-17' }, explanation: { status: 'ok', data: { summary: 'Bearer fixture-credential' } } });
  assert.equal(rejected.getAttribute('data-student-explanation-event'), null);
  assert.doesNotMatch(rejected.textContent, /Bearer fixture-credential/);
});
