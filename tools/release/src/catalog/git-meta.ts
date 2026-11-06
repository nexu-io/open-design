import { execFileSync } from "node:child_process";

/**
 * Committer ISO-8601 timestamp for a full sha (`git log -1 --format=%cI`).
 * Used for catalog.generatedAt / provenance.generatedAt so snapshots are
 * deterministic for a given source commit.
 */
export function committerIsoTimestamp(repoRoot: string, sourceCommit: string): string {
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error(`sourceCommit must be a full 40-char hex sha; got ${sourceCommit}`);
  }
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", sourceCommit],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!out) {
      throw new Error("empty git log output");
    }
    return out;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to resolve committer timestamp for ${sourceCommit}: ${message}`,
    );
  }
}

/** Monotonic ancestry count for commits published from the main branch. */
export function commitGeneration(repoRoot: string, sourceCommit: string): number {
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error(`sourceCommit must be a full 40-char hex sha; got ${sourceCommit}`);
  }
  try {
    const out = execFileSync(
      "git",
      ["rev-list", "--count", sourceCommit],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const generation = Number(out);
    if (!Number.isSafeInteger(generation) || generation < 1) {
      throw new Error(`invalid git rev-list count: ${out}`);
    }
    return generation;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to resolve commit generation for ${sourceCommit}: ${message}`,
    );
  }
}
