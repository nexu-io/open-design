import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import linuxPack from "@/linux.ts?raw";
import macBuild from "@/mac/build.ts?raw";
import macFs from "@/mac/fs.ts?raw";
import macLifecycle from "@/mac/lifecycle.ts?raw";
import macWorkspace from "@/mac/workspace.ts?raw";
import workspaceBuild from "@/workspace-build.ts?raw";
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

/**
 * Status-check functions that make a job evaluate its own `if` instead of
 * inheriting a skip from somewhere up the chain. `success()` does not count:
 * it is what GitHub already applies implicitly.
 */
const SKIP_CHAIN_BREAKERS = ["always(", "cancelled(", "failure("];

describe("release workflows", () => {
  it("retains only the newest outer tools-pack cache for each release lane", async () => {
    const workflows = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
    ]);

    expect(workflows.map((workflow) => countOccurrences(workflow, "keep=1"))).toEqual([2, 2, 0]);
    expect(workflows.map((workflow) => countOccurrences(workflow, "$keep = 1"))).toEqual([1, 1, 1]);
    for (const workflow of workflows) {
      expect(workflow).not.toContain("keep=3");
      expect(workflow).not.toContain("$keep = 3");
    }
  });

  it("requires Vela CLI for every beta desktop packaging target", async () => {
    const [beta, prerelease, stable, stablePrepare, buildMac, buildWin, prepareMac, prepareWin, publishPlatform, desktopUpdater, installUnsafeDmg] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
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
    const win = sectionBetween(beta, "  build_win_x64:", "  build_linux_x64:");
    const linux = sectionBetween(beta, "  build_linux_x64:", "  publish:");
    const betaMetadata = sectionBetween(beta, "  metadata:", "  build_mac_arm64:");
    const betaPublish = sectionAfter(beta, "  publish:");
    const prereleaseMetadata = sectionBetween(prerelease, "  metadata:", "  dispatch_validation:");
    const prereleasePublish = sectionBetween(prerelease, "  publish:", "  cleanup_partial_release_assets:");
    const prereleaseMac = sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:");
    const prereleaseMacX64 = sectionBetween(prerelease, "  build_mac_intel:", "  build_win:");
    const prereleaseWin = sectionBetween(prerelease, "  build_win:", "  build_linux:");
    const stableMetadata = sectionBetween(stable, "  metadata:", "  verify:");
    const stablePublish = sectionBetween(stable, "  publish:", "  cleanup_partial_release_assets:");

    expect(mac).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(macX64).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(countOccurrences(mac, "--require-vela-cli")).toBe(3);
    expect(countOccurrences(macX64, "--require-vela-cli")).toBe(2);
    expect(countOccurrences(win, "--require-vela-cli")).toBe(3);
    expect(mac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(macX64.match(/RELEASE_ARTIFACT_MODE: \$\{\{ inputs\.mac_x64_target == 'all' && 'all' \|\| 'dmg-and-payload' \}\}/g)?.length ?? 0).toBe(2);
    expect(mac).toContain("uses: actions/cache/restore@v5");
    expect(mac).toContain("uses: actions/cache/save@v5");
    expect(mac).toContain("tools-pack-mac-v1-beta-${RUNNER_OS}-arm64-");
    expect(mac).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-beta --json");
    expect(mac).toContain("exec tools-pack mac build");
    expect(mac).toContain("build_args+=(--signed --notarize)");
    expect(mac).toContain("Build beta mac_arm64 update fixture");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH: ${{ steps.mac_arm64_update_fixture.outputs.update_build_json_path }}");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE: ${{ inputs.mac_arm64_smoke_mode == 'full' && inputs.mac_arm64_update_metadata_url == '' && inputs.mac_arm64_update_target_version == '' && 'tools-serve' || '' }}");
    expect(mac).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(mac).toContain("bash .github/scripts/release/cache/mac.sh");
    expect(macX64).toContain("uses: actions/cache/restore@v5");
    expect(macX64).toContain("uses: actions/cache/save@v5");
    expect(macX64).toContain("tools-pack-mac-v1-beta-${RUNNER_OS}-x64-");
    expect(macX64).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-beta-x64 --json");
    expect(macX64).toContain("exec tools-pack mac build");
    expect(macX64).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain("update_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(buildMac).toContain('tools-pack mac build update fixture');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH="$update_build_json_path"');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_VERSION="${OD_PACKAGED_E2E_MAC_UPDATE_VERSION:-$update_version}"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(linux).not.toContain("--require-vela-cli");
    expect(beta).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(beta).toContain("release-beta publish requires win_x64_target=nsis or all");
    expect(beta).toContain("mac_arm64_update_metadata_url:");
    expect(beta).toContain("win_x64_update_metadata_url:");
    expect(beta).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ inputs.mac_arm64_update_metadata_url }}");
    expect(beta).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
    expect(beta).toContain("POSTHOG_KEY: ${{ inputs.publish && secrets.POSTHOG_KEY || '' }}");
    expect(beta).toContain("POSTHOG_HOST: ${{ inputs.publish && vars.POSTHOG_HOST || '' }}");
    expect(beta).toContain("POSTHOG_CLI_API_KEY: ${{ inputs.publish && secrets.POSTHOG_CLI_API_KEY || '' }}");
    expect(beta).toContain("POSTHOG_CLI_PROJECT_ID: ${{ inputs.publish && vars.POSTHOG_CLI_PROJECT_ID || '' }}");
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
    expect(win).toContain("uses: actions/cache/restore@v5");
    expect(win).toContain("uses: actions/cache/save@v5");
    expect(win).toContain("tools-pack-win-v1-beta-$env:RUNNER_OS-");
    expect(win).toContain('pnpm.cmd exec tools-pack win cleanup --dir "${{ runner.temp }}\\tools-pack" --namespace release-beta-win --json');
    expect(win).toContain('"tools-pack", "win", "build"');
    expect(buildWin).toContain('$buildArgs += "--require-vela-cli"');
    expect(buildWin).toContain('$updateArgs += "--require-vela-cli"');
    expect(win).toContain("tools-pack win validate-payload");
    expect(win).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    expect(win).toContain(".\\.github\\scripts\\release\\cache\\win.ps1");
    for (const metadata of [betaMetadata, prereleaseMetadata, stableMetadata]) {
      expect(metadata).toContain("uses: pnpm/action-setup@v5");
      expect(metadata).toContain("run: pnpm install --frozen-lockfile");
      expect(metadata.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(metadata.indexOf("tools-release prepare"));
    }
    for (const publish of [betaPublish, prereleasePublish, stablePublish]) {
      expect(publish).toContain("uses: pnpm/action-setup@v5");
      expect(publish).toContain("run: pnpm install --frozen-lockfile");
      expect(publish.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(
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
    expect(win).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
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
    const dependencyClosureBuild = '"--filter", "@open-design/packaged^..."';
    const webSidecarBuild = '"--filter", "@open-design/web", "run", "build:sidecar"';
    const packagedBuild = '"--filter", "@open-design/packaged", "run", "build"';
    expect(workspaceBuild).toContain('"--filter", "@open-design/dsh-runtime..."');
    expect(workspaceBuild.indexOf(dependencyClosureBuild)).toBeLessThan(workspaceBuild.indexOf(webSidecarBuild));
    expect(workspaceBuild.indexOf(webSidecarBuild)).toBeLessThan(workspaceBuild.indexOf(packagedBuild));
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
    expect(prereleaseMac).toContain("uses: actions/cache/restore@v5");
    expect(prereleaseMac).toContain("uses: actions/cache/save@v5");
    expect(prereleaseMac).toContain("tools-pack-mac-v1-prerelease-${RUNNER_OS}-arm64-");
    expect(prereleaseMac).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-prerelease --json");
    expect(prereleaseMac).toContain("exec tools-pack mac build");
    expect(prereleaseMac).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(countOccurrences(prereleaseMac, "--notarize")).toBe(2);
    // Both the primary build and the cache-miss retry must carry Apple notary
    // env, or notarization fails closed on the retry path.
    expect(
      countOccurrences(prereleaseMac, "APPLE_ID: ${{ secrets.APPLE_ID }}"),
    ).toBe(2);
    expect(
      countOccurrences(
        prereleaseMac,
        "APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",
      ),
    ).toBe(2);
    expect(
      countOccurrences(prereleaseMac, "APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}"),
    ).toBe(2);
    expect(prereleaseMac).toContain("tools-release write-report");
    expect(prereleaseMacX64).toContain("uses: actions/cache/restore@v5");
    expect(prereleaseMacX64).toContain("uses: actions/cache/save@v5");
    expect(prereleaseMacX64).toContain("tools-pack-mac-v1-prerelease-${RUNNER_OS}-x64-");
    expect(prereleaseMacX64).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-prerelease-intel --json");
    expect(prereleaseMacX64).toContain("exec tools-pack mac build");
    expect(prereleaseMacX64).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(countOccurrences(prereleaseMacX64, "--notarize")).toBe(2);
    expect(
      countOccurrences(prereleaseMacX64, "APPLE_ID: ${{ secrets.APPLE_ID }}"),
    ).toBe(2);
    expect(
      countOccurrences(
        prereleaseMacX64,
        "APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",
      ),
    ).toBe(2);
    expect(
      countOccurrences(prereleaseMacX64, "APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}"),
    ).toBe(2);
    expect(prereleaseMacX64).toContain("tools-release write-report");
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
    expect(prereleaseWin).toContain("tools-pack-win-v1-prerelease-$env:RUNNER_OS-");
    expect(prereleaseWin).toContain("tools-pack win validate-payload");
    expect(prereleaseWin).toContain("release-build\\win_x64\\build.json");
    expect(prereleaseWin).toContain("tools-release write-report");
    expect(stable).not.toContain(".github/scripts/release/assets/mac.sh");
    expect(stable).not.toContain(".github/scripts/release/assets/mac-intel.sh");
    expect(stable).not.toContain(".github/scripts/release/assets/win.ps1");
    expect(stable).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/publish.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/verify.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/summary.sh");
    expect(countOccurrences(stable, "tools/release/scripts/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(3);
    expect(stable).toContain("tools\\release\\scripts\\prepare-platform-assets.ps1");
    expect(countOccurrences(stable, "tools-release publish-platform")).toBeGreaterThanOrEqual(4);
    expect(stable).toContain("tools-release publish-metadata");
    // The stable promotion gate validates prerelease metadata.github fields; the
    // publish steps must therefore pass the resolved release attribution through.
    expect(stable).toContain("RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}");
    expect(stable).toContain("RELEASE_REPOSITORY: ${{ github.repository }}");
    expect(stable).toContain("RELEASE_WORKFLOW: ${{ github.workflow }}");
    expect(countOccurrences(stable, "RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}")).toBeGreaterThanOrEqual(5);
    expect(stable).toContain("RELEASE_RUN_ID: ${{ github.run_id }}");
    expect(countOccurrences(stable, "RELEASE_BRANCH: ${{ needs.metadata.outputs.branch }}")).toBeGreaterThanOrEqual(5);
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
    expect(stable).toContain("type: choice");
    expect(stable).toContain("- metadata");
    expect(stable).toContain("- prepublish");
    expect(stable).toContain("- publish");
    expect(stable).toContain("default: metadata");
    expect(stable).toContain("OPEN_DESIGN_RELEASE_DRY_RUN: ${{ inputs.dry_run == 'publish' && 'false' || inputs.dry_run }}");
    expect(stable).toContain("run_prepublish_jobs: ${{ steps.stable.outputs.run_prepublish_jobs }}");
    expect(stable).toContain("publish_side_effects_enabled: ${{ steps.stable.outputs.publish_side_effects_enabled }}");
    expect(stable).toContain("if: ${{ needs.metadata.outputs.run_prepublish_jobs == 'true' }}");
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
    // The break is per job and is NOT inherited. `always()` on `publish` lets
    // PUBLISH run past a skipped `build_linux`; it does nothing for publish's
    // own dependents, which are still downstream of the same skip. A job whose
    // `if` hand-checks `needs.<x>.result` is by construction making its own
    // decision about an upstream outcome — so it has to break the chain too,
    // or GitHub's implicit `success()` skips it before that condition is ever
    // evaluated.
    //
    // release-prerelease.yml's `dispatch_smoke` was exactly that shape, and
    // `build_linux` is skipped on every single run because the repository has
    // no ENABLE_STABLE_LINUX variable. Run 34149795952: publish succeeded,
    // version_metadata_url was published, enable_smoke came through as true —
    // and the job was skipped with zero steps, so release-prerelease-smoke.yml
    // had never once run.
    const files = [
      "release-prerelease.yml",
      "release-beta.yml",
      "release-stable.yml",
      "notify-release-feishu.yml",
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

    // And specifically: the smoke dispatcher must stay reachable while
    // build_linux stays opt-in.
    const prerelease = parseJobGraph(contents[0] ?? "");
    const dispatchSmoke = prerelease.get("dispatch_smoke");
    expect(dispatchSmoke, "release-prerelease.yml must still dispatch packaged smoke").toBeDefined();
    expect(transitiveNeeds(prerelease, "dispatch_smoke")).toContain("build_linux");
    expect(prerelease.get("build_linux")?.if).toContain("vars.ENABLE_STABLE_LINUX");
    expect(SKIP_CHAIN_BREAKERS.some((breaker) => (dispatchSmoke?.if ?? "").includes(breaker))).toBe(true);
  });

  it("keeps every prerelease validation lane out of the release concurrency group", async () => {
    // release-prerelease.yml holds ONE repository-wide concurrency group with
    // cancel-in-progress: false. Anything that outlives `publish` inside it
    // keeps that group held, which stops the next prerelease from STARTING —
    // so making the test jobs advisory was not enough, they had to leave the
    // workflow. Lock that: the pipeline is metadata → build → publish plus two
    // fire-and-forget dispatchers, and the lanes live in workflows whose
    // concurrency is scoped to the origin run.
    const [prerelease, tests, smoke, card, dispatcher] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-tests.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-smoke.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease-card.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/scripts/release/dispatch-validation.sh", import.meta.url), "utf8"),
    ]);

    expect(prerelease).toContain("group: open-design-release-prerelease");
    for (const jobId of ["  functional_e2e:", "  e2e_vitest:", "  daemon_unit_tests:", "  verify:", "  test_signals:"]) {
      expect(prerelease, `${jobId} must not be a release-prerelease job any more`).not.toContain(jobId);
    }
    // The mac/Windows packaged smoke left with them; Linux keeps its in-job
    // smoke because that whole lane is opt-in and on nobody's critical path.
    expect(prerelease).not.toContain("Smoke prerelease mac packaged runtime");
    expect(prerelease).not.toContain("Smoke prerelease mac_x64 packaged runtime");
    expect(prerelease).not.toContain("Smoke prerelease windows packaged runtime");
    expect(prerelease).toContain("Smoke prerelease linux AppImage runtime");

    // Dispatchers, and nothing depending on them.
    expect(prerelease).toContain("  dispatch_validation:");
    expect(prerelease).toContain("  dispatch_smoke:");
    expect(prerelease).toContain("dispatch-validation.sh release-prerelease-tests.yml");
    expect(prerelease).toContain("dispatch-validation.sh release-prerelease-card.yml");
    expect(prerelease).toContain("dispatch-validation.sh release-prerelease-smoke.yml");
    expect(prerelease).not.toContain("- dispatch_validation");
    expect(prerelease).not.toContain("- dispatch_smoke");
    // Smoke needs a package, so it waits for publish — but only long enough to
    // POST the dispatch. Asserted as substance rather than as one literal
    // line: the previous form pinned the exact string of a condition that
    // never ran, which made the topology test agree with the bug. Reachability
    // itself is covered by "keeps a job that hand-checks an upstream result
    // reachable past a skipped ancestor" above.
    const smokeCondition = parseJobGraph(prerelease).get("dispatch_smoke")?.if ?? "";
    expect(smokeCondition).toContain("inputs.enable_smoke");
    expect(smokeCondition).toContain("needs.publish.result == 'success'");
    expect(smokeCondition).toContain("needs.publish.outputs.version_metadata_url != ''");

    // Two refs, tried in order, so a release branch cut before these lanes
    // existed still gets validated from the default branch.
    expect(dispatcher).toContain('for candidate in "${PRIMARY_REF:-}" "${FALLBACK_REF:-}"');
    expect(dispatcher).toContain('gh workflow run "$workflow" --ref "$ref"');

    for (const [label, workflow] of [
      ["tests", tests],
      ["smoke", smoke],
      ["card", card],
    ] as const) {
      expect(workflow, label).toContain("workflow_dispatch:");
      expect(workflow, label).not.toContain("open-design-release-prerelease");
      expect(workflow, label).toContain("cancel-in-progress: false");
      // Correlation is the run name: `gh workflow run` returns no run id, so
      // the Feishu card finds these runs by matching `origin-run <id>`.
      expect(workflow, label).toContain("origin-run ${{ inputs.origin_run_id }}");
      expect(workflow, label).toContain("group: release-prerelease-");
    }

    // The suites moved verbatim and still run against the resolved build commit.
    for (const suite of [
      "pnpm --filter @open-design/e2e test",
      "pnpm --filter @open-design/daemon test --shard=${{ matrix.shard }}/4",
      "pnpm -r --workspace-concurrency=4 --if-present run typecheck",
      "run: pnpm guard",
      "uses: ./.github/workflows/ui-extended-main.yml",
    ]) {
      expect(tests).toContain(suite);
    }
    expect(tests).toContain("ref: ${{ inputs.commit }}");
    expect(tests).not.toContain("needs.metadata.outputs.commit");

    // Smoke installs the PUBLISHED artifact, not a local build directory.
    expect(smoke).toContain("smoke-artifacts.ts plan");
    expect(smoke).toContain("smoke-artifacts.ts stage");
    expect(smoke).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(smoke).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    expect(smoke).not.toContain("tools-pack mac build");
    // mac.spec.ts reads the profile with a bare `??`, so an empty string reads
    // as "not core" and selects the updater path — which then dies for want of
    // a fixture. It must be a literal, never an expression.
    expect(smoke).toContain("OD_PACKAGED_E2E_MAC_SMOKE_PROFILE: core");
    expect(smoke).not.toMatch(/OD_PACKAGED_E2E_MAC_SMOKE_PROFILE: \$\{\{/);
    // Every platform lane is gated on what actually published, not on the flags
    // the build was dispatched with.
    expect(smoke).toContain("if: ${{ needs.plan.outputs.mac_arm64 == 'true' }}");
    expect(smoke).toContain("if: ${{ needs.plan.outputs.mac_x64 == 'true' }}");

    // The card watcher reads job state and writes only to Feishu.
    expect(card).toContain("actions: read");
    expect(card).not.toContain("actions: write");
    expect(card).toContain("tools/release/src/notifications/prerelease-progress-card.ts");
    expect(card).toContain("FEISHU_APP_ID: ${{ secrets.FEISHU_APP_ID }}");
    expect(card).toContain("FEISHU_RELEASE_CHAT_ID: ${{ secrets.FEISHU_RELEASE_CHAT_ID }}");
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
    expect(beta).toContain("OPEN_DESIGN_AMR_PROFILE: ${{ inputs.amr_profile }}");
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
