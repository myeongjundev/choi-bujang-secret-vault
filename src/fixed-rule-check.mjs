// Public fixed fictional inputs only. Never authorizes a real user/device.
import { decide } from './decider.mjs';
import { detect } from './detect.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { ENGINE, SOURCE_OF } from './sources.mjs';

export async function runFixedRuleCheck(caseId) {
  if (caseId === 'local_detection_121') {
    const events = Array.from({ length: 121 }, (_, index) => ({ at: new Date(1700000000000 + index * 2000).toISOString(),
      method: 'GET', identity: { sub: 'fixed_subject_fixture' } }));
    const out = detect(events);
    return { caseId, ready: out.action === 'propose_revocation', source: SOURCE_OF.detect,
      fixtureType: 'fixed_fixture', engine: ENGINE, engineEnforced: 'not_run', action: out.action };
  }
  if (!['local_unregistered_device', 'local_compound_risk', 'local_unknown_route'].includes(caseId)) return null;
  const { normal, suspicious } = fixtureRequests();
  const input = caseId === 'local_unregistered_device' ? { ...normal, deviceRegistered: false }
    : caseId === 'local_compound_risk' ? suspicious : { ...normal, path: '/__unknown__', route: 'GET /__unknown__' };
  const expected = caseId === 'local_compound_risk' ? 'step_up' : 'deny';
  const out = await decide(input);
  return { caseId, ready: out.decision === expected, source: SOURCE_OF.decider,
    fixtureType: 'fixed_fixture', engine: ENGINE, engineEnforced: 'not_run', decision: out.decision, reasonCode: out.reasonCode };
}
