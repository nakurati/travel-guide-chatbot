// Pin Node.js runtime so service-role secrets never execute on Edge.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('chunks')
    .select('id, doc_id, content, doc:docs(title)')
    .eq('id', params.id)
    .limit(1, { foreignTable: 'docs' }) // return at most one related row
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Related rows come back as an array; grab first if present
  const docRel: any = (data as any).doc;
  let docTitle: string | null = null;

  if (Array.isArray(docRel)) {
    if (docRel.length > 0 && docRel[0] && typeof docRel[0].title !== 'undefined') {
      docTitle = String(docRel[0].title);
    }
  } else if (docRel && typeof (docRel as any).title !== 'undefined') {
    docTitle = String((docRel as any).title);
  }

  return NextResponse.json({
    chunk_id: data.id,
    doc_id: data.doc_id,
    doc_title: docTitle,
    content: data.content,
  });
}
