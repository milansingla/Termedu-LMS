import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — DB calls will fail.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
