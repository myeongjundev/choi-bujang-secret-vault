// Pure standalone classification of the provided synthetic event contract.
const PATTERNS = Object.freeze([
  { name: 'pv_admin_group', minLevel: 10, confidence: 0.96 },
  { name: 'pv_recent_admin_use', minLevel: 10, confidence: 0.94 },
  { name: 'pv_unusual_admin_use', minLevel: 10, confidence: 0.95 },
  { name: 'pv_admin_reentry', minLevel: 10, confidence: 0.93 },
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.slice(0, 4000) : '';
function decision(confidence, pattern, detail) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: `${pattern}: ${detail}` };
}
export function decide(alert) {
  if (!object(alert) || !object(alert.rule) || !object(alert.data)) {
    return decision(0.5, 'pv_invalid', 'unconfirmed event; alert only');
  }
  const description = text(alert.rule.description);
  const level = Number.isInteger(alert.rule.level) ? alert.rule.level : 0;
  const group = text(alert.data.group);
  const count = typeof alert.data.count === 'number' || typeof alert.data.count === 'string'
    ? Number(alert.data.count) : 0;
  const adminGroup = /^(?:administrators|관리자)$/iu.test(group);
  const addition = /추가|들어(?:가|왔|오)|그룹.{0,20}편입|group.{0,20}add/iu.test(description);
  const command = /(?:관리자|권한)\s*명령.{0,25}실행|명령\s*실행/iu.test(description);
  const adminCommand = command && /관리자|administrator/iu.test(description);
  const recent = /방금.{0,30}관리자|최근.{0,30}권한\s*상승|newly.{0,15}admin/iu.test(description);
  const remote = /원격\s*주소|remote\s*(?:address|source)/iu.test(description);
  const unfamiliar = /처음\s*(?:보는|봅니다)|낯선|unfamiliar/iu.test(description);
  const offHours = /수업\s*시간\s*밖|업무처럼\s*보이지\s*않는\s*시각|업무\s*시간\s*밖|outside.{0,15}hours/iu.test(description);
  const changedSession = /세션.{0,30}관리자\s*권한.{0,15}(?:바뀌|변경)/iu.test(description);
  const otherAccount = /다른\s*계정의\s*권한|another\s*account/iu.test(description);
  const reentry = /(?:빠진|제거|회수).{0,60}[1-5]\s*분.{0,40}다시\s*관리자/iu.test(description);
  const incomplete = /취소|실패|명령(?:은|이)?\s*없|변경(?:은|이)?\s*없|읽기만|관리자\s*그룹은\s*아닙/iu.test(description);
  const matched = [
    adminGroup && addition && (remote || command || Number.isSafeInteger(count) && count >= 4),
    recent && adminCommand,
    adminCommand && unfamiliar && offHours || changedSession && unfamiliar || adminCommand && otherAccount,
    adminGroup && reentry && Number.isSafeInteger(count) && count >= 2,
  ];
  const index = matched.findIndex((matches, i) => matches && !incomplete && level >= PATTERNS[i].minLevel);
  if (index >= 0) return decision(PATTERNS[index].confidence, PATTERNS[index].name, 'corroborated privilege misuse');
  if (level >= 5 || matched.some(Boolean)) return decision(0.55, 'pv_unconfirmed', 'incomplete evidence; alert only');
  return decision(0.1, 'pv_normal', 'no corroborated privilege misuse');
}
