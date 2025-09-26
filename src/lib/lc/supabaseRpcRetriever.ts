// src/lib/lc/supabaseRpcRetriever.ts
// Functional LangChain retriever (no classes).
// - Uses your Supabase RPCs (vector/exact/hybrid)
// - Embeds with OpenAI using OPENAI_EMBED_MODEL or default 'text-embedding-3-small'
// - Returns LangChain `Document[]` with normalized metadata

import 'server-only';

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Document } from '@langchain/core/documents';

type RetrieverMode = 'vector' | 'exact' | 'hybrid';

type Options = {
  mode?: RetrieverMode;
  k?: number;
  minSimilarity?: number;
  // (optional) overrides for testing
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  openaiApiKey?: string;
  embedModel?: string;
};

const RPC = {
  vector: 'search_chunks',
  exact: 'search_chunks_exact',
  hybrid: 'search_chunks_hybrid',
} as const;

export function makeSupabaseRpcRetriever(opts: Options = {}) {
  // Defaults (MVP-friendly)
  const mode: RetrieverMode = opts.mode ?? 'hybrid';
  const k = Math.max(1, Math.min(opts.k ?? 6, 50));
  const minSimilarity = opts.minSimilarity ?? 0.30;

  // Your env style (non-null assertions)
  const SUPABASE_URL =
    opts.supabaseUrl ?? process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY =
    opts.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const OPENAI_API_KEY =
    opts.openaiApiKey ?? process.env.OPENAI_API_KEY!;
  const EMB_MODEL =
    opts.embedModel ?? process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small';

  // Clients
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // 1) Embed query once
  async function embedQuery(query: string): Promise<number[]> {
    const { data } = await openai.embeddings.create({
      model: EMB_MODEL,
      input: query,
    });
    return data[0].embedding as unknown as number[];
  }

  // 2) Normalize one RPC row → LangChain Document
  function rowToDocument(row: any, rank: number): Document | null {
    const doc_id = row.doc_id ?? row.docId ?? row.document_id;
    const chunk_id = row.chunk_id ?? row.chunkId;
    const title = row.doc_title ?? row.title ?? 'Untitled';

    const pageContent =
      row.preview ??
      row.content ??
      row.chunk_text ??
      '';

    const similarity = row.similarity ?? null;

    if (!doc_id || !chunk_id || !pageContent) return null;

    return new Document({
      pageContent: String(pageContent),
      metadata: {
        title: String(title),
        doc_id: String(doc_id),
        chunk_id: String(chunk_id),
        similarity: similarity == null ? null : Number(similarity),
        rank, // 1..N
      },
    });
  }

  // 3) Duck-typed retriever for LangChain
  return {
    async getRelevantDocuments(query: string) {
      const rpcName = RPC[mode];

      const embedding = await embedQuery(query);

      const { data, error } = await supabase.rpc(rpcName, {
        query_embedding: embedding,
        match_count: k,
        min_similarity: minSimilarity,
        query_text: query, // used by hybrid; others may ignore
      });

      if (error) {
        console.error(`[SupabaseRpcRetriever:${rpcName}]`, error);
        return [] as Document[];
      }

      const rows = Array.isArray(data) ? data : [];
      let rank = 0;
      const docs: Document[] = [];

      for (const row of rows) {
        rank += 1;
        const doc = rowToDocument(row, rank);
        if (doc) docs.push(doc);
      }

      return docs;
    },
  };
}
