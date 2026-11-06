import { describe, expect, it } from "vitest";

import { previewNavigationFailureFromDidFailLoad } from "../../src/main/runtime.js";

describe("preview navigation failure forwarding", () => {
  it("forwards only aborted Open Design preview transport subframe navigations", () => {
    expect(previewNavigationFailureFromDidFailLoad({
      errorCode: -3,
      eventId: 1,
      frameName: "od-artifact-preview-srcdoc",
      isMainFrame: false,
      occurredAtMs: 1234,
      validatedUrl: "about:srcdoc",
    })).toEqual({
      errorCode: -3,
      eventId: 1,
      frameName: "od-artifact-preview-srcdoc",
      occurredAtMs: 1234,
      validatedUrl: "about:srcdoc",
    });

    expect(previewNavigationFailureFromDidFailLoad({
      errorCode: -3,
      eventId: 2,
      frameName: "od-artifact-preview-srcdoc",
      isMainFrame: false,
      occurredAtMs: 1235,
      validatedUrl: "blob:od://app/preview-document",
    })).toEqual({
      errorCode: -3,
      eventId: 2,
      frameName: "od-artifact-preview-srcdoc",
      occurredAtMs: 1235,
      validatedUrl: "blob:od://app/preview-document",
    });

    expect(previewNavigationFailureFromDidFailLoad({
      errorCode: -3,
      eventId: 3,
      isMainFrame: true,
      occurredAtMs: 1236,
      validatedUrl: "about:srcdoc",
    })).toBeNull();
    expect(previewNavigationFailureFromDidFailLoad({
      errorCode: -6,
      eventId: 4,
      isMainFrame: false,
      occurredAtMs: 1237,
      validatedUrl: "about:srcdoc",
    })).toBeNull();
    expect(previewNavigationFailureFromDidFailLoad({
      errorCode: -3,
      eventId: 5,
      isMainFrame: false,
      occurredAtMs: 1238,
      validatedUrl: "https://example.com/",
    })).toBeNull();
    expect(previewNavigationFailureFromDidFailLoad({
      errorCode: -3,
      eventId: 6,
      isMainFrame: false,
      occurredAtMs: 1239,
      validatedUrl: "blob:https://example.com/preview-document",
    })).toBeNull();
  });
});
