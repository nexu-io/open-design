import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { DesktopUpdateCacheLifecycleSummary } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "./config.js";

const UPDATE_STATE_DIR = "state";
const UPDATE_CLEANUP_FILE = "cleanup.json";
const UPDATE_RELEASES_DIR = "releases";

type ReleaseLifecycleDescriptor = {
  platform?: unknown;
  releases?: unknown;
  trigger?: unknown;
  updatedAt?: unknown;
};

export type ToolPackUpdateCacheLifecycleSnapshot = {
  cleanupPath: string;
  descriptorExists: boolean;
  descriptorError?: string;
  releaseBytes: number;
  releaseCount: number;
  releasesRoot: string;
  summary: DesktopUpdateCacheLifecycleSummary | null;
  updateRoot: string;
};

function emptySummary(platform: string): DesktopUpdateCacheLifecycleSummary {
  return {
    platform,
    releases: {
      cleanupDeferred: 0,
      cleanupRemoved: 0,
      deprecated: 0,
      errors: 0,
      retained: 0,
      total: 0,
      unknown: 0,
    },
  };
}

function summarizeDescriptor(raw: ReleaseLifecycleDescriptor): DesktopUpdateCacheLifecycleSummary | null {
  if (!Array.isArray(raw.releases)) return null;
  const platform = typeof raw.platform === "string" ? raw.platform : "unknown";
  const summary = emptySummary(platform);
  if (raw.updatedAt != null && typeof raw.updatedAt === "string") summary.lastRunAt = raw.updatedAt;
  if (raw.trigger === "cold-start" || raw.trigger === "next-version-ready") summary.lastTrigger = raw.trigger;
  summary.releases.total = raw.releases.length;
  for (const entry of raw.releases) {
    if (entry == null || typeof entry !== "object") continue;
    const record = entry as { error?: unknown; state?: unknown };
    if (record.state === "cleanup-deferred") summary.releases.cleanupDeferred += 1;
    if (record.state === "cleanup-removed") summary.releases.cleanupRemoved += 1;
    if (record.state === "deprecated") summary.releases.deprecated += 1;
    if (record.state === "retained") summary.releases.retained += 1;
    if (record.state === "unknown") summary.releases.unknown += 1;
    if (record.error != null) summary.releases.errors += 1;
  }
  return summary;
}

async function pathBytes(path: string): Promise<number> {
  const entry = await stat(path).catch(() => null);
  if (entry == null) return 0;
  if (entry.isFile()) return entry.size;
  if (!entry.isDirectory()) return 0;
  let total = 0;
  const children = await readdir(path, { withFileTypes: true }).catch(() => []);
  for (const child of children) {
    total += await pathBytes(join(path, child.name));
  }
  return total;
}

export async function readToolPackUpdateCacheLifecycleSnapshot(
  config: Pick<ToolPackConfig, "platform" | "roots">,
): Promise<ToolPackUpdateCacheLifecycleSnapshot> {
  const updateRoot = join(config.roots.runtime.namespaceRoot, "updates");
  const releasesRoot = join(updateRoot, UPDATE_RELEASES_DIR);
  const cleanupPath = join(updateRoot, UPDATE_STATE_DIR, UPDATE_CLEANUP_FILE);
  const releaseEntries = await readdir(releasesRoot, { withFileTypes: true }).catch(() => []);
  const releaseDirs = releaseEntries.filter((entry) => entry.isDirectory());
  let descriptorExists = false;
  let descriptorError: string | undefined;
  let summary: DesktopUpdateCacheLifecycleSummary | null = null;
  try {
    const raw = JSON.parse(await readFile(cleanupPath, "utf8")) as ReleaseLifecycleDescriptor;
    descriptorExists = true;
    summary = summarizeDescriptor(raw);
    if (summary == null) descriptorError = "cleanup descriptor shape is not recognized";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") descriptorError = error instanceof Error ? error.message : String(error);
  }

  return {
    cleanupPath,
    descriptorExists,
    ...(descriptorError == null ? {} : { descriptorError }),
    releaseBytes: await pathBytes(releasesRoot),
    releaseCount: releaseDirs.length,
    releasesRoot,
    summary,
    updateRoot,
  };
}
