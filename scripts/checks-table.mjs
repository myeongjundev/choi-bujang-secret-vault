import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Render only the bounded public fields of this run's submission evidence.
// Past receipts, private response bodies and explanation fields are not copied.
const root = resolve(import.meta.dirname, '..');
const startMarker = '<!-- checks-table:start -->';
const endMarker = '<!-- checks-table:end -->';
const resultLabel = { blocked: '막음(기대대로)', breached: '뚫림', not_run: '미실행' };
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\bsk-[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const observedFacts = /^(?:not_run|HTTP [1-5]\d{2}(?:; (?:jsonReady=(?:true|false)|jsonArrayLength=\d+|bodyBytes=\d+|method=(?:GET|HEAD)|urlSha256=[a-f\d]{64}))*)$/u;
const boundedText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
const cell = value => String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|')
  .replace(/[\r\n]+/gu, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fail = () => { throw new Error('공개 점검 기록 형식 또는 비밀값 검사를 통과하지 못했습니다. 원문은 출력하지 않습니다.'); };

function evidence(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
    || !Number.isInteger(bundle.step) || bundle.step < 1 || bundle.step > 12
    || typeof bundle.commit !== 'string' || !/^[a-f\d]{40}$/u.test(bundle.commit)
    || typeof bundle.checkedAt !== 'string' || bundle.checkedAt.length > 40
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(bundle.checkedAt)
    || !Number.isFinite(Date.parse(bundle.checkedAt))
    || !Array.isArray(bundle.attackAttempts) || bundle.attackAttempts.length < 1 || bundle.attackAttempts.length > 20) fail();
  const rows = bundle.attackAttempts.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).sort().join(',') !== 'attackId,expected,observed,result,stage'
      || typeof item.attackId !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,79}$/iu.test(item.attackId)
      || !Number.isInteger(item.stage) || item.stage < 1 || item.stage > 12
      || !boundedText(item.expected) || !boundedText(item.observed)
      || typeof item.result !== 'string' || !Object.hasOwn(resultLabel, item.result) || !observedFacts.test(item.observed)
      || (item.observed === 'not_run' && item.result !== 'not_run')) fail();
    const { attackId, stage, expected, observed, result } = item;
    return { attackId, stage, expected, observed, result };
  }).sort((left, right) => left.stage - right.stage);
  if (new Set(rows.map(row => row.attackId)).size !== rows.length) fail();
  const record = { checkedAt: bundle.checkedAt, commit: bundle.commit, step: bundle.step, rows };
  if (secretPattern.test(JSON.stringify(record)) || /"?(?:title|body|content)"?\s*:/iu.test(rows.map(row => row.expected).join('\n'))) fail();
  return record;
}

function table(record) {
  const count = result => record.rows.filter(row => row.result === result).length;
  return [
    '## 이번 제출의 사례별 실측 기록',
    '',
    `점검 시각 ${record.checkedAt} · 커밋 ${record.commit} · 단계 ${record.step}`,
    '',
    '아래 표는 해당 커밋의 제출 묶음에 기록된 자기 점검 결과이며 심판 판정이 아닙니다. 고정 가상 규칙의 ready는 학생 계산의 기대 조건 일치이며 제공 엔진의 집행 결과가 아닙니다.',
    '',
    '| 단계 | 점검 ID | 기대 조건 | 실제 관측(observed) | 결과 |',
    '| --- | --- | --- | --- | --- |',
    ...record.rows.map(row => `| ${row.stage} | ${cell(row.attackId)} | ${cell(row.expected)} | ${cell(row.observed)} | ${resultLabel[row.result]} |`),
    '',
    `점검 항목 ${record.rows.length} · 막음 ${count('blocked')} · 뚫림 ${count('breached')} · 미실행 ${count('not_run')}`,
    '',
    '공식 41종 전체는 심판의 별도 시험이며 이 자기 점검 표에 포함하지 않습니다. 별도 운영 재현 계획 41종은 모두 미실행(not_run)으로 둡니다. 이 표에 없는 공격을 통과로 세지 않습니다.',
    '',
  ].join('\n');
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--write-readme')) throw new Error('지원하는 옵션은 --write-readme입니다.');
  const output = table(evidence(JSON.parse(readFileSync(join(root, 'artifacts', 'submission.json'), 'utf8'))));
  if (args[0] === '--write-readme') {
    const path = join(root, 'README.md');
    const readme = readFileSync(path, 'utf8');
    const from = readme.indexOf(startMarker), to = readme.indexOf(endMarker);
    let updated;
    if (from === -1 && to === -1) {
      updated = `${readme}\n\n${startMarker}\n\n${output}\n${endMarker}\n`;
    } else {
      if (from < 0 || to < from || readme.indexOf(startMarker, from + startMarker.length) !== -1
        || readme.indexOf(endMarker, to + endMarker.length) !== -1) throw new Error('README 점검 기록 표시가 불완전하거나 중복돼 갱신하지 않았습니다.');
      updated = `${readme.slice(0, from + startMarker.length)}\n\n${output}\n${readme.slice(to)}`;
    }
    writeFileSync(path, updated, 'utf8');
    process.stdout.write('README의 사례별 점검 기록 구간을 갱신했습니다.\n');
  } else {
    process.stdout.write(output);
  }
} catch (error) {
  const safeMessages = new Set(['지원하는 옵션은 --write-readme입니다.',
    'README 점검 기록 표시가 불완전하거나 중복돼 갱신하지 않았습니다.',
    '공개 점검 기록 형식 또는 비밀값 검사를 통과하지 못했습니다. 원문은 출력하지 않습니다.']);
  process.stderr.write(`${safeMessages.has(error.message) ? error.message : '점검 기록 파일을 읽거나 갱신하지 못했습니다. 원문은 출력하지 않습니다.'}\n`);
  process.exitCode = 1;
}
