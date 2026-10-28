# BYTE BACK 자료실 · 케셰브 PC 점검

## 현재 실행 안내 · 2026-10-28

케셰브 PC 점검의 처음 실행 방법은 **[START_HERE](on-client/student/START_HERE.md)**를 읽습니다. Windows·Node 24.19.0에서 외부 npm 의존성 없이 실행합니다.

~~~powershell
cd on-client
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1
~~~

브라우저 주소는 **http://127.0.0.1:5189/student/pc** 입니다. 공식 도구가 계정 연결용 개인 설정을 준비한 같은 서버에서 PC 조회를 제공합니다. 로그인·AI 승인은 화면에서 직접 진행합니다. 원래 보안 화면은 http://127.0.0.1:5189/ 입니다. 숫자는 실제 로컬 관측이며 SDP·AI·조치 집행의 성공과 별개입니다. 휴대형 Node·대체 포트는 START_HERE를 따릅니다.

4~6일차의 제공/학생 경계·검증 범위는 [DAY456](on-client/student/DAY456.md), 실제 수집 방식은 [DAY23](on-client/student/DAY23.md)를 따릅니다. 최신 과정 안내의 6일차는 **포장 없이 GitHub 저장소와 40자리 커밋 준비**입니다. package-app·업데이트 도구·새 포장 스크립트는 이번 작업에 사용하지 않습니다.

배포: https://choi-bujang-secret-vault-sigma.vercel.app

저장소: https://github.com/myeongjundev/choi-bujang-secret-vault

## 케셰브 보안 Agent · 13~22단계 학생 안내

`on-client/`는 직원이 자기 로그인·기기·세션, 업무 앱 판정, 접속·XDR 기록을 확인하는 로컬 보안 앱이다. 학생 화면 8개 함수에는 AI 참고 설명·조치 처리 상태·정확한 패키지 버전과 OSV 결과 표시도 포함한다. 학생 구현은 **v0.9 검증 중**, 현재 제공 시작 틀은 0.2.14다. 2026-10-24에 13~22단계 코드 원문 검토를 모두 통과했으며 실제 운영 연결·조치 실행은 미확인이다.

제공 package.json의 선언 지원 버전은 Node 24.19.0 한 버전이다. 2026-10-28에는 공식 해시를 대조한 Node 24.19.0으로 학생 문법·51개 시험·실제 PC 7항목 조회를 확인했다. 이전 Node 24.15.0 기록은 당시 선언 범위 밖의 참고 관측이다. 다른 OS/PC·설치형 host·실제 회사 서버 연결은 미검증이다. 이 저장소 최상위의 PowerShell에서 `npm --prefix on-client run check`, `node --test "on-client/student/tests/*.test.mjs"`, `node on-client/src/server.mjs`를 실행한다. 브라우저 주소는 http://127.0.0.1:5189/ 이다. 기본 실행은 연결 없음이며 예제 실행은 `node on-client/src/server.mjs --demo`다. 종료는 실행 터미널의 Ctrl+C다.

설치·폴더 구조·실행·종료·재시작·구성도·제공/학생 경계·오류별 확인 순서는 [학생 설명서](on-client/docs/STUDENT_GUIDE.md), 동일 소스의 새 복제 결과는 [새 폴더 재현 기록](on-client/docs/STUDENT_CLEAN_REPRODUCTION.md), 버전·미확인 범위는 [학생 버전 기록](on-client/student/RELEASE.md)을 읽는다. 로컬 앱은 외부 npm 의존성이 없다.

아래 기존 자료실 설명과 npm ci·Vercel 절차는 1~12단계 자료실의 기록이다. 기존 자료실·DB·인증 설정·성취 기록은 보존한다.

## 출처

| 출처 | 담당 구성 요소 |
| --- | --- |
| 학생이 만든 것 | 학생 판정기(src/decider.mjs), 탐지 규칙(src/detect.mjs), 접속 앱 화면(public/), 자료실 서버 함수(api/), 사본 검증·한 건 복구, 작전실, 점검 코드, XDR 판정 |
| 제공 엔진 | ALEPH SDP 엔진. 로그인·기기 결합, 기기 키, 요청 서명 검증, 판정기 호출과 집행, 회수, 감사 보관을 담당한다. 운영 연결은 현재 미제공·미검증이다. |

제공 엔진: ALEPH SDP 엔진

학생 작업: 학생 판정기, 탐지 규칙, 접속 앱, 자료실 API, 작전실, 고정 가상 규칙 시험.

## 현재 점검 범위

회귀시험의 기본 계획도 실제 계획과 같은 미실행 상태를 사용한다. 결과 라벨이 바뀐 한 항목을 별도로 주입해 계획의 입력 라벨이 실행 기록과 집계에 영향을 주지 않는지 검증한다.

화면의 미실행 표시는 실제 status=not_run에만 사용한다. 값이 없는 칸은 —로 표시하고, 실제 HTTP 행의 별도 가상 계산 칸은 해당 없음이다. HTTP 기대 결과 일치 행에 미실행 표시를 섞지 않는다.

