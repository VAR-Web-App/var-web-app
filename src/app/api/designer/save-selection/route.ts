// POST /api/designer/save-selection — Designer-side write endpoint.
//
// The designer portal at /d/[token] calls this when the designer saves a
// selection they've been curating. The token in the body is the *only*
// auth: the server verifies it resolves to a DesignerLink, then writes
// ONLY within that link's project. A designer edits the design side of a
// selection — title, description, category, allowance, needed-by, and the
// option set (label/description/image/cost). They never touch the
// GC + client workflow fields (status, selected_option_id, approval,
// linked change order) — those are preserved on existing docs and set to
// safe defaults on new ones.
//
// Guardrails:
//   - New selection  → created as a "draft" scoped to the link's project.
//   - Existing        → must belong to the link's project (deal_ref match),
//                        and must not be locked (approved / over_allowance).
//
// Failure modes:
//   - token / selection missing  → 400
//   - admin SDK not configured    → 503
//   - token doesn't resolve       → 404
//   - selection not in this project → 403
//   - selection locked            → 409

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import type {
  DesignerLink,
  ProjectSelection,
  SelectionCategory,
  SelectionOption,
} from "@/types/builder";
import { SELECTION_CATEGORIES } from "@/types/builder";

export const runtime = "nodejs";

interface SaveBody {
  token: string;
  selection: {
    id?: string;
    category: string;
    title: string;
    description?: string;
    allowance: number;
    needed_by?: string;
    notes?: string;
    options: Array<{
      id?: string;
      label: string;
      description?: string;
      cost: number;
      image_url?: string;
      is_default?: boolean;
    }>;
  };
}

export async function POST(req: NextRequest) {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { token, selection } = body;
  if (!token || !selection || typeof selection.title !== "string") {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const db = adminDb();
  const linkSnap = await db.collection("designer_links").doc(token).get();
  if (!linkSnap.exists) {
    return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 404 });
  }
  const link = linkSnap.data() as DesignerLink;

  // Normalize the designer-editable fields. Everything here is untrusted
  // input from a no-login page, so we coerce types and mint any missing ids.
  const category: SelectionCategory = SELECTION_CATEGORIES.includes(
    selection.category as SelectionCategory,
  )
    ? (selection.category as SelectionCategory)
    : "other";
  const options: SelectionOption[] = (selection.options || []).map((o) => ({
    id: o.id || db.collection("_ids").doc().id,
    label: String(o.label || "").slice(0, 200),
    description: String(o.description || "").slice(0, 1000),
    cost: Number.isFinite(o.cost) ? Number(o.cost) : 0,
    ...(o.image_url ? { image_url: String(o.image_url).slice(0, 2000) } : {}),
    ...(o.is_default ? { is_default: true } : {}),
  }));
  const design = {
    category,
    title: (selection.title.trim() || "Untitled Selection").slice(0, 200),
    description: String(selection.description || "").slice(0, 2000),
    allowance: Number.isFinite(selection.allowance) ? Number(selection.allowance) : 0,
    ...(selection.needed_by ? { needed_by: String(selection.needed_by) } : {}),
    options,
  };
  const now = new Date().toISOString();

  // ── Existing selection: patch design fields only ────────────────
  if (selection.id) {
    const ref = db.collection("project_selections").doc(selection.id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const current = snap.data() as ProjectSelection;
    if (current.deal_ref !== link.deal_ref) {
      return NextResponse.json({ ok: false, error: "wrong_project" }, { status: 403 });
    }
    if (current.status === "approved" || current.status === "over_allowance") {
      return NextResponse.json({ ok: false, error: "locked" }, { status: 409 });
    }
    // If the client already picked an option, keep the pick only if it
    // still exists in the (possibly re-curated) option set — otherwise
    // drop it entirely (Firestore admin rejects `undefined`, so we build
    // the doc without the key rather than setting it undefined).
    const keptPick =
      current.selected_option_id &&
      options.some((o) => o.id === current.selected_option_id)
        ? current.selected_option_id
        : null;
    // Strip the fields `design` fully owns so a cleared value (e.g. an
    // emptied needed-by) doesn't survive via the old doc, and drop the
    // pick so keptPick alone controls it.
    const {
      selected_option_id: _oldPick,
      needed_by: _oldNeededBy,
      ...rest
    } = current;
    void _oldPick;
    void _oldNeededBy;
    const saved: ProjectSelection = {
      ...rest,
      ...design,
      ...(keptPick ? { selected_option_id: keptPick } : {}),
      updated_at: now,
    };
    await ref.set(saved, { merge: false });
    return NextResponse.json({ ok: true, selection: saved });
  }

  // ── New selection: create as a draft in the link's project ──────
  const existing = await db
    .collection("project_selections")
    .where("deal_ref", "==", link.deal_ref)
    .get();
  const used = existing.docs
    .map((d) => parseInt(String((d.data() as ProjectSelection).number).replace(/\D/g, ""), 10))
    .filter(Number.isFinite);
  const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
  const number = `SEL-${String(next).padStart(3, "0")}`;

  const ref = db.collection("project_selections").doc();
  const created: ProjectSelection = {
    id: ref.id,
    deal_ref: link.deal_ref,
    org_ref: link.org_ref,
    number,
    ...design,
    status: "draft",
    notes: String(selection.notes || ""),
    created_at: now,
    updated_at: now,
  };
  await ref.set(created, { merge: false });
  return NextResponse.json({ ok: true, selection: created });
}
