// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyPanelFlatFooter } from "./PropertyPanelFlatFooter";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderFooter(overrides: Partial<Parameters<typeof PropertyPanelFlatFooter>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<PropertyPanelFlatFooter {...overrides} />);
  });
  return { host, root };
}

describe("PropertyPanelFlatFooter", () => {
  it("renders the ask-agent affordance and fires onAskAgent on click", () => {
    const onAskAgent = vi.fn();
    const { host, root } = renderFooter({ onAskAgent });
    expect(host.textContent).toContain("Ask agent about this element");
    const askButton = host.querySelector<HTMLButtonElement>('[data-flat-footer-ask="true"]');
    act(() => askButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAskAgent).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("shows the idle record affordance and toggles recording on click", () => {
    const onToggleRecording = vi.fn();
    const { host, root } = renderFooter({ recordingState: "idle", onToggleRecording });
    const recordButton = host.querySelector<HTMLButtonElement>('[data-flat-footer-record="true"]');
    expect(recordButton?.title).toBe("Record gesture (R)");
    act(() => recordButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onToggleRecording).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("shows the recording duration while recording", () => {
    const { host, root } = renderFooter({
      recordingState: "recording",
      recordingDuration: 2.4,
      onToggleRecording: vi.fn(),
    });
    const recordButton = host.querySelector<HTMLButtonElement>('[data-flat-footer-record="true"]');
    expect(recordButton?.title).toBe("Stop recording 2.4s");
    act(() => root.unmount());
  });

  // Plan 10 (sticky-footer-gap): the root must carry an opaque background —
  // it previously had none at all, letting scrolled panel content show
  // through. Regression coverage for the definite fix from the brief.
  it("has an opaque bg-panel-bg background on its root element", () => {
    const { host, root } = renderFooter({ onAskAgent: vi.fn() });
    const footerRoot = host.firstElementChild as HTMLElement;
    expect(footerRoot.className).toContain("bg-panel-bg");
    act(() => root.unmount());
  });

  // Plan 11 (scrollable-open-section): the prior sticky-stacking mechanism —
  // and the Plan 10 hairline-sealing hack it required at this exact boundary
  // (an absolutely-positioned overlay patching a Chromium sticky-offset
  // rounding gap) — is gone now that nothing above the footer is
  // `position: sticky`. Live browser verification (p11 report) confirmed the
  // boundary renders as a single clean hairline without it: whatever
  // immediately precedes the footer (a collapsed FlatGroupHeader, or the open
  // group's scrollable body wrapper) already draws its own border-b in normal
  // document flow, so the footer needs no border or seal of its own.
  it("renders no seal overlay and no border of its own — the boundary line comes from whatever precedes it", () => {
    const { host, root } = renderFooter({ onAskAgent: vi.fn() });
    const footerRoot = host.firstElementChild as HTMLElement;
    expect(footerRoot.className).not.toContain("border-t");
    expect(footerRoot.className).not.toContain("border-b");
    expect(host.querySelector('[data-flat-footer-seal="true"]')).toBeNull();
    act(() => root.unmount());
  });
});
