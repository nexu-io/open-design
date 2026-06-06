import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const releaseBetaSelfHostedWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta-s.yml");
const releasePreviewWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-preview.yml");
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");
const releaseStableScriptPath = join(workspaceRoot, "scripts", "release-stable.ts");
const releasePublishBetaMetadataScriptPath = join(
  workspaceRoot,
  ".github",
  "workflow",
  "scripts",
  "release",
  "storage",
  "publish-beta-metadata.ts",
);
const releaseBetaPosixBuildScriptPath = join(workspaceRoot, ".github", "workflow", "scripts", "release", "build-platform.sh");
const releaseBetaWindowsBuildScriptPath = join(workspaceRoot, ".github", "workflow", "scripts", "release", "build-platform.ps1");
const releaseBetaPlatformPublishScriptPath = join(
  workspaceRoot,
  ".github",
  "workflow",
  "scripts",
  "release",
  "storage",
  "publish-platform.ts",
);

describe("packaged smoke workflow", () => {
  it("[P2] keeps packaged smoke outside the main CI gate", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    expect(workflow).not.toContain("packaged_smoke_");
    expect(workflow).not.toContain("Build PR mac artifacts");
    expect(workflow).not.toContain("Build PR windows artifacts");
    expect(workflow).not.toContain("Build PR linux headless artifacts");
    expect(workflow).not.toContain("Smoke PR mac packaged runtime");
    expect(workflow).not.toContain("Smoke PR windows packaged runtime");
    expect(workflow).not.toContain("Smoke PR linux headless packaged runtime");
    expect(workflow).not.toContain("OD_PACKAGED_E2E_");
    expect(workflow).not.toContain("actions/cache/save");
  });

  it("[P2] preserves beta linux AppImage smoke reports for platform publication", async () => {
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(/- name: Build beta linux_x64\n(?:.+\n)+?(?=\n      - name: Write linux_x64 release report)/m);
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain("RELEASE_TARGET: linux_x64");
    expect(linuxBuildStep?.[0]).toContain("RELEASE_REPORT_DIR: ${{ runner.temp }}/release-report/linux_x64");
    expect(linuxBuildStep?.[0]).toContain("bash .github/workflow/scripts/release/build-platform.sh");
    expect(workflow).toContain("Write linux_x64 release report");
    expect(workflow).toContain("RELEASE_REPORT_JSON_PATH: ${{ runner.temp }}/release-report/linux_x64/report.json");
    expect(workflow).toContain("Prepare linux_x64 assets");
    expect(workflow).toContain("Publish linux_x64 platform");
    expect(workflow).toContain("Upload linux_x64 publish manifest");
    expect(workflow).toContain("open-design-beta-linux-x64-publish-manifest");
    expect(workflow).toContain("Download linux_x64 publish manifest");
    expect(workflow).not.toContain(".github/scripts/release/assets/linux.sh");
    expect(workflow).not.toContain(".github/scripts/release/r2/publish-platform.ts");
  });

  it("[P2] preserves stable linux AppImage smoke reports for release publication", async () => {
    const workflow = await readFile(releaseStableWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(
      /- name: Build release linux artifacts\n(?:.+\n)+?(?=\n      - name: Smoke release linux AppImage runtime)/m,
    );
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain(
      'node -e \'const fs = require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));\' "$build_json_path"',
    );
    expect(workflow).toContain("Smoke release linux AppImage runtime");
    expect(workflow).toContain("manifest.json");
    expect(workflow).toContain("tools-pack.json");
    expect(workflow).toContain("Upload linux e2e spec report");
    expect(workflow).toContain("open-design-release-linux-e2e-report");
    expect(workflow).toContain("Download linux e2e spec report");
    expectReleaseLinuxBuildPreservesEvidence(workflow, "Build release linux artifacts");
    expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow, "Smoke release linux AppImage runtime");
  });

  it("[P2] keeps release namespaces aligned with release channels", async () => {
    const [releaseStableWorkflow, releaseStableScript, releasePreviewWorkflow, releaseBetaWorkflow] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
      readFile(releasePreviewWorkflowPath, "utf8"),
      readFile(releaseBetaWorkflowPath, "utf8"),
    ]);

    expect(releaseStableScript).toContain('const mac = channel === "nightly" ? "release-nightly" : "release-stable";');
    expect(releaseStableScript).toContain('setOutput("namespace", namespaces.mac);');
    expect(releaseStableScript).toContain('setOutput("mac_intel_namespace", namespaces.macIntel);');
    expect(releaseStableScript).toContain('setOutput("win_namespace", namespaces.win);');
    expect(releaseStableScript).toContain('setOutput("linux_namespace", namespaces.linux);');

    expect(releaseStableWorkflow).toContain("namespace: ${{ steps.stable.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain("mac_intel_namespace: ${{ steps.stable.outputs.mac_intel_namespace }}");
    expect(releaseStableWorkflow).toContain("win_namespace: ${{ steps.stable.outputs.win_namespace }}");
    expect(releaseStableWorkflow).toContain("linux_namespace: ${{ steps.stable.outputs.linux_namespace }}");
    expect(releaseStableWorkflow).toContain('--namespace "${{ needs.metadata.outputs.namespace }}"');
    expect(releaseStableWorkflow).toContain("OD_PACKAGED_E2E_NAMESPACE: ${{ needs.metadata.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain("TOOLS_PACK_NAMESPACE: ${{ needs.metadata.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain('"--namespace", "${{ needs.metadata.outputs.win_namespace }}",');
    expect(releaseStableWorkflow).toContain('OD_PACKAGED_E2E_NAMESPACE: ${{ needs.metadata.outputs.win_namespace }}');
    expect(releaseStableWorkflow).toContain('TOOLS_PACK_NAMESPACE: ${{ needs.metadata.outputs.win_namespace }}');
    expect(releaseStableWorkflow).toContain('--namespace "${{ needs.metadata.outputs.linux_namespace }}"');
    expect(releaseStableWorkflow).toContain('"namespace": "${{ needs.metadata.outputs.linux_namespace }}",');
    expect(releaseStableWorkflow).not.toMatch(/--namespace release-stable(?:-intel|-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/OD_PACKAGED_E2E_NAMESPACE: release-stable(?:-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/TOOLS_PACK_NAMESPACE: release-stable(?:-intel|-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/namespaces\/release-stable(?:-intel|-win|-linux)?\b/);

    expectChannelWorkflowNamespaces(releasePreviewWorkflow, "preview", { hasLinuxSmoke: false });
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-win");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_NAMESPACE: release-beta-linux");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: win_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: mac_x64");
    expect(releaseBetaWorkflow).toContain("RELEASE_TARGET: linux_x64");
    const betaBuildScript = await readFile(releaseBetaPosixBuildScriptPath, "utf8");
    expect(betaBuildScript).toContain("OD_PACKAGED_E2E_RELEASE_CHANNEL=beta");
    expect(betaBuildScript).toContain('OD_PACKAGED_E2E_RELEASE_VERSION="$RELEASE_VERSION"');
  });

  it("keeps the self-hosted beta lane metadata-driven with reusable platform publish scripts", async () => {
    const [workflow, posixBuildScript, windowsBuildScript, platformPublishScript, publishBetaMetadataScript] = await Promise.all([
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseBetaPosixBuildScriptPath, "utf8"),
      readFile(releaseBetaWindowsBuildScriptPath, "utf8"),
      readFile(releaseBetaPlatformPublishScriptPath, "utf8"),
      readFile(releasePublishBetaMetadataScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("enable_win_x64:");
    expect(workflow).toContain("enable_mac_arm64:");
    expect(workflow).toContain("enable_mac_x64:");
    expect(workflow).toContain("enable_linux_x64:");
    expect(workflow).toMatch(/enable_win_x64:[\s\S]*?default: true/);
    expect(workflow).toMatch(/enable_mac_arm64:[\s\S]*?default: true/);
    expect(workflow).toMatch(/publish:[\s\S]*?default: true/);
    expect(workflow).toMatch(/release_public_origin:[\s\S]*?default: "https:\/\/s3\.nexu\.space\/od-releases"/);
    expect(workflow).toContain("win_x64_smoke_mode:");
    expect(workflow).toContain("win_x64_target:");
    expect(workflow).toContain("win_x64_update_metadata_url:");
    expect(workflow).toContain("win_x64_update_target_version:");
    expect(workflow).toContain("mac_arm64_sign_mode:");
    expect(workflow).toContain("mac_arm64_smoke_mode:");
    expect(workflow).toMatch(/win_x64_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
    expect(workflow).toMatch(/mac_arm64_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
    expect(workflow).toMatch(/win_x64_sign_mode:[\s\S]*?options:[\s\S]*?- "off"[\s\S]*?- "on"[\s\S]*?default: "off"/);
    expect(workflow).toMatch(/mac_arm64_sign_mode:[\s\S]*?options:[\s\S]*?- "no"[\s\S]*?- "sign-only"[\s\S]*?- "notarize"[\s\S]*?default: "sign-only"/);
    expect(workflow).not.toContain("win_enable:");
    expect(workflow).not.toContain("mac_enable:");
    expect(workflow).not.toMatch(/^      enable_win:/m);
    expect(workflow).not.toMatch(/^      enable_mac:/m);
    expect(workflow).not.toMatch(/^      sign_mode:/m);
    expect(workflow).not.toMatch(/^      smoke_mode:/m);
    expect(workflow).not.toMatch(/^      update_metadata_url:/m);
    expect(workflow).not.toMatch(/^      update_target_version:/m);
    expect(workflow).toContain("name: Prepare beta metadata");
    expect(workflow).toContain("OPEN_DESIGN_BETA_METADATA_URL: ${{ inputs.release_public_origin }}/beta/latest/metadata.json");
    expect(workflow).toContain("OPEN_DESIGN_STABLE_METADATA_URL: https://releases.open-design.ai/stable/latest/metadata.json");
    expect(workflow).toContain('repo_dir="$PWD/_release-metadata"');
    expect(workflow).toContain("--filter=blob:none --depth=1");
    expect(workflow).toContain("for attempt in 1 2 3");
    expect(workflow).toContain("working-directory: _release-metadata");
    expect(workflow).toContain("apps/packaged/package.json");
    expect(workflow).toContain("scripts/release-beta.ts");
    expect(workflow).not.toContain('git fetch --force --depth=1 origin "+refs/tags/open-design-v*:refs/tags/open-design-v*"');
    expect(workflow).toContain("release-beta-s requires at least one target to be enabled");
    expect(workflow).toContain("beta_version: ${{ inputs.publish && steps.reserve.outputs.beta_version || inputs.release_version != '' && inputs.release_version || steps.beta.outputs.beta_version }}");
    expect(workflow).toContain("if: ${{ inputs.publish }}");
    expect(workflow).toContain("Reject unsupported self-hosted mac_x64");
    expect(workflow).toContain("Reject unsupported self-hosted linux_x64");
    expect(workflow).toContain("name: Probe Windows signing capability");
    expect(workflow).toContain("probe-win-signing.ps1");
    expect(workflow).toContain("needs: metadata");
    expect(workflow).toContain('-ReleaseTarget win_x64');
    expect(workflow).toContain('-ReleaseVersion "${{ needs.metadata.outputs.beta_version }}"');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNING_ENABLED: ${{ steps.sign_probe.outputs.enabled }}');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNING_PROBED: ${{ steps.sign_probe.outputs.probed }}');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNTOOL_PATH: ${{ steps.sign_probe.outputs.signtool_path }}');
    expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL: ${{ inputs.win_x64_update_metadata_url }}");
    expect(workflow).toContain("OD_PACKAGED_E2E_WIN_UPDATE_VERSION: ${{ inputs.win_x64_update_target_version }}");
    expect(windowsBuildScript).toContain('"pnpm.cmd", "exec", "tools-pack", "win", "build"');
    expect(windowsBuildScript).toContain('if ($SmokeMode -eq "full" -and -not $hasExternalUpdateMetadata -and -not $hasExternalUpdateArtifactPair)');
    expect(windowsBuildScript).not.toContain("fnm");
    expect(windowsBuildScript).not.toContain("RUNNER_TEMP");
    expect(windowsBuildScript).not.toContain("GITHUB_OUTPUT");
    expect(windowsBuildScript).not.toContain("GITHUB_STEP_SUMMARY");
    expect(posixBuildScript).toContain("RELEASE_TARGET");
    expect(posixBuildScript).toContain("REQUIRE_VELA_CLI");
    expect(posixBuildScript).toContain('--cache-dir "$TOOLS_PACK_CACHE_DIR"');
    expect(posixBuildScript).not.toContain("OPEN_DESIGN_RELEASE_PROFILE");
    expect(posixBuildScript).not.toContain("corepack prepare");
    expect(posixBuildScript).not.toContain("RUNNER_TEMP");
    expect(workflow).toContain("Publish win_x64 platform");
    expect(workflow).toContain(".github\\workflow\\scripts\\release\\storage\\publish-platform.ts");
    expect(workflow).toContain("Write win_x64 release report");
    expect(workflow).toContain("RELEASE_REPORT_DIR: C:\\.tmp\\runner\\od-beta\\win_x64\\release-report\\win_x64");
    expect(posixBuildScript).toContain('OD_PACKAGED_E2E_MAC_SMOKE_PROFILE="$RELEASE_SMOKE_MODE"');
    expect(workflow).toContain("runs-on: [self-hosted, macOS, ARM64, nexu-mac, release-beta]");
    expect(workflow).toContain("path: _release-build");
    expect(workflow).toContain("working-directory: _release-build");
    expect(workflow).toContain("fnm exec --using=24 -- bash .github/workflow/scripts/release/build-platform.sh");
    expect(workflow).toContain("MAC_TOOLS_PACK_CACHE_DIR: /Users/runner/.tmp/runner/od-beta/mac_arm64/tools-pack-cache");
    expect(workflow).toContain("MAC_TOOLS_PACK_DIR: /Users/runner/.tmp/runner/od-beta/mac_arm64/tools-pack");
    expect(workflow).toContain("TOOLS_PACK_CACHE_DIR: ${{ env.MAC_TOOLS_PACK_CACHE_DIR }}");
    expect(workflow).toContain("TOOLS_PACK_DIR: ${{ env.MAC_TOOLS_PACK_DIR }}");
    expect(workflow).toContain("Write mac_arm64 release report");
    expect(workflow).toContain("fnm exec --using=24 -- node --experimental-strip-types .github/workflow/scripts/release/report/write-report.ts");
    expect(workflow).toContain("Prepare mac_arm64 assets");
    expect(workflow).toContain("RELEASE_TARGET: mac_arm64");
    expect(workflow).toContain("RELEASE_SIGNED: ${{ inputs.mac_arm64_sign_mode != 'no' && 'true' || 'false' }}");
    expect(workflow).toContain("RELEASE_REPORT_ZIP_PATH: ${{ runner.temp }}/release-report/mac_arm64-report.zip");
    expect(workflow).toContain("name: Publish beta metadata to Nexu S3");
    expect(workflow).toContain("Download mac_arm64 platform manifest");
    expect(workflow).toContain("Download win_x64 platform manifest");
    expect(workflow).toContain('manifest_url="${RELEASE_PUBLIC_ORIGIN%/}/beta/versions/${RELEASE_VERSION}${RELEASE_ASSET_SUFFIX}/platforms/${RELEASE_TARGET}.json"');
    expect(workflow).toContain('curl -fsSL "$manifest_url" -o "$RELEASE_MANIFEST_DIR/$RELEASE_TARGET.json"');
    expect(workflow).toContain(".github/workflow/scripts/release/storage/publish-beta-metadata.ts");
    expect(workflow).toContain("RELEASE_ASSET_SUFFIX: auto");
    expect(workflow).toContain("RELEASE_MANIFEST_DIR: ${{ runner.temp }}/release-platform-manifests");
    expect(workflow).toContain("-IncludeZip $${{ inputs.win_x64_target == 'all' || inputs.win_x64_target == 'zip' }}");
    expect(workflow).toContain("release-beta-s publish requires win_x64_target=nsis or all");
    expect(workflow).not.toContain("open-design-beta-s-win-x64-publish-manifest");
    expect(workflow).not.toContain("open-design-beta-s-mac-arm64-publish-manifest");
    expect(workflow).toContain('STATE_SOURCE: ${{ needs.metadata.outputs.state_source }}');
    expect(workflow).toContain("Verify beta metadata");
    expect(workflow).toContain(".github/workflow/scripts/release/storage/verify-beta-metadata.ts");
    expect(publishBetaMetadataScript).toContain("validateManifest");
    expect(publishBetaMetadataScript).toContain("manifest.releaseVersion !== releaseVersion");
    expect(publishBetaMetadataScript).toContain("manifest.github?.runId !== currentRunId");
    expect(publishBetaMetadataScript).not.toContain("manifest.github?.runAttempt !== currentRunAttempt");
    expect(publishBetaMetadataScript).toContain("manifest.github?.commit !== currentCommit");
    expect(publishBetaMetadataScript).toContain("manifest.platformKey !== target");
    expect(publishBetaMetadataScript).toContain("manifest.r2.versionPrefix.includes(`/versions/${releaseVersion}`)");
    expect(publishBetaMetadataScript).toContain('if (assetVersionSuffix === "auto")');
    expect(publishBetaMetadataScript).toContain('assetVersionSuffix = allReadyTargetsSigned ? ".signed" : ".unsigned";');
    expect(publishBetaMetadataScript).toContain("const feedVersionPrefix = manifest.r2?.versionPrefix;");
    expect(publishBetaMetadataScript).toContain("refusing stale ${def.target} platform manifest");
    expect(publishBetaMetadataScript).toContain("publishLatestPlatformObjects");
    expect(platformPublishScript).not.toContain("await upload(join(releaseAssetsDir, name), `${latestPrefix}/${name}`");
    expect(platformPublishScript).not.toContain("await upload(manifestPath, `${latestPrefix}/platforms/${target}.json`");
    expect(platformPublishScript).toContain('const target = requiredTarget();');
    expect(platformPublishScript).toContain("legacyPlatformKey");
    expect(workflow).not.toContain("win_enable:");
    expect(workflow).not.toContain("mac_enable:");
    expect(workflow).not.toContain(".github/scripts/release/build-mac.sh");
    expect(workflow).not.toContain(".github/scripts/release/r2/publish-platform.ts");
    expect(workflow).not.toContain("publish-beta-metadata.ps1");
    expect(workflow).not.toContain("probe-beta-public-read.ps1");
    expect(workflow).not.toContain("publish-beta.ps1 -IndexPath");
  });

  it("rejects stale latest platform manifests from a previous beta version", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.3.unsigned/Open Design Beta.dmg",
          },
        },
        channel: "beta",
        github: {
          commit: "current-sha",
          runAttempt: 2,
          runId: 222222222,
        },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        releaseTarget: "mac_arm64",
        r2: {
          versionPrefix: "beta/versions/1.2.3-beta.3.unsigned",
        },
        releaseVersion: "1.2.3-beta.3",
        signed: false,
        status: "published",
      },
          null,
          2,
        )}\n`,
      );
      const result = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", releasePublishBetaMetadataScriptPath],
        {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            BASE_VERSION: "1.2.3",
            ENABLE_LINUX_X64: "false",
            ENABLE_MAC_ARM64: "true",
            ENABLE_MAC_X64: "false",
            ENABLE_WIN_X64: "false",
            RELEASE_RUN_ATTEMPT: "2",
            RELEASE_RUN_ID: "222222222",
            RELEASE_COMMIT: "current-sha",
            MAC_ARM64_RESULT: "success",
            RELEASE_CHANNEL: "beta",
            RELEASE_MANIFEST_DIR: platformManifestRoot,
            RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
            RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
            RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
            RELEASE_SIGNED: "false",
            RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
            RELEASE_STORAGE_BUCKET: fixture.bucket,
            RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
            RELEASE_STORAGE_REGION: "auto",
            RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
            RELEASE_VERSION: "1.2.3-beta.4",
            STATE_SOURCE: "test",
          },
          maxBuffer: 1024 * 1024,
        },
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ reason, status: "rejected" as const }),
      );

      expect(result.status).toBe("rejected");
      expect(String(result.status === "rejected" ? result.reason : "")).toContain(
        "refusing stale mac_arm64 platform manifest for 1.2.3-beta.4: releaseVersion=1.2.3-beta.3",
      );
      expect(fixture.uploadedObjectKeys()).toEqual([]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("rejects stale latest platform manifests from a previous same-version beta workflow run", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/Open Design Beta.dmg",
          },
        },
        channel: "beta",
        github: {
          commit: "previous-sha",
          runAttempt: 1,
          runId: 111111111,
        },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        releaseTarget: "mac_arm64",
        r2: {
          versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
        },
        releaseVersion: "1.2.3-beta.4",
        signed: false,
        status: "published",
      },
          null,
          2,
        )}\n`,
      );
      const result = await execFileAsync(
        process.execPath,
        ["--experimental-strip-types", releasePublishBetaMetadataScriptPath],
        {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            BASE_VERSION: "1.2.3",
            ENABLE_LINUX_X64: "false",
            ENABLE_MAC_ARM64: "true",
            ENABLE_MAC_X64: "false",
            ENABLE_WIN_X64: "false",
            RELEASE_RUN_ATTEMPT: "2",
            RELEASE_RUN_ID: "222222222",
            RELEASE_COMMIT: "current-sha",
            MAC_ARM64_RESULT: "success",
            RELEASE_CHANNEL: "beta",
            RELEASE_MANIFEST_DIR: platformManifestRoot,
            RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
            RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
            RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
            RELEASE_SIGNED: "false",
            RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
            RELEASE_STORAGE_BUCKET: fixture.bucket,
            RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
            RELEASE_STORAGE_REGION: "auto",
            RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
            RELEASE_VERSION: "1.2.3-beta.4",
            STATE_SOURCE: "test",
          },
          maxBuffer: 1024 * 1024,
        },
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ reason, status: "rejected" as const }),
      );

      expect(result.status).toBe("rejected");
      expect(String(result.status === "rejected" ? result.reason : "")).toContain(
        "refusing stale mac_arm64 platform manifest for 1.2.3-beta.4: github.runId=111111111",
      );
      expect(fixture.uploadedObjectKeys()).toEqual([]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("accepts same-run latest platform manifests from an older workflow attempt", async () => {
    const fixture = await startReleaseMetadataObjectStore({});
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "mac_arm64.json"),
        `${JSON.stringify(
          {
        artifacts: {
          dmg: {
            url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/Open Design Beta.dmg",
          },
        },
        channel: "beta",
        github: {
          commit: "current-sha",
          runAttempt: 1,
          runId: 222222222,
        },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        releaseTarget: "mac_arm64",
        r2: {
          versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
        },
        releaseVersion: "1.2.3-beta.4",
        signed: false,
        status: "published",
      },
          null,
          2,
        )}\n`,
      );
      await execFileAsync(process.execPath, ["--experimental-strip-types", releasePublishBetaMetadataScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "true",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "false",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          MAC_ARM64_RESULT: "success",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
          RELEASE_SIGNED: "false",
          RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
          RELEASE_STORAGE_BUCKET: fixture.bucket,
          RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
          RELEASE_VERSION: "1.2.3-beta.4",
          STATE_SOURCE: "test",
        },
        maxBuffer: 1024 * 1024,
      });

      expect(fixture.uploadedObjectKeys()).toEqual([
        "beta/versions/1.2.3-beta.4/metadata.json",
        "beta/latest/metadata.json",
        "beta/latest/platforms/mac_arm64.json",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("resolves auto asset suffix from target-first win_x64 platform manifests in beta metadata publish", async () => {
    const fixture = await startReleaseMetadataObjectStore({
      "beta/versions/1.2.3-beta.4.unsigned/latest.yml": "versioned updater feed",
    });
    const runnerTemp = await mkdtemp(join(tmpdir(), "od-release-beta-win-metadata-"));
    const platformManifestRoot = join(runnerTemp, "release-platform-manifests");

    try {
      await mkdir(platformManifestRoot, { recursive: true });
      await writeFile(
        join(platformManifestRoot, "win_x64.json"),
        `${JSON.stringify(
          {
            artifacts: {
              installer: {
                url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/open-design-1.2.3-beta.4.unsigned-win-x64-setup.exe",
              },
            },
            channel: "beta",
            github: {
              commit: "current-sha",
              runAttempt: 2,
              runId: 222222222,
            },
            legacyPlatformKey: "win",
            feed: {
              name: "latest.yml",
              url: "https://releases.open-design.ai/beta/versions/1.2.3-beta.4.unsigned/latest.yml",
            },
            platform: "win",
            platformKey: "win_x64",
            releaseTarget: "win_x64",
            releaseVersion: "1.2.3-beta.4",
            r2: {
              versionPrefix: "beta/versions/1.2.3-beta.4.unsigned",
            },
            signed: false,
            status: "published",
          },
          null,
          2,
        )}\n`,
      );

      await execFileAsync(process.execPath, ["--experimental-strip-types", releasePublishBetaMetadataScriptPath], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "false",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          RELEASE_RUN_ATTEMPT: "2",
          RELEASE_RUN_ID: "222222222",
          RELEASE_COMMIT: "current-sha",
          RELEASE_ASSET_SUFFIX: "auto",
          RELEASE_CHANNEL: "beta",
          RELEASE_MANIFEST_DIR: platformManifestRoot,
          RELEASE_METADATA_DIR: join(runnerTemp, "release-metadata"),
          RELEASE_OUTPUTS_PATH: join(runnerTemp, "release-metadata", "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
          RELEASE_SIGNED: "false",
          RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
          RELEASE_STORAGE_BUCKET: fixture.bucket,
          RELEASE_STORAGE_ENDPOINT: fixture.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
          RELEASE_VERSION: "1.2.3-beta.4",
          STATE_SOURCE: "test",
          WIN_X64_RESULT: "success",
        },
        maxBuffer: 1024 * 1024,
      });

      const metadata = JSON.parse(await readFile(join(runnerTemp, "release-metadata", "metadata.json"), "utf8"));
      expect(metadata.assetVersionSuffix).toBe(".unsigned");
      expect(metadata.readyTargets).toEqual(["win_x64"]);
      expect(metadata.platforms.win.r2.versionPrefix).toBe("beta/versions/1.2.3-beta.4.unsigned");
      expect(metadata.releaseTargets.win_x64.r2.versionPrefix).toBe("beta/versions/1.2.3-beta.4.unsigned");
      expect(fixture.uploadedObjectKeys()).toEqual([
        "beta/versions/1.2.3-beta.4.unsigned/metadata.json",
        "beta/latest/metadata.json",
        "beta/latest/platforms/win_x64.json",
        "beta/latest/latest.yml",
      ]);
    } finally {
      await fixture.close();
      await rm(runnerTemp, { force: true, recursive: true });
    }
  });

  it("keeps beta runner bootstrap in workflows instead of release scripts", async () => {
    const [workflow, posixBuildScript, winBuildScript] = await Promise.all([
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseBetaPosixBuildScriptPath, "utf8"),
      readFile(releaseBetaWindowsBuildScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("fnm exec --using=24 -- bash .github/workflow/scripts/release/build-platform.sh");
    expect(workflow).toContain('& "C:\\Users\\runner\\.cargo\\bin\\fnm.exe" exec --using=24 -- pwsh -NoProfile -File .\\.github\\workflow\\scripts\\release\\build-platform.ps1');
    expect(workflow).toContain("corepack prepare pnpm@10.33.2 --activate");
    expect(workflow).toContain('pnpm.cmd install --frozen-lockfile --prefer-offline');
    expect(workflow).toContain("sudo -n \"$OPEN_DESIGN_MAC_SIGNING_HELPER\" \"$cert_path\" \"$password_path\"");
    expect(workflow).not.toContain("PATH: /usr/local/libexec/open-design/wrappers:${{ env.PATH }}");
    expect(posixBuildScript).not.toContain("fnm");
    expect(posixBuildScript).not.toContain("corepack");
    expect(posixBuildScript).not.toContain("pnpm install");
    expect(winBuildScript).not.toContain("fnm");
    expect(winBuildScript).not.toContain("corepack");
    expect(winBuildScript).not.toContain("pnpm install");
  });
});

function expectChannelWorkflowNamespaces(
  workflow: string,
  channel: "beta" | "preview",
  options: { hasLinuxSmoke: boolean },
): void {
  const namespace = `release-${channel}`;
  expect(workflow).toContain(`--namespace ${namespace}`);
  expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}`);
  expect(workflow).toContain(`--namespace ${namespace}-intel`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}-intel`);
  expect(workflow).toContain(`"--namespace", "${namespace}-win",`);
  expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}-win`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}-win`);
  expect(workflow).toContain(`--namespace ${namespace}-linux`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}-linux`);

  if (options.hasLinuxSmoke) {
    expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}-linux`);
  }
}

