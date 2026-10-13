import { projectAlert, readFixture } from '../read-alerts.mjs';
export async function readAlerts(path = new URL('../fixtures/privilege.json', import.meta.url)) {
  return (await readFixture(path, 'privilege')).alerts.map(projectAlert);
}
