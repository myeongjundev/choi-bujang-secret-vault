// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
const PC_SOURCES = {
  cpu:'Node os.cpus interval', memory:'Node os.totalmem/freemem', disk:'Node fs.statfs project volume',
  network:'Node os.networkInterfaces address configuration', firewall:'Windows Get-NetFirewallProfile ActiveStore',
  systemLog:'Windows Get-WinEvent System', applicationLog:'Windows Get-WinEvent Application',
};
const PC_REASONS = {
  PC_ACCESS_DENIED:'현재 일반 권한으로 읽을 수 없습니다. 권한을 높이거나 설정을 바꾸지 않습니다.',
  PC_QUERY_FAILED:'이 항목을 읽지 못했습니다. 잠시 뒤 직접 다시 조회하세요.',
  PC_TIMEOUT:'조회 시간이 초과됐습니다. 현재 결과는 확인 불가입니다.',
  PC_UNSUPPORTED:'이 운영체제에서 지원하지 않는 조회입니다.',
  PC_INVALID_DATA:'조회 결과의 형식이나 단위를 확인하지 못했습니다.',
  PC_CANCELLED:'조회를 취소했습니다. 도착이 늦은 결과는 표시하지 않습니다.',
  LOCAL_RUNTIME_REQUIRED:'최신 작업 브랜치에서 공식 실행 도구(tools/start-alekov.ps1)로 앱을 다시 켠 뒤 조회하세요.',
  LOCAL_READ_FAILED:'로컬 조회 서버를 확인하고 직접 다시 조회하세요.',
};

// 학생 조회 계약이다. 기존 엔진/AI/승인 host의 제공 계약을 바꾸지 않는다.
export function validateLocalPcSnapshot(data) {
  const date = s => typeof s === 'string' && Number.isFinite(Date.parse(s));
  const n = x => Number.isFinite(x) && x >= 0;
  const integer = x => Number.isSafeInteger(x) && x >= 0;
  const percent = x => n(x) && x <= 100;
  const bad = () => { throw Error('PC_INVALID_DATA'); };
  if (data?.schema !== 'keshev.student.local-pc.v1' || data.evidence !== 'measured-local' ||
      !date(data.startedAt) || !date(data.checkedAt) || Date.parse(data.startedAt) > Date.parse(data.checkedAt)) bad();
  const out = {schema:data.schema,evidence:data.evidence,startedAt:data.startedAt,checkedAt:data.checkedAt,resources:{}};
  for (const key of Object.keys(PC_SOURCES)) {
    const r = data.resources?.[key];
    if (!r || r.source !== PC_SOURCES[key] || !date(r.checkedAt) || !['ok','unavailable'].includes(r.state)) bad();
    const base = {state:r.state,source:r.source,checkedAt:r.checkedAt};
    if (r.state === 'unavailable') {
      out.resources[key] = {...base,code:Object.hasOwn(PC_REASONS,r.code) ? r.code : 'PC_QUERY_FAILED'};
      continue;
    }
    if (key === 'cpu') {
      if (!percent(r.percent) || !integer(r.intervalMs) || r.intervalMs < 1 || r.intervalMs > 30000) bad();
      out.resources[key] = {...base,percent:r.percent,intervalMs:r.intervalMs};
    } else if (key === 'memory') {
      if (!n(r.totalBytes) || r.totalBytes <= 0 || !n(r.usedBytes) || r.usedBytes > r.totalBytes ||
          !percent(r.percent) || Math.abs(r.percent-r.usedBytes/r.totalBytes*100) > 0.15) bad();
      out.resources[key] = {...base,totalBytes:r.totalBytes,usedBytes:r.usedBytes,percent:r.percent};
    } else if (key === 'disk') {
      if (!n(r.totalBytes) || r.totalBytes <= 0 || !n(r.availableBytes) || r.availableBytes > r.totalBytes || r.scope !== 'project-volume') bad();
      out.resources[key] = {...base,totalBytes:r.totalBytes,availableBytes:r.availableBytes,scope:r.scope};
    } else if (key === 'network') {
      if (!Array.isArray(r.interfaces) || r.interfaces.length > 128 || r.interfaces.some(i => !integer(i?.ipv4) || !integer(i?.ipv6))) bad();
      out.resources[key] = {...base,interfaces:r.interfaces.map((i,index) => ({label:'인터페이스 '+(index+1),ipv4:i.ipv4,ipv6:i.ipv6}))};
    } else if (key === 'firewall') {
      if (!Array.isArray(r.profiles) || r.profiles.length !== 3 || new Set(r.profiles.map(p=>p?.profile)).size !== 3 ||
          r.profiles.some(p => !['Domain','Private','Public'].includes(p?.profile) || p.enabled !== null && typeof p.enabled !== 'boolean')) bad();
      out.resources[key] = {...base,profiles:r.profiles.map(p => ({profile:p.profile,enabled:p.enabled}))};
    } else {
      if (!integer(r.errors) || !integer(r.warnings) || r.errors+r.warnings > 5000 || r.limit !== 5000 ||
          typeof r.truncated !== 'boolean' || !date(r.windowStart) ||
          Date.parse(r.windowStart) > Date.parse(r.checkedAt) || Date.parse(r.checkedAt)-Date.parse(r.windowStart)>25*3600000) bad();
      out.resources[key] = {...base,errors:r.errors,warnings:r.warnings,limit:5000,truncated:r.truncated,windowStart:r.windowStart};
    }
  }
  return out;
}

