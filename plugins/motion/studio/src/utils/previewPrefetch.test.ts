// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchPreviewForHash } from "./previewPrefetch";

describe("prefetchPreviewForHash", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the opening project's preview once, not on every hash update", () => {
    const fetchStub = vi.fn(() => Promise.resolve(new Response("")));
    vi.stubGlobal("fetch", fetchStub);

    prefetchPreviewForHash("#project/demo");
    prefetchPreviewForHash("#project/demo?t=2&tab=design");
    prefetchPreviewForHash("#project/other");
    prefetchPreviewForHash("#settings");

    expect(fetchStub.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/api/projects/demo/preview",
      "/api/projects/other/preview",
    ]);
  });
});
