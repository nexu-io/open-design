import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve("..");

describe("exact Electron release topology", () => {
  it("keeps Terminal channels and adds the complete betahyx Electron topology", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const convergence = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/convergence-exact.json"), "utf8"));

    expect(workflow).toContain("options: [somechan, somepreview, betahyx]");
    expect(workflow).toContain("electron_scene_darwin_arm64");
    expect(workflow).toContain("electron_scene_win32_x64");
    expect(workflow).toContain("@open-design/shell-electron exact:scene");
    expect(workflow).toContain("@open-design/shell-electron exact:distribution");
    expect(workflow).toContain("@open-design/closure build:resources");
    expect(workflow).toContain("tools/release/dist/exact-control.mjs");
    expect(workflow).toContain('$RUNNER_TEMP/exact-plan/exact-control.mjs');
    expect(workflow).toContain("Install and exercise macOS Electron Shell");
    expect(workflow).toContain("Install and exercise Windows Electron Shell");
    expect(convergence.workflows["release-exact"]).toMatchObject({
      policy: "shell-scenes-v2",
      workloads: {
        terminal_scene_darwin_arm64: { reusable: true },
        electron_scene_darwin_arm64: { runnerClass: "electron_darwin_arm64", reusable: false },
        electron_scene_win32_x64: { runnerClass: "electron_win32_x64", reusable: false },
      },
    });
  });

  it("uses the TypeScript exact control plane with no temporary Python bridge", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");

    expect(workflow).toContain('"operation": "exact.prepare"');
    expect(workflow).toContain('"operation": "exact.finalize"');
    expect(workflow).toContain('"operation": "exact.publish"');
    expect(workflow).toContain('"operation": "exact.activate"');
    expect(workflow).not.toContain(".github/scripts/pack.py");
    expect(workflow).not.toContain(".github/scripts/release.py");
    expect(workflow).not.toContain("node tools/release/src/exact/control-cli.ts");
  });

  it("contains no legacy Electron application or launcher authority", async () => {
    const files = [
      "AGENTS.md",
      ".github/workflows/ci.yml",
      ".github/workflows/release-exact.yml",
      ".github/config/scopes.json",
      ".github/config/convergence.json",
      "scripts/guard.ts",
      "scripts/check-cross-app-imports.ts",
      "pnpm-lock.yaml",
    ];
    const contents = await Promise.all(files.map(async (file) => await readFile(resolve(workspaceRoot, file), "utf8")));
    for (const content of contents) {
      expect(content).not.toMatch(/apps\/(?:desktop|packaged)|@open-design\/(?:desktop|packaged|launcher-proto)|desktop-handoff\.json/u);
    }
  });
});
