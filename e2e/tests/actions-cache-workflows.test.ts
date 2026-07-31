import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const setupWorkspaceAction = new URL("../../.github/actions/setup-workspace/action.yml", import.meta.url);
const cacheMaintenanceWorkflow = new URL("../../.github/workflows/cache-maintenance.yml", import.meta.url);
const landingPageCiWorkflow = new URL("../../.github/workflows/landing-page-ci.yml", import.meta.url);
const visualBaselineWorkflow = new URL("../../.github/workflows/visual-baseline.yml", import.meta.url);

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
}

describe("GitHub Actions cache workflows", () => {
  it("[P1] keeps pnpm cache writes on explicit trusted main seed jobs", async () => {
    const action = await readFile(setupWorkspaceAction, "utf8");

    expect(action).toContain("save-pnpm-cache:");
    expect(action).toContain("default: 'false'");
    expect(action).toContain("uses: actions/cache/restore@v5");
    expect(action).toContain("uses: actions/cache/save@v5");
    expect(action).not.toContain("uses: actions/cache@v5");
    expect(action.indexOf("uses: actions/cache/restore@v5")).toBeLessThan(
      action.indexOf("run: pnpm install --frozen-lockfile"),
    );
    expect(action.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(
      action.indexOf("uses: actions/cache/save@v5"),
    );

    const saveStep = action.slice(action.indexOf("- name: Save pnpm store"));
    expect(saveStep).toContain("inputs.save-pnpm-cache == 'true'");
    expect(saveStep).toContain("steps.persistent-pnpm-store.outputs.enabled != 'true'");
    expect(saveStep).toContain("steps.pnpm-cache-restore.outputs.cache-hit != 'true'");
    expect(saveStep).toContain("github.ref == 'refs/heads/main'");
    expect(saveStep).toContain("github.event_name == 'push'");
    expect(saveStep).toContain("github.event_name == 'workflow_dispatch'");
    expect(saveStep).toContain("github.event_name == 'schedule'");
  });

  it("[P1] seeds Windows from main and deletes only closed-PR BuildKit cache families", async () => {
    const workflow = await readFile(cacheMaintenanceWorkflow, "utf8");
    const seedJob = sectionBetween(workflow, "  seed-pnpm-windows:", "  clean-closed-pr-buildkit:");
    const cleanupJob = workflow.slice(workflow.indexOf("  clean-closed-pr-buildkit:"));

    expect(workflow).toContain("pull_request_target:");
    expect(workflow).toContain("types: [closed]");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("actions: write");
    expect(workflow).toContain("contents: read");

    expect(seedJob).toContain("github.event_name == 'push'");
    expect(seedJob).toContain("github.event_name == 'workflow_dispatch'");
    expect(seedJob).toContain("github.ref == 'refs/heads/main'");
    expect(seedJob).toContain("runs-on: windows-latest");
    expect(seedJob).toContain("uses: actions/checkout@v6.0.2");
    expect(seedJob).toContain("uses: ./.github/actions/setup-workspace");
    expect(seedJob).toContain("save-pnpm-cache: 'true'");

    expect(cleanupJob).toContain("github.event_name == 'pull_request_target'");
    expect(cleanupJob).toContain("refs/pull/${{ github.event.pull_request.number }}/merge");
    expect(cleanupJob).toContain('startswith("buildkit-blob-")');
    expect(cleanupJob).toContain('startswith("index-buildkit-")');
    expect(cleanupJob).toContain("--json id,key,sizeInBytes");
    expect(cleanupJob).toContain("gh cache delete \"$cache_id\"");
    expect(cleanupJob).not.toContain("gh cache delete --all");
    expect(cleanupJob).not.toContain("actions/checkout");
    expect(cleanupJob).not.toContain("github.event.pull_request.head");
  });

  it("[P1] uses the existing main visual baseline as the Linux pnpm seed", async () => {
    const workflow = await readFile(visualBaselineWorkflow, "utf8");
    const setupStep = sectionBetween(workflow, "      - name: Setup workspace", "      - name: Setup Playwright");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("- main");
    expect(setupStep).toContain("uses: ./.github/actions/setup-workspace");
    expect(setupStep).toContain("save-pnpm-cache: 'true'");
  });

  it("[P1] keeps landing preview caches restore-only before merge and seeds them from main", async () => {
    const workflow = await readFile(landingPageCiWorkflow, "utf8");

    expect(workflow).toContain("uses: actions/cache/restore@v5");
    expect(workflow).toContain("uses: actions/cache/save@v5");
    expect(workflow).not.toContain("uses: actions/cache@v5");
    expect(workflow.indexOf("uses: actions/cache/restore@v5")).toBeLessThan(
      workflow.indexOf("- name: Generate skill + template previews"),
    );
    expect(workflow.indexOf("- name: Generate skill + template previews")).toBeLessThan(
      workflow.indexOf("- name: Build landing page"),
    );
    expect(workflow.indexOf("- name: Build landing page")).toBeLessThan(
      workflow.indexOf("uses: actions/cache/save@v5"),
    );

    const saveStep = sectionBetween(
      workflow,
      "      - name: Save generated previews",
      "      - name: Lint changed blog SEO",
    );
    expect(saveStep).toContain("steps.previews-cache.outputs.cache-hit != 'true'");
    expect(saveStep).toContain("github.ref == 'refs/heads/main'");
    expect(saveStep).toContain("github.event_name == 'push' || github.event_name == 'workflow_dispatch'");
  });
});
