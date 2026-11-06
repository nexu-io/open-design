import { describe, expect, it, vi } from "vitest";

vi.mock("./studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

import { trackStudioEvent } from "./studioTelemetry";
import { declinedCutover } from "./sdkEditTransaction";

describe("declinedCutover telemetry", () => {
  it("emits sdk_cutover_declined with reason and family, and returns the declined result", () => {
    const result = declinedCutover("target_not_found", "timing");
    expect(result).toEqual({ status: "declined", reason: "target_not_found" });
    expect(trackStudioEvent).toHaveBeenCalledWith("sdk_cutover_declined", {
      reason: "target_not_found",
      family: "timing",
    });
  });

  it("emits family:null when the decline happens before a family is known", () => {
    declinedCutover("no_change");
    expect(trackStudioEvent).toHaveBeenCalledWith("sdk_cutover_declined", {
      reason: "no_change",
      family: null,
    });
  });

  it("omits resolverDisagreement when it is not set, and carries it when it is", () => {
    declinedCutover("target_not_found", "timing");
    expect(trackStudioEvent).toHaveBeenLastCalledWith("sdk_cutover_declined", {
      reason: "target_not_found",
      family: "timing",
    });

    declinedCutover("target_not_found", "timing", true);
    expect(trackStudioEvent).toHaveBeenLastCalledWith("sdk_cutover_declined", {
      reason: "target_not_found",
      family: "timing",
      resolverDisagreement: true,
    });

    declinedCutover("target_not_found", "timing", false);
    expect(trackStudioEvent).toHaveBeenLastCalledWith("sdk_cutover_declined", {
      reason: "target_not_found",
      family: "timing",
    });
  });
});
