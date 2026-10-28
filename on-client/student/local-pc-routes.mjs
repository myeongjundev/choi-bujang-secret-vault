// 학생 경로는 제공 서버를 공유한다. native/SDP 초기화는 src/server.mjs가 담당한다.
import { collectLocalPc } from './local-pc.mjs';
import { readFile } from 'node:fs/promises';

const apiPath = '/api/student/local-pc';
const cssPath = '/student/local-pc.css';
const studentAssets = new Map([
  [cssPath,['./local-pc.css','text/css; charset=utf-8']],
  ['/student/pc',['./pc.html','text/html; charset=utf-8']],
  ['/student/pc.mjs',['./pc.mjs','text/javascript; charset=utf-8']],
]);
export function attachStudentPcRoutes(server,{collect=collectLocalPc} = {}) {
  const original = server.listeners('request');
  if (original.length !== 1) throw Error('UNSUPPORTED_STARTER_REQUEST_HANDLERS');
  // 같은 서버가 listen하므로 제공 처리기의 address/Host/Origin 검사도 그대로 동작한다.
  server.removeListener('request',original[0]);
  let inFlight = null;
  server.once('close',() => inFlight?.controller.abort());
  const send = (res,status,body,type='application/json; charset=utf-8') => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff',
      ...(type.startsWith('text/html')?{'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"}:{})});
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  server.on('request',async (req,res) => {
    const path = req.url?.split('?')[0];
    if (path!==apiPath && !studentAssets.has(path)) return original[0].call(server,req,res);
    const fail = (status,code) => send(res,status,{ok:false,error:{code}});
    const port = server.address()?.port;
    const host = req.headers.host;
    if (!['127.0.0.1:' + port,'localhost:' + port].includes(host)) return fail(403,'LOCAL_HOST_REJECTED');
    if (path===apiPath && req.headers.origin && req.headers.origin !== 'http://' + host) return fail(403,'LOCAL_ORIGIN_REJECTED');
    if (path===apiPath && req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) return fail(403,'LOCAL_ORIGIN_REJECTED');
    if (req.url !== path) return fail(400,'LOCAL_QUERY_REJECTED');
    if (req.method !== 'GET') return fail(405,'LOCAL_READ_ONLY');
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) return fail(400,'LOCAL_BODY_REJECTED');
    try {
      if(studentAssets.has(path)){
        const [file,type]=studentAssets.get(path);
        return send(res,200,await readFile(new URL(file,import.meta.url),'utf8'),type);
      }
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
