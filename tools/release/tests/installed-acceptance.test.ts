import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPackage } from "@electron/asar";
import { describeElectronRuntimeDiagnostics } from "@open-design/shell-electron/lifecycle/inspection";
import { collectReleaseAcceptance } from "@/exact/acceptance.ts";

import { afterEach, expect, it, vi } from "vitest";

import { executeExactReleaseControl } from "@/exact/control-release.js";
import { resolveReleasePolicy } from "@/policy/release-profile.js";
import { createAcceptedShellBaselineReceipt, resolveAcceptedShellBaseline } from "@/exact/accepted-baseline.js";

const roots: string[] = [];
const capsuleInspection = vi.hoisted(() => vi.fn());
vi.mock("@open-design/shell-electron/lifecycle/inspection", async original => ({
  ...await original<typeof import("@open-design/shell-electron/lifecycle/inspection")>(), inspectElectronSelectedCapsule: capsuleInspection,
}));
afterEach(() => vi.resetAllMocks());
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
    installIdentity: { appId: "io.open-design.betahyx", namespace: "acceptance", executableName: "open-design", productName: "OpenDesign" },
    // Binding-only fixture: formal policy shape, not a real codesign claim.
    platformTrust: { platform: "macos", mode: "formal", teamIdentifier: "TESTTEAM01", designatedRequirement: 'identifier "io.open-design.betahyx"' }, updater: { mechanism: "standalone" },
  };
  const published = { schemaVersion: 1, operation: "exact.publish", profile: policy.profile, channel: policy.channel, releaseVersion: policy.releaseVersion, sourceCommit: policy.sourceCommit, target: policy.target, requiredAcceptances: [required] };
  const physical = { schemaVersion: 2, ...required.installIdentity, publisher: "OpenDesign", protocol: "open-design",
    channel: policy.channel, version: policy.releaseVersion, shell: { ...required.shell, digest: "e".repeat(64) } };
  const archiveSource = join(root, "archive-source");
  await mkdir(archiveSource);
  const archive = async (manifest: unknown) => {
    await writeFile(join(archiveSource, "shell.json"), JSON.stringify(manifest));
    await createPackage(archiveSource, join(root, "app.asar"));
  };
  await archive(physical);
  const body = Buffer.from("installed payload");
  await writeFile(join(root, "payload.bin"), body);
  const file = { file: "payload.bin", sha256: createHash("sha256").update(body).digest("hex"), size: body.length };
  const installation = { schemaVersion: 4, channel: policy.channel, releaseVersion: policy.releaseVersion, target: required.target, host: file, updaterProvider: file, supervisor: file, content: file, trust: file, capsule: { manifest: file, archive: file } };
  await save("standalone-installation.json", installation);
  const events = ["startup.committed", "shutdown.complete"].map((event) => ({ attemptId: "attempt-1", event }));
  const runtimeLog = join(root, "runtime.jsonl");
  const log = async (values: unknown[]) => await writeFile(runtimeLog, values.map((value) => JSON.stringify(value)).join("\n"));
  await log(events);
  const input = { schemaVersion: 1, operation: "exact.acceptance", policyReceipt: await save("policy.json", policy), publishReceipt: await save("publish.json", published), shellType: "electron", target: "darwin-arm64", installedRoot: root, runtimeLog };
  return { root, input, save, installation, published, physical, archive, events, log, output: join(root, "acceptance.json") };
}

