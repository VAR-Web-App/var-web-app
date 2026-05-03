// Generic Textract pipeline for multi-page PDF analysis.
//
// PDF → S3 → StartDocumentAnalysis (TABLES + FORMS) → poll → return blocks.
// No customer or document-format knowledge — that lives in higher-level
// extractors that consume the blocks this returns.
//
// Lifted and generalized from Avanchor's parser core.

import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  Block,
} from "@aws-sdk/client-textract";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export type ProgressCallback = (event: {
  percent: number;
  stage: string;
  detail?: string;
}) => void;

export interface TextractClients {
  textract: TextractClient;
  s3: S3Client;
  bucket: string;
}

export function makeClients(): TextractClients {
  const region = process.env.AWS_REGION;
  const akid = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_TEXTRACT_BUCKET;
  if (!region || !akid || !secret || !bucket) {
    throw new Error(
      "Missing AWS env vars (need AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_TEXTRACT_BUCKET)",
    );
  }
  const credentials = { accessKeyId: akid, secretAccessKey: secret };
  return {
    textract: new TextractClient({ region, credentials }),
    s3: new S3Client({ region, credentials }),
    bucket,
  };
}

export async function uploadPdfToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    }),
  );
}

export async function deleteFromS3(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best-effort cleanup; never fail the parse over a stranded S3 object.
  }
}

async function startTextractJob(
  textract: TextractClient,
  bucket: string,
  key: string,
): Promise<string> {
  const r = await textract.send(
    new StartDocumentAnalysisCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
      FeatureTypes: ["TABLES", "FORMS"],
    }),
  );
  if (!r.JobId) throw new Error("Textract did not return a JobId");
  return r.JobId;
}

async function pollTextract(
  textract: TextractClient,
  jobId: string,
  onProgress?: ProgressCallback,
): Promise<Block[]> {
  const blocks: Block[] = [];
  let nextToken: string | undefined = undefined;
  const startMs = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  // Map elapsed time monotonically into the progress band 20-75%. Textract
  // doesn't expose a real percentage; this gives the user motion.
  const PROGRESS_FLOOR = 20;
  const PROGRESS_CEILING = 75;
  const ESTIMATED_MS = 30000;
  let pollAttempt = 0;

  while (true) {
    if (Date.now() - startMs > TIMEOUT_MS) {
      throw new Error("Textract job timed out after 5 minutes");
    }
    const r: { JobStatus?: string; Blocks?: Block[]; NextToken?: string; StatusMessage?: string } =
      await textract.send(
        new GetDocumentAnalysisCommand({ JobId: jobId, NextToken: nextToken }),
      );
    const status = r.JobStatus;
    if (status === "FAILED") {
      throw new Error(`Textract job failed: ${r.StatusMessage ?? "no message"}`);
    }
    if (status === "IN_PROGRESS") {
      pollAttempt++;
      const elapsed = Date.now() - startMs;
      const fraction = Math.min(1, elapsed / ESTIMATED_MS);
      onProgress?.({
        percent: Math.round(PROGRESS_FLOOR + fraction * (PROGRESS_CEILING - PROGRESS_FLOOR)),
        stage: "textract_polling",
        detail: `Waiting for Textract (poll ${pollAttempt}, ${Math.round(elapsed / 1000)}s)`,
      });
      await new Promise((res) => setTimeout(res, 2000));
      continue;
    }
    if (status === "SUCCEEDED" || status === "PARTIAL_SUCCESS") {
      if (r.Blocks) blocks.push(...r.Blocks);
      if (r.NextToken) {
        nextToken = r.NextToken;
        continue;
      }
      return blocks;
    }
    throw new Error(`Unexpected Textract status: ${status}`);
  }
}

/**
 * Run a PDF through the full Textract pipeline. Caller is responsible for
 * S3 cleanup via `deleteFromS3` — typically in a try/finally so a partial
 * failure doesn't leave stranded customer data sitting in the bucket.
 */
export async function analyzePdf(
  clients: TextractClients,
  pdfBuffer: Buffer,
  s3Key: string,
  onProgress?: ProgressCallback,
): Promise<Block[]> {
  onProgress?.({ percent: 8, stage: "uploading", detail: "Uploading PDF to S3" });
  await uploadPdfToS3(clients.s3, clients.bucket, s3Key, pdfBuffer);

  onProgress?.({ percent: 15, stage: "textract_starting", detail: "Submitting to Textract" });
  const jobId = await startTextractJob(clients.textract, clients.bucket, s3Key);

  return pollTextract(clients.textract, jobId, onProgress);
}
