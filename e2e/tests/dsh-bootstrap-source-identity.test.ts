// Canonical DSH bootstrap installers live under tools/release/resources/.
// Landing still ships temporary public/ copies until extraction; those copies
// must stay byte-identical so the short open-design.ai URLs cannot drift from
// the product source. The R2 publisher only rewrites the CMD's documented PS1
// URL marker to the matching immutable version path.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..");

const NAMES = ["install-dsh.sh", "install-dsh.ps1", "install-dsh.cmd"] as const;

const canonicalDir = join(workspaceRoot, "tools", "release", "resources", "dsh-bootstrap");
const landingPublicDir = join(workspaceRoot, "apps", "landing-page", "public");

describe("DSH bootstrap installer source identity", () => {
  it("keeps landing public copies byte-identical to the product-owned canonical files", async () => {
    for (const name of NAMES) {
      const [canonical, landing] = await Promise.all([
        readFile(join(canonicalDir, name)),
        readFile(join(landingPublicDir, name)),
      ]);
      expect(landing.equals(canonical), `${name} drifted from tools/release/resources/dsh-bootstrap/`).toBe(
        true,
      );
    }
  });
});
