import { beforeEach, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { canonicalJson, sha256Hex, signDocument } from "@open-design/standalone";
import { resolveElectronCompositeShellIdentity, type ElectronCapsuleManifest } from "@open-design/electron-kit/contracts";
import { ElectronCapsuleUpdate } from "@/adapters/standalone/capsule-update.js";
import { platformFixture } from "./fixtures/capsule.js";

const calls = vi.hoisted(() => ({ events: [] as string[], readSelection: vi.fn(), arm: vi.fn(), prepare: vi.fn(), inspect: vi.fn() }));
vi.mock("@open-design/electron-kit", () => ({ readElectronCapsuleSelection: calls.readSelection, armElectronCapsuleSelection: calls.arm, inspectElectronStartup: calls.inspect }));
vi.mock("@open-design/standalone", async original => ({ ...await original<typeof import("@open-design/standalone")>(),
  StandaloneUpdater: class { prepareFromHead = calls.prepare; },
}));

const manifest: ElectronCapsuleManifest = { schemaVersion: 1, protocol: "electron-capsule-v6", version: "1.0.0",
  platform: platformFixture(), target: "darwin-arm64", entrypoint: "capsule.cjs", requires: { carrierVersion: "1.0.0" }, provides: { shellVersion: "2.0.0" },
  archive: { sha256: "a".repeat(64), size: 1, treeSha256: "b".repeat(64) } };
const carrier = { target: "darwin-arm64" as const, shell: { type: "electron", version: "1.0.0", buildHash: "c".repeat(64), digest: "d".repeat(64) } };
const generationId = "e".repeat(64);

beforeEach(() => {
  vi.resetAllMocks(); calls.events = [];
  calls.readSelection.mockResolvedValue({ revision: 2, pending: null, current: null });
  calls.prepare.mockImplementation(async () => { calls.events.push("prepare-all-closure-resources"); return { status: "prepared", generation: { id: generationId } }; });
  calls.arm.mockImplementation(async () => { calls.events.push("arm-capsule"); });
});

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const envelope = signDocument(manifest, [{ keyId: "release", privateKey }]);
  const metadata = { metadata: { releaseVersion: "1.0.0-betahyx.2" } };
  const metadataBytes = Buffer.from(canonicalJson(metadata));
  const candidate = { candidateId: "1.0.0-betahyx.2", head: { head: { lanes: { content: {
    sha256: sha256Hex(metadataBytes), size: metadataBytes.length,
  } } } } };
  const feed = { validateCandidate: vi.fn(value => value), readCapsule: vi.fn(async () => envelope),
    prepareCapsule: vi.fn(async () => { calls.events.push("prepare-capsule-bytes"); return { envelope, root: "/exact-capsule" }; }) };
  const state = { revision: 8, prepared: generationId, active: "f".repeat(64), activationAttempt: null };
  const store = { readState: vi.fn(async () => state), readGenerationMetadata: vi.fn(async () => metadata),
    authorizePrepared: vi.fn(async () => { calls.events.push("arm-closure"); }) };
  const input = { feed, store, runtimeRoot: "/runtime", channel: "betahyx", carrier,
    shell: carrier.shell, trustedKeys: { release: publicKey } } as unknown as ConstructorParameters<typeof ElectronCapsuleUpdate>[0];
  return { subject: new ElectronCapsuleUpdate(input), input, feed, store, state, envelope,
    candidate: candidate as unknown as Parameters<ElectronCapsuleUpdate["prepare"]>[0] };
}

it("prepares both lanes without authorizing either, then arms the exact candidate on restart", async () => {
  const { subject, candidate, envelope, store } = fixture();
  const handoff = await subject.prepare(candidate);
  expect(calls.prepare).toHaveBeenCalledWith(candidate.head, "observe");
  expect(calls.events).toEqual(["prepare-capsule-bytes", "prepare-all-closure-resources"]);
  expect(calls.arm).not.toHaveBeenCalled();
  expect(store.authorizePrepared).not.toHaveBeenCalled();
  await subject.arm(candidate, handoff);
  expect(calls.events).toEqual(["prepare-capsule-bytes", "prepare-all-closure-resources", "prepare-capsule-bytes", "arm-capsule", "arm-closure"]);
  expect(store.authorizePrepared).toHaveBeenCalledWith(generationId, "silent", "update-policy", 8);
  expect(handoff).toMatchObject({ interaction: "restart-and-activate", activation: { generationId, targetDigest: sha256Hex(canonicalJson(envelope)) } });
  expect(handoff).not.toHaveProperty("artifact");
});

