// test script to query by 'Eiffel Tower' and see if you get relevant results
// rpc created earlier will be used
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMB_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

async function main() {
  const query = process.argv[2] || 'Eiffel Tower';
  const k = Number(process.argv[3] || 10);
  const minSim = Number(process.argv[4] || 0.35);

  // 1) Vector search (approximate via IVFFlat @ lists=100)
  const emb = await openai.embeddings.create({ model: EMB_MODEL, input: query });
  const vec = emb.data[0].embedding;

  const { data: vecHits, error } = await supabase.rpc('search_chunks', {
    query_embedding: vec,
    match_count: k,
    min_similarity: minSim,
  });
  if (error) throw error;

  console.log(`QUERY: "${query}" (k=${k}, minSim=${minSim})`);
  if (vecHits && vecHits.length > 0) {
    vecHits.forEach((row: any, i: number) => {
      const preview = String(row.content)
        .replace(/\s+/g, ' ')
        .slice(0, 200);
      console.log(
        `${i + 1}. sim=${row.similarity.toFixed(3)} doc=${row.doc_id} chunk=${
          row.chunk_id
        }\n   ${preview}…`,
      );
    });
  } else {
    console.log('No vector hits ≥ minSim.');
  }

  // 2) Always show lexical matches too (for sanity)
  const qWords = ['eiffel tower', 'tour eiffel']; // add others if you like
  const like = qWords.map(w => `content ilike '%${w.replace(/'/g, "''")}%'`).join(' or ');

  const { data: lex, error: lexErr } = await supabase
    .from('chunks')
    .select('id, doc_id, content, chunk_index')
    .or(like) // show literal matches you *know* exist
    .order('chunk_index', { ascending: true })
    .limit(k);

  if (lexErr) throw lexErr;

  console.log('\n--- LEXICAL MATCHES (ILIKE) ---');
  if (lex && lex.length > 0) {
    lex.forEach((row: any, i: number) => {
      const preview = String(row.content)
        .replace(/\s+/g, ' ')
        .slice(0, 200);
      console.log(
        `${i + 1}. [LEX] doc=${row.doc_id} chunk=${row.id} idx=${row.chunk_index}\n   ${preview}…`,
      );
    });
  } else {
    console.log('(none found)');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
