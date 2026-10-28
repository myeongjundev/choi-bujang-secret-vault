# 전체 리뷰 3건 수정 · 2026-10-28

## 변경과 이유

1. **공식 실행 + PC 조회:** PC 라우트를 local-pc-routes.mjs로 분리하고 제공 src/server.mjs의 CLI 초기화 뒤 같은 서버에 연결했다. 제공 서버 변경은 import·주석·호출 3줄이다. 공식 도구의 개인 계정 설정 준비·비밀 환경변수 제거·native/SDP 검증은 그대로 사용한다.
2. **프로젝트 볼륨:** statfs에 드라이브 루트 대신 프로젝트 전체 경로를 전달한다. 마운트 하위 경로가 잘리지 않는 회귀 사례를 추가했다.
3. **안내:** STUDENT_GUIDE의 clone 브랜치·버전·검증 상태와 README·START_HERE의 실행 명령을 일치시켰다. 10/24 통과본 재현 문서는 당시 기록으로 보존한다.

예전 “제공 17개 보존”은 이전 커밋의 관측이다. 이번 사용자 요청으로 제공 서버의 CLI 연결 지점만 수정했다. 실행 도구·인증·보관소·SDP 구현·manifest는 바꾸지 않았다.

## 실행

on-client에서 Node 24.19.0이 선택된 PowerShell로 실행한다. 휴대형 Node 선택은 [START_HERE](START_HERE.md)를 따른다.

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port 5191
~~~

PC: http://127.0.0.1:5191/student/pc → **PC 상태 조회**. 기존 보안 화면·계정 연결은 http://127.0.0.1:5191/ 이다. 다른 프로그램이 포트를 쓰면 빈 번호를 선택한다. 공식 도구는 본인 Windows 폴더에 개인 설정을 준비한다. 사용자 로그인·AI 승인은 화면에서 직접 해야 한다. node student/run-local-pc.mjs는 계정 설정을 준비하지 않는 PC 전용 개발 호환 경로다.

## 이번 확인

Node v24.19.0 Windows x64에서 수정 전 두 재현 시험은 모두 실패했다. 수정 후 기존 학생 51개 + 공식 CLI·디스크 경로·잘못된 native 설정 거부 3개 = **54/54**, 이전 단계 **88/88**, 합계 **142개** 통과했다.

- 공식 CLI 예제: PC HTML/JS 200, 기존 demo 모드 유지, 전용 헤더 없는 PC 요청과 외부 Origin의 native 요청 403.
- 잘못된 native 설정: 비정상 종료·서버 미기동. PC 전용 성공으로 조용히 대체하지 않는다.
- 실제 공식 도구 기본 실행: 개인 설정 준비, PC 화면 200, 실제 PC 7/7 조회. 같은 실행의 native current는 **409 NATIVE_HOST_UNVERIFIED**. 승인 전 신원 미확인 상태이며 이전의 503 NATIVE_HOST_DISABLED와 다르다.
- 본인이 연 검증 포트 종료 확인, 같은 경로 재시작 후 PC 페이지 200. 공식 도구의 기존 개인 설정 재사용 경로도 확인했다.

실제 로그인 승인·SDP/AI 연결·보안 집행은 하지 않았다. 실제 볼륨 마운트·보호 설정·권한을 변경하지 않았다. 마운트된 다른 볼륨과 다른 PC/OS는 미검증이다. 기존 브라우저 기록을 참고했으며 이번 수정에서 전 시나리오를 다시 실행했다고 쓰지 않는다.

## 오류 분류

NATIVE_HOST_DISABLED는 실행 도구 사용 여부와 Demo·NoNativeHost·PC 전용 개발 실행을 먼저 확인한다. NATIVE_HOST_UNVERIFIED는 현재 신원 미확인으로 계정 연결 화면에서 본인 승인이 필요하다. ALEKOV_CONNECT_UNAVAILABLE이 계속되면 버전·실행 경로를 확인해 수업용 AI에 문의한다. ALEKOV_VAULT_*는 과제 판정과 별개다. 비밀값 없는 코드·시각만 기록하고 백신·ACL·보호 설정을 임의 변경하지 않는다.

21·22는 이미 통과했으므로 자동 재제출하지 않는다. Git 커밋·push 이전 작업 폴더 변경을 원격 고정 커밋의 재현으로 세지 않는다.
