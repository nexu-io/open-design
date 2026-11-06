// @vitest-environment happy-dom

/**
 * The track toggle's accessible contract: the label names the action, carries
 * the display row, and reads mute on an audio-only track.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlainTrackHeader, VisibilityButton } from "./TimelineTrackPlainHeader";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderButton(props: {
  hidden: boolean;
  asMute?: boolean;
  trackDisplayNumber: number | null;
}): { host: HTMLElement; unmount: () => void; onToggle: ReturnType<typeof vi.fn> } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onToggle = vi.fn();
  act(() =>
    root.render(
      React.createElement(VisibilityButton, {
        hidden: props.hidden,
        trackNumber: 7,
        trackDisplayNumber: props.trackDisplayNumber,
        asMute: props.asMute ?? false,
        onToggle,
      }),
    ),
  );
  return { host, unmount: () => act(() => root.unmount()), onToggle };
}

const labelOf = (host: HTMLElement) => host.querySelector("button")?.getAttribute("aria-label");

describe("VisibilityButton", () => {
  it("names the action, not the state", () => {
    const shown = renderButton({ hidden: false, trackDisplayNumber: 2 });
    expect(labelOf(shown.host)).toBe("Hide track 2");
    shown.unmount();
    const hiddenRow = renderButton({ hidden: true, trackDisplayNumber: 2 });
    expect(labelOf(hiddenRow.host)).toBe("Show track 2");
    hiddenRow.unmount();
  });

  it("keeps each row's name unique, so two tracks are distinguishable", () => {
    const first = renderButton({ hidden: false, trackDisplayNumber: 1 });
    const second = renderButton({ hidden: false, trackDisplayNumber: 3 });
    expect(labelOf(first.host)).toBe("Hide track 1");
    expect(labelOf(second.host)).toBe("Hide track 3");
    expect(labelOf(first.host)).not.toBe(labelOf(second.host));
    first.unmount();
    second.unmount();
  });

  // The callback acts on the REAL track key; the display row rides along so the
  // undo-history label announces the same row this button just did, instead of
  // re-deriving it from an ordering that has no group anchors in it.
  it("toggles the real track number and passes the row it announced", () => {
    const view = renderButton({ hidden: false, trackDisplayNumber: 2 });
    view.host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(view.onToggle).toHaveBeenCalledWith(7, true, 2);
    view.unmount();
  });

  it("names a mute on an audio-only track", () => {
    const audible = renderButton({ hidden: false, asMute: true, trackDisplayNumber: 2 });
    expect(labelOf(audible.host)).toBe("Mute track 2");
    audible.unmount();
    const muted = renderButton({ hidden: true, asMute: true, trackDisplayNumber: 2 });
    expect(labelOf(muted.host)).toBe("Unmute track 2");
    muted.unmount();
  });
});

describe("PlainTrackHeader", () => {
  function renderHeader(overrides: Partial<Parameters<typeof PlainTrackHeader>[0]> = {}) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        React.createElement(PlainTrackHeader, {
          trackNumber: 0,
          trackDisplayNumber: 1,
          trackLabel: "Voiceover",
          clipCount: 1,
          isTrackHidden: false,
          isAudioTrack: true,
          isAudioOnly: true,
          onToggleTrackHidden: vi.fn(),
          showTrackLabel: true,
          ...overrides,
        }),
      ),
    );
    return { host, unmount: () => act(() => root.unmount()) };
  }

  it("offers a mute on an audible audio track", () => {
    const view = renderHeader();
    expect(labelOf(view.host)).toBe("Mute track 1");
    view.unmount();
  });

  it("offers the unmute on a muted audio track", () => {
    const view = renderHeader({ isTrackHidden: true });
    expect(labelOf(view.host)).toBe("Unmute track 1");
    view.unmount();
  });

  it("keeps the eye on a visual track", () => {
    const view = renderHeader({ isAudioTrack: false, isAudioOnly: false });
    expect(labelOf(view.host)).toBe("Hide track 1");
    view.unmount();
  });

  it("truncates long names and keeps the full name in the tooltip", () => {
    const name = "A-very-long-unbroken-clip-name-for-the-timeline";
    const view = renderHeader({ trackLabel: name });
    const label = view.host.querySelector("span[title]");
    expect(label?.className).toContain("truncate");
    expect(label?.className).not.toContain("wrap-break-word");
    expect(label?.getAttribute("title")).toBe(name);
    view.unmount();
  });
});
