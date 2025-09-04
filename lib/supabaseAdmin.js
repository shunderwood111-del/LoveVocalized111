// lib/supabaseAdmin.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('Missing SUPABASE_URL (server env)');
}
if (!serviceKey) {
  // This is the one causing your current error
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server env)');
}

// Server-side client only (no session persistence)
const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabaseAdmin;
