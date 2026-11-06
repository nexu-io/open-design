// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { TimelineClip } from "./TimelineClip";
import { ClipFadesContext } from "./TimelineClipFades";
import type { TimelineEditCapabilities } from "./timelineEditing";
import { defaultTimelineTheme, type TimelineTheme } from "./timelineTheme";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

afterEach(() => {
  document.body.innerHTML = "";
});

const capabilities: TimelineEditCapabilities = {
  canMove: true,
  canTrimStart: true,
  canTrimEnd: true,
};

function renderClip({
  element,
  pps = 100,
  isSelected = false,
  hasCustomContent = true,
  theme = defaultTimelineTheme,
}: {
  element: TimelineElement;
  pps?: number;
  isSelected?: boolean;
  hasCustomContent?: boolean;
  theme?: TimelineTheme;
}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClick = vi.fn();

  act(() => {
    root.render(
      <TimelineClip
        el={element}
        pps={pps}
        clipY={0}
        isSelected={isSelected}
        isHovered={false}
        hasCustomContent={hasCustomContent}
        capabilities={capabilities}
        theme={theme}
        isComposition={false}
        onHoverStart={vi.fn()}
        onHoverEnd={vi.fn()}
        onClick={onClick}
        onDoubleClick={vi.fn()}
      >
        <div data-custom-content="true" />
      </TimelineClip>,
    );
  });

  return { host, onClick, root };
}

