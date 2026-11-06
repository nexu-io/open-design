// @vitest-environment happy-dom
// fallow-ignore-file code-duplication

import { act } from "react";
import { MAX_AUDIO_GAIN } from "@hyperframes/core/audio-gain";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../../player/store/playerStore";
import type { TimelineElement } from "../../player/store/timelineElement";
import { useAudioMetersVisible } from "../../utils/audioMeterVisibility";
import { SILENT_CHANNEL } from "../../utils/audioMeterMath";
import {
  AudioMeterStrip,
  type AudioMeterStripProps,
  CLIP_LATCH_PEAK,
  stepClipLatch,
  evictGoneMeterState,
  followMeterHook,
  stepAndPaintStrips,
} from "./AudioMeterStrip";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const iframe = { contentWindow: null as unknown };
const previewIframeRef = { current: iframe };
let shell: { previewIframeRef: typeof previewIframeRef } | null = { previewIframeRef };
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => shell,
}));

const onSetAudioGroupAttributeLive = vi.fn();
const onSetAudioGroupAttributeQuiet = vi.fn();
vi.mock("../../contexts/TimelineEditContext", () => ({
  useTimelineEditContextOptional: () => ({
    onSetAudioGroupAttributeLive,
    onSetAudioGroupAttributeQuiet,
  }),
}));

function stubTrackRect(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      left: 0,
      top: 0,
      right: 8,
      bottom: 100,
      width: 8,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function drag(fader: HTMLElement, clientY: number) {
  const restoreRect = stubTrackRect();
  const original = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = vi.fn();
  try {
    for (const type of ["pointerdown", "pointermove", "pointerup"]) {
      act(() =>
        fader.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientY })),
      );
    }
  } finally {
    Element.prototype.setPointerCapture = original;
    restoreRect();
  }
}

const makeHook = (groups: Record<string, { l: number; r: number }> = {}) => ({
  start: vi.fn(),
  stop: vi.fn(),
  read: vi.fn(() => ({ master: { l: 1, r: 0.5 }, groups })),
});
const setHook = (hook: ReturnType<typeof makeHook> | null) => {
  iframe.contentWindow = hook ? { __hf: { audioMeter: hook } } : null;
};
const clip = (extra: Partial<TimelineElement>) =>
  ({ id: "a", tag: "audio", ...extra }) as TimelineElement;

let frames: FrameRequestCallback[] = [];
const tick = () => {
  const run = frames;
  frames = [];
  act(() => run.forEach((cb) => cb(performance.now() + 16)));
};

beforeEach(() => {
  shell = { previewIframeRef };
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  usePlayerStore.setState({ elements: [], audioVolume: 1 });
  useAudioMetersVisible.setState({ visible: true });
  onSetAudioGroupAttributeLive.mockClear();
  onSetAudioGroupAttributeQuiet.mockClear();
});
const roots: Root[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(props: AudioMeterStripProps = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<AudioMeterStrip {...props} />));
  roots.push(root);
  return { host, root };
}

