import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTabIdForTests, resolveTabId, tabIdProperty } from "./tabId";

afterEach(() => {
  resetTabIdForTests();
});

describe("tab id", () => {
  it("is stable for the life of the page", () => {
    // The whole value of the property: every event from one page load must
    // carry the SAME id, or a burst still reads as several sources.
    const first = resolveTabId();
    expect(resolveTabId()).toBe(first);
    expect(tabIdProperty()).toBe(first);
  });

  it("is not empty, since an empty value would read as an absent one", () => {
    expect(resolveTabId().length).toBeGreaterThan(0);
  });

  it("mints a new id after a fresh page load", () => {
    // resetTabIdForTests stands in for a reload: the memo is all that survives
    // a page, so clearing it is exactly what a reload does.
    const first = resolveTabId();
    resetTabIdForTests();
    expect(resolveTabId()).not.toBe(first);
  });

  it("never touches storage", () => {
    // Deliberate: a stored id would drift into a tab-session id, silently
    // changing what every query means. This asserts the intent directly rather
    // than inferring it, so adding a read OR a write fails here.
    const seen: string[] = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (seen.push(`get:${k}`), null),
      setItem: (k: string) => void seen.push(`set:${k}`),
      removeItem: (k: string) => void seen.push(`remove:${k}`),
    });
    resolveTabId();
    expect(seen).toEqual([]);
    vi.unstubAllGlobals();
  });
});
