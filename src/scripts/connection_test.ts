/*
 * Goal: load data (Wikivoyage → docs/chunks → embeddings(pgvector))
 * Run: pnpm tsx scripts/ingest.ts
 */
 
import 'dotenv/config';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'] as const;
for (const k of need)
  if (!process.env[k]) {
    console.error(`Missing ${k}`);
    process.exit(1);
  }

async function main() {
  // Create Supabase + OpenAI clients
  const supabase = createClient(
    process.env.SUPABASE_URL!, // non-null: we validated above
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role for server scripts
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Helper: ask Supabase for table row counts without fetching rows
  const count = async (t: string) =>
    (await supabase.from(t).select('*', { head: true, count: 'exact' })).count ?? 0;

  // Run 3 count queries in parallel (faster)
  const [docs, chunks, embeds] = await Promise.all(['docs', 'chunks', 'embeddings'].map(count));
  console.log(`Supabase OK – counts: docs=${docs}, chunks=${chunks}, embeddings=${embeds}`);

  // Tiny embedding request to verify OpenAI connectivity + dimensions
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'ping',
  });
  console.log(`OpenAI OK – dim=${data[0].embedding.length}`);
}

main().catch((err) => {
  // Friendly error surface if anything throws
  console.error('Smoke test failed:', err);
  process.exit(1);
});
