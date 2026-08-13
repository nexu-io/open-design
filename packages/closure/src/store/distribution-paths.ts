import { resolve, sep } from "node:path";

import type { ClosureDigest } from "../protocol/index.js";

function segment(value: string, label: string): string {
  if (value.length === 0 || value === "." || value === ".." || /[\\/\0]/u.test(value)) {
    throw new Error(`invalid Closure ${label} path segment: ${value}`);
  }
  return value;
}

export function resolveDistributionInstallationRoot(input: Readonly<{
  digest: ClosureDigest;
  installationsRoot: string;
  root: string;
  target: string;
  version: string;
}>): string {
  const digest = input.digest.slice("sha256:".length);
  const path = resolve(
    input.installationsRoot,
    segment(input.version, "version"),
    segment(digest, "distribution digest"),
    segment(input.target, "target"),
  );
  const root = resolve(input.root);
  if (!path.startsWith(`${root}${sep}`)) throw new Error("Closure installation path escapes its Store");
  return path;
}
