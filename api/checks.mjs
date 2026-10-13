import { readFileSync } from 'node:fs';
import { collectCheckSummary } from '../src/check-summary.mjs';
import { runFixedRuleCheck } from '../src/fixed-rule-check.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (req.query?.case !== undefined) {
    const result = typeof req.query.case === 'string' ? await runFixedRuleCheck(req.query.case) : null;
    return result ? res.status(200).json(result) : res.status(400).json({ error: 'unsupported_check' });
  }
  try {
    const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
    return res.status(200).json(await collectCheckSummary(config, { commit: process.env.VERCEL_GIT_COMMIT_SHA }));
  } catch { return res.status(503).json({ error: 'checks_unavailable' }); }
}
