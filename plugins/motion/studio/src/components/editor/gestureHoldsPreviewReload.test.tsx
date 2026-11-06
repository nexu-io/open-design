// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import { useInlineTextEdit } from "../../hooks/useInlineTextEdit";
import {
  makePreview,
  mountPlayerWithPreview,
  paintShadow,
  resetPlayerStore,
  type TimelinePlayerApi,
} from "../../player/hooks/timelinePlayerTestHarness";
import type { DomEditSelection } from "./domEditing";
import "./domEditOverlayTestMocks";
import { DomEditOverlay } from "./DomEditOverlay";
import { PreviewReadOnlyProvider } from "./previewReadOnlyContext";
import { STUDIO_MANUAL_EDIT_GESTURE_ATTR } from "./manualEditsTypes";
import { PRESS_WAITING_ATTR } from "./domEditOverlayGestures";
import { PRESS_WAIT_MAX_MS } from "./previewGestureStarts";
import { readDragStamp } from "../../hooks/draggedGsapPosition";
import { usePlayerStore } from "../../player/store/playerStore";
import { whileScriptWrites } from "../../player/previewReloading";
import { cancelNewestStudioWaitingPress } from "../../utils/studioPendingEdits";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const layout = vi.hoisted(() => ({
  group: [] as unknown[],
  rafPaused: { current: false } as { current: boolean },
  rect: { left: 100, top: 100, width: 200, height: 100, editScaleX: 1, editScaleY: 1 },
}));
vi.mock("./useDomEditOverlayRects", () => ({
  useDomEditOverlayRects: (options: { rafPausedRef: { current: boolean } }) => {
    layout.rafPaused = options.rafPausedRef;
    const { rect, group } = layout;
    const [overlayRect, setOverlayRect] = React.useState(rect);
    const overlayRectRef = React.useRef(overlayRect);
    overlayRectRef.current = overlayRect;
    const groupOverlayItemsRef = { current: group };
    const noop = () => undefined;
    return {
      overlayRect,
      overlayRectRef,
      groupOverlayItems: group,
      groupOverlayItemsRef,
      hoverRect: null,
      childRects: [],
      setOverlayRect,
      setGroupOverlayItems: noop,
    };
  },
}));
vi.mock("./domEditOverlayGeometry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./domEditOverlayGeometry")>()),
  orientedGroupAwareOverlayRect: (_overlay: unknown, _iframe: unknown, element: HTMLElement) => {
    const [x = 0, y = 0] = element.style
      .getPropertyValue("translate")
      .split(" ")
      .map(Number.parseFloat);
    return {
      ...layout.rect,
      left: 100 + (Number.isFinite(x) ? x : 0),
      top: 100 + (Number.isFinite(y) ? y : 0),
    };
  },
}));
vi.mock("../../utils/gsapSoftReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/gsapSoftReload")>()),
  ensureMotionPathPluginLoaded: vi.fn(),
}));

const BOX = '[data-dom-edit-selection-box="true"]';
const RECT = layout.rect;
const TWO_LAYERS = '<h1 id="title">Title</h1><p id="sub">Sub</p>';

/** What the server serves: the file as the last commit left it. */
let file = { title: "", sub: "" };
const served = (query: string) =>
  makePreview(
    `<h1 id="title" style="${file.title}">Title</h1><p id="sub" style="${file.sub}">Sub</p>`,
    query,
  );

let overlayRoot: Root;
let player: ReturnType<typeof mountPlayerWithPreview>;

const marked = (doc: Document) => doc.querySelectorAll(`[${STUDIO_MANUAL_EDIT_GESTURE_ATTR}]`);
const byId = (iframe: HTMLIFrameElement | null, id: string) =>
  iframe!.contentDocument!.getElementById(id) as HTMLElement;
const api = (): TimelinePlayerApi => player.getApi();
/** The south-east resize handle. */
const corner = (overlay: HTMLElement) =>
  [...overlay.querySelectorAll<HTMLElement>("div.h-4.w-4")].reduce((a, b) =>
    parseFloat(b.style.left) + parseFloat(b.style.top) >
    parseFloat(a.style.left) + parseFloat(a.style.top)
      ? b
      : a,
  );

