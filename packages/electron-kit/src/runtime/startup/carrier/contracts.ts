export type OfficialNodeTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";

export type OfficialNodeLock = Readonly<{
  schemaVersion: 1;
  version: string;
  targets: Readonly<Record<OfficialNodeTarget, Readonly<{
    archive: string;
    mediaType: "application/gzip" | "application/zip";
    sha256: string;
    url: string;
  }>>>;
}>;

export type OfficialNodeCarrierReceipt = Readonly<{
  schemaVersion: 1;
  target: OfficialNodeTarget;
  version: string;
  archiveSha256: string;
  executablePath: string;
  executableSha256: string;
  source: "cache" | "download";
}>;

export class OfficialNodeCarrierError extends Error {
  constructor(
    readonly code: "extraction-failed" | "integrity-failed" | "resource-unavailable" | "unsupported-target",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OfficialNodeCarrierError";
  }
}
