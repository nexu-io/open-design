// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlatMediaSection } from "./propertyPanelFlatMediaSection";
import { MediaSection } from "./propertyPanelMediaSection";
import type { DomEditSelection } from "./domEditing";
import type { PatchOperation } from "../../utils/sourcePatcher";
import { formatTimingValue } from "./propertyPanelHelpers";
import { readMediaOffsetSeconds } from "@hyperframes/parsers/media-duration";
import { audioGainToFaderPosition } from "@hyperframes/core/audio-gain";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function makeVideoElement(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  const el = document.createElement("video");
  el.setAttribute("src", "assets/intro-loop.mp4");
  return {
    element: el,
    id: "s1-bg",
    selector: "#s1-bg",
    label: "S1 Background",
    tagName: "video",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
    textContent: "",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
    ...overrides,
  } as DomEditSelection;
}

function renderSection(overrides: Partial<DomEditSelection> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const element = makeVideoElement(overrides);
  act(() => {
    root.render(
      <FlatMediaSection
        projectDir={null}
        element={element}
        styles={{}}
        onSetStyle={vi.fn()}
        onSetAttribute={vi.fn()}
        onSetHtmlAttribute={vi.fn()}
        onSetAttributeBatch={vi.fn()}
      />,
    );
  });
  return { host, root };
}

describe("FlatMediaSection — source row", () => {
  it("renders the source path and copies it to clipboard on click", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    const { host, root } = renderSection();
    expect(host.textContent).toContain("assets/intro-loop.mp4");
    const copyButton = host.querySelector<HTMLButtonElement>('[data-flat-media-copy="true"]');
    expect(copyButton).not.toBeNull();
    act(() => copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("assets/intro-loop.mp4");
    act(() => root.unmount());
  });
});

