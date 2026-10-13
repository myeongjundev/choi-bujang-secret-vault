import { projectAlert, readFixture } from '../read-alerts.mjs';
export async function readAlerts(path = new URL('../fixtures/persistence.json', import.meta.url)) {
  return (await readFixture(path, 'persistence')).alerts.map(projectAlert);
}
