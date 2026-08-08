import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const shellPackageRoot = join(repoRoot, "shells", "electron");
const shellSourcePath = join(shellPackageRoot, "src", "index.ts");

function readShellPackageJson(): {
  exports?: Record<string, { default?: string; types?: string }>;
  files?: string[];
} {
  return JSON.parse(readFileSync(join(shellPackageRoot, "package.json"), "utf8"));
}

describe("Electron Shell package runtime shape", () => {
  it("keeps exported shell types inside the published dist allowlist", () => {
    const pkg = readShellPackageJson();

    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.exports?.["./main"]?.default).toBe("./dist/main/index.js");
    expect(pkg.exports?.["./main"]?.types).toBe("./dist/main/index.d.ts");
  });

  it("places the sandbox preload next to packaged app entrypoints", () => {
    const shellSource = readFileSync(shellSourcePath, "utf8");
    expect(shellSource).toContain('preloadPath: join(app.getAppPath(), "preload.cjs")');

    for (const relativePath of [
      "tools/pack/src/mac/app.ts",
      "tools/pack/src/win/app.ts",
    ]) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      expect(source).toContain('"shells", "electron", "dist", "main", "preload.cjs"');
      expect(source).toContain('join(paths.assembledAppRoot, "preload.cjs")');
    }
  });
});
