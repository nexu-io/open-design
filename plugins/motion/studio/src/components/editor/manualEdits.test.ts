// fallow-ignore-file code-duplication
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_ROTATION_PROP,
  STUDIO_WIDTH_PROP,
  applyStudioBoxSize,
  applyStudioBoxSizeDraft,
  applyStudioPathOffset,
  applyStudioPathOffsetDraft,
  applyStudioRotation,
  beginStudioManualEditGesture,
  captureStudioBoxSize,
  captureStudioRotation,
  clearStudioBoxSize,
  clearStudioPathOffset,
  clearStudioRotation,
  endStudioManualEditGesture,
  installStudioManualEditSeekReapply,
  readStudioBoxSize,
  readStudioFileChangePath,
  readStudioPathOffset,
  readStudioRotation,
  restoreStudioBoxSize,
  restoreStudioRotation,
} from "./manualEdits";

function createDocument(markup: string): Document {
  const window = new Window();
  window.document.body.innerHTML = markup;
  return window.document;
}

function mockBoundingRect(element: HTMLElement, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function mockComputedStyle(element: HTMLElement, values: Record<string, string>): void {
  const win = element.ownerDocument.defaultView;
  if (!win) throw new Error("defaultView fixture missing");
  win.getComputedStyle = ((target: Element) =>
    ({
      getPropertyValue: (property: string) => (target === element ? (values[property] ?? "") : ""),
    }) as CSSStyleDeclaration) as typeof win.getComputedStyle;
}

describe("studio manual edits", () => {
  it("recognizes studio file-change payloads", () => {
    expect(readStudioFileChangePath({ path: ".hyperframes/studio-manual-edits.json" })).toBe(
      ".hyperframes/studio-manual-edits.json",
    );
    expect(readStudioFileChangePath({ filePath: "/nested/file.html" })).toBe("nested/file.html");
    // A still-wrapped delivery is a decoding bug upstream, never a path.
    expect(readStudioFileChangePath({ data: { path: "nested/file.html" } })).toBeNull();
  });

  it("applies offsets through CSS translate longhand", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;

    applyStudioPathOffset(card, { x: 14, y: -8 });

    expect(readStudioPathOffset(card)).toEqual({ x: 14, y: -8 });
    expect(card.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("14px");
    expect(card.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("-8px");
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
  });

  it("preserves authored inline translate as the additive path offset base", () => {
    const document = createDocument(`<div id="card" style="translate: 10px 20px"></div>`);
    const card = document.getElementById("card") as HTMLElement;

    applyStudioPathOffset(card, { x: 14, y: -8 });

    expect(card.style.getPropertyValue("translate")).toContain("calc(10px +");
    expect(card.style.getPropertyValue("translate")).toContain("calc(20px +");
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_Y_PROP);
  });

  it("preserves stylesheet-authored transform longhands as additive bases", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;
    mockComputedStyle(card, {
      translate: "10px 20px",
      rotate: "8deg",
    });

    applyStudioPathOffset(card, { x: 14, y: -8 });
    applyStudioRotation(card, { angle: 12 });

    expect(card.style.getPropertyValue("translate")).toContain("calc(10px +");
    expect(card.style.getPropertyValue("translate")).toContain("calc(20px +");
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
    expect(card.style.getPropertyValue("rotate")).toContain("8deg");
    expect(card.style.getPropertyValue("rotate")).toContain(STUDIO_ROTATION_PROP);
  });

  it("clears computed transform bases without freezing them inline", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;
    mockComputedStyle(card, {
      translate: "10px 20px",
      rotate: "8deg",
    });

    applyStudioPathOffset(card, { x: 14, y: -8 });
    applyStudioRotation(card, { angle: 12 });

    clearStudioPathOffset(card);
    clearStudioRotation(card);

    expect(card.style.getPropertyValue("translate")).toBe("");
    expect(card.style.getPropertyValue("rotate")).toBe("");
  });

  it("does not compound stale studio variables as authored transform bases", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;

    card.style.setProperty(
      "translate",
      `var(${STUDIO_OFFSET_X_PROP}, 0px) var(${STUDIO_OFFSET_Y_PROP}, 0px)`,
    );
    card.style.setProperty("rotate", `var(${STUDIO_ROTATION_PROP}, 0deg)`);

    applyStudioPathOffset(card, { x: 14, y: -8 });
    applyStudioRotation(card, { angle: 12 });

    expect(card.style.getPropertyValue("translate")).toBe(
      `var(${STUDIO_OFFSET_X_PROP}, 0px) var(${STUDIO_OFFSET_Y_PROP}, 0px)`,
    );
    expect(card.style.getPropertyValue("rotate")).toBe(`var(${STUDIO_ROTATION_PROP}, 0deg)`);
  });

  it("keeps sub-pixel offsets, and box sizes on whole px so GSAP reads a -50% centring exactly", () => {
    const document = createDocument(`<div id="card" style="width: 160px; height: 90px"></div>`);
    const card = document.getElementById("card") as HTMLElement;
    mockBoundingRect(card, 160, 90);

    applyStudioPathOffsetDraft(card, { x: 14.25, y: -8.5 });
    applyStudioBoxSizeDraft(card, { width: 240.4, height: 135.6 });

    expect(card.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("14.25px");
    expect(card.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("-8.5px");
    expect(card.style.getPropertyValue("width")).toBe("240px");
    expect(card.style.getPropertyValue("height")).toBe("136px");
  });

  it("applies box sizes through CSS dimensions and flex sizing overrides", () => {
    const document = createDocument(`
      <div style="display: flex; flex-direction: row">
        <div id="card" style="width: 160px; height: 90px"></div>
      </div>
    `);
    const card = document.getElementById("card") as HTMLElement;
    mockBoundingRect(card, 160, 90);

    applyStudioBoxSize(card, { width: 240, height: 135 });

    expect(readStudioBoxSize(card)).toEqual({ width: 240, height: 135 });
    expect(card.style.getPropertyValue(STUDIO_WIDTH_PROP)).toBe("240px");
    expect(card.style.getPropertyValue("width")).toBe("240px");
    expect(card.style.getPropertyValue("height")).toBe("135px");
    expect(card.style.getPropertyValue("flex-basis")).toBe("240px");
    expect(card.style.getPropertyValue("flex-grow")).toBe("0");
    expect(card.style.getPropertyValue("flex-shrink")).toBe("0");
    expect(card.style.getPropertyValue("box-sizing")).toBe("border-box");
    expect(card.style.getPropertyValue("scale")).toBe("");

    applyStudioBoxSizeDraft(card, { width: 260, height: 150 });
    expect(readStudioBoxSize(card)).toEqual({ width: 260, height: 150 });
    expect(card.style.getPropertyValue("width")).toBe("260px");
    expect(card.style.getPropertyValue("height")).toBe("150px");
    expect(card.style.getPropertyValue("flex-basis")).toBe("260px");

    const snapshot = captureStudioBoxSize(card);
    applyStudioBoxSizeDraft(card, { width: 280, height: 160 });
    restoreStudioBoxSize(card, snapshot);
    expect(readStudioBoxSize(card)).toEqual({ width: 260, height: 150 });
    expect(card.style.getPropertyValue("width")).toBe("260px");
    expect(card.style.getPropertyValue("height")).toBe("150px");
    expect(card.style.getPropertyValue("flex-basis")).toBe("260px");
  });

  it("applies rotations through CSS rotate longhand around the element center", () => {
    const document = createDocument(
      `<div id="card" style="rotate: 8deg; transform-origin: left top"></div>`,
    );
    const card = document.getElementById("card") as HTMLElement;

    applyStudioRotation(card, { angle: 24.2468 });

    expect(readStudioRotation(card)).toEqual({ angle: 24.247 });
    expect(card.style.getPropertyValue(STUDIO_ROTATION_PROP)).toBe("24.247deg");
    expect(card.style.getPropertyValue("rotate")).toContain("8deg");
    expect(card.style.getPropertyValue("rotate")).toContain(STUDIO_ROTATION_PROP);
    expect(card.style.getPropertyValue("transform-origin")).toBe("center center");

    const snapshot = captureStudioRotation(card);
    applyStudioRotation(card, { angle: 45 });
    restoreStudioRotation(card, snapshot);
    expect(readStudioRotation(card)).toEqual({ angle: 24.247 });
    expect(card.style.getPropertyValue(STUDIO_ROTATION_PROP)).toBe("24.247deg");
    expect(card.style.getPropertyValue("transform-origin")).toBe("center center");
  });

  it("uses height for flex-basis inside column flex containers", () => {
    const document = createDocument(`
      <div style="display: flex; flex-direction: column">
        <div id="card" style="width: 160px; height: 90px"></div>
      </div>
    `);
    const card = document.getElementById("card") as HTMLElement;

    applyStudioBoxSize(card, { width: 240, height: 135 });

    expect(card.style.getPropertyValue("width")).toBe("240px");
    expect(card.style.getPropertyValue("height")).toBe("135px");
    expect(card.style.getPropertyValue("flex-basis")).toBe("135px");
  });

  it("uses additive CSS translate without mutating GSAP tweens during path-offset moves", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;
    const getTweensOf = vi.fn();
    const getProperty = vi.fn();
    const set = vi.fn();
    const tickerTick = vi.fn();
    const tween = {
      vars: { x: 0, y: 10, startAt: { x: -240, y: -20 } },
      targets: () => [card],
      invalidate: vi.fn(),
      parent: {
        time: () => 1.25,
        totalTime: vi.fn(),
        invalidate: vi.fn(),
      },
      _startAt: {
        vars: { x: -240, y: -20 },
        invalidate: vi.fn(),
      },
    };

    (
      document.defaultView as unknown as {
        gsap: {
          getTweensOf: () => Array<typeof tween>;
          getProperty: (_target: Element, property: string) => unknown;
          set: (_target: Element, vars: Record<string, unknown>) => void;
          ticker: { tick: () => void };
        };
      }
    ).gsap = {
      getTweensOf,
      getProperty,
      set,
      ticker: { tick: tickerTick },
    };

    applyStudioPathOffset(card, { x: 30, y: -12 });

    expect(tween.vars).toMatchObject({
      x: 0,
      y: 10,
      startAt: { x: -240, y: -20 },
    });
    expect(tween._startAt.vars).toEqual({ x: -240, y: -20 });
    expect(readStudioPathOffset(card)).toEqual({ x: 30, y: -12 });
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
    expect(getTweensOf).not.toHaveBeenCalled();
    expect(getProperty).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(tickerTick).not.toHaveBeenCalled();

    beginStudioManualEditGesture(card, "move");
    applyStudioPathOffsetDraft(card, { x: 35, y: -6 });

    expect(readStudioPathOffset(card)).toEqual({ x: 35, y: -6 });
    expect(card.style.getPropertyValue("translate")).toBe("35px -6px");
    expect(tween.vars).toMatchObject({
      x: 0,
      y: 10,
      startAt: { x: -240, y: -20 },
    });
    expect(tween._startAt.vars).toEqual({ x: -240, y: -20 });
    expect(tickerTick).not.toHaveBeenCalled();

    applyStudioPathOffset(card, { x: 35, y: -6 });
    endStudioManualEditGesture(card);

    expect(tween.vars).toMatchObject({
      x: 0,
      y: 10,
      startAt: { x: -240, y: -20 },
    });
    expect(tween._startAt.vars).toEqual({ x: -240, y: -20 });
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);

    clearStudioPathOffset(card);
    expect(tween.vars).toMatchObject({
      x: 0,
      y: 10,
      startAt: { x: -240, y: -20 },
    });
    expect(tween._startAt.vars).toEqual({ x: -240, y: -20 });
    expect(card.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("");
    expect(card.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("");
    expect(card.style.getPropertyValue("translate")).toBe("");
  });

  it("clears path offsets and restores authored inline translate", () => {
    const document = createDocument(`<div id="card" style="translate: 10px 20px"></div>`);
    const card = document.getElementById("card") as HTMLElement;

    applyStudioPathOffset(card, { x: 24, y: 12 });
    expect(card.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);

    clearStudioPathOffset(card);

    expect(card.style.getPropertyValue("translate")).toBe("10px 20px");
  });

  it("clears stale offsets applied directly to the DOM", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;

    applyStudioPathOffset(card, { x: 24, y: 12 });
    expect(readStudioPathOffset(card)).toEqual({ x: 24, y: 12 });

    clearStudioPathOffset(card);

    expect(readStudioPathOffset(card)).toEqual({ x: 0, y: 0 });
    expect(card.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("");
    expect(card.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("");
    expect(card.style.getPropertyValue("translate")).toBe("");
  });

  it("clears box sizes and restores authored inline size", () => {
    const document = createDocument(`
      <div style="display: flex; flex-direction: row">
        <div id="card" style="width: 160px; height: 90px"></div>
      </div>
    `);
    const card = document.getElementById("card") as HTMLElement;
    mockBoundingRect(card, 160, 90);

    applyStudioBoxSize(card, { width: 320, height: 180 });
    expect(readStudioBoxSize(card)).toEqual({ width: 320, height: 180 });
    expect(card.style.getPropertyValue("width")).toBe("320px");
    expect(card.style.getPropertyValue("flex-basis")).toBe("320px");

    clearStudioBoxSize(card);
    expect(readStudioBoxSize(card)).toEqual({ width: 0, height: 0 });
    expect(card.style.getPropertyValue("width")).toBe("160px");
    expect(card.style.getPropertyValue("height")).toBe("90px");
    expect(card.style.getPropertyValue("flex-basis")).toBe("");
    expect(card.style.getPropertyValue("flex-grow")).toBe("");
    expect(card.style.getPropertyValue("flex-shrink")).toBe("");
    expect(card.style.getPropertyValue("scale")).toBe("");
  });

  it("clears rotations and restores authored inline rotation", () => {
    const document = createDocument(
      `<div id="card" style="rotate: 8deg; transform-origin: left top"></div>`,
    );
    const card = document.getElementById("card") as HTMLElement;

    applyStudioRotation(card, { angle: 37.5 });
    expect(readStudioRotation(card)).toEqual({ angle: 37.5 });
    expect(card.style.getPropertyValue("rotate")).toContain(STUDIO_ROTATION_PROP);
    expect(card.style.getPropertyValue("rotate")).toContain("8deg");
    expect(card.style.getPropertyValue("transform-origin")).toBe("center center");

    clearStudioRotation(card);
    expect(readStudioRotation(card)).toEqual({ angle: 0 });
    expect(card.style.getPropertyValue("rotate")).toBe("8deg");
    expect(card.style.getPropertyValue("transform-origin")).toBe("left top");
  });

  it("does not replay a gesture-guarded offset during active gesture", () => {
    const document = createDocument(`<div id="card"></div>`);
    const card = document.getElementById("card") as HTMLElement;

    applyStudioPathOffset(card, { x: 40, y: 24 });
    const firstToken = beginStudioManualEditGesture(card, "move");
    const secondToken = beginStudioManualEditGesture(card, "move");
    endStudioManualEditGesture(card, firstToken);

    // Gesture still active — offset should remain
    expect(readStudioPathOffset(card)).toEqual({ x: 40, y: 24 });

    endStudioManualEditGesture(card, secondToken);
    // After gesture ends, offset remains (we don't auto-clear in this path)
    expect(readStudioPathOffset(card)).toEqual({ x: 40, y: 24 });
  });

  it("reapplies the latest preview manifest after wrapped seeks", () => {
    const window = new Window();
    const seekArgs: unknown[][] = [];
    const previewWindow = window as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & {
      __player: Record<string, unknown>;
    };
    previewWindow.__player = {
      seek: (...args: unknown[]) => {
        seekArgs.push(args);
      },
    };

    let applied = 0;
    expect(
      installStudioManualEditSeekReapply(previewWindow, () => {
        applied += 1;
      }),
    ).toBe(true);
    (previewWindow.__player.seek as (time: number, suppressEvents: boolean) => void)(1, false);
    expect(applied).toBe(1);
    expect(seekArgs).toEqual([[1, false]]);

    expect(
      installStudioManualEditSeekReapply(previewWindow, () => {
        applied += 10;
      }),
    ).toBe(true);
    (previewWindow.__player.seek as (time: number) => void)(2);
    expect(applied).toBe(11);
  });

  it("reapplies once after a seek that applied, and again once a held seek lands", async () => {
    const previewWindow = new Window() as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & { __player: Record<string, unknown> };
    let landed = () => {};
    const held = new Promise<void>((resolve) => (landed = resolve));
    previewWindow.__player = { seek: (time: number) => (time > 5 ? held : undefined) };
    let applied = 0;
    installStudioManualEditSeekReapply(previewWindow, () => {
      applied += 1;
    });
    const seek = previewWindow.__player.seek as (time: number) => unknown;

    seek(1);
    await Promise.resolve();
    expect(applied).toBe(1);
    expect(seek(5.5)).toBe(held);
    expect(applied).toBe(2);
    landed();
    await held;
    await Promise.resolve();
    expect(applied).toBe(3);
  });

  it("reapplies manual edits while fresh playback is active", () => {
    const window = new Window();
    const frames: FrameRequestCallback[] = [];
    let playing = false;
    const previewWindow = window as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & {
      __player: Record<string, unknown>;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
    };
    previewWindow.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };
    previewWindow.__player = {
      play: () => {
        playing = true;
      },
      isPlaying: () => playing,
    };

    let applied = 0;
    expect(
      installStudioManualEditSeekReapply(previewWindow, () => {
        applied += 1;
      }),
    ).toBe(true);

    (previewWindow.__player.play as () => void)();
    expect(applied).toBe(1);
    expect(frames).toHaveLength(1);

    frames.shift()?.(16);
    expect(applied).toBe(2);
    expect(frames).toHaveLength(1);

    playing = false;
    frames.shift()?.(32);
    expect(applied).toBe(3);
    expect(frames).toHaveLength(0);
  });

  it("does not reapply every frame while the player is paused over unpaused scene timelines", () => {
    const window = new Window();
    const frames: FrameRequestCallback[] = [];
    let playing = false;
    const previewWindow = window as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & {
      __player: Record<string, unknown>;
      __timelines: Record<string, Record<string, unknown>>;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
    };
    previewWindow.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };
    previewWindow.__player = {
      play: () => {
        playing = true;
      },
      isPlaying: () => playing,
    };
    // A GSAP child of a paused master: not paused itself, inactive, time left.
    const master = { paused: () => true };
    previewWindow.__timelines = {
      scene0: {
        parent: master,
        play: () => {},
        paused: () => false,
        isActive: () => false,
        time: () => 0,
        duration: () => 5,
      },
    };

    expect(installStudioManualEditSeekReapply(previewWindow, () => {})).toBe(true);
    expect(frames).toHaveLength(0);

    (previewWindow.__player.play as () => void)();
    expect(frames).toHaveLength(1);
    playing = false;
    frames.shift()?.(16);
    expect(frames).toHaveLength(0);
  });

  it("tolerates a timeline whose parent chain loops", () => {
    const window = new Window();
    const previewWindow = window as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & {
      __timelines: Record<string, Record<string, unknown>>;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
    };
    previewWindow.requestAnimationFrame = () => 1;
    const loop: Record<string, unknown> = { paused: () => false };
    loop.parent = loop;
    previewWindow.__timelines = {
      scene0: {
        parent: loop,
        play: () => {},
        paused: () => false,
        time: () => 0,
        duration: () => 5,
      },
    };

    expect(() => installStudioManualEditSeekReapply(previewWindow, () => {})).not.toThrow();
  });

  it("keeps reapplying while Studio drives a timeline directly and the player reads idle", () => {
    const window = new Window();
    const frames: FrameRequestCallback[] = [];
    let paused = true;
    const previewWindow = window as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & {
      __player: Record<string, unknown>;
      __timeline: Record<string, unknown>;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
    };
    previewWindow.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };
    previewWindow.__player = { play: () => {}, isPlaying: () => false };
    previewWindow.__timeline = {
      play: () => {
        paused = false;
      },
      paused: () => paused,
      isActive: () => !paused,
      time: () => 1,
      duration: () => 5,
    };

    expect(installStudioManualEditSeekReapply(previewWindow, () => {})).toBe(true);
    (previewWindow.__timeline.play as () => void)();
    frames.shift()?.(16);
    expect(frames).toHaveLength(1);
  });

  it("stops playback reapply after an unpaused timeline has completed", () => {
    const window = new Window();
    const frames: FrameRequestCallback[] = [];
    let currentTime = 0;
    let paused = true;
    const previewWindow = window as unknown as Parameters<
      typeof installStudioManualEditSeekReapply
    >[0] & {
      __timeline: Record<string, unknown>;
      requestAnimationFrame: (callback: FrameRequestCallback) => number;
    };
    previewWindow.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };
    previewWindow.__timeline = {
      play: () => {
        paused = false;
      },
      paused: () => paused,
      isActive: () => false,
      time: () => currentTime,
      duration: () => 2,
    };

    let applied = 0;
    expect(
      installStudioManualEditSeekReapply(previewWindow, () => {
        applied += 1;
      }),
    ).toBe(true);

    (previewWindow.__timeline.play as () => void)();
    expect(applied).toBe(1);
    expect(frames).toHaveLength(1);

    currentTime = 2;
    frames.shift()?.(16);
    expect(applied).toBe(2);
    expect(frames).toHaveLength(0);
  });
});

