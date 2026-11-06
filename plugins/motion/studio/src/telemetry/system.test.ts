// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The `studio_*` transport carries browser metadata built here, and this is its
// only test. tab_id has a module test of its own, but nothing there fails if
// this file stops attaching it — the two are separate facts.
describe("browser system meta", () => {
  // Both modules are imported AFTER resetModules so they share one tabId
  // instance; a top-level import would be a different copy of the memo.
  beforeEach(() => {
    vi.resetModules();
  });

  async function load() {
    const [{ getBrowserSystemMeta }, tab] = await Promise.all([
      import("./system"),
      import("./tabId"),
    ]);
    return { getBrowserSystemMeta, resolveTabId: tab.resolveTabId };
  }

  it("carries the tab id, from the same source as the studio:* transport", async () => {
    const { getBrowserSystemMeta, resolveTabId } = await load();
    expect(getBrowserSystemMeta().tab_id).toBe(resolveTabId());
  });

  it("keeps the meta memoized, so one page reports one tab id", async () => {
    const { getBrowserSystemMeta } = await load();
    const first = getBrowserSystemMeta();
    expect(getBrowserSystemMeta()).toBe(first);
    expect(getBrowserSystemMeta().tab_id).toBe(first.tab_id);
  });

  it("has a tab id in the no-DOM fallback, not an empty string", async () => {
    // The empty-meta branch is taken on SSR. An empty or missing tab_id would
    // read in PostHog as "this event predates the property" rather than "this
    // event has no page", which is the encoding mistake this property exists
    // to avoid. Stubbing the globals is what actually reaches that branch —
    // happy-dom otherwise satisfies the `typeof window` check every time.
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    const { getBrowserSystemMeta } = await load();
    const meta = getBrowserSystemMeta();
    expect(meta.user_agent).toBe("");
    expect(typeof meta.tab_id).toBe("string");
    expect(meta.tab_id.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