function expectReleaseLinuxBuildPreservesEvidence(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n(?:.+\\n)+?(?=\\n      - name: Smoke .+ linux AppImage runtime)`, "m"))?.[0];
  expect(step).toBeDefined();
  expect(step).toContain('report_dir="$RUNNER_TEMP/release-report/linux"');
  expect(step).toContain('mkdir -p "$report_dir"');
  expect(step).toContain('build_json_path="$report_dir/tools-pack.json"');
  expect(step).toContain('build_log_path="$report_dir/tools-pack.log"');
  expect(step).toContain('printf \'%s\\n\' "$build_output" | tee "$build_json_path"');
}

function expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n(?:.+\\n)+?(?=\\n      - name: Upload linux e2e spec report)`, "m"))?.[0];
  expect(step).toBeDefined();
  const aptIndex = step?.indexOf("sudo apt-get update") ?? -1;
  const reportDirIndex = step?.indexOf('report_dir="$RUNNER_TEMP/release-report/linux"') ?? -1;

  expect(aptIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeLessThan(aptIndex);
}

async function startReleaseMetadataObjectStore(objects: Record<string, unknown>): Promise<{
  bucket: string;
  close: () => Promise<void>;
  endpointUrl: string;
  uploadedObjectKeys: () => string[];
}> {
  const bucket = "release-bucket";
  const uploadedObjectKeys: string[] = [];
  const server = createServer((request, response) => {
    void handleReleaseMetadataObjectStoreRequest(request, response, bucket, objects, uploadedObjectKeys);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("release metadata object store did not bind to a TCP port");
  }

  return {
    bucket,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error == null ? resolve() : reject(error)));
      }),
    endpointUrl: `http://127.0.0.1:${address.port}`,
    uploadedObjectKeys: () => [...uploadedObjectKeys],
  };
}

async function handleReleaseMetadataObjectStoreRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bucket: string,
  objects: Record<string, unknown>,
  uploadedObjectKeys: string[],
): Promise<void> {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const bucketPrefix = `/${bucket}/`;
  if (!path.startsWith(bucketPrefix)) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }

  const objectKey = decodeURIComponent(path.slice(bucketPrefix.length));
  if (request.method === "GET") {
    if (!(objectKey in objects)) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    const body = JSON.stringify(objects[objectKey]);
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(body);
    return;
  }

  if (request.method === "PUT") {
    uploadedObjectKeys.push(objectKey);
    for await (const _chunk of request) {
      // Drain the request body so the client can complete cleanly.
    }
    response.statusCode = 200;
    response.end("ok");
    return;
  }

  response.statusCode = 405;
  response.end("method not allowed");
}
