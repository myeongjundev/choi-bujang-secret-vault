// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
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
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
