// src/app/api/chat/route.ts
// Purpose: A minimal, *strictly grounded* chat endpoint for your RAG MVP.
// It takes chat messages, retrieves context with your LC retriever, builds a
// numbered-context prompt, calls OpenAI, and returns { answer, sources[] }.
//
// Key ideas:
// - We only answer from retrieved chunks (guardrails in the system message).
// - Citations use bracket markers [#i] that match the numbered chunks.
// - The returned `sources[]` lines up with those markers so your UI can render cards.

import 'dotenv/config';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { makeSupabaseRpcRetriever } from '../../../lib/lc/supabaseRpcRetriever';

// Next.js hint to avoid caching this dynamic route (safe default for APIs)
export const dynamic = 'force-dynamic';

// --- Config: model + API key (env-driven) ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!; // non-null assertion since this is required
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

// --- Single OpenAI client at module scope (reused across requests) ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Our LangChain-style retriever (reused across requests) ---
// Tweak mode/k/minSimilarity here; the rest of your app stays unchanged.
const retriever = makeSupabaseRpcRetriever({
  mode: 'hybrid',       // 'vector' | 'exact' | 'hybrid'
  k: 6,                 // typically 3–8 is good for short answers
  minSimilarity: 0.30,  // lower → more recall, higher → more precision
});

// Small helper to build a strict prompt from the retrieved docs.
// We number each chunk so the model can cite them with [#i] in the answer.
function buildPrompt(
  question: string,
  docs: Array<{ pageContent: string; metadata: any }>
) {
  // Normalize and number chunks:
  //  - Trim whitespace
  //  - Collapse internal spaces
  //  - Prefix with [#i]
  const numbered = docs.map((d, i) => {
    const text = (d.pageContent || '')
      .toString()
      .trim()
      .replace(/\s+/g, ' ');
    return `[#${i + 1}] ${text}`;
  });

  // System = permanent instructions / guardrails for the model
  const system = [
    'You are a precise travel assistant.',
    'Answer ONLY using the provided context chunks.',
    'If the answer is not in the context, say exactly: "I don’t know from the provided docs."',
    'Cite your evidence inline using the bracket numbers like [#1], [#2].',
    'Keep the answer concise (1–3 short paragraphs).',
  ].join(' ');

  // User = question + the numbered context block
  const user = [
    `Question: ${question}`,
    '',
    'Context:',
    numbered.length ? numbered.join('\n\n') : '(no context)', // explicit empty state
  ].join('\n');

  return { system, user };
}

// --- Types for input/output payloads ---
// We accept a simple { messages: [{ role, content }...] } body.
type InMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type InBody = { messages: InMessage[] };

// What we return to the UI: the model's grounded answer and a compact sources list.
// `index` matches the [#i] marker used in the prompt.
type OutSource = { index: number; title: string; doc_id: string; chunk_id: string };
type OutBody = { answer: string; sources: OutSource[] };

// --- The POST handler ---
// Flow:
// 1) Validate input and extract the latest user question.
// 2) Retrieve Documents[] with our retriever.
// 3) If no docs → clear "don't know" response (no guessing).
// 4) Build prompt (system+user) with numbered chunks.
// 5) Call OpenAI chat with low temperature for faithfulness.
// 6) Return { answer, sources[] } aligned to [#i].
export async function POST(req: NextRequest) {
  try {
    // 1) Parse & validate body
    const body = (await req.json()) as InBody;
    if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages[] required' }, { status: 400 });
    }

    // Take the latest user message as the current question (MVP assumption).
    const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
    const question = lastUser?.content?.trim();
    if (!question) {
      return NextResponse.json({ error: 'No user question found' }, { status: 400 });
    }

    // 2) Retrieve context (LangChain Documents with standardized metadata)
    const docs = await retriever.getRelevantDocuments(question);

    // 3) Empty-state: do NOT hallucinate; reply with an explicit refusal
    if (!docs || docs.length === 0) {
      const out: OutBody = {
        answer: 'Not in the docs yet. I don’t know from the provided docs.',
        sources: [],
      };
      return NextResponse.json(out, { status: 200 });
    }

    // 4) Build our strict, numbered-context prompt
    const { system, user } = buildPrompt(question, docs);

    // 5) Call the model (low temperature = more deterministic & grounded)
    // Responses API (preferred)
    const response = await openai.responses.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: system }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: user }],
        },
      ],
    });
    

    // SDK v4 exposes a convenience string:
    const answerRaw =
      (response as any).output_text?.trim() ||
      'I don’t know from the provided docs.';

    const sources: OutSource[] = docs.map((d, i) => ({
      index: i + 1,
      title: String(d.metadata?.title ?? 'Untitled'),
      doc_id: String(d.metadata?.doc_id ?? ''),
      chunk_id: String(d.metadata?.chunk_id ?? ''),
    }));

     //  post-check to enforce at least one citation ===
     const hasCitation = /\[#\d+\]/.test(answerRaw); 
     const safeAnswer = hasCitation
       ? answerRaw
       : 'Not in the docs yet. I don’t know from the provided docs.';
 
     const out: OutBody = { answer: safeAnswer, sources };
     return NextResponse.json(out, { status: 200 });
  } catch (err) {
    console.error('/api/chat error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}