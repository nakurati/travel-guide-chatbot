// run this after insert_docs.ts and insert_chunks.ts
// run command - pnpm tsx src/scripts/create_embeddings.ts <doc_id>
import 'dotenv/config'; // Load .env.local (API keys, Supabase creds)
import { createClient } from '@supabase/supabase-js'; // Supabase client
import OpenAI from 'openai'; // OpenAI API client
import fs from 'node:fs'; // File system module for saving embeddings

// Initialize OpenAI with API key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Connect to Supabase using service role (needed for writes + unrestricted reads)
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function main(docId: string) {
  // 1. Fetch all chunks for a given doc_id from the database
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id, content') // we only need ID + text
    .eq('doc_id', docId) // filter by document
    .order('id'); // keep stable order

  const vectors = [];

  // 2. Loop over each chunk and call OpenAI to create embeddings
  for (const chunk of chunks!) {
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small', // small, cheap embedding model
      input: chunk.content, // the chunk text
    });

    // Store {chunk_id, embedding} for later DB insert
    vectors.push({ chunk_id: chunk.id, embedding: emb.data[0].embedding });
  }

  // 3. Save all embeddings locally to a cache file
  const outFile = `.cache/emb-${docId}.json`;
  fs.writeFileSync(outFile, JSON.stringify(vectors, null, 2));

  // 4. Print quick summary
  console.log(`vectors=${vectors.length} dim=${vectors[0].embedding.length} file=${outFile}`);
}

// run with `pnpm tsx src/scripts/create_embeddings.ts <doc_id>`
main(process.argv[2]).catch(console.error);
