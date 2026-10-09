/**
 * Creates the settings table in Supabase and seeds all known API keys.
 * Run once: node create-settings-table.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const KEYS = [
  'DAILY_API_KEY', 'DAILY_DOMAIN',
  'GEMINI_API_KEY',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
];

async function run() {
  console.log('=== Settings table setup ===\n');

  // 1. Check if table exists by querying it
  const { error: checkErr } = await supabase.from('settings').select('key').limit(1);
  if (checkErr) {
    console.log('❌ settings table does not exist.');
    console.log('\nPlease run the following SQL in your Supabase SQL Editor:\n');
    console.log('CREATE TABLE IF NOT EXISTS settings (\n  key   TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);\n');
    console.log('Then re-run this script to seed the values.');
    process.exit(1);
  }
  console.log('✅ settings table exists.\n');

  // 2. Seed env vars into settings table
  const rows = KEYS
    .filter(k => process.env[k])
    .map(k => ({ key: k, value: process.env[k] }));

  if (!rows.length) {
    console.log('No env vars found to seed. Set them as Replit secrets first.');
    process.exit(0);
  }

  console.log(`Seeding ${rows.length} key(s):`);
  for (const { key } of rows) console.log(`  - ${key}`);

  const { error: upsertErr } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });
  if (upsertErr) {
    console.error('\n❌ Upsert error:', upsertErr.message);
    process.exit(1);
  }
  console.log('\n✅ All settings saved to Supabase successfully.');
  console.log('\nThe server will now load these automatically on startup.');
  process.exit(0);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