describe("FlatMediaSection — cutout", () => {
  it("shows the WebM label for video and fires background removal on click", async () => {
    const onRemoveBackground = vi.fn().mockResolvedValue({ outputPath: "assets/intro-loop.webm" });
    const onSetHtmlAttribute = vi.fn();
    const onSetAttribute = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const element = makeVideoElement();
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={onSetHtmlAttribute}
          onSetAttributeBatch={vi.fn()}
          onRemoveBackground={onRemoveBackground}
        />,
      );
    });
    expect(host.textContent).toContain("transparent WebM");
    const removeBgButton = host.querySelector<HTMLButtonElement>(
      '[data-flat-media-remove-bg="true"]',
    );
    expect(removeBgButton).not.toBeNull();
    await act(async () => {
      removeBgButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onRemoveBackground).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("toggles BG plate via FlatToggle", () => {
    const { host, root } = renderSection();
    const plateToggle = host.querySelector<HTMLButtonElement>(
      '[data-flat-toggle="true"][aria-label="BG plate"]',
    );
    expect(plateToggle).not.toBeNull();
    expect(plateToggle?.getAttribute("aria-checked")).toBe("false");
    act(() => plateToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(plateToggle?.getAttribute("aria-checked")).toBe("true");
    act(() => root.unmount());
  });
});

describe("FlatMediaSection — volume/rate/media-start", () => {
  it("renders unity volume as neutral 0 dB at the slider midpoint", () => {
    const onSetAttribute = vi.fn();
    const element = makeVideoElement({ dataAttributes: { volume: "1" } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    expect(host.textContent).toContain("0.0 dB");
    expect(
      host.querySelector('[data-flat-slider-track="true"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
    act(() => root.unmount());
  });

  it("commits +12 dB of boost from the upper half of the gain fader", () => {
    const onSetAttribute = vi.fn();
    const element = makeVideoElement({ dataAttributes: { volume: "1" } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    const volumeTrack = host.querySelector('[data-flat-slider-track="true"][aria-label="Gain"]')!;
    Object.defineProperty(volumeTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      volumeTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
      volumeTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 100 }));
    });
    // Six decimals, not two: at two the bottom of the dB fader collapses onto
    // "0" (a hard mute) and every stop below unity writes a value the knob then
    // jumps away from.
    expect(onSetAttribute).toHaveBeenCalledWith("volume", "3.981072");
    act(() => root.unmount());
  });

  it("shows the clip's gain and its lane's level as two sliders", () => {
    const element = makeVideoElement({ dataAttributes: { volume: "0.5" } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={vi.fn()}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
          volumeAutomated
          automatedVolumeValue={0.25}
        />,
      );
    });
    const [gain, volume] = host.querySelectorAll('[data-flat-slider-track="true"]');
    expect(labelsOf(host).slice(0, 2)).toEqual(["Gain", "Volume"]);
    expect(gain?.getAttribute("aria-valuenow")).toBe(String(audioGainToFaderPosition(0.5)));
    expect(volume?.getAttribute("aria-valuenow")).toBe(String(audioGainToFaderPosition(0.25)));
    act(() => root.unmount());
  });

  it.each([true, false])(
    "writes Volume through the lane, never data-volume (automated: %s)",
    (automated) => {
      const onSetAttribute = vi.fn();
      const onCommitVolumeAt = vi.fn();
      const element = makeVideoElement({ dataAttributes: { volume: "1" } });
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      act(() => {
        root.render(
          <FlatMediaSection
            projectDir={null}
            element={element}
            styles={{}}
            onSetStyle={vi.fn()}
            onSetAttribute={onSetAttribute}
            onSetHtmlAttribute={vi.fn()}
            onSetAttributeBatch={vi.fn()}
            volumeAutomated={automated}
            onCommitVolumeAt={onCommitVolumeAt}
          />,
        );
      });
      const volumeTrack = host.querySelector(
        '[data-flat-slider-track="true"][aria-label="Volume"]',
      )!;
      Object.defineProperty(volumeTrack, "getBoundingClientRect", {
        value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
      });
      act(() => {
        volumeTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
        volumeTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 100 }));
      });
      expect(onCommitVolumeAt).toHaveBeenCalledTimes(1);
      expect(onCommitVolumeAt.mock.calls[0][0]).toBeCloseTo(3.981072, 6);
      expect(onSetAttribute).not.toHaveBeenCalledWith("volume", expect.anything());
      act(() => root.unmount());
    },
  );

  it("commits a new rate value on slider track pointerdown", () => {
    const onSetAttribute = vi.fn();
    const element = makeVideoElement();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    const rateTrack = host.querySelector('[data-flat-slider-track="true"][aria-label="Speed"]')!;
    Object.defineProperty(rateTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      rateTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
      rateTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 100 }));
    });
    // the speed slider is log-scaled 0.1x..10x, so the far end of the track is 10x
    expect(onSetAttribute).toHaveBeenCalledWith("playback-rate", "10");
    act(() => root.unmount());
  });

  it("commits a new media-start value on slider track pointerdown", () => {
    const onSetAttribute = vi.fn();
    const element = makeVideoElement();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    const mediaStartTrack = host.querySelector(
      '[data-flat-slider-track="true"][aria-label="Media start"]',
    )!;
    Object.defineProperty(mediaStartTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      mediaStartTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
      mediaStartTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 100 }));
    });
    // no source-duration set -> mediaStartMax=Math.max(30, Math.ceil(0+10))=30 -> max=3000
    // ratio=1.0 -> raw=3000 -> commit(3000) -> (3000/100).toFixed(2) = "30.00"
    expect(onSetAttribute).toHaveBeenCalledWith("media-start", "30.00");
    act(() => root.unmount());
  });
});

