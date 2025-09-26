// src/app/page.tsx
'use client';

import { useState } from 'react';

type InMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type OutSource = { index: number; title: string; doc_id: string; chunk_id: string };
type OutBody = { answer: string; sources: OutSource[] };

export default function HomeChat() {
  const [messages, setMessages] = useState<InMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isSending) return;

    const nextMessages = [...messages, { role: 'user', content: question } as InMessage];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);
    setError(null);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as OutBody;

      // Build a compact source tag to append to the assistant reply
      const uniqueTitles = Array.from(
        new Set((data.sources || []).map(s => s.title).filter(Boolean)),
      );
      const sourceTag = uniqueTitles.length ? `\n\nsource: [${uniqueTitles.join(', ')}]` : '';

      setMessages(prev => [...prev, { role: 'assistant', content: `${data.answer}${sourceTag}` }]);
    } catch (err) {
      console.error('chat error:', err);
      setError('Something went wrong. Please try again.');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Error: Could not fetch an answer.' },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold">Travel Guide ChatBot</h1>
      </header>

      {/* Transcript */}
      <section className="space-y-3">
        {messages.length === 0 && (
          <p className="opacity-70">Try: “What are the must-see spots in downtown Austin?”</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded p-3 whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-blue-50' : 'bg-gray-50'
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-60 mb-1">{m.role}</div>
            <div className="text-sm">{m.content}</div>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Ask a question…"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!input.trim() || isSending}
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </form>

      {/* Footer for recruiters */}
      <footer className="pt-4 border-t text-xs text-gray-600">
        <div>
          stack: <span className="font-medium">Next.js + Supabase + OpenAI + LangChain</span>
        </div>
        <div>
          source: <span className="font-medium">Wikivoyage</span>
        </div>
      </footer>
    </main>
  );
}
