import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");

describe("packaged smoke workflow", () => {
  it("builds the PR mac smoke artifact without portable mode", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const macBuildStep = workflow.match(/- name: Build PR mac artifacts\n(?:.+\n)+?(?=\n      - name: Smoke PR mac packaged runtime)/m);

    expect(macBuildStep?.[0]).toBeDefined();
    expect(macBuildStep?.[0]).not.toContain("--portable");
  });

  it("reruns Tauri package smoke when migration handoff scripts change", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    const expectedPaths = [
      "scripts/apply-tauri-migration-m5.ts",
      "scripts/apply-tauri-migration-m5.test.ts",
      "scripts/create-tauri-migration-bundle.ts",
      "scripts/create-tauri-migration-bundle.test.ts",
      "scripts/import-tauri-migration-bundle.ts",
      "scripts/import-tauri-migration-bundle.test.ts",
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
      expect(occurrences, `${expectedPath} must be present in required and tools-pack CI scope detection`).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});
