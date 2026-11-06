import { describe, expect, it } from "vitest";

import {
  INITIAL_GENERATION_STATE,
  reduceGenerationState,
  validateGenerationState,
  type GenerationState,
  type GenerationStateCommand,
} from "../src/index.js";

const generations = ["a".repeat(64), "b".repeat(64)] as const;
const attemptIds = ["attempt-a", "attempt-b"] as const;
const launchIds = ["launch-a", "launch-b"] as const;
const now = "2026-08-25T00:00:00.000Z";

function key(state: GenerationState): string {
  return JSON.stringify({
    ...state,
    revision: 0,
    activationIntent: state.activationIntent == null ? null : { ...state.activationIntent, authorizedAt: now },
  });
}

function commands(state: GenerationState): GenerationStateCommand[] {
  const result: GenerationStateCommand[] = generations.map((generationId) => ({ type: "prepare", expectedRevision: state.revision, generationId }));
  if (state.prepared != null) {
    for (const [authority, cause] of [
      ["silent", "installed-seed"],
      ["silent", "repair"],
      ["silent", "update-policy"],
      ["user", "user-interaction"],
    ] as const) {
      result.push({ type: "authorize", expectedRevision: state.revision, generationId: state.prepared, authority, cause, authorizedAt: now });
    }
    result.push({ type: "revoke-silent", expectedRevision: state.revision, generationId: state.prepared });
    if (state.activationIntent?.generationId === state.prepared) {
      for (const attemptId of attemptIds) result.push({ type: "activate", expectedRevision: state.revision, generationId: state.prepared, attemptId });
    }
  }
  if (state.activationAttempt != null) {
    for (const launchId of launchIds) {
      result.push({ type: "begin-launch", expectedRevision: state.revision, attemptId: state.activationAttempt.attemptId, launchId });
    }
    if (state.activationAttempt.launchId != null) {
      result.push({
        type: "confirm-launch",
        expectedRevision: state.revision,
        proof: {
          attemptId: state.activationAttempt.attemptId,
          generationId: state.activationAttempt.generationId,
          launchId: state.activationAttempt.launchId,
        },
      });
    }
    result.push({ type: "rollback", expectedRevision: state.revision, attemptId: state.activationAttempt.attemptId });
  }
  return result;
}

function assertSafety(state: GenerationState): void {
  expect(() => validateGenerationState(state)).not.toThrow();
  if (state.activationIntent != null) expect(state.activationIntent.generationId).toBe(state.prepared);
  if (state.activationAttempt != null) expect(state.activationAttempt.generationId).toBe(state.active);
  if (state.activationAttempt == null) expect(state.active).toBe(state.lastHealthy);
}

function activated(generationId = generations[0]): GenerationState {
  let state = reduceGenerationState(INITIAL_GENERATION_STATE, { type: "prepare", expectedRevision: 0, generationId });
  state = reduceGenerationState(state, {
    type: "authorize",
    expectedRevision: state.revision,
    generationId,
    authority: "silent",
    cause: "installed-seed",
    authorizedAt: now,
  });
  return reduceGenerationState(state, { type: "activate", expectedRevision: state.revision, generationId, attemptId: attemptIds[0] });
}

describe("Standalone generation state algebra", () => {
  it("exhausts every finite control state while preserving safety invariants", () => {
    const pending: GenerationState[] = [INITIAL_GENERATION_STATE];
    const reached = new Map<string, GenerationState>();
    while (pending.length > 0) {
      const state = pending.shift()!;
      const stateKey = key(state);
      if (reached.has(stateKey)) continue;
      reached.set(stateKey, state);
      assertSafety(state);
      for (const command of commands(state)) {
        let next: GenerationState;
        try { next = reduceGenerationState(state, command); }
        catch { continue; }
        assertSafety(next);
        if (!reached.has(key(next))) pending.push(next);
      }
    }
    expect(reached.size).toBeGreaterThan(30);
  });

  it("rejects stale revisions and wrong prepared generations", () => {
    const prepared = reduceGenerationState(INITIAL_GENERATION_STATE, { type: "prepare", expectedRevision: 0, generationId: generations[0] });
    expect(() => reduceGenerationState(prepared, {
      type: "authorize",
      expectedRevision: 0,
      generationId: generations[0],
      authority: "silent",
      cause: "update-policy",
      authorizedAt: now,
    })).toThrow("stale generation state revision");
    expect(() => reduceGenerationState(prepared, {
      type: "authorize",
      expectedRevision: prepared.revision,
      generationId: generations[1],
      authority: "silent",
      cause: "update-policy",
      authorizedAt: now,
    })).toThrow("prepared generation changed concurrently");
  });

  it("keeps user authority absorbing while retaining its original cause", () => {
    let state = reduceGenerationState(INITIAL_GENERATION_STATE, { type: "prepare", expectedRevision: 0, generationId: generations[0] });
    state = reduceGenerationState(state, { type: "authorize", expectedRevision: state.revision, generationId: generations[0], authority: "user", cause: "user-interaction", authorizedAt: now });
    for (const cause of ["installed-seed", "repair", "update-policy"] as const) {
      state = reduceGenerationState(state, { type: "authorize", expectedRevision: state.revision, generationId: generations[0], authority: "silent", cause, authorizedAt: now });
    }
    state = reduceGenerationState(state, { type: "revoke-silent", expectedRevision: state.revision, generationId: generations[0] });
    expect(state.activationIntent).toMatchObject({ authority: "user", cause: "user-interaction" });
  });

  it("rejects a delayed readiness proof from the previous recovery launch", () => {
    let state = activated();
    state = reduceGenerationState(state, { type: "begin-launch", expectedRevision: state.revision, attemptId: attemptIds[0], launchId: launchIds[0] });
    const staleProof = { attemptId: attemptIds[0], generationId: generations[0], launchId: launchIds[0] };
    state = reduceGenerationState(state, { type: "begin-launch", expectedRevision: state.revision, attemptId: attemptIds[0], launchId: launchIds[1] });
    expect(() => reduceGenerationState(state, { type: "confirm-launch", expectedRevision: state.revision, proof: staleProof }))
      .toThrow("activation launch proof is stale");
    state = reduceGenerationState(state, {
      type: "confirm-launch",
      expectedRevision: state.revision,
      proof: { ...staleProof, launchId: launchIds[1] },
    });
    expect(state).toMatchObject({ active: generations[0], lastHealthy: generations[0], activationAttempt: null });
  });

  it("permits exactly one recovery launch before rollback", () => {
    let state = activated();
    state = reduceGenerationState(state, { type: "begin-launch", expectedRevision: state.revision, attemptId: attemptIds[0], launchId: launchIds[0] });
    state = reduceGenerationState(state, { type: "begin-launch", expectedRevision: state.revision, attemptId: attemptIds[0], launchId: launchIds[1] });
    expect(state.activationAttempt?.launchCount).toBe(2);
    expect(() => reduceGenerationState(state, { type: "begin-launch", expectedRevision: state.revision, attemptId: attemptIds[0], launchId: "launch-c" }))
      .toThrow("activation attempt retry budget is exhausted");
    state = reduceGenerationState(state, { type: "rollback", expectedRevision: state.revision, attemptId: attemptIds[0] });
    expect(state).toMatchObject({ active: null, lastHealthy: null, activationAttempt: null });
  });
});
