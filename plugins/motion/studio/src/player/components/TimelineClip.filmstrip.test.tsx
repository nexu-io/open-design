// @vitest-environment happy-dom

import React, { act } from "react";
import { compile } from "tailwindcss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadStylesheet, STYLES_DIR } from "../../styles/styleSources";
import { cleanupMounted, trackedRoot } from "../../components/ui/mountHost.testHelpers";
import { TimelineClip } from "./TimelineClip";
import { WAVEFORM_LAYER_Z } from "./AudioWaveform";
import { renderClipChildren } from "./timelineClipChildren";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";

let css: string;

beforeAll(async () => {
  css = (
    await compile('@import "tailwindcss";\n@import "./theme.css";\n@import "./components.css";', {
      base: STYLES_DIR,
      loadStylesheet: async (id, base) => loadStylesheet(id, base),
    })
  ).build(["absolute", "inset-0", "overflow-hidden"]);
});

afterEach(() => {
  cleanupMounted();
  usePlayerStore.getState().setLintFindingsByElement(new Map());
  usePlayerStore.getState().setElements([]);
  document.body.innerHTML = "";
});

function render(tag: string, overrides: Partial<TimelineElement> = {}, picture = true) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = trackedRoot(host);
  const element: TimelineElement = {
    id: "clip",
    label: "City",
    tag,
    start: 0,
    duration: 1,
    track: 0,
    ...overrides,
  };
  const renderContent = picture ? () => <img alt="" /> : undefined;
  act(() => {
    root.render(
      <TimelineClip
        el={element}
        pps={200}
        clipY={0}
        clipHeight={42}
        isSelected
        isHovered={false}
        hasCustomContent={picture}
        capabilities={{ canMove: true, canTrimStart: true, canTrimEnd: true }}
        isComposition={false}
        onHoverStart={vi.fn()}
        onHoverEnd={vi.fn()}
        onClick={vi.fn()}
        onDoubleClick={vi.fn()}
      >
        {renderClipChildren(
          element,
          { clip: "#222", label: "#fff", accent: "#fff" },
          renderContent,
          undefined,
        )}
      </TimelineClip>,
    );
  });
  return host;
}

