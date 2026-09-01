import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const setupWorkspaceAction = new URL("../../.github/actions/setup-workspace/action.yml", import.meta.url);
const setupPlaywrightAction = new URL("../../.github/actions/setup-playwright/action.yml", import.meta.url);
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
  it("[P1] uses preseeded Playwright only for a ready Nexu runner image", async () => {
    const action = await readFile(setupPlaywrightAction, "utf8");

    expect(action).toContain("*'\"nexu-runners-'*");
    expect(action).toContain("PLAYWRIGHT_BROWSERS_PATH");
    expect(action).toContain("steps.preinstalled-playwright.outputs.enabled == 'true'");
    expect(action).toContain("steps.preinstalled-playwright.outputs.enabled != 'true'");
    expect(action).toContain('pnpm -C "$package_dir" exec playwright install chromium');
    expect(action).toContain("run: ${{ inputs.install-command }}");
  });

  it("[P1] pins the Blacksmith apt mirrorlist before installing browser deps", async () => {
    const action = await readFile(setupPlaywrightAction, "utf8");

    // A dead third-party mirror in the Blacksmith mirrorlist makes the
    // apt-get update inside `playwright install --with-deps` hang until the
    // job timeout; the action must pin the canonical archive first.
    const pinIndex = action.indexOf("Pin Blacksmith apt mirror");
    expect(pinIndex).toBeGreaterThanOrEqual(0);
    expect(pinIndex).toBeLessThan(action.indexOf("run: ${{ inputs.install-command }}"));
    expect(action).toContain("*'\"blacksmith-'*");
    expect(action).toContain("/etc/apt/blacksmith-ubuntu-mirrors.txt");
    expect(action).toContain("http://archive.ubuntu.com/ubuntu");

    const baseline = await readFile(visualBaselineWorkflow, "utf8");
    const setupPlaywrightStep = sectionBetween(baseline, "- name: Setup Playwright", "- name: Prebuild");
    expect(setupPlaywrightStep).toContain("runner-labels:");
  });

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

    // Non-persistent branch: pin a stable home store before `pnpm store path`
    // so actions/cache version hashes match across hosted and Nexu ARC fleets.
    const detectStep = sectionBetween(
      action,
      "- name: Detect persistent pnpm store",
      "- name: Setup pnpm",
    );
    // Isolate the else arm by its home-store pin (not "else"/"fi", which match
    // substrings like npm_config).
    const homeStoreIndex = detectStep.indexOf('store_dir="$HOME/.pnpm-store"');
    expect(homeStoreIndex).toBeGreaterThanOrEqual(0);
    const nonPersistentBranch = detectStep.slice(homeStoreIndex);
    expect(nonPersistentBranch).toContain('echo "NPM_CONFIG_STORE_DIR=$store_dir"');
    expect(nonPersistentBranch).toContain('echo "npm_config_store_dir=$store_dir"');
    expect(nonPersistentBranch).toContain('echo "enabled=false"');
    expect(action.indexOf('store_dir="$HOME/.pnpm-store"')).toBeLessThan(
      action.indexOf('run: echo "path=$(pnpm store path --silent)"'),
    );

    const restoreStep = sectionBetween(
      action,
      "- name: Restore pnpm store",
      "- name: Install dependencies",
    );
    expect(restoreStep).toContain("restore-keys: |");
    expect(restoreStep).toContain("pnpm-store-${{ runner.os }}-");

    const saveStep = action.slice(action.indexOf("- name: Save pnpm store"));
    expect(saveStep).toContain("inputs.save-pnpm-cache == 'true'");
    expect(saveStep).toContain("steps.persistent-pnpm-store.outputs.enabled != 'true'");
    expect(saveStep).toContain("steps.pnpm-cache-restore.outputs.cache-hit != 'true'");
    expect(saveStep).toContain("github.ref == 'refs/heads/main'");
    expect(saveStep).toContain("github.event_name == 'push'");
    expect(saveStep).toContain("github.event_name == 'workflow_dispatch'");
    expect(saveStep).toContain("github.event_name == 'schedule'");
  });

  it("[P1] seeds Windows and Linux from main and deletes only closed-PR BuildKit cache families", async () => {
    const workflow = await readFile(cacheMaintenanceWorkflow, "utf8");
    const windowsSeedJob = sectionBetween(workflow, "  seed-pnpm-windows:", "  seed-pnpm-linux:");
    const linuxSeedJob = sectionBetween(workflow, "  seed-pnpm-linux:", "  clean-closed-pr-buildkit:");
    const cleanupJob = workflow.slice(workflow.indexOf("  clean-closed-pr-buildkit:"));

    expect(workflow).toContain("pull_request_target:");
    expect(workflow).toContain("types: [closed]");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("actions: write");
    expect(workflow).toContain("contents: read");

    for (const seedJob of [windowsSeedJob, linuxSeedJob]) {
      expect(seedJob).toContain("github.event_name == 'push'");
      expect(seedJob).toContain("github.event_name == 'workflow_dispatch'");
      expect(seedJob).toContain("github.ref == 'refs/heads/main'");
      expect(seedJob).toContain("uses: actions/checkout@v6.0.2");
      expect(seedJob).toContain("uses: ./.github/actions/setup-workspace");
      expect(seedJob).toContain("save-pnpm-cache: 'true'");
    }

    expect(windowsSeedJob).toContain("runs-on: windows-latest");
    // One hosted Linux seed is enough: actions/cache is repo-scoped and shared
    // by every Nexu size (small/medium/large) once the store path is pinned.
    expect(linuxSeedJob).toContain("runs-on: ubuntu-24.04");

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


  it("[P1] keeps visual-baseline as a secondary Linux pnpm seed on main", async () => {
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
