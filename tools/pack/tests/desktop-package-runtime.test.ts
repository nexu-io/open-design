import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const desktopPackageRoot = join(repoRoot, "apps", "desktop");

function readDesktopPackageJson(): {
  exports?: Record<string, { default?: string; types?: string }>;
  files?: string[];
} {
  return JSON.parse(readFileSync(join(desktopPackageRoot, "package.json"), "utf8"));
}

describe("desktop package runtime shape", () => {
  it("keeps exported desktop types inside the published dist allowlist", () => {
    const pkg = readDesktopPackageJson();

    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.exports?.["./main"]?.default).toBe("./dist/main/index.js");
    expect(pkg.exports?.["./main"]?.types).toBe("./dist/main/index.d.ts");
  });
});
