// run after insert_docs.ts, insert_chunks.ts, create_embeddings.ts
// use json in .cache
// run command: pnpm tsx src/scripts/insert_embeddings.ts .cache/emb-<doc_id>.json
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function main(cachePath: string) {
  // 1) Load cached embeddings: [{ chunk_id, embedding }]
  const vectors: { chunk_id: string; embedding: number[] }[] = JSON.parse(
    fs.readFileSync(cachePath, 'utf8'),
  );

  // 2) Resolve doc_id from first chunk (for sanity counts)
  const { data: firstChunk, error: chErr } = await supabase
    .from('chunks')
    .select('doc_id')
    .eq('id', vectors[0].chunk_id)
    .single();

  if (chErr || !firstChunk) {
    if (chErr) throw chErr;
    throw new Error('No first chunk');
  }

  const docId = firstChunk.doc_id as string;

  // 3) Batched upsert into embeddings
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < vectors.length; i += BATCH) {
    const slice = vectors.slice(i, i + BATCH);
    // If embeddings.chunk_id is PRIMARY KEY, upsert: true avoids duplicates on re-runs
    const { error } = await supabase.from('embeddings').upsert(slice, { ignoreDuplicates: false });
    if (error) throw error;
    inserted += slice.length;
  }

  // 4) Post-insert sanity (chunks vs embeddings for this doc_id)
  const { count: chunkCount } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .eq('doc_id', docId);

  const { count: embCount } = await supabase
    .from('embeddings')
    .select('chunk_id', { count: 'exact', head: true })
    .in('chunk_id', vectors.map(v => v.chunk_id));

  console.log(`inserted ${inserted} embeddings (attempted); doc=${docId}`);
  console.log(
    `sanity: chunks=${chunkCount !== null && chunkCount !== undefined ? chunkCount : 'n/a'} ` +
      `embeddings=${embCount !== null && embCount !== undefined ? embCount : 'n/a'}`,
  );
}

main(process.argv[2]).catch(e => {
  console.error(e);
  process.exit(1);
});
