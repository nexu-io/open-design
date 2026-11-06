import { describe, expect, it } from "vitest";

import {
  initialSharedLifecycleState,
  initialShellUpdaterSnapshot,
  projectSharedLifecycleStatus,
  reduceSharedLifecycleState,
  reduceShellUpdaterSnapshot,
  type SharedLifecycleState,
  type StandaloneShellUpdaterSnapshot,
} from "../src/index.js";

const now = "2026-08-25T00:00:00.000Z";
const later = "2026-08-25T00:00:30.000Z";
const generation = "a".repeat(64);
const shell = { type: "terminal", version: "0.1.0", buildHash: "b".repeat(64), digest: "c".repeat(64) };
const attachment = { id: "terminal", shell };
const scope = { channel: "somechan", namespace: "shared" };

function running(): SharedLifecycleState {
  return reduceSharedLifecycleState(initialSharedLifecycleState(scope), {
    type: "start",
    generationId: generation,
    bindingDigest: "e".repeat(64),
    instanceId: "instance-a",
    attachment,
    heartbeatAt: now,
    leaseExpiresAt: later,
    capability: { candidateHash: "d".repeat(64), presentedHash: null },
  });
}

function handoff(): StandaloneShellUpdaterSnapshot["handoff"] {
  return {
    interaction: "restart-and-install",
    releaseVersion: "0.2.0-somechan.1",
    target: "darwin-arm64",
    shell: { type: "terminal", version: "0.2.0", buildHash: "e".repeat(64) },
    artifact: { path: "/tmp/candidate", sha256: "f".repeat(64), size: 1, mediaType: "application/gzip" },
  };
}

describe("orthogonal Standalone lifecycle models", () => {
  it("keeps attachments inside one instance aggregate without changing generation health", () => {
    let state = running();
    state = reduceSharedLifecycleState(state, {
      type: "start",
      generationId: generation,
      bindingDigest: "e".repeat(64),
      instanceId: "ignored-existing-instance",
      attachment: { id: "electron", shell: { type: "electron", version: "1.0.0", buildHash: "1".repeat(64), digest: "2".repeat(64) } },
      heartbeatAt: now,
      leaseExpiresAt: later,
    });
    expect(projectSharedLifecycleStatus(state, 5_000)).toMatchObject({ generationId: generation, instanceId: "instance-a", references: 2 });
  });

  it("makes force-stop sealing irreversible except through exact completion or expiry", () => {
    let state = running();
    state = reduceSharedLifecycleState(state, {
      type: "reserve-transition",
      transition: { token: "transition-a", kind: "content-restart", phase: "reserved", fence: state.fence, acquiredAt: now, expiresAt: later },
    });
    const reservedFence = state.fence;
    state = reduceSharedLifecycleState(state, { type: "force-stop", token: "transition-a", fence: reservedFence, requestedAt: now, expiresAt: later });
    expect(state).toMatchObject({ state: "stopped", transition: { phase: "stopped-sealed", fence: reservedFence + 1 } });
    expect(() => reduceSharedLifecycleState(state, { type: "release-transition", token: "transition-a", fence: state.fence }))
      .toThrow("cannot be released");
    state = reduceSharedLifecycleState(state, {
      type: "complete-start",
      token: "transition-a",
      fence: state.fence,
      generationId: generation,
      bindingDigest: "e".repeat(64),
      instanceId: "instance-b",
      attachment,
      heartbeatAt: now,
      leaseExpiresAt: later,
    });
    expect(state).toMatchObject({ state: "running", generationId: generation, instanceId: "instance-b", transition: null });
  });

  it("derives Shell updater actions and binds every install phase to candidate and attempt identities", () => {
    let state = initialShellUpdaterSnapshot("terminal");
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "checking" });
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "available", candidateId: "candidate-a" });
    expect(state.actions).toEqual([{ id: "download", emphasis: "primary" }]);
    expect(() => reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "downloading", candidateId: "candidate-b" }))
      .toThrow("candidate changed concurrently");
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "downloading", candidateId: "candidate-a", progress: { completed: 0, total: 1 } });
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "ready", candidateId: "candidate-a", progress: { completed: 1, total: 1 }, handoff: handoff() });
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "applying", candidateId: "candidate-a", installAttemptId: "install-a", handoff: handoff() });
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "handed-off", candidateId: "candidate-a", installAttemptId: "install-a", handoff: handoff() });
    expect(() => reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "checking" })).toThrow("invalid Shell updater transition");
    state = reduceShellUpdaterSnapshot(state, { expectedRevision: state.revision, state: "installed", candidateId: "candidate-a", installAttemptId: "install-a", handoff: handoff() });
    expect(state).toMatchObject({ state: "installed", candidateId: "candidate-a", installAttemptId: "install-a", actions: [] });
  });
});
