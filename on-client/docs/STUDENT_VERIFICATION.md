# 학생 구현 검증 기록

## 13단계 · 2026-10-19

- 원본: 공식 alekov-starter-0.2.11. 기존 1~12단계 앱에 `on-client/`를 추가했다. 제공 서버·공통 UI·인증 코드는 수정하지 않았다.
- 구현: `student/extension.mjs`의 `renderIdentity`만 구현했다. 세 자원별 loading/ok/error와 connected/demo/disconnected/unknown을 구분하고 모든 문자열을 textContent로 표시한다. 매 호출 새 DOM을 반환하며 제공 UI의 replaceChildren으로 이전 신원이 제거된다.
- Node v24.15.0에서 `npm run check` 통과. 시작 틀 권장 버전 24.19.0과 다르지만 아래 실행은 실제로 확인했다.
- PC Chrome 예제 서버에서 사용자·기기·세션 값/ID, 예제 자료 표시, 세 메뉴 마우스 이동, Tab·Enter 및 방향키 이동, 다시 불러오기를 확인했다.
- 같은 페이지에서 예제 서버를 중단한 뒤 다시 불러오기를 눌렀다. 세 학생 영역에 연결 실패와 서버 오류 메시지가 나타났고 이전 연습 사용자·기기·세션 값이 사라졌다.
- 별도 학습 기록 저장소의 합성 DOM 시험 4개 통과: 사용자 A→B→오류 교체, 모든 기기/세션 상태, 자원별 loading/error와 모든 모드, HTML 모양 label/error의 문자 표시. 합성 입력은 운영 신원이나 연결 성공의 근거가 아니다.
- 실제 회사 엔진·실제 사용자 신원 연결은 미검증. 공식 AI 원문 판정은 제출 후 별도로 확인한다.

13단계 첫 원문 판정은 상태의 원래 코드 표시 누락으로 4/5였다. 한국어 설명 옆에 compliant/noncompliant/unknown 및 active/expired/revoked/unknown을 함께 표시하도록 보완했고, 합성 시험도 이 원래 코드 표시를 확인하도록 강화했다. 수정본을 재제출했으며 결과는 별도 확인한다.

## 14단계 · 2026-10-19

- `renderDecision`을 구현하고 13단계 함수를 보존했다. idle/loading/ok/error 분기, 한국어+원래 판정 코드, reason/checkedAt/appId, 예제·연결 모드를 표시한다.
- unknown과 예상 밖 판정은 확인 불가(unknown), 오류는 요청 실패이며 서버의 거부 판정과 다름을 표시한다. 실패·재조회 시 이전 허용/사유를 지운다.
- 합성 시험 2개 추가, 13단계 포함 전체 6개 통과. 네 판정·예상 밖 코드·HTML 모양 reason·허용→오류/idle/loading 전환을 확인했다.
- PC Chrome 예제 서버의 세 업무 앱으로 허용/거부/추가 확인, 키보드 Enter 요청, 이유/시각 표시를 확인했다. 다시 불러오기 후 이전 판정이 지워져 앱 선택 안내로 돌아왔다.
- 같은 페이지에서 서버 중단 후 앱 요청을 눌러 요청 실패와 거부 판정 구분을 확인했다. unknown 판정은 합성 입력으로 확인했으며 예제 서버 세 앱은 allow/deny/challenge를 반환한다.
- 실제 운영 앱 접속이나 추가 확인 절차는 실행하지 않았다. 원문 AI 판정은 별도로 확인한다.

실행: 이 폴더의 상위 `on-client`에서 `node src/server.mjs --demo` 후 http://127.0.0.1:5189/ 접속. 기본 연결 없음 확인은 `node src/server.mjs`. 종료는 실행 터미널의 Ctrl+C.
