# BYTE BACK 자료실 · 12단계 저장점

배포: https://choi-bujang-secret-vault-sigma.vercel.app

저장소: https://github.com/myeongjundev/choi-bujang-secret-vault

## 출처

| 출처 | 담당 구성 요소 |
| --- | --- |
| 학생이 만든 것 | 학생 판정기(src/decider.mjs), 탐지 규칙(src/detect.mjs), 접속 앱 화면(public/), 자료실 서버 함수(api/), 사본 검증·한 건 복구, 작전실, 점검 코드, XDR 판정 |
| 제공 엔진 | ALEPH SDP 엔진. 로그인·기기 결합, 기기 키, 요청 서명 검증, 판정기 호출과 집행, 회수, 감사 보관을 담당한다. 운영 연결은 현재 미제공·미검증이다. |

제공 엔진: ALEPH SDP 엔진

학생 작업: 학생 판정기, 탐지 규칙, 접속 앱, 자료실 API, 작전실, 고정 가상 규칙 시험.

## 현재 점검 범위

| 목록 | 총 항목 | 기대 조건 일치 | 불일치 | 미실행 |
| --- | ---: | ---: | ---: | ---: |
| 제출 점검 | 10 | 9 | 0 | 1 |
| 공식 운영 계획 | 41 | 0 | 0 | 41 |

제출 점검의 실측 9건은 실제 HTTP 거부 5건과 학생 서버의 고정 가상 규칙 ready 응답 4건이다. 운영 재현 official_engine_replay 1건은 실행 세션이 없어 observed/result 모두 not_run이다. 공식 운영 계획 41행은 전부 not_run이며 관측 ID·시각은 null이다.

학생 서버의 고정 가상 규칙은 정해진 가상 입력으로 판정기·탐지기를 실행한다. ready는 그 기대 조건의 일치 여부다. 제공 엔진의 실제 기기 승인과 회수는 미실행이다. 실제 점검의 실패 응답은 breached, 요청·응답을 받지 못한 항목은 not_run으로 기록한다.

제출 JSON의 counts는 제출 점검만 센다. officialCounts는 공식 운영 계획만 센다. /api/checks는 같은 점검 함수의 새 HTTP 응답으로 수치를 계산하며 공식 목록은 별도 official에 둔다. /operations.html은 이 API 수치와 사례별 결과를 표시한다. 일반 HTTP 관측, 로컬 가상 계산, 공식 운영 계획의 상태를 각각 표시한다. 숫자는 실행 시 응답에 따라 변한다.

집계는 실제 관측을 우선한다. observed가 not_run이거나 HTTP 응답 관측이 없는 항목은 result도 not_run으로 정규화한다. 들어온 결과 라벨이 blocked여도 미실행 관측은 미실행 집계와 출처에 남긴다. 실제 HTTP 상태와 가상 규칙의 ready는 새 응답에서 읽는다.

## 검사한 커밋으로 설치·실행·중지·복구

1. 설치: 이 저장소를 받고 검사한 커밋을 사용한다. 기존 변경이 있으면 먼저 보존한다. Node.js 22 이상에서 npm ci를 실행한다. 검사 커밋은 새 artifacts/submission.json의 commit과 배포 /aleph.json의 commit을 대조한다.
2. 검증: npm test로 정상 CRUD·타인 자료 거부·기기 규칙·복원·XDR·실행 집계를 확인한다. 로컬 시험에는 서버 키가 필요 없다.
3. 실행: 기존 Vercel 프로젝트의 main 자동 배포를 사용한다. public/과 api/를 배포하며 기존 Supabase DB와 서버 환경변수를 유지한다. 데이터 초기화 SQL은 재실행하지 않는다.
4. 점검: 실제 변경과 미검증 사항을 제외 파일 bundle-notes.json에 적고, 커밋된 깨끗한 작업 트리에서 npm run bundle 또는 npm run check를 실행한다. 새 실행의 JSON과 요약을 확인한다. artifacts/submission.json과 bundle-notes.json은 커밋하지 않는다.
5. 중지: Vercel의 배포 일시 중지 또는 제공 엔진의 경로 허용 중지를 사용한다.
6. 복구: 검증한 커밋의 배포로 되돌린 뒤 정상 요청과 금지 요청을 다시 확인한다. 요청한 메모 한 건만 복원하며 사본 버전·범위·ID·소유자·내용 해시를 검증하고 감사 기록을 보존한다.

npm run bundle의 자기 점검과 실제 심판 판정은 각각 확인한다. 새 접수는 그 시점의 저장소 HEAD를 고정한다. 공개 배포 /aleph.json의 커밋이 HEAD와 일치한 뒤 제출한다.

## 설정과 보호 경로

aleph.config.json은 step 12이며 기존 judgeIssuer를 유지한다. identityProvider는 기존 Supabase Auth 발급자, authenticated 대상과 공식 JWKS 주소다. 허용한 notes 읽기 경로는 GET /api/my/notes, GET /api/notes/:id, 공식 판정 연습 GET /notes/:id다. 원본 Data API 직접 권한은 회수했다. 복원 경로는 /api/restore/:noteId다.

자료실은 로그인과 서버 기기·요청 승인이 검증됐을 때 요청자의 자료만 반환한다. 무인증·위조 요청은 자료 없이 401, 타인 자료는 404다. 임의 클라이언트 신원·소유자·역할 입력을 신뢰하지 않는다. 운영 승인 어댑터 미연결은 503이다. 정상 CRUD·공지 역할·복원은 승인 검증기를 주입한 로컬 시험에서 확인했다.

서버 환경변수와 기기 키는 공식 비밀 입력 화면에서 관리한다. 키·토큰·비밀번호·메모 본문·실제 개인정보는 코드, 로그, 안내와 제출 묶음에 넣지 않는다. 현재 운영 기기 결합·서명 검증·회수와 공식 운영 재현은 미실행이다.

## 이전 기록과 계약

[이전 저장점 원문](docs/SAVEPOINT-HISTORY.md)은 당시 구현과 점검 기록이다. 현재 집계에는 사용하지 않는다. 판정기의 실제 요청 계약은 docs/DECIDER_REQUEST.md, 탐지 사건 계약은 docs/DETECT_EVENTS.md, XDR 안내는 xdr/README.md를 읽는다. 기존 1~11단계와 XDR 여섯 과제의 실제 심판 기록은 작업 기록 저장소에 보존했다.
