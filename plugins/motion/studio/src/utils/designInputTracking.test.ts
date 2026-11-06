import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackStudioEvent = vi.fn();
vi.mock("./studioTelemetry", () => ({
  trackStudioEvent: (...args: unknown[]) => trackStudioEvent(...args),
}));

import {
  __resetDesignInputThrottle,
  slugifyDesignInput,
  trackDesignInput,
} from "./designInputTracking";

beforeEach(() => {
  trackStudioEvent.mockReset();
  __resetDesignInputThrottle();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trackDesignInput", () => {
  it("emits one design_input event with ui/section/control/name", () => {
    trackDesignInput({ ui: "flat", section: "Style", control: "metric", name: "Opacity" });
    expect(trackStudioEvent).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledWith("design_input", {
      ui: "flat",
      section: "style",
      control: "metric",
      name: "opacity",
    });
  });

  it("slugifies compound names and sections", () => {
    trackDesignInput({
      ui: "classic",
      section: "Color Grading",
      control: "slider",
      name: "Font Size",
    });
    expect(trackStudioEvent).toHaveBeenCalledWith("design_input", {
      ui: "classic",
      section: "color-grading",
      control: "slider",
      name: "font-size",
    });
  });

  it("marks an unresolved name as 'unnamed' (R3 coverage signal)", () => {
    trackDesignInput({ ui: "classic", section: "style", control: "button", name: "" });
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "design_input",
      expect.objectContaining({ name: "unnamed" }),
    );
  });

  it("coalesces repeated fires of the same input within the window (R4)", () => {
    const nowSpy = vi.spyOn(performance, "now");
    // Same key, three quick fires -> 1 event.
    nowSpy.mockReturnValue(1000);
    trackDesignInput({ ui: "flat", section: "style", control: "slider", name: "opacity" });
    nowSpy.mockReturnValue(1100);
    trackDesignInput({ ui: "flat", section: "style", control: "slider", name: "opacity" });
    nowSpy.mockReturnValue(1500);
    trackDesignInput({ ui: "flat", section: "style", control: "slider", name: "opacity" });
    expect(trackStudioEvent).toHaveBeenCalledTimes(1);

    // A different input within the window is NOT collapsed.
    nowSpy.mockReturnValue(1550);
    trackDesignInput({ ui: "flat", section: "style", control: "slider", name: "scale" });
    expect(trackStudioEvent).toHaveBeenCalledTimes(2);

    // Same input after the window fires again.
    nowSpy.mockReturnValue(2200);
    trackDesignInput({ ui: "flat", section: "style", control: "slider", name: "opacity" });
    expect(trackStudioEvent).toHaveBeenCalledTimes(3);
  });

  it("never throws even if the underlying tracker throws", () => {
    trackStudioEvent.mockImplementation(() => {
      throw new Error("ingest down");
    });
    expect(() =>
      trackDesignInput({ ui: "flat", section: "style", control: "metric", name: "opacity" }),
    ).not.toThrow();
  });
});

describe("slugifyDesignInput", () => {
  it("lowercases, collapses non-alphanumerics, and trims dashes", () => {
    expect(slugifyDesignInput("  Border Radius (px) ")).toBe("border-radius-px");
    expect(slugifyDesignInput("X")).toBe("x");
    expect(slugifyDesignInput("---")).toBe("");
  });
});
