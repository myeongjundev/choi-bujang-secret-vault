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
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
