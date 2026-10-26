import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { document } from './dom.mjs';
import { cpuPercent, networkSummary, projectWindows, collectLocalPc } from '../local-pc.mjs';
import { createStudentPcServer } from '../run-local-pc.mjs';
import { createLocalPcController, validateLocalPcSnapshot } from '../extension.mjs';

globalThis.document=document;
const time='2026-10-27T03:00:00.000Z';
const start='2026-10-26T03:00:00.000Z';
const cpu = (idle,user) => [{times:{idle,user,nice:0,sys:0,irq:0}}];
const windows = () => ({
  firewall:{state:'ok',checkedAt:time,profiles:['Domain','Private','Public'].map(profile=>({profile,enabled:true}))},
  System:{state:'ok',checkedAt:time,windowStart:start,errors:0,warnings:2,truncated:false,limit:5000},
  Application:{state:'ok',checkedAt:time,windowStart:start,errors:0,warnings:0,truncated:false,limit:5000},
});
const row = (source,rest) => ({state:'ok',source,checkedAt:time,...rest});
function sample(value=37) {
  return {schema:'keshev.student.local-pc.v1',evidence:'measured-local',startedAt:time,checkedAt:time,resources:{
    cpu:row('Node os.cpus interval',{percent:value,intervalMs:800}),
    memory:row('Node os.totalmem/freemem',{usedBytes:1024**3,totalBytes:4*1024**3,percent:25}),
    disk:row('Node fs.statfs project volume',{availableBytes:88*1024**3,totalBytes:100*1024**3,scope:'project-volume'}),
    network:row('Node os.networkInterfaces address configuration',{interfaces:[{label:'fixture-private-name',ipv4:1,ipv6:1}]}),
    ...projectWindows(windows()),
  }};
}
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('CPU는 측정 구간 차이로 계산하고 역행·무변화·CPU 수 변화를 거절한다',()=>{
  assert.equal(cpuPercent(cpu(20,30),cpu(80,70)),40);
  assert.throws(()=>cpuPercent(cpu(20,30),cpu(20,30)));
  assert.throws(()=>cpuPercent(cpu(20,30),cpu(10,70)));
  assert.throws(()=>cpuPercent(cpu(20,30),[]));
});

test('네트워크 구성은 익명 주소 계열 개수만 남기며 내부 연결을 제외한다',()=>{
  const input={'fixture-private-name':[{family:'IPv4',internal:false,address:'192.0.2.24',mac:'fixture-mac',cidr:'192.0.2.24/24'}],loop:[{family:'IPv4',internal:true}]};
  assert.deepEqual(networkSummary(input),[{label:'인터페이스 1',ipv4:1,ipv6:0}]);
  assert.doesNotMatch(JSON.stringify(networkSummary(input)),/private|192\.0|fixture-mac|cidr/);
  assert.throws(()=>networkSummary({one:[{family:'unexpected',internal:false}]}));
});

test('Windows 조회의 0건·권한 오류·상한 도달을 구분하고 원문 추가 필드를 버린다',()=>{
  const input=windows();input.System={state:'unavailable',checkedAt:time,code:'PC_ACCESS_DENIED',message:'fixture-private-body'};
  input.Application={...input.Application,warnings:4999,errors:1,truncated:true,privateValue:'fixture-private-body'};
  const out=projectWindows(input);
  assert.equal(out.systemLog.state,'unavailable');assert.equal(out.systemLog.code,'PC_ACCESS_DENIED');
  assert.equal(out.systemLog.errors,undefined);
  assert.equal(out.applicationLog.truncated,true);assert.equal(out.applicationLog.errors,1);
  assert.doesNotMatch(JSON.stringify(out),/fixture-private-body/);
  assert.equal(projectWindows(windows()).applicationLog.errors,0);
});

