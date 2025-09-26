// scripts/dev_lc_retriever.ts
// Manual smoke test for the functional retriever.
// Run: pnpm tsx src/scripts/dev_lc_retriever.ts
import 'dotenv/config';
import { makeSupabaseRpcRetriever } from '../../src/lib/lc/supabaseRpcRetriever';

async function main() {
  const retriever = makeSupabaseRpcRetriever({
    mode: 'hybrid',     // 'vector' | 'exact' | 'hybrid'
    k: 6,
    minSimilarity: 0.30,
  });

  const query = 'Zilker Park';
  const docs = await retriever.getRelevantDocuments(query);

  console.log(`Query: "${query}" → ${docs.length} docs\n`);
  for (const d of docs) {
    const m = d.metadata as any;
    const preview = d.pageContent.replace(/\s+/g, ' ').slice(0, 180);
    console.log(
      `#${m.rank} ${m.title} (sim: ${m.similarity ?? '—'})\n` +
      `doc_id=${m.doc_id}  chunk_id=${m.chunk_id}\n` +
      `${preview}...\n`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
