import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../extension.mjs';

// 합성 DOM: 외부 문자열이 HTML sink로 전달되면 즉시 실패한다. 운영 신원은 사용하지 않는다.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.text = ''; }
  setAttribute() {}
  appendChild(child) { this.children.push(child); return child; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  set innerHTML(_) { throw Error('HTML sink forbidden'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
const view = createStudentView();
const ok = data => ({ status: 'ok', mode: 'demo', data });
const identity = (name, deviceStatus = 'compliant', sessionStatus = 'active') => ok({
  user: { id: `user-${name}`, label: name },
  device: { id: 'device-a', label: '연습 PC', status: deviceStatus },
  session: { id: 'session-a', status: sessionStatus },
});
const render = me => view.renderIdentity({ me, devices: ok([]), sessions: ok([]) });

test('새 사용자 재조회와 실패 시 이전 신원이 남지 않는다', () => {
  const before = render(identity('합성사용자A'));
  const after = render(identity('합성사용자B'));
  assert.match(before.textContent, /합성사용자A/);
  assert.match(after.textContent, /합성사용자B/);
  assert.doesNotMatch(after.textContent, /합성사용자A/);
  const failed = render({ status: 'error', mode: 'disconnected', data: identity('합성사용자A').data, error: { message: '연습 연결 중단' } });
  assert.match(failed.textContent, /연결 실패: 연습 연결 중단/);
  assert.match(failed.textContent, /연결 없음/);
  assert.doesNotMatch(failed.textContent, /합성사용자[AB]|연습 PC|활성/);
});

test('기기와 세션의 모든 비정상 상태를 정상과 구분한다', () => {
  for (const [raw, expected] of [['compliant','보안 기준 충족'],['noncompliant','보안 기준 미충족'],['unknown','확인 불가']]) {
    const result = render(identity('상태연습', raw));
    assert.ok(result.textContent.includes(`${expected}(${raw})`));
  }
  for (const [raw, expected] of [['active','활성'],['expired','만료'],['revoked','철회됨'],['unknown','확인 불가']]) {
    const result = render(identity('상태연습', 'unknown', raw));
    assert.ok(result.textContent.includes(`${expected}(${raw})`));
    if (raw !== 'active') assert.doesNotMatch(result.textContent, /활성/);
  }
});

test('세 자원의 loading/error에서도 모드와 독립적인 오류를 보존한다', () => {
  for (const status of ['loading','error']) for (const [mode, expected] of [['demo','예제 자료'],['disconnected','연결 없음'],['unknown','확인 불가']]) {
    const input = { status, mode, error: { message: '합성 장애' } };
    const root = view.renderIdentity({ me: input, devices: input, sessions: input });
    assert.equal(root.children.length, 3);
    for (const section of root.children) {
      assert.match(section.textContent, new RegExp(expected));
      assert.match(section.textContent, status === 'loading' ? /불러오는 중/ : /연결 실패: 합성 장애/);
    }
  }
  const mixed = view.renderIdentity({ me: identity('현재사용자'), devices: { status:'error', mode:'unknown', error:{ message:'기기 조회 실패' } }, sessions: ok([{id:'expired-id',status:'expired'}]) });
  assert.match(mixed.textContent, /현재사용자/);
  assert.match(mixed.textContent, /기기 조회 실패/);
  assert.match(mixed.textContent, /expired-id\n세션 상태\n만료/);
});

test('HTML 형태의 label과 서버 오류는 실행 없이 문자로 표시한다', () => {
  const payload = '<img src=x onerror="throw 1">';
  assert.ok(render(identity(payload)).textContent.includes(payload));
  const result = render({status:'error',mode:'unknown',error:{message:payload}});
  assert.ok(result.textContent.includes(`연결 실패: ${payload}`));
  assert.equal(result.children.flatMap(section => section.children).some(child => child.tag === 'img'), false);
});
