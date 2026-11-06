// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackDesignInput = vi.fn();
vi.mock("../utils/designInputTracking", () => ({
  trackDesignInput: (...args: unknown[]) => trackDesignInput(...args),
}));

import { DesignPanelInputProvider, useTrackDesignInput } from "./DesignPanelInputContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => trackDesignInput.mockReset());
afterEach(() => {
  document.body.innerHTML = "";
});

function FireButton({ control, name }: { control: string; name: string }) {
  const track = useTrackDesignInput();
  return (
    <button type="button" onClick={() => track(control, name)}>
      fire
    </button>
  );
}

function renderAndClick(tree: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(tree));
  act(() => {
    host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  act(() => root.unmount());
}

describe("DesignPanelInputContext", () => {
  it("binds the tracker to the enclosing ui + section", () => {
    renderAndClick(
      <DesignPanelInputProvider ui="flat" section="style">
        <FireButton control="metric" name="Opacity" />
      </DesignPanelInputProvider>,
    );
    expect(trackDesignInput).toHaveBeenCalledWith({
      ui: "flat",
      section: "style",
      control: "metric",
      name: "Opacity",
    });
  });

  it("nested provider overrides section but inherits ui from parent", () => {
    renderAndClick(
      <DesignPanelInputProvider ui="flat" section="outer">
        <DesignPanelInputProvider section="color-grading">
          <FireButton control="slider" name="Exposure" />
        </DesignPanelInputProvider>
      </DesignPanelInputProvider>,
    );
    expect(trackDesignInput).toHaveBeenCalledWith({
      ui: "flat",
      section: "color-grading",
      control: "slider",
      name: "Exposure",
    });
  });

  it("defaults to classic/unknown with no provider", () => {
    renderAndClick(<FireButton control="button" name="Reset" />);
    expect(trackDesignInput).toHaveBeenCalledWith({
      ui: "classic",
      section: "unknown",
      control: "button",
      name: "Reset",
    });
  });
});
