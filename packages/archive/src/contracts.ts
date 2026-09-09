export type ArchiveTool = "7z" | "zip" | "unzip";
export type ArchiveOptions = Readonly<{
  tool?: Readonly<{ kind: ArchiveTool; executable: string }>;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  allowInternalLinks?: boolean;
  maxEntries?: number;
  maxExpandedBytes?: number;
}>;
export type ArchiveBackend = Readonly<{ kind: ArchiveTool; executable: string; version: string }>;
export type ArchiveEntry = Readonly<{ path: string; size: number; mode: number; kind: "file" | "directory" | "link" }>;
