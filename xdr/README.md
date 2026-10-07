# XDR-01 / XDR-02 보너스 모듈

자료 출처: https://github.com/ChoiTimo/aleph-defense-starter 의 main 커밋 8a0927400ec0d0a8ff08146db773fec80fb6d216. 두 fixtures는 원본 그대로 복사했다. 모든 주소는 문서용 대역이며 계정과 경보는 가상이다. 다른 네 보너스의 시험 자료는 이번 작업에 포함하지 않았다.

## 실행

```
npm run xdr:run -- brute-force
npm run xdr:run -- web-injection
npm run xdr:test
npm run xdr:replay
```

제출용 decide.mjs는 npm run xdr:build로 decide-source.mjs와 patterns.json에서 생성한 단일 ES 모듈이다. 저장소의 다른 파일·Node 전용 모듈을 import하지 않아 파일 하나만 전달되는 격리 환경에서도 실행된다. 시험은 data: URL로 모듈을 독립 실행하고 모든 원본 경보의 결과가 로컬 실행과 일치하는지 확인한다. 실제 Jev를 연결할 호스트는 사용하는 decide.mjs의 setJevReviewer를 호출해야 하며, 설정하지 않으면 알림 fallback이다.

각 result.json은 공식 aleph.xdr.result.v1 계약을 따른다. 실행기는 실제 decide(alert)를 다시 호출하므로 저장된 결과를 정답으로 읽지 않는다. 경보 ID·계정·주소·정답 순서를 기준으로 행동을 하드코딩하지 않는다. read-alerts.mjs는 경보 수만큼 시각·출발 주소·가명 계정·수준·비밀값을 지운 설명의 다섯 필드를 반환한다. 알림 로그에는 설명 원문·계정·키·URL을 쓰지 않는다.

## 판단

patterns.json의 이름·조건·근거를 사용한다. MITRE T1110/T1110.003과 T1190은 공격 분류의 근거이며 건수와 수준 임계값은 이 학습 정책이다. 명확한 로그인 실패 집계 또는 계정 순회, 반복되는 주입 구조를 복합 근거로 검사한다. 수준 하나나 SQL/script 수업 단어 하나로 차단하지 않는다. 주입 문자열은 문자열로만 검사하며 실행하지 않는다.

확신도 0.85 이상 block, 0.5 이상 alert, 그 미만 record. 명확한 패턴과 정상 이벤트는 로컬 판단하며 애매한 이벤트만 Jev reviewer 인터페이스를 사용한다. 실제 Jev 공급자·URL·키·계약은 제공되지 않았고 현재 연결하지 않았다. unavailable·오류·비정상 confidence·1초 timeout은 alert로 처리한다. 테스트의 mock reviewer는 실제 Jev 응답과 구분한다. reviewer에 전달하는 자료는 패턴 이름·수준·건수뿐이다.

## 기존 판정기를 보존하는 deny overlay

scripts/xdr-run.mjs는 block 후보만 xdr/deny-rules.json에 기록하며 alert/record는 거부 규칙이 되지 않는다. 각 후보는 sourceIp, issuedAt, 15분 뒤 expiresAt, evidenceAlertId를 포함한다. 경보 시각을 기준으로 하므로 과거 시험 경보의 규칙은 실제 현재 시각에는 이미 만료됐다. 재생성 시 다른 모듈의 규칙을 보존하고 같은 경보의 알림은 중복하지 않는다. 파생 로그·규칙·replay 결과는 Git에서 제외한다.

xdr/ztna-overlay.mjs의 withXdr(baseDecide, rules)는 유효한 거부 후보가 일치할 때만 거부하고, 나머지는 기존 baseDecide에 그대로 위임한다. 확인되지 않은 sourceIp는 차단 근거로 사용하지 않는다. 브라우저가 제출한 IP나 X-Forwarded-For를 신뢰하는 연결은 만들지 않았다.

현재 docs/DECIDER_REQUEST.md의 18개 요청 필드에는 확인된 원본 IP가 없고 signals.source도 실경로에서는 none이다. 따라서 운영 엔진의 출발 주소 공급 계약과 xdr_blocked 이유 코드 등록 전에는 실제 ZTNA 경로에 연결됐다고 말하지 않는다. src/decider.mjs와 RULE_IDS는 보존했다. 모듈 시험의 정상 통과는 허용하는 시험용 기본 정책에 대한 결과이며 현재 starter.deny의 운영 허용을 뜻하지 않는다.

## 관찰한 로컬 결과

- brute-force: block 10, alert 9, record 9.
- web-injection: block 8, alert 9, record 9.
- 모의 overlay: 공격 18건 거부, 정상 거부 0, 애매한 경보 거부 0, 모든 관련 규칙 만료 후 거부 0.
- XDR 회귀시험 5개와 기존 자료실 시험 7개 통과. 운영 심판 결과는 별도로 확인한다.
