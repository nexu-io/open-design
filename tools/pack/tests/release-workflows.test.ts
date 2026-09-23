import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import linuxPack from "@/linux.ts?raw";
import macBuild from "@/mac/build.ts?raw";
import macFs from "@/mac/fs.ts?raw";
import macLifecycle from "@/mac/lifecycle.ts?raw";
import macWorkspace from "@/mac/workspace.ts?raw";
import workspaceBuild from "@/workspace-build.ts?raw";
import { WORKSPACE_BUILD_COMMANDS_BY_UNIT, WORKSPACE_BUILD_UNITS } from "@/workspace/units.js";
import winApp from "@/win/app.ts?raw";
import winLifecycle from "@/win/lifecycle.ts?raw";

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
}

function sectionAfter(content: string, start: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  return content.slice(startIndex);
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1;
}

type WorkflowJob = { needs: string[]; if: string };

/**
 * Minimal `jobs:` reader: job id -> its `needs` list and its job-level `if`.
 *
 * Deliberately not a YAML parser. These workflows are hand-written with a
 * stable two-space job indentation, and the alternative is adding a YAML
 * dependency to tools/pack purely for a topology assertion.
 */
function parseJobGraph(content: string): Map<string, WorkflowJob> {
  const lines = content.split("\n");
  const jobsIndex = lines.indexOf("jobs:");
  expect(jobsIndex).toBeGreaterThanOrEqual(0);

  const blocks = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines.slice(jobsIndex + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header?.[1] != null) {
      current = header[1];
      blocks.set(current, []);
      continue;
    }
    if (line.trim().length > 0 && /^\S/.test(line)) break;
    if (current != null) blocks.get(current)?.push(line);
  }

  const jobs = new Map<string, WorkflowJob>();
  for (const [name, block] of blocks) {
    const job: WorkflowJob = { needs: [], if: "" };
    for (let index = 0; index < block.length; index += 1) {
      const line = block[index] ?? "";
      const inlineNeeds = /^ {4}needs:\s*(.+)$/.exec(line);
      if (inlineNeeds?.[1] != null) {
        const value = inlineNeeds[1].split("#")[0]?.trim() ?? "";
        job.needs = value.startsWith("[")
          ? value.replace(/[[\]]/g, "").split(",").map((entry) => entry.trim()).filter(Boolean)
          : [value].filter(Boolean);
        continue;
      }
      if (/^ {4}needs:\s*$/.test(line)) {
        for (const candidate of block.slice(index + 1)) {
          const item = /^ {6}- ([A-Za-z0-9_-]+)/.exec(candidate);
          if (item?.[1] == null) break;
          job.needs.push(item[1]);
        }
        continue;
      }
      const conditionStart = /^ {4}if:\s*(.*)$/.exec(line);
      if (conditionStart != null) {
        let value = conditionStart[1] ?? "";
        for (const candidate of block.slice(index + 1)) {
          if (/^ {4}\S/.test(candidate)) break;
          value += ` ${candidate.trim()}`;
        }
        job.if = value.trim();
      }
    }
    jobs.set(name, job);
  }
  return jobs;
}

/** Every job `name` depends on, directly or through another job. */
function transitiveNeeds(jobs: Map<string, WorkflowJob>, name: string): string[] {
  const seen = new Set<string>();
  const stack = [...(jobs.get(name)?.needs ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next == null || seen.has(next) || !jobs.has(next)) continue;
    seen.add(next);
    stack.push(...(jobs.get(next)?.needs ?? []));
  }
  return [...seen];
}

type WorkflowStep = { job: string; name: string; if: string };

/**
 * Minimal `steps:` reader: every step in the file as job id + step name +
 * step-level `if` (block scalars folded onto one line).
 *
 * Same rationale as parseJobGraph — hand-written workflows with stable
 * indentation, and this is a topology assertion rather than a YAML feature
 * test. Keys of a step sit at exactly eight spaces (or on the `- ` line), so
 * `run:`/`env:` bodies, which must be indented deeper than their key, never
 * look like one.
 */
function parseWorkflowSteps(content: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  let job: string | null = null;
  let inSteps = false;
  let collectingIf = false;
  for (const line of content.split("\n")) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header?.[1] != null) {
      job = header[1];
      inSteps = false;
      collectingIf = false;
      continue;
    }
    if (/^ {4}steps:\s*$/.test(line)) {
      inSteps = true;
      continue;
    }
    if (!inSteps || job == null) continue;

    const isStepKey = /^ {6}- |^ {8}[A-Za-z_-]+:/.test(line);
    if (collectingIf && !isStepKey) {
      const last = steps[steps.length - 1];
      const text = line.trim();
      if (last != null && text.length > 0 && !text.startsWith("#")) last.if += ` ${text}`;
      continue;
    }
    collectingIf = false;

    if (/^ {6}- /.test(line)) steps.push({ job, name: "", if: "" });
    const current = steps[steps.length - 1];
    if (current == null) continue;

    const name = /^(?: {6}- | {8})name:\s*(.*)$/.exec(line);
    if (name?.[1] != null) {
      current.name = name[1].trim();
      continue;
    }
    const condition = /^(?: {6}- | {8})if:\s*(.*)$/.exec(line);
    if (condition != null) {
      current.if = (condition[1] ?? "").trim();
      collectingIf = true;
    }
  }
  return steps;
}

/**
 * Status-check functions that make a job evaluate its own `if` instead of
 * inheriting a skip from somewhere up the chain. `success()` does not count:
 * it is what GitHub already applies implicitly.
 *
 * The same list applies one level down. A step-level `if` without a status
 * function also gets an implicit `success()`, evaluated against the job's
 * status SO FAR — so a step placed after one that failed is skipped before its
 * own condition is read, exactly as a job is.
 */
const SKIP_CHAIN_BREAKERS = ["always(", "cancelled(", "failure("];

