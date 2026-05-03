// POST /api/parse — receives a PDF file, runs it through the parser,
// returns the structured result as JSON.
//
// Single-tenant for now. Auth + per-tenant configuration come later.

import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/parsers/parse-document";

// Parsing a 30-page PDF can take 30-60s end to end (Textract polling
// dominates). Vercel's default 10s timeout would kill this; the route
// needs a longer ceiling on hosted deploys. Local dev has no limit.
export const maxDuration = 300;

// PDFs are big; bump the body limit. Default is 1MB which is barely a
// scanned 5-pager.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' in form data" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseDocument(buffer);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
