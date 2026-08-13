import { readFile } from "node:fs/promises";
import path from "node:path";

import type { GuardContext } from "./core.ts";

export const STANDALONE_CLOSURE_SOURCE_LIMIT = 800;

export const STANDALONE_CLOSURE_SOURCE_FILES = Object.freeze([
  "apps/standalone/src/protocol/index.ts",
  "apps/standalone/src/protocol/core-validation.ts",
  "apps/standalone/src/protocol/operations.ts",
  "packages/closure/src/protocol/index.ts",
  "packages/closure/src/protocol/distribution.ts",
  "packages/closure/src/store/index.ts",
  "packages/closure/src/store/distribution-paths.ts",
  "packages/closure/src/store/legacy-candidate.ts",
  "packages/closure/src/update/index.ts",
  "packages/closure/src/update/apply.ts",
  "packages/host/src/shell-update.ts",
  "packages/sidecar/src/protocol.ts",
  "packages/sidecar/src/desktop-protocol.ts",
  "tools/pack/src/closure.ts",
  "tools/pack/src/closure-build-runtime.ts",
  "tools/pack/src/closure-components.ts",
  "tools/pack/src/closure-prebundle.ts",
  "tools/pack/src/closure-runtime-source.ts",
  "tools/pack/src/shell-build-plan.ts",
  "tools/pack/src/workspace-build.ts",
  "tools/release/src/storage/installation-version-floor.ts",
  "tools/release/src/storage/publish-metadata.ts",
  "tools/release/src/storage/publish-platform.ts",
  "tools/release/src/storage/shell-build.ts",
] as const);

export async function standaloneClosureSourceSizeErrors(repoRoot: string): Promise<string[]> {
  const errors: string[] = [];
  for (const file of STANDALONE_CLOSURE_SOURCE_FILES) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.endsWith("\n") ? source.split("\n").length - 1 : source.split("\n").length;
    if (lines >= STANDALONE_CLOSURE_SOURCE_LIMIT) {
      errors.push(`${file} has ${lines} lines; expected fewer than ${STANDALONE_CLOSURE_SOURCE_LIMIT}`);
    }
  }
  return errors;
}

export async function checkStandaloneClosureSourceSize(context: GuardContext): Promise<boolean> {
  const errors = await standaloneClosureSourceSizeErrors(context.repoRoot);
  if (errors.length === 0) {
    console.log("Standalone Closure source-size check passed.");
    return true;
  }
  console.error("Standalone Closure source-size check failed:");
  for (const error of errors) console.error(`- ${error}`);
  return false;
}
