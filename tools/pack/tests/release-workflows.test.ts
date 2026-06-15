import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return content.slice(startIndex, endIndex);
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1;
}

describe("release workflows", () => {
  it("requires Vela CLI only for beta mac arm64 packaging", async () => {
    const [beta, betaSelfHosted, preview, stable, buildMac, buildWin, prepareMac, prepareWin, publishPlatform, winLifecycle, desktopUpdater, macBuild, macFs, installUnsafeDmg, winApp, macWorkspace, linuxPack] = await Promise.all([
      readFile(new URL("../../../.github/workflows/release-beta.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-beta-s.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-preview.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/release-stable.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflow/scripts/release/build-platform.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflow/scripts/release/build-platform.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflow/scripts/release/prepare-platform-assets.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflow/scripts/release/prepare-platform-assets.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflow/scripts/release/storage/publish-platform.ts", import.meta.url), "utf8"),
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
    const selfHostedMac = sectionBetween(betaSelfHosted, "  build_mac_arm64:", "  build_win_x64:");
    const selfHostedWin = sectionBetween(betaSelfHosted, "  build_win_x64:", "  publish:");

    expect(mac).toContain("bash .github/workflow/scripts/release/build-platform.sh");
    expect(selfHostedMac).toContain("fnm exec --using=24 -- bash .github/workflow/scripts/release/build-platform.sh");
    expect(mac).toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(selfHostedMac).toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(mac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(selfHostedMac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(macX64.match(/RELEASE_ARTIFACT_MODE: \$\{\{ inputs\.mac_x64_target == 'all' && 'all' \|\| 'dmg-and-payload' \}\}/g)?.length ?? 0).toBe(2);
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(buildMac).toContain('tools-pack mac build update fixture');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH="$update_build_json_path"');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_VERSION="${OD_PACKAGED_E2E_MAC_UPDATE_VERSION:-$update_version}"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(macX64).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(win).not.toContain("--require-vela-cli");
    expect(linux).not.toContain("--require-vela-cli");
    expect(beta.match(/REQUIRE_VELA_CLI: "true"/g)?.length ?? 0).toBe(1);
    expect(beta).toContain("release-beta publish requires win_x64_target=nsis or all");
    expect(betaSelfHosted).toContain("release-beta-s publish requires win_x64_target=nsis or all");
    expect(beta).toContain("mac_arm64_update_metadata_url:");
    expect(beta).toContain("win_x64_update_metadata_url:");
    expect(beta).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ inputs.mac_arm64_update_metadata_url }}");
    expect(beta).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
    expect(beta).not.toContain("publish-beta-metadata.ts");
    expect(beta).not.toContain("verify-beta-metadata.ts");
    expect(beta).not.toContain("summary-beta.ts");
    expect(beta).toContain("publish-metadata.ts");
    expect(beta).toContain("verify-metadata.ts");
    expect(beta).toContain("summary-metadata.ts");
    expect(betaSelfHosted).toContain("mac_arm64_update_metadata_url:");
    expect(betaSelfHosted).toContain("mac_arm64_delivery_mode:");
    expect(betaSelfHosted).toContain("internal-updater");
    expect(betaSelfHosted).toContain("public-notarized");
    expect(selfHostedMac).toContain("RELEASE_DELIVERY_MODE: ${{ inputs.mac_arm64_delivery_mode }}");
    expect(selfHostedMac).toContain("RELEASE_SIGN_MODE: ${{ inputs.mac_arm64_delivery_mode == 'internal-updater' && 'sign-only' || inputs.mac_arm64_sign_mode }}");
    expect(selfHostedMac).toContain("OD_UPDATE_METADATA_URL: ${{ inputs.release_public_origin }}/beta/latest/metadata.json");
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
    expect(betaSelfHosted).toContain("publish-metadata.ts");
    expect(betaSelfHosted).toContain("verify-metadata.ts");
    expect(betaSelfHosted).toContain("summary-metadata.ts");
    expect(win).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(selfHostedWin).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(prepareMac).not.toContain("required RELEASE_ASSET_SUFFIX");
    expect(prepareMac).toContain('RELEASE_ASSET_SUFFIX="${RELEASE_ASSET_SUFFIX:-}"');
    expect(prepareWin).toContain("[AllowEmptyString()]");
    expect(prepareWin).toContain("$sourcePayload = [string]$build.payloadPath");
    expect(prepareWin).toContain("open-design-$ReleaseVersion$ReleaseAssetSuffix-win-x64-payload.7z");
    expect(publishPlatform).toContain("open-design-${releaseVersion}${assetSuffix}-win-x64-payload.7z");
    expect(publishPlatform).toContain("payload: assetEntry(payload)");
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
    expect(countOccurrences(preview, ".github/workflow/scripts/release/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(3);
    expect(preview).toContain(".github\\workflow\\scripts\\release\\prepare-platform-assets.ps1");
    expect(countOccurrences(preview, ".github/workflow/scripts/release/storage/publish-platform.ts")).toBeGreaterThanOrEqual(4);
    expect(preview).toContain(".github/workflow/scripts/release/storage/publish-metadata.ts");
    expect(preview).toContain(".github/workflow/scripts/release/storage/verify-metadata.ts");
    expect(preview).toContain(".github/workflow/scripts/release/storage/summary-metadata.ts");
    expect(preview).toContain("RELEASE_ARTIFACT_MODE: all");
    expect(preview).toContain("open-design-preview-mac-arm64-publish-manifest");
    expect(preview).toContain("open-design-preview-win-x64-publish-manifest");
    expect(stable).not.toContain(".github/scripts/release/assets/mac.sh");
    expect(stable).not.toContain(".github/scripts/release/assets/mac-intel.sh");
    expect(stable).not.toContain(".github/scripts/release/assets/win.ps1");
    expect(stable).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/publish.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/verify.sh");
    expect(stable).not.toContain(".github/scripts/release/r2/summary.sh");
    expect(countOccurrences(stable, ".github/workflow/scripts/release/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(3);
    expect(stable).toContain(".github\\workflow\\scripts\\release\\prepare-platform-assets.ps1");
    expect(countOccurrences(stable, ".github/workflow/scripts/release/storage/publish-platform.ts")).toBeGreaterThanOrEqual(4);
    expect(stable).toContain(".github/workflow/scripts/release/storage/publish-metadata.ts");
    // The stable promotion gate (scripts/release-stable.ts) validates the
    // nightly's metadata.github.{commit,branch,repository,workflow}; the publish
    // step must therefore pass the RELEASE_* attribution env. #3995 unified the
    // publisher but left these unset for release-stable, so github.* shipped
    // empty and no nightly could be promoted.
    expect(stable).toContain("RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}");
    expect(stable).toContain("RELEASE_REPOSITORY: ${{ github.repository }}");
    expect(stable).toContain("RELEASE_WORKFLOW: ${{ github.workflow }}");
    // publish-metadata.ts refuses a platform manifest whose github.{runId,commit}
    // disagree with the publish step's. RELEASE_COMMIT must therefore reach every
    // publish step (4 platforms + the metadata step), and RELEASE_RUN_ID must be
    // workflow-wide so the platform build jobs stamp the same runId the metadata
    // step validates against — otherwise publish fails with
    // "refusing stale <target> platform manifest ...: github.runId=0".
    expect(countOccurrences(stable, "RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}")).toBeGreaterThanOrEqual(5);
    expect(stable).toContain("RELEASE_RUN_ID: ${{ github.run_id }}");
    // RELEASE_BRANCH must be the resolved needs.metadata.outputs.branch on every
    // publish step (not github.ref_name): under workflow_call / inputs.ref the
    // caller ref differs from the built ref, so a workflow-wide github.ref_name
    // would make the per-platform manifests' github.branch disagree with the
    // aggregate metadata the metadata job stamps.
    expect(countOccurrences(stable, "RELEASE_BRANCH: ${{ needs.metadata.outputs.branch }}")).toBeGreaterThanOrEqual(5);
    expect(stable).not.toContain("RELEASE_BRANCH: ${{ github.ref_name }}");
    expect(stable).toContain(".github/workflow/scripts/release/storage/verify-metadata.ts");
    expect(stable).toContain(".github/workflow/scripts/release/storage/summary-metadata.ts");
    expect(stable).toContain("open-design-release-mac-arm64-publish-manifest");
    expect(stable).toContain("open-design-release-win-x64-publish-manifest");
    expect(stable).toContain("--signed\n            --notarize");
    expect(stable).toContain("--signed \\\n            --notarize");
  });
});
