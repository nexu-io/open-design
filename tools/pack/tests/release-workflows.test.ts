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
  const distributionName = channel === "preview" || channel === "prerelease" ? "counted" : channel;
  const platformActions = channel === "beta"
    ? ["mac/beta", "win/beta"]
    : ["mac", "win"];
  const [ritual, publicDistribution, distribution, ...actions] = await Promise.all([
    readFile(new URL(`../../../.github/workflows/release-${channel}.yml`, import.meta.url), "utf8"),
    readFile(new URL("../../../.github/workflows/distribution.yml", import.meta.url), "utf8"),
    readFile(new URL(`../../../.github/workflows/distribution-${distributionName}.yml`, import.meta.url), "utf8"),
    ...platformActions.map((action) => readFile(
      new URL(`../../../.github/actions/release/platform/${action}/action.yml`, import.meta.url),
      "utf8",
    )),
    readFile(new URL("../../../.github/actions/release/platform/cache/action.yml", import.meta.url), "utf8"),
    readFile(new URL("../../../.github/actions/release/platform/cache/delete-failed/action.yml", import.meta.url), "utf8"),
    readFile(new URL("../../../.github/actions/release/platform/cache/save/action.yml", import.meta.url), "utf8"),
    readFile(new URL("../../../.github/actions/release/platform/mac/shell/action.yml", import.meta.url), "utf8"),
    readFile(new URL("../../../.github/actions/release/platform/win/shell/action.yml", import.meta.url), "utf8"),
    readFile(new URL("../../../.github/actions/release/closure/shared/action.yml", import.meta.url), "utf8"),
  ]);
  return [ritual, publicDistribution, distribution, ...actions].join("\n");
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
      expect(ritual).toContain("uses: ./.github/workflows/distribution.yml");
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
    const [cache, mac, betaMac, win, betaWin] = await Promise.all([
      readFile(new URL("../../../.github/actions/release/platform/cache/save/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/mac/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/mac/beta/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/win/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/win/beta/action.yml", import.meta.url), "utf8"),
    ]);

    expect(cache).toContain(".[1:] | .[].id");
    expect(cache).toContain("Select-Object -Skip 1");
    expect(cache).not.toContain("keep=3");
    expect(cache).not.toContain("$keep = 3");
    for (const platform of [mac, betaMac, win, betaWin]) {
      expect(platform).toContain("uses: ./.github/actions/release/platform/cache/save");
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
    const [betaMacAction, betaWinAction, macAction, winAction, macShellAction, winShellAction] = await Promise.all([
      readFile(new URL("../../../.github/actions/release/platform/mac/beta/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/win/beta/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/mac/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/win/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/mac/shell/action.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/platform/win/shell/action.yml", import.meta.url), "utf8"),
    ]);
    const mac = `${sectionBetween(beta, "  build_mac_arm64:", "  build_mac_x64:")}\n${betaMacAction}`;
    const macX64 = `${sectionBetween(beta, "  build_mac_x64:", "  build_win_x64:")}\n${betaMacAction}`;
    const win = `${sectionBetween(beta, "  build_win_x64:", "  publish:")}\n${betaWinAction}`;
    const betaMetadata = sectionBetween(beta, "  metadata:", "  build_mac_arm64:");
    const betaPublish = sectionAfter(beta, "  publish:");
    const previewMetadata = sectionBetween(preview, "  metadata:", "  verify:");
    const previewPublish = sectionBetween(preview, "  publish:", "  cleanup_partial_release_assets:");
    const previewMac = `${sectionBetween(preview, "  build_mac:", "  build_mac_intel:")}\n${macAction}\n${macShellAction}`;
    const previewMacX64 = `${sectionBetween(preview, "  build_mac_intel:", "  build_win:")}\n${macAction}\n${macShellAction}`;
    const previewWin = `${sectionBetween(preview, "  build_win:", "  publish:")}\n${winAction}\n${winShellAction}`;
    const prereleaseMetadata = sectionBetween(prerelease, "  metadata:", "  verify:");
    const prereleasePublish = sectionBetween(prerelease, "  publish:", "  cleanup_partial_release_assets:");
    const prereleaseMac = `${sectionBetween(prerelease, "  build_mac:", "  build_mac_intel:")}\n${macAction}\n${macShellAction}`;
    const prereleaseMacX64 = `${sectionBetween(prerelease, "  build_mac_intel:", "  build_win:")}\n${macAction}\n${macShellAction}`;
    const prereleaseWin = `${sectionBetween(prerelease, "  build_win:", "  publish:")}\n${winAction}\n${winShellAction}`;
    const stableMetadata = sectionBetween(stable, "  metadata:", "  verify:");
    const stablePublish = sectionBetween(stable, "  publish:", "  cleanup_partial_release_assets:");
    expect(mac).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(macX64).not.toContain("bash tools/release/scripts/build-platform.sh");
    expect(countOccurrences(mac, "--require-vela-cli")).toBe(3);
    expect(countOccurrences(macX64, "--require-vela-cli")).toBe(3);
    expect(countOccurrences(win, "--require-vela-cli")).toBe(3);
    expect(beta).not.toMatch(/closure build-distribution-target(?:.|\n){0,400}--require-vela-cli/u);
    expect(countOccurrences(betaMacAction, "RELEASE_ARTIFACT_MODE: ${{ inputs.build-target == 'all' && 'all' || 'dmg-and-payload' }}")).toBe(2);
    expect(mac).toContain("uses: ./.github/actions/release/platform/cache");
    expect(mac).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(mac).toContain("arch: arm64");
    expect(mac).toContain("prefix: tools-pack-mac-v1-beta-${{ runner.os }}-${{ inputs.arch }}-");
    expect(mac).toContain('pnpm exec tools-pack mac cleanup --dir "$RUNNER_TEMP/tools-pack" --namespace "${{ inputs.namespace }}" --json');
    expect(mac).toContain("exec tools-pack mac build");
    expect(mac).toContain('--sign-mode "${{ inputs.sign-mode }}"');
    expect(mac).toContain("Build beta ${{ inputs.target }} update fixture");
    expect(beta).toContain("CLOSURE_MIN_SHELL_VERSION: 0.19.0-beta.4");
    expect(mac).toContain("legacy-migration-enabled: \"true\"");
    expect(betaMacAction).toContain("Materialize legacy ${{ inputs.target }} migration fixture");
    expect(beta).toContain("LEGACY_MAC_ARM64_VERSION: 0.16.2-beta.155");
    expect(beta).toContain('RELEASE_INSTALLATION_VERSION_MIN_BETA: ${{ vars.RELEASE_LAUNCHER_VERSION_MIN_BETA }}');
    expect(beta).not.toContain('RELEASE_INSTALLATION_VERSION_MIN_BETA" != "$CLOSURE_MIN_SHELL_VERSION');
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_LEGACY_DMG_PATH: ${{ steps.legacy_fixture.outputs.dmg_path }}");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_MIN_SHELL_VERSION: ${{ env.CLOSURE_MIN_SHELL_VERSION }}");
    expect(mac).toContain("OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH: ${{ steps.update_fixture.outputs.update_build_json_path }}");
    expect(mac).toContain("shell-smoke-matrix: mac-shell-v3");
    expect(mac).toContain("Resolve ${{ inputs.target }} Shell smoke acceptance identity");
    expect(mac).toContain("shell-smoke-acceptance.ts ${{ inputs.target }}");
    expect(mac).not.toContain("RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST: sha256:${{ hashFiles(");
    expect(mac).toContain('RELEASE_STANDALONE_PROTOCOL_VERSION: "1"');
    expect(mac).toMatch(/Build beta \$\{\{ inputs\.target \}\} update fixture[\s\S]*?--to app/);
    expect(mac).toContain("steps.shell_resolution.outputs.smoke_proof != 'hit'");
    expect(mac).toContain("OD_PACKAGED_E2E_SHELL_SMOKE_PROOF: ${{ steps.shell_resolution.outputs.smoke_proof }}");
    expect(mac).toContain("Register ${{ inputs.target }} Electron Shell full-smoke proof");
    expect(mac).toContain("run: pnpm exec tools-release register-shell-smoke");
    expect(mac).toContain("pnpm exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts");
    expect(macX64).toContain("uses: ./.github/actions/release/platform/cache");
    expect(macX64).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(macX64).toContain("arch: x64");
    expect(macX64).toContain("namespace: release-beta-x64");
    expect(macX64).toContain("exec tools-pack mac build");
    expect(macX64).toContain("shell-smoke-matrix: mac-shell-v2");
    expect(macX64).toContain("smoke-lanes-on-miss: shell,standalone");
    expect(macX64).not.toContain("legacy-migration-enabled: \"true\"");
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
    expect(betaMacAction).toContain("Verify ${{ inputs.target }} signed and notarized artifacts");
    expect(countOccurrences(betaMacAction, '/usr/bin/hdiutil verify "$dmg_path"')).toBe(1);
    expect(countOccurrences(betaMacAction, '/usr/bin/hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_point"')).toBe(1);
    expect(countOccurrences(betaMacAction, '/usr/bin/xcrun stapler validate "$candidate_app"')).toBe(1);
    expect(countOccurrences(betaMacAction, '/usr/sbin/spctl --assess --type execute --verbose=4 "$candidate_app"')).toBe(1);
    expect(beta).not.toContain('/usr/bin/xcrun stapler validate "$dmg_path"');
    expect(beta).toContain("update-metadata-url: ${{ inputs.mac_arm64_update_metadata_url }}");
    expect(betaMacAction).toContain("OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL: ${{ inputs.update-metadata-url }}");
    expect(betaMacAction).toContain("OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE: ${{ inputs.smoke-mode == 'full'");
    expect(beta).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.workflow_win_x64_update_metadata_url }}");
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
    expect(win).toContain("uses: ./.github/actions/release/platform/cache");
    expect(win).toContain("uses: ./.github/actions/release/platform/cache/save");
    expect(win).toContain("OPEN_DESIGN_POSTINSTALL_LEVEL: release-smoke");
    expect(win).toContain("prefix: tools-pack-win-v1-beta-${{ runner.os }}-");
    expect(win).toContain(
      "steps.win_x64_shell_resolution.outputs.state == 'miss' || (inputs.workflow_win_x64_smoke_mode == 'full' && steps.win_x64_shell_resolution.outputs.smoke_proof != 'hit' && inputs.workflow_win_x64_update_metadata_url == '' && inputs.workflow_win_x64_update_target_version == '')",
    );
    expect(win).toContain("uses: ./.github/actions/release/platform/win/nsis");
    expect(win).toContain('pnpm.cmd exec tools-pack win cleanup --dir "${{ runner.temp }}\\tools-pack" --namespace release-beta-win --json');
    expect(win).toContain('"tools-pack", "win", "build"');
    expect(buildWin).toContain('$buildArgs += "--require-vela-cli"');
    expect(buildWin).toContain('$updateArgs += "--require-vela-cli"');
    expect(win).toContain("tools-pack win validate-payload");
    expect(countOccurrences(
      win,
      'tools-pack win validate-payload --namespace release-beta-win --payload-path $build.payloadPath --expected-version "${{ inputs.metadata_shell_version }}" --json',
    )).toBe(2);
    expect(win).not.toContain(
      'tools-pack win validate-payload --namespace release-beta-win --payload-path $build.payloadPath --expected-version "${{ inputs.metadata_beta_version }}" --json',
    );
    expect(win).toContain("Resolve win_x64 Shell smoke acceptance identity");
    expect(win).toContain("shell-smoke-acceptance.ts win_x64");
    expect(win).toContain("pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts");
    expect(win).toContain("$env:OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON = @(");
    expect(win).toContain(") | ConvertTo-Json -Compress");
    expect(win).not.toContain("OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON: '[");
    expect(win).toContain("uses: ./.github/actions/release/platform/cache/save");
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
    expect(win).toContain("-IncludeZip $${{ inputs.workflow_win_x64_target == 'all' || inputs.workflow_win_x64_target == 'zip' }}");
    expect(win).toContain('"--release-version", "${{ inputs.metadata_beta_version }}", "--shell-version", $updateVersion, "--launcher-version", $updateVersion');
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
    expect(countOccurrences(preview, "tools/pack/scripts/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(1);
    expect(preview).toContain("tools\\pack\\scripts\\prepare-platform-assets.ps1");
    expect(countOccurrences(preview, "tools-release publish-platform")).toBeGreaterThanOrEqual(2);
    expect(preview).toContain("uses: ./.github/actions/release/publish-counted");
    expect(countedDistribution).toContain("uses: ./.github/actions/release/publish-metadata");
    expect(metadataDistribution).toContain("tools-release publish-metadata");
    expect(metadataDistribution).toContain("tools-release verify-metadata");
    expect(metadataDistribution).toContain("tools-release summary-metadata");
    expect(preview).toContain("RELEASE_ARTIFACT_MODE: all");
    expect(preview).toContain("format('open-design-{0}-{1}-publish-manifest', inputs.channel, inputs.artifact-id)");
    expect(preview).toContain("format('open-design-{0}-win-x64-publish-manifest', inputs.channel)");
    expect(preview).toContain("workflow_call:");
    expect(preview).toContain("OPEN_DESIGN_PREVIEW_VERSION: ${{ inputs.release_version }}");
    expect(preview).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
    expect(preview).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
    expect(preview).toContain("version_metadata_url: ${{ steps.distribute.outputs.version_metadata_url }}");
    expect(previewPublish).toContain('GITHUB_RELEASE_ENABLED: "false"');
    expect(preview).not.toContain("gh release");
    expect(previewMac).toContain("uses: ./.github/actions/release/platform/cache");
    expect(previewMac).toContain("uses: ./.github/actions/release/platform/cache/save");
    expect(previewMac).toContain("tools-pack-mac-v1-${{ inputs.channel }}-${{ runner.os }}-${{ steps.platform.outputs.arch }}-");
    expect(previewMac).toContain('pnpm exec tools-pack mac cleanup --dir "$RUNNER_TEMP/tools-pack" --namespace "${{ inputs.namespace }}" --json');
    expect(previewMac).toContain("exec tools-pack mac build");
    expect(previewMac).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(previewMac).toContain("tools-release write-report");
    expect(previewMacX64).toContain("uses: ./.github/actions/release/platform/cache");
    expect(previewMacX64).toContain("uses: ./.github/actions/release/platform/cache/save");
    expect(previewMacX64).toContain("target: mac_x64");
    expect(previewMacX64).toContain('pnpm exec tools-pack mac cleanup --dir "$RUNNER_TEMP/tools-pack" --namespace "${{ inputs.namespace }}" --json');
    expect(previewMacX64).toContain("exec tools-pack mac build");
    expect(previewMacX64).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(previewMacX64).toContain("tools-release write-report");
    expect(previewWin).toContain("tools-pack-win-v1-${{ inputs.channel }}-${{ runner.os }}-");
    expect(previewWin).toContain("tools-pack win validate-payload");
    expect(previewWin).toContain("release-build\\win_x64\\build.json");
    expect(previewWin).toContain("$env:OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON = @(");
    expect(previewWin).toContain(") | ConvertTo-Json -Compress");
    expect(previewWin).toContain("tools-release write-report");
    expect(prerelease).toContain("name: release-prerelease");
    expect(prerelease).toContain('pnpm exec tools-release prepare "${{ inputs.channel }}"');
    expect(prerelease).toContain("OPEN_DESIGN_PRERELEASE_METADATA_URL");
    expect(prerelease).toContain("RELEASE_CHANNEL: ${{ inputs.channel }}");
    expect(prerelease).toContain("format('open-design-{0}-{1}-publish-manifest', inputs.channel, inputs.artifact-id)");
    expect(prerelease).toContain("format('open-design-{0}-win-x64-publish-manifest', inputs.channel)");
    expect(prerelease).toContain("workflow_call:");
    expect(prerelease).toContain("OPEN_DESIGN_STABLE_VERSION: ${{ inputs.release_version }}");
    expect(prerelease).toContain("GITHUB_SHA: ${{ needs.metadata.outputs.commit }}");
    expect(prerelease).toContain("previous_commit: ${{ steps.prev.outputs.previous_commit }}");
    expect(prerelease).toContain("version_metadata_url: ${{ steps.distribute.outputs.version_metadata_url }}");
    expect(prerelease).not.toContain("RELEASE_CHANNEL: Prerelease");
    expect(prerelease).not.toContain("tools-release prepare preview");
    expect(prereleaseMetadata).toContain("GH_TOKEN: ${{ github.token }}");
    expect(prereleaseMetadata).toContain("OPEN_DESIGN_RELEASE_CHANNEL: ${{ inputs.channel }}");
    expect(prereleasePublish).toContain('GITHUB_RELEASE_ENABLED: "false"');
    expect(prerelease).not.toContain("gh release");
    expect(prereleaseMac).toContain("uses: ./.github/actions/release/platform/cache");
    expect(prereleaseMac).toContain("uses: ./.github/actions/release/platform/cache/save");
    expect(prereleaseMac).toContain("tools-pack-mac-v1-${{ inputs.channel }}-${{ runner.os }}-${{ steps.platform.outputs.arch }}-");
    expect(prereleaseMac).toContain('pnpm exec tools-pack mac cleanup --dir "$RUNNER_TEMP/tools-pack" --namespace "${{ inputs.namespace }}" --json');
    expect(prereleaseMac).toContain("exec tools-pack mac build");
    expect(prereleaseMac).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(countOccurrences(prereleaseMac, '--sign-mode "${{ inputs.sign-mode }}"')).toBe(3);
    // Job-level Apple credentials are inherited by the shared signing and
    // retry path without duplicating secret expressions in each step.
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
    expect(prereleaseMacX64).toContain("uses: ./.github/actions/release/platform/cache");
    expect(prereleaseMacX64).toContain("uses: ./.github/actions/release/platform/cache/save");
    expect(prereleaseMacX64).toContain("target: mac_x64");
    expect(prereleaseMacX64).toContain('pnpm exec tools-pack mac cleanup --dir "$RUNNER_TEMP/tools-pack" --namespace "${{ inputs.namespace }}" --json');
    expect(prereleaseMacX64).toContain("exec tools-pack mac build");
    expect(prereleaseMacX64).toContain("--cache-dir \"$RUNNER_TEMP/tools-pack-cache\"");
    expect(countOccurrences(prereleaseMacX64, '--sign-mode "${{ inputs.sign-mode }}"')).toBe(3);
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
    expect(prereleaseMacX64).toContain("tools-release write-report");
    expect(macShellAction).toContain("Verify notarized immutable Shell");
    expect(macShellAction).toContain("inputs.verify-notarization == 'true'");
    expect(macShellAction).toContain('hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_point"');
    expect(macShellAction).toContain('codesign --verify --deep --strict --verbose=2 "$candidate_app"');
    expect(macShellAction).toContain('xcrun stapler validate "$candidate_app"');
    expect(macShellAction).toContain('spctl --assess --type execute --verbose=4 "$candidate_app"');
    expect(prereleaseWin).toContain("tools-pack-win-v1-${{ inputs.channel }}-${{ runner.os }}-");
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
    expect(countOccurrences(stable, "tools/pack/scripts/prepare-platform-assets.sh")).toBeGreaterThanOrEqual(1);
    expect(stable).toContain("tools\\pack\\scripts\\prepare-platform-assets.ps1");
    expect(countOccurrences(stable, "tools-release publish-platform")).toBeGreaterThanOrEqual(2);
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
    expect(stable).toContain("sign-mode: ${{ inputs.mac_arm64_sign_mode }}");
    expect(stable).toContain("sign-mode: ${{ inputs.mac_x64_sign_mode }}");
    expect(stable).toContain("sign-mode: ${{ inputs.win_x64_sign_mode }}");
    expect(countOccurrences(stable, 'verify-notarization: "true"')).toBe(2);
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
    const stableDistribution = await readFile(
      new URL("../../../.github/workflows/distribution-stable.yml", import.meta.url),
      "utf8",
    );
    expect(stableDistribution).not.toContain("inputs.channel");
    expect(stableDistribution).not.toContain("prepare ${{ inputs.channel }}");
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

    // preview selects prod at its explicit ritual boundary while the counted
    // distribution keeps the same typed AMR input used by prerelease. Stable
    // remains pinned directly because its safety profile is not configurable.
    const previewRitual = await readFile(
      new URL("../../../.github/workflows/release-preview.yml", import.meta.url),
      "utf8",
    );
    expect(previewRitual).toContain("amr_profile: prod");
    expect(sectionBetween(previewRitual, "  workflow_dispatch:", "  workflow_call:")).not.toContain("amr_profile:");
    expect(sectionBetween(previewRitual, "  workflow_call:", "    outputs:")).not.toContain("amr_profile:");
    expect(preview).toContain("OPEN_DESIGN_AMR_PROFILE: ${{ inputs.amr_profile }}");
    expect(preview).toContain("inputs.amr_profile == 'prod' && secrets.VELA_WEB_URL_PROD");
    expect(stable).toContain("OPEN_DESIGN_AMR_PROFILE: prod");
    expect(stable).toContain("OD_VELA_WEB_URL: ${{ secrets.VELA_WEB_URL_PROD }}");
    const stableImplementation = await readFile(
      new URL("../../../.github/workflows/distribution-stable.yml", import.meta.url),
      "utf8",
    );
    expect(stableImplementation).not.toContain("inputs.amr_profile");
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
    // fallback pair verbatim. This frozen pair only migrates an old-architecture
    // installation into Shell + Standalone; new Shell selection is hash-based.
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
      expect(lane.workflow).not.toContain(
        `RELEASE_INSTALLATION_VERSION_MIN_${lane.suffix}: \${{ vars.RELEASE_LAUNCHER_VERSION_MIN_${lane.suffix} ||`,
      );
      expect(lane.workflow).toContain('RELEASE_LEGACY_INSTALLATION_MIGRATION_REQUIRED: "true"');
    }
    for (const key of passthrough("STABLE")) {
      expect(countOccurrences(stable, key)).toBeGreaterThanOrEqual(1);
    }
    expect(stable).not.toContain(
      "RELEASE_INSTALLATION_VERSION_MIN_STABLE: ${{ vars.RELEASE_LAUNCHER_VERSION_MIN_STABLE ||",
    );
    expect(stable).toContain('RELEASE_LEGACY_INSTALLATION_MIGRATION_REQUIRED: "true"');
  });

  it("keeps the frozen Closure compatibility declaration separate from legacy installer migration", async () => {
    const [counted, stable, shared] = await Promise.all([
      readFile(new URL("../../../.github/workflows/distribution-counted.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/workflows/distribution-stable.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../.github/actions/release/closure/shared/action.yml", import.meta.url), "utf8"),
    ]);

    expect(counted).toContain("vars.RELEASE_SHELL_VERSION_MIN_PREVIEW");
    expect(counted).toContain("vars.RELEASE_SHELL_VERSION_MIN_PRERELEASE");
    expect(stable).toContain("min-shell-version: ${{ vars.RELEASE_SHELL_VERSION_MIN_STABLE }}");
    expect(counted).not.toMatch(/CLOSURE_MIN_SHELL_VERSION:.*RELEASE_LAUNCHER_VERSION_MIN/u);
    expect(stable).not.toContain("min-shell-version: ${{ vars.RELEASE_LAUNCHER_VERSION_MIN_STABLE }}");
    expect(shared).toContain("Frozen initial Shell compatibility declaration");
  });
});