describe("release workflows", () => {
  it("uses Plan products instead of outer tools-pack caches in beta and prerelease", async () => {
    const workflows = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
    ]);

    expect(workflows[0]).not.toContain("uses: actions/cache/");
    expect(workflows[0]).not.toContain("win_tools_pack_cache");
    expect(workflows[0]).toContain("uses: ./.github/actions/setup-workspace");
    expect(workflows[0]).toContain("--cache-dir");
    expect(workflows.map((workflow) => countOccurrences(workflow, "keep=1"))).toEqual([0, 0, 0]);
    expect(workflows.map((workflow) => countOccurrences(workflow, "$keep = 1"))).toEqual([0, 0, 0]);
    expect(workflows[1]).not.toContain("uses: actions/cache/");
    expect(workflows[1]).toContain(".github/config/convergence/release-prerelease.json");
    for (const workflow of workflows) {
      expect(workflow).not.toContain("keep=3");
      expect(workflow).not.toContain("$keep = 3");
    }
  });

  it("lets stable reuse only explicit formal prerelease recipes", async () => {
    const [stableWorkflow, prereleaseConfigText, stableConfigText] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/config/convergence/release-prerelease.json", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/config/convergence/release-stable.json", import.meta.url), "utf8"),
    ]);
    const prerelease = JSON.parse(prereleaseConfigText).workflows["release-prerelease"];
    const stable = JSON.parse(stableConfigText).workflows["release-stable"];

    expect(stable.policy).toBe("stable-v1");
    expect(Object.keys(stable.workloads).sort()).toEqual([
      "source_js_daemon",
      "source_js_packages",
      "source_js_shell",
      "source_mac_arm64_web",
      "source_mac_x64_executor",
      "source_mac_x64_runtime",
      "source_mac_x64_web",
      "source_win_x64_executor",
      "source_win_x64_web",
      "test_verify",
    ]);
    for (const [workload, declaration] of Object.entries(stable.workloads) as Array<[
      string,
      { recipe: string; trustedSources: Array<{ policy: string; workflow: string; workload: string }> },
    ]>) {
      expect(declaration.recipe).toBe(prerelease.workloads[workload].recipe);
      expect(declaration.trustedSources).toEqual([
        { workflow: "release-prerelease", policy: "prerelease-v1", workload },
      ]);
    }
    expect(stableWorkflow).toContain(".github/config/convergence/release-stable.json");
    expect(stableWorkflow).toContain("  quality_gate:");
    expect(stableWorkflow).toContain("fromJSON(needs.metadata.outputs.hit).test_verify");
    expect(stableWorkflow).not.toContain("build_linux");
    expect(stableWorkflow).not.toContain("linux_url:");
  });

  it("selects bounded producer closures for platform executors and mac x64 runtime", async () => {
    const [beta, setupWorkspace, convergenceConfig] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/setup-workspace/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/config/convergence/release-beta.json", import.meta.url), "utf8"),
    ]);
    const macX64Producer = sectionBetween(beta, "  source_mac_x64:", "  build_mac_x64:");
    const winX64Producer = sectionBetween(beta, "  source_win_x64:", "  build_win_x64:");
    const winX64Build = sectionBetween(beta, "  build_win_x64:", "  publish:");
    const executorPaths = (JSON.parse(convergenceConfig) as {
      resources: { "platform-executor": { paths: string[] }; "platform-mac-runtime": { paths: string[] } };
    }).resources["platform-executor"].paths;
    const runtimePaths = (JSON.parse(convergenceConfig) as {
      resources: { "platform-mac-runtime": { paths: string[] } };
    }).resources["platform-mac-runtime"].paths;
    const convergence = JSON.parse(convergenceConfig) as {
      resources: { "daemon-runtime-dependencies": { json: string; omit: string[] } };
      workflows: { "release-beta": {
        workloads: { source_mac_x64_runtime: { inputs: string[] } };
        matrices: { common: Array<{ name: string }> };
      } };
    };

    expect(macX64Producer).toContain(
      "postinstall-intent: ${{ fromJSON(needs.release_prepare.outputs.requests).source_mac_x64.runtime.operation == 'build' && 'mac-runtime' || fromJSON(needs.release_prepare.outputs.requests).source_mac_x64.web.operation == 'build' && 'source-web' || 'release-executor' }}",
    );
    expect(winX64Producer).toContain(
      "postinstall-intent: ${{ fromJSON(needs.release_prepare.outputs.requests).source_win_x64.web.operation == 'build' && 'source-web' || 'release-executor' }}",
    );
    expect(winX64Producer).toContain("[build] Release executor");
    expect(winX64Producer).toContain("executor:dev export");
    expect(winX64Build).toContain("[restore] Release executor");
    expect(winX64Build).not.toContain("uses: pnpm/action-setup");
    expect(winX64Build).toContain("[prepare] Release executor pnpm shim");
    expect(winX64Build).toContain('node `"%RELEASE_EXECUTOR_ROOT%\\pack\\node_modules\\pnpm\\bin\\pnpm.cjs`" %*');
    expect(winX64Build).toContain('if ($LASTEXITCODE -ne 0 -or $version -ne "10.33.2")');
    expect(winX64Build).toContain("[prepare] Workspace package links");
    expect(winX64Build).toContain("install --frozen-lockfile --prod --ignore-scripts --prefer-offline");
    expect(winX64Build).toContain("--filter @open-design/packaged...");
    expect(winX64Build).toContain('node "$env:RELEASE_EXECUTOR_ROOT\\pack\\dist\\index.mjs"');
    expect(macX64Producer).toContain("[build] mac_x64 runtime");
    expect(macX64Producer).toContain("mac runtime-export");
    expect(beta).toContain("mac runtime-restore");
    expect(beta).toContain('--mac-runtime-product "$RUNNER_TEMP/mac-runtime-product"');
    expect(setupWorkspace).toContain("source-web|release-executor|release-tools|release-validation|mac-runtime)");
    for (const profile of ["release-executor", "mac-runtime", "release-tools", "release-validation"]) {
      expect(setupWorkspace).toContain(`install-profile || inputs.install-profile) == '${profile}'`);
    }
    expect(setupWorkspace).toContain("steps.postinstall-plan.outputs.install-profile != 'workspace'");
    expect(setupWorkspace).toContain("--filter @open-design/tools-pack...");
    expect(setupWorkspace).toContain("--filter @open-design/tools-release...");
    expect(executorPaths).not.toContain("packages/");
    expect(executorPaths).toEqual(expect.arrayContaining([
      "packages/download/",
      "packages/launcher-proto/",
      "packages/metatool/",
      "packages/platform/",
      "packages/release/",
      "packages/sidecar/",
      "packages/sidecar-proto/",
    ]));
    expect(runtimePaths).toContain("tools/pack/");
    expect(runtimePaths).not.toContain("tools/release/");
    expect(convergence.resources["daemon-runtime-dependencies"]).toMatchObject({
      json: "apps/daemon/package.json",
      omit: expect.arrayContaining(["version", "scripts", "devDependencies"]),
    });
    expect(convergence.workflows["release-beta"].workloads.source_mac_x64_runtime.inputs)
      .toContain("resource://daemon-runtime-dependencies");
    expect(convergence.workflows["release-beta"].matrices.common).toEqual([
      expect.objectContaining({ name: "[build] Shared JavaScript" }),
    ]);
  });

  it("requires Vela CLI for every beta desktop packaging target", async () => {
    const [beta, betaExecutionPlan, prerelease, stable, stablePrepare, buildMac, buildWin, prepareMac, prepareWin, publishPlatform, desktopUpdater, installUnsafeDmg] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/scripts/release/execution_plan.py", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/src/metadata/prepare-stable.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/build-platform.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/build-platform.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/prepare-platform-assets.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/prepare-platform-assets.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/src/storage/publish-platform.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../apps/desktop/src/main/updater/payload.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../scripts/install-unsafe-dmg.sh", import.meta.url), "utf8"),
    ]);
    const mac = sectionBetween(beta, "  build_mac_arm64:", "  build_mac_x64:");
    const macX64 = sectionBetween(beta, "  build_mac_x64:", "  build_win_x64:");
    const win = sectionBetween(beta, "  build_win_x64:", "  publish:");
    const betaMetadata = sectionBetween(beta, "  release_prepare:", "  common:");
    const betaPublish = sectionAfter(beta, "  publish:");
    const prereleaseMetadata = sectionBetween(prerelease, "  metadata:", "  common:");
    const prereleasePublish = sectionBetween(prerelease, "  publish:", "  smoke_plan:");
    const prereleaseMac = sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:");
    const prereleaseMacX64 = sectionBetween(prerelease, "  build_mac_intel:", "  build_win:");
    const prereleaseWin = sectionBetween(prerelease, "  build_win:", "  publish:");
    const stableMetadata = sectionBetween(stable, "  metadata:", "  common:");
    const stablePublish = sectionBetween(stable, "  publish:", "  cleanup_partial_release_assets:");

    expect(mac).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(macX64).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(countOccurrences(mac, "--require-vela-cli")).toBe(2);
    expect(countOccurrences(macX64, "--require-vela-cli")).toBe(1);
    expect(countOccurrences(win, "--require-vela-cli")).toBe(2);
    expect(mac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(macX64.match(/RELEASE_ARTIFACT_MODE: \$\{\{ fromJSON\(needs\.release_prepare\.outputs\.execution_plan\)\.platforms\.mac_x64\.target == 'all' && 'all' \|\| 'dmg-and-payload' \}\}/g)?.length ?? 0).toBe(2);
    expect(macX64.match(/RELEASE_REPORT_DIR: \$\{\{ runner\.temp \}\}\/release-report\/mac_x64/g)?.length ?? 0).toBe(2);
    expect(macX64).toContain("RELEASE_REPORT_ZIP_PATH: ${{ runner.temp }}/release-report/mac_x64-report.zip");
    expect(mac).toContain("exec tools-pack mac package");
    expect(mac).toContain("build_args+=(--signed --notarize)");
    expect(mac).toContain("Build beta mac_arm64 update fixture");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH: ${{ steps.mac_arm64_update_fixture.outputs.update_build_json_path }}");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE: ${{ fromJSON(needs.release_prepare.outputs.execution_plan).platforms.mac_arm64.smokeMode == 'full' && fromJSON(needs.release_prepare.outputs.execution_plan).platforms.mac_arm64.updateMetadataUrl == '' && fromJSON(needs.release_prepare.outputs.execution_plan).platforms.mac_arm64.updateTargetVersion == '' && 'tools-serve' || '' }}");
    expect(mac).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(macX64).toContain('"$RELEASE_EXECUTOR_ROOT/pack/dist/index.mjs" mac package');
    expect(macX64).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain("update_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(buildMac).toContain('tools-pack mac build update fixture');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH="$update_build_json_path"');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_VERSION="${OD_PACKAGED_E2E_MAC_UPDATE_VERSION:-$update_version}"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(beta).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(betaExecutionPlan).toContain("publishing win_x64 requires target nsis or all");
    expect(betaExecutionPlan).toContain('"updateMetadataUrl": ""');
    expect(beta).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ fromJSON(needs.release_prepare.outputs.execution_plan).platforms.mac_arm64.updateMetadataUrl }}");
    expect(beta).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ fromJSON(needs.release_prepare.outputs.execution_plan).platforms.win_x64.updateMetadataUrl }}");
    expect(beta).toContain("POSTHOG_KEY: ${{ inputs.profile == 'publish' && secrets.POSTHOG_KEY || '' }}");
    expect(beta).toContain("POSTHOG_HOST: ${{ inputs.profile == 'publish' && vars.POSTHOG_HOST || '' }}");
    expect(beta).toContain("POSTHOG_CLI_API_KEY: ${{ inputs.profile == 'publish' && secrets.POSTHOG_CLI_API_KEY || '' }}");
    expect(beta).toContain("POSTHOG_CLI_PROJECT_ID: ${{ inputs.profile == 'publish' && vars.POSTHOG_CLI_PROJECT_ID || '' }}");
    expect(beta).not.toContain("publish-beta-metadata.ts");
    expect(beta).not.toContain("verify-beta-metadata.ts");
    expect(beta).not.toContain("summary-beta.ts");
    expect(beta).toContain("tools-release publish-metadata");
    expect(beta).toContain("tools-release verify-metadata");
    expect(beta).toContain("tools-release summary-metadata");
    for (const workflow of [beta, prerelease, stable]) {
      expect(workflow).not.toContain(".github/scripts/release/r2/");
    }
    for (const workflow of [beta, prerelease, stable]) {
      expect(workflow).toContain("tools-release check-storage");
    }
    expect(win).not.toContain("tools\\release\\scripts\\build-platform.ps1");
    expect(win).toContain('node "$env:RELEASE_EXECUTOR_ROOT\\pack\\dist\\index.mjs" win cleanup --dir "${{ runner.temp }}\\tools-pack" --namespace release-beta-win --json');
    expect(win).toContain('"$env:RELEASE_EXECUTOR_ROOT\\pack\\dist\\index.mjs", "win", "build"');
    expect(buildWin).toContain('$buildArgs += "--require-vela-cli"');
    expect(buildWin).toContain('$updateArgs += "--require-vela-cli"');
    expect(win).toContain('node "$env:RELEASE_EXECUTOR_ROOT\\pack\\dist\\index.mjs" win validate-payload');
    expect(win).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    for (const section of [betaMetadata, betaPublish]) {
      expect(section).toContain("uses: ./.github/actions/setup-workspace");
      expect(section).toContain("save-pnpm-cache: ${{ env.BETA_SAVE_PNPM_CACHE }}");
      expect(section.indexOf("uses: ./.github/actions/setup-workspace")).toBeLessThan(section.indexOf("run: pnpm exec tools-release"));
    }
    expect(prereleaseMetadata).toContain("uses: ./.github/actions/setup-workspace");
    expect(prereleaseMetadata).toContain("release-prerelease.json");
    expect(prereleaseMetadata).toContain("--mode enforce");
    expect(stableMetadata).toContain("uses: ./.github/actions/setup-workspace");
    expect(stableMetadata).toContain("release-stable.json");
    expect(stableMetadata).toContain("--mode enforce");
    expect(stableMetadata.indexOf("uses: ./.github/actions/setup-workspace")).toBeLessThan(
      stableMetadata.indexOf("tools-release prepare"),
    );
    for (const publish of [prereleasePublish, stablePublish]) {
      expect(publish).toContain("uses: ./.github/actions/setup-workspace");
      expect(publish).toContain("postinstall-intent: release-publish");
      expect(publish).not.toContain("run: pnpm install --frozen-lockfile");
      expect(publish.indexOf("uses: ./.github/actions/setup-workspace")).toBeLessThan(
        publish.indexOf("tools-release publish-metadata"),
      );
    }
    expect(macBuild).toContain('runPhase("xattr-scrub"');
    expect(macBuild).toContain("scrubMacExtendedAttributes(paths.appPath)");
    expect(macFs).toContain("com.apple.provenance");
    expect(macFs).toContain("com.apple.macl");
    expect(desktopUpdater).toContain("MAC_PAYLOAD_XATTRS_TO_SCRUB");
    expect(desktopUpdater).toContain('execFileAsync("xattr", ["-dr", attribute, input.destinationRoot])');
    expect(desktopUpdater).toContain("com.apple.macl");
    expect(installUnsafeDmg).toContain("com.apple.macl");
    expect(win).toContain("WIN_INCLUDE_ZIP: ${{ fromJSON(needs.release_prepare.outputs.execution_plan).platforms.win_x64.target == 'all' || fromJSON(needs.release_prepare.outputs.execution_plan).platforms.win_x64.target == 'zip' }}");
    expect(prepareMac).not.toContain("required RELEASE_ASSET_SUFFIX");
    expect(prepareMac).toContain('RELEASE_ASSET_SUFFIX="${RELEASE_ASSET_SUFFIX:-}"');
    expect(prepareWin).toContain("[AllowEmptyString()]");
    expect(prepareWin).toContain("$sourcePayload = [string]$build.payloadPath");
    expect(prepareWin).toContain("open-design-$ReleaseVersion$ReleaseAssetSuffix-win-x64-payload.7z");
    expect(publishPlatform).toContain("open-design-${releaseVersion}${assetSuffix}-win-x64-payload.7z");
    expect(publishPlatform).toContain("payload: assetEntry(payload)");
    expect(publishPlatform).toContain("versionLockObjectKey(releaseVersion, countedReleaseChannel)");
    expect(publishPlatform).toContain("assertCurrentVersionReservation(storage, releaseVersion, versionLockKey, countedReleaseChannel)");
    expect(buildWin).toContain("function Validate-WinLauncherPayloadArchive");
    expect(buildWin).toContain('Measure-Step "clean tools-pack win namespace"');
    expect(buildWin.indexOf('Measure-Step "clean tools-pack win namespace"')).toBeLessThan(buildWin.indexOf('Measure-Step "tools-pack win build"'));
    expect(buildWin).toContain('"tools-pack", "win", "cleanup"');
    expect(winLifecycle).toContain("const launcher = resolveToolPackLauncherLayout(config)");
    expect(winLifecycle).toContain("await removeTree(launcher.paths.namespaceRoot)");
    expect(winLifecycle).toContain("removedLauncherNamespaceRoot");
    expect(macLifecycle).toContain("const launcher = resolveToolPackLauncherLayout(config)");
    expect(macLifecycle).toContain("await rm(launcher.paths.namespaceRoot, { force: true, recursive: true })");
    expect(macLifecycle).toContain("removedLauncherNamespaceRoot");
    expect(buildWin).toContain('Measure-Step "validate launcher payload artifact"');
    expect(buildWin).toContain('Measure-Step "validate launcher payload update fixture"');
    expect(buildWin).toContain('Test-JsonString $manifest.entry.executable "entry.executable" "payload/Open Design.exe"');
    expect(winApp).toContain("return ensureWorkspaceBuildArtifacts(");
    expect(macWorkspace).toContain("await ensureWorkspaceBuildArtifacts(");
    expect(linuxPack).toContain("await runWorkspaceBuild(");
    for (const buildSource of [winApp, macWorkspace, linuxPack]) {
      expect(buildSource).not.toContain('["--filter", "@open-design/platform", "build"]');
      expect(buildSource).not.toContain('["--filter", "@open-design/sidecar", "build"]');
    }
    expect(workspaceBuild).toContain("for (const unit of WORKSPACE_BUILD_UNITS)");
    expect(WORKSPACE_BUILD_UNITS).toEqual(["packages", "daemon", "web", "shell"]);
    expect(WORKSPACE_BUILD_COMMANDS_BY_UNIT.packages.flatMap(({ args }) => args)).toContain("@open-design/dsh-runtime");
    expect(WORKSPACE_BUILD_COMMANDS_BY_UNIT.web.at(-1)?.args).toEqual(["--filter", "@open-design/web", "run", "build:sidecar"]);
    expect(WORKSPACE_BUILD_COMMANDS_BY_UNIT.shell.at(-1)?.args).toEqual(["--filter", "@open-design/packaged", "run", "build"]);
    expect(prerelease).toContain("name: release-prerelease");
    expect(prerelease).toContain("pnpm exec tools-release prepare prerelease");
    expect(prerelease).toContain("OPEN_DESIGN_PRERELEASE_METADATA_URL");
    expect(prerelease).toContain("RELEASE_CHANNEL: prerelease");
    expect(prerelease).toContain("open-design-prerelease-mac-arm64-publish-manifest");
    expect(prerelease).toContain("open-design-prerelease-win-x64-publish-manifest");
    expect(prerelease).toContain("workflow_call:");
    expect(prerelease).toContain("OPEN_DESIGN_STABLE_VERSION: ${{ inputs.release_version }}");
    expect(prerelease).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
    expect(prerelease).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
    expect(prerelease).toContain("version_metadata_url: ${{ steps.outputs.outputs.version_metadata_url }}");
    expect(prerelease).not.toContain("RELEASE_CHANNEL: Prerelease");
    expect(prerelease).not.toContain("tools-release prepare preview");
    expect(prereleaseMetadata).toContain("GH_TOKEN: ${{ github.token }}");
    expect(prereleaseMetadata).toContain("OPEN_DESIGN_RELEASE_CHANNEL: prerelease");
    expect(prereleasePublish).toContain('GITHUB_RELEASE_ENABLED: "false"');
    expect(prerelease).not.toContain("gh release");
    expect(prereleaseMac).not.toContain("uses: actions/cache/");
    expect(prereleaseMac).toContain("[validate] Source references");
    expect(prereleaseMac).toContain("[restore] Shared JavaScript");
    expect(prereleaseMac).toContain("exec tools-pack mac package");
    expect(prereleaseMac).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(countOccurrences(prereleaseMac, "--notarize")).toBe(1);
    expect(
      countOccurrences(prereleaseMac, "APPLE_ID: ${{ secrets.APPLE_ID }}"),
    ).toBe(1);
    expect(
      countOccurrences(
        prereleaseMac,
        "APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",
      ),
    ).toBe(1);
    expect(
      countOccurrences(prereleaseMac, "APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}"),
    ).toBe(1);
    expect(prereleaseMac).toContain("tools-release write-report");
    expect(prereleaseMacX64).not.toContain("uses: actions/cache/");
    expect(prereleaseMacX64).toContain("[restore] Release executor");
    expect(prereleaseMacX64).toContain("mac runtime-restore");
    expect(prereleaseMacX64).toContain('"$RELEASE_EXECUTOR_ROOT/pack/dist/index.mjs" mac package');
    expect(prereleaseMacX64).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(countOccurrences(prereleaseMacX64, "--notarize")).toBe(1);
    expect(
      countOccurrences(prereleaseMacX64, "APPLE_ID: ${{ secrets.APPLE_ID }}"),
    ).toBe(1);
    expect(
      countOccurrences(
        prereleaseMacX64,
        "APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",
      ),
    ).toBe(1);
    expect(
      countOccurrences(prereleaseMacX64, "APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}"),
    ).toBe(1);
    expect(prereleaseMacX64).toContain('"$RELEASE_EXECUTOR_ROOT/release/dist/index.mjs" write-report');
    for (const [prereleaseMacJob, nextStep] of [
      [prereleaseMac, "Write mac_arm64 release report"],
      [prereleaseMacX64, "Write mac_x64 release report"],
    ] as const) {
      expect(prereleaseMacJob).toContain("Verify prerelease mac");
      expect(prereleaseMacJob).toContain('hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_point"');
      expect(prereleaseMacJob).toContain('codesign --verify --deep --strict "$candidate_app"');
      expect(prereleaseMacJob).toContain('xcrun stapler validate "$candidate_app"');
      expect(prereleaseMacJob).toContain('spctl --assess --type execute --verbose=4 "$candidate_app"');
      expect(prereleaseMacJob.indexOf("Verify prerelease mac")).toBeLessThan(
        prereleaseMacJob.indexOf(nextStep),
      );
    }
    expect(prereleaseWin).not.toContain("uses: actions/cache/");
    expect(prereleaseWin).toContain("[restore] Release executor");
    expect(prereleaseWin).toContain("win validate-payload");
    expect(prereleaseWin).toContain("release-build\\win_x64\\build.json");
    expect(prereleaseWin).toContain('"$env:RELEASE_EXECUTOR_ROOT\\release\\dist\\index.mjs" write-report');
    expect(stable).not.toContain(".github/scripts/release/assets/mac.sh");
    expect(stable).not.toContain(".github/scripts/release/assets/mac-intel.sh");
    expect(stable).not.toContain(".github/scripts/release/assets/win.ps1");
    expect(stable).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/publish.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/verify.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/summary.sh");
    expect(stable).toContain("pnpm exec tools-release prepare-platform-assets");
    expect(stable).toContain('node "$RELEASE_EXECUTOR_ROOT/release/dist/index.mjs" prepare-platform-assets');
    expect(stable).toContain('node "$env:RELEASE_EXECUTOR_ROOT\\release\\dist\\index.mjs" prepare-platform-assets');
    expect(stable).toContain("pnpm exec tools-release publish-platform");
    expect(stable).not.toContain("uses: actions/cache/");
    expect(stable).toContain("tools-release publish-metadata");
    // The stable promotion gate validates prerelease metadata.github fields; the
    // publish steps must therefore pass the resolved release attribution through.
    expect(stable).toContain("RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}");
    expect(stable).toContain("RELEASE_REPOSITORY: ${{ github.repository }}");
    expect(stable).toContain("RELEASE_WORKFLOW: ${{ github.workflow }}");
    expect(countOccurrences(stable, "RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}")).toBeGreaterThanOrEqual(5);
    expect(stable).toContain("RELEASE_RUN_ID: ${{ github.run_id }}");
    expect(countOccurrences(stable, "RELEASE_BRANCH: ${{ needs.metadata.outputs.branch }}")).toBeGreaterThanOrEqual(4);
    expect(stable).not.toContain("RELEASE_BRANCH: ${{ github.ref_name }}");
    expect(stable).toContain("tools-release verify-metadata");
    expect(stable).toContain("tools-release summary-metadata");
    expect(stable).toContain("open-design-release-mac-arm64-publish-manifest");
    expect(stable).toContain("open-design-release-win-x64-publish-manifest");
    expect(stable).toContain("--signed");
    expect(stable).toContain("--notarize");
    expect(stable).toContain("run: pnpm exec tools-release prepare stable");
    expect(stable).toContain("OPEN_DESIGN_RELEASE_CHANNEL: stable");
    expect(stable).not.toContain("OPEN_DESIGN_STABLE_VERSION:");
    expect(stable).toContain("publish:");
    expect(stable).toContain("metadata_only:");
    expect(stable).toContain("type: boolean");
    expect(stable).toContain("default: false");
    expect(stable).toContain("OPEN_DESIGN_RELEASE_DRY_RUN: ${{ inputs.publish && 'false' || inputs.metadata_only && 'metadata' || 'prepublish' }}");
    expect(stable).toContain("run_prepublish_jobs: ${{ steps.stable.outputs.run_prepublish_jobs }}");
    expect(stable).toContain("publish_side_effects_enabled: ${{ steps.stable.outputs.publish_side_effects_enabled }}");
    expect(stable).toContain("needs.metadata.outputs.run_prepublish_jobs == 'true'");
    expect(stable).toContain("RELEASE_DRY_RUN_MODE: ${{ needs.metadata.outputs.dry_run_mode }}");
    expect(stable).toContain("RELEASE_PUBLISH_SIDE_EFFECTS: ${{ needs.metadata.outputs.publish_side_effects_enabled }}");
    expect(stable).toContain("pnpm exec tools-release prepare-github-assets");
    expect(stable).toContain('gh release upload "$VERSION_TAG" "$RUNNER_TEMP/github-release-assets"/*');
    expect(stable).toContain("RELEASE_METADATA_PATH:");
    expect(stable).not.toContain("inputs.channel");
    expect(stable).not.toContain("prepare ${{ inputs.channel }}");
    expect(stablePrepare).toContain('expectStringFieldIfPresent(github, "workflow", "release-prerelease"');
    expect(stablePrepare).toContain('parseStableDryRunMode');
    expect(stablePrepare).toContain('setOutput("run_prepublish_jobs"');
    expect(stablePrepare).toContain('setOutput("publish_side_effects_enabled"');
  });

  it("never hands a shipping lane an empty windows smoke mode", async () => {
    const notify = await readFile(
      new URL("../../../.github/workflows/notify-release-feishu.yml", import.meta.url),
      "utf8",
    );

    // A `workflow_call` `default:` applies only when an input is OMITTED, so
    // forwarding an empty string defeats the declared `core` default. The empty
    // value then survives `??` in the spec, `smokeProfile === 'core'` is false,
    // and the run takes the `full` path — which demands an updater fixture only
    // a genuine `full` request wires up, and dies before the smoke starts.
    // That is how release/v0.18.1's first prerelease failed on its branch-cut
    // commit; release/v0.18.0 stayed hidden behind a branch-name special case
    // that produced `skip`, so its smoke never ran at all.
    const modeLine = notify
      .split("\n")
      .find((line) => line.includes("win_x64_smoke_mode:") && line.includes("inputs.win_x64_smoke_mode"));
    expect(modeLine, "notify-release-feishu must forward win_x64_smoke_mode").toBeDefined();
    expect(modeLine).not.toMatch(/\|\|\s*''\s*\}\}/);
    expect(modeLine).toMatch(/\|\|\s*'core'\s*\}\}/);
  });

  it("keeps a job that hand-checks an upstream result reachable past a skipped ancestor", async () => {
    // GitHub, on `jobs.<job_id>.needs`: "If a job fails or is skipped, all jobs
    // that need it are skipped unless the jobs use a conditional expression
    // that causes the job to continue. If a run contains a series of jobs that
    // need each other, a failure or skip applies to all jobs in the dependency
    // chain from the point of failure or skip onwards."
    //
    // The break is per job and is NOT inherited. `always()` on a job does
    // nothing for that job's own dependents, which are still downstream of the
    // same failed or skipped ancestor. A job whose
    // `if` hand-checks `needs.<x>.result` is by construction making its own
    // decision about an upstream outcome — so it has to break the chain too,
    // or GitHub's implicit `success()` skips it before that condition is ever
    // evaluated.
    //
    // release-prerelease.yml's former `dispatch_smoke` was exactly that shape.
    // Run 34149795952 published version metadata but skipped the dispatcher
    // without running a step, which is why the integrated topology retains the
    // explicit condition on every validation job.
    const files = [
      "release-prerelease.yml",
      "release-beta.yml",
      "release-stable.yml",
      "notify-release-feishu.yml",
      // The dispatched prerelease lanes were outside this sweep, which left
      // release-prerelease-card.yml's `fallback_notice` — a job whose `if`
      // hand-checks `needs.card.result` — uncovered by the very rule it has to
      // obey.
      "release-prerelease-card.yml",
      "release-prerelease-tests.yml",
      "release-prerelease-smoke.yml",
    ];
    const contents = await Promise.all(
      files.map((file) => readFile(new URL(`../../../.github/workflows/${file}`, import.meta.url), "utf8")),
    );

    const unreachable: string[] = [];
    for (const [index, content] of contents.entries()) {
      const jobs = parseJobGraph(content);
      for (const [name, job] of jobs) {
        if (!/needs\.[A-Za-z0-9_-]+\.result/.test(job.if)) continue;
        if (SKIP_CHAIN_BREAKERS.some((breaker) => job.if.includes(breaker))) continue;
        const skippableAncestors = transitiveNeeds(jobs, name).filter(
          (ancestor) => (jobs.get(ancestor)?.if ?? "").length > 0,
        );
        if (skippableAncestors.length === 0) continue;
        unreachable.push(`${files[index]}:${name} (skippable ancestors: ${skippableAncestors.sort().join(", ")})`);
      }
    }
    expect(unreachable, "these jobs are skipped before their own condition is evaluated").toEqual([]);

    // The integrated smoke planner sits below publish and makes its own
    // decision even when the optional Intel build was skipped.
    const prerelease = parseJobGraph(contents[0] ?? "");
    const smokePlan = prerelease.get("smoke_plan");
    expect(smokePlan, "release-prerelease.yml must plan downloaded-artifact smoke").toBeDefined();
    expect(transitiveNeeds(prerelease, "smoke_plan")).toContain("build_mac_intel");
    expect(prerelease.has("build_linux")).toBe(false);
    expect(SKIP_CHAIN_BREAKERS.some((breaker) => (smokePlan?.if ?? "").includes(breaker))).toBe(true);
  });

  it("keeps the prerelease card fallback reachable after the step it alerts on has failed", async () => {
    // The job-level trap above has a step-level twin, and it is easier to walk
    // into because there is no `needs:` to remind you. GitHub applies an
    // implicit `success()` to any step-level `if` that carries no status
    // function, and that success() is evaluated against the JOB'S STATUS SO
    // FAR. So a step placed after a step that failed is skipped before its own
    // condition is ever read.
    //
    // That is fatal for exactly one kind of step: one whose job is to speak up
    // BECAUSE something earlier failed. The prerelease card fallback is that
    // kind. `dispatch-validation.sh` exits non-zero when it could not dispatch
    // the card on any ref, which marks the job failed — and a card that was
    // never dispatched is the headline reason the fallback exists. A notifier
    // that inherits success() there is silent in precisely its own emergency.
    //
    // Not a rule that generalizes to every step: most steps SHOULD stop when
    // something before them broke. It binds the fallback notifier group, whose
    // whole contract is the opposite.
    const [prerelease, card] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-card.yml", import.meta.url), "utf8"),
    ]);

    // The notifier group inside `dispatch_card` sits after the card dispatch,
    // so every fallback step needs a status function.
    const dispatchSteps = parseWorkflowSteps(prerelease).filter((step) => step.job === "dispatch_card");
    const notifierStart = dispatchSteps.findIndex((step) => step.name === "Compose the fallback notice");
    expect(notifierStart, "release-prerelease.yml must still carry the fallback notifier").toBeGreaterThan(0);
    const stranded = dispatchSteps
      .slice(notifierStart)
      .filter((step) => !SKIP_CHAIN_BREAKERS.some((breaker) => step.if.includes(breaker)));
    expect(
      stranded.map((step) => step.name),
      "these fallback steps inherit success() and are skipped by the very dispatch failure they exist to report",
    ).toEqual([]);

    // Wherever the composed notice is consumed, same rule — and one more: a
    // consumer must require the composer to have SUCCEEDED. `alert` is written
    // last precisely so a half-written notice cannot claim to be one, and the
    // outcome check says the same thing at the workflow layer, so neither a
    // crashed nor a skipped composer can hand feishu.py notice an empty body.
    for (const [file, content] of [
      ["release-prerelease.yml", prerelease],
      ["release-prerelease-card.yml", card],
    ] as const) {
      const consumers = parseWorkflowSteps(content).filter((step) => step.if.includes("steps.notice.outputs"));
      expect(consumers.length, `${file} must consume the composed notice`).toBeGreaterThan(0);
      for (const consumer of consumers) {
        expect(
          SKIP_CHAIN_BREAKERS.some((breaker) => consumer.if.includes(breaker)),
          `${file}:${consumer.job}:${consumer.name} inherits success() and cannot report an upstream failure`,
        ).toBe(true);
        expect(
          consumer.if,
          `${file}:${consumer.job}:${consumer.name} must not post a notice its composer failed to finish`,
        ).toContain("steps.notice.outcome == 'success'");
      }
    }
  });

  it("keeps prerelease validation in one Plan-shaped DAG without gating publish", async () => {
    const [prerelease, tests, smoke, card, dispatcher] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-tests.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-smoke.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-card.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/scripts/release/dispatch-validation.sh", import.meta.url), "utf8"),
    ]);

    expect(prerelease).toContain("group: open-design-release-prerelease");
    expect(prerelease).toContain("  test:");
    expect(prerelease).toContain("  cache_test:");
    expect(prerelease).toContain("  smoke_plan:");
    expect(prerelease).toContain("  smoke_mac_arm64:");
    expect(prerelease).toContain("  smoke_mac_x64:");
    expect(prerelease).toContain("  smoke_win_x64:");
    expect(prerelease).toContain("Smoke prerelease mac packaged runtime");
    expect(prerelease).toContain("Smoke prerelease mac_x64 packaged runtime");
    expect(prerelease).toContain("Smoke prerelease windows packaged runtime");
    expect(prerelease).not.toContain("build_linux");
    expect(prerelease).not.toContain("linux_x64");
    expect(prerelease).not.toContain("ENABLE_STABLE_LINUX");

    // Only the progressive card remains a separate workflow.
    expect(prerelease).toContain("  dispatch_card:");
    expect(prerelease).toContain("dispatch-validation.sh release-prerelease-card.yml");
    expect(prerelease).not.toContain("dispatch-validation.sh release-prerelease-tests.yml");
    expect(prerelease).not.toContain("dispatch-validation.sh release-prerelease-smoke.yml");
    expect(prerelease).toContain('-f "validation_location=origin"');

    const graph = parseJobGraph(prerelease);
    const publishAncestors = transitiveNeeds(graph, "publish");
    expect(publishAncestors).not.toContain("test");
    expect(publishAncestors).not.toContain("cache_test");
    expect(publishAncestors).not.toContain("smoke_plan");
    const smokeCondition = graph.get("smoke_plan")?.if ?? "";
    expect(smokeCondition).toContain("inputs.enable_smoke");
    expect(smokeCondition).toContain("needs.publish.result == 'success'");
    expect(smokeCondition).toContain("needs.publish.outputs.version_metadata_url != ''");

    // Two refs, tried in order, so a release branch cut before these lanes
    // existed still gets validated from the default branch.
    expect(dispatcher).toContain('for candidate in "${PRIMARY_REF:-}" "${FALLBACK_REF:-}"');
    expect(dispatcher).toContain('gh workflow run "$workflow" --ref "$ref"');

    for (const [label, workflow] of [["tests", tests], ["smoke", smoke], ["card", card]] as const) {
      expect(workflow, label).toContain("workflow_dispatch:");
      expect(workflow, label).not.toContain("open-design-release-prerelease");
      expect(workflow, label).toContain("cancel-in-progress: false");
      // Correlation is the run name: `gh workflow run` returns no run id, so
      // the Feishu card finds these runs by matching `origin-run <id>`.
      expect(workflow, label).toContain("origin-run ${{ inputs.origin_run_id }}");
      expect(workflow, label).toContain("group: release-prerelease-");
    }

    expect(prerelease).toContain("python3 .github/scripts/release/test_unit.py run");
    expect(prerelease).toContain("matrix: ${{ fromJSON(needs.metadata.outputs.test_matrix) }}");
    expect(prerelease).toContain("ref: ${{ needs.metadata.outputs.commit }}");

    // Smoke installs the PUBLISHED artifact, not a local build directory.
    expect(prerelease).toContain("tools-release artifact plan");
    expect(prerelease).toContain("tools-pack stage-artifact");
    expect(prerelease).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(prerelease).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    // mac.spec.ts reads the profile with a bare `??`, so an empty string reads
    // as "not core" and selects the updater path — which then dies for want of
    // a fixture. It must be a literal, never an expression.
    expect(prerelease).toContain("OD_PACKAGED_E2E_MAC_SMOKE_PROFILE: core");
    expect(prerelease).not.toMatch(/OD_PACKAGED_E2E_MAC_SMOKE_PROFILE: \$\{\{/);
    // Every platform lane is gated on what actually published, not on the flags
    // the build was dispatched with.
    expect(prerelease).toContain("needs.smoke_plan.outputs.mac_arm64 == 'true'");
    expect(prerelease).toContain("needs.smoke_plan.outputs.mac_x64 == 'true'");

    // The card watcher reads job state and writes only to Feishu.
    expect(card).toContain("actions: read");
    expect(card).not.toContain("actions: write");
    expect(card).toContain(".github/scripts/feishu.py watch");
    expect(card).toContain("FEISHU_APP_ID: ${{ secrets.FEISHU_APP_ID }}");
    expect(card).toContain("FEISHU_RELEASE_CHAT_ID: ${{ secrets.FEISHU_RELEASE_CHAT_ID }}");
    expect(card).toContain("validation_location:");
    expect(card).toContain("VALIDATION_LOCATION: ${{ inputs.validation_location }}");
  });

  it("keeps macOS Intel and the validation lanes on by default without breaking the off switch", async () => {
    const [prerelease, notify] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/notify-release-feishu.yml", import.meta.url), "utf8"),
    ]);

    // Intel builds on every prerelease: stable ships Intel, and stable's gate
    // is a validated prerelease artifact, so an Intel-less prerelease cannot be
    // promoted at all.
    for (const flag of ["enable_mac_x64", "enable_smoke", "enable_tests"]) {
      const declarations = prerelease
        .split("\n")
        .map((line, index) => ({ index, line }))
        .filter((entry) => entry.line.trim() === `${flag}:`);
      // Declared once for workflow_dispatch and once for workflow_call.
      expect(declarations, flag).toHaveLength(2);
      for (const declaration of declarations) {
        const block = prerelease.split("\n").slice(declaration.index, declaration.index + 6).join("\n");
        expect(block, flag).toContain("default: true");
      }
    }

    // `${{ inputs.<flag> || true }}` would be unturnoffable: `inputs` is unset
    // on push (so the fallback is right there) but on a dispatch with the box
    // UNCHECKED, `false || true` is also true. Test the event instead.
    for (const flag of ["enable_mac_x64", "enable_smoke", "enable_tests"]) {
      expect(notify).toContain(`${flag}: \${{ github.event_name != 'workflow_dispatch' || inputs.${flag} }}`);
      expect(notify).not.toContain(`${flag}: \${{ inputs.${flag} || true }}`);
    }
  });

  it("bakes both halves of the workspace-team gate into every shipping lane", async () => {
    const [beta, prerelease, stable, canary] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/main-prerelease-win-smoke.yml", import.meta.url), "utf8"),
    ]);

    // workspaceTeamTransportEnv (apps/packaged/src/workspace-team.ts) enables the
    // four vela transports only when a known AMR profile AND a non-empty vela web
    // origin are both baked in. A lane that bakes neither still builds, still
    // installs, and still starts — the gap only surfaces as "Workspace Team does
    // nothing" once a package reaches a user. So the presence of both halves is
    // asserted per lane rather than left to the packaging step to notice.
    for (const workflow of [beta, prerelease, stable]) {
      expect(workflow).toContain("OPEN_DESIGN_AMR_PROFILE:");
      expect(workflow).toContain("OD_VELA_WEB_URL:");
    }

    // Every package-capable lane must carry the complete map. Otherwise a
    // stable/prod package can switch its AMR API to feature-test while its
    // console and Workspace links remain on prod (or disappear).
    for (const workflow of [beta, prerelease, stable, canary]) {
      expect(workflow).toContain(
        "OD_VELA_WEB_URL_FEATURE_TEST: ${{ secrets.VELA_WEB_URL_FEATURE_TEST }}",
      );
      expect(workflow).toContain(
        "OD_VELA_WEB_URL_TEST: ${{ secrets.VELA_WEB_URL_TEST }}",
      );
      expect(workflow).toContain(
        "OD_VELA_WEB_URL_PROD: ${{ secrets.VELA_WEB_URL_PROD }}",
      );
    }

    // beta and prerelease are validation lanes and stay dispatch-driven, so an
    // operator can aim a build at feature-test or test.
    expect(beta).toContain("OPEN_DESIGN_AMR_PROFILE: ${{ fromJSON(needs.release_prepare.outputs.execution_plan).release.amrProfile }}");
    expect(prerelease).toContain("OPEN_DESIGN_AMR_PROFILE: ${{ inputs.amr_profile }}");
    expect(beta).toContain(
      "(inputs.amr_profile == 'prod' || inputs.amr_profile == '') && secrets.VELA_WEB_URL_PROD || ''",
    );

    // stable is a production channel by definition. Pinning the pair
    // instead of accepting an input removes the footgun of publishing a stable
    // build wired to the test backend — there is no legitimate reason for one.
    for (const workflow of [stable]) {
      expect(workflow).toContain("OPEN_DESIGN_AMR_PROFILE: prod");
      expect(workflow).toContain("OD_VELA_WEB_URL: ${{ secrets.VELA_WEB_URL_PROD }}");
      expect(workflow).not.toContain("inputs.amr_profile");
    }
  });

  it("passes launcher version floor repo vars through to metadata publish and verify verbatim", async () => {
    const [beta, prerelease, stable] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
    ]);

    const passthrough = (suffix: string): string[] => [
      `RELEASE_LAUNCHER_VERSION_MIN_${suffix}: \${{ vars.RELEASE_LAUNCHER_VERSION_MIN_${suffix} }}`,
      `RELEASE_LAUNCHER_VERSION_MIN_URL_${suffix}: \${{ vars.RELEASE_LAUNCHER_VERSION_MIN_URL_${suffix} }}`,
    ];

    // Each channel workflow forwards its own repo-vars pair plus the STABLE
    // fallback pair verbatim; channel policy (pair-level stable fallback,
    // format/https/floor validation) lives only in
    // tools/release/src/storage/launcher-version-floor.ts, never in YAML.
    const lanes: Array<{ minSteps: number; suffix: string; workflow: string }> = [
      { minSteps: 2, suffix: "BETA", workflow: beta },
      { minSteps: 2, suffix: "PRERELEASE", workflow: prerelease },
    ];
    for (const lane of lanes) {
      for (const key of [...passthrough(lane.suffix), ...passthrough("STABLE")]) {
        // publish-metadata always carries the pair; lanes with a
        // verify-metadata step must carry it there too.
        expect(countOccurrences(lane.workflow, key)).toBeGreaterThanOrEqual(lane.minSteps);
      }
      expect(lane.workflow).not.toContain(`vars.RELEASE_LAUNCHER_VERSION_MIN_${lane.suffix} ||`);
    }
    for (const key of passthrough("STABLE")) {
      expect(countOccurrences(stable, key)).toBeGreaterThanOrEqual(2);
    }
    expect(stable).not.toContain("vars.RELEASE_LAUNCHER_VERSION_MIN_STABLE ||");
  });
});
