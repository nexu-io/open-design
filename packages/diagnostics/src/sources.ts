import { open, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { redactJsonText, redactText, type RedactionOptions } from "./redaction.js";

export type LogSourceKind = "json" | "text" | "binary";

export interface LogSource {
  /** Relative path inside the export zip (forward-slash). */
  name: string;
  /** Absolute path on disk to read from. */
  absolutePath: string;
  /**
   * How to read the file: `json`/`text` are read as UTF-8 and redacted;
   * `binary` is copied verbatim (no text decode, no redaction) so an opaque
   * artifact like a Chromium crash minidump reaches the bundle intact.
   */
  kind: LogSourceKind;
  /** Optional max bytes to read from the file tail; omit for whole file. */
  tailBytes?: number;
}

export interface CollectedFile {
  name: string;
  absolutePath: string;
  /**
   * Contents to put into the zip: a redacted string for text/json sources, a
   * raw Buffer for binary sources, or null when the file could not be read.
   */
  content: string | Buffer | null;
  bytes: number;
  /** Reason the file is missing or unreadable. */
  error?: string;
}

const NEWLINE_BYTE = 0x0a;

/**
 * Drop the leading partial line of a tail window read from mid-file.
 *
 * INVARIANT: every line in a truncated text source is a COMPLETE line. The
 * sources this matters most for are jsonl event logs (`runs/<id>/events.jsonl`)
 * — a byte-exact cut almost always lands mid-object, so the bundle's first
 * line was half a JSON value and any consumer streaming the file through a
 * jsonl parser fell over on line 1. Ordinary line-oriented logs get the same
 * benefit: no half-line noise at the top of the captured tail.
 *
 * `data` must start ONE byte before the intended cut (the guard byte): when
 * that byte is a newline the cut already begins a fresh line and only the
 * guard byte is dropped, so an aligned cut never loses a complete line.
 *
 * Returns null when NO complete line fits in the window — a single record
 * longer than the whole tail budget, so there is nothing to align to. The
 * bytes there are the interior of one record; exporting them would put a
 * fragment on line 1, which is precisely the breakage this alignment exists
 * to prevent. The caller surfaces that as an unreadable source instead, so
 * the bundle explains the omission rather than shipping half a JSON object
 * that dies in the consumer's parser.
 */
function alignTailToLineStart(data: Buffer): Buffer | null {
  if (data.length === 0) return data;
  if (data[0] === NEWLINE_BYTE) return data.subarray(1);
  const firstNewline = data.indexOf(NEWLINE_BYTE);
  if (firstNewline === -1 || firstNewline + 1 >= data.length) return null;
  return data.subarray(firstNewline + 1);
}

async function readMaybeTail(absolutePath: string, tailBytes: number | undefined): Promise<{ text: string; bytes: number }> {
  if (tailBytes == null || tailBytes <= 0) {
    const buf = await readFile(absolutePath);
    return { text: buf.toString("utf8"), bytes: buf.byteLength };
  }
  // Read size and bytes from the same handle: a rotating log may be replaced
  // between stat(path) and open(path), leaving an offset for a different file.
  const fd = await open(absolutePath, "r");
  try {
    const info = await fd.stat();
    // Read one extra guard byte before the cut so alignTailToLineStart can
    // tell an already line-aligned cut apart from a mid-line one. Bound even
    // small files to their observed size so later appends cannot grow the read.
    const start = Math.max(0, info.size - tailBytes - 1);
    const buffer = Buffer.alloc(Math.min(info.size, tailBytes + 1));
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const result = await fd.read(buffer, bytesRead, buffer.length - bytesRead, start + bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    const data = buffer.subarray(0, bytesRead);
    const aligned = info.size > tailBytes ? alignTailToLineStart(data) : data;
    if (aligned === null) {
      throw new Error(
        `no complete line fits the ${tailBytes}-byte tail window (the trailing ` +
          `record is larger than the cap); omitted rather than exporting a ` +
          `partial record`,
      );
    }
    return { text: aligned.toString("utf8"), bytes: aligned.byteLength };
  } finally {
    await fd.close();
  }
}

export async function collectLogSource(source: LogSource, opts: RedactionOptions = {}): Promise<CollectedFile> {
  try {
    if (source.kind === "binary") {
      // Copy the bytes verbatim — a minidump is opaque binary; decoding it as
      // UTF-8 and running text redaction would corrupt it.
      const buf = await readFile(source.absolutePath);
      return { name: source.name, absolutePath: source.absolutePath, content: buf, bytes: buf.byteLength };
    }
    const { text, bytes } = await readMaybeTail(source.absolutePath, source.tailBytes);
    const redacted = source.kind === "json" ? redactJsonText(text, opts) : redactText(text, opts);
    return { name: source.name, absolutePath: source.absolutePath, content: redacted, bytes };
  } catch (error) {
    return {
      name: source.name,
      absolutePath: source.absolutePath,
      content: null,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectLogSources(sources: LogSource[], opts: RedactionOptions = {}): Promise<CollectedFile[]> {
  return await Promise.all(sources.map((source) => collectLogSource(source, opts)));
}

const DEFAULT_CRASH_DIRS_DARWIN = [
  "/Library/Logs/DiagnosticReports",
];

export interface CrashReportLookup {
  /** Filenames must contain at least one of these substrings (case-insensitive). */
  matchSubstrings: string[];
  /** Only include files modified within this many days. */
  withinDays?: number;
  /** Limit how many reports to include. */
  maxReports?: number;
  /** Override base directories to scan. */
  searchDirs?: string[];
  /** Home directory to derive ~/Library/Logs/DiagnosticReports from. */
  homeDir?: string;
}

export async function findMacOSCrashReports(lookup: CrashReportLookup): Promise<LogSource[]> {
  if (process.platform !== "darwin") return [];
  const within = (lookup.withinDays ?? 7) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - within;
  const max = lookup.maxReports ?? 20;
  const dirs = lookup.searchDirs ?? [
    ...(lookup.homeDir ? [join(lookup.homeDir, "Library/Logs/DiagnosticReports")] : []),
    ...DEFAULT_CRASH_DIRS_DARWIN,
  ];
  const matches = lookup.matchSubstrings.map((entry) => entry.toLowerCase());

  const found: { absolutePath: string; mtimeMs: number; name: string }[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (!matches.some((needle) => lower.includes(needle))) continue;
      const absolutePath = join(dir, entry);
      try {
        const info = await stat(absolutePath);
        if (!info.isFile()) continue;
        if (info.mtimeMs < cutoff) continue;
        found.push({ absolutePath, mtimeMs: info.mtimeMs, name: entry });
      } catch {
        continue;
      }
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, max).map(({ absolutePath, name }) => ({
    name: `crash-reports/${name}`,
    absolutePath,
    kind: "text",
  }));
}

export interface CrashDumpLookup {
  /** Root crashDumps directory (Electron's `app.getPath('crashDumps')`). */
  dir: string;
  /** Only include dumps modified within this many days. */
  withinDays?: number;
  /** Limit how many dumps to include (newest first). */
  maxDumps?: number;
}

/**
 * Collect Chromium/Electron crash minidumps as BINARY sources. `crashReporter`
 * writes `.dmp` files under `<crashDumps>/completed` (and `pending` before
 * upload; with `uploadToServer:false` they stay there). These carry the native
 * renderer/main crash stack — the only reliable way to root-cause an opaque
 * abort like `0x80000003` (a V8/Chromium CHECK), which no text log records.
 */
export async function findCrashDumps(lookup: CrashDumpLookup): Promise<LogSource[]> {
  const within = (lookup.withinDays ?? 14) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - within;
  const max = lookup.maxDumps ?? 10;
  const dirs = [lookup.dir, join(lookup.dir, "completed"), join(lookup.dir, "pending"), join(lookup.dir, "reports")];
  const found: { absolutePath: string; mtimeMs: number; name: string }[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".dmp")) continue;
      const absolutePath = join(dir, entry);
      try {
        const info = await stat(absolutePath);
        if (!info.isFile() || info.mtimeMs < cutoff) continue;
        found.push({ absolutePath, mtimeMs: info.mtimeMs, name: entry });
      } catch {
        continue;
      }
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, max).map(({ absolutePath, name }) => ({
    name: `crash-dumps/${name}`,
    absolutePath,
    kind: "binary",
  }));
}
