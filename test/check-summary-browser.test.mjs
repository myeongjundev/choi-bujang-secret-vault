import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCheckSummaryReader } from '../src/check-summary-browser.mjs';

const fields = ['total', 'blocked', 'failed', 'notRun'];
function fixture() {
  const cells = fields.map(k => ({ dataset: { k }, textContent: '-' }));
  const meta = { textContent: '' }, button = { disabled: false };
  const document = {
    querySelectorAll(selector) { assert.equal(selector, '#ops-stats dd'); return cells; },
    getElementById(id) { assert.ok(['ops-meta', 'ops-refresh'].includes(id)); return id === 'ops-meta' ? meta : button; },
  };
  return { document, cells, meta, button, numbers: () => cells.map(cell => cell.textContent) };
}
const record = { total: 20, blocked: 18, failed: 0, notRun: 2,
  commit: '123456789abc', checkedAt: '2026-10-13T06:40:50.937Z', sources: { engine: { name: 'ALEPH SDP 엔진' } } };

test('root summary reads the public count fields independently without private requests or data', async () => {
  const ui = fixture(), calls = [];
  const publicRecord = { ...record };
  for (const key of ['notes', 'content', 'body', 'token', 'session', 'identity', 'approval']) {
    Object.defineProperty(publicRecord, key, { get() { throw new Error(`private field read: ${key}`); } });
  }
  const refresh = createCheckSummaryReader({ document: ui.document, fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store'); assert.equal(options.headers, undefined);
    return { ok: true, json: async () => publicRecord };
  } });
  await refresh();
  assert.deepEqual(calls, ['/api/checks']); assert.deepEqual(ui.numbers(), ['20', '18', '0', '2']);
  assert.ok(ui.meta.textContent.includes(record.checkedAt)); assert.ok(ui.meta.textContent.includes(record.commit));
  assert.ok(ui.meta.textContent.includes('ALEPH SDP 엔진')); assert.equal(ui.button.disabled, false);
});

test('unavailable or incomplete public summaries clear previously displayed numbers', async () => {
  const ui = fixture(); let response = { ok: true, json: async () => record };
  const refresh = createCheckSummaryReader({ document: ui.document, fetchImpl: async () => response });
  for (const invalid of [null, [], { ...record, notRun: undefined }, { ...record, blocked: -1 },
    { ...record, failed: 0.5 }, { ...record, total: 21 }, { ...record, notRun: '2' }]) {
    response = { ok: true, json: async () => record }; await refresh(); assert.deepEqual(ui.numbers(), ['20', '18', '0', '2']);
    response = { ok: true, json: async () => invalid }; await refresh(); assert.deepEqual(ui.numbers(), ['-', '-', '-', '-']);
    assert.ok(ui.meta.textContent.includes('읽지 못했습니다'));
  }
  response = { ok: true, json: async () => record }; await refresh();
  response = { ok: false }; await refresh(); assert.deepEqual(ui.numbers(), ['-', '-', '-', '-']);
  response = { ok: true, json: async () => { throw new Error('invalid JSON'); } }; await refresh();
  assert.deepEqual(ui.numbers(), ['-', '-', '-', '-']); assert.equal(ui.button.disabled, false);
});

test('an older successful response cannot restore numbers after the newer read failed', async () => {
  const ui = fixture(); let release, calls = 0;
  const refresh = createCheckSummaryReader({ document: ui.document, fetchImpl: async () => ++calls === 1
    ? { ok: true, json: () => new Promise(resolve => { release = resolve; }) }
    : { ok: false } });
  const older = refresh(); await new Promise(resolve => setImmediate(resolve));
  await refresh(); release(record); await older;
  assert.deepEqual(ui.numbers(), ['-', '-', '-', '-']); assert.ok(ui.meta.textContent.includes('읽지 못했습니다'));
});

test('root keeps approval controls and uses a separate generated summary module under self CSP', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="open-vault" disabled')); assert.ok(html.includes('src="/connect.js"'));
  assert.ok(!html.includes('id="login"')); assert.ok(!html.includes('id="notes"'));
  assert.ok(html.includes('id="ops-stats"')); assert.ok(html.includes('src="/check-summary.js"'));
  for (const key of fields) assert.ok(html.includes(`data-k="${key}"`));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/u.test(html));
  const build = await readFile(new URL('../scripts/build-public.mjs', import.meta.url), 'utf8');
  assert.ok(build.includes("'src/check-summary-browser.mjs'")); assert.ok(build.includes("'public/check-summary.js'"));
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(ignore.split(/\r?\n/u).includes('public/check-summary.js'));
});
