# 2·3일차 · 실제 PC 읽기 전용 조회

2026-10-27 KST. 제공 시작 틀 0.2.14에 PC 조회가 없어 학생 영역에 추가했다. 제공 서버·화면·인증 파일을 고친 기능이나 승인 host의 제공 기능으로 세지 않는다. 기존 13~22단계 학생 함수와 이전 자료실을 보존했다.

## 실행과 확인

기존 on-client 폴더에서 다음 명령을 실행한다. 이미 5189를 쓰는 서버가 있으면 그 실행 창에서 Ctrl+C로 먼저 종료한다. 다른 프로그램을 강제로 끄지 않는다.

~~~powershell
node student/run-local-pc.mjs
~~~

브라우저에서 http://127.0.0.1:5189/ 를 연다. 보호 현황의 학생 상태 영역에서 **내 PC 상태·연결 기록으로 이동 → PC 상태 조회**를 누른다. Enter 키로도 조회·취소할 수 있다.

1. CPU %, 메모리 사용/전체 GiB와 %, 프로젝트 볼륨의 디스크 여유/전체 GiB, 7개 항목 조회 상태를 확인한다. GiB는 1024³ 바이트다. 숫자마다 시각을 붙였다.
2. PC 상태 다시 조회를 누르면 이전 조회 대비 CPU·메모리 %p와 최근 5회 비교 표가 나온다. 최근 20회만 화면 메모리에 보관하며 저장·자동 전송·자동 감시는 하지 않는다.
3. 아래 네트워크 주소 구성, Domain/Private/Public 방화벽 프로필 설정, System/Application 경고·오류를 확인한다. 로그는 최근 24시간의 level 2 오류와 level 3 경고, 최근 최대 5,000건이다. 상한에 도달하면 일부 조회·최소 건수로 표시한다.
4. 요청 중에는 이전 숫자를 제거한다. PC 조회 취소를 누르면 확인 불가로 바뀌며 늦은 응답을 거절한다. 마지막 읽기 요청이 끊기면 서버의 수집도 중단한다. 그 뒤 다시 조회로 복구한다.
5. SDP 미연결은 PC 조회 성공과 별개다. Windows 경고·오류 건수는 침해나 공격 탐지 결과가 아니다. 방화벽 설정을 읽은 결과도 차단 효과를 시험했다는 뜻이 아니다.

끝낼 때 실행 창에서 Ctrl+C를 누른다. 같은 명령으로 다시 실행하면 된다. 예제 모드가 필요하면 이 학생 명령 끝에 --demo를 붙인다. 이때도 PC 수치는 실제 PC 측정이고 SDP 자료만 예제라고 따로 표시한다.

기존 npm start와 npm run demo는 그대로다. 두 명령은 학생 PC 조회 경로를 추가하지 않는다. 그 상태에서 PC 조회를 누르면 확인 불가와 학생 실행 명령을 안내한다. 제공 실행 도구나 승인 host에 이번 기능이 자동 반영됐다고 가정하지 않는다.

## 파일과 경계

| 학생 파일 | 역할 |
| --- | --- |
| extension.mjs | 기존 여덟 함수 보존, PC 표시·검증·수동 조회·추이 추가 |
| local-pc.mjs | Node os/fs 실제 수집, 항목별 오류 격리·허용 필드 투영 |
| read-local-windows.ps1 | 일반 권한 Get-NetFirewallProfile, Get-WinEvent 집계만 수행 |
| run-local-pc.mjs | 기존 제공 요청 처리기 유지, 고정 조회/스타일 경로만 추가 |
| local-pc.css | 추가 PC 패널만 꾸밈 |
| tests/local-pc.test.mjs | 정상·부분 실패·취소·권한·로컬 경계 시험 13개 |

CPU는 약 800ms 간 전체 논리 CPU 시간 차이로 계산한다. 메모리는 os.totalmem/freemem, 디스크는 프로젝트가 있는 볼륨의 fs.statfs.bavail × bsize를 사용한다. 네트워크는 비내부 인터페이스별 IPv4/IPv6 주소 개수만 보여 준다. IP/MAC/원문 인터페이스 이름·게이트웨이·DNS 주소는 결과에 넣지 않으며 인터넷 연결 여부를 검사하지 않는다.

추가 GET /api/student/local-pc는 127.0.0.1 바인딩, 정확한 Host, 같은 출처 Origin/Fetch Metadata, X-Keshev-Local-Read 헤더, 쿼리/본문/쓰기 메서드 거절을 적용한다. HTTP 입력으로 PowerShell 명령·로그 이름·파일 경로를 정하지 않는다. 수집은 하나로 합치고 Windows 자식 프로세스에 14초/64KiB 상한을 둔다. 외부 사이트 허용 CORS는 없다. 기본 제공 경로의 보안 검사도 유지한다. 로컬의 다른 프로세스를 격리하는 인증 경계나 승인된 설치형 런타임은 아니다.

## 검증 결과와 한계

- 2026-10-27 이 Windows PC의 비관리자 토큰으로 실제 7/7 항목을 읽었다. 승인이나 권한 승격, 방화벽·보호 설정 변경, 공격 시험은 하지 않았다.
- 기존 38개와 새 13개, 합계 **51개 시험 통과**. 문법 검사도 통과했다.
- Chrome에서 실제 조회, 시각·단위, SDP 분리, 재조회 중 이전 수치 제거, 취소·복구, 이전 비교, 제공 화면 재조회 뒤 표시 유지, Enter 키 조작을 확인했다.
- 브라우저/창 캡처는 도구가 현재 URL을 충분히 확인하지 못해 중단됐다. 화면 사진은 확보하지 못했고 시각적 배치 QA가 끝났다고 쓰지 않는다. DOM 기반 동작 확인 기록은 별도로 보관했다.
- 실제 Node는 24.15.0이다. 제공 package.json 선언 24.19.0과 달라 선언 범위 밖의 실행 증거다. 다른 OS/다른 PC·일반 사용자 인수 시험·설치형 승인 host·포장·실제 SDP/AI/집행은 미검증이다.
- 값은 누른 시각의 관측이며 CPU·메모리 사용량의 원인을 진단하거나 안전 여부를 판정하지 않는다. 실패는 항목별 확인 불가로 남기고 0건/정상으로 바꾸지 않는다.

~~~powershell
npm run check
node --test student/tests/*.test.mjs
~~~

## 면접에서 설명할 문장

> 제공된 PC 수집 기능이 없어 학생 영역에 읽기 전용 수집과 화면을 추가했습니다. Node의 실제 자원 통계와 Windows의 방화벽 설정·로그 집계를 사용하되, 조회 성공을 보안 안전이나 공격 탐지로 해석하지 않도록 구분했습니다. 부분 실패·취소·늦은 응답과 로컬 API 접근 경계를 시험했고, 설치형 런타임 검증은 별도로 남겼습니다.

참고한 공식 API: [Node os](https://nodejs.org/docs/latest-v24.x/api/os.html), [Node fs.statfs](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesstatfspath-options), [Get-NetFirewallProfile](https://learn.microsoft.com/en-us/powershell/module/netsecurity/get-netfirewallprofile?view=windowsserver2025-ps), [Get-WinEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent?view=powershell-5.1).
