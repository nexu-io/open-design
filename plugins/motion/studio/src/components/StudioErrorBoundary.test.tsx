// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
vi.mock("../telemetry/policy", () => ({ browserTelemetryAllowed: () => true }));
vi.mock("../telemetry/events", () => ({
  trackStudioFeedback: vi.fn(),
  trackStudioFeedbackShown: vi.fn(),
  trackStudioFeedbackDismissed: vi.fn(),
  trackStudioFeedbackInterviewClick: vi.fn(),
}));

const { StudioErrorBoundary } = await import("./StudioErrorBoundary");
const { trackStudioFeedbackShown } = await import("../telemetry/events");

function Boom(): React.ReactElement {
  throw new Error("timeline exploded");
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // React logs the caught error itself; the boundary is the thing under test.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  consoleError.mockRestore();
});

const renderCrashed = () =>
  act(() => {
    root.render(
      <StudioErrorBoundary>
        <Boom />
      </StudioErrorBoundary>,
    );
  });

describe("StudioErrorBoundary", () => {
  it("shows the crash screen with the error message and both recovery paths", () => {
    renderCrashed();
    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).toContain("timeline exploded");
    expect(container.textContent).toContain("Try again");
    expect(container.textContent).toContain("Reload Studio");
  });

  it("asks what the user was doing, since the stack trace cannot say", () => {
    renderCrashed();
    const card = container.querySelector('[aria-label="Send feedback to the HyperFrames team"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Studio crashed. What were you doing?");
  });

  it("offers one-tap answers instead of a 0-10 score", () => {
    renderCrashed();
    const card = container.querySelector('[aria-label="Send feedback to the HyperFrames team"]');
    const chips = [...(card?.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent?.trim())
      .filter((t) => t && t !== "Send");
    expect(chips).toContain("Editing the timeline");
    expect(chips).toContain("Just opened it");
    // Rating a crash is a question with no useful answer.
    expect(card?.querySelector('input[name="hf-studio-feedback-rating"]')).toBeNull();
  });

  it("reports the crash prompt to telemetry so the funnel is visible", () => {
    renderCrashed();
    expect(trackStudioFeedbackShown).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "crash" }),
    );
  });

  it("stays quiet when the user already gave feedback recently", () => {
    localStorage.setItem("hyperframes-studio:feedbackAnsweredAt", String(Date.now()));
    renderCrashed();
    // The crash screen itself still works; only the ask is suppressed.
    expect(container.textContent).toContain("Something went wrong");
    expect(
      container.querySelector('[aria-label="Send feedback to the HyperFrames team"]'),
    ).toBeNull();
  });
});
