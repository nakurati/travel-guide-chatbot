export const runtime = 'nodejs'; // Pin Node.js runtime so service-role secrets never execute on Edge.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);


export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('chunks')
    .select('id, doc_id, content, doc:docs(title)')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    chunk_id: data.id,
    doc_id: data.doc_id,
    doc_title: data.doc?.title ?? null,
    content: data.content,
  });
}
