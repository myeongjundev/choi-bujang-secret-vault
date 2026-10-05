import { createClient } from '@supabase/supabase-js';

// Stage 2 intentionally allows anonymous API reads; authentication follows in stage 3.
export function createNotesHandler(clientFactory = createClient, env = process.env) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
      return res.status(503).json({ error: 'storage_not_configured' });
    }
    try {
      const db = clientFactory(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }) },
      });
      const { data, error } = await db.from('notes').select('id,title,content').order('id');
      if (error || !Array.isArray(data)) return res.status(502).json({ error: 'storage_unavailable' });
      return res.status(200).json({ notes: data.map(({ id, title, content }) => ({ id, title, content })) });
    } catch {
      return res.status(502).json({ error: 'storage_unavailable' });
    }
  };
}

export default createNotesHandler();
