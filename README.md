# BYTE BACK 자료실 · 4단계 저장점

1~3단계 운영 심판 각 100/100점을 확인했습니다. 현재 4단계 소유권 검사를 구현하며 4단계 운영 판정은 아직 미실행입니다.

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

sql/stage4.sql은 user_notes만 변경하며 자료를 삭제하지 않습니다. PUBLIC/anon/authenticated의 기존 권한을 회수한 뒤 authenticated에 SELECT/INSERT/UPDATE/DELETE만 부여합니다. 네 명령의 RLS USING/WITH CHECK로 auth.uid()=owner_id를 적용하며 restrictive 정책으로 기존 permissive 정책의 우회를 막습니다. 적용 전후 role_table_grants와 has_table_privilege 결과를 대조합니다. 현재 적용 승인 대기 중입니다.

A/B 초기 자료 소유자 연결은 실제 계정 준비 뒤 별도로 검토할 작업입니다. 기존 notes 네 건의 소유자나 본문을 임의로 바꾸지 않았습니다. 로컬 A/B 회귀시험은 양쪽 정상 CRUD, 교차 조회·수정·삭제 거부와 상대 행 보존, 소유자 변경 거부를 확인합니다.