it("promotes the actual minimal installation proof into a reusable baseline without Closure seeds", async () => {
  const f = await fixture();
  const named = async (name: string) => {
    await copyFile(join(f.root, "payload.bin"), join(f.root, name));
    return { ...f.installation.content, file: name };
  };
  await f.save("standalone-installation.json", { ...f.installation,
    content: await named("standalone-content.json"),
    capsule: { manifest: await named("capsule-manifest.json"), archive: await named("capsule.zip") },
  });
  await executeExactReleaseControl(f.input, f.output);
  const acceptance = JSON.parse(await readFile(f.output, "utf8"));
  expect(acceptance.installed.proof.files).not.toHaveProperty("seeds");
  const receipt = createAcceptedShellBaselineReceipt(acceptance);
  const bytes = Buffer.from(JSON.stringify(receipt));
  const resolved = resolveAcceptedShellBaseline({ channel: "betahyx", target: "darwin-arm64",
    acceptedReceipt: { bytes, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
  });
  expect(resolved.mode).toBe("accepted");
  expect(receipt.schemaVersion).toBe(3);
  expect(receipt.baseline.installation.capsule.archive.sha256).toBe(f.installation.capsule.archive.sha256);
});

it.each(["buildHash", "version"])("rejects a different actual physical Shell %s despite matching declared installation files", async field => {
  const f = await fixture();
  await f.archive({ ...f.physical, shell: { ...f.physical.shell, [field]: field === "version" ? "9.0.0" : "f".repeat(64) } });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("physical Shell identity mismatch");
});

it.each(["appId", "namespace", "executableName", "productName", "channel", "version"])("rejects a different installed manifest %s", async field => {
  const f = await fixture();
  await f.archive({ ...f.physical, [field]: field === "version" ? "9.0.0" : "different" });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("physical Shell identity mismatch");
});

it("records hashes of the actual installed archive and physical manifest", async () => {
  const f = await fixture();
  await executeExactReleaseControl(f.input, f.output);
  const hash = (body: Buffer | string) => createHash("sha256").update(body).digest("hex");
  const archive = await readFile(join(f.root, "app.asar"));
  expect(JSON.parse(await readFile(f.output, "utf8")).installed).toMatchObject({
    shell: f.published.requiredAcceptances[0]!.shell,
    proof: { physical: { manifest: f.physical, manifestSha256: hash(JSON.stringify(f.physical)),
      archive: { file: "app.asar", sha256: hash(archive), size: archive.length } } },
  });
});

it("marks candidate installation evidence without claiming a hot update", async () => {
  const f = await fixture();
  await executeExactReleaseControl({ ...f.input, baselineCandidate: true }, f.output);
  const credential = JSON.parse(await readFile(f.output, "utf8"));
  expect(credential.baselineCandidate).toBe(true);
  expect(credential.installed.proof).not.toHaveProperty("hotUpdate");
});

it("binds installed evidence to the policy and published target", async () => {
  const f = await fixture();
  await executeExactReleaseControl(f.input, f.output);
  expect(JSON.parse(await readFile(f.output, "utf8"))).toMatchObject({
    operation: "exact.acceptance", status: "accepted", channel: "betahyx", releaseVersion: "1.2.3-betahyx.4",
    installed: { proof: { runtime: { outcome: "ready", attemptId: "attempt-1" } } },
  });
});

it("collects through the public Shell diagnostic locations instead of caller-built private paths", async () => {
  const f = await fixture(), baseUserDataRoot = join(f.root, "user-data");
  const paths = describeElectronRuntimeDiagnostics({ baseUserDataRoot, channel: f.published.channel, namespace: "acceptance", presentation: "headless" });
  await mkdir(dirname(paths.runtimeLog), { recursive: true }); await copyFile(f.input.runtimeLog, paths.runtimeLog);
  await collectReleaseAcceptance({ publication: f.input.publishReceipt, policy: f.input.policyReceipt, shell: "electron", target: f.input.target,
    installedRoot: f.root, runtimeProofRoot: f.root, baseUserDataRoot, receipt: f.output });
  expect(JSON.parse(await readFile(f.output, "utf8"))).toMatchObject({ operation: "exact.acceptance", status: "accepted" });
  await writeFile(paths.runtimeLog, JSON.stringify({ attemptId: "failed", event: "startup.failed" }));
  await expect(collectReleaseAcceptance({ publication: f.input.publishReceipt, policy: f.input.policyReceipt, shell: "electron", target: f.input.target,
    installedRoot: f.root, runtimeProofRoot: f.root, baseUserDataRoot, receipt: f.output })).rejects.toThrow("latest installed Electron attempt");
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

it("requires a verified updater provider in the installed acceptance proof", async () => {
  const f = await fixture();
  await f.save("standalone-installation.json", { ...f.installation, updaterProvider: { ...f.installation.updaterProvider, sha256: "f".repeat(64) } });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("binding mismatch");
  const { updaterProvider: _removed, ...incomplete } = f.installation;
  await f.save("standalone-installation.json", incomplete);
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow();
});

it.each(["manifest", "archive"])("requires verified installed Capsule %s bytes", async name => {
  const f = await fixture();
  await f.save("standalone-installation.json", { ...f.installation,
    capsule: { ...f.installation.capsule, [name]: { ...f.installation.capsule.archive, sha256: "f".repeat(64) } } });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("binding mismatch");
  await f.save("standalone-installation.json", { ...f.installation, capsule: {} });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("path is invalid");
});

it("rejects the retired pre-Capsule installation schema", async () => {
  const f = await fixture();
  await f.save("standalone-installation.json", { ...f.installation, schemaVersion: 2 });
  await expect(executeExactReleaseControl(f.input, f.output)).rejects.toThrow("release identity mismatch");
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

it("requires a mounted hot renderer followed by a separate cold start of the same generation", async () => {
  const f = await fixture();
  const id = "e".repeat(64), bindingDigest = "f".repeat(64);
  const hotAcceptanceReceipt = await f.save("hot.json", {
    schemaVersion: 1, operation: "electron.cdp.contract.invoked", discoveryUrl: "http://127.0.0.1:9222",
    results: [
      { lines: { shell: { currentVersion: "1.2.3" } } },
      { lines: { closure: { state: "ready", candidateVersion: f.published.releaseVersion } } },
      { outcome: "context-destroyed" },
      { lines: { shell: { currentVersion: "1.2.3" } } },
    ],
  });
  const standaloneState = await f.save("state.json", { schemaVersion: 5, revision: 7, active: id, lastHealthy: id,
    prepared: null, activationIntent: null, activationAttempt: null });
  await f.save(`${id}.json`, { schemaVersion: 4, id, channel: f.published.channel, releaseVersion: f.published.releaseVersion });
  const input = { ...f.input, hotAcceptanceReceipt, standaloneState, standaloneGenerationsRoot: f.root };
  const hot = [
    { attemptId: "hot", event: "startup.committed" },
    { attemptId: "hot", event: "renderer.generation.committed", details: { generationId: id, bindingDigest } },
    { attemptId: "hot", event: "shutdown.complete" },
  ];
  const cold = [
    { attemptId: "cold", event: "startup.committed", details: { generationId: id } },
    { attemptId: "cold", event: "shutdown.complete" },
  ];
  await f.log([...hot, ...cold]);
  await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow("requires current first-install evidence");
  // Hot delivery may reuse a physical baseline from an earlier release of the
  // same channel, but its own manifest must still match that installation.
  const baselineReleaseVersion = "1.2.3-betahyx.3";
  await f.save("standalone-installation.json", { ...f.installation, releaseVersion: baselineReleaseVersion });
  await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow("physical Shell identity mismatch");
  await f.archive({ ...f.physical, version: baselineReleaseVersion });
  await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow("requires current first-install evidence");
  const first = await fixture();
  const combined = { ...input, firstInstallRoot: first.root, firstInstallRuntimeLog: first.input.runtimeLog };
  await executeExactReleaseControl(combined, f.output);
  const credential = JSON.parse(await readFile(f.output, "utf8"));
  expect(credential.installed.proof.baselineReleaseVersion).toBe(f.published.releaseVersion);
  expect(credential.installed.proof.hotUpdate.baseline.proof.baselineReleaseVersion).toBe(baselineReleaseVersion);
  expect(credential.installed.proof.physical.manifest.version).toBe(f.published.releaseVersion);
  await expect(executeExactReleaseControl({ ...combined, firstInstallRoot: f.root }, f.output)).rejects.toThrow("must be independent");
  await expect(executeExactReleaseControl({ ...combined, firstInstallRuntimeLog: f.input.runtimeLog }, f.output)).rejects.toThrow("must be independent");
  await first.save("standalone-installation.json", { ...first.installation, releaseVersion: baselineReleaseVersion });
  await expect(executeExactReleaseControl(combined, f.output)).rejects.toThrow("release identity mismatch");
  for (const invalid of [
    [...hot.filter((event) => event.event !== "renderer.generation.committed"), ...cold],
    hot,
    [...hot, { attemptId: "hot", event: "renderer.generation.failed" }, ...cold],
    [...hot, ...cold.map((event) => ({ ...event, details: { generationId: "a".repeat(64) } }))],
    [...cold, ...hot],
  ]) {
    await f.log(invalid);
    await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow("mounted candidate renderer");
  }
});

it("requires an exact committed Capsule plus Closure restart and independent current first installation", async () => {
  const f = await fixture(), first = await fixture(), id = "e".repeat(64), oldId = "a".repeat(64), bindingDigest = "f".repeat(64);
  const beforeEnvelope = { document: { version: "old" }, signatures: [] }, envelope = { document: { version: "new" }, signatures: [] };
  const capsule = async (item: Awaited<ReturnType<typeof fixture>>, value: unknown) => {
    const file = await item.save("capsule-manifest.json", value), bytes = await readFile(file);
    return { ...item.installation.capsule, manifest: { file: "capsule-manifest.json", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } };
  };
  const baselineVersion = "1.2.3-betahyx.3";
  await f.save("standalone-installation.json", { ...f.installation, releaseVersion: baselineVersion, capsule: await capsule(f, beforeEnvelope) });
  await f.archive({ ...f.physical, version: baselineVersion });
  await first.save("standalone-installation.json", { ...first.installation, capsule: await capsule(first, envelope) });
  const after = { envelope, shell: { buildHash: "selected" }, revision: 2, closureGenerationId: id };
  const proof = { schemaVersion: 1, operation: "electron.capsule.upgrade",
    before: { envelope: beforeEnvelope, revision: 1, closureGenerationId: oldId }, after,
    prepared: { discoveryUrl: "http://127.0.0.1:1234", results: [{ lines: { shell: { state: "ready" } } }] },
    applied: { results: [{ outcome: "context-destroyed" }] },
    restarted: { attemptId: "upgrade", results: [{ lines: { shell: { state: "current" } } }] } };
  const hotAcceptanceReceipt = await f.save("capsule-hot.json", proof);
  const standaloneState = await f.save("state.json", { schemaVersion: 5, revision: 7, active: id, lastHealthy: id, prepared: null, activationIntent: null, activationAttempt: null });
  await f.save(`${id}.json`, { schemaVersion: 4, id, channel: f.published.channel, releaseVersion: f.published.releaseVersion });
  const events = [
    { attemptId: "baseline", event: "startup.committed", details: { generationId: oldId } },
    { attemptId: "baseline", event: "shutdown.complete" },
    ...["upgrade", "cold"].flatMap(attemptId => [
      { attemptId, event: "capsule.startup.ready", details: { generationId: id, bindingDigest } },
      { attemptId, event: "startup.committed", details: { generationId: id } },
      { attemptId, event: "shutdown.complete" },
    ]),
  ];
  await f.log(events);
  const input = { ...f.input, hotAcceptanceReceipt, standaloneState, standaloneGenerationsRoot: f.root,
    baseUserDataRoot: join(f.root, "session"), firstInstallRoot: first.root, firstInstallRuntimeLog: first.input.runtimeLog };
  capsuleInspection.mockResolvedValue({ ...after, revision: 3 });
  await executeExactReleaseControl(input, f.output);
  expect(JSON.parse(await readFile(f.output, "utf8")).installed.proof.hotUpdate.capsule.after.revision).toBe(3);
  for (const changed of [
    { ...proof, after: { ...after, envelope: beforeEnvelope } },
    { ...proof, restarted: { ...proof.restarted, attemptId: "cold" } },
    { ...proof, before: { ...proof.before, closureGenerationId: id } },
    { ...proof, applied: { results: [{ lines: { shell: { state: "failed" } } }] } },
  ]) {
    await f.save("capsule-hot.json", changed);
    await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow();
  }
  await f.save("capsule-hot.json", proof);
  await f.log(events.filter(event => !(event.attemptId === "baseline" && event.event === "shutdown.complete")));
  await expect(executeExactReleaseControl(input, f.output)).rejects.toThrow("clean baseline-to-restart");
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
