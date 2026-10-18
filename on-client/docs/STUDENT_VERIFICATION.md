# 학생 구현 검증 기록

## 13단계 · 2026-10-19

- 원본: 공식 alekov-starter-0.2.11. 기존 1~12단계 앱에 `on-client/`를 추가했다. 제공 서버·공통 UI·인증 코드는 수정하지 않았다.
- 구현: `student/extension.mjs`의 `renderIdentity`만 구현했다. 세 자원별 loading/ok/error와 connected/demo/disconnected/unknown을 구분하고 모든 문자열을 textContent로 표시한다. 매 호출 새 DOM을 반환하며 제공 UI의 replaceChildren으로 이전 신원이 제거된다.
- Node v24.15.0에서 `npm run check` 통과. 시작 틀 권장 버전 24.19.0과 다르지만 아래 실행은 실제로 확인했다.
- PC Chrome 예제 서버에서 사용자·기기·세션 값/ID, 예제 자료 표시, 세 메뉴 마우스 이동, Tab·Enter 및 방향키 이동, 다시 불러오기를 확인했다.
- 같은 페이지에서 예제 서버를 중단한 뒤 다시 불러오기를 눌렀다. 세 학생 영역에 연결 실패와 서버 오류 메시지가 나타났고 이전 연습 사용자·기기·세션 값이 사라졌다.
- 별도 학습 기록 저장소의 합성 DOM 시험 4개 통과: 사용자 A→B→오류 교체, 모든 기기/세션 상태, 자원별 loading/error와 모든 모드, HTML 모양 label/error의 문자 표시. 합성 입력은 운영 신원이나 연결 성공의 근거가 아니다.
- 실제 회사 엔진·실제 사용자 신원 연결은 미검증. 공식 AI 원문 판정은 제출 후 별도로 확인한다.

실행: 이 폴더의 상위 `on-client`에서 `node src/server.mjs --demo` 후 http://127.0.0.1:5189/ 접속. 기본 연결 없음 확인은 `node src/server.mjs`. 종료는 실행 터미널의 Ctrl+C.
