// Public provenance. Student calculations do not prove engine enforcement.
export const ENGINE = 'ALEPH SDP 엔진';
export const SOURCES = Object.freeze({
  student: Object.freeze({ label: '학생이 만든 것', parts: Object.freeze([
    '판정기(src/decider.mjs)', '탐지 규칙(src/detect.mjs)', '접속 앱(public/)',
    '자료실(api/, supabase/)', '점검 코드(src/attack-check.mjs, src/fixed-rule-check.mjs)',
  ]) }),
  engine: Object.freeze({ label: '제공 엔진', name: ENGINE,
    role: '학생 판정 결과와 탐지 규칙의 회수 제안을 집행하고 요청 서명을 검증합니다. 엔진 코드는 이 저장소에 없으며 이 기록의 엔진 집행은 미실행입니다.' }),
});
export const SOURCE_OF = Object.freeze({
  decider: '학생 판정기(src/decider.mjs)',
  detect: '학생 탐지 규칙(src/detect.mjs)',
  attackCheck: '학생 점검 코드(src/attack-check.mjs)',
});