describe("FlatMediaSection — loop/muted/has-audio", () => {
  it("toggles loop via onSetHtmlAttribute and shows has-audio-track for video", () => {
    const onSetHtmlAttribute = vi.fn();
    const onSetAttribute = vi.fn();
    const element = makeVideoElement({ dataAttributes: { "has-audio": "true" } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={onSetHtmlAttribute}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    const loopToggle = host.querySelector<HTMLButtonElement>(
      '[data-flat-toggle="true"][aria-label="Loop"]',
    );
    act(() => loopToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetHtmlAttribute).toHaveBeenCalledWith("loop", "true");

    const hasAudioToggle = host.querySelector<HTMLButtonElement>(
      '[data-flat-toggle="true"][aria-label="Has audio track"]',
    );
    expect(hasAudioToggle?.getAttribute("aria-checked")).toBe("true");
    act(() => root.unmount());
  });
});

describe("FlatMediaSection — fit/position", () => {
  it("commits object-fit and object-position changes", () => {
    const onSetStyle = vi.fn();
    const { host, root } = (() => {
      const element = makeVideoElement();
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      act(() => {
        root.render(
          <FlatMediaSection
            projectDir={null}
            element={element}
            styles={{ "object-fit": "cover", "object-position": "center" }}
            onSetStyle={onSetStyle}
            onSetAttribute={vi.fn()}
            onSetHtmlAttribute={vi.fn()}
            onSetAttributeBatch={vi.fn()}
          />,
        );
      });
      return { host, root };
    })();
    const selects = host.querySelectorAll("select");
    const fitSelect = Array.from(selects).find((s) => s.value === "cover");
    expect(fitSelect).not.toBeUndefined();
    act(() => {
      if (fitSelect) {
        fitSelect.value = "contain";
        fitSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(onSetStyle).toHaveBeenCalledWith("object-fit", "contain");
    act(() => root.unmount());
  });

  it("commits an object-position change", () => {
    const onSetStyle = vi.fn();
    const element = makeVideoElement();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatMediaSection
          projectDir={null}
          element={element}
          styles={{ "object-fit": "cover", "object-position": "center" }}
          onSetStyle={onSetStyle}
          onSetAttribute={vi.fn()}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    const selects = host.querySelectorAll("select");
    const positionSelect = Array.from(selects).find((s) => s.value === "center");
    expect(positionSelect).not.toBeUndefined();
    act(() => {
      if (positionSelect) {
        positionSelect.value = "left top";
        positionSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(onSetStyle).toHaveBeenCalledWith("object-position", "left top");
    act(() => root.unmount());
  });
});

function makeAudioElement(dataAttributes: Record<string, string> = {}): DomEditSelection {
  const el = document.createElement("audio");
  el.setAttribute("src", "assets/music.wav");
  return makeVideoElement({
    element: el,
    id: "music",
    selector: "#music",
    label: "Music",
    tagName: "audio",
    dataAttributes: { duration: "10", ...dataAttributes },
  });
}

function renderWithRate(element: DomEditSelection, onSetAttribute = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <FlatMediaSection
        projectDir={null}
        element={element}
        styles={{}}
        onSetStyle={vi.fn()}
        onSetAttribute={onSetAttribute}
        onSetHtmlAttribute={vi.fn()}
        onSetAttributeBatch={vi.fn()}
        rate={{
          automated: false,
          automatedValue: undefined,
          onAutomate: vi.fn(),
          onRemoveAutomation: vi.fn(),
          onCommitAt: vi.fn(),
          canApplyPreset: true,
          onApplyPreset: vi.fn(),
        }}
      />,
    );
  });
  return { host, root, onSetAttribute };
}

function labelsOf(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-flat-slider-track="true"]')].map(
    (track) => track.getAttribute("aria-label") ?? "",
  );
}

describe("FlatMediaSection — audio clips", () => {
  it("offers speed presets on video but not on audio", () => {
    const video = renderWithRate(makeVideoElement({ dataAttributes: { duration: "10" } }));
    expect(video.host.textContent).toContain("Speed preset");
    act(() => video.root.unmount());

    const audio = renderWithRate(makeAudioElement());
    expect(audio.host.textContent).not.toContain("Speed preset");
    act(() => audio.root.unmount());
  });

  it("shows Fade in / Fade out rows for audio, and for video only when it carries audio", () => {
    const audio = renderWithRate(makeAudioElement());
    expect(labelsOf(audio.host)).toEqual(
      expect.arrayContaining(["Gain", "Volume", "Speed", "Media start", "Fade in", "Fade out"]),
    );
    act(() => audio.root.unmount());

    const mutedSelection = makeVideoElement({ dataAttributes: { duration: "10" } });
    mutedSelection.element.setAttribute("muted", "");
    const silentVideo = renderWithRate(mutedSelection);
    expect(labelsOf(silentVideo.host)).not.toContain("Fade in");
    act(() => silentVideo.root.unmount());

    const audibleVideo = renderWithRate(
      makeVideoElement({ dataAttributes: { duration: "10", "has-audio": "true" } }),
    );
    expect(labelsOf(audibleVideo.host)).toContain("Fade out");
    act(() => audibleVideo.root.unmount());
  });

  it("reads the authored fades and writes data-fade-in from the slider, clearing it at zero", () => {
    const { host, root, onSetAttribute } = renderWithRate(
      makeAudioElement({ "fade-in": "0.5", "fade-out": "2" }),
    );
    const readouts = [...host.querySelectorAll('[data-flat-slider-value="true"]')].map(
      (node) => node.textContent,
    );
    expect(readouts).toEqual(expect.arrayContaining(["0.50s", "2.00s"]));

    const fadeInTrack = host.querySelector<HTMLElement>(
      '[data-flat-slider-track="true"][aria-label="Fade in"]',
    );
    if (!fadeInTrack) throw new Error("expected a Fade in slider");
    Object.defineProperty(fadeInTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    // The other fade reserves 2 s: a quarter of the remaining 8 s is 2 s.
    act(() => {
      fadeInTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 25 }));
      fadeInTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 25 }));
    });
    expect(onSetAttribute).toHaveBeenCalledWith("fade-in", "2");
    act(() => {
      fadeInTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0 }));
      fadeInTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 0 }));
    });
    // An empty write removes the attribute rather than leaving data-fade-in="0" behind.
    expect(onSetAttribute).toHaveBeenCalledWith("fade-in", "");
    act(() => root.unmount());
  });

  it.each([
    ["Media start", "media-start", "45.00", {}, "9999"],
    ["Fade in", "fade-in", "10", {}, "9999"],
    ["Fade out", "fade-out", "10", {}, "9999"],
    ["Fade in", "fade-in", "5", { "fade-out": "5" }, "8"],
    ["Fade out", "fade-out", "5", { "fade-in": "5" }, "8"],
  ] as const)("bounds typed %s to the slider limit", (label, attribute, expected, fades, typed) => {
    const { host, root, onSetAttribute } = renderWithRate(
      makeAudioElement({ "source-duration": "45", ...fades }),
    );
    const row = host.querySelector<HTMLElement>(
      `[data-flat-slider-track="true"][aria-label="${label}"]`,
    )?.parentElement;
    const readout = row?.querySelector<HTMLElement>('[data-flat-slider-value="true"]');
    if (!readout) throw new Error(`expected ${label} readout`);
    act(() => readout.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    if (!input) throw new Error(`expected ${label} input`);
    act(() => {
      typeInto(input, typed);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSetAttribute.mock.calls).toEqual([[attribute, expected]]);
    act(() => root.unmount());
  });

  it.each<Record<string, string>>([
    { "playback-start": "1", "media-start": "5" },
    { "playback-start": "-1", "media-start": "1" },
    { "media-start": "1" },
    {},
  ])("shows and edits the in-point playback reads (%o)", (inPoint) => {
    const attrs: Record<string, string> = { "source-duration": "45", ...inPoint };
    const playbackReads = () => readMediaOffsetSeconds((name) => attrs[name.slice(5)]);
    const onSetAttribute = vi.fn((name: string, value: string) => {
      attrs[name] = value;
    });
    const { host, root } = renderWithRate(makeAudioElement(attrs), onSetAttribute);
    const readout = host
      .querySelector('[data-flat-slider-track="true"][aria-label="Media start"]')
      ?.parentElement?.querySelector<HTMLElement>('[data-flat-slider-value="true"]');
    if (!readout) throw new Error("expected Media start readout");
    expect(readout.textContent).toBe(formatTimingValue(playbackReads()));
    act(() => readout.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    if (!input) throw new Error("expected Media start input");
    act(() => {
      typeInto(input, "3");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(playbackReads()).toBe(3);
    act(() => root.unmount());
  });

  it.each<Record<string, string>>([
    { "playback-start": "1", "media-start": "5" },
    { "media-start": "1" },
  ])("the Design panel's Media start slider writes where playback reads (%o)", (inPoint) => {
    const attrs: Record<string, string> = { "source-duration": "45", ...inPoint };
    const onSetAttribute = vi.fn((name: string, value: string) => {
      attrs[name] = value;
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <MediaSection
          projectDir={null}
          element={makeAudioElement(attrs)}
          styles={{}}
          onSetStyle={vi.fn()}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={vi.fn()}
          onSetAttributeBatch={vi.fn()}
        />,
      );
    });
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Media start"]');
    if (!slider) throw new Error("expected Media start slider");
    act(() => typeInto(slider, "300"));
    act(() => slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })));
    expect(readMediaOffsetSeconds((name) => attrs[name.slice(5)])).toBe(3);
    act(() => root.unmount());
  });

  it("commits a typed volume in dB and a typed fade in seconds", () => {
    const { host, root, onSetAttribute } = renderWithRate(makeAudioElement());
    const readouts = host.querySelectorAll<HTMLElement>('[data-flat-slider-value="true"]');
    // Volume is the first slider row.
    act(() => readouts[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const volumeInput = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    if (!volumeInput) throw new Error("expected the volume readout to open for typing");
    act(() => {
      typeInto(volumeInput, "-6 dB");
      volumeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const [attr, value] = onSetAttribute.mock.calls.at(-1) ?? [];
    expect(attr).toBe("volume");
    expect(Number(value)).toBeCloseTo(10 ** (-6 / 20), 2);

    const fadeOutRow = host.querySelector<HTMLElement>(
      '[data-flat-slider-track="true"][aria-label="Fade out"]',
    )?.parentElement;
    const fadeOutReadout = fadeOutRow?.querySelector<HTMLElement>(
      '[data-flat-slider-value="true"]',
    );
    act(() => fadeOutReadout?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const fadeInput = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    if (!fadeInput) throw new Error("expected the fade readout to open for typing");
    act(() => {
      typeInto(fadeInput, "1.25s");
      fadeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSetAttribute).toHaveBeenLastCalledWith("fade-out", "1.25");
    act(() => root.unmount());
  });
});

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

type PanelKind = "flat" | "design";

type BatchOptions = { label: string; prepareContent?: (html: string) => string };

function makeHandlers() {
  return {
    onSetAttribute: vi.fn(),
    onSetHtmlAttribute: vi.fn(),
    onSetAttributeBatch: vi.fn<
      (
        selection: DomEditSelection,
        ops: PatchOperation[],
        options: BatchOptions,
      ) => Promise<boolean>
    >(async (_selection, _ops, options) => {
      options.prepareContent?.(
        '<div data-composition-id="main"><video id="s1-bg" src="assets/intro-loop.mp4" data-start="2"></video></div>',
      );
      return true;
    }),
  };
}

function mountPanel(
  kind: PanelKind,
  element: DomEditSelection,
  handlers: ReturnType<typeof makeHandlers> & {
    onRemoveBackground?: () => Promise<{ outputPath: string }>;
  },
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const Panel = kind === "flat" ? FlatMediaSection : MediaSection;
  act(() => {
    root.render(
      <Panel
        projectId="p1"
        projectDir={null}
        element={element}
        styles={{}}
        onSetStyle={vi.fn()}
        {...handlers}
      />,
    );
  });
  return { host, root };
}

async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

async function clickToggle(kind: PanelKind, host: HTMLElement, label: string, option: string) {
  if (kind === "flat") {
    const toggle = host.querySelector<HTMLButtonElement>(
      `[data-flat-toggle="true"][aria-label="${label}"]`,
    );
    if (!toggle) throw new Error(`expected ${label} toggle`);
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });
    return;
  }
  const row = Array.from(host.querySelectorAll("span")).find(
    (n) => n.textContent === label,
  )?.parentElement;
  const button = Array.from(row?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === option,
  );
  if (!button) throw new Error(`expected ${label} segmented button`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
  });
}

function stubHasAudioProbe(hasAudio: boolean | "fail") {
  const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0]) =>
    hasAudio === "fail"
      ? new Response("nope", { status: 500 })
      : new Response(JSON.stringify({ metadata: { hasAudio } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const htmlOp = (property: string, value: string | null) => ({
  type: "html-attribute",
  property,
  value,
});
const dataOp = (property: string, value: string | null) => ({
  type: "attribute",
  property,
  value,
});

describe.each<PanelKind>(["flat", "design"])("%s panel — Muted is one atomic edit", (kind) => {
  afterEach(() => vi.unstubAllGlobals());

  it("muting an audible video sets muted and removes has-audio in ONE write", async () => {
    const handlers = makeHandlers();
    const element = makeVideoElement({ dataAttributes: { "has-audio": "true" } });
    const { host, root } = mountPanel(kind, element, handlers);
    await clickToggle(kind, host, "Muted", "On");
    expect(handlers.onSetAttributeBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([
      htmlOp("muted", "true"),
      dataOp("has-audio", null),
    ]);
    expect(handlers.onSetAttribute).not.toHaveBeenCalled();
    expect(handlers.onSetHtmlAttribute).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("unmuting a video the probe hears stamps has-audio=true in the same write", async () => {
    const probe = stubHasAudioProbe(true);
    const handlers = makeHandlers();
    const element = makeVideoElement();
    element.element.setAttribute("muted", "");
    const { host, root } = mountPanel(kind, element, handlers);
    await clickToggle(kind, host, "Muted", "Off");
    expect(String(probe.mock.calls[0]?.[0])).toContain("assets%2Fintro-loop.mp4");
    expect(handlers.onSetAttributeBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([
      htmlOp("muted", null),
      dataOp("has-audio", "true"),
    ]);
    act(() => root.unmount());
  });

  it("unmuting a silent-probe video writes has-audio=false", async () => {
    stubHasAudioProbe(false);
    const handlers = makeHandlers();
    const element = makeVideoElement();
    element.element.setAttribute("muted", "");
    const { host, root } = mountPanel(kind, element, handlers);
    await clickToggle(kind, host, "Muted", "Off");
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([
      htmlOp("muted", null),
      dataOp("has-audio", "false"),
    ]);
    act(() => root.unmount());
  });

  it("unmuting when the probe fails leaves has-audio absent", async () => {
    stubHasAudioProbe("fail");
    const handlers = makeHandlers();
    const element = makeVideoElement();
    element.element.setAttribute("muted", "");
    const { host, root } = mountPanel(kind, element, handlers);
    await clickToggle(kind, host, "Muted", "Off");
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([
      htmlOp("muted", null),
      dataOp("has-audio", null),
    ]);
    act(() => root.unmount());
  });

  it("audio Muted toggles only the muted attribute", async () => {
    const handlers = makeHandlers();
    const { host, root } = mountPanel(kind, makeAudioElement({}), handlers);
    await clickToggle(kind, host, "Muted", "On");
    expect(handlers.onSetAttributeBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([htmlOp("muted", "true")]);
    act(() => root.unmount());
  });

  it("Has audio track No removes has-audio and mutes in ONE write", async () => {
    const handlers = makeHandlers();
    const element = makeVideoElement({ dataAttributes: { "has-audio": "true" } });
    const { host, root } = mountPanel(kind, element, handlers);
    await clickToggle(kind, host, "Has audio track", "No");
    expect(handlers.onSetAttributeBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([
      dataOp("has-audio", null),
      htmlOp("muted", "true"),
    ]);
    act(() => root.unmount());
  });

  it("Has audio track Yes stamps has-audio and clears muted in ONE write", async () => {
    const handlers = makeHandlers();
    const element = makeVideoElement();
    element.element.setAttribute("muted", "");
    const { host, root } = mountPanel(kind, element, handlers);
    await clickToggle(kind, host, "Has audio track", "Yes");
    expect(handlers.onSetAttributeBatch.mock.calls[0]?.[1]).toEqual([
      dataOp("has-audio", "true"),
      htmlOp("muted", null),
    ]);
    act(() => root.unmount());
  });
});

describe.each<PanelKind>(["flat", "design"])("%s panel — cutout keeps the sound", (kind) => {
  async function runCutout(element: DomEditSelection) {
    const handlers = makeHandlers();
    const onRemoveBackground = vi.fn().mockResolvedValue({ outputPath: "assets/cut.webm" });
    const confirm = vi.spyOn(window, "confirm");
    const { host, root } = mountPanel(kind, element, { ...handlers, onRemoveBackground });
    const button =
      kind === "flat"
        ? host.querySelector<HTMLButtonElement>('[data-flat-media-remove-bg="true"]')
        : Array.from(host.querySelectorAll("button")).find((b) =>
            /remove bg/i.test(b.textContent ?? ""),
          );
    if (!button) throw new Error("expected remove background button");
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });
    const text = host.textContent ?? "";
    act(() => root.unmount());
    return { ...handlers, confirm, text };
  }

  afterEach(() => vi.restoreAllMocks());

  it("audible video: one write mutes onto the cutout and inserts a linked sibling audio", async () => {
    const element = makeVideoElement({
      dataAttributes: { "has-audio": "true", volume: "0.5" },
    });
    element.element.setAttribute("id", "s1-bg");
    element.element.setAttribute("data-has-audio", "true");
    element.element.setAttribute("data-volume", "0.5");
    const { onSetAttributeBatch, onSetAttribute, onSetHtmlAttribute, confirm, text } =
      await runCutout(element);

    expect(confirm).not.toHaveBeenCalled();
    expect(onSetAttribute).not.toHaveBeenCalled();
    expect(onSetHtmlAttribute).not.toHaveBeenCalled();
    expect(onSetAttributeBatch).toHaveBeenCalledTimes(1);
    const [selection, ops, options] = onSetAttributeBatch.mock.calls[0] ?? [];
    expect(selection).toBe(element);
    expect(ops).toEqual([
      htmlOp("muted", "true"),
      dataOp("has-audio", null),
      dataOp("volume", null),
      dataOp("link", "lk-1"),
      dataOp("sync-origin", "lk-1"),
    ]);
    const source =
      '<div data-composition-id="main"><video id="s1-bg" src="assets/intro-loop.mp4" muted data-start="2" data-duration="3" data-track-index="0" data-link="lk-1"></video></div>';
    const prepared = options?.prepareContent?.(source) ?? "";
    const audio = new DOMParser()
      .parseFromString(prepared, "text/html")
      .getElementById("s1-bg-audio");
    expect(audio?.getAttribute("src")).toBe("assets/intro-loop.mp4");
    expect(audio?.getAttribute("data-start")).toBe("2");
    expect(audio?.getAttribute("data-duration")).toBe("3");
    expect(audio?.getAttribute("data-link")).toBe("lk-1");
    expect(audio?.getAttribute("data-volume")).toBe("0.5");
    expect(text).toContain("Background removed. Sound kept on a linked audio track.");
  });

  it("silent video: one write swaps the src and inserts no audio", async () => {
    const silent = makeVideoElement();
    silent.element.setAttribute("muted", "");
    const { onSetAttributeBatch, confirm, text } = await runCutout(silent);
    expect(confirm).not.toHaveBeenCalled();
    expect(onSetAttributeBatch).toHaveBeenCalledTimes(1);
    const [, ops, options] = onSetAttributeBatch.mock.calls[0] ?? [];
    expect(ops).toEqual([
      htmlOp("src", "assets/cut.webm"),
      htmlOp("muted", "true"),
      dataOp("has-audio", null),
    ]);
    expect(options?.prepareContent).toBeUndefined();
    expect(text).toContain("Applied cutout");
  });
});
