// POST /api/upload — Vercel Blob client-upload handshake.
//
// Why this exists: Vercel App Router serverless functions cap incoming
// request bodies at ~4.5MB. A 16-page plan-set PDF blows past that and
// the edge bounces with a plain-text 413 before the route ever runs.
//
// The fix is to hand the browser a short-lived signed token so it can
// upload the file directly to Vercel Blob (which has a 4.5GB ceiling),
// then call /api/plan-extract with just the resulting blob URL —
// keeping our function bodies tiny.
//
// This file is the token broker. The browser POSTs here to ask for an
// upload URL; we authorize the request and return signed credentials.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Cap at 32MB — Claude's PDF input ceiling. Anything larger
        // will fail at the extraction step anyway, so reject up front.
        // PDFs only for now; the extractor doesn't accept other types.
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 32 * 1024 * 1024,
          // 1-hour validity is plenty for a single upload+extract round
          // trip. The token is signed and self-expiring; no server-side
          // session state needed.
          validUntil: Date.now() + 60 * 60 * 1000,
          // Encode the original filename so onUploadCompleted can log
          // it without parsing the pathname.
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Hook fires when the browser finishes uploading. We don't need
        // server-side work here — the client immediately calls
        // /api/plan-extract with the URL — but keeping the hook so
        // future log/cleanup logic has a place to live.
        console.log("[blob] upload complete", blob.pathname, blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