function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  extra: PointerEventInit = {},
) {
  const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
  const init = {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons,
    pointerId: 1,
    clientX: x,
    clientY: y,
    ...extra,
  };
  act(() => void target.dispatchEvent(new PointerEvent(type, init)));
}

/** The real player with a two-layer preview, and the real overlay editing it. */
function mountEditor(
  group: boolean,
  saving: { landed: Promise<void> } = { landed: Promise.resolve() },
) {
  file = { title: "", sub: "" };
  const live = makePreview(TWO_LAYERS);
  player = mountPlayerWithPreview(live);
  const selections = ["title", "sub"].map((id) => makeSelection(id, byId(live, id)));
  for (const s of selections) s.capabilities.canApplyManualRotation = true;
  const saveStyle = (sel: DomEditSelection | null, style: string) =>
    saving.landed.then(() => void (file = { ...file, [sel?.id ?? "title"]: style }));
  layout.group = group
    ? selections.map((s) => ({ key: s.id, selection: s, element: s.element, rect: RECT }))
    : [];
  const write = (sel: DomEditSelection, next: { x: number; y: number }) =>
    saveStyle(sel, `translate: ${next.x}px ${next.y}px`);
  const onPathOffsetCommit = vi.fn(write);
  const onCanvasMouseDown = vi.fn();
  const onGroupPathOffsetCommit = vi.fn(
    async (updates: { selection: DomEditSelection; next: { x: number; y: number } }[]) => {
      for (const { selection, next } of updates) await write(selection, next);
    },
  );
  const host = document.body.appendChild(document.createElement("div"));
  overlayRoot = createRoot(host);
  const render = (readOnly: boolean, selection = selections[0]!) =>
    act(() =>
      overlayRoot.render(
        <PreviewReadOnlyProvider readOnly={readOnly}>
          <DomEditOverlay
            iframeRef={api().iframeRef}
            activeCompositionPath={null}
            selection={group ? null : selection}
            groupSelections={group ? selections : []}
            hoverSelection={null}
            onCanvasMouseDown={onCanvasMouseDown}
            onCanvasPointerMove={() => Promise.resolve(null)}
            onCanvasPointerLeave={() => undefined}
            onSelectionChange={() => undefined}
            onBlockedMove={() => undefined}
            onPathOffsetCommit={onPathOffsetCommit}
            onGroupPathOffsetCommit={onGroupPathOffsetCommit}
            onBoxSizeCommit={(sel, size) => saveStyle(sel, `width: ${size.width}px`)}
            onRotationCommit={(sel, next) => saveStyle(sel, `rotate: ${next.angle}deg`)}
            onStyleCommit={(property, value) => saveStyle(selections[0]!, `${property}: ${value}`)}
          />
        </PreviewReadOnlyProvider>,
      ),
    );
  render(false);
  const overlay = host.querySelector('[aria-label="Composition canvas"]') as HTMLElement;
  return {
    live,
    overlay,
    box: overlay.querySelector(BOX)!,
    onPathOffsetCommit,
    onCanvasMouseDown,
    render,
  };
}

/** A reload whose shadow paints while the gesture is still live. */
async function reloadMidGesture() {
  act(() => api().refreshPlayer());
  const shadow = served("?_t=1");
  const gen = await paintShadow(api, shadow);
  return { shadow, gen };
}

/** Polls inside act, as testing-library's waitFor does, so a replayed press's renders are flushed. */
const waitFor = (check: () => void) => act(() => vi.waitFor(check));

