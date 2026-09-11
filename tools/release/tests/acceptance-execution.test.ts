import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { describeFile } from "@/exact/control-common.ts";
import { collectExecutedAcceptance, exerciseReleaseInstallation, exerciseReleaseInstallationPair } from "@/exact/acceptance-execution.ts";

const mocks = vi.hoisted(() => ({
  published: vi.fn(), install: vi.fn(), process: vi.fn(), update: vi.fn(), collect: vi.fn(), startup: vi.fn(), ready: vi.fn(),
  root: "",
  bound: vi.fn(), selected: vi.fn(),
}));
vi.mock("@open-design/shell-electron/lifecycle/inspection", () => ({ inspectElectronStartupThroughCdp: mocks.startup,
  waitForElectronStartup: mocks.ready,
  inspectElectronBoundCapsule: mocks.bound, inspectElectronSelectedCapsule: mocks.selected,
  describeElectronRuntimeDiagnostics: ({ namespace }: { namespace: string }) => ({ namespaceRoot: join(mocks.root, "namespaces", namespace), runtimeLog: join(mocks.root, "namespaces", namespace, "runtime.jsonl") }) }));
vi.mock("@open-design/shell-electron/lifecycle/installed", () => ({ installMacElectronApp: mocks.install, withMacElectronProcess: mocks.process,
  withStoppedElectronSession: async (session: { namespace: string }, operation: (paths: { namespaceRoot: string }) => Promise<unknown>) => operation({ namespaceRoot: join(mocks.root, "namespaces", session.namespace) }) }));
vi.mock("@/exact/installed-acceptance.ts", () => ({ readPublishedAcceptance: mocks.published }));
vi.mock("@/exact/acceptance.ts", () => ({ updateAcceptanceSameCarrier: mocks.update, collectReleaseAcceptance: mocks.collect }));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-execution-")); roots.push(root);
  mocks.root = root;
  const publication = join(root, "publication.json"), artifact = join(root, "installer.dmg");
  await writeFile(publication, "{}"); await writeFile(artifact, "fixture");
  const required = { shell: { version: "1.0.0", buildHash: "carrier" },
    installIdentity: { productName: "Fixture", executableName: "app", namespace: "fixture" }, artifact: await describeFile(artifact) };
  const policy = { channel: "betahyx", releaseVersion: "1.0.0-betahyx.2", target: { publicBaseUrl: "https://release.example" } };
  mocks.published.mockResolvedValue({ required, policy, published: { channelHead: { url: "https://release.example/betahyx/1.0.0-betahyx.2/channel-head.json" } } });
  mocks.install.mockImplementation(async ({ appPath }) => ({ resources: join(appPath, "Contents/Resources") }));
  mocks.process.mockImplementation(async (input, exercise) => {
    const namespace = (input.args as string[]).find(arg => arg.startsWith("--namespace="))!.slice("--namespace=".length);
    await writeFile(join(root, "namespaces", namespace, "runtime.jsonl"), "runtime evidence");
    return exercise?.();
  });
  mocks.startup.mockResolvedValue({ results: [{}] });
  mocks.bound.mockResolvedValue({ envelope: { document: "candidate" } });
  mocks.selected.mockResolvedValue({ envelope: { document: "candidate" } });
  const input = { publication, policy: join(root, "policy.json"), shell: "electron", target: "darwin-arm64",
    workRoot: join(root, "execution"), artifact };
  const inspection = join(root, "inspection.json"), baselineReceipt = join(root, "baseline.json");
  await writeFile(baselineReceipt, JSON.stringify({ schemaVersion: 1, operation: "electron.baseline.fetch", target: input.target, ...required }));
  await writeFile(inspection, JSON.stringify({ schemaVersion: 1, operation: "electron.baseline.inspect",
    compatible: true, upgradeRequired: true, reason: "same-carrier", target: input.target, channel: policy.channel, releaseVersion: policy.releaseVersion }));
  return { root, input, inspection, baselineReceipt };
}

it.skipIf(process.platform !== "darwin")("runs hot update while first startup is pending, but joins both before completion", async () => {
  const f = await fixture();
  const firstReady = Promise.withResolvers<void>(), hotRan = Promise.withResolvers<void>();
  mocks.startup.mockImplementation(async (scope: { namespace: string }) => {
    if (scope.namespace.startsWith("accept-first-")) await firstReady.promise;
    return { results: [{}] };
  });
  mocks.update.mockImplementation(async input => {
    expect(input.candidateRoot).toBe(join(f.input.workRoot, "first/installed.app/Contents/Resources"));
    await expect(readFile(join(f.input.workRoot, "first/execution.json"))).rejects.toThrow();
    hotRan.resolve();
  });
  let settled = false;
  const pending = exerciseReleaseInstallationPair({ ...f.input, baselineArtifact: f.input.artifact,
    baselineReceipt: f.baselineReceipt }).finally(() => { settled = true; });
  try {
    await hotRan.promise;
    expect(settled).toBe(false);
    expect(mocks.install).toHaveBeenCalledTimes(2);
  } finally { firstReady.resolve(); }
  await pending;
  await collectExecutedAcceptance({ ...f.input, inspection: f.inspection, receipt: join(f.root, "accepted.json") });
  expect(mocks.collect).toHaveBeenCalledOnce();
});

