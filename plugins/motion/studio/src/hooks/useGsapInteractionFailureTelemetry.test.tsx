// @vitest-environment happy-dom

import React, { act } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { mountReactHarness } from "./domSelectionTestHarness";
import { GsapEditBlockedError } from "./gsapEditOutcome";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { trackStudioEditBlocked, trackStudioSaveFailure } = vi.hoisted(() => ({
  trackStudioEditBlocked: vi.fn(),
  trackStudioSaveFailure: vi.fn(),
}));
vi.mock("../utils/studioSaveDiagnostics", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  trackStudioEditBlocked,
  trackStudioSaveFailure,
}));

import { useGsapInteractionFailureTelemetry } from "./useGsapInteractionFailureTelemetry";

const selection = {
  id: "clip",
  selector: "#clip",
  element: document.createElement("div"),
} as unknown as DomEditSelection;

function mountFailureTelemetry(showToast: Mock) {
  let report!: ReturnType<typeof useGsapInteractionFailureTelemetry>;
  function Harness() {
    report = useGsapInteractionFailureTelemetry("index.html", showToast);
    return null;
  }
  const root = mountReactHarness(<Harness />);
  return { report, root };
}

describe("useGsapInteractionFailureTelemetry", () => {
  beforeEach(() => {
    trackStudioEditBlocked.mockClear();
    trackStudioSaveFailure.mockClear();
  });

  it("tracks an expected edit block separately from save failures", () => {
    const showToast = vi.fn();
    const { report, root } = mountFailureTelemetry(showToast);

    act(() => report(new GsapEditBlockedError("unroll-required"), selection, "drag", "Move"));

    expect(showToast).toHaveBeenCalledWith(
      "This motion comes from a helper or loop. Choose Unroll to edit it explicitly.",
      "error",
    );
    expect(trackStudioEditBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ source: "gsap_commit", mutationType: "drag", targetId: "clip" }),
    );
    expect(trackStudioSaveFailure).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("keeps unexpected GSAP persistence errors in save_failure", () => {
    const showToast = vi.fn();
    const { report, root } = mountFailureTelemetry(showToast);
    const error = new Error("network dropped");

    act(() => report(error, selection, "drag", "Move"));

    expect(trackStudioSaveFailure).toHaveBeenCalledWith(
      expect.objectContaining({ source: "gsap_commit", error, mutationType: "drag" }),
    );
    expect(trackStudioEditBlocked).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
