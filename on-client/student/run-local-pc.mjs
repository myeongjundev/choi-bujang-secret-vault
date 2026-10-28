// PC-only compatibility entry. Use tools/start-alekov.ps1 for account-connected startup.
import { createOnServer } from '../src/server.mjs';
import { demoEngine } from '../src/engine.mjs';
import { collectLocalPc } from './local-pc.mjs';
import { attachStudentPcRoutes } from './local-pc-routes.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function createStudentPcServer({demo=false,collect=collectLocalPc} = {}) {
  return attachStudentPcRoutes(createOnServer(demo ? {engine:demoEngine()} : {}),{collect});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--demo') || args.length > 1) throw Error('UNSUPPORTED_ARGUMENT');
  const port = Number(process.env.ON_PORT || 5189);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_PORT');
  const server = createStudentPcServer({demo:args.includes('--demo')});
  server.on('error',error => {console.error(error.code === 'EADDRINUSE' ? '포트가 사용 중입니다. 기존 프로그램을 유지하고 ON_PORT를 다른 번호로 지정하세요.' : '학생 PC 조회 서버를 시작하지 못했습니다.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',() => console.log('케셰브 PC 점검: http://127.0.0.1:' + port + '/student/pc · PC 값은 수동 조회, SDP는 별도'));
}
