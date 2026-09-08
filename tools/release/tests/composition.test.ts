import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cac } from "cac";
import { afterEach, expect, it, vi } from "vitest";
import { registerExactCommands } from "../src/exact/commands.ts";
import { packSceneArtifact } from "../src/exact/scene-artifact.ts";
import { resolveReleasePolicy } from "../src/policy/release-profile.ts";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function command(args: string[]) {
  const cli = cac("tools-release"); registerExactCommands(cli);
  cli.parse(["node", "tools-release", ...args], { run: false }); await cli.runMatchedCommand();
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function json(path: string, value: unknown) { await writeFile(path, JSON.stringify(value)); }

it("prepares and finalizes signed content within release ownership, with no request bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-composition-")); roots.push(root);
  const sourceRoot = resolve("../.."), sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
  const channel = "betahyx", releaseVersion = "0.1.0-betahyx.1";
  const policy = join(root, "policy.json");
  const fetch = vi.fn(async () => new Response(null, { status: 404 })); vi.stubGlobal("fetch", fetch);
  await json(policy, resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation",
    channel, releaseVersion, sourceCommit, sourceRef: "refs/heads/test", switches: { endUserDistribution: false, stableAuthorized: false },
    target: { endpointUrl: "https://storage.example", bucket: "release", publicBaseUrl: "https://public.example", latestChannelHeadUrl: "https://storage.example/release/betahyx/latest/channel-head.json" } }));
  const key = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  vi.stubEnv("OD_EXACT_SIGNING_KEY_ID", "test"); vi.stubEnv("OD_EXACT_ED25519_PRIVATE_KEY", key);
  vi.stubEnv("OD_EXACT_SIGNING_KEY_ID_NEXT", ""); vi.stubEnv("OD_EXACT_ED25519_PRIVATE_KEY_NEXT", "");
  const scenes = join(root, "scenes"), distributions = join(root, "distributions"); await mkdir(distributions);
  const active = ["terminal", "electron"].map(shell => ({ shell, target: "darwin-arm64" }));
  const topology = join(root, "topology.json"); await json(topology, { active, deferred: [] });
  for (const item of active) {
    const source = join(root, `source-${item.shell}`); await mkdir(source);
    await writeFile(join(source, "closure.mjs"), "closure"); await writeFile(join(source, "launcher.mjs"), "launcher");
    await json(join(source, "closure-resources.json"), { schemaVersion: 1, operation: "closure.resources.build", resources: [] });
    if (item.shell === "electron") await writeFile(join(source, "capsule.zip"), "capsule");
    await json(join(source, "scene.json"), { schemaVersion: 1, target: item.target, shellVersion: "0.1.0", shellBuildHash: sha(item.shell),
      closure: { file: "closure.mjs", sha256: sha("closure"), size: 7 }, standalone: { entrypoint: "launcher.mjs", sha256: sha("launcher") },
      ...(item.shell !== "electron" ? {} : { capsule: { archiveFile: "capsule.zip", content: {
        schemaVersion: 1, protocol: "electron-capsule-v2", target: item.target, entrypoint: "capsule.cjs",
        archive: { sha256: sha("capsule"), size: 7, treeSha256: "a".repeat(64) },
      } } }) });
    await packSceneArtifact(source, join(scenes, `exact-${item.shell}-scene-${item.target}-${sourceCommit}`, "scene.tar"));
    const directory = join(distributions, item.shell); await mkdir(directory);
    await writeFile(join(directory, "installer.bin"), "installer");
    await json(join(directory, "shell-contribution.json"), { schemaVersion: 1, operation: "shell.distribution.contribute",
      shell: { type: item.shell, version: "0.1.0", buildHash: sha(item.shell) }, target: item.target,
      artifact: { file: "/old-job/installer.bin", sha256: sha("installer"), size: 9, mediaType: "application/octet-stream" },
      ...(item.shell === "terminal" ? {} : { installIdentity: { appId: "example.test", executableName: "test", namespace: "test", productName: "Test" },
        platformTrust: { platform: "macos", mode: "verify-only", designatedRequirement: "adhoc", teamIdentifier: "adhoc" },
        updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" } }) });
  }
  const prepared = join(root, "prepared"), final = join(root, "final"), prepareReceipt = join(prepared, "prepare-receipt.json");
  const prepare = ["prepare", "--policy", policy, "--channel", channel, "--release-version", releaseVersion, "--source-commit", sourceCommit,
    "--root", sourceRoot, "--topology", topology, "--scenes", scenes, "--standalone-version", "0.1.0", "--output", prepared, "--receipt", prepareReceipt];
  await expect(command(prepare.map(value => value === channel ? "stable" : value))).rejects.toThrow("binding mismatch");
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(command(prepare)).rejects.toThrow("previous channel head acquisition failed (503)");
  await command(prepare);
  const finalize = ["finalize", "--policy", policy, "--prepared", prepared, "--distributions", distributions, "--output", final, "--receipt", join(final, "pack-receipt.json")];
  await writeFile(join(distributions, "electron/installer.bin"), "tampered");
  await expect(command(finalize)).rejects.toThrow("binding verification failed");
  await writeFile(join(distributions, "electron/installer.bin"), "installer");
  await command(finalize);
  const receipt = JSON.parse(await readFile(join(final, "pack-receipt.json"), "utf8"));
  expect(receipt).toMatchObject({ operation: "exact.pack", channel, releaseVersion });
  expect(receipt.requiredAcceptances.map((value: { shell: { type: string } }) => value.shell.type).sort()).toEqual(["electron", "terminal"]);
  expect(JSON.parse(await readFile(receipt.channelHeadFile, "utf8")).signatures).toHaveLength(1);
});
