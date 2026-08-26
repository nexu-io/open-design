export const ELECTRON_DISTRIBUTION_PROJECTION_SCHEMA_VERSION = 1 as const;

export type ElectronArtifactDigest = `sha256:${string}`;

/**
 * A byte-immutable artifact that has already crossed its native signing and
 * verification boundary. Projection may copy or wrap it, but may never mutate
 * the source path in place.
 */
export type ElectronVerifiedDistributionArtifact = Readonly<{
  kind: string;
  path: string;
  digest: ElectronArtifactDigest;
  size: number;
  verificationReceiptDigest: ElectronArtifactDigest;
}>;

/** Release/build facts that may be attached outside signed artifact bytes. */
export type ElectronDistributionBuildInformation = Readonly<{
  releaseVersion: string;
  channel: string;
  sourceCommit: string;
  buildId: string;
  publishedAt: string;
  artifactBaseUrl: string | null;
}>;

export type ElectronDistributionProjectionRequest = Readonly<{
  schemaVersion: typeof ELECTRON_DISTRIBUTION_PROJECTION_SCHEMA_VERSION;
  operation: "electron.distribution.project";
  sourceArtifacts: readonly ElectronVerifiedDistributionArtifact[];
  build: ElectronDistributionBuildInformation;
  outputRoot: string;
}>;

export type ElectronProjectedDistributionArtifact = Readonly<{
  kind: string;
  path: string;
  digest: ElectronArtifactDigest;
  size: number;
  sourceDigest: ElectronArtifactDigest | null;
}>;

export type ElectronDistributionProjectionReceipt = Readonly<{
  schemaVersion: typeof ELECTRON_DISTRIBUTION_PROJECTION_SCHEMA_VERSION;
  operation: "electron.distribution.project";
  sourceArtifacts: readonly ElectronVerifiedDistributionArtifact[];
  projectedArtifacts: readonly ElectronProjectedDistributionArtifact[];
  build: ElectronDistributionBuildInformation;
  outputRoot: string;
}>;
