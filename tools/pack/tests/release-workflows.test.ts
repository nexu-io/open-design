import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

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

describe("release workflows", () => {
  it("requires Vela CLI only for beta mac arm64 packaging", async () => {
    const [beta, betaSelfHosted, preview, prerelease, stable, stablePrepare, buildMac, buildWin, prepareMac, prepareWin, publishPlatform, winLifecycle, desktopUpdater, macBuild, macFs, installUnsafeDmg, winApp, macWorkspace, linuxPack] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-beta-s.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-preview.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-prerelease.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/src/metadata/prepare-stable.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/build-platform.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/build-platform.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/prepare-platform-assets.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/prepare-platform-assets.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/src/storage/publish-platform.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/win/lifecycle.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../apps/desktop/src/main/updater.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/mac/build.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/mac/fs.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../scripts/install-unsafe-dmg.sh", import.meta.url), "utf8"),
      readFile(new URL("../src/win/app.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/mac/workspace.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/linux.ts", import.meta.url), "utf8"),
    ]);
    const mac = sectionBetween(beta, "  build_mac_arm64:", "  build_mac_x64:");
    const macX64 = sectionBetween(beta, "  build_mac_x64:", "  build_win_x64:");
    const win = sectionBetween(beta, "  build_win_x64:", "  build_linux_x64:");
    const linux = sectionBetween(beta, "  build_linux_x64:", "  publish:");
    const betaMetadata = sectionBetween(beta, "  metadata:", "  build_mac_arm64:");
    const betaPublish = sectionAfter(beta, "  publish:");
    const previewMetadata = sectionBetween(preview, "  metadata:", "  verify:");
    const previewPublish = sectionBetween(preview, "  publish:", "  cleanup_partial_release_assets:");
    const previewMac = sectionBetween(preview, "  build_mac:", "  build_mac_intel:");
    const previewMacX64 = sectionBetween(preview, "  build_mac_intel:", "  build_win:");
    const previewWin = sectionBetween(preview, "  build_win:", "  build_linux:");
    const prereleaseMetadata = sectionBetween(prerelease, "  metadata:", "  verify:");
    const prereleasePublish = sectionBetween(prerelease, "  publish:", "  cleanup_partial_release_assets:");
    const prereleaseMac = sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:");
    const prereleaseMacX64 = sectionBetween(prerelease, "  build_mac_intel:", "  build_win:");
    const prereleaseWin = sectionBetween(prerelease, "  build_win:", "  build_linux:");
    const stableMetadata = sectionBetween(stable, "  metadata:", "  verify:");
    const stablePublish = sectionBetween(stable, "  publish:", "  cleanup_partial_release_assets:");
    const selfHostedMac = sectionBetween(betaSelfHosted, "  build_mac_arm64:", "  build_win_x64:");
    const selfHostedWin = sectionBetween(betaSelfHosted, "  build_win_x64:", "  publish:");

    expect(mac).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(macX64).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(selfHostedMac).toContain("fnm exec --using=24 -- bash tools/release/scripts/build-platform.sh");
    expect(mac).toContain("--require-vela-cli");
    expect(selfHostedMac).toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(mac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(selfHostedMac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(macX64.match(/RELEASE_ARTIFACT_MODE: \$\{\{ inputs\.mac_x64_target == 'all' && 'all' \|\| 'dmg-and-payload' \}\}/g)?.length ?? 0).toBe(2);
    expect(mac).toContain("uses: actions/cache/restore@v5");
    expect(mac).toContain("uses: actions/cache/save@v5");
    expect(mac).toContain("tools-pack-mac-v1-beta-${RUNNER_OS}-arm64-");
    expect(mac).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-beta --json");
    expect(mac).toContain("exec tools-pack mac build");
    expect(mac).toContain("build_args+=(--signed --notarize)");
    expect(mac).toContain("Build beta mac_arm64 update fixture");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH: ${{ steps.mac_arm64_update_fixture.outputs.update_build_json_path }}");
    expect(mac).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(mac).toContain("bash .github/scripts/release/cache/mac.sh");
    expect(macX64).toContain("uses: actions/cache/restore@v5");
    expect(macX64).toContain("uses: actions/cache/save@v5");
    expect(macX64).toContain("tools-pack-mac-v1-beta-${RUNNER_OS}-x64-");
    expect(macX64).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-beta-x64 --json");
    expect(macX64).toContain("exec tools-pack mac build");
    expect(macX64).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(buildMac).toContain('tools-pack mac build update fixture');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH="$update_build_json_path"');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_VERSION="${OD_PACKAGED_E2E_MAC_UPDATE_VERSION:-$update_version}"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(macX64).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(macX64).not.toContain("--require-vela-cli");
    expect(win).not.toContain("--require-vela-cli");
    expect(linux).not.toContain("--require-vela-cli");
    expect(beta).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(beta).toContain("release-beta publish requires win_x64_target=nsis or all");
    expect(betaSelfHosted).toContain("release-beta-s publish requires win_x64_target=nsis or all");
    expect(betaSelfHosted).toContain("sparse-checkout disable");
    expect(betaSelfHosted).toContain("metadata checkout is missing packages/");
    expect(beta).toContain("mac_arm64_update_metadata_url:");
    expect(beta).toContain("win_x64_update_metadata_url:");
    expect(beta).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ inputs.mac_arm64_update_metadata_url }}");
    expect(beta).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
    expect(beta).not.toContain("publish-beta-metadata.ts");
    expect(beta).not.toContain("verify-beta-metadata.ts");
    expect(beta).not.toContain("summary-beta.ts");
    expect(beta).toContain("tools-release publish-metadata");
    expect(beta).toContain("tools-release verify-metadata");
    expect(beta).toContain("tools-release summary-metadata");
    for (const workflow of [beta, betaSelfHosted, preview, prerelease, stable]) {
      expect(workflow).not.toContain(".github/scripts/release/r2/");
    }
    for (const workflow of [beta, preview, prerelease, stable]) {
      expect(workflow).toContain("tools-release check-storage");
    }
    expect(betaSelfHosted).not.toContain("tools-release check-storage");
    expect(win).not.toContain("tools\\release\\scripts\\build-platform.ps1");
    expect(win).toContain("uses: actions/cache/restore@v5");
    expect(win).toContain("uses: actions/cache/save@v5");
    expect(win).toContain("tools-pack-win-v1-beta-$env:RUNNER_OS-");
    expect(win).toContain('pnpm.cmd exec tools-pack win cleanup --dir "${{ runner.temp }}\\tools-pack" --namespace release-beta-win --json');
    expect(win).toContain('"tools-pack", "win", "build"');
    expect(win).toContain("tools-pack win validate-payload");
    expect(win).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    expect(win).toContain(".\\.github\\scripts\\release\\cache\\win.ps1");
    for (const metadata of [betaMetadata, previewMetadata, prereleaseMetadata, stableMetadata]) {
      expect(metadata).toContain("uses: pnpm/action-setup@v5");
      expect(metadata).toContain("run: pnpm install --frozen-lockfile");
      expect(metadata.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(metadata.indexOf("tools-release prepare"));
    }
    for (const publish of [betaPublish, previewPublish, prereleasePublish, stablePublish]) {
      expect(publish).toContain("uses: pnpm/action-setup@v5");
      expect(publish).toContain("run: pnpm install --frozen-lockfile");
      expect(publish.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(
        publish.indexOf("tools-release publish-metadata"),
      );
    }
    expect(betaSelfHosted).toContain("mac_arm64_update_metadata_url:");
    expect(betaSelfHosted).toContain("mac_arm64_delivery_mode:");
    expect(betaSelfHosted).toContain('default: "https://s3.nexu.space/od-releases"');
    expect(betaSelfHosted).toContain("internal-updater");
    expect(betaSelfHosted).toContain("public-notarized");
    expect(selfHostedMac).toContain("RELEASE_DELIVERY_MODE: ${{ inputs.mac_arm64_delivery_mode }}");
    expect(selfHostedMac).toContain("RELEASE_SIGN_MODE: ${{ inputs.mac_arm64_delivery_mode == 'internal-updater' && 'sign-only' || inputs.mac_arm64_sign_mode }}");
    expect(selfHostedMac).toContain("OD_UPDATE_METADATA_URL: ${{ inputs.release_public_origin }}/betas/latest/metadata.json");
    expect(selfHostedMac).toContain("RELEASE_CHANNEL: betas");
    expect(betaSelfHosted).toContain("public-notarized mac_arm64_delivery_mode requires mac_arm64_sign_mode=notarize");
    expect(betaSelfHosted).toContain("RELEASE_SIGNED: ${{ inputs.enable_mac_arm64 && (inputs.mac_arm64_delivery_mode == 'internal-updater' || inputs.mac_arm64_sign_mode != 'no') && 'true' || 'false' }}");
    expect(selfHostedMac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ inputs.mac_arm64_update_metadata_url }}");
    expect(selfHostedMac).toContain("RELEASE_ARTIFACT_MODE: dmg-and-payload");
    expect(macBuild).toContain('runPhase("xattr-scrub"');
    expect(macBuild).toContain("scrubMacExtendedAttributes(paths.appPath)");
    expect(macFs).toContain("com.apple.provenance");
    expect(macFs).toContain("com.apple.macl");
    expect(desktopUpdater).toContain("MAC_PAYLOAD_XATTRS_TO_SCRUB");
    expect(desktopUpdater).toContain('execFileAsync("xattr", ["-dr", attribute, input.destinationRoot])');
    expect(desktopUpdater).toContain("com.apple.macl");
    expect(installUnsafeDmg).toContain("com.apple.macl");
    expect(betaSelfHosted).not.toContain("publish-beta-metadata.ts");
    expect(betaSelfHosted).not.toContain("verify-beta-metadata.ts");
    expect(betaSelfHosted).not.toContain("summary-beta.ts");
    expect(betaSelfHosted).toContain("tools-release publish-metadata");
    expect(betaSelfHosted).toContain("tools-release download-platform-manifest");
    expect(betaSelfHosted).not.toContain('curl -fsSL "$manifest_url" -o "$RELEASE_MANIFEST_DIR/$RELEASE_TARGET.json"');
    expect(betaSelfHosted).not.toContain("tools-release verify-metadata");
    expect(betaSelfHosted).not.toContain("tools-release summary-metadata");
    expect(betaSelfHosted).toContain("release-beta-s publishes to an internal S3 namespace; public metadata fetch verification is intentionally skipped.");
    expect(win).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(selfHostedWin).toContain("OD_UPDATE_METADATA_URL: ${{ inputs.release_public_origin }}/betas/latest/metadata.json");
    expect(selfHostedWin).toContain("RELEASE_CHANNEL: betas");
    expect(selfHostedWin).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
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
    expect(buildWin).toContain('Measure-Step "validate launcher payload artifact"');
    expect(buildWin).toContain('Measure-Step "validate launcher payload update fixture"');
    expect(buildWin).toContain('Test-JsonString $manifest.entry.executable "entry.executable" "payload/Open Design.exe"');
    for (const workspaceBuild of [winApp, macWorkspace, linuxPack]) {
      const sidecarProtoBuild = 'await runPnpm(config, ["--filter", "@open-design/sidecar-proto", "build"])';
      const launcherProtoBuild = 'await runPnpm(config, ["--filter", "@open-design/launcher-proto", "build"])';
      const sidecarBuild = 'await runPnpm(config, ["--filter", "@open-design/sidecar", "build"])';
      expect(workspaceBuild).toContain(launcherProtoBuild);
      expect(workspaceBuild.indexOf(sidecarProtoBuild)).toBeLessThan(workspaceBuild.indexOf(launcherProtoBuild));
      expect(workspaceBuild.indexOf(launcherProtoBuild)).toBeLessThan(workspaceBuild.indexOf(sidecarBuild));
    }
    expect(preview).not.toContain(".github/scripts/release/assets/mac.sh");
    expect(preview).not.toContain(".github/scripts/release/assets/mac-intel.sh");
    expect(preview).not.toContain(".github/scripts/release/assets/win.ps1");
    expect(preview).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(preview).not.toContain(".github/scripts/release/r2/publish.sh");
    expect(preview).not.toContain(".github/scripts/release/r2/verify.sh");
    expect(preview).not.toContain(".github/scripts/release/r2/summary.sh");
    expect(countOccurrences(preview, "tools/release/scripts/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(3);
    expect(preview).toContain("tools\\release\\scripts\\prepare-platform-assets.ps1");
    expect(countOccurrences(preview, "tools-release publish-platform")).toBeGreaterThanOrEqual(4);
    expect(preview).toContain("tools-release publish-metadata");
    expect(preview).toContain("tools-release verify-metadata");
    expect(preview).toContain("tools-release summary-metadata");
    expect(preview).toContain("RELEASE_ARTIFACT_MODE: all");
    expect(preview).toContain("open-design-preview-mac-arm64-publish-manifest");
    expect(preview).toContain("open-design-preview-win-x64-publish-manifest");
    expect(preview).toContain("workflow_call:");
    expect(preview).toContain("OPEN_DESIGN_PREVIEW_VERSION: ${{ inputs.release_version }}");
    expect(preview).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
    expect(preview).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
    expect(preview).toContain("version_metadata_url: ${{ steps.outputs.outputs.version_metadata_url }}");
    expect(previewPublish).toContain('GITHUB_RELEASE_ENABLED: "false"');
    expect(preview).not.toContain("gh release");
    expect(previewMac).toContain("uses: actions/cache/restore@v5");
    expect(previewMac).toContain("uses: actions/cache/save@v5");
    expect(previewMac).toContain("tools-pack-mac-v1-preview-${RUNNER_OS}-arm64-");
    expect(previewMac).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-preview --json");
    expect(previewMac).toContain("exec tools-pack mac build");
    expect(previewMac).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(previewMac).toContain("tools-release write-report");
    expect(previewMacX64).toContain("uses: actions/cache/restore@v5");
    expect(previewMacX64).toContain("uses: actions/cache/save@v5");
    expect(previewMacX64).toContain("tools-pack-mac-v1-preview-${RUNNER_OS}-x64-");
    expect(previewMacX64).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-preview-intel --json");
    expect(previewMacX64).toContain("exec tools-pack mac build");
    expect(previewMacX64).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(previewMacX64).toContain("tools-release write-report");
    expect(previewWin).toContain("tools-pack-win-v1-preview-$env:RUNNER_OS-");
    expect(previewWin).toContain("tools-pack win validate-payload");
    expect(previewWin).toContain("release-build\\win_x64\\build.json");
    expect(previewWin).toContain("tools-release write-report");
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
    expect(prereleaseMac).toContain("tools-release write-report");
    expect(prereleaseMacX64).toContain("uses: actions/cache/restore@v5");
    expect(prereleaseMacX64).toContain("uses: actions/cache/save@v5");
    expect(prereleaseMacX64).toContain("tools-pack-mac-v1-prerelease-${RUNNER_OS}-x64-");
    expect(prereleaseMacX64).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-prerelease-intel --json");
    expect(prereleaseMacX64).toContain("exec tools-pack mac build");
    expect(prereleaseMacX64).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(prereleaseMacX64).toContain("tools-release write-report");
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
});
