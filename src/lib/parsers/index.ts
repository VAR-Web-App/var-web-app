// Public surface of the parser library. Higher-level extractors (per
// distributor, per agency, per manufacturer) compose these primitives.

export type { ProgressCallback, TextractClients } from "./textract";
export {
  makeClients,
  uploadPdfToS3,
  deleteFromS3,
  analyzePdf,
} from "./textract";

export type { BlockIndex } from "./blocks";
export {
  indexBlocks,
  getBlockText,
  getPageText,
  parseNumber,
} from "./blocks";

export type { TableMatch } from "./tables";
export { findTableByHeader, extractTableRows } from "./tables";

export type {
  BomLine,
  ExtractBomOptions,
  ExtractBomResult,
} from "./bom-extractor";
export { extractBom, DEFAULT_BOM_KEYWORDS } from "./bom-extractor";

export type { ParseError, ParseWarning } from "./validation";
export {
  DEFAULT_TOLERANCE_CENTS,
  r2,
  checkRowArithmetic,
  checkTotalCrossCheck,
} from "./validation";

export type { LlmExtractOptions } from "./llm-metadata";
export { extractMetadataWithLlm } from "./llm-metadata";
