import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("Windows local saturation driver", () => {
  it("keeps native Windows cold starts isolated from installed release profiles", async () => {
    const script = await readFile(join(e2eRoot, "scripts", "win-local-saturation.ts"), "utf8");

    expect(script).toContain('"--debug-channel", "local"');
    expect(script).toContain('OD_PACKAGED_E2E_HEADLESS: "1"');
    expect(script).toContain('OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED: "1"');
    expect(script).toContain('"scripts/release-smoke.ts", "win", "specs/win.spec.ts"');
    expect(script).toContain('OPEN_DESIGN_AMR_PROFILE: "test"');
    expect(script).toContain('"--to", "nsis"');
    expect(script).toContain('join(parse(workspaceRoot).root, "odwl", slug)');
    expect(script).toContain("of at most 16 characters");
    expect(script).not.toContain('"--portable"');
  });

  it("is exposed as the package-level Windows smoke command", async () => {
    const pkg = JSON.parse(await readFile(join(e2eRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["smoke:win:local"]).toBe("tsx scripts/win-local-saturation.ts");
  });
});
