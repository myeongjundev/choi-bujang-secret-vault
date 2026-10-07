# BYTE BACK 자료실 · 5단계 저장점

1~5단계 운영 심판 각 100/100점, 총 500/500점을 확인했습니다. 5단계는 메모 요청을 기존 서버 함수로만 처리하며 원본 Data API 직접 권한을 닫습니다.

배포: https://choi-bujang-secret-vault-sigma.vercel.app
저장소: https://github.com/myeongjundev/choi-bujang-secret-vault

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

무차별 로그인 및 웹 주입 모듈은 xdr/README.md에 실행·패턴·만료 규칙을 기록했습니다. 공식 가상 Wazuh 경보만 사용하며 기존 자료실 API·로그인·src/decider.mjs의 기본 규칙은 변경하지 않습니다. 이 판정기는 현재 starter.deny만 읽어 기본 거부하며 운영 반 엔진에 연결하지 않았습니다. 추가 XDR deny overlay는 별도 모듈이며 확인된 릴레이 출발 주소가 있는 호스트에서만 사용할 수 있습니다.

npm run xdr:run -- brute-force 및 npm run xdr:run -- web-injection 으로 result.json을 다시 생성합니다. 모호한 경보의 실제 Jev 연결 정보가 없으므로 현재는 unavailable 알림 fallback이며, Jev 응답을 받았다고 기록하지 않습니다. npm run xdr:replay는 허용하는 시험용 기본 정책을 사용한 연결 모의 시험이고 운영 접속 판정이 아닙니다. 보너스 운영 판정은 제출 후 별도로 확인합니다.
