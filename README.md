# BYTE BACK 자료실 · 10단계 저장점

1~5단계 운영 심판 각 100/100점, 총 500/500점을 확인했습니다. 5단계는 메모 요청을 기존 서버 함수로만 처리하며 원본 Data API 직접 권한을 닫습니다.

6단계 기기 등록 판정 규칙을 구현했습니다. 로컬 판정기 연습 2건, 기존 자료실·XDR 포함 시험 17개 및 빌드는 통과했습니다. 2026-10-13 운영 심판에서 커밋 21ec6b2ffe30798295d124aa739059d2f6333cb7의 6단계 100/100점, 조건 4개와 완결성 가점 3개 통과를 확인했습니다. 반별 엔진 안내 미제공으로 실제 mTLS 연결은 별도 미검증입니다.

배포: https://choi-bujang-secret-vault-sigma.vercel.app
저장소: https://github.com/myeongjundev/choi-bujang-secret-vault

7단계는 출처가 명확한 가상 복합 이상 신호에 step_up을 반환합니다. 지역 하나만으로 영구 차단하지 않습니다. 엔진 계약의 verified 재인증이 신선하면 요청을 다시 허용합니다. 클라이언트 출처·누락·중첩 추가 필드는 거부하고 none 신호에는 위치를 채우지 않습니다. 로컬 판정 연습 4건, fixture:7, 기존 기능 포함 시험 20개와 빌드가 통과했습니다. 운영 재로그인·자료 차단 연결은 반별 엔진 미제공으로 미검증입니다. 2026-10-13 실제 7단계 심판은 45c7c4da1ccb 커밋의 100/100점·조건 7개·가점 3개 통과를 확인했습니다.

Supabase Auth 공식 SDK의 signInWithPassword/signOut을 사용합니다. 비밀번호·토큰은 출력하거나 Git에 저장하지 않습니다. 브라우저 세션은 메모리에만 보관하며 새로고침하면 다시 로그인합니다. 서버는 원본 src/verify-login.mjs로 신원·서명·만료·발급자·대상을 검사합니다. judgeIssuer는 시작 틀의 운영 발급자를 보존했습니다.

## 설정과 실행