describe("TimelineClip", () => {
  it("hands its content the clip's fades, and none to a clip the mixer does not hear", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(React.useContext(ClipFadesContext));
      return null;
    }
    const render = (element: TimelineElement) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      act(() => {
        root.render(
          <TimelineClip
            el={element}
            pps={100}
            clipY={0}
            isSelected={false}
            isHovered={false}
            hasCustomContent
            capabilities={capabilities}
            isComposition={false}
            onHoverStart={vi.fn()}
            onHoverEnd={vi.fn()}
            onClick={vi.fn()}
            onDoubleClick={vi.fn()}
          >
            <Probe />
          </TimelineClip>,
        );
      });
      act(() => root.unmount());
    };
    render({ id: "music", tag: "audio", start: 0, duration: 4, track: 0, fadeIn: 1, fadeOut: 0.5 });
    render({ id: "title", tag: "div", start: 0, duration: 4, track: 0, fadeIn: 1 });
    expect(seen).toEqual([{ fadeIn: 1, fadeOut: 0.5, duration: 4 }, null]);
  });

  it("gives both halves of a link group the same label colour, and unlinked clips none", () => {
    const colorOf = (element: TimelineElement) => {
      const { host, root } = renderClip({ element });
      const clip = host.querySelector<HTMLElement>(".timeline-clip");
      const color = clip?.getAttribute("data-link-color") ?? null;
      expect(clip?.style.getPropertyValue("--clip-link-color") || null).toBe(color);
      act(() => root.unmount());
      return color;
    };
    const base = { start: 0, duration: 2, track: 0 };
    const video = colorOf({ id: "v", tag: "video", link: "lk-3", ...base });
    expect(video).not.toBeNull();
    expect(colorOf({ id: "a", tag: "audio", link: "lk-3", ...base })).toBe(video);
    expect(colorOf({ id: "b", tag: "audio", link: "lk-4", ...base })).not.toBe(video);
    expect(colorOf({ id: "c", tag: "audio", ...base })).toBeNull();
  });

  it("renders the clip label above custom content without showing default timecode", () => {
    const { host, root } = renderClip({
      element: { id: "hero", label: "Hero", tag: "div", start: 1, duration: 1, track: 0 },
    });

    expect(host.querySelector(".timeline-clip__name")?.textContent).toBe("Hero");
    expect(host.querySelector(".timeline-clip__timecode")).toBeNull();

    act(() => root.unmount());
  });

  it("names a speed-changed clip like Premiere: [150%] for a constant rate, [ramp] for a lane", () => {
    const fast = renderClip({
      element: {
        id: "a",
        label: "Hero",
        tag: "video",
        start: 0,
        duration: 2,
        track: 0,
        playbackRate: 1.5,
      },
    });
    expect(fast.host.querySelector(".timeline-clip__name")?.textContent).toBe("Hero [150%]");
    act(() => fast.root.unmount());
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "rate",
          points: [
            { t: 0, v: 0.5 },
            { t: 1, v: 1 },
          ],
        },
      ],
    });
    const ramp = renderClip({
      element: {
        id: "b",
        label: "Hero",
        tag: "video",
        start: 0,
        duration: 2,
        track: 0,
        automation,
      },
    });
    expect(ramp.host.querySelector(".timeline-clip__name")?.textContent).toBe("Hero [ramp]");
    act(() => ramp.root.unmount());
  });

  it("keeps the name band under 60px even when the clip is selected", () => {
    const { host, root } = renderClip({
      element: { id: "fx", label: "FX", tag: "div", start: 0, duration: 1, track: 0 },
      pps: 59,
      isSelected: true,
    });

    expect(host.querySelector(".timeline-clip__name")?.textContent).toBe("FX");
    expect(host.querySelector(".timeline-clip__timecode")).toBeNull();
    expect(host.querySelector(".timeline-clip")?.getAttribute("data-ladder")).toBe("picture");

    act(() => root.unmount());
  });

  it("keeps the label at 60px and fills one frame under 24px", () => {
    const labeled = renderClip({
      element: { id: "wide", label: "City", tag: "video", start: 0, duration: 1, track: 0 },
      pps: 200,
    });
    expect(labeled.host.querySelector(".timeline-clip__name")?.textContent).toBe("City");
    expect(labeled.host.querySelector(".timeline-clip")?.getAttribute("data-ladder")).toBe(
      "labeled",
    );
    expect(labeled.host.querySelector<HTMLElement>(".timeline-clip")?.style.borderRadius).toBe(
      "var(--timeline-clip-radius)",
    );
    act(() => labeled.root.unmount());

    const frame = renderClip({
      element: { id: "sliver", label: "City", tag: "img", start: 0, duration: 1, track: 0 },
      pps: 23,
      isSelected: true,
    });
    expect(frame.host.querySelector(".timeline-clip__name")?.textContent).toBe("City");
    expect(frame.host.querySelector(".timeline-clip")?.getAttribute("data-ladder")).toBe("frame");
    act(() => frame.root.unmount());
  });

  it("gives audio clips the pill radius", () => {
    const { host, root } = renderClip({
      element: { id: "vo", label: "Voice", tag: "audio", start: 0, duration: 2, track: 1 },
      pps: 100,
    });
    expect(host.querySelector<HTMLElement>(".timeline-clip")?.style.borderRadius).toBe(
      "var(--timeline-clip-audio-radius)",
    );
    act(() => root.unmount());
  });

  it("marks hidden clips for active-state suppression", () => {
    const { host, root } = renderClip({
      element: {
        id: "hidden",
        label: "Hidden",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
        hidden: true,
      },
    });

    expect(host.querySelector(".timeline-clip")?.getAttribute("data-clip-hidden")).toBe("true");

    act(() => root.unmount());
  });

  it("applies selected styling when rendered as selected", () => {
    const { host, root } = renderClip({
      element: { id: "selected", label: "Selected", tag: "div", start: 0, duration: 1, track: 0 },
      isSelected: true,
    });

    expect(host.querySelector(".timeline-clip")?.classList.contains("is-selected")).toBe(true);

    act(() => root.unmount());
  });

  it("passes clip and handle theme tokens to the rendered elements", () => {
    const theme: TimelineTheme = {
      ...defaultTimelineTheme,
      clipBackground: "var(--test-clip-bg)",
      clipBackgroundActive: "var(--test-clip-bg-active)",
      clipBackgroundHover: "var(--test-clip-bg-hover)",
      clipBackgroundDragging: "var(--test-clip-bg-dragging)",
      clipBorder: "var(--test-clip-border)",
      clipBorderHover: "var(--test-clip-border-hover)",
      clipBorderActive: "var(--test-clip-border-active)",
      handleColor: "var(--test-handle)",
    };
    const { host, root } = renderClip({
      element: { id: "themed", label: "Themed", tag: "div", start: 0, duration: 1, track: 0 },
      isSelected: true,
      theme,
    });
    const clip = host.querySelector<HTMLElement>(".timeline-clip")!;
    expect(clip.style.getPropertyValue("--clip-bg")).toBe("var(--test-clip-bg)");
    expect(clip.style.getPropertyValue("--clip-border-active")).toBe(
      "var(--test-clip-border-active)",
    );
    expect(clip.style.getPropertyValue("--clip-handle")).toBe("var(--test-handle)");
    expect(clip.querySelector<HTMLElement>(".timeline-clip__handle-bar")?.style.background).toBe(
      "var(--clip-handle)",
    );
    act(() => root.unmount());
  });

  it("keeps default token references off the properties they resolve", () => {
    const { host, root } = renderClip({
      element: {
        id: "default-theme",
        label: "Default",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
      },
      isSelected: true,
    });
    const clip = host.querySelector<HTMLElement>(".timeline-clip")!;
    expect(clip.style.getPropertyValue("--clip-bg")).toBe("var(--timeline-clip-bg)");
    expect(clip.style.getPropertyValue("--clip-bg")).not.toBe("var(--clip-bg)");
    expect(clip.style.getPropertyValue("--clip-handle")).toBe("var(--timeline-handle)");
    act(() => root.unmount());
  });

  it("is a roving native button with explicit selection semantics", () => {
    const { host, onClick, root } = renderClip({
      element: { id: "hero", label: "Hero", tag: "div", start: 1, duration: 2, track: 0 },
      isSelected: true,
    });
    const clip = host.querySelector<HTMLButtonElement>(".timeline-clip")!;
    expect(clip.type).toBe("button");
    expect(clip.tabIndex).toBe(-1);
    expect(clip.getAttribute("aria-pressed")).toBe("true");
    act(() => clip.click());
    expect(onClick).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
