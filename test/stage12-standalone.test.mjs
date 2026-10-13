import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appUrl = 'https://standalone.fixture.local';
const authOrigin = 'https://standalone.fixture.supabase.co';
const config = { step: 12, publicAppUrl: appUrl, sampleMarker: 'fixture-marker-not-in-response',
  originalApiUrl: `${authOrigin}/rest/v1/user_notes` };

async function isolatedChecker() {
  const source = await readFile(new URL('../src/attack-check.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s|\bimport\s*\(/mu, 'the isolated entry point has no imports');
  // A data module has no repository directory for relative imports or config reads.
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function deployment(calls) {
  return async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    assert.ok(['GET', 'HEAD'].includes(options.method), 'the isolated checker never sends writes');
    assert.deepEqual(Object.keys(options.alephEvidence).sort(), ['caseId', 'requestKey']);
    assert.match(options.alephEvidence.requestKey, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u);
    assert.ok(!url.href.includes(options.alephEvidence.requestKey));
    assert.ok(!JSON.stringify(options.headers).includes(options.alephEvidence.requestKey));
    if (url.pathname === '/api/auth-config') return Response.json({ url: authOrigin, publishableKey: 'public-fixture' });
    if (url.pathname === '/api/checks') return Response.json({ caseId: url.searchParams.get('case'), ready: true,
      source: url.searchParams.get('case') === 'local_detection_121' ? '학생 탐지 규칙(src/detect.mjs)' : '학생 판정기(src/decider.mjs)',
      fixtureType: 'fixed_fixture', engine: 'ALEPH SDP 엔진', engineEnforced: 'not_run' });
    if (url.pathname === '/api/recovery-plan') return Response.json({ backupVerified: true, scope: 'notes' });
    if (url.pathname === '/api/device-status') return Response.json({ connected: false, approval: 'unavailable' });
    if (url.pathname === '/api/operations-status') return Response.json({ schema: 'vault.operations.v1',
      counts: { passed: 7, failed: 0, notRun: 7, officialEngineNotRun: 41 } });
    return new Response('{}', { status: url.pathname === '/data.json' ? 404
      : url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/') ? 401 : 200 });
  };
}

test('the checker runs from a data module with either input form and no repository URL', async () => {
  const { runAttackChecks } = await isolatedChecker();
  const outputs = [];
  for (const input of [config, appUrl]) {
    const calls = [];
    const attempts = await runAttackChecks(input, { fetchImpl: deployment(calls) });
    assert.equal(attempts.length, 12);
    assert.ok(attempts.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed,result,stage'));
    assert.deepEqual(['blocked', 'breached', 'not_run'].map(result => attempts.filter(row => row.result === result).length), [10, 0, 2]);
    const unexecuted = attempts.filter(row => row.result === 'not_run');
    assert.deepEqual(unexecuted.map(row => row.stage).sort(), [10, 11]);
    assert.ok(unexecuted.every(row => row.observed === 'not_run'
      && !calls.some(call => call.options.alephEvidence.caseId === row.attackId)));
    assert.ok(!calls.some(call => call.url.pathname.startsWith('/api/restore/')));
    for (const row of attempts.filter(row => row.result !== 'not_run')) {
      assert.equal(calls.filter(call => call.options.alephEvidence.caseId === row.attackId).length, 1);
    }
    const otherNote = attempts.find(row => row.attackId === 'anonymous_other_note');
    assert.equal(otherNote?.stage, 4);
    assert.equal(otherNote.observed, 'HTTP 401');
    assert.ok(calls.some(call => call.options.alephEvidence.caseId === otherNote.attackId
      && call.url.pathname === '/api/notes/00000000-0000-4000-8000-000000000004'));
    assert.equal(new Set(calls.map(call => call.options.alephEvidence.requestKey)).size, calls.length);
    const original = calls.filter(call => call.url.pathname === '/rest/v1/user_notes');
    assert.equal(original.length, 1);
    assert.equal(original[0].url.href, config.originalApiUrl);
    outputs.push(attempts);
  }
  assert.deepEqual(outputs[0], outputs[1]);
});

test('the isolated config input still rejects an original API outside the observed auth origin', async () => {
  const { runAttackChecks } = await isolatedChecker();
  const calls = [];
  await assert.rejects(runAttackChecks({ ...config, originalApiUrl: 'https://other.fixture.supabase.co/rest/v1/user_notes' },
    { fetchImpl: deployment(calls) }), /invalid_original_api_origin/u);
  assert.ok(calls.some(call => call.url.pathname === '/api/auth-config'));
  assert.ok(!calls.some(call => call.url.origin === 'https://other.fixture.supabase.co'));
});
