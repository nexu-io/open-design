import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = resolve("..");
const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))));

describe("exact Electron release topology", () => {
  it("cold-restarts after CDP hot update and delegates acceptance checks to tools-release", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const hot = workflow.split("- name: Exercise accepted macOS Shell through CDP hot update")[1]?.split("- name: Install and exercise Windows Electron Shell")[0];
    expect(hot).toBeDefined();
    expect(hot).toMatch(/wait "\$electron_pid"\s+trap - EXIT\s+OD_PACKAGED_E2E_HEADLESS=1 ELECTRON_KIT_SMOKE_EXIT_MS=3000 "\$executable" --user-data-dir="\$RUNNER_TEMP\/electron-user-data"/u);
    expect(hot).not.toContain("python3");
    expect(hot).not.toContain("candidateVersion");
  });

  it("delegates source branch eligibility to tools-release without weakening exact checkout binding", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    expect(workflow).not.toContain('[[ "$SOURCE_REF" =~');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
    expect(workflow).toContain('git ls-remote --refs origin "$SOURCE_REF"');
    expect(workflow).toContain("tools-release.mjs release-policy");
  });

  it("runs the current release matrix on macOS while retaining the deferred Windows declaration", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const convergence = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/convergence-exact.json"), "utf8"));

    expect(workflow).toContain("options: [betahyx]");
    expect(workflow).toContain("electron_scene_darwin_arm64");
    expect(workflow).toContain("electron_scene_win32_x64");
    expect(workflow).toContain("active_topology = [");
    expect(workflow).toContain("deferred_topology = [");
    expect(workflow).toContain('json.dumps({"include": active_topology}');
    const activeTopology = workflow.match(/active_topology = \[([\s\S]*?)\]\n\s+deferred_topology = \[/u)?.[1];
    const deferredTopology = workflow.match(/deferred_topology = \[([\s\S]*?)\]\n\s+root =/u)?.[1];
    expect(activeTopology).toContain('"target": "darwin-arm64"');
    expect(activeTopology).not.toContain("win32-x64");
    expect(activeTopology).not.toContain("windows-2025");
    expect(deferredTopology).toContain('"target": "win32-x64"');
    expect(deferredTopology).toContain('"runs_on": "windows-2025"');
    expect(workflow).toContain("@open-design/shell-electron exact:scene");
    expect(workflow).toContain("@open-design/shell-electron exact:scene-manifest");
    expect(workflow).toContain("@open-design/shell-electron exact:manifest");
    expect(workflow).toContain("@open-design/shell-electron exact:distribution");
    expect(workflow).toContain("@open-design/closure build:resources");
    expect(workflow).toContain("tools/pack/dist/exact-control.mjs");
    expect(workflow).toContain("tools/release/dist/exact-control.mjs");
    expect(workflow).toContain('$RUNNER_TEMP/exact-plan/exact-pack-control.mjs');
    expect(workflow).toContain('$RUNNER_TEMP/exact-plan/exact-release-control.mjs');
    expect(workflow).toContain("PROFILE: ${{ inputs.profile || 'exact-validation' }}");
    expect(workflow).toContain('target:{endpointUrl,bucket,publicBaseUrl,latestChannelHeadUrl:endpointUrl+"/"+bucket+"/"+channel+"/latest/channel-head.json"}');
    for (const capability of ["plan", "prepare", "finalize", "acceptance"]) {
      expect(workflow).toContain(`capability:"${capability}"`);
    }
    expect(workflow).toContain("Install and exercise macOS Electron Shell");
    expect(workflow).toContain("Install and exercise Windows Electron Shell");
    expect(convergence.workflows["release-exact"]).toMatchObject({
      policy: "shell-scenes-v2",
      workloads: {
        terminal_scene_darwin_arm64: { reusable: true },
        electron_scene_darwin_arm64: { runnerClass: "electron_darwin_arm64", reusable: true },
        electron_scene_win32_x64: { runnerClass: "electron_win32_x64", reusable: false },
      },
    });
  });

  it("checks release-neutral scenes by owned fields rather than coincidental version values", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");

    expect(workflow).toContain('release_owned_fields = {"artifactBaseUrl", "channel", "publishedAt", "releaseVersion", "signatures"}');
    expect(workflow).toContain("find_release_owned_fields(scene)");
    expect(workflow).not.toContain('for release_field in (os.environ["RELEASE_VERSION"]');
  });

  it("keeps formal distribution workflows as thin tools-release profile orchestration", async () => {
    const prerelease = await readFile(resolve(workspaceRoot, ".github/workflows/release-prerelease.yml"), "utf8");
    const stable = await readFile(resolve(workspaceRoot, ".github/workflows/release-stable.yml"), "utf8");

    for (const workflow of [prerelease, stable]) {
      expect(workflow).toContain("uses: ./.github/workflows/release-exact.yml");
      expect(workflow).toContain("source_ref: ${{ inputs.source_ref }}");
      expect(workflow).not.toContain("tools/release/");
      expect(workflow).not.toContain("tools/pack/");
    }
    expect(prerelease).toContain("profile: prerelease-distribution");
    expect(prerelease).toContain("end_user_distribution: false");
    expect(stable).toContain("profile: stable-distribution");
    expect(stable).toContain("end_user_distribution: true");
    expect(stable).toContain("stable_authorized: ${{ inputs.confirm_end_user_distribution }}");
  });

  it("uses the TypeScript exact control plane with no temporary Python bridge", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");

    expect(workflow).toContain('"operation": "exact.prepare"');
    expect(workflow).toContain('"operation": "exact.finalize"');
    expect(workflow).toContain('"operation": "exact.publish"');
    expect(workflow).toContain('"operation": "exact.activate"');
    expect(workflow).toContain('"operation": "exact.baseline.promote"');
    expect(workflow).not.toContain(".github/scripts/pack.py");
    expect(workflow).not.toContain(".github/scripts/release.py");
    expect(workflow).not.toContain("installed_acceptance.py");
    expect(workflow).toContain('operation: "exact.acceptance"');
    expect(workflow).not.toContain("node tools/release/src/exact/control-cli.ts");
    expect(workflow).not.toContain("somechan");
    expect(workflow).not.toContain("somepreview");
    expect(workflow).not.toContain('"appId": "io.open-design.betahyx"');
    expect(workflow).not.toContain('"executableName": "open-design-betahyx"');
  });

  it("contains no legacy Electron application or launcher authority", async () => {
    const files = [
      "AGENTS.md",
      ".github/workflows/ci.yml",
      ".github/workflows/release-exact.yml",
      ".github/config/scopes.json",
      ".github/config/convergence.json",
      "scripts/guard.ts",
      "scripts/check-cross-app-imports.ts",
      "pnpm-lock.yaml",
    ];
    const contents = await Promise.all(files.map(async (file) => await readFile(resolve(workspaceRoot, file), "utf8")));
    for (const content of contents) {
      expect(content).not.toMatch(/apps\/(?:desktop|packaged)|@open-design\/(?:desktop|packaged|launcher-proto)|desktop-handoff\.json/u);
    }
  });

  it("binds published macOS platform trust into installed Electron acceptance", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-installed-acceptance-"));
    roots.push(root);
    const publishedRoot = join(root, "published"), installedRoot = join(root, "installed"), acceptanceRoot = join(root, "acceptance");
    await Promise.all([mkdir(publishedRoot), mkdir(installedRoot)]);
    const sourceCommit = "a".repeat(40);
    const shell = { buildHash: "b".repeat(64), type: "electron", version: "1.2.3" };
    const platformTrust = { designatedRequirement: 'identifier "io.open-design.betahyx"', mode: "verify-only", platform: "macos", teamIdentifier: "adhoc" };
    const artifact = { mediaType: "application/x-apple-diskimage", sha256: "c".repeat(64), size: 73, url: "https://release.invalid/app.dmg" };
    const shellMetadata = { sha256: "d".repeat(64), size: 41, url: "https://release.invalid/electron-metadata.json" };
    const installIdentity = { appBundleId: "io.open-design.betahyx", executableName: "open-design-betahyx" };
    const updater = { channel: "betahyx", mechanism: "standalone" };
    const required = { artifact, installIdentity, platformTrust, shell, shellMetadata, target: "darwin-arm64", updater };
    const target = { endpointUrl: "https://storage.invalid", bucket: "release", publicBaseUrl: "https://release.invalid", latestChannelHeadUrl: "https://storage.invalid/release/betahyx/latest/channel-head.json" };
    const publishReceipt = join(publishedRoot, "publish-receipt.json"), policyReceipt = join(root, "policy.json");
    const policyRequest = join(root, "policy-request.json");
    await writeFile(policyRequest, JSON.stringify({ schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation", channel: "betahyx", releaseVersion: "1.2.3-betahyx.4", sourceCommit, sourceRef: "refs/heads/feat/electron", switches: { endUserDistribution: false, stableAuthorized: false }, target }));
    await run(process.execPath, [resolve(workspaceRoot, "tools/release/bin/tools-release.mjs"), "release-policy", "--request", policyRequest, "--receipt", policyReceipt]);
    await writeFile(publishReceipt, JSON.stringify({ schemaVersion: 1, operation: "exact.publish", profile: "exact-validation", channel: "betahyx", releaseVersion: "1.2.3-betahyx.4", sourceCommit, target, requiredAcceptances: [required] }));

    const installedFiles = await Promise.all(["host.mjs", "supervisor.mjs", "content.json", "trust.json", "seed.bin"].map(async (file) => {
      const body = Buffer.from(`installed:${file}`);
      await writeFile(join(installedRoot, file), body);
      return { file, sha256: createHash("sha256").update(body).digest("hex"), size: body.length };
    }));
    await writeFile(join(installedRoot, "standalone-installation.json"), JSON.stringify({
      schemaVersion: 1,
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      target: "darwin-arm64",
      host: installedFiles[0],
      supervisor: installedFiles[1],
      content: installedFiles[2],
      trust: installedFiles[3],
      seeds: [installedFiles[4]],
    }));
    const runtimeLog = join(root, "electron-runtime.jsonl");
    await writeFile(runtimeLog, [
      { attemptId: "acceptance-attempt", event: "startup.committed" },
      { attemptId: "acceptance-attempt", event: "shutdown.complete" },
    ].map((event) => JSON.stringify(event)).join("\n"));

    const acceptanceRequest = join(root, "acceptance-request.json");
    const input = { schemaVersion: 1, operation: "exact.acceptance", publishReceipt, policyReceipt, installedRoot, shellType: "electron", target: "darwin-arm64", runtimeLog };
    const collect = async (value: unknown) => {
      await writeFile(acceptanceRequest, JSON.stringify(value));
      await run(process.execPath, [resolve(workspaceRoot, "tools/release/dist/exact-control.mjs"), "--request", acceptanceRequest, "--receipt", join(acceptanceRoot, "electron-darwin-arm64.json")]);
    };
    await collect(input);
    const credential = JSON.parse(await readFile(join(acceptanceRoot, "electron-darwin-arm64.json"), "utf8"));
    expect(credential).toMatchObject({ artifact, installIdentity, platformTrust, shell, shellMetadata, target: "darwin-arm64", updater });

    const installationPath = join(installedRoot, "standalone-installation.json");
    const installation = JSON.parse(await readFile(installationPath, "utf8"));
    installation.releaseVersion = "1.2.3-betahyx.3";
    await writeFile(installationPath, JSON.stringify(installation));
    const line = (state: string, candidateVersion?: string) => ({
      lines: { closure: { state, ...(candidateVersion == null ? {} : { candidateVersion }) }, shell: { currentVersion: "1.2.3", state: "current" } },
    });
    const hotReceipt = join(root, "electron-cdp-receipt.json");
    await writeFile(hotReceipt, JSON.stringify({
      schemaVersion: 1, operation: "electron.cdp.contract.invoked", discoveryUrl: "http://127.0.0.1:9222",
      results: [line("idle"), line("ready", "1.2.3-betahyx.4"), { outcome: "context-destroyed" }, line("idle")],
    }));
    const generationId = "e".repeat(64);
    const standaloneState = join(root, "standalone-state.json"), standaloneGenerations = join(root, "standalone-generations");
    await mkdir(standaloneGenerations);
    await writeFile(standaloneState, JSON.stringify({
      schemaVersion: 4, active: generationId, lastHealthy: generationId, prepared: null,
      activationIntent: null, activationAttempt: null, revision: 7,
    }));
    await writeFile(join(standaloneGenerations, `${generationId}.json`), JSON.stringify({
      schemaVersion: 4, id: generationId, channel: "betahyx", releaseVersion: "1.2.3-betahyx.4",
    }));
    await collect({ ...input, hotAcceptanceReceipt: hotReceipt, standaloneState, standaloneGenerationsRoot: standaloneGenerations });
    const hotCredential = JSON.parse(await readFile(join(acceptanceRoot, "electron-darwin-arm64.json"), "utf8"));
    expect(hotCredential.installed.proof).toMatchObject({
      baselineReleaseVersion: "1.2.3-betahyx.3",
      hotUpdate: { releaseVersion: "1.2.3-betahyx.4", discoveryUrl: "http://127.0.0.1:9222", generationId },
    });
  });
});
