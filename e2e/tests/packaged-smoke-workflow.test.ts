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
});