describe("Filmstrip clips", () => {
  it.each(["video", "img"])("reserves a 15px name band above %s pictures", (tag) => {
    const host = render(tag);
    const name = host.querySelector(".timeline-clip__name");
    const picture = host.querySelector(".timeline-clip__content");
    expect(name?.textContent).toBe("City");
    expect(picture).not.toBeNull();
    expect(picture?.querySelector("img")).not.toBeNull();
    expect(css).toMatch(/--timeline-clip-band-height:\s*15px;/);
    expect(css).toMatch(
      /\.timeline-clip:not\(\.is-audio\) \.timeline-clip__label\s*\{[^}]*height:\s*var\(--timeline-clip-band-height\)/,
    );
    expect(css).toMatch(
      /\.timeline-clip:not\(\.is-audio\) \.timeline-clip__content\s*\{[^}]*top:\s*var\(--timeline-clip-band-height\);[^}]*border-top-left-radius:\s*0;/,
    );
  });

  it("keeps applied-state badges above the opaque name band", () => {
    const host = render("video", { hasAudio: true, volume: 1.8 });
    expect(host.querySelector('[data-badge="volume"]')?.textContent).toBe("180%");
    const badges = host.querySelector('[data-testid="clip-badges"]');
    expect(badges?.classList.contains("z-[31]")).toBe(true);
    expect(badges?.classList.contains("max-w-[calc(100%-12px)]")).toBe(true);
    expect(badges?.classList.contains("overflow-hidden")).toBe(true);
    expect(badges?.parentElement?.classList.contains("timeline-clip__label")).toBe(true);
    expect(css).toMatch(
      /\.timeline-clip:not\(\.is-audio\) \.timeline-clip__name\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/,
    );
    expect(css).toMatch(
      /\.timeline-clip:not\(\.is-audio\) \.timeline-clip__label\s*\{[^}]*z-index:\s*auto;/,
    );
  });

  it("keeps fallback lint warnings clear of the name band and menu badge", () => {
    usePlayerStore
      .getState()
      .setLintFindingsByElement(new Map([["clip", { count: 1, messages: ["Lint warning"] }]]));
    const host = render("div", { duration: 0.3 }, false);
    const name = host.querySelector(".timeline-clip__name");
    const warning = host.querySelector<HTMLElement>('[title="Lint warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.style.bottom).toBe("7px");
    expect(warning?.style.top).toBe("");
    expect(css).toMatch(/\.timeline-clip__timecode\s*\{[^}]*right:\s*16px;/);
    expect(
      (name?.compareDocumentPosition(warning!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(css).toMatch(
      /\.timeline-clip:not\(\.is-audio\) \.timeline-clip__label\s*\{[^}]*z-index:\s*auto;/,
    );
  });

  it.each([0.02, 0.295])(
    "keeps the name band without badge targets on a narrow visual clip (%ss)",
    (duration) => {
      const host = render("video", { duration, hasAudio: true, volume: 1.8 });
      expect(host.querySelector(".timeline-clip__name")?.textContent).toBe("City");
      expect(host.querySelector('[data-testid="clip-badges"]')).toBeNull();
      expect(css).toMatch(/padding:\s*0 min\(6px,\s*25%\);/);
      expect(css).toMatch(/padding-left:\s*min\(8px,\s*25%\);/);
    },
  );

  it("lets audio keep its full-height content and pill radius", () => {
    const host = render("audio");
    const clip = host.querySelector(".timeline-clip");
    const picture = host.querySelector(".timeline-clip__content");
    expect(clip?.classList.contains("is-audio")).toBe(true);
    expect(picture?.classList.contains("inset-0")).toBe(true);
    expect(css).toMatch(/--timeline-clip-audio-radius:\s*var\(--timeline-clip-radius\);/);
    expect(clip instanceof HTMLElement && clip.style.borderRadius).toBe(
      "var(--timeline-clip-audio-radius)",
    );
  });

  it("exports a single 1px selection ring around a 12px visual clip", () => {
    const clip = render("video").querySelector(".timeline-clip");
    expect(clip?.classList.contains("is-selected")).toBe(true);
    expect(css).toMatch(/--timeline-clip-radius:\s*12px;/);
    expect(css).toMatch(
      /\.timeline-clip\.is-selected,\s*\.timeline-clip\[data-active\]\.is-selected\s*\{[^}]*outline:\s*1px solid var\(--timeline-clip-selection\);[^}]*outline-offset:\s*0;/,
    );
    expect(css).toMatch(/\.timeline-clip:not\(\.is-audio\)\s*\{\s*border-width:\s*0;/);
  });

  const audioPillZ = () =>
    Number(
      css.match(/\.timeline-clip\.is-audio \.timeline-clip__label\s*\{[^}]*z-index:\s*(\d+)/)?.[1],
    );

  it("draws an audio clip's name pill over its waveform", () => {
    expect(audioPillZ()).toBeGreaterThan(WAVEFORM_LAYER_Z);
  });

  it("keeps the out-of-sync badge over the audio name pill", () => {
    const audio = {
      id: "clip",
      domId: "clip",
      label: "City",
      tag: "audio",
      start: 1.7,
      duration: 4,
    };
    const synced = { ...audio, track: 1, playbackStart: 0, syncOrigin: "lk-1" };
    const video = { ...synced, id: "talk", domId: "talk", tag: "video", start: 1, track: 0 };
    usePlayerStore.getState().setElements([video, synced]);
    const badge = render("audio", synced, false).querySelector('[data-testid="out-of-sync-badge"]');
    expect(Number(badge?.className.match(/\bz-\[(\d+)\]/)?.[1])).toBeGreaterThan(audioPillZ());
  });
});