describe("AudioMeterStrip", () => {
  it("is absent when the project has no audio", () => {
    usePlayerStore.setState({ elements: [clip({ tag: "div" })] });
    expect(mount().host.querySelector("[data-testid=audio-meter-strip]")).toBeNull();
  });

  it("shows one strip per group plus Monitor, and hides when toggled off", () => {
    usePlayerStore.setState({
      elements: [
        clip({ id: "1", audioGroup: "music", audioGroupLabel: "Music" }),
        clip({ id: "2", audioGroup: "vo" }),
      ],
    });
    const { host } = mount();
    expect(host.textContent).toContain("Music");
    expect(host.textContent).toContain("vo");
    expect(host.textContent).toContain("Monitor");
    expect(host.textContent).not.toContain("Master");
    act(() => useAudioMetersVisible.getState().setVisible(false));
    expect(host.querySelector("[data-testid=audio-meter-strip]")).toBeNull();
  });

  it("starts the taps once, drives the bars, follows a swapped preview window, and stops on unmount", () => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const first = makeHook({ vo: { l: 1, r: 1 } });
    setHook(first);
    const { host, root } = mount();
    const mask = host.querySelector<HTMLElement>("[data-testid=meter-mask]")!;
    expect(mask.style.height).toBe("100%");
    tick();
    tick();
    expect(first.start).toHaveBeenCalledTimes(1);
    expect(mask.style.height).toBe("0%");
    const peak = host.querySelector<HTMLElement>("[data-testid=meter-peak]")!;
    expect(peak.style.bottom).toBe("100%");
    expect(peak.style.transform).toBe("translateY(1px)");

    const second = makeHook();
    setHook(second);
    tick();
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.start).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    roots.length = 0;
    expect(second.stop).toHaveBeenCalledTimes(1);
  });

  it("follows a new preview hook even when the old stop() throws", () => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const first = makeHook({ vo: { l: 1, r: 1 } });
    first.stop.mockImplementation(() => {
      throw new Error("dead realm");
    });
    setHook(first);
    mount();
    tick();
    const second = makeHook();
    setHook(second);
    tick();
    expect(second.start).toHaveBeenCalledTimes(1);
    tick();
    expect(second.read).toHaveBeenCalled();
  });

  it("reads a host's preview iframe over the shell's", () => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const shellHook = makeHook();
    setHook(shellHook);
    const hostHook = makeHook();
    const hostIframe = { contentWindow: { __hf: { audioMeter: hostHook } } };
    mount({ previewIframeRef: { current: hostIframe as unknown as HTMLIFrameElement } });
    tick();
    expect(hostHook.start).toHaveBeenCalledTimes(1);
    expect(shellHook.start).not.toHaveBeenCalled();
  });

  it("mounts with no shell and no preview iframe", () => {
    shell = null;
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const { host } = mount();
    tick();
    expect(host.querySelector("[data-testid=audio-meter-strip]")).not.toBeNull();
  });

  it("keeps authored gain 2 above unity and writes exactly 1 at the midpoint", () => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo", audioGroupVolume: 2 })] });
    const { host } = mount();
    const fader = host.querySelector<HTMLElement>('[aria-label="vo volume"]')!;
    expect(Number(fader.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    expect(Number(fader.getAttribute("aria-valuenow"))).toBeLessThan(100);
    expect(fader.getAttribute("aria-valuetext")).toBe("+6.0 dB");
    expect(parseFloat(fader.querySelector<HTMLElement>("div")!.style.bottom)).toBeGreaterThan(50);
    drag(fader, 50);
    expect(onSetAudioGroupAttributeLive).toHaveBeenCalledWith("vo", "data-volume", "1");
    expect(onSetAudioGroupAttributeQuiet).toHaveBeenCalledExactlyOnceWith(
      "vo",
      "data-volume",
      "1",
      "Set volume",
    );
  });

  it("drags a group to the shared +12 dB ceiling", () => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const fader = mount().host.querySelector<HTMLElement>('[aria-label="vo volume"]')!;
    drag(fader, 0);
    expect(Number(onSetAudioGroupAttributeQuiet.mock.calls[0]![2])).toBeCloseTo(MAX_AUDIO_GAIN, 6);
    expect(onSetAudioGroupAttributeLive).toHaveBeenCalledWith("vo", "data-volume", "3.981072");
  });

  it.each([0.5, 1, 2, 3.98])(
    "round-trips authored group gain %s through its displayed thumb",
    (gain) => {
      usePlayerStore.setState({ elements: [clip({ audioGroup: "vo", audioGroupVolume: gain })] });
      const fader = mount().host.querySelector<HTMLElement>('[aria-label="vo volume"]')!;
      const thumb = fader.firstElementChild as HTMLElement;
      drag(fader, 100 - parseFloat(thumb.style.bottom));
      expect(Number(onSetAudioGroupAttributeQuiet.mock.calls[0]![2])).toBeCloseTo(gain, 6);
    },
  );

  it("preserves low authored gain instead of rounding it to mute", () => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const fader = mount().host.querySelector<HTMLElement>('[aria-label="vo volume"]')!;
    drag(fader, 85);
    expect(onSetAudioGroupAttributeQuiet).toHaveBeenCalledExactlyOnceWith(
      "vo",
      "data-volume",
      "0.007943",
      "Set volume",
    );
  });

  it("keeps the Monitor fader within the player store range", () => {
    usePlayerStore.setState({ elements: [clip({})] });
    const fader = mount().host.querySelector<HTMLElement>('[aria-label="Monitor volume"]')!;
    expect(fader.getAttribute("aria-valuemin")).toBe("-100");
    expect(fader.getAttribute("aria-valuemax")).toBe("0");
    drag(fader, 100);
    expect(usePlayerStore.getState().audioVolume).toBe(0);
    drag(fader, 0);
    expect(usePlayerStore.getState().audioVolume).toBe(1);
    act(() => fader.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(usePlayerStore.getState().audioVolume).toBe(1);
    expect(fader.getAttribute("aria-valuetext")).toBe("0.0 dB");
    expect(onSetAudioGroupAttributeQuiet).not.toHaveBeenCalled();
  });

  it.each(["pointercancel", "lostpointercapture"])(
    "finishes %s once and ignores subsequent hovering",
    (event) => {
      const restoreRect = stubTrackRect();
      const original = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = vi.fn();
      try {
        usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
        const fader = mount().host.querySelector<HTMLElement>('[aria-label="vo volume"]')!;
        for (const [type, clientY] of [
          ["pointerdown", 50],
          [event, 0],
          ["pointermove", 0],
          ["pointerup", 0],
        ] as const) {
          act(() =>
            fader.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientY })),
          );
        }
        expect(onSetAudioGroupAttributeLive).toHaveBeenCalledExactlyOnceWith(
          "vo",
          "data-volume",
          "1",
        );
        expect(onSetAudioGroupAttributeQuiet).toHaveBeenCalledExactlyOnceWith(
          "vo",
          "data-volume",
          "1",
          "Set volume",
        );
      } finally {
        Element.prototype.setPointerCapture = original;
        restoreRect();
      }
    },
  );

  it.each([
    ["Home", "0"],
    ["End", "3.981072"],
    ["PageUp", "1.318257"],
    ["PageDown", "0.251189"],
  ])("supports the %s slider key", (key, gain) => {
    usePlayerStore.setState({ elements: [clip({ audioGroup: "vo" })] });
    const fader = mount().host.querySelector<HTMLElement>('[aria-label="vo volume"]')!;
    act(() => fader.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    expect(onSetAudioGroupAttributeQuiet).toHaveBeenCalledExactlyOnceWith(
      "vo",
      "data-volume",
      gain,
      "Set volume",
    );
  });

  it("nudges by an equal visual step and exposes the gain readout", () => {
    usePlayerStore.setState({ elements: [clip({})], audioVolume: 1 });
    const fader = mount().host.querySelector<HTMLElement>('[aria-label="Monitor volume"]')!;
    act(() =>
      fader.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    expect(fader.getAttribute("aria-valuenow")).toBe("-2");
    expect(fader.getAttribute("aria-valuetext")).toBe("-1.2 dB");
    act(() => fader.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(usePlayerStore.getState().audioVolume).toBeCloseTo(1, 12);
    expect(fader.getAttribute("aria-valuenow")).toBe("0");
  });
});

describe("followMeterHook", () => {
  it("leaves the same hook attached", () => {
    const hook = makeHook();
    expect(followMeterHook(hook, hook)).toBe(hook);
    expect(hook.stop).not.toHaveBeenCalled();
    expect(hook.start).not.toHaveBeenCalled();
  });

  it("stops the old hook and starts the new one", () => {
    const first = makeHook();
    const second = makeHook();
    expect(followMeterHook(first, second)).toBe(second);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.start).toHaveBeenCalledTimes(1);
  });

  it("still attaches the new hook when stop() throws", () => {
    const first = makeHook();
    first.stop.mockImplementation(() => {
      throw new Error("dead realm");
    });
    const second = makeHook();
    expect(followMeterHook(first, second)).toBe(second);
    expect(second.start).toHaveBeenCalledTimes(1);
  });

  it("returns the live hook even when start() throws", () => {
    const live = makeHook();
    live.start.mockImplementation(() => {
      throw new Error("not ready");
    });
    expect(followMeterHook(null, live)).toBe(live);
  });
});

