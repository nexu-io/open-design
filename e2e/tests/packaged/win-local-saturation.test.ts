import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("Windows local saturation driver", () => {
  it("keeps native Windows cold starts isolated from installed release profiles", async () => {
    const script = await readFile(join(e2eRoot, "scripts", "win-local-saturation.ts"), "utf8");

    expect(script).toContain('const smokeProfile = process.env.OD_WIN_LOCAL_SMOKE_PROFILE ?? "full"');
    expect(script).toContain('`exact:${exactName}`');
    expect(script).toContain('OD_PACKAGED_E2E_HEADLESS: "1"');
    expect(script).toContain('OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED: smokeProfile === "full" ? "0" : "1"');
    expect(script).toContain('"scripts/release-smoke.ts", "win", "specs/win.spec.ts"');
    expect(script).toContain('OPEN_DESIGN_AMR_PROFILE: "test"');
    expect(script).toContain('["--filter", "@open-design/tools-release", "build"]');
    expect(script).toContain('["--filter", "@open-design/tools-serve", "build"]');
    expect(script).toContain('"--to", smokeProfile === "full" ? "all" : "nsis"');
    expect(script).toContain('join(parse(workspaceRoot).root, "odwl", slug)');
    expect(script).toContain("of at most 16 characters");
    expect(script).toContain('open-design-launch-context.json');
    expect(script).toContain('requires no active packaged launch transaction');
    expect(script).toContain('"win", "uninstall"');
    expect(script).toContain('OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH');
    expect(script).toContain('OD_PACKAGED_E2E_WIN_SMOKE_LANES = "shell,standalone"');
    expect(script).toContain('OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE = "tools-serve"');
    expect(script).toContain('OD_TOOLS_PACK_WIN_NSIS_TEST_HOOKS: "faults"');
    expect(script).toContain('"--portable"');
  });

  it("is exposed as the package-level Windows smoke command", async () => {
    const pkg = JSON.parse(await readFile(join(e2eRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["smoke:win:local"]).toBe("tsx scripts/win-local-saturation.ts");
  });
});
