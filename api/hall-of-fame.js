import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!supabaseAdmin) {
    return res.status(500).json({
      error: 'Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('hall_of_fame')
      .select('*')
      .order('titles', { ascending: false })
      .order('ovr', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { team, region, title, titles, ovr } = req.body || {};

    if (!team) {
      return res.status(400).json({ error: 'Team is required.' });
    }

    const { data, error } = await supabaseAdmin
      .from('hall_of_fame')
      .upsert(
        {
          team,
          region: region || 'Global',
          title: title || 'World Champion',
          titles: Number(titles || 1),
          ovr: Number(ovr || 0),
        },
        { onConflict: 'team' }
      )
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || []);
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