| 목록 | 총 항목 | 기대 조건 일치 | 불일치 | 미실행 |
| --- | ---: | ---: | ---: | ---: |
| 제출 점검 | 12 | 10 | 0 | 2 |

제출 점검의 실측 10건은 실제 HTTP 거부 6건과 학생 서버의 고정 가상 규칙 ready 응답 4건이다. 4단계의 무인증 타인 메모 한 건 조회를 실제 GET으로 함께 점검한다. 복원 POST와 서명 없는 수정 PUT은 GET/HEAD 전용 제출 점검에서 보내지 않아 각각 observed와 result가 not_run이다. 공식 41종 전체는 심판이 보내며 학생 점검에서는 실행하지 않았다. 표에 없는 공격을 통과로 주장하지 않는다. 로컬 계획 파일은 미실행 상태로 보존하고 공개 실행 API와 표에는 넣지 않는다. 로컬 가상 계산의 기대 조건 일치는 localMatchesExpected 불리언과 별도 matched/mismatched 수치로 기록한다.

학생 서버의 고정 가상 규칙은 정해진 가상 입력으로 판정기·탐지기를 실행한다. ready는 그 기대 조건의 일치 여부다. 제공 엔진의 실제 기기 승인과 회수는 미실행이다. 실제 점검의 실패 응답은 breached, 요청·응답을 받지 못한 항목은 not_run으로 기록한다.

고정 가상 응답에는 caseId, 학생 구성 요소 source, engine(ALEPH SDP 엔진), engineEnforced(not_run)를 함께 표시한다. ready=true는 가상 조건 일치이며 엔진 집행 상태를 바꾸지 않는다. 요약의 sources와 recordSource는 이 출처를 표시하고 attempts는 제출과 같은 다섯 필드의 점검 행이다.

제출 JSON은 공식 제출 계약의 attackAttempts 한 배열에 이번 점검만 기록한다. /api/checks는 같은 점검 함수의 새 HTTP 응답으로 네 수치를 계산하고 attempts 한 배열에 같은 다섯 필드 행을 둔다. /operations.html은 제출 점검, 보조 HTTP 관측, 로컬 가상 계산, 운영 세션 대기를 각각 다른 표로 표시한다. 공식 41종 계획은 설명으로만 표시한다. 숫자는 실행 시 응답에 따라 변한다.

src/attack-check.mjs는 import 없는 독립 점검 파일이다. 공개 URL 또는 설정 객체를 받아 실제 GET 관측만 기록한다. 환경파일·설정파일·판정기 모듈에 의존하지 않으며 판정기·탐지기의 고정 시험도 실제 /api/checks?case=… 응답을 읽는다. 원본 익명 읽기는 공개 인증 설정의 HTTPS 출처와 설정의 원본 주소를 대조한 뒤 수행한다.

첫 화면 아래 탈환 작전실 요약은 /api/checks의 total·blocked·failed·notRun을 그대로 옮긴다. 로그인과 기기 승인 없이 기록을 읽으며 실패하거나 집계가 불완전하면 네 수치를 비운다. 「점검 기록 다시 확인」으로 새 응답을 확인한다.

집계는 실제 관측을 우선한다. observed가 not_run이거나 HTTP 응답 관측이 없는 항목은 result도 not_run으로 정규화한다. 들어온 결과 라벨이 blocked여도 미실행 관측은 미실행 집계와 출처에 남긴다. 실제 HTTP 상태와 가상 규칙의 ready는 새 응답에서 읽는다.

## 검사한 커밋으로 설치·실행·중지·복구

1. 설치: 이 저장소를 받고 검사한 커밋을 사용한다. 기존 변경이 있으면 먼저 보존한다. Node.js 22 이상에서 npm ci를 실행한다. 검사 커밋은 새 artifacts/submission.json의 commit과 배포 /aleph.json의 commit을 대조한다.
2. 검증: npm test로 정상 CRUD·타인 자료 거부·기기 규칙·복원·XDR·실행 집계를 확인한다. 로컬 시험에는 서버 키가 필요 없다.
3. 실행: 기존 Vercel 프로젝트의 main 자동 배포를 사용한다. public/과 api/를 배포하며 기존 Supabase DB와 서버 환경변수를 유지한다. 데이터 초기화 SQL은 재실행하지 않는다.
4. 점검: 실제 변경과 미검증 사항을 제외 파일 bundle-notes.json에 적고, 커밋된 깨끗한 작업 트리에서 npm run bundle 또는 npm run check를 실행한다. 새 실행의 JSON과 요약을 확인한다. artifacts/submission.json과 bundle-notes.json은 커밋하지 않는다.
5. 중지: Vercel의 배포 일시 중지 또는 제공 엔진의 경로 허용 중지를 사용한다.
6. 복구: 검증한 커밋의 배포로 되돌린 뒤 정상 요청과 금지 요청을 다시 확인한다. 요청한 메모 한 건만 복원하며 사본 버전·범위·ID·소유자·내용 해시를 검증하고 감사 기록을 보존한다.

