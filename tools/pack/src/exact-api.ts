import { finalizeExactContent, prepareExactContent } from "./exact/control-pack.js";

export type PrepareExactContentInput = Readonly<{
  channel: string;
  releaseVersion: string;
  sourceCommit: string;
  publishedAt: string;
  standaloneVersion: string;
  artifactBaseUrl: string;
  closureArtifactFile: string;
  standaloneArtifactFile: string;
  resourceReceiptFile?: string;
  previousContentMetadataFile?: string;
  shells: readonly Readonly<{ type: string; version: string; scenes: readonly Readonly<{
    target: string; sceneDirectory: string; sceneManifestSha256: string;
  }>[] }>[];
  outputDirectory: string;
}>;

export type FinalizeExactContentInput = Readonly<{
  prepareReceipt: string;
  contentMetadataFile: string;
  closureArtifactFile: string;
  standaloneArtifactFile: string;
  contributions: readonly Readonly<{ receipt: string; archiveFile: string }>[];
  outputDirectory: string;
}>;

/** Content assembly only; publication policy is owned and enforced by tools-release. */
export async function prepareContent(input: PrepareExactContentInput, receiptPath: string): Promise<void> {
  await prepareExactContent(input, receiptPath);
}

export async function finalizeContent(input: FinalizeExactContentInput, receiptPath: string): Promise<void> {
  await finalizeExactContent(input, receiptPath);
}
