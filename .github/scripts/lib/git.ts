import { execFileSync } from "node:child_process";

import { ensure, fail } from "./control.ts";
import { canonicalJson, digest, type Digest, type Json } from "./json.ts";

export type GitHashPath = Readonly<{
  excludeDirectoryNames?: readonly string[];
  excludePaths?: readonly string[];
  normalizePackageVersion?: boolean;
  normalizeTextLineEndings?: boolean;
  path: string;
}>;

type GitEntry = Readonly<{ mode: string; object: string; path: string; type: string }>;

export function git(args: readonly string[], cwd: string): Buffer {
  try {
    return execFileSync("git", args, { cwd, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function listGitEntries(root: string, ref: string, source: GitHashPath): readonly GitEntry[] {
  const raw = git(["ls-tree", "-rz", "--full-tree", ref, "--", source.path], root);
  const entries = raw.toString("utf8").split("\0").filter(Boolean).map((line): GitEntry => {
    const tab = line.indexOf("\t");
    if (tab < 0) fail(`invalid git ls-tree entry: ${line}`);
    const [mode, type, object] = line.slice(0, tab).split(" ");
    if (mode == null || type == null || object == null) fail(`invalid git ls-tree metadata: ${line}`);
    return { mode, object, path: line.slice(tab + 1), type };
  });
  const excludedDirectories = new Set(source.excludeDirectoryNames ?? []);
  const exclusions = (source.excludePaths ?? []).map((path) => `${source.path}/${path}`);
  return entries.filter((entry) => {
    const relativePath = entry.path === source.path ? "" : entry.path.slice(source.path.length + 1);
    if (relativePath.split("/").some((segment) => excludedDirectories.has(segment))) return false;
    return !exclusions.some((excluded) => entry.path === excluded || entry.path.startsWith(`${excluded}/`));
  });
}

function normalizedBlob(root: string, entry: GitEntry, source: GitHashPath): Readonly<{ digest: Digest; size: number }> {
  let body = git(["cat-file", "blob", entry.object], root);
  if (source.normalizePackageVersion === true && (entry.path === "package.json" || entry.path.endsWith("/package.json"))) {
    try {
      const packageJson = ensure.record(JSON.parse(body.toString("utf8")), `${entry.path} package metadata`);
      delete packageJson.version;
      body = Buffer.from(`${canonicalJson(packageJson)}\n`);
    } catch {
      // The owning validation reports malformed JSON; identity remains byte-exact.
    }
  }
  if (source.normalizeTextLineEndings === true && !body.includes(0)) {
    body = Buffer.from(body.toString("utf8").replace(/\r\n?/gu, "\n"));
  }
  return { digest: digest(body), size: body.byteLength };
}

export function gitPathSetDigest(
  root: string,
  ref: string,
  sources: readonly GitHashPath[],
  options: Readonly<{ domain: string; label: string }>,
): Digest {
  const seen = new Set<string>();
  const entries: Json[] = [];
  for (const source of sources) {
    const matched = listGitEntries(root, ref, source);
    if (matched.length === 0) fail(`${options.label} path does not exist at ${ref}: ${source.path}`);
    for (const entry of matched) {
      if (seen.has(entry.path)) fail(`${options.label} paths overlap at ${entry.path}`);
      seen.add(entry.path);
      if (entry.type === "blob") {
        const normalized = normalizedBlob(root, entry, source);
        entries.push({ kind: entry.mode === "120000" ? "symlink" : "file", mode: entry.mode, path: entry.path, ...normalized });
      } else {
        entries.push({ kind: entry.type, mode: entry.mode, object: entry.object, path: entry.path });
      }
    }
  }
  entries.sort((left, right) => String((left as Record<string, Json>).path).localeCompare(String((right as Record<string, Json>).path)));
  return digest(canonicalJson({ domain: options.domain, entries }));
}
