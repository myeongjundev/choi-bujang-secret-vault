import test from 'node:test';
import assert from 'node:assert/strict';
import { document, Element } from './dom.mjs';
import { createStudentView } from '../extension.mjs';

globalThis.document = document;
const view = createStudentView();
const stamp = '2026-10-24T07:00:00Z';
const eventFor = (suffix = 'A') => ({
  id: `fixture-event-${suffix}`, kind: 'xdr', summary: `합성 사건 ${suffix}`,
  evidence: [{ id: `ev-${suffix}-1`, text: `합성 접속 관측 ${suffix}` }, { id: `ev-${suffix}-2`, text: `합성 기기 관측 ${suffix}` }],
  rules: [{ id: `rule-${suffix}`, text: `합성 세션 확인 규칙 ${suffix}` }],
  state: { access: 'unknown', session: 'expired', device: 'unknown' }, supportedActions: [],
});
const inputFor = (event = eventFor()) => ({ event, checkedAt: stamp, explanation: { status: 'ok', mode: 'demo', data: {
  summary: `참고용 합성 설명 ${event.id}`, evidenceIds: event.evidence.map(row => row.id),
  proposals: [], requiresHumanConfirmation: true, executed: false,
} } });
const render = input => view.renderExplanation(input);
const noMarker = root => assert.equal(root.getAttribute('data-student-explanation-event'), null);

test('정상 설명은 현재 사건의 모든 근거·규칙·unknown을 표시하고 원본을 바꾸지 않는다', () => {
  const input = inputFor();
  const before = structuredClone(input);
  const root = render(input);
  assert.equal(root.getAttribute('data-student-explanation-event'), input.event.id);
  for (const text of [input.event.id, input.explanation.data.summary, stamp, '참고용', '접속: 확인 불가(unknown)', '기기: 확인 불가(unknown)']) assert.ok(root.textContent.includes(text), text);
  for (const row of [...input.event.evidence, ...input.event.rules]) assert.ok(root.textContent.includes(`${row.id} — ${row.text}`));
  assert.doesNotMatch(root.textContent, /세션: 확인 불가/);
  assert.match(root.textContent, /원천이 지원하는 조치가 없어/);
  assert.equal(root.all(node => node.tag === 'button' || Object.keys(node.listeners).length).length, 0);
  assert.deepEqual(input, before);
});

test('다른 사건의 근거·부분 인용·중복·누락·빈 근거나 규칙에는 성공 표식을 붙이지 않는다', () => {
  const a = inputFor(), b = inputFor(eventFor('B'));
  const cases = [
    { ...a, event: b.event },
    ...[['not-this-event'], ['ev-A-1'], ['ev-A-1', 'ev-A-1'], [], null].map(evidenceIds => ({ ...a, explanation: { ...a.explanation, data: { ...a.explanation.data, evidenceIds } } })),
    ...[{ evidence: [] }, { rules: [] }, { evidence: [{ id: 'ev-A-1', text: '' }] }, { evidence: [a.event.evidence[0], a.event.evidence[0]] }].map(fields => ({ ...a, event: { ...a.event, ...fields } })),
  ];
  for (const input of cases) {
    const root = render(input);
    noMarker(root);
    assert.match(root.textContent, /근거|규칙/);
    assert.doesNotMatch(root.textContent, /참고용 합성 설명/);
  }
});

test('제안은 지원 조치·인용 근거·이유·사람 확인·미실행 상태를 보여 주며 실행 UI는 없다', () => {
  const input = inputFor(); input.event.supportedActions = ['request_reauthentication'];
  input.explanation.data.proposals = [{ action: 'request_reauthentication', evidenceIds: ['ev-A-1'], reason: '합성 세션 재확인 필요' }];
  const root = render(input);
  for (const text of ['request_reauthentication', 'ev-A-1', '합성 세션 재확인 필요', '사람 확인', '실행되지 않았습니다']) assert.ok(root.textContent.includes(text));
  assert.equal(root.all(node => node.tag === 'button' || Object.keys(node.listeners).length).length, 0);
  for (const fields of [{ executed: true }, { requiresHumanConfirmation: false }, { proposals: [{ ...input.explanation.data.proposals[0], action: 'unsupported-action' }] }, { proposals: [{ ...input.explanation.data.proposals[0], evidenceIds: ['other-evidence'] }] }]) {
    const invalid = render({ ...input, explanation: { ...input.explanation, data: { ...input.explanation.data, ...fields } } });
    noMarker(invalid); assert.doesNotMatch(invalid.textContent, /참고용 합성 설명/);
  }
});

test('제안 없음의 두 원인과 unknown 없음, 각 unknown 상태를 나누어 표시한다', () => {
  const input = inputFor();
  assert.match(render(input).textContent, /원천이 지원하는 조치가 없어[\s\S]*정상/);
  input.event.supportedActions = ['request_reauthentication'];
  assert.match(render(input).textContent, /AI가 제안한 조치가 없/);
  input.event.state = { access: 'allowed', session: 'active', device: 'compliant' };
  assert.match(render(input).textContent, /확인되지 않은 현재 상태[\s\S]*없음/);
  input.event.state = { access: 'unknown', session: 'unknown', device: 'unknown' };
  for (const label of ['접속', '세션', '기기']) assert.ok(render(input).textContent.includes(`${label}: 확인 불가(unknown)`));
});

