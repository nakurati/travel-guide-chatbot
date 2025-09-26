# Travel Guide Chatbot using RAG (AI-Powered Travel Guide)

## Description

A chatbot that answers travel-related questions using **Retrieval-Augmented Generation (RAG)**.  
Built with **Next.js**, **LangChain.js**, **Supabase (pgvector)**, and the **OpenAI API**.

## Tech Stack

- Next.js (UI + API routes)

- Supabase Postgres + pgvector (docs/chunks/embeddings)

- OpenAI API (Responses API for answers, text-embedding-3-small for vectors)

- LangChain.js (RPC-based retriever wrapper)

## Goal

Deliver a simple, AI-powered travel guide chatbot that provides concise answers with citations from trusted travel sources.

- Data: Only two Wikivoyage guides — Austin and Texas.

- Behavior: Answers only when at least one on-topic chunk is retrieved; otherwise clearly says it’s not in the docs

## Data Source

- Wikivoyage (public domain)

## Ingestion Flow

# 1) create doc rows

pnpm tsx src/scripts/insert_doc.ts "Austin" # copy doc_id -> export DOC_AUSTIN=...
pnpm tsx src/scripts/insert_doc.ts "Texas" # copy doc_id -> export DOC_TEXAS=...

# 2) chunk → insert chunks

pnpm tsx src/scripts/insert_chunks.ts $DOC_AUSTIN src/docs/travel/austin.pdf
pnpm tsx src/scripts/insert_chunks.ts $DOC_TEXAS src/docs/travel/texas.pdf

# 3) create embeddings (writes .cache/emb-<doc_id>.json)

mkdir -p .cache
pnpm tsx src/scripts/create_embeddings.ts $DOC_AUSTIN
pnpm tsx src/scripts/create_embeddings.ts $DOC_TEXAS

# 4) insert embeddings into DB

pnpm tsx src/scripts/insert_embeddings.ts .cache/emb-$DOC_AUSTIN.json
pnpm tsx src/scripts/insert_embeddings.ts .cache/emb-$DOC_TEXAS.json

## Env

Create .env.local -> refer .env.example

## Install deps

pnpm install

## Running Locally

pnpm dev (http://localhost:3000)