describe("applyStudioPathOffset sets correct attribute name", () => {
  it("sets data-hf-studio-path-offset without double data- prefix", () => {
    const window = new Window();
    const el = window.document.createElement("div");
    window.document.body.append(el);

    applyStudioPathOffset(el, { x: 100, y: 50 });

    expect(el.getAttribute("data-hf-studio-path-offset")).toBe("true");
    expect(el.getAttribute("data-data-hf-studio-path-offset")).toBeNull();
  });

  it("stores offset in CSS vars alongside the attribute marker", () => {
    const window = new Window();
    const el = window.document.createElement("div");
    window.document.body.append(el);

    applyStudioPathOffset(el, { x: 50, y: 25 });

    expect(el.getAttribute("data-hf-studio-path-offset")).toBe("true");
    expect(el.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("50px");
    expect(el.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("25px");
    expect(el.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
  });

  it("corrects offset applied on top of legacy double-prefix element", () => {
    const window = new Window();
    const el = window.document.createElement("div");
    el.setAttribute("data-data-hf-studio-path-offset", "true");
    el.style.setProperty(STUDIO_OFFSET_X_PROP, "200px");
    el.style.setProperty(STUDIO_OFFSET_Y_PROP, "-30px");
    window.document.body.append(el);

    applyStudioPathOffset(el, { x: 200, y: -30 });

    expect(el.getAttribute("data-hf-studio-path-offset")).toBe("true");
    expect(readStudioPathOffset(el)).toEqual({ x: 200, y: -30 });
    expect(el.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
  });
});

describe("applyStudioPathOffset strips GSAP double-counted translate", () => {
  it("strips GSAP transform translate when applying offset", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    // Simulate GSAP having baked translate into the transform matrix
    element.style.setProperty("transform", "matrix(1, 0, 0, 1, 200, 0)");

    applyStudioPathOffset(element, { x: 200, y: 0 });

    // The transform translate should be stripped (GSAP's 200px removed)
    const transform = element.style.getPropertyValue("transform");
    if (transform && transform !== "none") {
      const m = new window.DOMMatrix(transform);
      expect(m.m41).toBe(0);
      expect(m.m42).toBe(0);
    }
    // The offset should be stored in CSS vars
    expect(readStudioPathOffset(element).x).toBe(200);
  });

  it("subtracts only the studio offset from GSAP transform, preserving animation values", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    // GSAP has scale + baked translate (offset 50) + animation contribution (-70)
    // Total m42 = 50 + (-70) = -20
    element.style.setProperty("transform", "matrix(0.5, 0, 0, 0.5, 0, -20)");

    applyStudioPathOffset(element, { x: 0, y: 50 });

    const transform = element.style.getPropertyValue("transform");
    if (transform && transform !== "none") {
      const m = new window.DOMMatrix(transform);
      expect(m.a).toBeCloseTo(0.5);
      expect(m.d).toBeCloseTo(0.5);
      // Only the studio offset (50) is subtracted, animation contribution (-70) preserved
      expect(m.m41).toBe(0);
      expect(m.m42).toBe(-70);
    }
    expect(readStudioPathOffset(element).y).toBe(50);
  });

  it("offset survives repeated applyStudioPathOffset calls without drift", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    // Apply offset 3 times with same value (simulates reapply hook firing multiple times)
    applyStudioPathOffset(element, { x: 100, y: -20 });
    applyStudioPathOffset(element, { x: 100, y: -20 });
    applyStudioPathOffset(element, { x: 100, y: -20 });

    expect(readStudioPathOffset(element).x).toBe(100);
    expect(readStudioPathOffset(element).y).toBe(-20);
  });
});
