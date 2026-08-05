// POST /api/phone/transcribe — audio → transcript via OpenAI Whisper.
//
// The audio→text seam for "Summarize a call": a recorded voice memo or an
// uploaded call recording becomes a transcript, which then flows into
// /api/phone/summarize exactly like a pasted one. Multipart form with a
// single `file`. Needs OPENAI_API_KEY (Whisper); no-ops with a clear error
// until that's set.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // Whisper's per-file limit

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Transcription isn't set up yet (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "That recording is over 25 MB — trim it or split it up." },
      { status: 413 },
    );
  }

  const out = new FormData();
  out.append("file", file, file.name || "audio.webm");
  out.append("model", "whisper-1");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: out,
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { ok: false, error: `transcribe_error_${res.status}`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ ok: true, text: data.text ?? "" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "transcribe_failed" },
      { status: 502 },
    );
  }
}