describe("evictGoneMeterState", () => {
  it("drops ids that are no longer in the strip list", () => {
    const rest: [typeof SILENT_CHANNEL, typeof SILENT_CHANNEL] = [SILENT_CHANNEL, SILENT_CHANNEL];
    const state = new Map<string | null, typeof rest>([
      ["gone", rest],
      ["vo", rest],
      [null, rest],
    ]);
    evictGoneMeterState(state, new Set(["vo", null]));
    expect([...state.keys()]).toEqual(["vo", null]);
  });
});

describe("stepAndPaintStrips", () => {
  it("paints a loud group and skips a silent strip already at rest", () => {
    const loudMask = document.createElement("div");
    const restMask = document.createElement("div");
    restMask.style.height = "50%";
    const rest: [typeof SILENT_CHANNEL, typeof SILENT_CHANNEL] = [SILENT_CHANNEL, SILENT_CHANNEL];
    const state = new Map<string | null, typeof rest>([["rest", rest]]);
    const bars = new Map([
      [
        "loud",
        [
          { mask: loudMask, peak: null },
          { mask: null, peak: null },
        ] as const,
      ],
      [
        "rest",
        [
          { mask: restMask, peak: null },
          { mask: null, peak: null },
        ] as const,
      ],
    ]);
    stepAndPaintStrips(
      [{ id: "loud" }, { id: "rest" }],
      state,
      bars as never,
      { master: { l: 0, r: 0 }, groups: { loud: { l: 1, r: 1 } } },
      0,
      16,
    );
    expect(loudMask.style.height).toBe("0%");
    expect(restMask.style.height).toBe("50%");
    expect(state.has("loud")).toBe(true);
  });
});

