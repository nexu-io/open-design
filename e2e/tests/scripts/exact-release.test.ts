import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = resolve("..");
const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))));

describe("exact Electron release topology", () => {
  it("preserves native scene inputs through the actual convergence ZIP normalizer", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-scene-transport-")); roots.push(root);
    const scene = join(root, "source"); await mkdir(join(scene, "platform"), { recursive: true });
    await writeFile(join(scene, "scene.json"), "{}");
    await writeFile(join(scene, "platform", ".lock"), "locked");
    await writeFile(join(scene, "platform", "node"), "native");
    await chmod(join(scene, "platform", "node"), 0o755);
    const cli = resolve(workspaceRoot, "tools/release/dist/exact-control.mjs");
    await run(process.execPath, [cli, "scene", "pack", "--scene", scene, "--output", join(root, "scene.tar")]);
    await run("python3", ["-c", [
      "import sys, zipfile",
      "from pathlib import Path",
      "sys.path.insert(0, sys.argv[1])",
      "from convergence import normalize_product_archive",
      "root = Path(sys.argv[2])",
      "with zipfile.ZipFile(root / 'github.zip', 'w') as archive: archive.write(root / 'scene.tar', 'scene.tar')",
      "normalize_product_archive(root / 'github.zip', root / 'r2.zip')",
      "with zipfile.ZipFile(root / 'r2.zip') as archive: archive.extractall(root / 'download')",
    ].join("\n"), resolve(workspaceRoot, ".github/scripts"), root]);
    expect(await readFile(join(root, "download", "scene.tar"))).toEqual(await readFile(join(root, "scene.tar")));
    await run(process.execPath, [cli, "scene", "unpack", "--archive", join(root, "download", "scene.tar"), "--output", join(root, "restored")]);
    expect(await readFile(join(root, "restored/platform/.lock"), "utf8")).toBe("locked");
    if (process.platform !== "win32") expect((await stat(join(root, "restored/platform/node"))).mode & 0o777).toBe(0o755);
  });
  it("cold-restarts after CDP hot update and delegates acceptance checks to tools-release", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const hot = workflow.split("- name: Exercise accepted macOS Shell through CDP hot update")[1]?.split("- name: Install and exercise Windows Electron Shell")[0];
    expect(hot).toBeDefined();
    expect(hot).toMatch(/wait "\$electron_pid"\s+trap - EXIT\s+OD_PACKAGED_E2E_HEADLESS=1 ELECTRON_KIT_SMOKE_EXIT_MS=3000 "\$executable" --user-data-dir="\$RUNNER_TEMP\/electron-user-data"/u);
    expect(hot).not.toContain("python3");
    expect(hot).not.toContain("candidateVersion");
    expect(hot).toContain('CHANNEL: ${{ inputs.channel }}');
    expect(hot).toContain('exact-release-control.mjs" acceptance hot-update');
    expect(hot).toContain('--od-channel-head-url="$ELECTRON_CANDIDATE_HEAD_URL"');
    expect(hot).not.toContain("DevToolsActivePort");
  });

  it("delegates source branch eligibility to tools-release without weakening exact checkout binding", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    expect(workflow).not.toContain('[[ "$SOURCE_REF" =~');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"');
    expect(workflow).toContain('git ls-remote --refs origin "$SOURCE_REF"');
    expect(workflow).toContain("exact-control.mjs policy resolve");
  });

  it("runs the current release matrix on macOS while retaining the deferred Windows declaration", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const convergence = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/convergence-exact.json"), "utf8"));

    expect(workflow).toContain("options: [betahyx]");
    expect(workflow).toContain('exact-release-control.mjs" topology');
    expect(workflow).toContain('--declaration .github/config/exact-topology.json');
    expect(workflow).not.toContain("electron_actions =");
    const topology = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/exact-topology.json"), "utf8"));
    expect(topology.active.map((value: { shell: string; target: string }) => [value.shell, value.target])).toEqual([["terminal", "darwin-arm64"], ["electron", "darwin-arm64"]]);
    expect(topology.active.every((value: { runs_on: string }) => value.runs_on === "macos-15")).toBe(true);
    expect(topology.deferred).toEqual([{ shell: "electron", target: "win32-x64", workload: "electron_scene_win32_x64", runner_class: "electron_win32_x64", runs_on: "windows-2025" }]);
    expect(workflow).toContain("@open-design/tools-release exec tools-release build scene");
    expect(workflow).toContain('exact-release-control.mjs" build distribution');
    expect(workflow).not.toContain("exact-scene-request.json");
    expect(workflow).not.toContain("distribution-request.json");
    expect(workflow).not.toMatch(/@open-design\/shell-electron exact:|manifest-request|shellManifestFile|releaseManifestFile/u);
    expect(workflow).toContain("@open-design/closure build:resources");
    expect(workflow).not.toContain("tools/pack/dist/exact-control.mjs");
    expect(workflow).toContain("tools/release/dist/exact-control.mjs");
    expect(workflow).not.toContain("exact-pack-control.mjs");
    expect(workflow).toContain('$RUNNER_TEMP/exact-plan/exact-release-control.mjs');
    expect(workflow).toContain("PROFILE: ${{ inputs.profile || 'exact-validation' }}");
    expect(workflow).toContain('--endpoint-url "$STORAGE_ENDPOINT" --bucket "$STORAGE_BUCKET" --public-base-url "$PUBLIC_ORIGIN"');
    for (const capability of ["plan", "prepare", "finalize", "acceptance"]) {
      expect(workflow).toContain(`--capability ${capability}`);
    }
    expect(workflow).toContain("Install and exercise macOS Electron Shell");
    expect(workflow).toContain("Install and exercise Windows Electron Shell");
    expect(convergence.workflows["release-exact"]).toMatchObject({
      policy: "shell-scenes-v3",
      workloads: {
        terminal_scene_darwin_arm64: { reusable: true },
        electron_scene_darwin_arm64: { runnerClass: "electron_darwin_arm64", reusable: true },
        electron_scene_win32_x64: { runnerClass: "electron_win32_x64", reusable: false },
      },
    });
    expect(convergence.suites["electron-scene"]).toContain("packages/electron-capsule/");
  });

  it("transports scenes opaquely and restores the plan before reading a cache hit", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");
    const scene = workflow.split("\n  scene:")[1]!.split("\n  prepare:")[0]!;
    expect(scene.indexOf("path: ${{ runner.temp }}/exact-plan")).toBeLessThan(scene.indexOf("- name: Restore converged scene"));
    expect(scene).toContain("path: ${{ runner.temp }}/exact-scene-artifact/scene.tar");
    expect(scene).toContain("exact-release-control.mjs\" scene pack");
    expect(scene).toContain("exact-release-control.mjs\" scene restore");
    expect(scene).toContain("exact-release-control.mjs\" scene contribute");
    expect(scene).not.toContain("zipfile");
    expect(scene).not.toContain('operation:"exact.scene.');
    expect(workflow).not.toContain('operation:"release.authorize"');
    expect(workflow).not.toContain('operation:"release.policy.resolve"');
    expect(workflow).toContain('exact-release-control.mjs" acceptance fetch');
    expect(workflow).not.toContain('urllib.request.urlretrieve(required["artifact"]["url"], archive)');
    expect(workflow).not.toContain("Resolve installed Electron identity");
    expect(workflow).toContain('exact-release-control.mjs" acceptance hot-update');
    expect(workflow).toContain('exact-release-control.mjs" acceptance collect');
    expect(workflow).not.toContain("electron-cdp-control.mjs");
    expect(workflow).not.toContain("electron-cdp-request.json");
    expect(workflow).not.toContain("acceptance-request.json");
    expect(workflow).not.toMatch(/node (?:-e |--input-type=module)/u);
    const acceptance = workflow.split("\n  acceptance:")[1]!.split("\n  activate:")[0]!;
    expect(acceptance.indexOf("node-version: 24.18.0")).toBeLessThan(acceptance.indexOf("- name: Authorize installed acceptance capability"));
    const config = JSON.parse(await readFile(resolve(workspaceRoot, ".github/config/convergence-exact.json"), "utf8"));
    expect(config.suites["convergence-control"]).toContain("tools/release/src/exact/scene-artifact.ts");
  });

  it("checks release-neutral scenes by owned fields rather than coincidental version values", async () => {
    const workflow = await readFile(resolve(workspaceRoot, ".github/workflows/release-exact.yml"), "utf8");

    expect(workflow).toContain('exact-release-control.mjs" scene contribute');
    expect(workflow).not.toContain("find_release_owned_fields");
    const source = await readFile(resolve(workspaceRoot, "tools/release/src/exact/scene-contribution.ts"), "utf8");
    expect(source).toContain('["artifactBaseUrl", "channel", "publishedAt", "releaseVersion", "signatures"]');
    expect(source).toContain("releaseOwnedFields(scene)");
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

    expect(workflow).not.toContain('"operation": "exact.prepare"');
    expect(workflow).not.toContain('"operation": "exact.finalize"');
    for (const command of ["prepare", "finalize", "publish", "activate", "baseline promote", "baseline stage"]) {
      expect(workflow).toContain(`exact-release-control.mjs" ${command}`);
    }
    expect(workflow).not.toContain("relocated-publish-receipt.json");
    expect(workflow).not.toContain('"operation": "exact.publish"');
    expect(workflow).not.toContain('"operation": "exact.activate"');
    expect(workflow).not.toContain('"operation": "exact.baseline.promote"');
    expect(workflow).not.toContain(".github/scripts/pack.py");
    expect(workflow).not.toContain(".github/scripts/release.py");
    expect(workflow).not.toContain("installed_acceptance.py");
    expect(workflow).toContain('exact-release-control.mjs" acceptance collect');
    expect(workflow).not.toContain("node tools/release/src/exact/control-cli.ts");
    expect(workflow).not.toContain("somechan");
    expect(workflow).not.toContain("somepreview");
    expect(workflow).not.toContain('"appId": "io.open-design.betahyx"');
    expect(workflow).not.toContain('"executableName": "open-design-betahyx"');
    const finalize = workflow.split("- name: Finalize signed Shell sidecar and channel head")[1]?.split("- name: Publish immutable release objects")[0];
    expect(finalize).toContain('--distributions "$RUNNER_TEMP/distributions"');
    expect(finalize).not.toContain("python3");
    expect(finalize).not.toContain("restart-and-install");
    expect(finalize).not.toContain("shell.distribution.contribute");
  });

  it("contains no legacy Electron application or launcher authority", async () => {
    const files = [
      "AGENTS.md",
      ".gitignore",
      ...(await readdir(resolve(workspaceRoot, ".github/workflows"))).filter(file => /\.ya?ml$/u.test(file)).map(file => `.github/workflows/${file}`),
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
    const installIdentity = { appBundleId: "io.open-design.betahyx", executableName: "open-design-betahyx", namespace: "acceptance" };
    const updater = { channel: "betahyx", mechanism: "standalone" };
    const required = { artifact, installIdentity, platformTrust, shell, shellMetadata, target: "darwin-arm64", updater };
    const target = { endpointUrl: "https://storage.invalid", bucket: "release", publicBaseUrl: "https://release.invalid", latestChannelHeadUrl: "https://storage.invalid/release/betahyx/latest/channel-head.json" };
    const publishReceipt = join(publishedRoot, "publish-receipt.json"), policyReceipt = join(root, "policy.json");
    await run(process.execPath, [resolve(workspaceRoot, "tools/release/bin/tools-release.mjs"), "policy", "resolve", "--profile", "exact-validation",
      "--channel", "betahyx", "--release-version", "1.2.3-betahyx.4", "--source-commit", sourceCommit, "--source-ref", "refs/heads/feat/electron",
      "--endpoint-url", target.endpointUrl, "--bucket", target.bucket, "--public-base-url", target.publicBaseUrl,
      "--end-user-distribution", "false", "--stable-authorized", "false", "--receipt", policyReceipt]);
    await writeFile(publishReceipt, JSON.stringify({ schemaVersion: 1, operation: "exact.publish", profile: "exact-validation", channel: "betahyx", releaseVersion: "1.2.3-betahyx.4", sourceCommit, target, requiredAcceptances: [required] }));

    const installedFiles = await Promise.all(["host.mjs", "supervisor.mjs", "content.json", "trust.json", "seed.bin", "updater-provider.mjs"].map(async (file) => {
      const body = Buffer.from(`installed:${file}`);
      await writeFile(join(installedRoot, file), body);
      return { file, sha256: createHash("sha256").update(body).digest("hex"), size: body.length };
    }));
    await writeFile(join(installedRoot, "standalone-installation.json"), JSON.stringify({
      schemaVersion: 2,
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      target: "darwin-arm64",
      host: installedFiles[0],
      updaterProvider: installedFiles[5],
      supervisor: installedFiles[1],
      content: installedFiles[2],
      trust: installedFiles[3],
      seeds: [installedFiles[4]],
    }));
    const baseUserDataRoot = join(root, "user-data");
    const runtimeRoot = join(baseUserDataRoot, "exact/channels/betahyx/namespaces/acceptance-headless/runtime/electron");
    const runtimeLog = join(runtimeRoot, "logs/electron-runtime.jsonl");
    await mkdir(dirname(runtimeLog), { recursive: true });
    await writeFile(runtimeLog, [
      { attemptId: "acceptance-attempt", event: "startup.committed" },
      { attemptId: "acceptance-attempt", event: "shutdown.complete" },
    ].map((event) => JSON.stringify(event)).join("\n"));

    const collect = async (hotReceipt?: string) => {
      await run(process.execPath, [resolve(workspaceRoot, "tools/release/dist/exact-control.mjs"), "acceptance", "collect",
        "--publication", publishReceipt, "--policy", policyReceipt, "--installed-root", installedRoot, "--runtime-proof-root", root,
        "--shell", "electron", "--target", "darwin-arm64", "--base-user-data-root", baseUserDataRoot,
        ...(hotReceipt == null ? [] : ["--hot-receipt", hotReceipt]), "--receipt", join(acceptanceRoot, "electron-darwin-arm64.json")]);
    };
    await collect();
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
    const store = join(runtimeRoot, "standalone-store/channels/betahyx");
    const standaloneState = join(store, "namespaces/acceptance-headless/state.json"), standaloneGenerations = join(store, "generations");
    await mkdir(standaloneGenerations, { recursive: true }); await mkdir(dirname(standaloneState), { recursive: true });
    await writeFile(standaloneState, JSON.stringify({
      schemaVersion: 4, active: generationId, lastHealthy: generationId, prepared: null,
      activationIntent: null, activationAttempt: null, revision: 7,
    }));
    await writeFile(join(standaloneGenerations, `${generationId}.json`), JSON.stringify({
      schemaVersion: 4, id: generationId, channel: "betahyx", releaseVersion: "1.2.3-betahyx.4",
    }));
    await expect(collect(hotReceipt)).rejects.toThrow("mounted candidate renderer");
    await writeFile(runtimeLog, [
      { attemptId: "hot-attempt", event: "startup.committed" },
      { attemptId: "hot-attempt", event: "renderer.generation.committed", details: { generationId, bindingDigest: "f".repeat(64) } },
      { attemptId: "hot-attempt", event: "shutdown.complete" },
      { attemptId: "cold-attempt", event: "startup.committed", details: { generationId } },
      { attemptId: "cold-attempt", event: "shutdown.complete" },
    ].map((event) => JSON.stringify(event)).join("\n"));
    await collect(hotReceipt);
    const hotCredential = JSON.parse(await readFile(join(acceptanceRoot, "electron-darwin-arm64.json"), "utf8"));
    expect(hotCredential.installed.proof).toMatchObject({
      baselineReleaseVersion: "1.2.3-betahyx.3",
      hotUpdate: { releaseVersion: "1.2.3-betahyx.4", discoveryUrl: "http://127.0.0.1:9222", generationId },
    });
  });
});