npm run bundle의 자기 점검과 실제 심판 판정은 각각 확인한다. 새 접수는 그 시점의 저장소 HEAD를 고정한다. 공개 배포 /aleph.json의 커밋이 HEAD와 일치한 뒤 제출한다.

사례별 실측 표는 새 제출 묶음을 만든 뒤 node scripts/checks-table.mjs로 확인한다. node scripts/checks-table.mjs --write-readme는 실제 측정 커밋·시각·점검 행만 아래 표시 구간에 기록한다. 이 문서 갱신은 별도 커밋하며 측정 커밋을 새 문서 커밋이라고 바꾸어 쓰지 않는다.

## 설정과 보호 경로

aleph.config.json은 step 12이며 기존 judgeIssuer를 유지한다. identityProvider는 기존 Supabase Auth 발급자, authenticated 대상과 공식 JWKS 주소다. 허용한 notes 읽기 경로는 GET /api/my/notes, GET /api/notes/:id, 공식 판정 연습 GET /notes/:id다. 원본 Data API 직접 권한은 회수했다. 복원 경로는 /api/restore/:noteId다.

자료실은 로그인과 서버 기기·요청 승인이 검증됐을 때 요청자의 자료만 반환한다. 무인증·위조 요청은 자료 없이 401, 타인 자료는 404다. 임의 클라이언트 신원·소유자·역할 입력을 신뢰하지 않는다. 운영 승인 어댑터 미연결은 503이다. 정상 CRUD·공지 역할·복원은 승인 검증기를 주입한 로컬 시험에서 확인했다.

서버 환경변수와 기기 키는 공식 비밀 입력 화면에서 관리한다. 키·토큰·비밀번호·메모 본문·실제 개인정보는 코드, 로그, 안내와 제출 묶음에 넣지 않는다. 현재 운영 기기 결합·서명 검증·회수와 공식 운영 재현은 미실행이다.

## 이전 기록과 계약

[이전 저장점 원문](docs/SAVEPOINT-HISTORY.md)은 당시 구현과 점검 기록이다. 현재 집계에는 사용하지 않는다. 판정기의 실제 요청 계약은 docs/DECIDER_REQUEST.md, 탐지 사건 계약은 docs/DETECT_EVENTS.md, XDR 안내는 xdr/README.md를 읽는다. 기존 1~11단계와 XDR 여섯 과제의 실제 심판 기록은 작업 기록 저장소에 보존했다.


<!-- checks-table:start -->

## 이번 제출의 사례별 실측 기록

점검 시각 2026-10-13T08:10:49.855Z · 커밋 f87c582b0298d7b8811dce6a89d3c759ccd78572 · 단계 12

아래 표는 해당 커밋의 제출 묶음에 기록된 자기 점검 결과이며 심판 판정이 아닙니다. 고정 가상 규칙의 ready는 학생 계산의 기대 조건 일치이며 제공 엔진의 집행 결과가 아닙니다.

| 단계 | 점검 ID | 기대 조건 | 실제 관측(observed) | 결과 |
| --- | --- | --- | --- | --- |
| 2 | static_seed | 404 | HTTP 404 | 막음(기대대로) |
| 3 | anonymous_read | 401; 자료 없음 | HTTP 401 | 막음(기대대로) |
| 3 | malformed_token | 401; 자료 없음 | HTTP 401 | 막음(기대대로) |
| 4 | anonymous_other_note | 401; 타인 자료 없음 | HTTP 401 | 막음(기대대로) |
| 5 | direct_anonymous_read | 원본 직접 접근 거부; 자료 없음 | HTTP 401 | 막음(기대대로) |
| 6 | local_unregistered_device | fixed fixture unregistered deny; 운영 연결 증거 아님 | HTTP 200; jsonReady=true | 막음(기대대로) |
| 7 | local_compound_risk | fixed fixture compound step_up; 운영 연결 증거 아님 | HTTP 200; jsonReady=true | 막음(기대대로) |
| 8 | anonymous_notice_get | 401; 공지 본문 없음 | HTTP 401 | 막음(기대대로) |
| 8 | local_unknown_route | fixed fixture unknown route deny; 운영 연결 증거 아님 | HTTP 200; jsonReady=true | 막음(기대대로) |
| 9 | local_detection_121 | fixed fixture revocation proposal; 운영 연결 증거 아님 | HTTP 200; jsonReady=true | 막음(기대대로) |
| 10 | s10-restore-unauth | POST /api/restore/:noteId 무인증 복원 거부; GET/HEAD 점검에서는 미실행 | not_run | 미실행 |
| 11 | s11-unsigned-write | PUT /api/notes/:id 서명·승인 없는 수정 거부; GET/HEAD 점검에서는 미실행 | not_run | 미실행 |

점검 항목 12 · 막음 10 · 뚫림 0 · 미실행 2

공식 41종 전체는 심판의 별도 시험이며 이 자기 점검 표에 포함하지 않습니다. 별도 운영 재현 계획 41종은 모두 미실행(not_run)으로 둡니다. 이 표에 없는 공격을 통과로 세지 않습니다.

<!-- checks-table:end -->