describe("CLIP light", () => {
  const hookAt = (peak: number) => ({
    start: vi.fn(),
    stop: vi.fn(),
    read: vi.fn(() => ({ master: { l: peak, r: 0 }, groups: {} })),
  });

  it("latches at the -1 dBFS export ceiling, stays lit when the level drops, and resets on click", () => {
    usePlayerStore.setState({ elements: [clip({})] });
    const hook = hookAt(1);
    setHook(hook);
    const { host } = mount();
    const light = host.querySelector<HTMLElement>("[data-testid=meter-clip-light]");
    expect(light?.dataset.lit).toBe("false");
    tick();
    expect(light?.dataset.lit).toBe("true");
    hook.read.mockReturnValue({ master: { l: 0.1, r: 0.1 }, groups: {} });
    tick();
    expect(light?.dataset.lit).toBe("true");
    act(() => light?.click());
    expect(light?.dataset.lit).toBe("false");
    tick();
    expect(light?.dataset.lit).toBe("false");
  });

  it("stays dark in the red band just under the ceiling", () => {
    usePlayerStore.setState({ elements: [clip({})] });
    setHook(hookAt(10 ** (-1.2 / 20)));
    const { host } = mount();
    tick();
    expect(host.querySelector<HTMLElement>("[data-testid=meter-clip-light]")?.dataset.lit).toBe(
      "false",
    );
  });
});

describe("stepClipLatch", () => {
  it("lights exactly at -1 dBFS on either channel, not below", () => {
    expect(CLIP_LATCH_PEAK).toBeCloseTo(0.891251, 6);
    expect(stepClipLatch(false, { l: CLIP_LATCH_PEAK, r: 0 })).toBe(true);
    expect(stepClipLatch(false, { l: 0, r: CLIP_LATCH_PEAK })).toBe(true);
    expect(stepClipLatch(false, { l: CLIP_LATCH_PEAK - 1e-6, r: 0 })).toBe(false);
    expect(stepClipLatch(false, undefined)).toBe(false);
  });

  it("holds once lit, whatever comes next", () => {
    expect(stepClipLatch(true, { l: 0, r: 0 })).toBe(true);
    expect(stepClipLatch(true, undefined)).toBe(true);
  });
});
