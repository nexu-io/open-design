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

async function readReleaseWorkflow(channel: "beta" | "preview" | "prerelease" | "stable"): Promise<string> {
  const [ritual, distribution] = await Promise.all([
    readFile(new URL(`../../../.github/workflows/release-${channel}.yml`, import.meta.url), "utf8"),
    readFile(new URL(`../../../.github/workflows/distribution-${channel}.yml`, import.meta.url), "utf8"),
  ]);
  return `${ritual}\n${distribution}`;
}

describe("release workflows", () => {
  it("keeps each release channel as an explicit distribution ritual", async () => {
    for (const channel of ["beta", "preview", "prerelease", "stable"] as const) {
      const ritual = await readFile(
        new URL(`../../../.github/workflows/release-${channel}.yml`, import.meta.url),
        "utf8",
      );
      expect(ritual).toContain("workflow_dispatch:");
      expect(ritual).toContain("workflow_call:");
      expect(ritual).toContain(`uses: ./.github/workflows/distribution-${channel}.yml`);
      expect(ritual).toContain("secrets: inherit");
      expect(ritual).not.toContain("runs-on:");
      expect(ritual).not.toMatch(/^\s+run:/mu);
      expect(countOccurrences(ritual, "\n  distribute:\n")).toBe(1);
    }
  });

  it("enables the complete release-beta platform cohort by default", async () => {
    const beta = await readReleaseWorkflow("beta");
    const dispatchInputs = sectionBetween(beta, "  workflow_dispatch:", "  workflow_call:");
    const callInputs = sectionBetween(beta, "  workflow_call:", "    outputs:");

    for (const inputs of [dispatchInputs, callInputs]) {
      expect(sectionBetween(inputs, "      enable_mac_x64:", "      publish:")).toContain("default: true");
      expect(sectionBetween(inputs, "      mac_x64_sign_mode:", "      mac_x64_smoke_mode:")).toContain("default: notarized");
      expect(sectionBetween(inputs, "      mac_x64_smoke_mode:", "      mac_x64_target:")).toContain("default: core");
    }
  });

  it("retains only the newest outer tools-pack cache for each release lane", async () => {
    const workflows = await Promise.all([
      readReleaseWorkflow("beta"),
      readReleaseWorkflow("preview"),
      readReleaseWorkflow("prerelease"),
      readReleaseWorkflow("stable"),
    ]);

    expect(workflows.map((workflow) => countOccurrences(workflow, "keep=1"))).toEqual([2, 2, 2, 0]);
    expect(workflows.map((workflow) => countOccurrences(workflow, "$keep = 1"))).toEqual([1, 1, 1, 1]);
    for (const workflow of workflows) {
      expect(workflow).not.toContain("keep=3");
      expect(workflow).not.toContain("$keep = 3");
    }
  });

  it("requires Vela CLI for every beta desktop packaging target", async () => {
    const [beta, preview, prerelease, stable, stablePrepare, buildMac, buildWin, prepareMac, prepareWin, publishPlatform, winLifecycle, desktopUpdater, macBuild, macFs, installUnsafeDmg, winApp, macWorkspace, countedDistribution, metadataDistribution] = await Promise.all([
      readReleaseWorkflow("beta"),
      readReleaseWorkflow("preview"),
      readReleaseWorkflow("prerelease"),
      readReleaseWorkflow("stable"),
      readFile(new URL("../../../tools/release/src/metadata/prepare-stable.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/build-platform.sh", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/scripts/build-platform.ps1", import.meta.url), "utf8"),
      readFile(new URL("../scripts/prepare-platform-assets.sh", import.meta.url), "utf8"),
      readFile(new URL("../scripts/prepare-platform-assets.ps1", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/release/src/storage/publish-platform.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/win/lifecycle.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../shells/electron/src/main/updater/payload.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/mac/build.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/mac/fs.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../scripts/install-unsafe-dmg.sh", import.meta.url), "utf8"),
      readFile(new URL("../src/win/app.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/mac/workspace.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/publish-counted/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/publish-metadata/action.yml", import.meta.url), "utf8"),
    ]);
    const mac = sectionBetween(beta, "  build_mac_arm64:", "  build_mac_x64:");
    const macX64 = sectionBetween(beta, "  build_mac_x64:", "  build_win_x64:");
    const win = sectionBetween(beta, "  build_win_x64:", "  publish:");
    const betaMetadata = sectionBetween(beta, "  metadata:", "  build_mac_arm64:");
    const betaPublish = sectionAfter(beta, "  publish:");
    const previewMetadata = sectionBetween(preview, "  metadata:", "  verify:");
    const previewPublish = sectionBetween(preview, "  publish:", "  cleanup_partial_release_assets:");
    const previewMac = sectionBetween(preview, "  build_mac:", "  build_mac_intel:");
    const previewMacX64 = sectionBetween(preview, "  build_mac_intel:", "  build_win:");
    const previewWin = sectionBetween(preview, "  build_win:", "  publish:");
    const prereleaseMetadata = sectionBetween(prerelease, "  metadata:", "  verify:");
    const prereleasePublish = sectionBetween(prerelease, "  publish:", "  cleanup_partial_release_assets:");
    const prereleaseMac = sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:");
    const prereleaseMacX64 = sectionBetween(prerelease, "  build_mac_intel:", "  build_win:");
    const prereleaseWin = sectionBetween(prerelease, "  build_win:", "  publish:");
    const stableMetadata = sectionBetween(stable, "  metadata:", "  verify:");
    const stablePublish = sectionBetween(stable, "  publish:", "  cleanup_partial_release_assets:");
    expect(mac).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(macX64).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(countOccurrences(mac, "--require-vela-cli")).toBe(3);
    expect(countOccurrences(macX64, "--require-vela-cli")).toBe(3);
    expect(countOccurrences(win, "--require-vela-cli")).toBe(3);
    expect(beta).not.toMatch(/closure build-distribution-target(?:.|\n){0,400}--require-vela-cli/u);
    expect(mac.match(/RELEASE_ARTIFACT_MODE: dmg-and-payload/g)?.length ?? 0).toBe(2);
    expect(macX64.match(/RELEASE_ARTIFACT_MODE: \$\{\{ inputs\.mac_x64_target == 'all' && 'all' \|\| 'dmg-and-payload' \}\}/g)?.length ?? 0).toBe(2);
    expect(mac).toContain("uses: actions/cache/restore@v5");
    expect(mac).toContain("uses: actions/cache/save@v5");
    expect(mac).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(mac).toContain("tools-pack-mac-v1-beta-${RUNNER_OS}-arm64-");
    expect(mac).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-beta --json");
    expect(mac).toContain("exec tools-pack mac build");
    expect(mac).toContain('--sign-mode "${{ inputs.mac_arm64_sign_mode }}"');
    expect(mac).toContain("Build beta mac_arm64 update fixture");
    expect(beta).toContain("CLOSURE_MIN_SHELL_VERSION: 0.19.0-beta.4");
    expect(mac).toContain("Materialize legacy mac_arm64 migration fixture");
    expect(beta).toContain("LEGACY_MAC_ARM64_VERSION: 0.16.2-beta.155");
    expect(beta).toContain('RELEASE_INSTALLATION_VERSION_MIN_BETA: ${{ vars.RELEASE_LAUNCHER_VERSION_MIN_BETA }}');
    expect(beta).not.toContain('RELEASE_INSTALLATION_VERSION_MIN_BETA" != "$CLOSURE_MIN_SHELL_VERSION');
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_LEGACY_DMG_PATH: ${{ steps.mac_arm64_legacy_fixture.outputs.dmg_path }}");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_MIN_SHELL_VERSION: ${{ env.CLOSURE_MIN_SHELL_VERSION }}");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH: ${{ steps.mac_arm64_update_fixture.outputs.update_build_json_path }}");
    expect(mac).toContain("RELEASE_SHELL_SMOKE_MATRIX: mac-shell-v3");
    expect(mac).toContain("Resolve mac_arm64 Shell smoke acceptance identity");
    expect(mac).toContain("shell-smoke-acceptance.ts mac_arm64");
    expect(mac).not.toContain("RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST: sha256:${{ hashFiles(");
    expect(mac).toContain('RELEASE_STANDALONE_PROTOCOL_VERSION: "1"');
    expect(mac).toMatch(/Build beta mac_arm64 update fixture[\s\S]*?--to app/);
    expect(mac).toMatch(/Build beta mac_arm64 update fixture[\s\S]*?--release-version "\$version"[\s\S]*?--shell-version "\$update_version"[\s\S]*?--launcher-version "\$update_version"/);
    expect(mac).toContain("steps.mac_arm64_shell_resolution.outputs.smoke_proof != 'hit'");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_SMOKE_LANES: ${{ inputs.mac_arm64_smoke_mode == 'full' && steps.mac_arm64_shell_resolution.outputs.smoke_proof == 'hit' && 'standalone' || '' }}");
    expect(mac).toContain("OD_PACKAGED_E2E_SHELL_SMOKE_PROOF: ${{ steps.mac_arm64_shell_resolution.outputs.smoke_proof }}");
    expect(mac).toContain("Register mac_arm64 Electron Shell full-smoke proof");
    expect(mac).not.toMatch(/Smoke beta mac_arm64 packaged runtime[\s\S]*?continue-on-error: true[\s\S]*?Register mac_arm64 Electron Shell full-smoke proof/);
    expect(mac).toContain("run: pnpm exec tools-release register-shell-smoke");
    expect(mac).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(mac).toContain("bash .github/scripts/release/cache/mac.sh");
    expect(macX64).toContain("uses: actions/cache/restore@v5");
    expect(macX64).toContain("uses: actions/cache/save@v5");
    expect(macX64).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(macX64).toContain("tools-pack-mac-v1-beta-${RUNNER_OS}-x64-");
    expect(macX64).toContain("pnpm exec tools-pack mac cleanup --dir \"$RUNNER_TEMP/tools-pack\" --namespace release-beta-x64 --json");
    expect(macX64).toContain("exec tools-pack mac build");
    expect(macX64).toContain("Resolve mac_x64 Shell smoke acceptance identity");
    expect(macX64).toContain("shell-smoke-acceptance.ts mac_x64");
    expect(macX64).toContain("Resolve immutable mac_x64 Electron Shell");
    expect(macX64).toContain("RELEASE_SHELL_SMOKE_MATRIX: mac-shell-v2");
    expect(macX64).toContain("steps.mac_x64_shell_resolution.outputs.state == 'miss'");
    expect(macX64).toContain("steps.mac_x64_shell_resolution.outputs.smoke_proof != 'hit'");
    expect(macX64).toContain("Build beta mac_x64 update fixture");
    expect(macX64).toMatch(/Build beta mac_x64 update fixture[\s\S]*?--to app/);
    expect(macX64).toMatch(/Build beta mac_x64 update fixture[\s\S]*?--release-version "\$version"[\s\S]*?--shell-version "\$update_version"[\s\S]*?--launcher-version "\$update_version"/);
    expect(macX64).not.toContain("Materialize legacy mac_x64 migration fixture");
    expect(macX64).toContain("OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH: ${{ steps.mac_x64_update_fixture.outputs.update_build_json_path }}");
    expect(macX64).toContain("OD_PACKAGED_E2E_MAC_SMOKE_LANES: ${{ inputs.mac_x64_smoke_mode == 'full' && (steps.mac_x64_shell_resolution.outputs.smoke_proof == 'hit' && 'standalone' || 'shell,standalone') || '' }}");
    expect(macX64).toContain("OD_PACKAGED_E2E_SHELL_SMOKE_PROOF: ${{ steps.mac_x64_shell_resolution.outputs.smoke_proof }}");
    expect(macX64).toContain("Register mac_x64 Electron Shell full-smoke proof");
    expect(macX64).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(buildMac).toContain("build_args+=(--require-vela-cli)");
    expect(buildMac).toContain("update_args+=(--require-vela-cli)");
    expect(buildMac).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(buildMac).toContain('tools-pack mac build update fixture');
    expect(buildMac).toContain('--release-version "$RELEASE_VERSION"');
    expect(buildMac).toContain('--shell-version "$update_version"');
    expect(buildMac).toContain('--launcher-version "$update_version"');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH="$update_build_json_path"');
    expect(buildMac).toContain('OD_PACKAGED_E2E_MAC_UPDATE_VERSION="${OD_PACKAGED_E2E_MAC_UPDATE_VERSION:-$update_version}"');
    expect(buildMac).not.toContain("::warning::Expected Electron framework symlink");
    expect(beta).not.toContain("REQUIRE_VELA_CLI: \"true\"");
    expect(beta).toContain("release-beta publish requires win_x64_target=nsis or all");
    expect(beta).toContain("mac_arm64_update_metadata_url:");
    expect(beta).toContain("win_x64_update_metadata_url:");
    expect(beta).toContain("Verify mac_arm64 signed and notarized artifacts");
    expect(beta).toContain("Verify mac_x64 signed and notarized artifacts");
    expect(countOccurrences(beta, '/usr/bin/hdiutil verify "$dmg_path"')).toBe(2);
    expect(countOccurrences(beta, '/usr/bin/hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_point"')).toBe(2);
    expect(countOccurrences(beta, '/usr/bin/xcrun stapler validate "$candidate_app"')).toBe(2);
    expect(countOccurrences(beta, '/usr/sbin/spctl --assess --type execute --verbose=4 "$candidate_app"')).toBe(2);
    expect(beta).not.toContain('/usr/bin/xcrun stapler validate "$dmg_path"');
    expect(beta).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ inputs.mac_arm64_update_metadata_url }}");
    expect(macX64).toContain("OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE: ${{ inputs.mac_x64_smoke_mode == 'full' && 'tools-serve' || '' }}");
    expect(beta).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
    expect(beta).toContain("POSTHOG_KEY: ${{ secrets.POSTHOG_KEY }}");
    expect(beta).toContain("POSTHOG_HOST: ${{ vars.POSTHOG_HOST }}");
    expect(beta).toContain("POSTHOG_CLI_API_KEY: ${{ secrets.POSTHOG_CLI_API_KEY }}");
    expect(beta).toContain("POSTHOG_CLI_PROJECT_ID: ${{ vars.POSTHOG_CLI_PROJECT_ID }}");
    expect(beta).not.toContain("publish-beta-metadata.ts");
    expect(beta).not.toContain("verify-beta-metadata.ts");
    expect(beta).not.toContain("summary-beta.ts");
    expect(beta).toContain("uses: ./.github/actions/release/publish-metadata");
    expect(metadataDistribution).toContain("tools-release publish-metadata");
    expect(metadataDistribution).toContain("tools-release verify-metadata");
    expect(beta).toContain("Validate checkout ref shape");
    expect(beta).toContain("full 40-character commit SHA; abbreviated SHA");
    expect(betaPublish).toContain("Observe directly activated beta public feed");
    expect(betaPublish).toContain("Read back activated beta public feed");
    expect(betaPublish).toContain("tools-release prepare-public-acceptance");
    expect(betaPublish).toContain("tools-release issue-public-acceptance");
    expect(betaPublish).toContain("tools-release activate-public-release");
    expect(betaPublish).toContain("tools-release observe-public-feed");
    expect(metadataDistribution).toContain("tools-release summary-metadata");
    for (const workflow of [beta, preview, prerelease, stable]) {
      expect(workflow).not.toContain(".github/scripts/release/r2/");
    }
    for (const workflow of [beta, preview, prerelease, stable]) {
      expect(workflow).toContain("tools-release check-storage");
    }
    expect(win).not.toContain("tools\\release\\scripts\\build-platform.ps1");
    expect(win).toContain("uses: actions/cache/restore@v5");
    expect(win).toContain("uses: actions/cache/save@v5");
    expect(win).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(win).toContain("tools-pack-win-v1-beta-$env:RUNNER_OS-");
    expect(win).toContain(
      "steps.win_x64_shell_resolution.outputs.state == 'miss' || (inputs.win_x64_smoke_mode == 'full' && steps.win_x64_shell_resolution.outputs.smoke_proof != 'hit' && inputs.win_x64_update_metadata_url == '' && inputs.win_x64_update_target_version == '')",
    );
    expect(win).toContain("Chocolatey NSIS install failed after $maxAttempts attempts");
    expect(win).toContain("Start-Sleep -Seconds $delaySeconds");
    expect(win).toContain('pnpm.cmd exec tools-pack win cleanup --dir "${{ runner.temp }}\\tools-pack" --namespace release-beta-win --json');
    expect(win).toContain('"tools-pack", "win", "build"');
    expect(buildWin).toContain('$buildArgs += "--require-vela-cli"');
    expect(buildWin).toContain('$updateArgs += "--require-vela-cli"');
    expect(win).toContain("tools-pack win validate-payload");
    expect(countOccurrences(
      win,
      'tools-pack win validate-payload --namespace release-beta-win --payload-path $build.payloadPath --expected-version "${{ needs.metadata.outputs.shell_version }}" --json',
    )).toBe(2);
    expect(win).not.toContain(
      'tools-pack win validate-payload --namespace release-beta-win --payload-path $build.payloadPath --expected-version "${{ needs.metadata.outputs.beta_version }}" --json',
    );
    expect(win).toContain("Resolve win_x64 Shell smoke acceptance identity");
    expect(win).toContain("shell-smoke-acceptance.ts win_x64");
    expect(win).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    expect(win).toContain("$env:OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON = @(");
    expect(win).toContain(") | ConvertTo-Json -Compress");
    expect(win).not.toContain("OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON: '[");
    expect(win).toContain(".\\.github\\scripts\\release\\cache\\win.ps1");
    for (const metadata of [betaMetadata, previewMetadata, prereleaseMetadata, stableMetadata]) {
      expect(metadata).toContain("uses: pnpm/action-setup@v5");
      expect(metadata).toContain("run: pnpm install --frozen-lockfile");
      expect(metadata.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(metadata.indexOf("tools-release prepare"));
    }
    for (const publish of [betaPublish, stablePublish]) {
      expect(publish).toContain("uses: pnpm/action-setup@v5");
      expect(publish).toContain("run: pnpm install --frozen-lockfile");
      expect(publish.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(
        publish.indexOf("uses: ./.github/actions/release/publish-metadata"),
      );
    }
    for (const publish of [previewPublish, prereleasePublish]) {
      expect(publish).toContain("uses: ./.github/actions/release/publish-counted");
    }
    expect(countedDistribution).toContain("uses: pnpm/action-setup@v5");
    expect(countedDistribution).toContain("run: pnpm install --frozen-lockfile");
    expect(countedDistribution.indexOf("run: pnpm install --frozen-lockfile")).toBeLessThan(
      countedDistribution.indexOf("uses: ./.github/actions/release/publish-metadata"),
    );
    expect(macBuild).toContain('runPhase("xattr-scrub"');
    expect(macBuild).toContain("scrubMacExtendedAttributes(paths.appPath)");
    expect(macFs).toContain("com.apple.provenance");
    expect(macFs).toContain("com.apple.macl");
    expect(desktopUpdater).toContain("MAC_PAYLOAD_XATTRS_TO_SCRUB");
    expect(desktopUpdater).toContain('execFileAsync("xattr", ["-dr", attribute, input.destinationRoot])');
    expect(desktopUpdater).toContain("com.apple.macl");
    expect(installUnsafeDmg).toContain("com.apple.macl");
    expect(win).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(win).toContain('"--release-version", "${{ needs.metadata.outputs.beta_version }}", "--shell-version", $updateVersion, "--launcher-version", $updateVersion');
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
    expect(buildWin).toContain('"--release-version", $ReleaseVersion');
    expect(buildWin).toContain('"--shell-version", $localUpdateVersion');
    expect(buildWin).toContain('"--launcher-version", $localUpdateVersion');
    expect(buildWin).toContain('Test-JsonString $manifest.entry.executable "entry.executable" "payload/Open Design.exe"');
    for (const workspaceBuild of [winApp, macWorkspace]) {
      expect(workspaceBuild).toContain(
        'await runPnpm(config, ["--filter", "@open-design/shell-electron...", "build"])',
      );
      expect(workspaceBuild).not.toContain('"@open-design/daemon", "build"');
      expect(workspaceBuild).not.toContain('"@open-design/web", "build"');
    }
    expect(preview).not.toContain(".github/scripts/release/assets/mac.sh");
    expect(preview).not.toContain(".github/scripts/release/assets/mac-intel.sh");
    expect(preview).not.toContain(".github/scripts/release/assets/win.ps1");
    expect(preview).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(preview).not.toContain(".github/scripts/release/r2/publish.sh");
    expect(preview).not.toContain(".github/scripts/release/r2/verify.sh");
    expect(preview).not.toContain(".github/scripts/release/r2/summary.sh");
    expect(countOccurrences(preview, "tools/pack/scripts/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(2);
    expect(preview).toContain("tools\\pack\\scripts\\prepare-platform-assets.ps1");
    expect(countOccurrences(preview, "tools-release publish-platform")).toBeGreaterThanOrEqual(3);
    expect(preview).toContain("uses: ./.github/actions/release/publish-counted");
    expect(countedDistribution).toContain("uses: ./.github/actions/release/publish-metadata");
    expect(metadataDistribution).toContain("tools-release publish-metadata");
    expect(metadataDistribution).toContain("tools-release verify-metadata");
    expect(metadataDistribution).toContain("tools-release summary-metadata");
    expect(preview).toContain("RELEASE_ARTIFACT_MODE: all");
    expect(preview).toContain("open-design-preview-mac-arm64-publish-manifest");
    expect(preview).toContain("open-design-preview-win-x64-publish-manifest");
    expect(preview).toContain("workflow_call:");
    expect(preview).toContain("OPEN_DESIGN_PREVIEW_VERSION: ${{ inputs.release_version }}");
    expect(preview).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
    expect(preview).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
    expect(preview).toContain("version_metadata_url: ${{ steps.distribute.outputs.version_metadata_url }}");
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
    expect(prerelease).toContain("version_metadata_url: ${{ steps.distribute.outputs.version_metadata_url }}");
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
    expect(countOccurrences(prereleaseMac, '--sign-mode "${{ inputs.mac_arm64_sign_mode }}"')).toBe(2);
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
    expect(countOccurrences(prereleaseMacX64, '--sign-mode "${{ inputs.mac_x64_sign_mode }}"')).toBe(2);
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
      [prereleaseMac, "Smoke prerelease mac"],
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
    expect(countOccurrences(stable, "tools/pack/scripts/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(2);
    expect(stable).toContain("tools\\pack\\scripts\\prepare-platform-assets.ps1");
    expect(countOccurrences(stable, "tools-release publish-platform")).toBeGreaterThanOrEqual(3);
    expect(stable).toContain("uses: ./.github/actions/release/publish-metadata");
    expect(metadataDistribution).toContain("tools-release publish-metadata");
    // The stable promotion gate validates prerelease metadata.github fields; the
    // publish steps must therefore pass the resolved release attribution through.
    expect(stable).toContain("RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}");
    expect(stable).toContain("RELEASE_REPOSITORY: ${{ github.repository }}");
    expect(stable).toContain("RELEASE_WORKFLOW: ${{ github.workflow }}");
    expect(countOccurrences(stable, "RELEASE_COMMIT: ${{ needs.metadata.outputs.commit }}")).toBeGreaterThanOrEqual(4);
    expect(stable).toContain("RELEASE_RUN_ID: ${{ github.run_id }}");
    expect(countOccurrences(stable, "RELEASE_BRANCH: ${{ needs.metadata.outputs.branch }}")).toBeGreaterThanOrEqual(4);
    expect(stable).not.toContain("RELEASE_BRANCH: ${{ github.ref_name }}");
    expect(metadataDistribution).toContain("tools-release verify-metadata");
    expect(metadataDistribution).toContain("tools-release summary-metadata");
    expect(stable).toContain("open-design-release-mac-arm64-publish-manifest");
    expect(stable).toContain("open-design-release-win-x64-publish-manifest");
    expect(stable).toContain('--sign-mode "${{ inputs.mac_arm64_sign_mode }}"');
    expect(stable).toContain('--sign-mode "${{ inputs.mac_x64_sign_mode }}"');
    expect(stable).toContain('"--sign-mode", "${{ inputs.win_x64_sign_mode }}"');
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
    expect(stable.indexOf("Pre-flight tag/release check")).toBeLessThan(stable.indexOf("Create draft release with tag"));
    expect(stable.indexOf("Create draft release with tag")).toBeLessThan(
      stable.indexOf("uses: ./.github/actions/release/publish-metadata"),
    );
    expect(stable.indexOf("uses: ./.github/actions/release/publish-metadata")).toBeLessThan(
      stable.indexOf("Activate stable release"),
    );
    expect(stable.indexOf("Activate stable release")).toBeLessThan(
      stable.indexOf("Cleanup release + tag on failure"),
    );
    expect(stable).toContain("RELEASE_ACTIVATE_LATEST: \"false\"");
    expect(stable).toContain("tools-release activate-stable-release");
    expect(prerelease).toContain("tools-release issue-stable-qualification");
    expect(prerelease).toContain("RELEASE_WIN_X64_SIGN_MODE: ${{ inputs.win_x64_sign_mode }}");
    expect(stable).toContain("RELEASE_METADATA_PATH:");
    expect(stable).not.toContain("inputs.channel");
    expect(stable).not.toContain("prepare ${{ inputs.channel }}");
    expect(stablePrepare).toContain('expectStringField(github, "workflow", "release-prerelease"');
    expect(stablePrepare).toContain("validateStableQualification");
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

  it("bakes both halves of the workspace-team gate into every shipping lane", async () => {
    const [beta, preview, prerelease, stable] = await Promise.all([
      readReleaseWorkflow("beta"),
      readReleaseWorkflow("preview"),
      readReleaseWorkflow("prerelease"),
      readReleaseWorkflow("stable"),
    ]);

    // workspaceTeamTransportEnv (shells/electron/src/workspace-team.ts) enables the
    // four vela transports only when a known AMR profile AND a non-empty vela web
    // origin are both baked in. A lane that bakes neither still builds, still
    // installs, and still starts — the gap only surfaces as "Workspace Team does
    // nothing" once a package reaches a user. So the presence of both halves is
    // asserted per lane rather than left to the packaging step to notice.
    for (const workflow of [beta, preview, prerelease, stable]) {
      expect(workflow).toContain("OPEN_DESIGN_AMR_PROFILE:");
      expect(workflow).toContain("OD_VELA_WEB_URL:");
    }

    // beta and prerelease are validation lanes and stay dispatch-driven, so an
    // operator can aim a build at feature-test or test.
    expect(beta).toContain("OPEN_DESIGN_AMR_PROFILE: ${{ inputs.amr_profile }}");
    expect(prerelease).toContain("OPEN_DESIGN_AMR_PROFILE: ${{ inputs.amr_profile }}");

    // preview and stable are production channels by definition. Pinning the pair
    // instead of accepting an input removes the footgun of publishing a stable
    // build wired to the test backend — there is no legitimate reason for one.
    for (const workflow of [preview, stable]) {
      expect(workflow).toContain("OPEN_DESIGN_AMR_PROFILE: prod");
      expect(workflow).toContain("OD_VELA_WEB_URL: ${{ secrets.VELA_WEB_URL_PROD }}");
      expect(workflow).not.toContain("inputs.amr_profile");
    }
  });

  it("maps existing repo vars into the installation floor for metadata publish and verify", async () => {
    const [beta, preview, prerelease, stable] = await Promise.all([
      readReleaseWorkflow("beta"),
      readReleaseWorkflow("preview"),
      readReleaseWorkflow("prerelease"),
      readReleaseWorkflow("stable"),
    ]);

    const passthrough = (suffix: string): string[] => [
      `RELEASE_INSTALLATION_VERSION_MIN_${suffix}: \${{ vars.RELEASE_LAUNCHER_VERSION_MIN_${suffix} }}`,
      `RELEASE_INSTALLATION_VERSION_MIN_URL_${suffix}: \${{ vars.RELEASE_LAUNCHER_VERSION_MIN_URL_${suffix} }}`,
    ];

    // Each channel workflow forwards its own repo-vars pair plus the STABLE
    // fallback pair verbatim; channel policy (pair-level stable fallback,
    // format/https/floor validation) lives only in
    // tools/release/src/storage/installation-version-floor.ts, never in YAML.
    const lanes: Array<{ minSteps: number; suffix: string; workflow: string }> = [
      { minSteps: 1, suffix: "BETA", workflow: beta },
      { minSteps: 1, suffix: "PREVIEW", workflow: preview },
      { minSteps: 1, suffix: "PRERELEASE", workflow: prerelease },
    ];
    for (const lane of lanes) {
      for (const key of [...passthrough(lane.suffix), ...passthrough("STABLE")]) {
        // The distribution call forwards the pair once; the shared composite
        // inherits it for both publish and verification.
        expect(countOccurrences(lane.workflow, key)).toBeGreaterThanOrEqual(lane.minSteps);
      }
      expect(lane.workflow).not.toContain(`vars.RELEASE_LAUNCHER_VERSION_MIN_${lane.suffix} ||`);
    }
    for (const key of passthrough("STABLE")) {
      expect(countOccurrences(stable, key)).toBeGreaterThanOrEqual(1);
    }
    expect(stable).not.toContain("vars.RELEASE_LAUNCHER_VERSION_MIN_STABLE ||");
  });
});
