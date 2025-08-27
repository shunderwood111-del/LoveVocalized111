// lib/supabaseServer.js  (CommonJS)
const { createClient } = require('@supabase/supabase-js')

function getSupabaseServer() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  }
  return createClient(url, key)
}

module.exports = { getSupabaseServer }
