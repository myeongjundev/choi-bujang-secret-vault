import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { connectionView, unavailableConnection } from '../src/connection-model.mjs';
import approvalHandler from '../api/device-approval.mjs';

test('installed, caller-approved, stale or offline state cannot open protected data', () => {
  assert.equal(connectionView({ installed: true, approved: true }).canOpen, false);
  assert.equal(connectionView({ ...unavailableConnection('fixture', new Date().toISOString()), approval: 'approved' }).canOpen, false);
  const engineFixture = { schema: 'vault.connection.v1', authority: 'ALEPH SDP engine', connected: true, approval: 'approved', checkedAt: new Date().toISOString() };
  assert.equal(connectionView(engineFixture).canOpen, true);
  assert.equal(connectionView(engineFixture, false).canOpen, false);
  assert.equal(connectionView({ ...engineFixture, approval: 'pending' }).canOpen, false);
  assert.equal(connectionView({ ...engineFixture, checkedAt: new Date(Date.now() - 60000).toISOString() }).canOpen, false);
});

test('approval POST is an unavailable adapter result, never self-enrollment', () => {
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  approvalHandler({ method: 'POST', body: { approved: true, role: 'operator', deviceRegistered: true } }, res);
  assert.equal(res.code, 503); assert.equal(res.body.connected, false); assert.equal(res.body.approval, 'unavailable');
});

test('offline caching is restricted to static UI, without API/data/session caching', async () => {
  const source = await readFile(new URL('../public/connect-sw.js', import.meta.url), 'utf8');
  const events = {}, handlers = [];
  const define = new Function('self', 'caches', 'fetch', `${source}; return PUBLIC_UI;`);
  const files = define({ location: { origin: 'https://fixture.local' }, addEventListener(name, handler) { events[name] = handler; } }, {}, () => {});
  assert.ok(files.every(path => !path.startsWith('/api/') && !['/', '/app.js', '/data.json'].includes(path)));
  for (const path of ['/api/notes', '/api/auth-config', '/', '/connect.html?token=untrusted']) {
    events.fetch({ request: { method: 'GET', url: `https://fixture.local${path}` }, respondWith() { handlers.push(path); } });
  }
  assert.deepEqual(handlers, []);
});