Vercel Production 서버 환경변수: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY. 사용자가 공식 UI에 직접 입력합니다. /api/auth-config는 공개 프로젝트 URL과 publishable key만 반환하며 서버 키는 반환하지 않습니다.
Supabase SQL Editor에서 sql/stage3.sql을 실행합니다. UUID user_notes 테이블에 RLS를 켜고 anon/authenticated 직접 접근을 회수합니다. 기존 notes의 가상 메모 네 건은 변경하거나 삭제하지 않습니다.
시험 계정은 Supabase Authentication → Users → Add user에서 사용자가 준비합니다. 비밀번호는 채팅에 보내지 않습니다.
npm ci; npm run build -- --local; node --test test/*.test.mjs
Vercel main push 후 자동 배포합니다. 공개 키를 추가한 뒤에는 Redeploy가 필요합니다.

## API 계약과 남은 약점

GET /api/notes는 검증된 로그인 사용자의 메모 배열을 반환합니다. POST는 {id?,title,body}, id는 UUID이며 생략 시 서버가 생성합니다. 생성 응답은 id를 포함합니다.
GET/PUT/DELETE /api/notes/:id, 단일 GET은 {id,title,body}, 삭제 후 GET은 404입니다. owner_id는 토큰을 검증해 얻은 ID만 저장하며 요청의 userId·role·owner_id는 신뢰하지 않습니다.
무토큰·위조·만료·다른 서비스 토큰은 자료 없이 401입니다. 목록과 단일 GET/PUT/DELETE 모두 검증한 userId와 owner_id를 SQL 조건으로 비교합니다. 다른 소유자 또는 없는 메모는 모두 404이며 수정·삭제로 상대 행을 바꾸지 않습니다. PUT은 title/body만 받으며 owner_id 등 추가 필드의 소유자 변경 시도는 400입니다. POST owner_id는 서버가 검증한 ID로 고정합니다. 실제 자료를 넣지 않습니다.

최신 정적 파일에는 메모 본문과 서버 키가 없습니다. 과거 공개 커밋·배포는 남아 있으므로 현재 파일 제거가 과거 노출 회수를 의미하지 않습니다. 캐시 방지·nosniff·CSP를 유지합니다. 공개 publishable key를 이용한 익명 Data API 직접 조회는 401 거부를 확인했습니다. 실제 authenticated 역할로 직접 Data API 요청하는 시험은 미실행이며 심판 점수에서도 제외됩니다.

npm run bundle의 직접 점검은 자기 점검이며 심판 판정이 아닙니다. bundle-notes.json과 artifacts/submission.json은 커밋하지 않습니다. 이후 단계 판정기·탐지기는 운영 엔진에 연결하지 않았습니다.

## 4단계 DB 권한 검토

sql/stage4.sql은 당시 직접 로그인 접근을 위한 설계 자료이며 실행하지 않았습니다. 5단계에서는 권한 추가 방향을 중단하고 sql/stage5.sql로 user_notes의 PUBLIC/anon/authenticated 직접 권한을 모두 회수합니다. RLS와 service_role의 서버 CRUD 권한은 유지합니다. 다른 테이블과 기존 자료는 보존합니다. 적용 전후 role_table_grants 및 has_table_privilege를 비교합니다.

브라우저의 Supabase 직접 메모 호출은 없음입니다. src/browser.mjs는 로그인(Auth)만 직접 호출하고 메모는 /api/notes 및 /api/notes/:id로 요청합니다. 원본 API는 https://cenxyqdoulktaqtkskeh.supabase.co/rest/v1/user_notes 이며 쿼리 없이 originalApiUrl에 기록합니다. 5단계 공개 배포 메타데이터에는 시드 표식을 내보내지 않습니다.

전용 프로젝트에 5단계 권한 회수 SQL을 적용했습니다. PUBLIC/anon/authenticated 직접 grant 0개, anon/authenticated의 7종 권한 모두 false를 확인했습니다. RLS는 유지되며 기존 가상 메모 네 건을 보존했습니다. 실제 사용자 로그인 수동 시험은 별도로 미실행입니다. 로컬 A/B 정상 CRUD·교차 거부 시험 7개는 통과했습니다.

A/B 초기 자료 소유자 연결은 실제 계정 준비 뒤 별도로 검토할 작업입니다. 기존 notes 네 건의 소유자나 본문을 임의로 바꾸지 않았습니다. 로컬 A/B 회귀시험은 양쪽 정상 CRUD, 교차 조회·수정·삭제 거부와 상대 행 보존, 소유자 변경 거부를 확인합니다.

## XDR 보너스 학습 모듈

무차별 로그인 및 웹 주입 모듈은 xdr/README.md에 실행·패턴·만료 규칙을 기록했습니다. 2026-10-07 운영 심판에서 두 과제 모두 통과했고 보너스 합산 180/600점을 확인했습니다. 6단계는 XDR 모듈·기존 자료실 API·로그인을 보존하고 별도 src/decider.mjs만 갱신합니다. 추가 XDR deny overlay는 별도 모듈이며 확인된 릴레이 출발 주소가 있는 호스트에서만 사용할 수 있습니다.

npm run xdr:build 후 npm run xdr:run -- brute-force 및 npm run xdr:run -- web-injection 으로 result.json을 다시 생성합니다. 모호한 경보의 실제 Jev 연결 정보가 없으므로 현재는 unavailable 알림 fallback이며, Jev 응답을 받았다고 기록하지 않습니다. npm run xdr:replay는 허용하는 시험용 기본 정책을 사용한 연결 모의 시험이고 운영 접속 판정이 아닙니다.

## 6단계 기기 등록 정책과 운영 연결 범위

aleph.config.json의 allowedRoutes에 notes 서비스의 GET /api/notes, GET /api/notes/:id, GET /notes/:id를 명시했습니다. 마지막 경로는 공식 엔진 요청 연습의 경로입니다. 서비스·method·pathPattern만 담고 비밀값은 없습니다. 공개 배포 식별기의 단계 범위는 기존 제출 계약에 맞춰 1~12를 지원합니다.

src/decider.mjs는 공식 aleph.decision.v1 18필드 입력을 검사하고 deviceRegistered === true일 때만 해당 자료실 읽기를 허용합니다. 미등록·확인 불가 입력은 device_not_registered, 미허용 서비스·쓰기·route/path 불일치는 route_not_allowed로 거부합니다. 응답은 공식 5필드이며 RULE_IDS에는 device_registered와 route_not_allowed만 있습니다. 제출 파일은 외부 import 없이 독립 실행됩니다.

엔진이 로그인·기기 인증서·주체 결합을 먼저 검증한다는 계약에 의존합니다. subjectId를 Supabase 사용자 ID와 비교하거나 브라우저의 userId/role/device를 신뢰하지 않습니다. 학생 판정기는 인증서를 검증하는 엔진이나 공개 HTTP 판정 endpoint가 아닙니다.

반별 접속 도구 설치 명령·등록부·릴레이 연결 안내는 제공받지 않았습니다. 설치 명령·CA·인증서·서명 키를 만들지 않았으며, 실제 mTLS 접속·다른 사용자 토큰과 기기 조합 시험은 미실행입니다. 현재 자료실 API는 기존 로그인·소유권 검사를 유지하고 운영 엔진 경로로만 응답하도록 전환하지 않았습니다. 연결 자료가 제공되면 정상 사용자 접속을 먼저 확인한 뒤 운영 통로 제한을 적용해야 합니다. 현재 점검 결과를 실제 기기 승인·접속 회수로 보고하지 않습니다.

실행: npm run decider:test; node --test test/*.test.mjs; npm run build -- --local.
커밋 후 npm run bundle은 실제 비로그인 HTTP 점검과 구분된 local fixture 판정만 기록합니다. bundle-notes.json·artifacts/submission.json 및 비밀 설정은 커밋하지 않습니다.

## 8단계 자원 구역

메모는 notes, 공지는 vault_notices라는 다른 저장소와 /api/notices/:id 경로를 사용합니다. 메모는 SQL의 owner_id 조건으로 본인에게만 CRUD를 제공합니다. 공지 PUT은 검증된 사용자와 서버 환경변수 INSTRUCTOR_USER_IDS의 UUID 목록을 비교하며 요청 role은 무시합니다. 미설정 목록은 공지 수정을 허용하지 않습니다. src/decider.mjs는 notes의 정확한 읽기 경로만 허용하며 기능 ID와 쿼리 스위치는 거부합니다. 8단계 첫 심판 48점(S08_OTHER_ZONE_ALLOWED)의 원인인 모호한 GET /api/notes와 소유자·역할 검증이 불가능한 쓰기를 릴레이 허용표에서 제거했습니다. 본인 목록은 GET /api/my/notes로 구분하고 동일한 SQL 소유자 필터를 사용합니다. 기존 브라우저 /api/notes CRUD의 최종 API 소유자 검사는 보존합니다. 공지 역할의 운영 엔진 계약은 없어 해당 서비스의 릴레이 허용은 미구현입니다. sql/stage8.sql은 기존 데이터 보존형 신규 가상 공지 저장소입니다. 2026-10-13 본인 Supabase SQL Editor에서 실행하고 가상 공지 1건을 확인했습니다. 8단계 실제 심판은 9942798e0e10c8a2f756c583f67195ea4632265b 커밋의 100/100점·조건 5개·가점 3개를 확인했습니다. 시험 22개와 빌드 통과.

## 9단계 탐지

docs/DETECT_EVENTS.md의 제공 연습 계약만 사용합니다. 같은 가명 주체의 GET가 임의 10분 창에서 120건을 초과할 때만 burst_read 사유로 propose_revocation을 제안합니다. 정확히 120건·다른 사용자 합산·시간 밖 조회는 observe, 잘못된 묶음은 거부합니다. 토큰·메모·실명은 로그나 파일에 저장하지 않습니다. 제공 계약에 네트워크/기기 대상 필드가 없어 만들지 않았습니다. 실제 회수·경과 시간·대상 기기 결합은 운영 엔진에서 별도 검증해야 합니다. npm run detect:test와 전체 회귀를 실행하며 9단계 실제 심판은 4b68f6cc117a5c073bcc3e5eea66d2e2fac7ad3d 커밋의 100/100점·조건 4개·가점 3개를 확인했습니다.

## 10단계 한 건 복구

서비스 notes의 복구 경로는 POST /api/restore/:noteId입니다. 로그인 사용자의 UUID와 비공개 사전 사본의 owner_id를 SQL RPC vault_restore_note에서 대조하고 ID·내용 SHA-256을 검증합니다. 요청에서 백업 본문/소유자를 받지 않습니다. 새 메모는 INSERT 시 처음 사본만 보관하며 수정·삭제 때 덮어쓰지 않습니다. 백업·복구 감사 테이블은 RLS와 PUBLIC/anon/authenticated 권한 회수를 적용하고 service_role에는 읽기/제한된 복구 함수 실행만 제공합니다. 한 트랜잭션에서 대상 한 건만 복원하고 해시 재검증 후 감사 기록에 추가하며 기존 이력은 지우지 않습니다.

backups/safe-policy.json은 커밋으로 고정한 공개 가능한 경로 정책 사본입니다. src/policy-recovery.mjs는 고정 SHA-256·프로젝트·버전을 확인하고 planPolicyRestore로 notes의 전/후 차이와 확인값을 반환합니다. applyPolicyRestore는 동일 차이의 확인값이 있어야 시험 정책만 새 판 번호로 적용하고 다른 서비스·감사 이력을 보존합니다. 운영 엔진 정책 쓰기는 미연결입니다. 복구 API는 현재 notes 정책이 사전 사본과 다르면 정책 복구가 필요하다고 거부합니다.

초기화: 본인 Supabase SQL Editor에서 sql/stage10.sql. DB 시험: sql/stage10-check.sql은 새 가상 B 메모만 생성해 변조/삭제 복원과 타인 거부를 확인하고 전체 트랜잭션을 ROLLBACK합니다. 기존 DB 메모를 시험 때문에 지우지 않습니다. 복구 뒤 npm run decider:test → npm run fixture:7 → npm run detect:test → node --test test/*.test.mjs → npm run build -- --local → 커밋 후 npm run bundle 순서로 정상 읽기, 소유자 A/B, 무인증/위조 토큰, 미등록 기기, 복합 이상, 구역 밖·공지 쓰기, 탐지 경계, 복구 오류를 재검증합니다. 실제 mTLS·운영 재인증·회수 집행은 미실행입니다.