async function settle() {
  await act(async () => {
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  });
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

// Writes a test leaves out would hold every later press in the file.
const stuckWrites: Array<() => void> = [];

afterEach(() => {
  for (const land of stuckWrites.splice(0)) land();
  act(() => overlayRoot?.unmount());
  act(() => player?.root.unmount());
  layout.group = [];
  document.body.innerHTML = "";
  resetPlayerStore();
});

describe("a reload during a drag", () => {
  it.each([
    ["one layer", false],
    ["a group", true],
  ])(
    "that paints before the drop of %s waits, then shows the drop from a fresh load",
    async (_, group) => {
      const { live, overlay, box } = mountEditor(group);
      pointer(box, "pointerdown", 150, 150);
      pointer(overlay, "pointermove", 170, 160);
      pointer(overlay, "pointermove", 190, 170);
      const held = await reloadMidGesture();
      expect(api().iframeRef.current, "promoted under the pointer").toBe(live);

      pointer(overlay, "pointerup", 190, 170);
      await settle();
      expect(byId(live, "title").style.getPropertyValue("translate")).toBe("40px 20px");
      expect(file.title).toBe("translate: 40px 20px");
      if (group) expect(file.sub).toBe("translate: 40px 20px");
      expect(marked(live.contentDocument!)).toHaveLength(0);
      expect(api().iframeRef.current, "the shadow loaded before the drop").toBe(live);

      const fresh = served("?_t=2");
      expect(await paintShadow(api, fresh)).toBeGreaterThan(held.gen);
      expect(api().iframeRef.current).toBe(fresh);
      expect(byId(fresh, "title").style.getPropertyValue("translate")).toBe("40px 20px");
      if (group) expect(byId(fresh, "sub").style.getPropertyValue("translate")).toBe("40px 20px");
    },
  );

  const handle = (overlay: HTMLElement, selector: string) => overlay.querySelector(selector)!;
  // Each edit presses at `from`, drags to `to`, and releases on `on`.
  const edits = {
    move: (o: HTMLElement) => ({ press: handle(o, BOX), on: o, from: [150, 150], to: [190, 170] }),
    resize: (o: HTMLElement) => ({ press: corner(o), on: o, from: [300, 200], to: [340, 220] }),
    rotate: (o: HTMLElement) => ({
      press: handle(o, '[aria-label="Rotate selection"]'),
      on: o,
      from: [200, 80],
      to: [270, 150],
    }),
    crop: (o: HTMLElement) => {
      const edge = handle(o, '[aria-label="Crop left"]');
      return { press: edge, on: edge, from: [100, 150], to: [140, 150] };
    },
  };

  function drag(edit: { press: Element; on: Element; from: number[]; to: number[] }) {
    pointer(edit.press, "pointerdown", edit.from[0]!, edit.from[1]!);
    pointer(edit.on, "pointermove", edit.to[0]!, edit.to[1]!);
  }

  it.each(Object.keys(edits) as (keyof typeof edits)[])(
    "that paints after a %s shows it from a fresh load, not the file before it",
    async (kind) => {
      const { live, overlay } = mountEditor(false);
      const edit = edits[kind](overlay);
      drag(edit);
      act(() => api().refreshPlayer());
      const beforeDrop = served("?_t=1");
      pointer(edit.on, "pointerup", edit.to[0]!, edit.to[1]!);
      await settle();
      expect(file.title, "the edit saved").not.toBe("");

      const requested = await paintShadow(api, beforeDrop);
      expect(api().iframeRef.current, "the file before the edit").toBe(live);
      const fresh = served("?_t=2");
      expect(await paintShadow(api, fresh)).toBeGreaterThan(requested);
      expect(byId(fresh, "title").getAttribute("style")).toBe(file.title);
    },
  );

  it("requested while the drop is still saving shows the drop from a fresh load", async () => {
    let land: () => void = () => {};
    const { live, overlay } = mountEditor(false, { landed: new Promise((r) => (land = r)) });
    const edit = edits.move(overlay);
    drag(edit);
    pointer(edit.on, "pointerup", edit.to[0]!, edit.to[1]!);
    await settle();
    act(() => api().refreshPlayer());
    const beforeSave = served("?_t=1");
    await act(async () => land());
    await settle();
    expect(file.title).toBe("translate: 40px 20px");

    const requested = await paintShadow(api, beforeSave);
    expect(api().iframeRef.current, "the file before the save").toBe(live);
    const fresh = served("?_t=2");
    expect(await paintShadow(api, fresh)).toBeGreaterThan(requested);
    expect(byId(fresh, "title").style.getPropertyValue("translate")).toBe("40px 20px");
  });
});

describe("a press while the preview reloads", () => {
  it("drags its element on the reloaded preview, at the time it was pressed", async () => {
    const editor = mountEditor(false);
    act(() => usePlayerStore.setState({ currentTime: 2 }));
    act(() => api().refreshPlayer());
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    expect(marked(editor.live.contentDocument!), "the page being replaced").toHaveLength(0);
    expect(editor.box.hasAttribute(PRESS_WAITING_ATTR), "drawn at the pointer").toBe(true);
    pointer(editor.overlay, "pointerup", 190, 170);
    act(() => usePlayerStore.setState({ currentTime: 3 }));
    let pressedAt: number | undefined;
    const save = editor.onPathOffsetCommit.getMockImplementation()!;
    editor.onPathOffsetCommit.mockImplementationOnce((sel, ...rest) => {
      pressedAt = readDragStamp(sel.element).at?.time;
      return save(sel, ...rest);
    });

    const shown = served("?_t=1");
    await paintShadow(api, shown);
    editor.render(false, makeSelection("title", byId(shown, "title")));
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
    expect(byId(shown, "title").style.getPropertyValue("translate")).toBe("40px 20px");
    expect(pressedAt).toBe(2);
  });
});

describe("a press while a script write is out", () => {
  it("waits for the write to land, then drags", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    expect(marked(editor.live.contentDocument!), "no drag before the write lands").toHaveLength(0);
    expect(editor.onPathOffsetCommit).not.toHaveBeenCalled();

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
  });

  it("keeps a released press when the browser releases pointer capture", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    pointer(editor.box, "lostpointercapture", 190, 170);
    act(() => void editor.box.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(editor.onCanvasMouseDown).not.toHaveBeenCalled();

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
    expect(editor.onPathOffsetCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the released waiting box still while the pointer moves to the next handle", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    expect((editor.box as HTMLElement).style.left).toBe("140px");
    expect((editor.box as HTMLElement).style.top).toBe("120px");
    pointer(editor.overlay, "pointermove", 340, 220, { buttons: 0 });
    expect((editor.box as HTMLElement).style.left).toBe("140px");
    expect((editor.box as HTMLElement).style.top).toBe("120px");

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
  });

  it("keeps the newest waiting box in place when an earlier press replays", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    let landFirst: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    const firstSaved = new Promise<void>((resolve) => (landFirst = resolve));
    const commit = editor.onPathOffsetCommit.getMockImplementation()!;
    editor.onPathOffsetCommit.mockImplementationOnce((...args) =>
      whileScriptWrites(async () => {
        await firstSaved;
        return commit(...args);
      }),
    );
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    pointer(editor.box, "pointerdown", 190, 170);
    pointer(editor.overlay, "pointermove", 210, 180);
    pointer(editor.overlay, "pointerup", 210, 180);
    expect((editor.box as HTMLElement).style.left).toBe("160px");
    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(editor.onPathOffsetCommit).toHaveBeenCalledTimes(1));
    expect((editor.box as HTMLElement).style.left).toBe("160px");
    expect((editor.box as HTMLElement).style.top).toBe("130px");
    await act(async () => {
      landFirst();
      await firstSaved;
    });
    await waitFor(() => expect(file.title).toBe("translate: 60px 30px"));
  });

  it("runs a second press after the first one, never instead of it", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 160, 150);
    pointer(editor.overlay, "pointerup", 160, 150);

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(editor.onPathOffsetCommit).toHaveBeenCalledTimes(2));
    expect(editor.onPathOffsetCommit.mock.calls.map((call) => call[1])).toEqual([
      { x: 40, y: 20 },
      { x: 50, y: 20 },
    ]);
  });

  it("moves the element it pressed, even when another is selected before the write lands", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    editor.render(false, makeSelection("sub", byId(editor.live, "sub")));

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
    expect(file.sub).toBe("");
  });

  it("draws a waiting resize at the size it saves", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(corner(editor.overlay), "pointerdown", 300, 200);
    pointer(editor.overlay, "pointermove", 340, 200);
    pointer(editor.overlay, "pointerup", 340, 200);
    const box = editor.box as HTMLElement;
    const drawn = [box.style.width, box.style.height].map(Number.parseFloat);

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toMatch(/^width: /));
    const saved = Number.parseFloat(file.title.slice("width: ".length));
    // The save rounds to whole px.
    expect(drawn[0]).toBeCloseTo(saved, 0);
    expect(drawn[1]).toBeCloseTo((saved * RECT.height) / RECT.width, 0);
  });

  it("stops waiting on a write that never lands, and runs on the page shown", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    try {
      const editor = mountEditor(false);
      pointer(editor.box, "pointerdown", 150, 150);
      pointer(editor.overlay, "pointermove", 190, 170);
      pointer(editor.overlay, "pointerup", 190, 170);
      await act(async () => void vi.advanceTimersByTime(PRESS_WAIT_MAX_MS - 100));
      expect(editor.onPathOffsetCommit, "still waiting").not.toHaveBeenCalled();
      await act(async () => void vi.advanceTimersByTime(200));
      expect(editor.onPathOffsetCommit.mock.calls.map((call) => call[1])).toEqual([
        { x: 40, y: 20 },
      ]);

      pointer(editor.box, "pointerdown", 190, 170);
      expect(editor.box.hasAttribute(PRESS_WAITING_ATTR), "no second wait on the same write").toBe(
        false,
      );
      pointer(editor.overlay, "pointerup", 190, 170);
    } finally {
      vi.useRealTimers();
      await act(async () => {
        land();
        await write;
      });
    }
  });

  it("is what Cmd+Z undoes while it waits, so it never runs", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);

    let cancelled = false;
    act(() => void (cancelled = cancelNewestStudioWaitingPress()));
    expect(cancelled, "the waiting press is the newest edit").toBe(true);
    expect((editor.box as HTMLElement).style.left, "the outline goes back").toBe("100px");
    expect(editor.box.hasAttribute(PRESS_WAITING_ATTR)).toBe(false);

    await act(async () => {
      land();
      await write;
    });
    await settle();
    expect(editor.onPathOffsetCommit).not.toHaveBeenCalled();
    expect(file.title).toBe("");
  });

  /** Two presses wait on a write; the first runs and starts its own write, so the second still waits. */
  function queuedBehindOneThatRan() {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    let landFirst: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    const firstSaved = new Promise<void>((resolve) => (landFirst = resolve));
    stuckWrites.push(
      () => land(),
      () => landFirst(),
    );
    const commit = editor.onPathOffsetCommit.getMockImplementation()!;
    editor.onPathOffsetCommit.mockImplementationOnce((...args) =>
      whileScriptWrites(async () => {
        await firstSaved;
        return commit(...args);
      }),
    );
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    pointer(editor.box, "pointerdown", 190, 170);
    pointer(editor.overlay, "pointermove", 210, 180);
    const ran = async () => {
      await act(async () => {
        land();
        await write;
      });
      await waitFor(() => expect(editor.onPathOffsetCommit).toHaveBeenCalledTimes(1));
    };
    const landFirstSave = () =>
      act(async () => {
        landFirst();
        await firstSaved;
      });
    return { editor, ran, landFirstSave };
  }

  it("leaves Cmd+Z to history once the press it could take back has run", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    stuckWrites.push(() => land());
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
    expect(cancelNewestStudioWaitingPress()).toBe(false);
  });

  it("takes back a press queued behind one that ran, and leaves nothing waiting", async () => {
    const { editor, ran, landFirstSave } = queuedBehindOneThatRan();
    pointer(editor.overlay, "pointerup", 210, 180);
    await ran();
    expect(editor.box.hasAttribute(PRESS_WAITING_ATTR), "the second press waits").toBe(true);

    act(() => void cancelNewestStudioWaitingPress());
    expect(editor.box.hasAttribute(PRESS_WAITING_ATTR)).toBe(false);
    expect(cancelNewestStudioWaitingPress(), "the following Cmd+Z steps history").toBe(false);
    await landFirstSave();
    await settle();
    expect(editor.onPathOffsetCommit).toHaveBeenCalledTimes(1);
  });

  it("drops a held press queued behind one that ran on blur, and leaves nothing waiting", async () => {
    const { editor, ran, landFirstSave } = queuedBehindOneThatRan();
    await ran();
    act(() => void window.dispatchEvent(new Event("blur")));
    expect(editor.box.hasAttribute(PRESS_WAITING_ATTR)).toBe(false);
    expect(cancelNewestStudioWaitingPress()).toBe(false);
    await landFirstSave();
  });

  it("lands a released drag when the window loses focus before the write does", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    act(() => void window.dispatchEvent(new Event("blur")));
    expect(layout.rafPaused.current, "the box does not re-measure under a waiting press").toBe(
      true,
    );

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
  });

  it("drops only the press still held when the window loses focus", async () => {
    const editor = mountEditor(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    pointer(editor.overlay, "pointerup", 190, 170);
    pointer(editor.box, "pointerdown", 190, 170);
    pointer(editor.overlay, "pointermove", 220, 170);
    act(() => void window.dispatchEvent(new Event("blur")));
    expect((editor.box as HTMLElement).style.left, "back to the released drop").toBe("140px");

    await act(async () => {
      land();
      await write;
    });
    await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
    expect(editor.onPathOffsetCommit).toHaveBeenCalledTimes(1);
  });
});

