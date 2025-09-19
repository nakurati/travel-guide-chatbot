// run this to take pdf and convert to chunks and insert
// after running insert_doc.ts first, you will get doc_id, for eg: for texas - 3b703e30-128f-4002-9721-96c8fcc1e216  use it below
// run command - pnpm tsx src/scripts/insert_chunks.ts 3b703e30-128f-4002-9721-96c8fcc1e216 src/docs/travel/texas.pdf
// output will be - inserted 65 chunks; first=73f524bb-418f-4680-9725-b3142a35aed1 last=416ebe74-67ba-40ff-b70c-d0ad5d78312f
/**
 * Goal: Read a PDF → paragraph-aware chunking → bulk insert into `public.chunks`
 * Usage: pnpm tsx src/scripts/insert_chunks.ts <doc_id> src/docs/paris.pdf
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import pdf from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

// CLI args: doc_id (from Step 3) and the PDF file path
const [docId, pdfPath] = process.argv.slice(2);
if (!docId || !pdfPath) {
  throw new Error('Usage: tsx src/scripts/insert_chunks.ts <doc_id> <pdf_path>');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Paragraph-aware chunker:
 * - Prefers keeping whole paragraphs together (joined by a blank line).
 * - If a single paragraph exceeds `maxChars`, hard-split it with `overlapChars` for context.
 * - When a chunk overflows, we carry a short overlap “tail” into the next chunk to improve retrieval coherence.
 *
 * @param fullText      The entire extracted document text
 * @param maxChars      Target maximum characters per chunk (soft limit)
 * @param overlapChars  Overlap between adjacent chunks (helps retrieval)
 * @returns             Array of chunk strings
 */
function chunkParagraphAware(fullText: string, maxChars = 1200, overlapChars = 120): string[] {
  // Normalize line endings and split on blank lines; trim and drop empty paragraphs.
  const paragraphs = fullText.replace(/\r\n/g, '\n').split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);

  const chunkList: string[] = [];  // Final chunks
  let currentChunk = '';           // Chunk currently being built

  for (const paragraph of paragraphs) {
    // Try appending the paragraph to the current chunk (separated by a blank line if needed).
    const separator = currentChunk ? '\n\n' : '';
    const mergedText = currentChunk + separator + paragraph;

    if (mergedText.length <= maxChars) {
      // Still within size → keep accumulating.
      currentChunk = mergedText;
      continue;
    }

    // Would overflow → flush the current chunk (if we have one).
    if (currentChunk) chunkList.push(currentChunk);

    if (paragraph.length > maxChars) {
      // Oversized single paragraph → slice into fixed-size windows with overlap.
      const step = Math.max(1, maxChars - overlapChars);
      for (let start = 0; start < paragraph.length; start += step) {
        chunkList.push(paragraph.slice(start, start + maxChars));
      }
      // Start fresh after slicing a giant paragraph.
      currentChunk = '';
    } else {
      // Paragraph fits by itself → start a new chunk that carries an overlap tail
      // from the previously flushed chunk for context continuity.
      const lastFlushed = chunkList[chunkList.length - 1] ?? '';
      const overlapTail = lastFlushed.slice(-overlapChars);
      currentChunk = (overlapTail ? overlapTail + '\n\n' : '') + paragraph;
    }
  }

  // Push any remaining text as the final chunk.
  if (currentChunk) chunkList.push(currentChunk);

  return chunkList;
}

/**
 * Insert rows into a Supabase table in batches to avoid payload/row limits.
 *
 * WHY batching?
 * - Supabase/PostgREST may reject very large payloads (size or row count).
 * - Batching keeps requests small and predictable.
 *
 * @param tableName   Target table name (e.g., 'chunks')
 * @param rows        Array of row objects to insert
 * @param batchSize   Max rows per HTTP request (default 500 is usually safe)
 * @returns           Summary for quick sanity checks (total inserted, first/last inserted IDs)
 */
async function insertInBatches<T extends Record<string, unknown>>(
    tableName: string,
    rows: T[],
    batchSize = 500
  ) {
    // Edge case: nothing to insert
    if (!rows.length) return { inserted: 0, firstId: null, lastId: null };
  
    let inserted = 0;               // total rows inserted across all batches
    let firstId: string | null = null; // id of the first row returned from the first successful batch
    let lastId: string | null = null;  // id of the last row returned from the most recent batch
  
    // Process rows in contiguous windows of size `batchSize`
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize); // current chunk of rows
  
      // POST the batch; `return=representation` is implied by `.select('id')`
      const { data, error } = await supabase
        .from(tableName)
        .insert(batch)
        .select('id'); // ask PostgREST to return the inserted IDs
  
      // Surface any API error immediately (fail fast)
      if (error) throw error;
  
      // Update counters/markers
      inserted += data.length;
      if (!firstId && data.length) firstId = data[0].id as string;
      if (data.length) lastId = data[data.length - 1].id as string;
    }
  
    // Return a compact summary for logging/verification
    return { inserted, firstId, lastId };
  }

(async () => {
  // 1) Read and parse the PDF to raw text
  const fileBuffer = await fs.readFile(pdfPath);
  const parsedPdf = await pdf(fileBuffer);
  const rawText = (parsedPdf.text || '').trim();
  if (!rawText) throw new Error(`No text extracted from PDF: ${pdfPath}`);

  // 2) Chunk the text
  const chunkTexts = chunkParagraphAware(rawText, 1200, 120);
  if (chunkTexts.length === 0) throw new Error('Chunker produced 0 chunks — check PDF content/extraction.');

  // 3) Prepare rows for bulk insert
  const chunkRows = chunkTexts.map((content, index) => ({
    doc_id: docId,
    chunk_index: index,
    content
  }));

  // 4) Insert (batched)
  const { inserted, firstId, lastId } = await insertInBatches('chunks', chunkRows, 500);
  console.log(`inserted ${inserted} chunks; first=${firstId} last=${lastId}`);
})().catch((err) => {
  console.error('Chunk insert failed:', err);
  process.exit(1);
});
