// POST /api/parse — receives a PDF file, runs it through the parser,
// streams progress events + the final result as Server-Sent Events.
//
// SSE was chosen over WebSockets because the connection is one-shot
// (per-parse), the data flow is server→client only, and EventSource-style
// parsing is trivial to consume from fetch streams. Single-tenant for
// now; auth + per-tenant configuration come later.

import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/parsers/parse-document";

// Parsing a 30-page PDF can take 30-60s end to end (Textract polling
// dominates). Vercel's default 10s timeout would kill this; the route
// needs a longer ceiling on hosted deploys. Local dev has no limit.
export const maxDuration = 300;

// PDFs are big; bump the body limit. Default is 1MB which is barely a
// scanned 5-pager.
export const runtime = "nodejs";

function sseEvent(event: string, data: unknown): Uint8Array {
  // Standard SSE wire format: "event: NAME\ndata: JSON\n\n".
  // Any newlines inside the JSON would break the framing — JSON.stringify
  // never produces unescaped newlines so we're safe.
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await parseDocument(buffer, (progress) => {
          controller.enqueue(sseEvent("progress", progress));
        });
        controller.enqueue(sseEvent("result", result));
      } catch (e) {
        controller.enqueue(
          sseEvent("error", { message: e instanceof Error ? e.message : String(e) }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable buffering on Vercel/Nginx so events arrive in real-time
      // rather than getting batched into one big flush at the end.
      "X-Accel-Buffering": "no",
    },
  });
}