it.skipIf(process.platform !== "darwin")("waits for the other runtime owner when one concurrent scenario fails", async () => {
  const f = await fixture();
  const firstReady = Promise.withResolvers<void>(), hotFailed = Promise.withResolvers<void>();
  mocks.startup.mockImplementation(async (scope: { namespace: string }) => {
    if (scope.namespace.startsWith("accept-first-")) await firstReady.promise;
    return { results: [{}] };
  });
  mocks.update.mockImplementation(async () => { hotFailed.resolve(); throw new Error("hot failed"); });
  let settled = false;
  const pending = exerciseReleaseInstallationPair({ ...f.input, baselineArtifact: f.input.artifact,
    baselineReceipt: f.baselineReceipt }).finally(() => { settled = true; });
  const failure = expect(pending).rejects.toThrow("Installed acceptance failed");
  try { await hotFailed.promise; expect(settled).toBe(false); }
  finally { firstReady.resolve(); }
  await failure;
  await expect(readFile(join(f.input.workRoot, "hot/execution.json"))).rejects.toThrow();
});

it.skipIf(process.platform !== "darwin")("keeps first install, hot update and subsequent cold start as independent evidence", async () => {
  const f = await fixture();
  await exerciseReleaseInstallation({ ...f.input, mode: "first" });
  await expect(collectExecutedAcceptance({ ...f.input, inspection: f.inspection, receipt: join(f.root, "accepted.json") })).rejects.toThrow();
  expect(mocks.collect).not.toHaveBeenCalled();
  await exerciseReleaseInstallation({ ...f.input, mode: "hot", baselineReceipt: f.baselineReceipt });
  expect(mocks.process).toHaveBeenCalledTimes(3);
  expect(mocks.process.mock.calls[1]![0].args).toContain("--remote-debugging-port=0");
  expect(mocks.process.mock.calls[2]![0].args).toContain("--headless");
  const firstArgs = mocks.process.mock.calls[0]![0].args as string[];
  const hotArgs = mocks.process.mock.calls[1]![0].args as string[];
  expect(firstArgs.some(arg => arg.startsWith("--user-data-dir"))).toBe(false);
  expect(firstArgs.find(arg => arg.startsWith("--namespace="))).not.toBe(hotArgs.find(arg => arg.startsWith("--namespace=")));
  expect(mocks.process.mock.calls[2]![0].args).toContain(hotArgs.find(arg => arg.startsWith("--namespace=")));
  expect(mocks.startup).toHaveBeenCalledTimes(2);
  expect(mocks.ready).toHaveBeenCalledTimes(1);
  expect(mocks.ready.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]!);
  await collectExecutedAcceptance({ ...f.input, inspection: f.inspection, receipt: join(f.root, "accepted.json") });
  const collected = mocks.collect.mock.calls[0]![0];
  expect(collected.installedRoot).not.toBe(collected.firstInstallRoot);
  expect(collected.hotAcceptanceReceipt).toBe(join(f.input.workRoot, "hot/hot.json"));
  await writeFile(f.input.publication, '{"changed":true}');
  await expect(collectExecutedAcceptance({ ...f.input, inspection: f.inspection, receipt: join(f.root, "accepted.json") })).rejects.toThrow("binding verification");
});

it.skipIf(process.platform !== "darwin")("does not invoke the hot updater before baseline startup commits", async () => {
  const f = await fixture();
  mocks.ready.mockRejectedValueOnce(new Error("baseline startup failed"));
  await expect(exerciseReleaseInstallation({ ...f.input, mode: "hot", baselineReceipt: f.baselineReceipt }))
    .rejects.toThrow("baseline startup failed");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.startup).not.toHaveBeenCalled();
});

it.skipIf(process.platform !== "darwin")("does not substitute first installation for an unexercised baseline upgrade", async () => {
  const f = await fixture();
  await exerciseReleaseInstallation({ ...f.input, mode: "first" });
  const inspection = JSON.parse(await readFile(f.inspection, "utf8"));
  await writeFile(f.inspection, JSON.stringify({ ...inspection, compatible: false, upgradeRequired: true,
    reason: "carrier-identity-changed" }));
  await expect(collectExecutedAcceptance({ ...f.input, inspection: f.inspection, receipt: join(f.root, "accepted.json") }))
    .rejects.toThrow("Baseline upgrade evidence is required");
  expect(mocks.collect).not.toHaveBeenCalled();
});

it.skipIf(process.platform !== "darwin")("keeps first-start Capsule commitment as a final gate after concurrent execution", async () => {
  const f = await fixture();
  await exerciseReleaseInstallationPair({ ...f.input, baselineArtifact: f.input.artifact, baselineReceipt: f.baselineReceipt });
  mocks.selected.mockResolvedValue({ envelope: { document: "not-the-bound-candidate" } });
  await expect(collectExecutedAcceptance({ ...f.input, inspection: f.inspection, receipt: join(f.root, "accepted.json") }))
    .rejects.toThrow("did not commit its bound Capsule");
  expect(mocks.collect).not.toHaveBeenCalled();
});

it.skipIf(process.platform !== "darwin")("fails before installation for wrong bytes and leaves no successful receipt after runtime failure", async () => {
  const f = await fixture();
  await writeFile(f.input.artifact, "tampered");
  await expect(exerciseReleaseInstallation({ ...f.input, mode: "first" })).rejects.toThrow("binding verification");
  expect(mocks.install).not.toHaveBeenCalled();
  await writeFile(f.input.artifact, "fixture");
  mocks.process.mockRejectedValueOnce(new Error("runtime failed"));
  await expect(exerciseReleaseInstallation({ ...f.input, mode: "first" })).rejects.toThrow("runtime failed");
  await expect(readFile(join(f.input.workRoot, "first/execution.json"))).rejects.toThrow();
});
