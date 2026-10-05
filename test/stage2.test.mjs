import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { createNotesHandler } from '../api/notes.mjs';

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('anonymous GET works through the server and excludes owner and credentials', async () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, title: 'Test', content: 'Fixture', owner_id: 'private-owner' }));
  const fake = () => ({ from: () => ({ select: () => ({ order: async () => ({ data: rows, error: null }) }) }) });
  const res = response();
  await createNotesHandler(fake, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test-only' })({ method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.notes.length, 4);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(res.body).includes('private-owner'));
  assert.ok(!JSON.stringify(res.body).includes('test-only'));
});
test('unconfigured storage and non-read methods fail without contacting DB', async () => {
  const handler = createNotesHandler(() => { throw new Error('must not connect'); }, {});
  const missing = response(); await handler({ method: 'GET' }, missing);
  assert.equal(missing.code, 503);
  const write = response(); await handler({ method: 'POST' }, write);
  assert.equal(write.code, 405); assert.equal(write.headers.Allow, 'GET');
});
test('upstream failures do not disclose exception details', async () => {
  const res = response();
  await createNotesHandler(() => { throw new Error('internal details'); },
    { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test-only' })({ method: 'GET' }, res);
  assert.equal(res.code, 502);
  assert.deepEqual(res.body, { error: 'storage_unavailable' });
});
test('latest static files have no seed and browser fetches only the server API', async () => {
  await assert.rejects(access(new URL('../data.json', import.meta.url)));
  await assert.rejects(access(new URL('../public/data.json', import.meta.url)));
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("fetch('/api/notes'"));
  assert.ok(!html.includes('SUPABASE_SECRET_KEY'));
  assert.ok(!/실습용 가상.{1,20}기록/u.test(html));
});
