import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Service Role key must only be used server-side
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default supabaseAdmin;
