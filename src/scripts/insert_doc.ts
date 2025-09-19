// run this to instert a doc with source and title
// run command example - pnpm tsx src/scripts/insert_doc.ts "Texas"
// output will be - inserted doc_id=<doc_id>
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing env');

// Usage: tsx src/scripts/insert_doc.ts "<title>"
const [title, source = 'wikivoyage'] = process.argv.slice(2);
if (!title) throw new Error('Usage: tsx src/scripts/insert_doc.ts "<title>" [source=wikivoyage]');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await supabase
    .from('docs')
    .insert({ source, title })
    .select('id')
    .single();
  if (error) throw error;
  console.log(`inserted doc_id=${data.id}`);
})().catch(e => {
  console.error('insert failed:', e);
  process.exit(1);
});
