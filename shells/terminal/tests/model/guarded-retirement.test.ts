import { describe, expect, it } from "vitest";

import {
  assertGuardedRetirementInvariants,
  canonicalModelState,
  initialGuardedRetirementState,
  reduceGuardedRetirement,
  type AttemptId,
  type GuardedRetirementCommand,
  type GuardedRetirementState,
} from "./guarded-retirement.js";

const attempts: readonly AttemptId[] = ["attempt-a", "attempt-b"];

function apply(state: GuardedRetirementState, ...commands: readonly GuardedRetirementCommand[]): GuardedRetirementState {
  return commands.reduce((current, command) => {
    const result = reduceGuardedRetirement(current, command);
    expect(result.outcome, `${command.type} was rejected with ${result.code}`).not.toBe("rejected");
    return result.state;
  }, state);
}

function guardedCommands(): GuardedRetirementCommand[] {
  return [
    ...attempts.flatMap((attemptId): GuardedRetirementCommand[] => [
      { type: "reserve", attemptId },
      { type: "acquire-guard", attemptId },
      { type: "observe", attemptId },
      { type: "retire", attemptId },
      { type: "verify", attemptId },
      { type: "commit", attemptId },
      { type: "persist-handoff", attemptId },
      { type: "release-guard", attemptId },
      { type: "abort", attemptId },
      { type: "crash-owner", attemptId },
    ]),
    { type: "expire-transition" },
    { type: "start-resource", resource: "daemon", generation: "daemon-generation-2" },
    { type: "start-resource", resource: "web", generation: "web-generation-2" },
  ];
}

describe("guarded Shell retirement algebra", () => {
  it("linearizes physical retirement, logical sealing, and durable handoff under one guard", () => {
    const state = apply(
      initialGuardedRetirementState(),
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "commit", attemptId: "attempt-a" },
      { type: "persist-handoff", attemptId: "attempt-a" },
      { type: "release-guard", attemptId: "attempt-a" },
    );

    expect(state).toMatchObject({
      logical: {
        attachments: [],
        fence: 2,
        phase: "stopped",
        transition: { attemptId: "attempt-a", fence: 2, phase: "stopped-sealed" },
      },
      physical: { evidence: null, generations: { daemon: null, web: null }, guardOwner: null },
      handoff: {
        attemptId: "attempt-a",
        logicalFence: 1,
        resourceSetId: "fixture-product-set-v1",
        retired: { daemon: "daemon-generation-1", web: "web-generation-1" },
      },
    });
  });

  it("rejects the known retire-then-unlocked-commit race", () => {
    let state = apply(
      initialGuardedRetirementState(),
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "release-guard", attemptId: "attempt-a" },
      { type: "start-resource", resource: "daemon", generation: "daemon-generation-2" },
    );

    const commit = reduceGuardedRetirement(state, { type: "commit", attemptId: "attempt-a" });
    expect(commit).toMatchObject({ outcome: "rejected", code: "commit-authority-required" });
    expect(commit.state).toMatchObject({
      logical: { phase: "running", transition: { phase: "reserved" } },
      physical: { generations: { daemon: "daemon-generation-2" } },
      handoff: null,
    });
  });

  it("makes guarded start exclusion and accepted operation replay explicit", () => {
    let state = apply(
      initialGuardedRetirementState(),
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
    );
    expect(reduceGuardedRetirement(state, {
      type: "start-resource",
      resource: "web",
      generation: "web-generation-2",
    })).toMatchObject({ outcome: "rejected", code: "physical-guard-held" });

    const retired = reduceGuardedRetirement(state, { type: "retire", attemptId: "attempt-a" });
    expect(retired.outcome).toBe("applied");
    const replay = reduceGuardedRetirement(retired.state, { type: "retire", attemptId: "attempt-a" });
    expect(replay.outcome).toBe("replayed");
    expect(canonicalModelState(replay.state)).toBe(canonicalModelState(retired.state));
  });

  it("fences evidence after transition expiry or owner crash", () => {
    let state = apply(
      initialGuardedRetirementState(),
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "crash-owner", attemptId: "attempt-a" },
      { type: "expire-transition" },
    );
    expect(state).toMatchObject({
      logical: { fence: 2, transition: null },
      physical: { evidence: null, guardOwner: null },
      handoff: null,
    });
    expect(reduceGuardedRetirement(state, { type: "commit", attemptId: "attempt-a" }))
      .toMatchObject({ outcome: "rejected", code: "commit-authority-required" });
    state = apply(state, { type: "reserve", attemptId: "attempt-b" });
    expect(state.logical.transition).toMatchObject({ attemptId: "attempt-b", fence: 2 });
  });

  it("re-observes the resource set before recovering a sealed handoff", () => {
    let state = apply(
      initialGuardedRetirementState(),
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "commit", attemptId: "attempt-a" },
      { type: "crash-owner", attemptId: "attempt-a" },
    );
    expect(state).toMatchObject({
      logical: { phase: "stopped", transition: { phase: "stopped-sealed" } },
      physical: { evidence: null, guardOwner: null },
      handoff: null,
    });

    state = apply(
      state,
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "commit", attemptId: "attempt-a" },
      { type: "persist-handoff", attemptId: "attempt-a" },
      { type: "release-guard", attemptId: "attempt-a" },
    );
    expect(state.handoff).toMatchObject({ attemptId: "attempt-a", logicalFence: 1 });
  });

  it("rebuilds recovery authority on a newer fence after the sealed lease expires", () => {
    let state = apply(
      initialGuardedRetirementState(),
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "commit", attemptId: "attempt-a" },
      { type: "crash-owner", attemptId: "attempt-a" },
      { type: "expire-transition" },
    );
    expect(state).toMatchObject({ logical: { fence: 3, phase: "stopped", transition: null } });

    state = apply(
      state,
      { type: "reserve", attemptId: "attempt-a" },
      { type: "acquire-guard", attemptId: "attempt-a" },
      { type: "observe", attemptId: "attempt-a" },
      { type: "retire", attemptId: "attempt-a" },
      { type: "verify", attemptId: "attempt-a" },
      { type: "commit", attemptId: "attempt-a" },
      { type: "persist-handoff", attemptId: "attempt-a" },
    );
    expect(state).toMatchObject({
      logical: { fence: 4, transition: { phase: "stopped-sealed" } },
      handoff: { attemptId: "attempt-a", logicalFence: 3 },
    });
  });

  it("exhausts bounded interleavings without violating the safety invariants", () => {
    const commands = guardedCommands();
    const seen = new Set<string>();
    let frontier: GuardedRetirementState[] = [initialGuardedRetirementState()];
    const maxDepth = 9;

    for (let depth = 0; depth <= maxDepth; depth += 1) {
      const next = new Map<string, GuardedRetirementState>();
      for (const state of frontier) {
        assertGuardedRetirementInvariants(state);
        seen.add(canonicalModelState(state));
        if (depth === maxDepth) continue;
        for (const command of commands) {
          const result = reduceGuardedRetirement(state, command);
          if (result.outcome === "rejected") continue;
          assertGuardedRetirementInvariants(result.state);
          next.set(canonicalModelState(result.state), result.state);
        }
      }
      frontier = [...next.values()].filter((state) => !seen.has(canonicalModelState(state)));
    }

    expect(seen.size).toBeGreaterThan(100);
    expect([...seen].some((serialized) => serialized.includes('"handoff":{"attemptId":"attempt-a"'))).toBe(true);
  });
});
