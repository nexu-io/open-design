import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");

describe("packaged smoke workflow", () => {
  it("keeps legacy packaged smoke outside the main CI gate", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    expect(workflow).not.toContain("Build PR mac artifacts");
    expect(workflow).not.toContain("Build PR windows artifacts");
    expect(workflow).not.toContain("Build PR linux headless artifacts");
    expect(workflow).not.toContain("Smoke PR mac packaged runtime");
    expect(workflow).not.toContain("Smoke PR windows packaged runtime");
    expect(workflow).not.toContain("Smoke PR linux headless packaged runtime");
    expect(workflow).not.toContain("actions/cache/save");
    expect(workflow).toContain("packaged_smoke_tauri_win");
    expect(workflow).toContain("packaged_smoke_tauri_linux");
  });

  it("preserves beta linux Tauri smoke reports for platform publication", async () => {
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(
      /- name: Build beta linux artifacts\n[\s\S]+?(?=\n      - name: Smoke beta linux Tauri packaged runtime)/m,
    );
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain(
      'node -e \'const fs = require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));\' "$build_json_path"',
    );
    expect(workflow).toContain("Smoke beta linux Tauri packaged runtime");
    expect(workflow).toContain("tools-pack.json");
    expect(workflow).toContain("Upload linux Tauri e2e spec report");
    expect(workflow).toContain("open-design-beta-linux-tauri-e2e-report");
    expect(workflow).toContain("Publish beta linux assets to R2");
    expect(workflow).toContain("RELEASE_PLATFORM: linux");
    expect(workflow).toContain("Upload linux publish manifest");
    expect(workflow).toContain("open-design-beta-linux-publish-manifest");
    expect(workflow).not.toContain("Download linux e2e spec report");
    expectReleaseLinuxBuildPreservesEvidence(
      workflow,
      "Build beta linux artifacts",
      "Smoke beta linux Tauri packaged runtime",
    );
    expectReleaseLinuxTauriSmokeReusesEvidence(workflow, "Smoke beta linux Tauri packaged runtime");
  });

  it("preserves stable linux AppImage smoke reports for release publication", async () => {
    const workflow = await readFile(releaseStableWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(/- name: Build release linux artifacts\n[\s\S]+?(?=\n      - name: Smoke release linux AppImage runtime)/m);
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain(
      'node -e \'const fs = require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));\' "$build_json_path"',
    );
    expect(workflow).toContain("Smoke release linux AppImage runtime");
    expect(workflow).toContain("manifest.json");
    expect(workflow).toContain("tools-pack.json");
    expect(workflow).toContain("Upload linux e2e spec report");
    expect(workflow).toContain("open-design-release-linux-e2e-report");
    expect(workflow).toContain("Download linux e2e spec report");
    expectReleaseLinuxBuildPreservesEvidence(
      workflow,
      "Build release linux artifacts",
      "Smoke release linux AppImage runtime",
    );
    expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow, "Smoke release linux AppImage runtime");
  });

  it("reruns Tauri package smoke when migration handoff scripts change", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const expectedPaths = [
      "scripts/advance-tauri-migration-m4-m5.ts",
      "scripts/advance-tauri-migration-m4-m5.test.ts",
      "scripts/apply-tauri-migration-m5.ts",
      "scripts/apply-tauri-migration-m5.test.ts",
      "scripts/create-tauri-migration-bundle.ts",
      "scripts/create-tauri-migration-bundle.test.ts",
      "scripts/import-tauri-migration-bundle.ts",
      "scripts/import-tauri-migration-bundle.test.ts",
      "scripts/tauri-migration-inventory.ts",
      "scripts/tauri-migration-inventory.test.ts",
      "scripts/tauri-migration-policy.ts",
      "scripts/tauri-migration-policy.test.ts",
      "scripts/tauri-migration-status.ts",
      "scripts/tauri-migration-status.test.ts",
      "scripts/verify-tauri-migration-handoff.ts",
      "scripts/verify-tauri-migration-handoff.test.ts",
      "scripts/verify-tauri-migration-remote.ts",
      "scripts/verify-tauri-migration-remote.test.ts",
      "scripts/verify-tauri-platform-gates.ts",
      "scripts/verify-tauri-platform-gates.test.ts",
    ];

    for (const expectedPath of expectedPaths) {
      const quotedPath = `"${expectedPath}"`;
      const occurrences = workflow.split(quotedPath).length - 1;
      expect(occurrences, `${expectedPath} must be present in Tauri CI scope detection`).toBeGreaterThanOrEqual(1);
    }
  });
});

function expectReleaseLinuxBuildPreservesEvidence(workflow: string, stepName: string, nextStepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n[\\s\\S]+?(?=\\n      - name: ${nextStepName})`, "m"))?.[0];
  expect(step).toBeDefined();
  expect(step).toContain('report_dir="$RUNNER_TEMP/release-report/linux"');
  expect(step).toContain('mkdir -p "$report_dir"');
  expect(step).toContain('build_json_path="$report_dir/tools-pack.json"');
  expect(step).toContain('build_log_path="$report_dir/tools-pack.log"');
  expect(step).toContain('printf \'%s\\n\' "$build_output" | tee "$build_json_path"');
}

function expectReleaseLinuxTauriSmokeReusesEvidence(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n[\\s\\S]+?(?=\\n      - name: Verify beta linux Tauri smoke report evidence)`, "m"))?.[0];
  expect(step).toBeDefined();
  expect(step).toContain("OD_PACKAGED_E2E_REUSE_BUILD: \"1\"");
  expect(step).toContain("OD_PACKAGED_E2E_BUILD_JSON_PATH: ${{ runner.temp }}/release-report/linux/tools-pack.json");
  expect(step).toContain("OD_PACKAGED_E2E_REPORT_DIR: ${{ runner.temp }}/release-report/linux");
  expect(step).toContain("xvfb-run -a pnpm exec tsx scripts/release-smoke.ts linux specs/linux.spec.ts");
  expect(step).not.toContain("sudo apt-get update");
}

function expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n[\\s\\S]+?(?=\\n      - name: Upload linux e2e spec report)`, "m"))?.[0];
  expect(step).toBeDefined();
  const aptIndex = step?.indexOf("sudo apt-get update") ?? -1;
  const reportDirIndex = step?.indexOf('report_dir="$RUNNER_TEMP/release-report/linux"') ?? -1;

  expect(aptIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeLessThan(aptIndex);
}
