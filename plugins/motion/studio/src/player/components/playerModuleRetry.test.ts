// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

// The module-scope kick in Player.tsx consumes the first attempt at import time,
// so this starts failing; the first test asserts that kick happened.
const state = vi.hoisted(() => ({ attempts: 0, failing: true }));

vi.mock("@hyperframes/player", () => {
  state.attempts += 1;
  if (state.failing) throw new Error("chunk load failed");
  return {};
});

import { loadPlayerModule } from "./Player";

describe("loadPlayerModule", () => {
  it("kicks the import at module scope, before any mount", () => {
    expect(state.attempts).toBe(1);
  });

  it("does not hand a later mount the promise a failed load already rejected", async () => {
    // vitest rewraps a throwing mock factory, so assert the rejection, not its text.
    await expect(loadPlayerModule()).rejects.toThrow();
    const failedAttempts = state.attempts;

    state.failing = false;

    await expect(loadPlayerModule()).resolves.toBeDefined();
    expect(state.attempts).toBeGreaterThan(failedAttempts);
  });

  it("hands every mount the same resolved promise", async () => {
    state.failing = false;
    const first = loadPlayerModule();
    await first;

    expect(loadPlayerModule()).toBe(first);
    expect(loadPlayerModule()).toBe(first);
  });
});
