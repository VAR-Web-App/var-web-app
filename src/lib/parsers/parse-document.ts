// End-to-end orchestrator: PDF buffer in, structured result out.
//
// Behavior is driven by an ExtractorTemplate config. The default flow:
//   1. Run PDF through Textract
//   2. Reconstruct page text from LINE blocks
//   3. Auto-detect template from page text (or use a caller-supplied one)
//   4. Extract BOM table per the template's bom config (skip if not configured)
//   5. Extract metadata via Claude per the template's metadata fields
//   6. Cross-check sum-of-lines against document total
//
// Adding a new document type = adding a template config. No code changes.

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
import type { ExtractorTemplate } from "./templates/types";
import { detectTemplate, BUILTIN_TEMPLATES } from "./templates";

export type DocumentMetadata = Record<string, string | number | undefined>;

export interface ParseDocumentResult {
  ok: boolean;
  /** ID of the template used. Useful for client-side rendering decisions. */
  template_id: string;
  template_name: string;
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

export interface ParseDocumentOptions {
  /** If supplied, skip auto-detection and use this template. */
  templateId?: string;
  /** Override the registry. Defaults to BUILTIN_TEMPLATES. */
  templates?: ExtractorTemplate[];
}

function buildFieldsPrompt(template: ExtractorTemplate): string {
  return template.metadata.fields
    .map((f) => `- ${f.name}: ${f.prompt}`)
    .join("\n");
}

export async function parseDocument(
  pdfBuffer: Buffer,
  onProgress?: ProgressCallback,
  options: ParseDocumentOptions = {},
): Promise<ParseDocumentResult> {
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];
  const templates = options.templates ?? BUILTIN_TEMPLATES;

  onProgress?.({ percent: 2, stage: "starting", detail: "Initializing AWS clients" });

  let clients;
  try {
    clients = makeClients();
  } catch (e) {
    return errorResult(e, errors, warnings);
  }

  const s3Key = `parse/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.pdf`;

  try {
    const blocks = await analyzePdf(clients, pdfBuffer, s3Key, onProgress);

    onProgress?.({ percent: 76, stage: "parsing_tables", detail: "Detecting template" });
    const { byId, pageCount } = indexBlocks(blocks);

    // Pull page text once — used for both template detection and LLM
    // metadata extraction. Both want the first few pages of natural text.
    // We pre-fetch with a generous cap (8); each template's metadata config
    // then trims to its own maxPages when sent to the LLM.
    const detectionText = getPageText(blocks, 8);

    let template: ExtractorTemplate;
    if (options.templateId) {
      const explicit = templates.find((t) => t.id === options.templateId);
      if (!explicit) {
        return errorResult(new Error(`Unknown template: ${options.templateId}`), errors, warnings);
      }
      template = explicit;
    } else {
      template = detectTemplate(detectionText, templates);
    }

    onProgress?.({
      percent: 80,
      stage: "parsing_tables",
      detail: `Template: ${template.name}`,
    });

    let bom: BomLine[] = [];
    if (template.bom) {
      const bomResult = extractBom(blocks, byId, template.bom);
      bom = bomResult.lines;
      errors.push(...bomResult.errors);
      warnings.push(...bomResult.warnings);
    }

    onProgress?.({
      percent: 88,
      stage: "metadata",
      detail: "Extracting document metadata via Claude",
    });

    let metadata: DocumentMetadata = {};
    try {
      const llmText = getPageText(blocks, template.metadata.maxPages ?? 6);
      metadata = await extractMetadataWithLlm<DocumentMetadata>({
        documentText: llmText,
        fieldsPrompt: buildFieldsPrompt(template),
        systemPrompt: template.metadata.systemPrompt,
      });
    } catch (e) {
      warnings.push({
        message: `Metadata extraction failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    onProgress?.({ percent: 96, stage: "validating", detail: "Cross-checking totals" });
    const parsedTotal = r2(bom.reduce((s, l) => s + (l.extended_price || 0), 0));
    const metaTotal =
      typeof metadata.total_amount === "number" ? metadata.total_amount : undefined;
    const totalCheck = checkTotalCrossCheck(parsedTotal, metaTotal);
    if (totalCheck && totalCheck.message.startsWith("Total mismatch")) {
      errors.push(totalCheck as ParseError);
    } else if (totalCheck) {
      warnings.push(totalCheck as ParseWarning);
    }

    onProgress?.({ percent: 100, stage: "done" });

    return {
      ok: errors.length === 0,
      template_id: template.id,
      template_name: template.name,
      bom,
      metadata,
      warnings,
      errors,
      totals: {
        parsed_extended_total: parsedTotal,
        metadata_total: metaTotal,
      },
      meta: {
        page_count: pageCount,
        bom_line_count: bom.length,
        extraction_method: "textract+llm",
      },
    };
  } catch (e) {
    return errorResult(e, errors, warnings);
  } finally {
    await deleteFromS3(clients.s3, clients.bucket, s3Key);
  }
}

function errorResult(
  e: unknown,
  errors: ParseError[],
  warnings: ParseWarning[],
): ParseDocumentResult {
  return {
    ok: false,
    template_id: "",
    template_name: "",
    bom: [],
    metadata: {},
    warnings,
    errors: [...errors, { message: e instanceof Error ? e.message : String(e) }],
    totals: { parsed_extended_total: 0 },
    meta: { page_count: 0, bom_line_count: 0, extraction_method: "textract+llm" },
  };
}
