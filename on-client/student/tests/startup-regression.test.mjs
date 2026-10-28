import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { collectLocalPc } from '../local-pc.mjs';

const app = fileURLToPath(new URL('../../', import.meta.url));
async function unusedPort() {
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
  const port=probe.address().port;await new Promise(r=>probe.close(r));return port;
}

test('공식 CLI 진입점에서도 PC 화면과 기존 예제 경로·보호 검사가 함께 동작한다', {timeout:15000}, async t=>{
  const port=await unusedPort(),base='http://127.0.0.1:'+port;
  // 개인 설정·열쇠나 engine override 없이 제공 CLI의 명시적 예제 모드만 사용한다.
  const env={ON_PORT:String(port)};
  for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP']) if(process.env[key]) env[key]=process.env[key];
  const child=spawn(process.execPath,['src/server.mjs','--demo'],{cwd:app,env,windowsHide:true,stdio:'ignore'});
  const ended=new Promise(r=>child.once('exit',r));
  t.after(async()=>{if(child.exitCode===null)child.kill();await ended;});
  let ready=false;
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)break;
    try{if((await fetch(base+'/',{signal:AbortSignal.timeout(500)})).status===200){ready=true;break;}}catch{}
    await delay(40);
  }
  assert.equal(ready,true,'제공 CLI 시작');
  const page=await fetch(base+'/student/pc');assert.equal(page.status,200);
  assert.match(await page.text(),/내 PC 점검/);
  assert.equal((await fetch(base+'/student/pc.mjs')).status,200);
  assert.equal((await fetch(base+'/api/diagnostics').then(r=>r.json())).data.engine.mode,'demo');
  const blocked=await fetch(base+'/api/student/local-pc');
  assert.equal(blocked.status,403);assert.equal((await blocked.json()).error.code,'LOCAL_HEADER_REQUIRED');
  const foreign=await fetch(base+'/api/native-login/current',{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json'},body:'{}'});
  assert.equal(foreign.status,403);
});

test('디스크 조회는 프로젝트 경로를 보존해 하위 마운트 볼륨을 선택할 수 있다', async()=>{
  const projectDirectory=resolve(app,'fixture-mounted-volume','project');let queriedPath,ticks=0;
  const snapshot=await collectLocalPc({projectDirectory,cpuIntervalMs:1,
    osApi:{cpus:()=>[{times:{user:++ticks,idle:ticks,sys:0,nice:0,irq:0}}],totalmem:()=>100,freemem:()=>50,networkInterfaces:()=>({})},
    diskReader:async path=>{queriedPath=path;return {blocks:100,bsize:1,bavail:50};},windowsReader:async()=>({})});
  assert.equal(queriedPath,projectDirectory);
  assert.equal(snapshot.resources.disk.scope,'project-volume');
  assert.equal(snapshot.resources.disk.availableBytes,50);
});

test('잘못된 native 설정을 주면 PC 전용 서버로 조용히 대체하지 않고 시작을 거부한다', {timeout:10000}, async t=>{
  const port=await unusedPort();
  const env={ON_PORT:String(port)};
  for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP']) if(process.env[key]) env[key]=process.env[key];
  const child=spawn(process.execPath,['src/server.mjs','--native-host-config','fixture-invalid-relative.json'],{cwd:app,env,windowsHide:true,stdio:'ignore'});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  assert.notEqual(code,0);
  await assert.rejects(fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(500)}));
});