it("routes by verified composite capability and carrier floor", async () => {
  const { subject, candidate, feed, input } = fixture();
  await expect(subject.classify(candidate)).resolves.toBe("activate");
  await expect(new ElectronCapsuleUpdate({ ...input, shell: resolveElectronCompositeShellIdentity(manifest, carrier) }).classify(candidate)).resolves.toBe("current");
  feed.readCapsule.mockResolvedValue({ document: { ...manifest, requires: { carrierVersion: "2.0.0" } }, signatures: [] });
  await expect(subject.classify(candidate)).resolves.toBe("install");
  expect(feed.prepareCapsule).not.toHaveBeenCalled();
});

it("never arms partial or incompatible Closure preparation", async () => {
  const { subject, candidate } = fixture();
  calls.prepare.mockRejectedValueOnce(new Error("missing sync resource"));
  await expect(subject.prepare(candidate)).rejects.toThrow("missing sync resource");
  expect(calls.arm).not.toHaveBeenCalled();
  calls.prepare.mockResolvedValueOnce({ status: "shell-reinstall-required" });
  await expect(subject.prepare(candidate)).rejects.toThrow("exact Closure requirement");
  expect(calls.arm).not.toHaveBeenCalled();
});

it("keeps the first arm as recovery evidence when the second arm conflicts", async () => {
  const { subject, candidate, store } = fixture();
  const handoff = await subject.prepare(candidate);
  store.authorizePrepared.mockRejectedValueOnce(new Error("stale Closure revision"));
  await expect(subject.arm(candidate, handoff)).rejects.toThrow("stale Closure revision");
  expect(calls.events).toEqual(["prepare-capsule-bytes", "prepare-all-closure-resources", "prepare-capsule-bytes", "arm-capsule"]);
  expect(calls.arm).toHaveBeenCalledOnce();
});

it("does not rearm a healthy Closure during a Capsule-only update", async () => {
  const { subject, candidate, state, store } = fixture();
  state.active = generationId;
  calls.prepare.mockResolvedValue({ status: "current", generationId });
  const handoff = await subject.prepare(candidate);
  await subject.arm(candidate, handoff);
  expect(calls.arm).toHaveBeenCalledOnce();
  expect(store.authorizePrepared).not.toHaveBeenCalled();
});

it("rejects a changed handoff or retained Closure before any activation write", async () => {
  const { subject, candidate, store } = fixture();
  const handoff = await subject.prepare(candidate);
  await expect(subject.arm(candidate, { ...handoff, activation: { ...handoff.activation, targetDigest: "0".repeat(64) } }))
    .rejects.toThrow("prepared candidate");
  store.readGenerationMetadata.mockResolvedValue({ metadata: { releaseVersion: "1.0.0-betahyx.3" } });
  await expect(subject.arm(candidate, handoff)).rejects.toThrow("selected head");
  expect(calls.arm).not.toHaveBeenCalled();
  expect(store.authorizePrepared).not.toHaveBeenCalled();
});

it("does not overwrite an already armed Capsule", async () => {
  const { subject, candidate, feed } = fixture();
  calls.readSelection.mockResolvedValue({ revision: 3, pending: {} });
  await expect(subject.prepare(candidate)).rejects.toThrow("already armed");
  expect(feed.prepareCapsule).not.toHaveBeenCalled();
});

it("projects completion only after exact selection and outer carrier startup both commit", async () => {
  const { input, envelope } = fixture();
  const shell = resolveElectronCompositeShellIdentity(manifest, carrier);
  const subject = new ElectronCapsuleUpdate({ ...input, shell });
  const handoff = { interaction: "restart-and-activate" as const, releaseVersion: "1.0.0-betahyx.2", target: carrier.target,
    shell, activation: { targetDigest: sha256Hex(canonicalJson(envelope)), generationId } };
  calls.readSelection.mockResolvedValue({ current: { envelope, closureGenerationId: generationId }, pending: null });
  calls.inspect.mockResolvedValue({ required: true, activation: { state: "starting", attemptId: "startup-1" } });
  await expect(subject.completed(handoff)).resolves.toBeNull();
  calls.inspect.mockResolvedValue({ required: false, activation: { state: "running", attemptId: "startup-1" } });
  await expect(subject.completed(handoff)).resolves.toBe("startup-1");
  await expect(subject.completed({ ...handoff, activation: { ...handoff.activation, targetDigest: "0".repeat(64) } })).resolves.toBeNull();
  calls.readSelection.mockResolvedValue({ current: { envelope, closureGenerationId: generationId }, pending: {} });
  await expect(subject.completed(handoff)).resolves.toBeNull();
});
