// 학생용 개발 실행 진입점. 제공 소스를 수정하지 않고 고정된 읽기 전용 경로 두 개만 추가한다.
import { createOnServer } from '../src/server.mjs';
import { demoEngine } from '../src/engine.mjs';
import { collectLocalPc } from './local-pc.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const apiPath = '/api/student/local-pc';
const cssPath = '/student/local-pc.css';
export function createStudentPcServer({demo=false,collect=collectLocalPc} = {}) {
  const server = createOnServer(demo ? {engine:demoEngine()} : {});
  const original = server.listeners('request');
  if (original.length !== 1) throw Error('UNSUPPORTED_STARTER_REQUEST_HANDLERS');
  // 같은 서버가 listen하므로 제공 처리기의 address/Host/Origin 검사도 그대로 동작한다.
  server.removeListener('request',original[0]);
  let inFlight = null;
  server.once('close',() => inFlight?.controller.abort());
  const send = (res,status,body,type='application/json; charset=utf-8') => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  server.on('request',async (req,res) => {
    const path = req.url?.split('?')[0];
    if (![apiPath,cssPath].includes(path)) return original[0].call(server,req,res);
    const fail = (status,code) => send(res,status,{ok:false,error:{code}});
    const port = server.address()?.port;
    const host = req.headers.host;
    if (!['127.0.0.1:' + port,'localhost:' + port].includes(host)) return fail(403,'LOCAL_HOST_REJECTED');
    if (req.headers.origin && req.headers.origin !== 'http://' + host) return fail(403,'LOCAL_ORIGIN_REJECTED');
    if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) return fail(403,'LOCAL_ORIGIN_REJECTED');
    if (req.url !== path) return fail(400,'LOCAL_QUERY_REJECTED');
    if (req.method !== 'GET') return fail(405,'LOCAL_READ_ONLY');
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) return fail(400,'LOCAL_BODY_REJECTED');
    try {
      if (path === cssPath) return send(res,200,await readFile(new URL('./local-pc.css',import.meta.url),'utf8'),'text/css; charset=utf-8');
      // 브라우저의 외부 사이트가 단순 GET/폼으로 측정을 일으키지 못하도록 전용 헤더를 요구한다.
      if (req.headers['x-keshev-local-read'] !== '1') return fail(403,'LOCAL_HEADER_REQUIRED');
      if (!inFlight || inFlight.controller.signal.aborted) {
        const flight={controller:new AbortController(),clients:0,settled:false,promise:null};
        flight.promise=Promise.resolve().then(()=>collect({signal:flight.controller.signal})).finally(()=>{
          flight.settled=true;
          if(inFlight===flight)inFlight=null;
        });
        inFlight=flight;
      }
      const flight=inFlight;
      flight.clients++;
      const disconnected=()=>{
        flight.clients--;
        if(!flight.clients && !flight.settled)flight.controller.abort();
      };
      res.once('close',disconnected);
      try {
        const data=await flight.promise;
        send(res,200,{ok:true,data});
      } finally {
        res.removeListener('close',disconnected);
      }
    } catch { fail(503,'LOCAL_READ_FAILED'); }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--demo') || args.length > 1) throw Error('UNSUPPORTED_ARGUMENT');
  const port = Number(process.env.ON_PORT || 5189);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_PORT');
  const server = createStudentPcServer({demo:args.includes('--demo')});
  server.on('error',error => {console.error(error.code === 'EADDRINUSE' ? '포트가 사용 중입니다. 기존 프로그램을 유지하고 ON_PORT를 다른 번호로 지정하세요.' : '학생 PC 조회 서버를 시작하지 못했습니다.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',() => console.log('학생 PC 조회 앱: http://127.0.0.1:' + port + '/ · PC 값은 수동 조회, SDP는 별도'));
}
