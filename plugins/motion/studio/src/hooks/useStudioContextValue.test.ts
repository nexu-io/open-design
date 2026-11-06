// @vitest-environment happy-dom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { PanelId } from "../components/dock/panelRegistry";
import { makeSelection } from "./domSelectionTestHarness";
import { useInspectorState, type InspectorState } from "./useStudioContextValue";

interface HarnessProps {
  rightPanel: PanelId | null;
  isPlaying: boolean;
  isGestureRecording: boolean;
  domEditSelection: DomEditSelection | null;
}

function renderInspectorState(props: HarnessProps): InspectorState {
  let state: InspectorState | null = null;

  function Harness() {
    state = useInspectorState(
      props.rightPanel,
      props.isPlaying,
      props.domEditSelection,
      props.isGestureRecording,
    );
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));
  if (!state) throw new Error("Expected inspector state");
  return state;
}

function selectedProps(
  overrides: Partial<HarnessProps> = {},
): HarnessProps & { domEditSelection: DomEditSelection } {
  const element = document.createElement("div");
  return {
    rightPanel: "renders",
    isPlaying: false,
    isGestureRecording: false,
    domEditSelection: makeSelection("Selected", element),
    ...overrides,
  };
}

describe("useInspectorState", () => {
  it("shows the motion path for pure selection with the inspector collapsed", () => {
    expect(renderInspectorState(selectedProps()).shouldShowMotionPath).toBe(true);
  });

  it("hides the motion path without a selection", () => {
    expect(
      renderInspectorState({ ...selectedProps(), domEditSelection: null }).shouldShowMotionPath,
    ).toBe(false);
  });

  it("hides the motion path during playback", () => {
    expect(renderInspectorState(selectedProps({ isPlaying: true })).shouldShowMotionPath).toBe(
      false,
    );
  });

  it("hides the motion path during gesture recording", () => {
    expect(
      renderInspectorState(selectedProps({ isGestureRecording: true })).shouldShowMotionPath,
    ).toBe(false);
  });

  it("keeps selected DOM bounds coupled to the inspector or variables panel", () => {
    expect(renderInspectorState(selectedProps()).shouldShowSelectedDomBounds).toBe(false);
    expect(
      renderInspectorState(selectedProps({ rightPanel: "design" })).shouldShowSelectedDomBounds,
    ).toBe(true);
    expect(
      renderInspectorState(selectedProps({ rightPanel: "variables" })).shouldShowSelectedDomBounds,
    ).toBe(true);
  });
});
