# 케셰브 · 처음 실행하기

Windows에서 내 PC의 자원·연결 구성·기록을 읽어 보는 학생 앱입니다. PC 조회는 설정을 바꾸지 않는 읽기 전용 기능이며 계정 승인이나 AI 키 없이 사용할 수 있습니다. 공식 실행 도구는 계정 연결에 필요한 개인 설정을 프로젝트 밖의 본인 Windows 폴더에 준비합니다. 로그인·AI 승인은 이후 화면에서 직접 진행합니다.

## 1. 준비

- Windows PC, 일반 사용자 권한
- Node.js **24.19.0**: 3번에서 실제로 실행할 Node의 버전을 확인합니다.
- 소스를 새로 받는 경우 Git

다른 Node 버전이면 [공식 Node 24.19.0 배포](https://nodejs.org/download/release/v24.19.0/)에서 환경에 맞는 파일을 준비하고 PowerShell을 새로 엽니다. 프로젝트를 지우거나 초기화하지 않습니다. 추가 npm 패키지를 설치할 필요가 없습니다.

기존 Node를 바꾸기 어렵다면 공식 Windows x64 ZIP을 **프로젝트 밖의 새 폴더**에 풀어 둡니다. 3번에서 그 node.exe의 전체 경로를 선택합니다. 선택한 Node를 실행 도구에 전달하기 위해 현재 PowerShell 창의 PATH에만 임시로 추가합니다. 시스템 Node·전역 PATH는 바꾸지 않습니다. 여기서는 앱을 실행하지 않고 먼저 2번으로 이동합니다.

## 2. 앱 폴더 열기

이미 프로젝트가 있으면 파일 탐색기에서 프로젝트의 **on-client** 폴더를 엽니다. 주소 표시줄에 powershell을 입력하고 Enter를 누르면 그 폴더에서 PowerShell이 열립니다.

처음 받는 경우에는 본인이 정한 비어 있는 새 경로에서 다음을 실행합니다. 같은 이름의 폴더가 이미 있으면 그 폴더를 지우지 말고 새 이름을 고르세요.

~~~powershell
git clone --branch codex/keshev-final-build --single-branch https://github.com/myeongjundev/choi-bujang-secret-vault.git keshev-review
Set-Location -LiteralPath '.\keshev-review\on-client'
~~~

## 3. 시작

### 3.1 실행할 Node 선택

on-client 폴더의 PowerShell에서 아래 **둘 중 하나만** 선택합니다.

설치한 Node를 쓸 때:

~~~powershell
$keshevNode=(Get-Command node -CommandType Application | Select-Object -First 1).Source
& $keshevNode --version
~~~

ZIP으로 준비한 휴대형 Node를 쓸 때(경로는 실제 압축을 푼 위치로 바꿉니다):

~~~powershell
$keshevNode='C:\Tools\node-v24.19.0-win-x64\node.exe'
& $keshevNode --version
~~~

결과가 **v24.19.0**인지 확인한 뒤 계속합니다. 다른 버전이 나오면 선택한 경로를 확인합니다. 다음 단계가 이 Node를 공식 실행 도구에 전달합니다.

### 3.2 포트 선택 후 실행

같은 PowerShell 창에서 다음을 실행하고 창을 켜 둡니다.

~~~powershell
$keshevPort=5189
$env:Path=(Split-Path -Parent $keshevNode)+';'+$env:Path
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port $keshevPort
~~~

시작 신호:

~~~text
계정 연결 준비가 끝났습니다. 앱에서 확인 번호로 로그인·승인을 진행하세요.
케셰브가 켜졌습니다. 브라우저에서 http://127.0.0.1:5189/ 을 여세요.
~~~

PC 대시보드는 같은 서버의 http://127.0.0.1:5189/student/pc 를 엽니다. 화면에 **PC 자원 상태 / 연결·Windows 기록 / 사건 근거·조치** 세 가지 동선과 조회 전 카드가 보이면 화면이 열린 것입니다. 원래 보안 화면은 시작 문구의 루트 주소입니다. 화면이 열린 것만으로 PC 측정·로그인·보안 서버 연결이 성공한 것은 아닙니다. `-ExecutionPolicy Bypass`는 이 실행에만 적용되며 전역 실행 정책을 바꾸지 않습니다.

### 휴대형 Node와 대체 포트를 함께 쓰는 전체 예시

5189가 사용 중이면 다른 프로그램을 종료하지 말고 빈 포트를 고릅니다. 아래는 **on-client 폴더에서 3.1~3.2 대신** 휴대형 Node와 5191 포트를 함께 쓰는 예시입니다. Node 경로를 실제 위치로 바꾸고, 버전이 v24.19.0일 때만 마지막 줄을 실행합니다.

~~~powershell
$keshevNode='C:\Tools\node-v24.19.0-win-x64\node.exe'
& $keshevNode --version
$keshevPort=5191
$env:Path=(Split-Path -Parent $keshevNode)+';'+$env:Path
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port $keshevPort
~~~

이때 시작 문구는 http://127.0.0.1:5191/ 이고 PC 대시보드는 **http://127.0.0.1:5191/student/pc** 입니다. 5191도 사용 중이면 빈 다른 포트를 골라 `$keshevPort`와 주소에 같은 번호를 씁니다.

## 4. 눌러서 확인

1. **PC 상태 조회**를 누릅니다. Windows 조회는 최대 14초 걸릴 수 있습니다.
2. CPU %, 메모리 GiB와 %, 디스크 여유 GiB, 측정 시각을 확인합니다. 각 값은 직접 조회한 시각의 관측입니다.
3. 아래의 네트워크 주소 구성·방화벽 프로필·System/Application 건수를 확인합니다. 읽을 수 없는 항목은 이유와 함께 확인 불가로 남습니다.
4. **PC 상태 다시 조회**를 누르면 이전 %p와 최근 조회 표·막대를 비교할 수 있습니다.
5. 조회 중 **PC 조회 취소**를 누르면 이전 숫자가 없어지고 취소 안내가 나옵니다. 다시 조회로 복구합니다.
6. **기존 보안 화면 열기**는 원래 앱 화면입니다. SDP 미연결과 PC 조회 성공을 구분합니다. 실제 연결이 없는 상태를 정상 연결로 표시하지 않습니다.

마우스 대신 Tab으로 버튼·링크를 이동하고 Enter로 실행할 수 있습니다. 화면 맨 위의 건너뛰기 링크로 점검 화면에 바로 갈 수 있습니다.

Windows 경고·오류 건수는 침해·공격 탐지가 아닙니다. 방화벽 프로필 설정도 실제 차단 효과를 시험한 결과가 아닙니다. IP/MAC·인터페이스 원문 이름·이벤트 본문은 표시하거나 기록하지 않습니다.

### 계정 연결을 사용할 때

**기존 보안 화면 열기 → 계정 연결 확인**에서 확인 번호를 보고 같은 ALEPH 계정으로 승인한 뒤 앱에서 확인합니다. 개인 native 설정은 공식 실행 도구가 준비하므로 따로 받아 복사하지 않습니다. 실제 SDP 서버의 권한·설정은 별도이며, 필요할 때는 제공 [실행 안내](../docs/STUDENT_LAUNCH_GUIDE.md)를 따릅니다. AI 연결·모델 점검·사건 설명 생성도 각각 다른 단계입니다.

아직 로그인하지 않은 `NATIVE_HOST_UNVERIFIED`는 연결 성공이 아닙니다. `NATIVE_HOST_DISABLED`라면 실행 도구 사용 여부와 `-NoNativeHost`/`-Demo` 선택을 확인합니다. PC 전용 개발 호환 명령 `node student/run-local-pc.mjs`는 개인 계정 설정을 준비하지 않습니다. 일반 시작은 위 공식 명령을 사용합니다.

## 5. 종료·다시 시작

실행한 PowerShell 창에서 **Ctrl+C**를 누릅니다. 같은 창에서 다시 시작할 때는 아래 한 줄을 실행합니다. 선택한 Node와 포트가 유지됩니다.

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port $keshevPort
~~~

새 PowerShell 창을 열었다면 on-client 폴더로 이동한 뒤 3번에서 Node와 포트를 다시 선택합니다.

## 막힐 때

| 보이는 결과 | 할 일 |
| --- | --- |
| node를 찾을 수 없음 / 버전이 다름 | 1번 준비와 새 PowerShell 창 확인 |
| tools/start-alekov.ps1을 찾을 수 없음 | 현재 위치와 작업 브랜치가 맞는지 확인 |
| 포트가 사용 중 | 본인이 켠 기존 앱이면 그 창에서 Ctrl+C. 다른 프로그램은 그대로 두고 아래 대체 포트 사용 |
| 페이지가 열리지 않음 | 실행 창이 켜져 있는지, 주소가 3번과 같은지 확인 |
| PC 페이지 404 / 조회 실행 안내 | 수정 전 서버가 켜져 있는지, 최신 작업 브랜치인지 확인 후 본인이 켠 앱을 종료하고 3번으로 재시작 |
| NATIVE_HOST_DISABLED / ALEKOV_CONNECT_UNAVAILABLE | 공식 실행 도구 사용 여부부터 확인. PC 전용 개발 실행이나 Demo·NoNativeHost는 계정 연결을 준비하지 않음 |
| ALEKOV_VAULT_* | 과제 판정과 별도. 코드·시각을 기록하고 수업용 AI 안내를 받음. 백신·보호 설정을 임의로 바꾸지 않음 |
| 권한 부족·시간 초과·일부 확인 불가 | 보호 설정을 바꾸거나 승격하지 않고, 해당 항목과 오류 안내를 기록 |
| SDP 미연결 | 기본 상태입니다. PC 조회와 별개이며 접속 인증서를 임의로 만들지 않음 |

대체 포트가 필요하면 3.1에서 Node를 선택한 **같은 PowerShell 창**에서 아래처럼 실행합니다. 설치형·휴대형 모두 같은 명령을 사용합니다.

~~~powershell
$keshevPort=5191
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port $keshevPort
~~~

주소는 http://127.0.0.1:5191/student/pc 입니다. 이 PowerShell 창의 포트 선택만 바뀝니다. 새 창에서는 3번의 Node·포트 선택부터 다시 진행합니다.

## 5일차 확인 기록

안내만 보고 수행한 사람이 다음을 채웁니다. 이름이나 개인정보는 적지 않습니다. 에이전트의 같은 PC 새 폴더 검증과 다른 사람의 수행 결과는 구분합니다.

~~~text
수행: 본인 / 다른 사람
날짜:
node --version:
시작 화면: 열림 / 안 열림
실제 조회: 됨 / 일부 확인 불가 / 안 됨
다시 조회·취소·종료:
막힌 단계와 오류 문구(키·토큰·개인정보 제외):
~~~

이번 과정의 6일차는 포장 없이 GitHub 저장소 주소와 40자리 커밋을 준비하는 단계입니다. package-app이나 새 포장 스크립트는 사용하지 않습니다. 구현·시험의 상세 범위는 DAY23.md와 DAY456.md를 따릅니다.
