# BYTE BACK 자료실 · 2단계 저장점

1단계는 R5 원본 커밋을 배포해 운영 심판 100/100점으로 통과했습니다. 2단계는 DB 연결과 배포를 검증하고 운영 심판 90/100점(필수 조건 4개, 완결성 가점 2개)으로 통과했습니다. 화면에 과거 공개 이력의 한계를 보완했으며, 보완 후 점수는 재판정으로 확인합니다.

- 배포 주소: https://choi-bujang-secret-vault-sigma.vercel.app
- 저장소: https://github.com/myeongjundev/choi-bujang-secret-vault
- 화면은 /api/notes를 통해 DB의 가상 카드 네 건을 읽습니다.
- 현재 정적 데이터 파일과 Git 최신 버전에서는 메모 본문을 제거했습니다.
- 서버 함수는 SUPABASE_URL과 SUPABASE_SECRET_KEY 환경변수만 사용합니다. 브라우저·응답·로그에 키를 넣지 않습니다.
- SQL 테이블은 notes이며 owner_id uuid는 외래키 없이 준비했습니다. RLS를 켜고 anon·authenticated의 권한을 회수했습니다.

## 실행과 설정

npm ci 후 npm run build -- --local을 실행합니다. 로컬 검증은 node --test test/*.test.mjs입니다. Vercel은 main push 시 npm run build로 자동 배포합니다.

전용 학습 Supabase의 SQL Editor에서 비공개로 전달된 초기 데이터 SQL을 실행합니다. 공개 sql/schema.sql에는 테이블·권한 정의만 있고 메모 본문은 없습니다. 기존 DB나 타 프로젝트의 테이블은 변경하지 않습니다.

Vercel 프로젝트 Settings → Environment Variables에서 SUPABASE_URL, SUPABASE_SECRET_KEY를 Production의 서버 환경변수로 직접 입력합니다. 키를 채팅·파일·Git에 넣지 않습니다. 설정 후 Redeploy를 실행합니다. 정상 화면에는 네 카드, /data.json에는 404, GET /api/notes에는 네 자료가 반환되어야 합니다. POST /api/notes는 405, 설정 누락은 503, DB 오류는 상세 정보 없는 502입니다.

## 남은 약점과 공개 이력

2단계의 /api/notes는 아직 로그인 없이 읽을 수 있는 공개 API입니다. DB의 공개 키로 직접 읽는 권한은 차단하지만 서버 API의 사용자 인증은 3단계 작업입니다. 실제 개인정보를 넣지 않습니다.

과거 공개 커밋과 과거 Vercel 배포에는 초기 자료가 남을 수 있습니다. 최신 파일에서 지웠다고 과거 노출이 해소됐다고 주장하지 않습니다. Git 이력을 다시 쓰거나 과거 배포를 지우지 않았습니다.

## 최신 코드·배포 점검

1. git ls-files와 git grep으로 최신 커밋을 확인하고 이전 메모 본문을 검색합니다. 초기 데이터 SQL은 커밋하지 않습니다.
2. 공개 /, /data.json, /aleph.json을 비로그인으로 요청합니다. HTML 및 정적 자산에 메모 본문이나 비밀값이 없는지 검색합니다.
3. /api/notes에서 네 카드가 반환되는지, POST가 거부되는지 확인합니다. 공개 API의 읽기 성공을 남은 약점으로 기록합니다.
4. /aleph.json의 저장소와 커밋을 GitHub와 대조합니다.
5. npm run bundle의 직접 요청 결과는 자기 점검이며 운영 심판 판정이 아닙니다. artifacts/submission.json과 bundle-notes.json은 커밋하지 않습니다.

2026-10-05 실제 비로그인 점검: /는 200이고 정적 메모 본문 없음, /data.json은 404, GET /api/notes는 200 및 가상 자료 4건, POST /api/notes는 405입니다. /aleph.json의 저장소·커밋을 배포와 대조했습니다. SQL 실행 화면에서 자료 4건과 RLS 활성화를 확인했습니다. 공개 키를 이용한 DB 직접 조회는 별도로 실행하지 않았습니다.

AGENTS.md의 이후 단계 계약을 보존합니다. 6단계 판정기와 9단계 탐지기는 아직 운영 엔진에 연결하지 않았습니다.
