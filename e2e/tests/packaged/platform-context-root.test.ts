import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("split packaged platform context roots", () => {
  for (const platform of ["mac", "win"]) {
    it(`resolves ${platform} paths from the e2e package and workspace roots`, async () => {
      const context = await readFile(join(e2eRoot, "specs", platform, "lib", "context.ts"), "utf8");

      expect(context).toContain("dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))");
      expect(context).toContain("workspaceRoot = dirname(e2eRoot)");
      expect(context).not.toContain("dirname(dirname(dirname(fileURLToPath(import.meta.url))));");
    });
  }
});
