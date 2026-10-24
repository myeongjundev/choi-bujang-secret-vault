import test from 'node:test';
import assert from 'node:assert/strict';
import { document, Element } from './dom.mjs';
import { createStudentView } from '../extension.mjs';
globalThis.document=document;
const view=createStudentView(),stamp='2026-10-24T08:00:00Z',source='https://api.osv.dev/v1/querybatch';
const pkg=(status='known_vulnerabilities')=>({name:'fixture-package',version:'1.2.3',status,source,checkedAt:stamp,vulnerabilities:status==='none_found'?[]:[{id:'CVE-2026-12345',modified:stamp}]});
const inputFor=(status='complete')=>({status:'ok',mode:'demo',data:{status,lockfileVersion:3,lockfileHash:'a'.repeat(64),checkedAt:stamp,packages:[pkg()]}});
const render=input=>view.renderVulnerabilities(input);
test('OSV 조회는 정확한 설치 버전·lock 해시·출처·조회/수정 시각·ID를 표시한다',()=>{
  const input=inputFor(),before=structuredClone(input),root=render(input),row=root.all(n=>n.getAttribute('data-student-package-name')==='fixture-package')[0];
  assert.ok(row);assert.equal(row.getAttribute('data-student-package-version'),'1.2.3');
  for(const text of ['모두 조회(complete)','정확한 설치 버전','1.2.3',source,stamp,'CVE-2026-12345','수정 시각',input.data.lockfileHash])assert.ok(root.textContent.includes(text),text);
  assert.deepEqual(input,before);
});
test('일부 조회 실패에서는 이미 받은 취약점 ID를 보존하고 전체 확인으로 쓰지 않는다',()=>{
  const input=inputFor('partial');input.data.packages[0].status='unverifiable';
  const root=render(input);assert.match(root.textContent,/일부 조회 실패\(partial\)/);assert.match(root.textContent,/일부 확인.*전체 조회 확인 불가/);assert.match(root.textContent,/CVE-2026-12345/);assert.doesNotMatch(root.textContent,/알려진 항목 없음/);
});
test('미설정·미조회·lock 확인 불가와 조회 결과 항목 없음을 구분한다',()=>{
  for(const [status,text] of [['not_configured','조회 준비 미완료'],['not_checked','아직 조회 안 함'],['unverifiable','lock 파일 확인 불가']]){
    const input=inputFor(status);input.data.packages=[];const root=render(input);assert.ok(root.textContent.includes(`${text}(${status})`));assert.doesNotMatch(root.textContent,/알려진 항목 없음|취약점 없음/);
  }
  const input=inputFor();input.data.packages=[pkg('none_found')];assert.match(render(input).textContent,/알려진 항목 없음\(none_found\)/);
  const unconfigured=render({status:'ok',data:{status:'not_configured',checkedAt:stamp,packages:[]}});
  assert.match(unconfigured.textContent,/조회 준비 미완료/);assert.doesNotMatch(unconfigured.textContent,/lockfileVersion:|lockfileHash:/);
});
test('조회 중·오류·취소·재조회는 이전 패키지 행과 해시를 현재 결과로 남기지 않는다',()=>{
  const host=new Element('div'),input=inputFor();host.replaceChildren(render(input));
  for(const status of ['idle','loading','error']){
    const root=render({...input,status,error:{code:'CANCELLED',message:'합성 취소'}});host.replaceChildren(root);
    assert.doesNotMatch(host.textContent,/fixture-package|CVE-2026-12345|aaaaaaaaaa/);assert.equal(root.all(n=>n.getAttribute('data-student-package-name')).length,0);
    if(status==='error')assert.match(host.textContent,/조회 실패.*CANCELLED/);
  }
  const next=inputFor();next.data.lockfileHash='b'.repeat(64);next.data.packages=[{...pkg('none_found'),version:'2.0.0'}];host.replaceChildren(render(next));
  assert.ok(host.textContent.includes(next.data.lockfileHash));assert.doesNotMatch(host.textContent,/aaaaaaaaaa|CVE-2026-12345/);
});
test('범위 버전·잘못된 출처·비밀 모양 문자열을 성공 행으로 표시하지 않는다',()=>{
  for(const fields of [{version:'^1.2.3'},{source:'https://fixture.invalid/private'},{name:'Bearer fixture-fake-value'}]){
    const input=inputFor();Object.assign(input.data.packages[0],fields);const root=render(input);
    assert.match(root.textContent,/확인 불가/);assert.equal(root.all(n=>n.getAttribute('data-student-package-name')).length,0);assert.doesNotMatch(root.textContent,/Bearer fixture-fake-value|fixture.invalid/);
  }
  const error=render({status:'error',error:{code:'REQUEST_TIMEOUT',message:'Bearer fixture-fake-value',raw:'fixture-private-extra'}});assert.doesNotMatch(error.textContent,/Bearer fixture-fake-value|fixture-private-extra/);
  assert.equal(error.all(n=>n.tag==='button'||Object.keys(n.listeners).length>0).length,0);
});
