// Pure standalone classification. No transmission, file or network operations.
const PATTERNS = Object.freeze([
  { name: 'ex_unfamiliar_bulk', minLevel: 10, minBytes: 50000000, minFiles: 100, confidence: 0.96 },
  { name: 'ex_unfamiliar_archive', minLevel: 10, minBytes: 50000000, minFiles: 2, confidence: 0.95 },
  { name: 'ex_repeated_transfer', minLevel: 10, minBytes: 50000000, minCount: 5, confidence: 0.94 },
  { name: 'ex_unusual_port', minLevel: 10, minBytes: 50000000, minFiles: 20, confidence: 0.95 },
  { name: 'ex_full_copy', minLevel: 10, minBytes: 100000000, minFiles: 100, confidence: 0.96 },
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.slice(0, 4000) : '';
function number(value) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^(?:0|[1-9]\d{0,15})$/u.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function ip(value) {
  if (typeof value !== 'string') return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value)) {
    return value.split('.').every(part => Number(part) <= 255 && String(Number(part)) === part);
  }
  if (/^[a-f\d:]+$/iu.test(value) && value.includes(':')) {
    try { return Boolean(new URL(`http://[${value}]/`).hostname); } catch { return false; }
  }
  return false;
}
function decision(confidence, pattern, detail) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: `${pattern}: ${detail}` };
}
export function decide(alert) {
  if (!object(alert) || !object(alert.rule) || !object(alert.data)) {
    return decision(0.5, 'ex_invalid', 'unconfirmed event; alert only');
  }
  const description = text(alert.rule.description);
  const level = Number.isInteger(alert.rule.level) ? alert.rule.level : 0;
  const bytes = number(alert.data.bytes);
  const files = number(alert.data.files) ?? 0;
  const count = number(alert.data.count) ?? 0;
  const unfamiliar = /처음\s*(?:보는|봅니다)|낯선|unfamiliar/iu.test(description);
  const offHours = /(?:수업|업무)\s*시간\s*밖|outside.{0,15}hours/iu.test(description);
  const archive = /압축\s*파일|\barchive\b/iu.test(description);
  const unusualPort = /(?:평소에\s*)?쓰지\s*않던\s*포트|unusual\s*port/iu.test(description);
  const repeatedLarge = /대용량\s*전송.{0,30}반복/iu.test(description);
  const commandChannel = /명령\s*통로|command.{0,15}channel/iu.test(description);
  const fullCopy = /자료실\s*전체|전체\s*자료/iu.test(description)
    && /짧은\s*시간|10분\s*안/iu.test(description) && /외부/iu.test(description);
  const outgoing = /나갔|올라갔|전송|외부.{0,20}복사|sent|transfer/iu.test(description);
  const incomplete = /실패|전송.{0,16}(?:없|아직|취소)|반출.{0,8}없/iu.test(description);
  const signals = [
    unfamiliar && files >= PATTERNS[0].minFiles,
    unfamiliar && archive && (offHours || files >= PATTERNS[1].minFiles),
    count >= PATTERNS[2].minCount && (unfamiliar || offHours || repeatedLarge || commandChannel),
    unusualPort && files >= PATTERNS[3].minFiles,
    fullCopy && files >= PATTERNS[4].minFiles,
  ];
  const index = signals.findIndex((matches, i) => matches && outgoing && !incomplete
    && ip(alert.data.dstip) && bytes !== null && bytes >= PATTERNS[i].minBytes && level >= PATTERNS[i].minLevel);
  if (index >= 0) return decision(PATTERNS[index].confidence, PATTERNS[index].name, 'corroborated outbound transfer');
  if (level >= 5 || unfamiliar || signals.some(Boolean)) return decision(0.55, 'ex_unconfirmed', 'incomplete evidence; alert only');
  return decision(0.1, 'ex_normal', 'no corroborated exfiltration evidence');
}
