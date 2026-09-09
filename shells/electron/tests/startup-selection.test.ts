import { generateKeyPairSync } from "node:crypto";
import { expect, it } from "vitest";
import { signDocument, type GenerationState } from "@open-design/standalone";
import { resolveElectronCompositeShellIdentity, type ElectronCapsuleManifest } from "@open-design/electron-kit/contracts";
import { assertElectronPendingCapsule } from "@/adapters/standalone/capsule.js";
import { platformFixture } from "./fixtures/capsule.js";

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const manifest: ElectronCapsuleManifest = { schemaVersion: 1, protocol: "electron-capsule-v6", version: "1.0.0",
    platform: platformFixture(), target: "darwin-arm64", entrypoint: "capsule.cjs", requires: { carrierVersion: "1.0.0" }, provides: { shellVersion: "2.0.0" },
    archive: { sha256: "a".repeat(64), size: 1, treeSha256: "b".repeat(64) } };
  const carrier = { target: "darwin-arm64" as const, shell: { type: "electron", version: "1.0.0", buildHash: "c".repeat(64), digest: "d".repeat(64) } };
  const pending = { envelope: signDocument(manifest, [{ keyId: "release", privateKey }]), root: "/capsule", closureGenerationId: "e".repeat(64) };
  const state: GenerationState = { schemaVersion: 5, revision: 4, active: "f".repeat(64), prepared: pending.closureGenerationId,
    lastHealthy: "f".repeat(64), activationAttempt: null, activationIntent: { generationId: pending.closureGenerationId,
      authority: "silent", cause: "update-policy", authorizedAt: "2026-09-08T00:00:00.000Z" } };
  return { pending, state, carrier, shell: resolveElectronCompositeShellIdentity(manifest, carrier), trustedKeys: { release: publicKey } };
}

it("requires the loaded capability and the exact authorized Closure before a joint startup", () => {
  const input = fixture();
  expect(() => assertElectronPendingCapsule(input)).not.toThrow();
  expect(() => assertElectronPendingCapsule({ ...input, shell: input.carrier.shell })).toThrow("verified Shell capability");
  for (const state of [{ ...input.state, prepared: "0".repeat(64) }, { ...input.state, activationIntent: null }]) {
    expect(() => assertElectronPendingCapsule({ ...input, state })).toThrow("exact authorized Closure");
  }
});

it("permits Capsule-only startup with the already active exact Closure", () => {
  const input = fixture();
  expect(() => assertElectronPendingCapsule({ ...input, state: { ...input.state,
    active: input.pending.closureGenerationId, prepared: null, activationIntent: null } })).not.toThrow();
});

it("authenticates selection before trusting its claimed runtime identity", () => {
  const input = fixture();
  expect(() => assertElectronPendingCapsule({ ...input, trustedKeys: {} })).toThrow("signature verification");
  const pending = { ...input.pending, envelope: { ...input.pending.envelope,
    document: { ...input.pending.envelope.document, version: "9.0.0" } } };
  expect(() => assertElectronPendingCapsule({ ...input, pending })).toThrow("signature verification");
});
