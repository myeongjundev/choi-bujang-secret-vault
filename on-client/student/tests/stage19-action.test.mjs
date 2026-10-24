import test from 'node:test';
import assert from 'node:assert/strict';
import { document, Element } from './dom.mjs';
import { createStudentView } from '../extension.mjs';
globalThis.document = document;
const view = createStudentView();
const fixture = status => ({status,event:{id:'fixture-action-event',evidence:[{id:'fixture-evidence',text:'합성 근거'}],supportedActions:['reauthenticate']},
  actionId:'reauthenticate',target:{id:'device:fixture-target',generation:7},
  receipt:{requestId:'11111111-1111-4111-8111-111111111111',receiptId:'22222222-2222-4222-8222-222222222222',eventId:'fixture-action-event',actionId:'reauthenticate',version:3},
  confirmationExpiresAt:'2026-10-24T12:00:00Z',observation:{observedAt:'2026-10-24T08:00:00Z',effectApplied:true}});
const render = input => view.renderAction(input);

test('조치 준비·전송·접수·효과 확인을 상태 원래 값과 함께 구분한다',()=>{
  const cases={idle:/아직 미실행/,loading:/준비.*조회.*중|확인.*중/,prepared:/준비됨.*미실행/,executing:/전달 중|전송 중/,pending:/접수.*처리 중/,succeeded:/효과 확인/,denied:/거절/,failed:/실패/,expired:/기한.*다시 준비/,unknown:/결과 불명/};
  for(const [status,expected] of Object.entries(cases)){
    const root=render(fixture(status)); assert.match(root.textContent,expected,status); assert.ok(root.textContent.includes(`(${status})`),status);
    assert.equal(root.all(n=>n.tag==='button'||Object.keys(n.listeners).length>0).length,0);
    if(['loading','prepared','executing','pending'].includes(status))assert.doesNotMatch(root.textContent,/효과 확인\(succeeded\)/);
  }
  assert.match(render(fixture('prepared')).textContent,/사람 확인/);
  assert.match(render(fixture('pending')).textContent,/ACK/);
});
test('현재 사건·근거·실제 대상·세대·요청·접수 ID·버전·기한을 연결한다',()=>{
  const input=fixture('prepared'),before=structuredClone(input),root=render(input);
  for(const value of [input.event.id,'fixture-evidence',input.actionId,input.target.id,'7',input.receipt.requestId,input.receipt.receiptId,'3',input.confirmationExpiresAt]) assert.ok(root.textContent.includes(value),value);
  assert.equal(root.getAttribute('data-student-action-event'),input.event.id);
  assert.equal(root.getAttribute('data-student-action-request'),input.receipt.requestId);
  assert.deepEqual(input,before);
});
test('효과 true와 관측 시각 없는 succeeded 및 다른 사건 접수는 결과 불명이다',()=>{
  const good=fixture('succeeded');assert.match(render(good).textContent,/effectApplied: true/);assert.ok(render(good).textContent.includes(good.observation.observedAt));
  for(const observation of [null,{effectApplied:false,observedAt:good.observation.observedAt},{effectApplied:'true',observedAt:good.observation.observedAt},{effectApplied:true,observedAt:null}]){
    const root=render({...good,observation});assert.match(root.textContent,/결과 불명\(unknown\)/);assert.doesNotMatch(root.textContent,/효과 확인\(succeeded\)/);
  }
  const wrong=render({...good,receipt:{...good.receipt,eventId:'other-event'}});
  assert.match(wrong.textContent,/결과 불명/);assert.equal(wrong.getAttribute('data-student-action-event'),null);
});
test('unknown·취소·실패는 효과 없음으로 단정하지 않고 안전한 오류만 표시한다',()=>{
  assert.match(render(fixture('unknown')).textContent,/효과 없음.*단정|효과 없음.*판단/);
  const error=render({...fixture('error'),error:{code:'ACTION_UNSUPPORTED',message:'합성 조치 미지원',raw:'fixture-private-extra'}});
  assert.match(error.textContent,/요청 처리 안 됨\(error\)/);assert.match(error.textContent,/ACTION_UNSUPPORTED/);assert.match(error.textContent,/합성 조치 미지원/);assert.doesNotMatch(error.textContent,/fixture-private-extra/);
  const unsafe=render({...fixture('error'),error:{code:'ACTION_UNSUPPORTED',message:'Bearer fixture-fake-value'}});assert.doesNotMatch(unsafe.textContent,/Bearer fixture-fake-value/);
});
test('새 사건·idle·새 요청에서는 이전 대상·효과·요청 표시가 남지 않는다',()=>{
  const host=new Element('div');host.replaceChildren(render(fixture('succeeded')));
  const idle=render({...fixture('idle'),event:null});host.replaceChildren(idle);
  assert.doesNotMatch(host.textContent,/fixture-action-event|fixture-target|11111111|effectApplied/);
  assert.equal(idle.getAttribute('data-student-action-event'),null);
  const next=fixture('prepared');next.event.id='next-event';next.receipt={...next.receipt,eventId:'next-event',requestId:'33333333-3333-4333-8333-333333333333'};next.target.id='device:next-target';host.replaceChildren(render(next));
  assert.doesNotMatch(host.textContent,/fixture-action-event|fixture-target|11111111|effectApplied/);
});
test('HTML은 문자로만 표시하고 티켓·추가 필드·자동 집행을 노출하지 않는다',()=>{
  const input=fixture('denied');input.message='<img src=x onerror=alert(1)>';input.confirmationId='fixture-private-ticket';input.receipt.confirmationId='fixture-private-ticket';
  const root=render(input);assert.ok(root.textContent.includes(input.message));assert.equal(root.all(n=>n.tag==='img'||n.tag==='button').length,0);assert.doesNotMatch(root.textContent,/fixture-private-ticket/);
});
