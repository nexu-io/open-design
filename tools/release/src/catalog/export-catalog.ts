import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { optional, required, writeJson } from "../storage/common.ts";
import { exportCatalog } from "./export.ts";
import { committerIsoTimestamp } from "./git-meta.ts";
import { assertValidCatalog } from "./validate.ts";

export function resolveRepoRoot(): string {
  const fromEnv = optional("CATALOG_REPO_ROOT");
  if (fromEnv.length > 0) return resolve(fromEnv);

  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Fall through to layouts used by source execution and the bundled CLI.
  }

  for (const candidate of [
    resolve(import.meta.dirname, "../../../.."), // src/catalog
    resolve(import.meta.dirname, "../../.."), // dist
  ]) {
    if (existsSync(join(candidate, "pnpm-workspace.yaml"))) return candidate;
  }
  throw new Error("CATALOG_REPO_ROOT is required outside an Open Design checkout");
}

function resolveSourceCommit(): string {
  const fromEnv = optional("CATALOG_SOURCE_COMMIT");
  if (fromEnv.length > 0) return fromEnv.toLowerCase();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: resolveRepoRoot(),
      encoding: "utf8",
    }).trim().toLowerCase();
  } catch {
    throw new Error("CATALOG_SOURCE_COMMIT is required when git rev-parse fails");
  }
}

function exporterVersion(): string {
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"),
    resolve(process.cwd(), "tools/release/package.json"),
  ];
  for (const path of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string };
      if (pkg.name === "@open-design/tools-release" || pkg.version) {
        return `tools-release@${pkg.version ?? "0.0.0"}`;
      }
    } catch {
      // try next
    }
  }
  return "tools-release@unknown";
}

export async function exportCatalogFromEnv(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const sourceCommit = resolveSourceCommit();
  const generatedAt = optional("CATALOG_SOURCE_COMMITTED_AT") || committerIsoTimestamp(repoRoot, sourceCommit);
  const stagingDir = resolve(required("CATALOG_STAGING_DIR"));
  mkdirSync(stagingDir, { recursive: true });

  const { catalog, warnings } = exportCatalog({ repoRoot, sourceCommit, generatedAt });
  assertValidCatalog(catalog);
  writeJson(join(stagingDir, "catalog.json"), catalog);

  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
  console.log(`exported ${catalog.records.length} catalog records → ${join(stagingDir, "catalog.json")}`);
  console.log(`sourceCommit=${sourceCommit}`);
  console.log(`exporterVersion=${exporterVersion()}`);

  const githubOutput = optional("GITHUB_OUTPUT");
  if (githubOutput.length > 0) {
    writeFileSync(
      githubOutput,
      [
        `source_commit=${sourceCommit}`,
        `record_count=${catalog.records.length}`,
        `staging_dir=${stagingDir}`,
      ].join("\n") + "\n",
      { flag: "a", encoding: "utf8" },
    );
  }
}
