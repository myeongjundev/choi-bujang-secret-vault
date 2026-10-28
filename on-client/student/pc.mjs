import { createLocalPcController } from '/student/extension.mjs';

const slot=document.getElementById('pc-view');
const pc=createLocalPcController();
slot.replaceChildren(pc.render('unknown'));
// PC 수집은 버튼으로만 수행한다. 초기 요청은 기존 서버의 비밀 없는 연결 모드 조회 한 번뿐이다.
try {
  const response=await fetch('/api/diagnostics',{cache:'no-store',credentials:'omit',redirect:'error'});
  const body=await response.json();
  const mode=body?.ok===true && ['connected','demo','disconnected'].includes(body.data?.engine?.mode)
    ? body.data.engine.mode : 'unknown';
  slot.replaceChildren(pc.render(mode));
} catch {
  slot.replaceChildren(pc.render('unknown'));
}
