// Standalone classification only. No process, file, network or environment access.
const PATTERNS = Object.freeze([
  { name: 'ps_unsigned_service', minLevel: 10, confidence: 0.96 },
  { name: 'ps_unfamiliar_service', minLevel: 10, confidence: 0.94 },
  { name: 'ps_scheduled_task', minLevel: 10, confidence: 0.94 },
  { name: 'ps_startup_change', minLevel: 10, confidence: 0.93 },
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.slice(0, 4000) : '';
function decision(confidence, pattern, detail) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: `${pattern}: ${detail}` };
}
export function decide(alert) {
  if (!object(alert) || !object(alert.rule) || !object(alert.data)) {
    return decision(0.5, 'ps_invalid', 'unconfirmed event; alert only');
  }
  const description = text(alert.rule.description);
  const path = text(alert.data.path);
  const level = Number.isInteger(alert.rule.level) ? alert.rule.level : 0;
  const count = typeof alert.data.count === 'number' || typeof alert.data.count === 'string'
    ? Number(alert.data.count) : 0;
  const executable = /\.(?:exe|com|cmd|bat|ps1)$/iu.test(path);
  const temporary = executable && /(?:^|[\\/])(?:temp|tmp)[\\/]/iu.test(path);
  const startupPath = executable && /[\\/]Startup[\\/]/iu.test(path);
  const unsigned = /서명\s*없는|서명(?:이|은)?\s*없(?:습니다|음)|\bunsigned\b/iu.test(description);
  const unknown = /평소\s*목록에\s*없|처음\s*보는|낯선|\bunfamiliar\b|not in (?:the )?baseline/iu.test(description);
  const service = /서비스|\bservice\b/iu.test(description);
  const task = /예약\s*작업|scheduled\s*task/iu.test(description);
  const startup = /시작\s*(?:폴더|프로그램|항목)|\bstartup\b/iu.test(description);
  const mutation = /등록|추가|새\s*서비스|실행\s*파일.{0,20}(?:바뀌|변경)|(?:new|create|register|modify)/iu.test(description);
  const noMutation = /등록(?:은|이)?\s*없|변경(?:은|이)?\s*없|실행\s*파일은\s*그대로|읽기만|등록.{0,8}않/iu.test(description);
  const taskRisk = unknown || /임의\s*문자열|수업\s*시간\s*밖|outside.{0,15}(?:class|hours)/iu.test(description)
    || startup && /같은.{0,15}(?:파일|프로그램).{0,15}(?:함께|가리)/iu.test(description);
  const matched = [
    service && unsigned && mutation && !noMutation && (temporary || Number.isSafeInteger(count) && count >= 3),
    service && unknown && mutation && !noMutation && temporary,
    task && taskRisk && !noMutation && temporary,
    startup && unknown && mutation && !noMutation && startupPath,
  ];
  const index = matched.findIndex((matches, i) => matches && level >= PATTERNS[i].minLevel);
  if (index >= 0) return decision(PATTERNS[index].confidence, PATTERNS[index].name, 'corroborated persistence evidence');
  // A technique tag, unknown signature, temporary file or level alone cannot block.
  if (level >= 5 || matched.some(Boolean)) return decision(0.55, 'ps_unconfirmed', 'incomplete evidence; alert only');
  return decision(0.1, 'ps_normal', 'no corroborated persistence evidence');
}
