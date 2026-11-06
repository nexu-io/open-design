import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackPreviewEditResult } from "./previewFeatureUsage";
import { trackStudioEvent } from "./studioTelemetry";
vi.mock("./studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("preview write usage", () => {
  it.each([
    { ok: true, changed: true },
    {
      ok: true,
      persistence: { changed: true, sourceFile: "private.html", content: "private text" },
    },
  ])("sends only gesture metadata after a changed result", (result) => {
    trackPreviewEditResult("resize", "drag", result);
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: "resize",
      surface: "preview",
      method: "drag",
    });
  });
  it.each([
    undefined,
    null,
    {},
    { ok: false, changed: true },
    { changed: false },
    { persistence: { changed: false } },
  ])("does not count unavailable, failed or unchanged results (%j)", (result) => {
    trackPreviewEditResult("move", "drag", result);
    expect(trackStudioEvent).not.toHaveBeenCalled();
  });
});
