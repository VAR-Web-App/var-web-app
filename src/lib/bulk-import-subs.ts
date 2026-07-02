// Bulk import subs/suppliers from Excel CSV or pasted table data.
//
// Expected columns (flexible matching — headers are case-insensitive,
// common aliases accepted):
//   Name / Company / Business Name  (required)
//   Phone / Mobile / Cell
//   Email / E-mail
//   Trade / Specialty
//   Address
//   Notes
//
// Returns parsed rows + validation errors for preview before save.

import { newId, type Distributor } from "@/types";

export interface ParsedSubRow {
  name: string;
  phone?: string;
  email?: string;
  trade?: string;
  address?: string;
  notes?: string;
  error?: string;
}

export interface BulkImportResult {
  rows: ParsedSubRow[];
  valid: number;
  errors: number;
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "company", "business name", "business", "sub", "subcontractor", "supplier", "vendor"],
  phone: ["phone", "mobile", "cell", "tel", "telephone", "phone number"],
  email: ["email", "e-mail", "email address"],
  trade: ["trade", "specialty", "type", "category", "service"],
  address: ["address", "location", "street"],
  notes: ["notes", "note", "comments", "memo"],
};

function matchHeader(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/**
 * Parse CSV or tab-separated text into sub rows.
 * Auto-detects delimiter (tab, comma, or pipe).
 */
export function parseSubsFromText(text: string): BulkImportResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [{ name: "", error: "Need at least a header row + one data row" }], valid: 0, errors: 1 };
  }

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes("|") ? "|" : ",";

  // Parse header
  const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const fieldMap: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const field = matchHeader(headers[i]);
    if (field) fieldMap[i] = field;
  }

  if (!Object.values(fieldMap).includes("name")) {
    return {
      rows: [{ name: "", error: 'Could not find a "Name" or "Company" column in the header' }],
      valid: 0,
      errors: 1,
    };
  }

  // Parse data rows
  const rows: ParsedSubRow[] = [];
  let valid = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const row: ParsedSubRow = { name: "" };

    for (const [colIdx, field] of Object.entries(fieldMap)) {
      const val = cells[parseInt(colIdx)] ?? "";
      if (val) (row as unknown as Record<string, string>)[field] = val;
    }

    if (!row.name) {
      row.error = "Missing name";
      errors++;
    } else {
      valid++;
    }

    rows.push(row);
  }

  return { rows, valid, errors };
}

/**
 * Convert parsed rows to Distributor records ready for Firestore.
 */
export function rowsToDistributors(
  rows: ParsedSubRow[],
  orgRef: string,
): Distributor[] {
  return rows
    .filter((r) => r.name && !r.error)
    .map((r) => ({
      id: newId("sub"),
      name: r.name,
      account_number: "",
      address: r.address ?? "",
      phone: r.phone,
      email: r.email,
      notes: [r.trade, r.notes].filter(Boolean).join(" — "),
      org_ref: orgRef,
    }));
}
