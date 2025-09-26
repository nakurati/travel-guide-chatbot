// POST  route which takes in { query } and → returns { results: [...] } with doc_id, chunk_id, similarity, preview

export const runtime = 'nodejs'; // Pin Node.js runtime so service-role secrets never execute on Edge.

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  const { query, k = 5, min = 0.3 } = await req.json();
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const vec = emb.data[0].embedding;

  // I created 3 rpcs -
  // 1. search_chunks_hybrid - Guarantee literal matches (e.g., “Zilker”) appear by UNION’ing a tiny ILIKE pass with vector results.
  // 2. search_chunks_exact - Avoids index tuning and returns exact
  // 3. search_chunks
  const { data, error } = await supabase.rpc('search_chunks_hybrid', {
    query_embedding: vec,
    query_text: query,
    match_count: k,
    min_similarity: min,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = (data || []).map((r: any) => ({
    doc_id: r.doc_id,
    doc_title: r.doc_title,
    chunk_id: r.chunk_id,
    similarity: Number(r.similarity).toFixed(3),
    preview: (r.content || '').slice(0, 200),
  }));
  return NextResponse.json({ query, count: results.length, results });
}
