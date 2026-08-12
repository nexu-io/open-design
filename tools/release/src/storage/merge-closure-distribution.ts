import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  mergeClosureDistributionContributions,
  type ClosureDistributionManifest,
} from "@open-design/closure-proto";

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`failed to read ${label} ${path}`, { cause: error });
  }
}

/** Aggregate untrusted cross-job contribution files through the shared protocol parser. */
export function mergeClosureDistributionFiles(input: Readonly<{
  sharedPath: string;
  targetPaths: readonly string[];
}>): ClosureDistributionManifest {
  return mergeClosureDistributionContributions(
    readJson(input.sharedPath, "Closure shared contribution"),
    input.targetPaths.map((path) => readJson(path, "Closure target contribution")),
    (canonical) => `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  );
}
