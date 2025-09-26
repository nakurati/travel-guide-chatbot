'use client';
import { useState } from 'react';

/**
 * Shape of a single search hit returned by /api/search
 * (Matches your updated RPC which now includes doc_title.)
 */
type SearchResult = {
  doc_id: string;
  doc_title?: string;
  chunk_id: string;                 // required for loading full chunk
  similarity: number | string;
  preview: string;
};

/** Optional details we fetch when a result is expanded */
type ChunkDetails = {
  content: string;
  doc_title?: string | null;
};

export default function Search() {
  // Form state
  const [query, setQuery] = useState('');
  // Results from the /api/search endpoint
  const [results, setResults] = useState<SearchResult[]>([]);
  // Network/loading state for the search action
  const [isSearching, setIsSearching] = useState(false);
  // Per-chunk expanded content cache (chunk_id → details)
  const [expandedByChunkId, setExpandedByChunkId] = useState<
    Record<string, ChunkDetails | undefined>
  >({});

  /** Submit handler for search form */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      // Call server-side API route so keys stay server-side
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, k: 5, min: 0.3 }),
      });

      const data = await response.json();
      const normalized: SearchResult[] = Array.isArray(data.results) ? data.results : [];
      setResults(normalized);
      // Collapse any previously expanded chunks when a new search runs
      setExpandedByChunkId({});
    } catch (error) {
      console.error('Search request failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  /**
   * Toggle expand/collapse for a result card.
   * On first expand, fetch the full chunk via /api/chunk/[id].
   */
  async function toggleExpand(chunkId: string) {
    // If already expanded → collapse it
    if (expandedByChunkId[chunkId]) {
      setExpandedByChunkId((prev) => {
        const next = { ...prev };
        delete next[chunkId];
        return next;
      });
      return;
    }

    // Fetch full chunk content
    try {
      const resp = await fetch(`/api/chunk/${chunkId}`);
      if (!resp.ok) throw new Error(`Failed to load chunk ${chunkId}`);
      const data = await resp.json();
      setExpandedByChunkId((prev) => ({
        ...prev,
        [chunkId]: {
          content: data.content ?? '',
          doc_title: data.doc_title ?? null,
        },
      }));
    } catch (error) {
      console.error('Failed to fetch chunk:', error);
      // Keep it collapsed on error (could also set a sentinel)
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold">Travel Guide ChatBot</h1>
        <p className="mt-2">Next.js + Supabase + OpenAI + LangChain</p>
      </header>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Wikivoyage…"
        />
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!query || isSearching}
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Results */}
      <section className="space-y-3">
        {results.map((result, index) => {
          const isExpanded = Boolean(expandedByChunkId[result.chunk_id]);
          const expandedData = expandedByChunkId[result.chunk_id];

          return (
            <article key={index} className="border rounded p-3">
              <div className="text-sm opacity-70">sim: {result.similarity}</div>
              <div className="font-medium">
                {result.doc_title || result.doc_id}
              </div>
              <p className="text-sm">{result.preview}…</p>

              <button
                onClick={() => toggleExpand(result.chunk_id)}
                className="mt-2 text-sm underline"
              >
                {isExpanded ? 'Hide' : 'Show more'}
              </button>

              {isExpanded && expandedData && (
                <div className="mt-2 text-sm whitespace-pre-wrap">
                  {expandedData.content}
                </div>
              )}
            </article>
          );
        })}

        {/* Empty state */}
        {results.length === 0 && !isSearching && (
          <p className="opacity-70">No results yet.</p>
        )}
      </section>
    </main>
  );
}
