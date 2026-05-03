// End-to-end orchestrator: PDF buffer in, structured result out.
//
// This is the v1 generic parser — finds a BOM-style table, extracts rows,
// pulls metadata via LLM, validates totals. No customer- or format-specific
// branching. Per-tenant extractors compose the underlying primitives
// directly when they need different behavior.

import {
  makeClients,
  analyzePdf,
  deleteFromS3,
  type ProgressCallback,
} from "./textract";
import { indexBlocks, getPageText } from "./blocks";
import { extractBom, type BomLine } from "./bom-extractor";
import { extractMetadataWithLlm } from "./llm-metadata";
import {
  checkTotalCrossCheck,
  r2,
  type ParseError,
  type ParseWarning,
} from "./validation";

export interface DocumentMetadata {
  document_number?: string;
  document_date?: string;
  total_amount?: number;
  buyer_name?: string;
  buyer_address?: string;
  ship_to_address?: string;
  ship_to_contact?: string;
  ship_to_email?: string;
  period_of_performance_start?: string;
  period_of_performance_end?: string;
  contracting_officer_name?: string;
  contracting_officer_email?: string;
  agency?: string;
}

export interface ParseDocumentResult {
  ok: boolean;
  bom: BomLine[];
  metadata: DocumentMetadata;
  warnings: ParseWarning[];
  errors: ParseError[];
  totals: {
    parsed_extended_total: number;
    metadata_total?: number;
  };
  meta: {
    page_count: number;
    bom_line_count: number;
    extraction_method: "textract+llm";
  };
}

const DEFAULT_METADATA_FIELDS = `- document_number: The PO number, contract number, or award identifier from the document header
- document_date: ISO date the document was issued
- total_amount: The total dollar amount (number, not string)
- buyer_name: The buying entity / customer name
- buyer_address: The buyer's billing address (single string with newlines preserved)
- ship_to_address: The delivery / ship-to address (single string with newlines preserved)
- ship_to_contact: Full name of the receiving point of contact
- ship_to_email: Email of the receiving point of contact
- period_of_performance_start: ISO date the performance period begins
- period_of_performance_end: ISO date the performance period ends
- contracting_officer_name: Full name of the contracting officer if listed
- contracting_officer_email: Email of the contracting officer if listed
- agency: The federal agency or buying entity (if government)`;

export async function parseDocument(
  pdfBuffer: Buffer,
  onProgress?: ProgressCallback,
): Promise<ParseDocumentResult> {
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];

  onProgress?.({ percent: 2, stage: "starting", detail: "Initializing AWS clients" });

  let clients;
  try {
    clients = makeClients();
  } catch (e) {
    return {
      ok: false,
      bom: [],
      metadata: {},
      warnings: [],
      errors: [{ message: e instanceof Error ? e.message : String(e) }],
      totals: { parsed_extended_total: 0 },
      meta: { page_count: 0, bom_line_count: 0, extraction_method: "textract+llm" },
    };
  }

  const s3Key = `parse/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.pdf`;

  try {
    const blocks = await analyzePdf(clients, pdfBuffer, s3Key, onProgress);

    onProgress?.({ percent: 78, stage: "parsing_tables", detail: "Indexing blocks + finding BOM" });
    const { byId, pageCount } = indexBlocks(blocks);

    const bomResult = extractBom(blocks, byId);
    errors.push(...bomResult.errors);
    warnings.push(...bomResult.warnings);

    onProgress?.({
      percent: 88,
      stage: "metadata",
      detail: "Extracting document metadata via Claude",
    });

    let metadata: DocumentMetadata = {};
    try {
      const pageText = getPageText(blocks, 6);
      metadata = await extractMetadataWithLlm<DocumentMetadata>({
        documentText: pageText,
        fieldsPrompt: DEFAULT_METADATA_FIELDS,
      });
    } catch (e) {
      warnings.push({
        message: `Metadata extraction failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    onProgress?.({ percent: 96, stage: "validating", detail: "Cross-checking totals" });
    const parsedTotal = r2(bomResult.lines.reduce((s, l) => s + (l.extended_price || 0), 0));
    const totalCheck = checkTotalCrossCheck(parsedTotal, metadata.total_amount);
    if (totalCheck && "field" in totalCheck === false && totalCheck.message.startsWith("Total mismatch")) {
      errors.push(totalCheck as ParseError);
    } else if (totalCheck) {
      warnings.push(totalCheck as ParseWarning);
    }

    onProgress?.({ percent: 100, stage: "done" });

    return {
      ok: errors.length === 0,
      bom: bomResult.lines,
      metadata,
      warnings,
      errors,
      totals: {
        parsed_extended_total: parsedTotal,
        metadata_total: metadata.total_amount,
      },
      meta: {
        page_count: pageCount,
        bom_line_count: bomResult.lines.length,
        extraction_method: "textract+llm",
      },
    };
  } catch (e) {
    return {
      ok: false,
      bom: [],
      metadata: {},
      warnings,
      errors: [...errors, { message: e instanceof Error ? e.message : String(e) }],
      totals: { parsed_extended_total: 0 },
      meta: { page_count: 0, bom_line_count: 0, extraction_method: "textract+llm" },
    };
  } finally {
    await deleteFromS3(clients.s3, clients.bucket, s3Key);
  }
}
