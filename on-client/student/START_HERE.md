# 케셰브 · 처음 실행하기

2026-11-02. Windows 일반 권한에서 내 PC 자원·연결 구성·기록을 읽는 학생 앱입니다. PC 조회에는 계정 승인이나 AI 키가 필요하지 않습니다. 제공 서버 파일은 원본 그대로 사용합니다.

## 1. 준비와 폴더

Node.js **24.19.0**, 처음 받으면 Git이 필요합니다. Node가 없거나 버전이 다르면 https://nodejs.org/dist/v24.19.0/ 에서 `node-v24.19.0-x64.msi`를 받아 설치한 뒤 PowerShell 창을 새로 엽니다. 설치 없이 쓰려면 같은 곳의 `node-v24.19.0-win-x64.zip`을 풀어 2번의 휴대형 Node 방법으로 실행합니다. 추가 npm 패키지 설치는 없습니다. 이미 프로젝트가 있으면 기존 on-client 폴더를 엽니다. 새로 받는다면 비어 있는 새 경로에서:

```powershell
git clone --branch codex/keshev-final-build --single-branch https://github.com/myeongjundev/choi-bujang-secret-vault.git keshev-review
Set-Location -LiteralPath '.\keshev-review\on-client'
```

기존 폴더를 지우거나 덮어쓰지 않습니다. 받은 소스는 `git rev-parse HEAD`로 커밋을 확인하고 제출할 저장점과 대조하세요.

## 2. PC 점검 시작

on-client 폴더의 PowerShell에서:

```powershell
node --version
node student/run-local-pc.mjs
```

버전이 v24.19.0인지 확인합니다. 다르면 1번의 설치 안내를 따릅니다. 시작 문구는 `케셰브 PC 점검: http://127.0.0.1:5189/student/pc`입니다. 브라우저에서 **http://127.0.0.1:5189/student/pc** 를 엽니다. 이 서버의 `/`는 제공 보안 화면이며 기본 SDP 미연결 상태입니다. 학생 PC 실행은 계정 연결 설정을 준비하지 않습니다.

휴대형 Node와 대체 포트를 쓰는 경우(경로는 실제 위치로 변경):

```powershell
$keshevNode='C:\Tools\node-v24.19.0-win-x64\node.exe'
& $keshevNode --version
$env:ON_PORT='5191'
& $keshevNode student/run-local-pc.mjs
```

주소도 **http://127.0.0.1:5191/student/pc** 로 바뀝니다. 다른 프로그램이 포트를 쓰면 종료하지 말고 빈 포트를 선택합니다. 시스템 PATH·보안 설정은 바꾸지 않습니다.

## 3. 눌러서 확인

1. **PC 상태 조회**를 누릅니다. Windows 조회에는 최대 14초 걸릴 수 있습니다.
2. CPU %, 메모리 GiB와 %, 디스크 여유 GiB 및 측정 시각을 확인합니다.
3. 네트워크 주소 구성·방화벽 프로필·System/Application 오류·경고 건수를 확인합니다. 읽지 못한 항목은 이유와 함께 확인 불가입니다.
4. **PC 상태 다시 조회**로 이전 관측과 비교합니다.
5. 조회 중 **PC 조회 취소**를 누르면 이전 수치가 없어집니다. 다시 조회하여 복구합니다.
6. 키보드만으로도 됩니다. Tab으로 **PC 상태 조회**에 가서 Enter를 누르면 조회 중에는 초점이 **PC 조회 취소**로 옮겨가 Enter로 바로 취소할 수 있고, 끝나거나 취소되면 초점이 조회 버튼으로 돌아옵니다.

PC 조회 성공은 SDP 연결이나 안전 판정이 아닙니다. 방화벽 설정은 차단 효과가 아니며 Windows 경고·오류 건수는 공격 탐지가 아닙니다. IP/MAC·인터페이스 원문 이름·이벤트 본문은 표시하지 않습니다.

## 4. 기존 사건 예제·계정 연결

사건 예제는 PC 서버를 Ctrl+C로 종료한 뒤 `node student/run-local-pc.mjs --demo`로 실행합니다. `/`에서 예제 업무 앱·보안 기록을 확인합니다. **PC 측정값은 실제 조회, 보안 서버 자료만 예제**입니다.

계정·AI 연결이 필요하면 **별도 PowerShell**의 on-client 폴더에서 공식 도구를 사용합니다. PC 서버와 다른 빈 포트(예: 5190)를 사용하세요.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port 5190
```

공식 화면은 **http://127.0.0.1:5190/** 입니다. 휴대형 Node를 쓴다면 이 창에서만 해당 Node 폴더를 PATH 앞에 추가한 뒤 실행합니다. 공식 도구가 개인 계정 설정을 프로젝트 밖의 본인 Windows 폴더에 준비하고, 사용자가 화면에서 로그인·승인합니다. PC 서버와 계정 상태를 공유하지 않습니다. 공식 서버에는 `/student/pc` 및 PC 조회 API가 없으며 이 주소에서 PC 조회를 하려면 2번의 학생 서버를 여세요.

현재 제공본은 0.2.14입니다. 최신 0.2.21은 계정 연결 저장·진단 수정을 포함하지만 제출 필수 업데이트는 아닙니다. 실제 SDP 접속용 개인 인증서는 이번 과정에서 학생에게 발급하지 않으며 기본 미연결은 정상입니다. 계정·AI 승인과 SDP 연결을 구분합니다.

## 5. 종료·재시작·오류

각 서버를 실행한 창에서 Ctrl+C를 누릅니다. PC 서버는 같은 창에서 `node student/run-local-pc.mjs`로 다시 켭니다. 휴대형 Node는 `& $keshevNode student/run-local-pc.mjs`를 다시 실행합니다. 새 창이면 폴더·버전·포트를 다시 선택합니다.

| 증상 | 확인 |
| --- | --- |
| 페이지가 열리지 않음 | 실행 창과 주소·포트 확인 |
| PC 페이지 404 또는 실행 안내 | 공식 서버 대신 2번 학생 서버의 주소 열기 |
| 포트 사용 중 | 다른 프로그램을 유지하고 ON_PORT에 빈 포트 선택 |
| 조회 실패·시간 초과 | 이전 수치 대신 확인 불가 확인, 실행 창 점검 후 재조회 |
| NATIVE_HOST_DISABLED | 계정 연결은 4번 공식 서버에서 진행 |
| NATIVE_HOST_UNVERIFIED | 아직 계정 승인 미확인. 연결 성공으로 표시하지 않음 |
| SDP 미연결 | 이번 과정의 정상 기본 상태. PC 조회와 별개 |

## 따라 하기 기록

다른 사람이 안내만 보고 실행하는 것을 권장합니다. 도와줄 사람이 없으면 공식 안내에 따라 본인이 다른 계정 또는 새 폴더에서 따라 할 수 있습니다. 에이전트 새 clone 검증과 사람의 실제 수행은 구분합니다.

```text
수행: 본인 / 다른 사람 / 에이전트
날짜와 소스 커밋:
Node 버전:
시작·조회·재조회·취소·종료:
막힌 단계와 수정 사항(개인정보·비밀값 제외):
```

마무리 제출은 GitHub 저장소 주소와 40자리 커밋입니다. package-app은 이번 과정에서 하지 않습니다. 마지막 수정본에서 핵심 기능을 시연하고 화면·근거·한계를 대조합니다. 시연 순서와 되는 것·안 되는 것은 [7일차 정리](DAY7.md)에 있습니다.