test('사건 전환·재조회·실패·진행·취소·자료 없음은 과거 설명과 성공 표식을 제거한다', () => {
  const host = new Element('div');
  const a = inputFor(), b = inputFor(eventFor('B'));
  host.replaceChildren(render(a));
  host.replaceChildren(render(b));
  assert.ok(host.textContent.includes(b.event.evidence[0].text));
  assert.doesNotMatch(host.textContent, /fixture-event-A|ev-A-|rule-A/);
  for (const status of ['idle', 'loading', 'error']) {
    const current = render({ ...a, explanation: { ...a.explanation, status, error: { code: 'CANCELLED', message: '합성 요청 취소' } } });
    host.replaceChildren(current); noMarker(current);
    assert.doesNotMatch(host.textContent, /참고용 합성 설명|ev-A-|rule-A/);
    if (status === 'error') assert.match(host.textContent, /CANCELLED[\s\S]*기록은 그대로/);
  }
  for (const input of [{}, { event: null, explanation: a.explanation }, { event: a.event, explanation: { status: 'ok' } }]) {
    const root = render(input); noMarker(root); assert.doesNotMatch(root.textContent, /참고용 합성 설명/);
  }
  assert.match(render({ event: null }).textContent, /기록을 먼저 고르/);
});

test('HTML 모양 텍스트는 문자로만 표시하며 추가 필드와 비밀 모양 입력은 제외한다', () => {
  const input = inputFor();
  const html = '<img src=x onerror=alert(1)>';
  input.explanation.data.summary = html; input.event.evidence[0].text = html;
  input.event.rules[0].text = html; input.explanation.data.extra = 'fixture-unrelated-private';
  const root = render(input);
  assert.ok(root.textContent.includes(html));
  assert.equal(root.all(node => node.tag === 'img').length, 0);
  assert.doesNotMatch(root.textContent, /fixture-unrelated-private/);
  for (const where of ['summary', 'evidence', 'rules', 'reason']) {
    const bad = inputFor(); bad.event.supportedActions = ['request_reauthentication'];
    const secretLike = 'Bearer fixture-not-a-real-credential';
    if (where === 'summary') bad.explanation.data.summary = secretLike;
    if (where === 'evidence') bad.event.evidence[0].text = secretLike;
    if (where === 'rules') bad.event.rules[0].text = secretLike;
    if (where === 'reason') bad.explanation.data.proposals = [{ action: 'request_reauthentication', evidenceIds: ['ev-A-1'], reason: secretLike }];
    const hidden = render(bad); noMarker(hidden); assert.ok(!hidden.textContent.includes(secretLike));
  }
});

test('AI 실패는 안전한 오류를 표시하고 비 AI 기록·업무 앱 판정을 변경하지 않는다', () => {
  const a = inputFor();
  const decisionInput = { status: 'ok', mode: 'demo', appId: 'fixture-app', data: { appId: 'fixture-app', decision: 'allow', reason: '합성 허용 판정', checkedAt: stamp } };
  const eventInput = { status: 'ok', mode: 'demo', data: [{ ...a.event, at: stamp, appId: 'fixture-app' }] };
  const records = view.renderEvents(eventInput), decision = view.renderDecision(decisionInput);
  const before = [records.textContent, decision.textContent, structuredClone(eventInput), structuredClone(decisionInput)];
  const failed = render({ ...a, explanation: { status: 'error', error: { code: 'ON_AI_INVALID_OUTPUT', message: '합성 응답 검증 실패', raw: 'fixture-unrelated-private' } } });
  noMarker(failed);
  assert.match(failed.textContent, /AI 설명 실패/); assert.match(failed.textContent, /ON_AI_INVALID_OUTPUT/);
  assert.match(failed.textContent, /기록은 그대로/); assert.match(failed.textContent, /과제 실패/);
  assert.doesNotMatch(failed.textContent, /fixture-unrelated-private/);
  assert.deepEqual([records.textContent, decision.textContent, eventInput, decisionInput], before);
});

test('사건 자료가 null이어도 오류가 있으면 기록 선택 안내보다 실패 원인을 우선 표시한다', () => {
  for (const [code, message] of [['ON_AI_INVALID_INPUT', '합성 근거 부족'], ['ON_AI_INVALID_OUTPUT', '합성 근거 불일치']]) {
    const root = render({ event: null, explanation: { status: 'error', error: { code, message } } });
    noMarker(root);
    for (const text of ['AI 설명 실패', code, message, '기록은 그대로']) assert.ok(root.textContent.includes(text));
    assert.doesNotMatch(root.textContent, /기록을 먼저 고르/);
  }
});
