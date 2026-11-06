// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineGroupHeader } from "./TimelineGroupHeader";
import { defaultTimelineTheme } from "./timelineTheme";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof TimelineGroupHeader>> = {},
): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <TimelineGroupHeader
        label="Voiceover"
        memberCount={5}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
        laneCount={0}
        isLaneOpen={false}
        onToggleLanes={vi.fn()}
        onFxChainChange={vi.fn()}
        onOpenFxRack={vi.fn()}
        columnWidth={220}
        theme={defaultTimelineTheme}
        {...overrides}
      />,
    );
  });
  return host;
}

/** The structural disclosure — the caret, not the `∿` lane toggle. */
function caret(host: HTMLElement): HTMLButtonElement {
  const el = Array.from(host.querySelectorAll("button")).find((b) =>
    b.getAttribute("aria-label")?.includes("tracks"),
  );
  if (!el) throw new Error("no disclosure caret");
  return el as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TimelineGroupHeader disclosure caret", () => {
  // Guards a regression that shipped once: the caret silently reverted to a
  // smaller, non-mono, rotated glyph unlike the property panel's carets.
  it("swaps the glyph rather than rotating one", () => {
    expect(caret(renderHeader({ isExpanded: false })).textContent).toContain("▸");
    expect(caret(renderHeader({ isExpanded: true })).textContent).toContain("▾");
  });

  it("does not rotate the glyph", () => {
    const glyph = caret(renderHeader({ isExpanded: true })).querySelector("span");
    expect(glyph?.getAttribute("style") ?? "").not.toContain("rotate");
  });

  it("keeps the caret mono at 13px, not back down at the 11px the row inherits", () => {
    // Only this component's own className — the panel carets are not read here,
    // and this does not claim to pin a match against them.
    const className = caret(renderHeader()).className;
    expect(className).toContain("font-mono");
    expect(className).toContain("text-[13px]");
    expect(className).not.toContain("text-[11px]");
  });
});
