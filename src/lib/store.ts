// Firestore-backed CRUD, org-scoped via org_ref. Same API surface as the
// original localStorage version so pages didn't need to change shape.
//
// Pattern: every record sits at the top level (e.g. `deals`, `accounts`)
// with an `org_ref` field that gates access. Firestore security rules
// (firestore.rules) enforce: users can only read/write records where
// `org_ref == request.auth.token.org_ref` (claims set on signup, or
// derived per-request from the user profile in the legacy fallback).
//
// All mutations require an authenticated user with an `org_ref` on their
// profile. Callers must pass the orgRef explicitly — pages get it from
// useAuth().profile.org_ref.

"use client";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Deal,
  Account,
  Contact,
  Distributor,
  OrgSettings,
  Attachment,
  newId,
} from "@/types";
import { db } from "./firebase";

// ── helpers ──────────────────────────────────────────────────────

async function listByOrg<T extends { id: string }>(
  collectionName: string,
  orgRef: string,
): Promise<T[]> {
  const q = query(
    collection(db, collectionName),
    where("org_ref", "==", orgRef),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, "id">) })) as T[];
}

async function saveToCollection<T extends { id: string; org_ref: string }>(
  collectionName: string,
  record: T,
): Promise<void> {
  await setDoc(doc(db, collectionName, record.id), record, { merge: false });
}

async function removeFromCollection(
  collectionName: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

// ── deals ────────────────────────────────────────────────────────

export async function listDeals(orgRef: string): Promise<Deal[]> {
  return listByOrg<Deal>("deals", orgRef);
}

export async function getDeal(id: string): Promise<Deal | undefined> {
  const snap = await getDoc(doc(db, "deals", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Deal) : undefined;
}

export async function saveDeal(deal: Deal): Promise<void> {
  await saveToCollection("deals", { ...deal, updated_at: new Date().toISOString() });
}

export async function deleteDeal(id: string): Promise<void> {
  await removeFromCollection("deals", id);
}

// ── accounts ─────────────────────────────────────────────────────

export async function listAccounts(orgRef: string): Promise<Account[]> {
  return listByOrg<Account>("accounts", orgRef);
}

export async function saveAccount(a: Account): Promise<void> {
  await saveToCollection("accounts", a);
}

export async function deleteAccount(id: string): Promise<void> {
  await removeFromCollection("accounts", id);
}

// ── contacts ─────────────────────────────────────────────────────

export async function listContacts(orgRef: string): Promise<Contact[]> {
  return listByOrg<Contact>("contacts", orgRef);
}

export async function saveContact(c: Contact): Promise<void> {
  await saveToCollection("contacts", c);
}

export async function deleteContact(id: string): Promise<void> {
  await removeFromCollection("contacts", id);
}

// ── distributors ─────────────────────────────────────────────────

export async function listDistributors(orgRef: string): Promise<Distributor[]> {
  return listByOrg<Distributor>("distributors", orgRef);
}

export async function saveDistributor(d: Distributor): Promise<void> {
  await saveToCollection("distributors", d);
}

export async function deleteDistributor(id: string): Promise<void> {
  await removeFromCollection("distributors", id);
}

// ── settings ─────────────────────────────────────────────────────

export async function getSettings(orgRef: string): Promise<OrgSettings | null> {
  const snap = await getDoc(doc(db, "settings", orgRef));
  if (!snap.exists()) return null;
  return { ...(snap.data() as OrgSettings), org_ref: orgRef };
}

export async function saveSettings(s: OrgSettings): Promise<void> {
  await setDoc(doc(db, "settings", s.org_ref), s);
}

// ── attachments ──────────────────────────────────────────────────

export async function listAttachments(dealRef: string): Promise<Attachment[]> {
  const q = query(collection(db, "attachments"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Attachment, "id">) }));
}

export async function saveAttachment(a: Attachment): Promise<void> {
  await setDoc(doc(db, "attachments", a.id), a, { merge: false });
}

export async function deleteAttachment(id: string): Promise<void> {
  await removeFromCollection("attachments", id);
}

// ── seeding (called once per new org on first deal page load) ────

export async function seedOrgIfEmpty(orgRef: string): Promise<void> {
  const existing = await listDeals(orgRef);
  if (existing.length > 0) return;
  // First-time experience: skip seed deals to keep prod orgs clean. The
  // /demo route exposes the seeded sample pipeline for unauthenticated
  // visitors.
  // (No-op for now. If we later want to seed accounts/distributors with
  // a starter set, do it here gated on absence.)
}

// ── re-exports ───────────────────────────────────────────────────

export { newId };
export const SERVER_TIMESTAMP = serverTimestamp;
