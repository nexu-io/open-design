import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { uiP0CiMatrix, visualCiMatrix } from "../../lib/playwright/suites.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const script = path.join(repoRoot, ".github/scripts/scopes.py");

type Plan = {
  scopes: Record<string, boolean | string>;
  enabled: Record<string, boolean>;
  matrices: { ui_p0: unknown[]; visual: unknown[] };
  trace: {
    escalations: unknown[];
    ruleHits: Record<string, number>;
    uiP0Shadow: { mode: string; matrix: Array<{ name: string }> };
  };
};

function plan(context: "pr" | "merge-queue" | "full", files: string[] = []): Plan {
  return JSON.parse(execFileSync("python3", [script, "plan", "--context", context, "--files", ...files], {
    cwd: repoRoot,
    encoding: "utf8",
  })) as Plan;
}

describe("workflow scope planner", () => {
  test("keeps the JSON matrices aligned with the business-owned suite topology", () => {
    expect(plan("full").matrices).toEqual({ ui_p0: uiP0CiMatrix, visual: visualCiMatrix });
  });

  test("owns configuration validation without a downstream guard registry", () => {
    expect(execFileSync("python3", [script, "validate"], { cwd: repoRoot, encoding: "utf8" }))
      .toContain("scope configuration is valid");

    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "scope-contract-"));
    try {
      const config = JSON.parse(readFileSync(path.join(repoRoot, ".github/config/scopes.json"), "utf8")) as {
        matrices: { ui_p0: Array<{ name: string; shard: string }> };
      };
      config.matrices.ui_p0.push({ ...config.matrices.ui_p0[0]! });
      const configPath = path.join(temporaryRoot, "scopes.json");
      writeFileSync(configPath, JSON.stringify(config));
      const failed = spawnSync("python3", [script, "--config", configPath, "validate"], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(failed.status).toBe(2);
      expect(failed.stderr).toContain("scopes.matrices.ui_p0 contains duplicate names");
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  test("routes representative PR changes without importing the workspace", () => {
    expect(plan("pr", ["apps/web/src/App.tsx"])).toMatchObject({
      scopes: { web_tests_required: true, ui_p0_validation_required: true, visual_validation_required: true },
      enabled: { web_workspace_tests: true, e2e_vitest: true, ui_p0: true, playwright_visual: true },
    });
    expect(plan("pr", ["apps/desktop/src/main.ts"])).toMatchObject({
      scopes: { tools_dev_tests_required: true, tools_pack_tests_required: true },
      enabled: { windows_tools_pack_payload_tests: false, ui_p0: false, playwright_critical: false },
    });
    expect(plan("pr", ["tools/pack/src/win/payload.ts"])).toMatchObject({
      scopes: { tools_pack_tests_required: true, windows_tools_pack_payload_tests_required: true },
      enabled: { windows_tools_pack_payload_tests: true, ui_p0: false, playwright_critical: false },
    });
    expect(plan("pr", ["tools/pack/src/launcher/layout.ts"])).toMatchObject({
      scopes: { tools_pack_tests_required: true, windows_tools_pack_payload_tests_required: true },
      enabled: { windows_tools_pack_payload_tests: true },
    });
    expect(plan("pr", ["tools/pack/src/mac/payload.ts"])).toMatchObject({
      scopes: { tools_pack_tests_required: true, windows_tools_pack_payload_tests_required: false },
      enabled: { windows_tools_pack_payload_tests: false },
    });
    expect(plan("pr", ["tools/pack/src/future-root-helper.ts"])).toMatchObject({
      scopes: { tools_pack_tests_required: true, windows_tools_pack_payload_tests_required: true },
      enabled: { windows_tools_pack_payload_tests: true },
      trace: { ruleHits: { "tools-pack-root-source-fallback": 1 } },
    });
    expect(plan("pr", ["packages/launcher-proto/src/index.ts"])).toMatchObject({
      scopes: { windows_tools_pack_payload_tests_required: true },
      enabled: { windows_tools_pack_payload_tests: true },
    });
    expect(plan("pr", ["pnpm-lock.yaml"])).toMatchObject({
      scopes: { windows_tools_pack_payload_tests_required: true },
      enabled: { windows_tools_pack_payload_tests: true },
    });
    expect(plan("pr", ["docs/spec.md"])).toMatchObject({
      scopes: { workspace_validation_required: false },
      enabled: { preflight: true, workspace_unit_tests: true, ui_p0: false },
    });
  });

  test("runs planner contract tests for CI control-plane changes", () => {
    const controlPlaneFiles = [
      ".github/config/scopes.json",
      ".github/config/convergence.json",
      ".github/config/runners.json",
      ".github/scripts/scopes.py",
      ".github/scripts/convergence.py",
      ".github/scripts/runners.py",
      ".github/scripts/handoff.py",
      ".github/scripts/lib/config.py",
      ".github/scripts/lib/github.py",
      ".github/scripts/lib/r2.py",
      ".github/workflows/convergence.atom.yml",
    ];
    for (const file of controlPlaneFiles) {
      expect(plan("pr", [file]), file).toMatchObject({
        scopes: { web_tests_required: true, workspace_validation_required: true },
        enabled: { e2e_vitest: true, workspace_unit_tests: true },
        trace: { escalations: [] },
      });
    }
  });

  test("routes Terminal exact sources and release orchestration to scene validation", () => {
    for (const file of [
      "apps/closure/src/index.ts",
      "packages/standalone/src/store.ts",
      "shells/terminal/src/cli.ts",
      ".github/scripts/pack.py",
      ".github/scripts/release.py",
      ".github/workflows/release-exact.yml",
    ]) {
      expect(plan("pr", [file]), file).toMatchObject({
        scopes: { terminal_scene_required: true, workspace_validation_required: true },
        enabled: { terminal_scene: true, workspace_unit_tests: true },
        trace: { escalations: [] },
      });
    }
    expect(plan("pr", ["docs/spec.md"])).toMatchObject({
      scopes: { terminal_scene_required: false },
      enabled: { terminal_scene: false },
    });
  });

  test("directly owns promoted merge-queue routing", () => {
    expect(plan("merge-queue", ["docs/spec.md"])).toMatchObject({
      enabled: { preflight: true, workspace_unit_tests: false, e2e_vitest: false },
      trace: { escalations: [] },
    });
    expect(plan("merge-queue", ["apps/daemon/src/server.ts"])).toMatchObject({
      enabled: { daemon_unit_tests: true, e2e_vitest: true, ui_p0: true, web_workspace_tests: false },
      trace: { escalations: [] },
    });
    expect(plan("merge-queue", ["apps/desktop/src/main.ts"])).toMatchObject({
      enabled: { windows_tools_pack_payload_tests: false, workspace_unit_tests: true, e2e_vitest: false },
      trace: { escalations: [] },
    });
    expect(plan("merge-queue", ["tools/pack/src/win/custom-installer.ts"])).toMatchObject({
      enabled: { windows_tools_pack_payload_tests: true, workspace_unit_tests: true, e2e_vitest: false },
      trace: { escalations: [] },
    });
    const medium = plan("merge-queue", ["apps/web/src/App.tsx"]);
    expect(medium.trace.escalations).toHaveLength(1);
    expect(Object.values(medium.scopes).filter((value) => typeof value === "boolean")).not.toContain(false);

    const unknown = plan("merge-queue", ["some-new-root/file.ts"]);
    expect(unknown).toMatchObject({ enabled: { windows_tools_pack_payload_tests: true } });
    expect(unknown.trace.escalations).toHaveLength(1);
  });

  test("keeps the Windows payload workload in forced-full plans", () => {
    expect(plan("full")).toMatchObject({ enabled: { windows_tools_pack_payload_tests: true } });
  });

  test("preserves the four-domain runtime-definition shadow candidate", () => {
    const candidate = plan("pr", ["apps/daemon/src/runtimes/defs/codex.ts"]);
    expect(candidate.trace.uiP0Shadow.mode).toBe("candidate");
    expect(candidate.trace.uiP0Shadow.matrix.map((entry) => entry.name)).toEqual([
      "entry-settings", "project-workspace", "project-collab", "project-runtime",
    ]);
    expect(plan("pr", ["apps/daemon/src/server.ts"]).trace.uiP0Shadow.mode).toBe("full-fallback");
  });

  test("configuration remains a Linux workflow-control contract", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("python3 .github/scripts/scopes.py github-output");
    expect(workflow).not.toContain("scripts/scopes.ts");
    const windowsPayload = workflow.slice(
      workflow.indexOf("  windows_tools_pack_payload_tests:"),
      workflow.indexOf("  web_workspace_tests:"),
    );
    expect(windowsPayload).not.toMatch(/\.github\/scripts\/(?:scopes|convergence|runners)\.py/);
  });
});
