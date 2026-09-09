export type ArchiveTool = "7z" | "zip" | "unzip";
export type ArchiveOptions = Readonly<{
  tool?: Readonly<{ kind: ArchiveTool; executable: string }>;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  allowInternalLinks?: boolean;
  /** Portable extraction grants no execute bits; authenticated callers may grant them later. */
  permissions?: "preserve" | "portable";
  /** Build-only: stage a sorted, timestamp-normalized snapshot before packing. */
  reproducible?: boolean;
  maxEntries?: number;
  maxExpandedBytes?: number;
}>;
export type ArchiveBackend = Readonly<{ kind: ArchiveTool; executable: string; version: string }>;
export type ArchiveEntry = Readonly<{ path: string; size: number; mode: number; kind: "file" | "directory" | "link" }>;
