import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../extension.mjs';
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.text = ''; }
  setAttribute() {}
  appendChild(child) { this.children.push(child); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  set innerHTML(_) { throw Error('HTML sink forbidden'); }
}
globalThis.document = {createElement: tag => new Element(tag)};
const view = createStudentView();
const result = decision => ({status:'ok',mode:'demo',data:{appId:'fixture-app',decision,reason:'合成 <b>근거</b>',checkedAt:'2026-10-19T00:00:00Z'}});
test('네 판정과 예상 밖 판정에서 원래 값·이유·시각을 구분한다', () => {
  for (const [raw,label] of [['allow','허용(allow)'],['deny','거부(deny)'],['challenge','추가 확인 필요(challenge)'],['unknown','확인 불가(unknown)'],['unexpected','확인 불가(unknown)']]) {
    const text = view.renderDecision(result(raw)).textContent;
    assert.ok(text.includes(label));
    assert.ok(text.includes('合成 <b>근거</b>'));
    assert.match(text,/2026-10-19T00:00:00Z/);
    if (raw !== 'allow') assert.doesNotMatch(text, /허용\(allow\)/);
    if (raw === 'challenge') assert.match(text,/대신 수행하지 않습니다/);
  }
});
test('허용 다음 오류/idle/loading은 옛 허용과 이유를 제거한다', () => {
  assert.match(view.renderDecision(result('allow')).textContent,/허용\(allow\)/);
  for (const status of ['error','idle','loading']) {
    const input={...result('allow'),status,error:{message:'합성 요청 실패'}};
    const text=view.renderDecision(input).textContent;
    assert.doesNotMatch(text,/허용\(allow\)|合成 <b>근거/);
    if(status==='error') { assert.match(text,/요청 실패: 합성 요청 실패/); assert.match(text,/거부 판정과 다르/); }
    if(status==='idle') assert.match(text,/골라 접속을 요청/);
    if(status==='loading') assert.match(text,/판정 확인 중/);
  }
});