test('한 수집 실패가 다른 항목을 지우지 않고 비정상 수치와 오류 원문을 내보내지 않는다',async()=>{
  let i=0;
  const s=await collectLocalPc({cpuIntervalMs:1,
    osApi:{cpus:()=>i++?cpu(80,70):cpu(20,30),totalmem:()=>100,freemem:()=>200,networkInterfaces:()=>({})},
    diskReader:async()=>{throw Object.assign(Error('fixture-private-path'),{code:'EACCES'});},
    windowsReader:async()=>windows(),
  });
  assert.equal(s.resources.cpu.state,'ok');assert.equal(s.resources.memory.code,'PC_INVALID_DATA');
  assert.equal(s.resources.disk.code,'PC_ACCESS_DENIED');assert.equal(s.resources.network.state,'ok');
  assert.equal(s.resources.systemLog.state,'ok');
  assert.doesNotMatch(JSON.stringify(s),/fixture-private-path/);
});

test('브라우저 계약은 단위·상한·중복 프로필을 검증하고 추가 필드를 투영한다',()=>{
  const s=sample();s.privateValue='fixture-private-body';s.resources.cpu.privateValue='fixture-private-body';
  const cleaned=validateLocalPcSnapshot(s);
  assert.doesNotMatch(JSON.stringify(cleaned),/fixture-private|privateValue/);
  for (const change of [
    x=>x.resources.cpu.percent=101,
    x=>x.resources.memory.percent=99,
    x=>x.resources.disk.availableBytes=-1,
    x=>x.resources.firewall.profiles[1].profile='Domain',
    x=>x.resources.systemLog.errors=5001,
  ]) {const bad=sample();change(bad);assert.throws(()=>validateLocalPcSnapshot(bad));}
});

test('수동 조회 전에는 수집하지 않으며 실제 PC 값과 SDP 예제를 분리한다',async()=>{
  let calls=0;const pc=createLocalPcController({readSnapshot:async()=>{calls++;return sample();}});
  const root=pc.render('demo');assert.equal(calls,0);assert.doesNotMatch(root.textContent,/37 %/);
  await pc.refresh();assert.equal(calls,1);
  assert.match(root.textContent,/SDP 예제 · 실제 연결 아님/);assert.match(root.textContent,/37 %/);
  assert.match(root.textContent,/침해·공격 탐지 결과가 아닙니다/);
});

test('재조회·실패 시 이전 수치가 현재 결과로 남지 않고 복구 후 이전 조회와 비교한다',async()=>{
  let d=deferred(),i=0;
  const pc=createLocalPcController({readSnapshot:()=>++i===1?Promise.resolve(sample()):i===2?d.promise:Promise.resolve(sample(41))});
  const root=pc.render('disconnected');await pc.refresh();assert.match(root.textContent,/37 %/);
  const pending=pc.refresh();assert.doesNotMatch(root.textContent,/37 %|88\.00 GiB/);
  d.reject(Error('LOCAL_READ_FAILED'));await pending;
  assert.match(root.textContent,/확인 불가/);assert.doesNotMatch(root.textContent,/37 %|88\.00 GiB/);
  await pc.refresh();assert.match(root.textContent,/이전 수동 조회 대비 \+4\.0 %p/);assert.match(root.textContent,/SDP 미연결/);
});

test('취소된 응답은 새 조회를 덮지 않고 전체 재렌더 뒤에도 현재 패널에만 반영한다',async()=>{
  const a=deferred(),b=deferred();let n=0;
  const pc=createLocalPcController({readSnapshot:()=>++n===1?a.promise:b.promise});
  const old=pc.render();const first=pc.refresh();pc.cancel();const second=pc.refresh();
  const current=pc.render('disconnected');a.resolve(sample(11));await first;
  assert.doesNotMatch(current.textContent,/11 %/);b.resolve(sample(63));await second;
  assert.match(current.textContent,/63 %/);assert.doesNotMatch(old.textContent,/63 %/);
});

test('시간 초과 뒤 늦은 성공을 거절한다',async()=>{
  const d=deferred();const pc=createLocalPcController({readSnapshot:()=>d.promise,timeoutMs:5});
  const root=pc.render();const waiting=pc.refresh();await new Promise(r=>setTimeout(r,25));
  assert.match(root.textContent,/시간이 초과/);d.resolve(sample());await waiting;assert.doesNotMatch(root.textContent,/37 %/);
});

