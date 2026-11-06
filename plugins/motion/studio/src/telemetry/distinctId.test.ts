// @vitest-environment happy-dom

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  resolveStudioDistinctId,
  getCliDistinctId,
  __resetStudioDistinctIdForTests,
  DISTINCT_ID_KEY,
  LEGACY_STUDIO_ANON_ID_KEY,
} from "./distinctId";

function clearCliId(): void {
  delete window.__HF_CLI_DISTINCT_ID;
}

describe("resolveStudioDistinctId", () => {
  beforeEach(() => {
    localStorage.clear();
    clearCliId();
    __resetStudioDistinctIdForTests();
  });

  afterEach(() => {
    clearCliId();
    __resetStudioDistinctIdForTests();
  });

  it("adopts the CLI-seeded id and persists it to both keys", () => {
    window.__HF_CLI_DISTINCT_ID = "cli-machine-uuid";
    const id = resolveStudioDistinctId();
    expect(id).toBe("cli-machine-uuid");
    expect(localStorage.getItem(DISTINCT_ID_KEY)).toBe("cli-machine-uuid");
    expect(localStorage.getItem(LEGACY_STUDIO_ANON_ID_KEY)).toBe("cli-machine-uuid");
  });

  it("prefers the CLI id even over an existing persisted id", () => {
    localStorage.setItem(DISTINCT_ID_KEY, "old-browser-id");
    window.__HF_CLI_DISTINCT_ID = "cli-machine-uuid";
    expect(resolveStudioDistinctId()).toBe("cli-machine-uuid");
  });

  it("ignores an empty CLI id and falls back to the persisted id", () => {
    window.__HF_CLI_DISTINCT_ID = "";
    localStorage.setItem(DISTINCT_ID_KEY, "persisted-id");
    expect(resolveStudioDistinctId()).toBe("persisted-id");
  });

  it("reuses the canonical persisted id when no CLI id is present", () => {
    localStorage.setItem(DISTINCT_ID_KEY, "canonical-id");
    const id = resolveStudioDistinctId();
    expect(id).toBe("canonical-id");
    // Backfills the legacy key so both clients agree.
    expect(localStorage.getItem(LEGACY_STUDIO_ANON_ID_KEY)).toBe("canonical-id");
  });

  it("reuses the legacy key when only it exists, and backfills the canonical key", () => {
    localStorage.setItem(LEGACY_STUDIO_ANON_ID_KEY, "legacy-id");
    const id = resolveStudioDistinctId();
    expect(id).toBe("legacy-id");
    expect(localStorage.getItem(DISTINCT_ID_KEY)).toBe("legacy-id");
  });

  it("mints and persists a new id when nothing exists (standalone Studio)", () => {
    const id = resolveStudioDistinctId();
    expect(id).toBeTruthy();
    expect(localStorage.getItem(DISTINCT_ID_KEY)).toBe(id);
    expect(localStorage.getItem(LEGACY_STUDIO_ANON_ID_KEY)).toBe(id);
  });

  it("memoizes the resolved id within a session", () => {
    const first = resolveStudioDistinctId();
    localStorage.setItem(DISTINCT_ID_KEY, "changed-underneath");
    expect(resolveStudioDistinctId()).toBe(first);
  });

  it("memoizes an adopted CLI id even if window.__HF_CLI_DISTINCT_ID changes later", () => {
    window.__HF_CLI_DISTINCT_ID = "cli-id-1";
    expect(resolveStudioDistinctId()).toBe("cli-id-1");
    // A late reassignment of the injected global must not change the resolved id.
    window.__HF_CLI_DISTINCT_ID = "cli-id-2";
    expect(resolveStudioDistinctId()).toBe("cli-id-1");
  });
});

describe("getCliDistinctId", () => {
  beforeEach(() => {
    clearCliId();
  });

  it("returns the injected id when present", () => {
    window.__HF_CLI_DISTINCT_ID = "cli-id";
    expect(getCliDistinctId()).toBe("cli-id");
  });

  it("returns null when absent", () => {
    expect(getCliDistinctId()).toBeNull();
  });

  it("returns null for an empty string", () => {
    window.__HF_CLI_DISTINCT_ID = "";
    expect(getCliDistinctId()).toBeNull();
  });
});

describe("no-storage fallback must not collapse the population", () => {
  const realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  beforeEach(() => {
    __resetStudioDistinctIdForTests();
    // Simulate a hardened / partitioned context where safeLocalStorage()
    // returns null.
    Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true });
  });

  afterEach(() => {
    if (realLocalStorage) Object.defineProperty(globalThis, "localStorage", realLocalStorage);
    __resetStudioDistinctIdForTests();
  });

  it("is stable within a session", () => {
    const first = resolveStudioDistinctId();
    expect(resolveStudioDistinctId()).toBe(first);
    expect(first).toBeTruthy();
  });

  // Regression: this used to return the shared literal "anonymous", so every
  // storage-restricted profile was ONE bucketing unit. Against the shipped
  // hash `calibration-50:anonymous` lands in bucket 44, so that whole
  // population was enrolled at a nominal 50% and would flip together on a
  // ramp — and they all merged into one PostHog person.
  it("differs across sessions rather than sharing one constant", () => {
    const first = resolveStudioDistinctId();
    __resetStudioDistinctIdForTests();
    const second = resolveStudioDistinctId();
    expect(second).not.toBe(first);
    expect(first).not.toBe("anonymous");
  });
});
