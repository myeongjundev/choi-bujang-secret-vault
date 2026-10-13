import { projectAlert, readFixture } from '../read-alerts.mjs';
export async function readAlerts(path = new URL('../fixtures/exfiltration.json', import.meta.url)) {
  return (await readFixture(path, 'exfiltration')).alerts.map(projectAlert);
}
