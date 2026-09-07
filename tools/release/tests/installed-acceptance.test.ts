import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { executeExactReleaseControl } from "../src/exact/control-release.js";
import { resolveReleasePolicy } from "../src/policy/release-profile.js";

const roots: string[] = [];
afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-installed-acceptance-"));
  roots.push(root);
  const save = async (name: string, value: unknown) => {
    const path = join(root, name);
    await writeFile(path, JSON.stringify(value));
    return path;
  };
  const policy = resolveReleasePolicy({
    schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation",
    channel: "betahyx", releaseVersion: "1.2.3-betahyx.4", sourceCommit: "a".repeat(40),
    sourceRef: "refs/heads/feat/electron-shell-exact-delivery",
    switches: { endUserDistribution: false, stableAuthorized: false },
    target: { endpointUrl: "https://storage.invalid", bucket: "release", publicBaseUrl: "https://release.invalid", latestChannelHeadUrl: "https://storage.invalid/release/betahyx/latest/channel-head.json" },
  });
  const required = {
    shell: { type: "electron", version: "1.2.3", buildHash: "b".repeat(64) }, target: "darwin-arm64",
    artifact: { url: "https://release.invalid/app.dmg", sha256: "c".repeat(64), size: 42 },
    shellMetadata: { url: "https://release.invalid/shell.json", sha256: "d".repeat(64), size: 20 },
    installIdentity: { appId: "io.open-design.betahyx" },
    platformTrust: { platform: "macos", mode: "verify-only" }, updater: { mechanism: "standalone" },
  };
  const published = { schemaVersion: 1, operation: "exact.publish", profile: policy.profile, channel: policy.channel, releaseVersion: policy.releaseVersion, sourceCommit: policy.sourceCommit, target: policy.target, requiredAcceptances: [required] };
  const body = Buffer.from("installed payload");
  await writeFile(join(root, "payload.bin"), body);
  const file = { file: "payload.bin", sha256: createHash("sha256").update(body).digest("hex"), size: body.length };
  const installation = { schemaVersion: 1, channel: policy.channel, releaseVersion: policy.releaseVersion, target: required.target, host: file, supervisor: file, content: file, trust: file, seeds: [file] };
  await save("standalone-installation.json", installation);
  const events = ["startup.committed", "shutdown.complete"].map((event) => ({ attemptId: "attempt-1", event }));
  const runtimeLog = join(root, "runtime.jsonl");
  const log = async (values: unknown[]) => await writeFile(runtimeLog, values.map((value) => JSON.stringify(value)).join("\n"));
  await log(events);
  const input = { schemaVersion: 1, operation: "exact.acceptance", policyReceipt: await save("policy.json", policy), publishReceipt: await save("publish.json", published), shellType: "electron", target: "darwin-arm64", installedRoot: root, runtimeLog };
  return { root, input, save, installation, published, events, log, output: join(root, "acceptance.json") };
}

it("binds installed evidence to the policy and published target", async () => {
  const f = await fixture();
  await executeExactReleaseControl(f.input, f.output);
  expect(JSON.parse(await readFile(f.output, "utf8"))).toMatchObject({
    operation: "exact.acceptance", status: "accepted", channel: "betahyx", releaseVersion: "1.2.3-betahyx.4",
    installed: { proof: { runtime: { outcome: "ready", attemptId: "attempt-1" } } },
  });
});

it.each(["startup.failed", "startup.started"])("does not hide a final %s behind an earlier successful attempt", async (event) => {
  const f = await fixture();
  await f.log([...f.events, { attemptId: "attempt-2", event }]);
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("latest installed Electron attempt");
});

it("requires ordered startup and shutdown with an attempt identity", async () => {
  const f = await fixture();
  await f.log([...f.events].reverse());
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("latest installed Electron attempt");
  await f.log(f.events.map(({ event }) => ({ event })));
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("invalid Electron runtime log event");
});

it("rejects artifact tampering and paths outside the installation", async () => {
  const f = await fixture();
  await f.save("standalone-installation.json", { ...f.installation, host: { ...f.installation.host, sha256: "f".repeat(64) } });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("binding mismatch");
  const other = await fixture();
  await symlink(join(other.root, "payload.bin"), join(f.root, "external.bin"));
  await f.save("standalone-installation.json", { ...f.installation, host: { ...f.installation.host, file: "external.bin" } });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("escapes the installation");
});

it("rejects wrong release, duplicate topology, and policy mismatches", async () => {
  const f = await fixture();
  await f.save("standalone-installation.json", { ...f.installation, releaseVersion: "1.2.3-betahyx.3" });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("release identity mismatch");
  await f.save("publish.json", { ...f.published, requiredAcceptances: [...f.published.requiredAcceptances, ...f.published.requiredAcceptances] });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("one matching published target");
  await f.save("publish.json", { ...f.published, profile: "stable-distribution" });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("policy binding mismatch");
});

it("rejects hot receipts that omit both Shell versions instead of treating undefined as equality", async () => {
  const f = await fixture();
  const hotAcceptanceReceipt = await f.save("hot.json", {
    schemaVersion: 1, operation: "electron.cdp.contract.invoked", discoveryUrl: "http://127.0.0.1:9222",
    results: [{}, { lines: { closure: { state: "ready", candidateVersion: f.published.releaseVersion } } }, { outcome: "context-destroyed" }, {}],
  });
  await expect(executeExactReleaseControl({ ...f.input, hotAcceptanceReceipt }, f.output)).rejects.toThrow("isolated Closure hot update");
});

it("preserves Terminal installed lifecycle evidence and rejects a surviving Sidecar", async () => {
  const f = await fixture();
  const required = { ...f.published.requiredAcceptances[0]!, shell: { type: "terminal", version: "1.2.3", buildHash: "b".repeat(64) } };
  await f.save("publish.json", { ...f.published, requiredAcceptances: [required] });
  const manifest = `\uFEFF${JSON.stringify({ shell: required.shell, target: required.target })}`;
  await writeFile(join(f.root, "install-manifest.json"), manifest);
  await writeFile(join(f.root, "install-manifest.sha256"), createHash("sha256").update(manifest).digest("hex"));
  await f.save("installed-proof.json", { outcome: "ready" });
  const started = { state: "running", references: 1, attachmentCapability: "cap", generationId: "gen", bindingDigest: "digest", sidecar: { generationPid: 123, status: "ready" } };
  await f.save("runtime-start.json", { outcome: "ready", result: started });
  await f.save("runtime-status.json", { outcome: "ready", result: started });
  await f.save("runtime-stop.json", { outcome: "ready", result: { state: "stopped", sidecar: { remainingPids: [] } } });
  const input = { ...f.input, shellType: "terminal", runtimeProofRoot: f.root };
  await executeExactReleaseControl(input, f.output);
  expect(JSON.parse(await readFile(f.output, "utf8")).installed.runtime.stop.result.state).toBe("stopped");
  await f.save("runtime-stop.json", { outcome: "ready", result: { state: "stopped", sidecar: { remainingPids: [123] } } });
  await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow("physical Sidecar");
});