test('부분 조회 실패는 정상 항목을 보존하며 실패 로그를 0건으로 표시하지 않는다',async()=>{
  const s=sample();s.resources.systemLog={state:'unavailable',source:s.resources.systemLog.source,checkedAt:time,code:'PC_ACCESS_DENIED'};
  const pc=createLocalPcController({readSnapshot:async()=>s});const root=pc.render('disconnected');await pc.refresh();
  assert.match(root.textContent,/37 %/);assert.match(root.textContent,/일반 권한으로 읽을 수 없습니다/);
  assert.match(root.textContent,/7개 항목 중 6개 조회, 1개 확인 불가/);
});

function http(port,path,{method='GET',headers={}}={}) {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method,headers},res=>{
      let body='';res.setEncoding('utf8');res.on('data',s=>{body+=s;});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
}
async function listen(t,collect) {
  const server=createStudentPcServer({collect});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));return server.address().port;
}
test('로컬 API는 외부 Origin·Host·단순 GET·변경 메서드·쿼리를 수집 전에 거절한다',async t=>{
  let calls=0;const port=await listen(t,async()=>{calls++;return sample();});
  const path='/api/student/local-pc',valid={'X-Keshev-Local-Read':'1'};
  for (const [options,expected] of [
    [{headers:{}},403],[{headers:{...valid,Origin:'https://fixture.invalid'}},403],
    [{headers:{...valid,Host:'fixture.invalid'}},403],
    [{headers:{...valid,'Sec-Fetch-Site':'cross-site'}},403],
    [{headers:valid,method:'POST'},405],[{headers:valid,method:'OPTIONS'},405],
  ]) assert.equal((await http(port,path,options)).status,expected);
  assert.equal((await http(port,path+'?log=Security',{headers:valid})).status,400);assert.equal(calls,0);
  const success=await http(port,path,{headers:valid});assert.equal(success.status,200);assert.equal(calls,1);
  assert.equal(success.headers['access-control-allow-origin'],undefined);
  assert.equal(success.headers['cache-control'],'no-store');
  assert.equal((await http(port,'/student/local-pc.css')).status,200);
  const base=await http(port,'/api/diagnostics');assert.equal(JSON.parse(base.body).data.engine.mode,'disconnected');
  assert.equal((await http(port,'/api/diagnostics',{headers:{Host:'fixture.invalid'}})).status,403);
});

test('동시 수동 조회는 한 수집으로 합치고 수집 실패 뒤에는 새 조회가 가능하다',async t=>{
  let calls=0;const d=deferred();const port=await listen(t,async()=>{calls++;if(calls===1)return d.promise;return sample();});
  const options={headers:{'X-Keshev-Local-Read':'1'}};
  const a=http(port,'/api/student/local-pc',options),b=http(port,'/api/student/local-pc',options);
  await new Promise(r=>setTimeout(r,30));d.reject(Error('fixture-private-error'));
  const results=await Promise.all([a,b]);assert.equal(calls,1);
  for (const result of results) {assert.equal(result.status,503);assert.doesNotMatch(result.body,/fixture-private-error/);}
  assert.equal((await http(port,'/api/student/local-pc',options)).status,200);assert.equal(calls,2);
});

test('마지막 브라우저가 연결을 끊으면 수집을 중단하고 다음 조회는 새로 시작한다',async t=>{
  let calls=0;const entered=deferred(),aborted=deferred();
  const port=await listen(t,async({signal})=>{
    calls++;
    if(calls>1)return sample();
    entered.resolve();
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted.resolve();reject(Error('cancelled fixture'));},{once:true}));
  });
  const client=request({hostname:'127.0.0.1',port,path:'/api/student/local-pc',headers:{'X-Keshev-Local-Read':'1'}});
  client.on('error',()=>{});client.end();await entered.promise;client.destroy();await aborted.promise;
  const result=await http(port,'/api/student/local-pc',{headers:{'X-Keshev-Local-Read':'1'}});
  assert.equal(result.status,200);assert.equal(calls,2);
});