describe("a drag moves only with its own pointer pressed", () => {
  it.each([
    ["no button held, as Chromium sends after a layout change", { buttons: 0 }],
    ["another pointer", { pointerId: 2 }],
  ])(
    "a move with %s at a fixed point leaves the drop where the pointer let go",
    async (_, stray) => {
      const { live, overlay, box } = mountEditor(false);
      pointer(box, "pointerdown", 150, 150);
      pointer(overlay, "pointermove", 170, 160);
      pointer(overlay, "pointermove", 20, 20, stray);
      pointer(overlay, "pointermove", 190, 170);
      pointer(overlay, "pointermove", 20, 20, stray);
      expect(byId(live, "title").style.getPropertyValue("translate")).toBe("40px 20px");
      pointer(overlay, "pointerup", 190, 170);
      await settle();
      expect(file.title).toBe("translate: 40px 20px");
    },
  );
});

describe("a press while the preview swaps scenes in place", () => {
  it("waits for the swap and moves the swapped-in node", async () => {
    const { live, overlay, box } = mountEditor(false);
    Object.assign(live.contentWindow!, {
      __hfSwapScenes: (html: string) => {
        live.contentDocument!.body.innerHTML = html.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, "");
      },
    });
    let reply: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => (reply = resolve)));
    try {
      const replaced = byId(live, "title");
      act(() => api().refreshPlayer());
      pointer(box, "pointerdown", 150, 150);
      pointer(overlay, "pointermove", 190, 170);
      pointer(overlay, "pointerup", 190, 170);
      expect(box.hasAttribute(PRESS_WAITING_ATTR), "held until the new scenes show").toBe(true);

      reply(new Response(served("").contentDocument!.documentElement.outerHTML));
      await waitFor(() => expect(file.title).toBe("translate: 40px 20px"));
      expect(byId(live, "title")).not.toBe(replaced);
      expect(byId(live, "title").style.getPropertyValue("translate")).toBe("40px 20px");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("an outside change during a drag, on a preview that can swap scenes in place", () => {
  it("leaves the dragged node in place and shows the change after the drop, loaded fresh", async () => {
    const { live, overlay, box } = mountEditor(false);
    const swapScenes = vi.fn((html: string) => {
      live.contentDocument!.body.innerHTML = html.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, "");
    });
    Object.assign(live.contentWindow!, { __hfSwapScenes: swapScenes });
    vi.stubGlobal(
      "fetch",
      async () => new Response(served("").contentDocument!.documentElement.outerHTML),
    );
    const dragged = byId(live, "title");
    pointer(box, "pointerdown", 150, 150);
    pointer(overlay, "pointermove", 190, 170);

    act(() => api().refreshPlayer());
    await settle();
    expect(swapScenes, "swapped under the pointer").not.toHaveBeenCalled();
    expect(byId(live, "title")).toBe(dragged);
    const beforeDrop = await paintShadow(api, served("?_t=1"));
    expect(api().iframeRef.current, "promoted under the pointer").toBe(live);

    pointer(overlay, "pointerup", 190, 170);
    await settle();
    expect(file.title).toBe("translate: 40px 20px");
    const fresh = served("?_t=2");
    expect(await paintShadow(api, fresh)).toBeGreaterThan(beforeDrop);
    expect(api().iframeRef.current).toBe(fresh);
    expect(byId(fresh, "title").style.getPropertyValue("translate")).toBe("40px 20px");
    vi.unstubAllGlobals();
  });
});

type Editor = ReturnType<typeof mountEditor>;

describe("every way a drag ends without a drop clears its mark and promotes the held reload", () => {
  it.each([
    ["pointercancel", (e: Editor) => pointer(e.overlay, "pointercancel", 0, 0)],
    ["lostpointercapture", (e: Editor) => pointer(e.box, "lostpointercapture", 0, 0)],
    ["window blur", () => act(() => void window.dispatchEvent(new Event("blur")))],
    ["a switch to read-only", (e: Editor) => e.render(true)],
    ["overlay unmount", () => act(() => overlayRoot.unmount())],
  ])("%s", async (_, end) => {
    const editor = mountEditor(false);
    pointer(editor.box, "pointerdown", 150, 150);
    pointer(editor.overlay, "pointermove", 190, 170);
    expect(marked(editor.live.contentDocument!)).toHaveLength(1);
    const held = await reloadMidGesture();
    expect(api().iframeRef.current).toBe(editor.live);

    end(editor);
    await settle();
    expect(marked(editor.live.contentDocument!)).toHaveLength(0);
    expect(byId(editor.live, "title").style.getPropertyValue("translate")).not.toBe("40px 20px");
    expect(editor.onPathOffsetCommit).not.toHaveBeenCalled();
    expect(api().iframeRef.current, "nothing was saved, so the held copy is current").toBe(
      held.shadow,
    );
  });

  it.each([
    ["one layer", false],
    ["a group", true],
  ])(
    "a press on %s that throws before the drag is armed leaves no mark behind",
    async (_, group) => {
      const editor = mountEditor(group);
      HTMLElement.prototype.setPointerCapture = () => {
        throw new Error("capture refused");
      };
      const swallow = (event: ErrorEvent) => event.preventDefault();
      window.addEventListener("error", swallow);
      try {
        pointer(editor.box, "pointerdown", 150, 150);
      } catch {
        // React may rethrow the handler's error; either way the mark must be gone.
      } finally {
        window.removeEventListener("error", swallow);
      }
      expect(marked(editor.live.contentDocument!)).toHaveLength(0);
      const { shadow } = await reloadMidGesture();
      expect(api().iframeRef.current).toBe(shadow);
    },
  );
});

describe("an inline text edit", () => {
  it("holds a reload while open, and the reload after it shows the saved text", async () => {
    const live = makePreview(TWO_LAYERS);
    player = mountPlayerWithPreview(live);
    let land: () => void = () => {};
    const onCommit = vi.fn(() => new Promise<void>((resolve) => (land = resolve)));
    let controls: ReturnType<typeof useInlineTextEdit> | null = null;
    function Editor() {
      controls = useInlineTextEdit({ onCommit });
      return null;
    }
    overlayRoot = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => overlayRoot.render(<Editor />));
    act(() => void controls!.start(byId(live, "title")));
    const held = await reloadMidGesture();
    expect(api().iframeRef.current).toBe(live);

    act(() => controls!.commit());
    await settle();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(marked(live.contentDocument!), "closed, though the save is still out").toHaveLength(0);
    expect(api().iframeRef.current, "the held copy predates the text").toBe(live);
    expect(api().previewSlots.find((slot) => slot.role === "shadow")?.gen).toBe(held.gen);

    await act(async () => land());
    await settle();
    const afterSave = served("?_t=2");
    expect(await paintShadow(api, afterSave)).toBeGreaterThan(held.gen);
    expect(api().iframeRef.current).toBe(afterSave);
  });
});
