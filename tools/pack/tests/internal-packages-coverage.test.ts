import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");

type PackageJson = {
  dependencies?: Record<string, string>;
};

function readPackageJson(relativePath: string): PackageJson {
  return JSON.parse(readFileSync(join(ROOT, relativePath, "package.json"), "utf8")) as PackageJson;
}

function collectWorkspaceRuntimeDeps(relativePath: string): string[] {
  const pkg = readPackageJson(relativePath);
  if (pkg.dependencies == null) return [];
  return Object.keys(pkg.dependencies).filter((name) => name.startsWith("@open-design/"));
}

function loadInternalPackageNames(modulePath: string): string[] {
  const source = readFileSync(join(ROOT, modulePath), "utf8");
  const matches = source.matchAll(/name:\s*"(@open-design\/[^"]+)"/g);
  return [...matches].map((m) => m[1]!);
}

const PACK_LANES = [
  {
    roots: ["shells/electron", "apps/web", "apps/daemon"],
    lane: "mac",
    file: "tools/pack/src/mac/constants.ts",
  },
  {
    roots: ["shells/electron", "apps/web", "apps/daemon"],
    lane: "win",
    file: "tools/pack/src/win/constants.ts",
  },
];

describe("INTERNAL_PACKAGES covers all workspace runtime deps", () => {
  for (const { lane, file, roots } of PACK_LANES) {
    it(`${lane} lane includes all required workspace packages`, () => {
      const requiredPackages = new Set<string>();
      for (const root of roots) {
        for (const dep of collectWorkspaceRuntimeDeps(root)) {
          requiredPackages.add(dep);
        }
      }
      const declared = new Set(loadInternalPackageNames(file));
      const missing = [...requiredPackages].filter((pkg) => !declared.has(pkg));
      expect(missing, `${lane} INTERNAL_PACKAGES is missing: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