export function createLocalPcController({readSnapshot,timeoutMs=22000} = {}) {
  let phase='idle', snapshot=null, reason=null, generation=0, controller=null, timer=null, refs=null, mode='unknown';
  const history=[];
  const add = (parent,tag,text='') => {
    const el=document.createElement(tag);el.textContent=String(text);parent.appendChild(el);return el;
  };
  const at = s => new Date(s).toLocaleString('ko-KR',{hour12:false});
  const gib = bytes => (bytes/1024**3).toFixed(2);
  const unavailable = (parent,r) => add(parent,'p','확인 불가 · '+(PC_REASONS[r?.code] || PC_REASONS.PC_QUERY_FAILED)).setAttribute('class','pc-warn');
  async function read(signal) {
    if (readSnapshot) return readSnapshot({signal});
    const response = await fetch('/api/student/local-pc',{headers:{'X-Keshev-Local-Read':'1'},credentials:'omit',cache:'no-store',redirect:'error',signal});
    if (response.status === 404) throw Error('LOCAL_RUNTIME_REQUIRED');
    if (!response.ok || !(response.headers.get('content-type') || '').startsWith('application/json')) throw Error('LOCAL_READ_FAILED');
    const body=await response.json();
    if (body?.ok !== true) throw Error('LOCAL_READ_FAILED');
    return body.data;
  }
  function draw() {
    if (!refs) return;
    refs.refresh.disabled=phase==='loading';
    refs.refresh.textContent=history.length ? 'PC 상태 다시 조회' : 'PC 상태 조회';
    refs.cancel.disabled=phase!=='loading';
    refs.body.setAttribute('aria-busy',String(phase==='loading'));
    refs.root.setAttribute('data-state',phase);
    refs.body.replaceChildren();
    const connection = mode==='connected' ? 'SDP 연결 모드 · 제공 서버 응답 기준' :
      mode==='demo' ? 'SDP 예제 · 실제 연결 아님' : mode==='disconnected' ? 'SDP 미연결' : 'SDP 연결 확인 불가';
    add(refs.body,'p',connection+' · 이 PC의 로컬 조회 결과와 별개입니다.').setAttribute('class','pc-warn');
    if (phase !== 'ok') {
      refs.status.textContent=phase==='loading' ? '실제 PC 상태를 읽는 중입니다. Windows 조회는 최대 14초 걸릴 수 있습니다.' :
        phase==='error' ? '조회 결과 확인 불가' : '아직 PC 상태를 조회하지 않았습니다.';
      const placeholders=add(refs.body,'div');placeholders.setAttribute('class','pc-grid');
      placeholders.setAttribute('id','pc-resources');
      for(const title of ['CPU 사용률','메모리 사용량','디스크 여유 공간','조회 상태']){
        const tile=add(placeholders,'section');tile.setAttribute('class','pc-card');
        add(tile,'h4',title);
        add(tile,'p',phase==='loading'?'조회 중':phase==='error'?'확인 불가':'조회 전').setAttribute('class','pc-value pc-placeholder');
      }
      if (phase==='error') {
        const alert=add(refs.body,'section');alert.setAttribute('role','alert');
        add(alert,'h4','PC 상태를 확인하지 못했습니다');
        unavailable(alert,{code:reason});
        add(alert,'p','현재 값으로 표시할 숫자가 없습니다. 실행 창을 확인한 뒤 PC 상태 조회 버튼으로 다시 시도하세요.');
      }
      else add(refs.body,'p','조회 버튼을 누를 때만 측정합니다. 예시 숫자로 대신하지 않습니다.');
      const connectionPlaceholder=add(refs.body,'section');
      connectionPlaceholder.setAttribute('id','pc-connections');
      add(connectionPlaceholder,'h4','연결·Windows 기록');
      add(connectionPlaceholder,'p','PC 상태 조회를 누르면 네트워크 주소 구성·방화벽 프로필·System/Application 경고와 오류 건수를 함께 확인합니다.');
      return;
    }
    const r=snapshot.resources;
    const measured=Object.values(r).filter(x=>x.state==='ok').length;
    refs.status.textContent='마지막 수동 조회: '+at(snapshot.checkedAt)+' · 7개 항목 중 '+measured+'개 조회, '+(7-measured)+'개 확인 불가';
    const cards=add(refs.body,'div');cards.setAttribute('class','pc-grid');cards.setAttribute('id','pc-resources');
    const previous=history.length>1 ? history.at(-2) : null;
    function card(title,key,value,detail) {
      const c=add(cards,'section');c.setAttribute('class','pc-card');add(c,'h4',title);
      if (r[key].state!=='ok') unavailable(c,r[key]);
      else {
        add(c,'p',value).setAttribute('class','pc-value');
        add(c,'p',detail).setAttribute('class','pc-note');
        if (['cpu','memory'].includes(key) && previous?.resources[key].state==='ok') {
          const delta=r[key].percent-previous.resources[key].percent;
          add(c,'p','이전 수동 조회 대비 '+(delta>=0?'+':'')+delta.toFixed(1)+' %p');
        }
      }
      add(c,'p','측정 시각 '+at(r[key].checkedAt)).setAttribute('class','pc-note');
    }
    card('CPU 사용률','cpu',r.cpu.percent+' %','전체 논리 CPU 평균 · '+r.cpu.intervalMs+' ms 구간');
    card('메모리 사용량','memory',gib(r.memory.usedBytes)+' GiB', '전체 '+gib(r.memory.totalBytes)+' GiB · '+r.memory.percent+' %');
    card('디스크 여유 공간','disk',gib(r.disk.availableBytes)+' GiB','프로젝트가 있는 볼륨 · 전체 '+gib(r.disk.totalBytes)+' GiB');
    const last=add(cards,'section');last.setAttribute('class','pc-card');add(last,'h4','조회 상태');
    add(last,'p',measured+' / 7').setAttribute('class','pc-value');
    add(last,'p','실제 로컬 조회 · 보안 안전 판정이 아닙니다.');
    const historyTitle=add(refs.body,'h4','수동 조회 추이');historyTitle.setAttribute('id','pc-history');
    add(refs.body,'p','이 화면에서 누른 최근 20회만 메모리에 보관합니다. 같은 시각의 지속 감시 자료가 아닙니다.').setAttribute('class','pc-note');
    const tableWrap=add(refs.body,'div');tableWrap.setAttribute('class','pc-table-wrap');
    const table=add(tableWrap,'table');add(table,'caption','최근 5회 조회 비교 (GiB = 1024³ 바이트)');
    const head=add(table,'thead'),hr=add(head,'tr');
    for (const label of ['조회 시각','CPU (%)','메모리 (%)','디스크 여유 (GiB)']) add(hr,'th',label).setAttribute('scope','col');
    const tbody=add(table,'tbody');
    for (const sample of history.slice(-5).reverse()) {
      const row=add(tbody,'tr'),s=sample.resources;
      add(row,'td',at(sample.checkedAt));
      for(const key of ['cpu','memory']){
        const cell=add(row,'td',s[key].state==='ok'?s[key].percent+' %':'확인 불가');
        if(s[key].state==='ok'){
          const meter=add(cell,'meter');meter.setAttribute('min','0');meter.setAttribute('max','100');
          meter.setAttribute('value',String(s[key].percent));meter.setAttribute('aria-label',at(sample.checkedAt)+' '+key+' '+s[key].percent+' %');
        }
      }
      add(row,'td',s.disk.state==='ok'?gib(s.disk.availableBytes):'확인 불가');
    }
    const connectionTitle=add(refs.body,'h4','연결·Windows 기록');connectionTitle.setAttribute('id','pc-connections');
    add(refs.body,'p','주소 구성과 설정·기록을 읽은 결과입니다. 실제 통신이나 공격 탐지 결과와 구분해 보세요.').setAttribute('class','pc-note');
    const connectionGrid=add(refs.body,'div');connectionGrid.setAttribute('class','pc-connection-grid');
    for (const [key,title] of [['network','네트워크 주소 구성'],['firewall','Windows 방화벽 프로필 설정'],['systemLog','System 경고·오류'],['applicationLog','Application 경고·오류']]) {
      const section=add(connectionGrid,'section');section.setAttribute('class','pc-diagnostic');add(section,'h4',title);
      if (r[key].state!=='ok') unavailable(section,r[key]);
      else if (key==='network') {
        add(section,'p','구성된 외부 인터페이스 '+r.network.interfaces.length+'개 · 인터넷 통신 성공 여부는 검사하지 않았습니다.');
        for (const iface of r.network.interfaces) add(section,'p',iface.label+' · IPv4 주소 '+iface.ipv4+'개 · IPv6 주소 '+iface.ipv6+'개');
      } else if (key==='firewall') {
        for (const p of r.firewall.profiles) add(section,'p',p.profile+' · '+(p.enabled===true?'사용 설정':p.enabled===false?'사용 안 함 설정':'확인 불가'));
        add(section,'p','프로필 설정을 읽은 결과이며 실제 차단 효과를 시험한 결과는 아닙니다.');
      } else {
        const log=r[key];
        add(section,'p','오류 '+log.errors+'건 · 경고 '+log.warnings+'건'+(log.truncated?' (일부 조회: 각각 최소 건수)':''));
        add(section,'p','조회 범위 '+at(log.windowStart)+' ~ '+at(log.checkedAt)+' · 최근 24시간, 최대 5,000건');
        if (log.truncated) add(section,'p','조회 상한에 도달했습니다. 범위 전체 건수가 아닙니다.').setAttribute('class','pc-warn');
      }
      add(section,'p','측정 시각 '+at(r[key].checkedAt)+' · 출처 '+r[key].source).setAttribute('class','pc-note');
    }
    add(refs.body,'p','Windows 경고·오류 건수는 침해·공격 탐지 결과가 아닙니다. 방화벽·보안 설정은 바꾸지 않습니다.').setAttribute('class','pc-warn');
  }
  function cancel(code='PC_CANCELLED') {
    generation++;controller?.abort();clearTimeout(timer);snapshot=null;reason=code;phase='error';draw();
  }
  async function refresh() {
    if (phase==='loading') return;
    const mine=++generation;controller=new AbortController();snapshot=null;reason=null;phase='loading';draw();
    timer=setTimeout(()=>{if(mine===generation)cancel('PC_TIMEOUT');},timeoutMs);
    try {
      const data=await read(controller.signal);
      if (mine!==generation) return;
      snapshot=validateLocalPcSnapshot(data);history.push(snapshot);if(history.length>20)history.shift();phase='ok';
    } catch (error) {
      if (mine!==generation) return;
      reason=Object.hasOwn(PC_REASONS,error?.message)?error.message:'LOCAL_READ_FAILED';snapshot=null;phase='error';
    } finally { if(mine===generation){clearTimeout(timer);draw();} }
  }
  return {
    refresh, cancel,
    render(engineMode='unknown') {
      mode=engineMode;
      const root=document.createElement('section');root.setAttribute('id','student-local-pc');root.setAttribute('class','local-pc');
      root.setAttribute('aria-label','내 PC 상태와 읽기 전용 연결 기록');
      const css=add(root,'link');css.setAttribute('rel','stylesheet');css.setAttribute('href','/student/local-pc.css');
      add(root,'h3','내 PC 상태 · 마지막 수동 조회');
      add(root,'p','이 PC에서 직접 측정합니다. 보안 서버 연결 상태는 별도로 확인합니다.').setAttribute('class','pc-note');
      const toolbar=add(root,'div');toolbar.setAttribute('class','pc-toolbar');
      const button=add(toolbar,'button','PC 상태 조회');button.type='button';button.addEventListener('click',refresh);
      button.setAttribute('aria-controls','student-pc-result');
      const stop=add(toolbar,'button','PC 조회 취소');stop.type='button';stop.addEventListener('click',()=>cancel());
      const status=add(root,'p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const body=add(root,'div');body.setAttribute('id','student-pc-result');refs={root,refresh:button,cancel:stop,status,body};draw();return root;
    },
  };
}

export function createStudentView() {
  const localPc = createLocalPcController();
  // AI 입력은 제공 UI가 검증·정제한다. 추가 필드나 원문 오류는 출력하지 않는다.
  const aiText = value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) return '확인 불가';
    if (/(?:Bearer\s+|sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|token|password|secret|비밀번호|토큰)\s*[:=])/i.test(value)) return '[비밀값 제외]';
    return value;
  };
  const aiLine = (root, text) => {
    const node = document.createElement('p');
    node.textContent = String(text);
    root.appendChild(node);
  };
  const aiFailure = (root, error) => {
    const hints = {
      ON_AI_PROVISIONING_PENDING: '앱 연결·권한 준비 중입니다. 제공 화면의 계정 연결 상태를 확인하고, 담당자에게 앱 권한 발급·AI 게이트 반영을 확인하세요.',
      WB_CLCO_AUTH_REQUIRED: '인증을 확인하지 못했습니다. 제공 화면에서 계정 연결을 다시 확인하세요. Workbench 열쇠를 복사하지 마세요.',
      WB_CLCO_ACCESS_BLOCKED: '접근이 제한됐습니다. 담당자에게 앱 이용 권한을 확인하세요.',
      WB_CLCO_COHORT_BUDGET_EXHAUSTED: '반 사용량이 소진됐습니다. 담당자에게 확인하세요.',
      WB_CLCO_LIMIT_REACHED: '이용 한도에 도달했습니다. 담당자에게 확인하세요.',
      WB_CLCO_SESSION_CLOSED: '현재 이용 시간이 아닙니다. 이용 가능 시간을 확인하세요.',
      WB_CLCO_RATE_LIMITED: '요청 제한입니다. 잠시 뒤 직접 다시 점검하세요.',
      WB_CLCO_TIMEOUT: '요청 시간 초과입니다. 필요하면 직접 다시 점검하세요.',
      REQUEST_TIMEOUT: '요청 시간 초과입니다. 필요하면 직접 다시 점검하세요.',
      ENGINE_TIMEOUT: '확인 시간 초과입니다. 필요하면 직접 다시 점검하세요.',
      TIMEOUT: '요청 시간 초과입니다. 필요하면 직접 다시 점검하세요.',
      WB_CLCO_CANCELLED: '요청이 취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
      REQUEST_CANCELLED: '요청이 취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
      CANCELLED: '요청이 취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
      MODEL_NOT_CONFIGURED: '사용할 모델 설정을 담당자에게 확인하세요.',
      ON_AI_MODEL_LIST_EMPTY: '쓸 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
      ON_AI_AUTHORIZATION_CHANGED: '점검 중 권한이 바뀌었습니다. 담당자에게 현재 권한을 확인하세요.',
      SUBJECT_SCOPE_UNVERIFIED: '현재 계정과 사건의 연결을 확인할 수 없습니다. 계정 연결을 확인하세요.',
      ON_AI_INVALID_INPUT: '사건 근거·규칙 입력을 확인할 수 없습니다. 기존 기록을 확인하세요.',
      ON_AI_INVALID_OUTPUT: 'AI 응답 형식을 확인할 수 없습니다. 기존 기록을 확인하세요.',
      AI_REQUEST_UNVERIFIED: '연결·응답을 확인할 수 없습니다. 네트워크와 계정·앱 권한을 확인하고 필요하면 직접 다시 점검하세요.',
    };
    const known = Object.hasOwn(hints, error?.code);
    const code = known ? error.code : 'AI_REQUEST_UNVERIFIED';
    aiLine(root, `오류 코드: ${code}`);
    aiLine(root, known ? aiText(error.message) : 'AI 연결 또는 응답을 확인할 수 없습니다.');
    aiLine(root, hints[code]);
  };
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      // 매 호출마다 새 DOM을 반환한다. 제공 UI가 이전 표시를 교체하므로 실패 시 옛 신원이 남지 않는다.
      const root = document.createElement('section');
      root.setAttribute('aria-label', '사용자·기기·세션 정보');
      const deviceLabels = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const sessionLabels = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const add = (parent, tag, value) => {
        const node = document.createElement(tag);
        node.textContent = String(value ?? '확인 불가');
        parent.appendChild(node);
        return node;
      };
      const label = (labels, value) => Object.hasOwn(labels, value) ? labels[value] : '확인 불가';
      const row = (parent, name, value) => {
        add(parent, 'dt', name);
        add(parent, 'dd', value);
      };
      const device = (parent, item) => {
        row(parent, '기기 이름', item?.label);
        row(parent, '기기 ID', item?.id);
        const status = Object.hasOwn(deviceLabels, item?.status) ? item.status : 'unknown';
        row(parent, '기기 상태', `${label(deviceLabels, status)}(${status})`);
      };
      const session = (parent, item) => {
        row(parent, '세션 ID', item?.id);
        const status = Object.hasOwn(sessionLabels, item?.status) ? item.status : 'unknown';
        row(parent, '세션 상태', `${label(sessionLabels, status)}(${status})`);
      };
      const resource = (title, input, render) => {
        const section = add(root, 'section', '');
        add(section, 'h3', title);
        const mode = { connected: '연결됨', demo: '예제 자료 · 실제 연결 아님', disconnected: '연결 없음', unknown: '확인 불가' };
        add(section, 'p', label(mode, input?.mode));
        if (input?.status === 'loading') {
          add(section, 'p', '불러오는 중');
        } else if (input?.status === 'error') {
          add(section, 'p', `연결 실패: ${input.error?.message ?? '확인 불가'}`);
        } else if (input?.status === 'ok' && input.data != null) {
          render(section, input.data);
        } else {
          add(section, 'p', '확인 불가');
        }
      };
      resource('현재 로그인', me, (section, data) => {
        const list = add(section, 'dl', '');
        row(list, '사용자 이름', data.user?.label);
        row(list, '사용자 ID', data.user?.id);
        device(list, data.device);
        session(list, data.session);
      });
      resource('내 기기 목록', devices, (section, data) => {
        if (!Array.isArray(data)) { add(section, 'p', '확인 불가'); return; }
        if (data.length === 0) add(section, 'p', '등록된 기기가 없습니다.');
        for (const item of data) device(add(section, 'dl', ''), item);
      });
      resource('내 세션 목록', sessions, (section, data) => {
        if (!Array.isArray(data)) { add(section, 'p', '확인 불가'); return; }
        if (data.length === 0) add(section, 'p', '등록된 세션이 없습니다.');
        for (const item of data) session(add(section, 'dl', ''), item);
      });
      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '업무 앱 접속 판정');
      const add = value => {
        const node = document.createElement('p');
        node.textContent = String(value);
        root.appendChild(node);
      };
      const modes = { connected: '연결됨', demo: '예제 자료 · 실제 연결 아님', disconnected: '연결 없음', unknown: '확인 불가' };
      add(Object.hasOwn(modes, mode) ? modes[mode] : '연결 상태 확인 불가');
      if (appId != null) add(`업무 앱: ${appId}`);
      if (status === 'idle') {
        add('업무 앱을 골라 접속을 요청하세요.');
      } else if (status === 'loading') {
        add('판정 확인 중');
      } else if (status === 'error') {
        add(`요청 실패: ${error?.message ?? '확인 불가'}`);
        add('서버의 접속 판정을 받지 못했습니다. 거부 판정과 다르며 접속 허용을 확인할 수 없습니다.');
      } else if (status === 'ok' && data) {
        const labels = { allow: '허용(allow)', deny: '거부(deny)', challenge: '추가 확인 필요(challenge)', unknown: '확인 불가(unknown)' };
        const decision = Object.hasOwn(labels, data.decision) ? data.decision : 'unknown';
        add(labels[decision]);
        add(`판정 대상 앱: ${data.appId ?? appId ?? '확인 불가'}`);
        add(`이유: ${data.reason ?? '확인 불가'}`);
        add(`확인 시각: ${data.checkedAt ?? '확인 불가'}`);
        if (decision === 'challenge') add('추가 확인 절차가 필요합니다. 이 앱은 확인 절차를 대신 수행하지 않습니다.');
        if (decision === 'unknown') add('접속 허용을 확인할 수 없습니다.');
      } else {
        add('확인 불가(unknown) · 접속 허용을 확인할 수 없습니다.');
      }
      return root;
    },
    renderEvents({ status, mode, data, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '본인 접속·XDR 기록');
      const add = (parent, tag, value = '') => {
        const node = document.createElement(tag);
        node.textContent = String(value);
        parent.appendChild(node);
        return node;
      };
      const modes = { connected: '연결됨', demo: '예제 자료 · 실제 연결 아님', disconnected: '연결 없음', unknown: '확인 불가' };
      add(root, 'p', modes[mode] ?? '연결 상태 확인 불가');
      add(root, 'p', '서버가 현재 사용자 범위로 전달한 최근 기록입니다. XDR 경보는 이미 저장된 기록이며 이 화면에서 새로 탐지하지 않습니다.');
      if (status === 'loading') { add(root, 'p', '기록을 불러오는 중'); return root; }
      if (status === 'error') { add(root, 'p', `기록을 불러오지 못했습니다: ${error?.message ?? '확인 불가'}`); return root; }
      if (status !== 'ok' || !Array.isArray(data)) { add(root, 'p', '기록 확인 불가'); return root; }
      if (data.length === 0) { add(root, 'p', '표시할 기록이 없습니다.'); return root; }
      const events = [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const kinds = { access: '접속 기록', xdr: 'XDR 경보' };
      const access = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
      const sessions = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const devices = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const stateText = (labels, value) => {
        const code = Object.hasOwn(labels, value) ? value : 'unknown';
        return `${labels[code]}(${code})`;
      };
      const controls = add(root, 'div');
      const filter = (name, values) => {
        const label = add(controls, 'label', name);
        const select = add(label, 'select');
        select.setAttribute('aria-label', name);
        for (const [value, text] of [['all', '전체'], ...values]) {
          const option = add(select, 'option', text);
          option.value = value;
        }
        select.value = 'all';
        return select;
      };
      const kindFilter = filter('기록 종류', [...new Set(events.map(e => e.kind))].map(value => [value, `${kinds[value] ?? '확인 불가'}(${value})`]));
      const appFilter = filter('업무 앱', [...new Set(events.map(e => e.appId).filter(value => value != null))].map(value => [value, value]));
      const accessFilter = filter('접속 상태', [...new Set(events.map(e => e.state?.access ?? 'unknown'))].map(value => [value, stateText(access, value)]));
      const list = add(root, 'div');
      const draw = () => {
        list.replaceChildren();
        const filtered = events.filter(event => (kindFilter.value === 'all' || event.kind === kindFilter.value)
          && (appFilter.value === 'all' || event.appId === appFilter.value)
          && (accessFilter.value === 'all' || (event.state?.access ?? 'unknown') === accessFilter.value));
        if (filtered.length === 0) add(list, 'p', '선택한 조건에 맞는 기록이 없습니다.');
        for (const event of filtered) {
          const item = add(list, 'article');
          item.setAttribute('data-student-event-id', event.id);
          add(item, 'h3', `${event.id} · ${event.summary}`);
          add(item, 'p', `시각: ${event.at}`);
          add(item, 'p', `종류: ${kinds[event.kind] ?? '확인 불가'}(${event.kind})`);
          add(item, 'p', `업무 앱: ${event.appId ?? '앱 확인 불가'}`);
          const button = add(item, 'button', `${event.id} 상세`);
          button.type = 'button';
          button.setAttribute('aria-expanded', 'false');
          const slot = add(item, 'div');
          button.addEventListener('click', () => {
            const open = button.getAttribute('aria-expanded') !== 'true';
            button.setAttribute('aria-expanded', String(open));
            slot.replaceChildren();
            if (!open) return;
            const detail = add(slot, 'section');
            detail.setAttribute('data-student-event-detail', event.id);
            add(detail, 'h4', `사건 ID: ${event.id}`);
            add(detail, 'p', `업무 앱: ${event.appId ?? '앱 확인 불가'}`);
            add(detail, 'h4', '근거');
            for (const row of event.evidence ?? []) add(detail, 'p', `${row.id}: ${row.text}`);
            if (!event.evidence?.length) add(detail, 'p', '제공된 근거가 없습니다.');
            add(detail, 'h4', '규칙');
            for (const row of event.rules ?? []) add(detail, 'p', `${row.id}: ${row.text}`);
            if (!event.rules?.length) add(detail, 'p', '제공된 규칙이 없습니다.');
            add(detail, 'p', `접속 상태: ${stateText(access, event.state?.access)}`);
            add(detail, 'p', `세션 상태: ${stateText(sessions, event.state?.session)}`);
            add(detail, 'p', `기기 상태: ${stateText(devices, event.state?.device)}`);
            for (const action of event.supportedActions ?? []) {
              const unsupported = add(detail, 'button', `${action} 미지원`);
              unsupported.type = 'button';
              unsupported.disabled = true;
              add(detail, 'p', '아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중입니다.');
            }
          });
        }
      };
      for (const select of [kindFilter, appFilter, accessFilter]) select.addEventListener('change', draw);
      draw();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '기기·세션·알림과 도움정보');
      const pcLink = document.createElement('a');
      pcLink.href = '#student-local-pc';
      pcLink.textContent = '내 PC 상태·연결 기록으로 이동';
      root.appendChild(pcLink);
      const add = (parent, tag, value = '') => {
        const node = document.createElement(tag);
        node.textContent = String(value);
        parent.appendChild(node);
        return node;
      };
      const safe = value => {
        if (typeof value !== 'string' || !value.trim() || value.length > 2000) return '확인 불가';
        if (/(?:Bearer\s+|sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|token|password|secret|비밀번호|토큰)\s*[:=])/i.test(value)) return '[비밀값 제외]';
        return value;
      };
      const modes = { connected: '연결됨', demo: '예제 자료 · 실제 연결 아님', disconnected: '연결 없음', unknown: '확인 불가' };
      const modeText = value => Object.hasOwn(modes, value) ? modes[value] : modes.unknown;
      const deviceLabels = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const sessionLabels = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const statusText = (labels, value) => {
        const code = Object.hasOwn(labels, value) ? value : 'unknown';
        return `${labels[code]}(${code})`;
      };
      const failure = (parent, name, resource) => {
        add(parent, 'p', `${name}을 불러오지 못했습니다: ${safe(resource?.error?.message)}`);
        if (/TIMEOUT|TIME_OUT/i.test(resource?.error?.code ?? '') || /시간.*초과|timeout/i.test(resource?.error?.message ?? '')) add(parent, 'p', '요청 시간 초과로 현재 상태를 확인할 수 없습니다.');
        add(parent, 'p', '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.');
      };
      add(root, 'p', modeText(mode));
      const resources = [
        ['기기 목록', devices, '등록된 기기가 없습니다.', (list, row) => add(list, 'li', `${safe(row.label)} · ${safe(row.id)} · ${statusText(deviceLabels, row.status)}`)],
        ['현재 세션', sessions, '현재 연결이 없습니다.', (list, row) => add(list, 'li', `${safe(row.id)} · ${statusText(sessionLabels, row.status)}`)],
      ];
      for (const [name, resource, empty, render] of resources) {
        const section = add(root, 'section');
        add(section, 'h3', name);
        add(section, 'p', modeText(resource?.mode));
        if (name === '현재 세션') add(section, 'p', '현재 검증된 연결 하나의 상태입니다. 지난 세션 목록은 제공되지 않습니다.');
        if (resource?.status === 'loading') add(section, 'p', `${name} 불러오는 중`);
        else if (resource?.status === 'error') failure(section, name, resource);
        else if (resource?.status === 'ok' && Array.isArray(resource.data)) {
          if (resource.data.length === 0) add(section, 'p', empty);
          else {
            const list = add(section, 'ul');
            for (const row of resource.data) render(list, row);
          }
        } else add(section, 'p', `${name} 확인 불가`);
      }
      const alerts = add(root, 'section');
      add(alerts, 'h3', '보안 알림');
      if (!Array.isArray(notifications)) add(alerts, 'p', '알림 확인 불가');
      else if (notifications.length === 0) add(alerts, 'p', '주의할 알림이 없습니다.');
      else {
        const list = add(alerts, 'ul');
        for (const notification of notifications) add(list, 'li', `자료: ${safe(notification.resource)} · 코드: ${safe(notification.code)} · ${safe(notification.message)}`);
      }
      const help = add(root, 'section');
      add(help, 'h3', '도움정보');
      add(help, 'p', modeText(diagnostics?.mode));
      add(help, 'p', '도움 요청에 사용할 공개 점검 정보만 복사합니다. 사용자가 누를 때만 복사하며 자동 전송하지 않습니다.');
      let summary = null;
      if (diagnostics?.status === 'ok' && diagnostics.data) {
        const data = diagnostics.data;
        add(help, 'p', '도움정보는 아래 확인 시각의 별도 점검 결과입니다. 현재 연결 상태를 보장하지 않습니다.');
        // 허용된 여섯 필드만 선택한다. 서버 응답 전체나 추가 필드는 표시·복사하지 않는다.
        summary = {
          requestId: safe(data.requestId), component: safe(data.component), version: safe(data.version),
          checkedAt: safe(data.checkedAt),
          engine: { mode: Object.hasOwn(modes, data.engine?.mode) ? data.engine.mode : 'unknown', code: safe(data.engine?.code) },
        };
        for (const key of ['requestId', 'component', 'version', 'checkedAt']) add(help, 'p', `${key}: ${summary[key]}`);
        add(help, 'p', `engine.mode: ${modeText(summary.engine.mode)}(${summary.engine.mode})`);
        add(help, 'p', `engine.code: ${summary.engine.code}`);
      } else if (diagnostics?.status === 'loading') add(help, 'p', '도움정보 불러오는 중');
      else if (diagnostics?.status === 'error') {
        failure(help, '도움정보', diagnostics);
        add(help, 'p', '도움정보는 제공 화면의 도움정보 불러오기 버튼을 직접 눌러 다시 확인하세요.');
      } else add(help, 'p', '도움정보 점검 전입니다. 제공 화면의 도움정보 불러오기 버튼을 직접 누르세요.');
      const copy = add(help, 'button', '도움정보 복사');
      copy.type = 'button';
      copy.disabled = summary === null;
      const copyResult = add(help, 'p');
      copyResult.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', async () => {
        if (summary === null) return;
        try {
          if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE');
          await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
          copyResult.textContent = '도움 요청에 사용할 공개 도움정보를 복사했습니다.';
        } catch {
          copyResult.textContent = '도움정보를 복사하지 못했습니다. 화면의 공개 점검 정보를 확인하세요.';
        }
      });
      root.appendChild(localPc.render(mode));
      return root;
    },
    renderVulnerabilities({ status = 'idle', mode, data, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '설치 패키지와 OSV 조회 결과');
      if (mode === 'demo') aiLine(root, '예제 자료 · 실제 연결 아님');
      if (status === 'idle' || status === 'loading') {
        aiLine(root, status === 'idle' ? '패키지 조회 전(idle)' : '패키지 조회 중(loading)');
        return root;
      }
      if (status === 'error') {
        const codes = ['CANCELLED', 'REQUEST_CANCELLED', 'TIMEOUT', 'REQUEST_TIMEOUT', 'CONTRACT_MISMATCH',
          'SERVICE_UNAVAILABLE', 'HOST_REJECTED', 'ORIGIN_REJECTED', 'REQUEST_INVALID'];
        const known = codes.includes(error?.code);
        aiLine(root, `조회 실패: ${known ? error.code : 'CONTRACT_MISMATCH'}`);
        aiLine(root, known ? aiText(error.message) : '패키지 조회 응답을 확인할 수 없습니다.');
        aiLine(root, '이전 결과는 현재 조회 결과가 아닙니다. 취소·오류 뒤에는 제공 화면의 설치 패키지 조회 버튼을 직접 눌러 다시 조회하세요.');
        return root;
      }
      const scans = { complete: '모두 조회', partial: '일부 조회 실패', not_checked: '아직 조회 안 함',
        not_configured: '조회 준비 미완료', unverifiable: 'lock 파일 확인 불가' };
      const packages = { known_vulnerabilities: '알려진 항목 있음', none_found: '알려진 항목 없음', unverifiable: '조회 확인 불가' };
      const safe = value => typeof value === 'string' && value.trim() && aiText(value) === value && !/[\u0000-\u001f\u007f]/.test(value);
      const time = value => safe(value) && Number.isFinite(Date.parse(value));
      const source = 'https://api.osv.dev/v1/querybatch';
      const installed = value => safe(value) && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
      const validRow = row => row && safe(row.name) && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(row.name)
        && installed(row.version) && Object.hasOwn(packages, row.status) && row.source === source && time(row.checkedAt)
        && Array.isArray(row.vulnerabilities) && row.vulnerabilities.every(finding => finding && safe(finding.id)
          && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(finding.id) && time(finding.modified))
        && (row.status !== 'none_found' || row.vulnerabilities.length === 0)
        && (row.status !== 'known_vulnerabilities' || row.vulnerabilities.length > 0);
      const lockRequired = ['complete', 'partial', 'not_checked'].includes(data?.status);
      if (status !== 'ok' || !data || !Object.hasOwn(scans, data.status) || !time(data.checkedAt)
        || !Array.isArray(data.packages) || data.packages.length > 256 || !data.packages.every(validRow)
        || (lockRequired && (![2, 3].includes(data.lockfileVersion) || !/^[0-9a-f]{64}$/.test(data.lockfileHash)))) {
        aiLine(root, '조회 결과 확인 불가. 설치 버전·출처·조회 상태를 확인할 수 없어 현재 결과를 표시하지 않습니다.');
        return root;
      }
      aiLine(root, `${scans[data.status]}(${data.status})`);
      if ([2, 3].includes(data.lockfileVersion)) aiLine(root, `lockfileVersion: ${data.lockfileVersion}`);
      if (typeof data.lockfileHash === 'string' && /^[0-9a-f]{64}$/.test(data.lockfileHash)) aiLine(root, `lockfileHash: ${data.lockfileHash}`);
      aiLine(root, `전체 조회 시각: ${data.checkedAt}`);
      if (data.packages.length === 0) aiLine(root, '표시할 패키지 조회 결과가 없습니다. 미설정·미조회·확인 불가는 안전 판정이 아닙니다.');
      for (const item of data.packages) {
        const row = document.createElement('article');
        row.setAttribute('data-student-package-name', item.name);
        row.setAttribute('data-student-package-version', item.version);
        aiLine(row, `패키지: ${item.name}`);
        aiLine(row, `정확한 설치 버전: ${item.version}`);
        aiLine(row, `${item.status === 'unverifiable' && item.vulnerabilities.length > 0
          ? '일부 확인·전체 조회 확인 불가' : packages[item.status]}(${item.status})`);
        aiLine(row, `출처: ${item.source}`);
        aiLine(row, `패키지 조회 시각: ${item.checkedAt}`);
        for (const finding of item.vulnerabilities) aiLine(row, `취약점 ID: ${finding.id} · 수정 시각: ${finding.modified}`);
        root.appendChild(row);
      }
      aiLine(root, '이 결과는 조회 시점의 공개 승인 패키지 범위입니다. 모든 취약점이나 시스템 전체의 안전을 보증하지 않습니다.');
      return root;
    },
    renderAiConnection({ status, mode, data, error, checkedAt } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', 'AI 연결 점검 결과');
      const modes = { connected: '연결된 서버 응답', demo: '예제 자료 · 실제 연결 아님', disconnected: '연결 없음', unknown: '연결 상태 확인 불가' };
      aiLine(root, Object.hasOwn(modes, mode) ? modes[mode] : modes.unknown);
      if (status === 'idle') aiLine(root, 'AI 연결 점검 전');
      else if (status === 'loading') aiLine(root, 'AI 연결 점검 중');
      else if (status === 'error') aiFailure(root, error);
      else if (status === 'ok' && data?.transportChecked === true
        && ['test', 'verified'].includes(data.audienceAuthorization)
        && Number.isInteger(data.modelCount) && data.modelCount >= 0 && data.modelCount <= 10000) {
        aiLine(root, data.audienceAuthorization === 'test' ? '시험 연결 점검(test)' : '앱 권한 확인 후 점검(verified)');
        aiLine(root, `모델 수: ${data.modelCount}`);
        aiLine(root, `확인 시각: ${aiText(checkedAt)}`);
        aiLine(root, '모델 목록 연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다.');
        if (data.audienceAuthorization === 'test') aiLine(root, '시험 응답은 실제 앱 이용 권한이나 사건 설명 호출의 성공을 뜻하지 않습니다.');
      } else aiLine(root, 'AI 연결 점검 결과 확인 불가');
      aiLine(root, '다시 점검하려면 제공 화면의 AI 연결 점검 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '사건 AI 설명');
      // 제공 UI가 새 DOM으로 교체한다. 비성공 상태에는 과거 요약·성공 표식을 옮기지 않는다.
      // 근거 부족 등으로 제공 UI가 event:null을 보내도 안전한 실패 원인이 먼저 보인다.
      if (explanation?.status === 'error') {
        aiLine(root, 'AI 설명 실패');
        aiFailure(root, explanation.error);
        if (explanation.error?.code === 'ON_AI_INVALID_OUTPUT') aiLine(root, '근거가 맞지 않거나 AI가 이미 실행했다고 답한 설명은 사용할 수 없습니다.');
        aiLine(root, '기존 기록은 그대로입니다. AI 연결·응답 문제는 과제 실패를 뜻하지 않습니다.');
        return root;
      }
      if (!event) {
        aiLine(root, '보안 기록에서 기록을 먼저 고르세요.');
        return root;
      }
      if (explanation?.status !== 'ok') {
        aiLine(root, explanation?.status === 'loading'
          ? '선택한 사건 설명을 요청 중입니다. 기존 기록은 그대로입니다.'
          : !explanation || explanation.status === 'idle'
            ? '사건 설명 요청 전입니다. 선택한 기록에서 직접 설명을 요청하세요.'
            : '사건 설명 결과 확인 불가. 기존 기록은 그대로입니다.');
        return root;
      }
      const reject = reason => {
        aiLine(root, 'AI 설명을 사용할 수 없습니다.');
        aiFailure(root, { code: 'ON_AI_INVALID_OUTPUT', message: reason });
        aiLine(root, '기록은 그대로입니다. 근거를 지어내거나 제안을 실행하지 않습니다.');
        return root;
      };
      const readable = value => typeof value === 'string' && value.trim().length > 0
        && aiText(value) === value && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
      const id = value => readable(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value);
      const rows = value => Array.isArray(value) && value.length > 0 && value.length <= 20
        && value.every(row => row && id(row.id) && readable(row.text))
        && new Set(value.map(row => row.id)).size === value.length;
      const states = { access: ['allowed', 'denied', 'unknown'], session: ['active', 'expired', 'revoked', 'unknown'], device: ['compliant', 'noncompliant', 'unknown'] };
      if (!id(event.id) || !rows(event.evidence) || !rows(event.rules)
        || !Array.isArray(event.supportedActions) || !event.supportedActions.every(id)
        || !Object.entries(states).every(([key, values]) => values.includes(event.state?.[key]))) {
        return reject('사건 근거·규칙 자료가 없거나 사건 ID·현재 상태를 확인할 수 없습니다.');
      }
      const data = explanation.data;
      const evidence = new Map(event.evidence.map(row => [row.id, row.text]));
      const refs = value => Array.isArray(value) && value.length > 0
        && new Set(value).size === value.length && value.every(ref => id(ref) && evidence.has(ref));
      if (!data || !readable(data.summary) || !refs(data.evidenceIds) || data.evidenceIds.length !== evidence.size) {
        return reject('근거가 맞지 않거나 부족합니다. 현재 사건의 모든 근거 ID와 설명을 확인할 수 없습니다.');
      }
      if (data.executed !== false || data.requiresHumanConfirmation !== true) {
        return reject('AI가 이미 실행했다고 답했거나 사람 확인·미실행 상태를 확인할 수 없어 설명을 사용할 수 없습니다.');
      }
      if (!Array.isArray(data.proposals) || data.proposals.length > 3
        || !data.proposals.every(proposal => proposal && id(proposal.action)
          && event.supportedActions.includes(proposal.action) && refs(proposal.evidenceIds) && readable(proposal.reason))) {
        return reject('제안의 지원 조치·근거·이유가 현재 사건과 맞지 않아 설명을 사용할 수 없습니다.');
      }
      root.setAttribute('data-student-explanation-event', event.id);
      const heading = document.createElement('h3');
      heading.textContent = 'AI 설명(참고용)';
      root.appendChild(heading);
      aiLine(root, `사건 ID: ${event.id}`);
      if (explanation.mode === 'demo') aiLine(root, '예제 자료 · 실제 연결 아님');
      aiLine(root, data.summary);
      aiLine(root, 'AI 설명은 해석입니다. 사실 판단은 인용한 근거와 원천이 알려 준 현재 상태를 기준으로 하세요.');
      aiLine(root, `확인 시각: ${aiText(checkedAt)}`);
      aiLine(root, '인용한 근거');
      for (const ref of data.evidenceIds) aiLine(root, `${ref} — ${evidence.get(ref)}`);
      aiLine(root, '현재 규칙');
      for (const rule of event.rules) aiLine(root, `${rule.id} — ${rule.text}`);
      aiLine(root, '확인되지 않은 현재 상태');
      const names = { access: '접속', session: '세션', device: '기기' };
      const unknown = Object.keys(names).filter(key => event.state[key] === 'unknown');
      for (const key of unknown) aiLine(root, `${names[key]}: 확인 불가(unknown)`);
      if (unknown.length === 0) aiLine(root, '없음');
      aiLine(root, '조치 제안');
      if (data.proposals.length === 0) aiLine(root, event.supportedActions.length === 0
        ? '원천이 지원하는 조치가 없어 제안이 없습니다(정상).'
        : 'AI가 제안한 조치가 없습니다. 근거를 보고 담당자와 판단하세요.');
      for (const proposal of data.proposals) {
        aiLine(root, `${proposal.action} — ${proposal.reason}`);
        aiLine(root, `제안 근거: ${proposal.evidenceIds.join(', ')}`);
      }
      aiLine(root, '제안은 사람 확인이 필요하며 실행되지 않았습니다. AI 설명은 기존 기록을 바꾸지 않습니다.');
      return root;
    },
    renderAction({ status = 'idle', event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '조치 요청 상태와 관측 결과');
      const id = value => typeof value === 'string' && aiText(value) === value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
      const time = value => typeof value === 'string' && aiText(value) === value && Number.isFinite(Date.parse(value));
      const labels = {
        idle: '아직 미실행(idle). AI 제안만으로 조치가 실행되지는 않습니다.',
        loading: '조치 준비 또는 결과 조회 중(loading). 결과를 기다립니다.',
        prepared: '준비됨·미실행(prepared). 실제 대상과 확인 기한을 읽고 사람 확인이 필요합니다.',
        executing: '서버에 전달 중(executing). 처리 결과를 기다립니다.',
        pending: '서버 접수·처리 중(pending). 접수 응답(ACK)은 효과 확인이 아닙니다.',
        succeeded: '효과 확인(succeeded). 연동 시스템에서 조회한 관측 결과입니다.',
        denied: '거절(denied). 연동 시스템이 조치를 거절했습니다.',
        failed: '실패(failed). 연동 시스템에서 실패를 반환했습니다.',
        expired: '확인 기한 지남(expired). 제공 화면에서 다시 준비하세요.',
        error: '요청 처리 안 됨(error). 안전한 오류와 연결 상태를 확인하세요.',
        unknown: '결과 불명(unknown). 성공 또는 효과 없음으로 단정할 수 없습니다. 제공 화면에서 결과만 직접 재조회하세요.',
      };
      const bound = id(event?.id) && (!receipt?.eventId || receipt.eventId === event.id)
        && (!receipt?.actionId || receipt.actionId === actionId);
      let current = Object.hasOwn(labels, status) ? status : 'unknown';
      if (receipt && !bound) current = 'unknown';
      if (current === 'succeeded' && !(observation?.effectApplied === true && time(observation.observedAt)
        && id(receipt?.receiptId) && id(receipt?.requestId) && bound)) current = 'unknown';
      aiLine(root, labels[current]);
      if (current === 'idle') {
        aiLine(root, '조치 준비·집행·결과 조회는 제공 화면에서 직접 조작합니다. 이 학생 영역은 요청을 전송하지 않습니다.');
        if (typeof message === 'string' && message.trim()) aiLine(root, aiText(message));
        return root;
      }
      if (bound) {
        aiLine(root, `사건 ID: ${event.id}`);
        for (const row of Array.isArray(event.evidence) ? event.evidence : []) if (id(row?.id)) aiLine(root, `근거 ID: ${row.id}`);
        if (id(actionId)) aiLine(root, `조치 ID: ${actionId}`);
        if (id(target?.id)) aiLine(root, `실제 대상 ID: ${target.id}`);
        if (Number.isSafeInteger(target?.generation) && target.generation > 0) aiLine(root, `대상 세대(generation): ${target.generation}`);
        if (id(receipt?.requestId)) {
          root.setAttribute('data-student-action-event', event.id);
          root.setAttribute('data-student-action-request', receipt.requestId);
          aiLine(root, `요청 ID(requestId): ${receipt.requestId}`);
        }
        if (id(receipt?.receiptId)) aiLine(root, `접수 ID(receiptId): ${receipt.receiptId}`);
        if (Number.isSafeInteger(receipt?.version) && receipt.version > 0) aiLine(root, `접수 버전(version): ${receipt.version}`);
        if (current === 'prepared' || current === 'expired') aiLine(root, `확인 기한: ${time(confirmationExpiresAt) ? confirmationExpiresAt : '확인 불가'}`);
      } else if (receipt) aiLine(root, '사건·조치와 접수 정보가 맞지 않아 이전 대상이나 결과를 표시하지 않습니다.');
      if (current === 'succeeded') {
        aiLine(root, `관측 시각: ${observation.observedAt}`);
        aiLine(root, 'effectApplied: true');
      }
      if (['denied', 'failed', 'expired'].includes(current) && typeof message === 'string' && message.trim()) aiLine(root, aiText(message));
      if (current === 'error') {
        const codes = ['ACTION_UNSUPPORTED', 'ACTION_DENIED', 'ACTION_INPUT_INVALID', 'ACTION_CONFIRMATION_EXPIRED',
          'ACTION_CONFIRMATION_INVALID', 'ACTION_SCOPE_CHANGED', 'ACTION_SCOPE_UNVERIFIED', 'SUBJECT_SCOPE_UNVERIFIED',
          'ACTION_SNAPSHOT_CHANGED', 'ACTION_EVENT_UNAVAILABLE', 'ACTION_TIMEOUT', 'ACTION_CANCELLED',
          'ACTION_STORE_FAILED', 'ACTION_RESULT_UNVERIFIED', 'REQUEST_TIMEOUT', 'REQUEST_CANCELLED', 'CANCELLED', 'SERVICE_UNAVAILABLE'];
        const known = codes.includes(error?.code);
        aiLine(root, `오류 코드: ${known ? error.code : 'ACTION_RESULT_UNVERIFIED'}`);
        aiLine(root, known ? aiText(error.message) : '조치 처리 결과를 확인할 수 없습니다.');
      }
      if (Array.isArray(event?.supportedActions) && event.supportedActions.length === 0) aiLine(root, '연동 시스템이 지원하는 조치가 없어 준비·집행 버튼이 없는 것이 정상입니다.');
      aiLine(root, '새 집행 요청을 자동으로 보내지 않습니다. 조치 화면 취소는 이미 전달된 효과를 되돌리는 기능이 아닙니다.');
      return root;
    },
  };
}
