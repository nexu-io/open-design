// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import { GSAP_EDIT_BLOCK_COPY } from "../../hooks/gsapEditOutcome";
import { tryGsapDragIntercept } from "../../hooks/gsapRuntimeBridge";
import { getAnimationsForElement } from "../../hooks/useGsapTweenCache";
import { useCommitPreflightCapabilities } from "../../hooks/useCommitPreflightCapabilities";
import { CANVAS_NUDGE_COMMIT_DEBOUNCE_MS } from "./domEditNudge";
import { __resetForTests } from "../../utils/canvasNudgeGate";
import type { DomEditSelection } from "./domEditing";
import "./domEditOverlayTestMocks";
import { DomEditOverlay } from "./DomEditOverlay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Parse = { animations: GsapAnimation[] } | null;
const parses = vi.hoisted(() => ({ fetch: vi.fn<(...args: unknown[]) => Promise<unknown>>() }));
const layout = vi.hoisted(() => ({ group: [] as unknown[] }));

vi.mock("../../hooks/keyframeCacheAstLoad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/keyframeCacheAstLoad")>()),
  fetchParsedAnimations: (...args: unknown[]) => parses.fetch(...args),
}));

vi.mock("./useDomEditOverlayRects", () => {
  const rect = { left: 100, top: 100, width: 200, height: 100, editScaleX: 1, editScaleY: 1 };
  return {
    useDomEditOverlayRects: () => ({
      overlayRect: rect,
      overlayRectRef: { current: rect },
      setOverlayRect: () => undefined,
      hoverRect: null,
      groupOverlayItems: layout.group,
      groupOverlayItemsRef: { current: layout.group },
      setGroupOverlayItems: () => undefined,
      childRects: [],
    }),
  };
});

const BOX = '[data-dom-edit-selection-box="true"]';
const DOTS = "div.h-4.w-4";
const ROTATE = '[aria-label="Rotate selection"]';
const RECT = { left: 100, top: 100, width: 200, height: 100, editScaleX: 1, editScaleY: 1 };
let root: Root;
let host: HTMLElement;

function tween(
  properties: Record<string, number>,
  extra: Partial<GsapAnimation> = {},
): GsapAnimation {
  return {
    id: `#title-to-${Object.keys(properties).join("-")}`,
    targetSelector: "#title",
    method: "to",
    properties,
    position: 0,
    resolvedStart: 0,
    duration: 2,
    ...extra,
  } as unknown as GsapAnimation;
}

const loop = (properties: Record<string, number>, targetSelector = "#title") =>
  tween(properties, { targetSelector, provenance: { kind: "loop" } } as never);

function element(id: string, className = "") {
  const el = document.createElement("h1");
  el.id = id;
  el.className = className;
  document.body.append(el);
  return el;
}

function resolved(el: HTMLElement): DomEditSelection {
  const selection = makeSelection(el.id, el);
  selection.capabilities.canApplyManualRotation = true;
  return selection;
}

/** A preview whose runtime timeline is visibly moving `els` with one shared tween. */
function livePreview(els: HTMLElement[], vars: Record<string, number>) {
  const liveTween = {
    targets: () => els,
    vars: { ...vars, duration: 1 },
    duration: () => 1,
    startTime: () => 0,
  };
  const timeline = { getChildren: () => [liveTween], duration: () => 6 };
  const byId = (sel: string) => els.find((el) => sel === `#${el.id}`) ?? null;
  return {
    contentWindow: { __timelines: { root: timeline }, gsap: { getProperty: () => 0 } },
    contentDocument: { querySelector: byId },
  } as unknown as HTMLIFrameElement;
}

interface EditorProps {
  selection: DomEditSelection | null;
  groups?: DomEditSelection[];
  version?: number;
  preview?: HTMLIFrameElement | null;
  projectId?: string;
}

/** Studio's session narrowing feeding the real overlay, as the editor mounts it. */
function mount(first: EditorProps) {
  const spies = {
    onBlockedMove: vi.fn(),
    onPathOffsetCommit: vi.fn(),
    onManualDragStart: vi.fn(),
  };
  const seen: { selection: DomEditSelection | null; groups: DomEditSelection[] } = {
    selection: null,
    groups: [],
  };
  const iframeRef = { current: document.createElement("iframe") };
  function Editor({
    selection,
    groups,
    version = 0,
    preview = null,
    projectId = "p",
  }: EditorProps) {
    const groupSelections = groups ?? (selection ? [selection] : []);
    const narrowed = useCommitPreflightCapabilities({
      projectId,
      enabled: true,
      selection,
      groupSelections,
      previewIframeRef: { current: preview },
      version,
    });
    seen.selection = narrowed.selection;
    seen.groups = narrowed.groupSelections;
    layout.group =
      groupSelections.length > 1
        ? narrowed.groupSelections.map((s) => ({
            key: s.id,
            selection: s,
            element: s.element,
            rect: RECT,
          }))
        : [];
    return (
      <DomEditOverlay
        iframeRef={iframeRef}
        activeCompositionPath={null}
        selection={groupSelections.length > 1 ? null : narrowed.selection}
        groupSelections={groupSelections.length > 1 ? narrowed.groupSelections : []}
        hoverSelection={null}
        onCanvasMouseDown={() => undefined}
        onCanvasPointerMove={() => Promise.resolve(narrowed.selection)}
        onCanvasPointerLeave={() => undefined}
        onSelectionChange={() => undefined}
        onGroupPathOffsetCommit={() => undefined}
        onBoxSizeCommit={() => undefined}
        onRotationCommit={() => undefined}
        {...spies}
      />
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (props: EditorProps) => act(() => root.render(<Editor {...props} />));
  render(first);
  return { spies, seen, render, overlay: () => host.firstElementChild as HTMLElement };
}

const answer = (animations: GsapAnimation[]) =>
  parses.fetch.mockResolvedValueOnce({ animations } satisfies Parse);

async function settle() {
  await act(async () => {
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  });
}

const fire = (target: Element, type: string, init: MouseEventInit = {}) => {
  act(() => {
    const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, buttons, ...init }),
    );
  });
};

const flags = (selection: DomEditSelection | null) => {
  const c = selection?.capabilities;
  return [c?.canApplyManualOffset, c?.canApplyManualSize, c?.canApplyManualRotation];
};

const handles = (overlay: HTMLElement) => ({
  dots: overlay.querySelectorAll(DOTS).length,
  rotate: Boolean(overlay.querySelector(ROTATE)),
});

/** Select `#title` in a file whose parse is `animations` (none queued when null). */
async function select(animations: GsapAnimation[] | null, props: Partial<EditorProps> = {}) {
  if (animations) answer(animations);
  const view = mount({ selection: resolved(element("title")), ...props });
  await settle();
  return view;
}

async function selectLoopedPair() {
  const a = resolved(element("a"));
  const b = resolved(element("b"));
  const view = await select([loop({ x: 120 }, "#a")], { selection: a, groups: [a, b] });
  return { a, b, ...view };
}

describe("handles follow what Studio would commit", () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = () => undefined;
    __resetForTests();
    parses.fetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    document.body.innerHTML = "";
    layout.group = [];
  });

  it("hides every handle on a helper-loop animation and says why", async () => {
    const { seen, overlay, spies } = await select([loop({ x: 120, rotation: 30, width: 320 })]);

    expect(flags(seen.selection)).toEqual([false, false, false]);
    expect(seen.selection?.capabilities.reasonIfDisabled).toBe(
      GSAP_EDIT_BLOCK_COPY["unroll-required"],
    );
    expect(handles(overlay())).toEqual({ dots: 0, rotate: false });
    expect((overlay().querySelector(BOX) as HTMLElement).style.cursor).toBe("default");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      vi.advanceTimersByTime(CANVAS_NUDGE_COMMIT_DEBOUNCE_MS + 10);
    });
    expect(spies.onPathOffsetCommit).not.toHaveBeenCalled();
  });

  it("hides every handle on a runtime-computed animation and says why", async () => {
    const computed = { provenance: { kind: "runtime-dynamic" } } as never;
    const { seen, overlay } = await select([tween({ x: 120, rotation: 30, width: 320 }, computed)]);

    expect(flags(seen.selection)).toEqual([false, false, false]);
    expect(seen.selection?.capabilities.reasonIfDisabled).toBe(
      GSAP_EDIT_BLOCK_COPY["source-uneditable"],
    );
    expect(handles(overlay())).toEqual({ dots: 0, rotate: false });
  });

  it("keeps every handle on a plain keyframed element, and a drag still commits", async () => {
    const frames = [
      { percentage: 0, properties: { x: 0, y: 0 } },
      { percentage: 100, properties: { x: 200, y: 40 } },
    ];
    const keyframed = { propertyGroup: "position", keyframes: { keyframes: frames } } as never;
    const { seen, overlay, spies } = await select([tween({}, keyframed)]);

    expect(flags(seen.selection)).toEqual([true, true, true]);
    expect(handles(overlay())).toEqual({ dots: 4, rotate: true });
    fire(overlay().querySelector(BOX)!, "pointerdown", { clientX: 150, clientY: 150 });
    fire(overlay(), "pointermove", { clientX: 190, clientY: 150 });
    fire(overlay(), "pointerup", { clientX: 190, clientY: 150 });
    await settle();
    expect(spies.onBlockedMove).not.toHaveBeenCalled();
    expect(spies.onPathOffsetCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the handles of an element a class tween animates, as the commit does", async () => {
    const card = element("card-1", "card");
    const preview = livePreview([card], { y: 40 });
    const stagger = tween({ y: 40 }, { targetSelector: ".card", method: "from" } as never);
    const selection = resolved(card);
    const { seen, overlay } = await select([stagger], { selection, preview });

    expect(flags(seen.selection)).toEqual([true, true, true]);
    expect(handles(overlay()).dots).toBe(4);
    const commitList = getAnimationsForElement(
      [stagger],
      { id: "card-1", selector: "#card-1" },
      card,
    );
    const preflightOnly = { preflightOnly: true };
    const commit = tryGsapDragIntercept(
      selection,
      { x: 0, y: 0 },
      commitList,
      preview,
      vi.fn(async () => undefined),
      undefined,
      preflightOnly,
    );
    expect(await commit).toEqual({ status: "persisted" });
  });

  it("shows no handles and stays silent on a press while the check is still running", async () => {
    parses.fetch.mockReturnValue(new Promise<Parse>(() => undefined));
    const { seen, overlay, spies } = await select(null);

    expect(flags(seen.selection)).toEqual([false, false, false]);
    expect(seen.selection?.capabilities.commitCheckPending).toBe(true);
    expect(handles(overlay())).toEqual({ dots: 0, rotate: false });
    fire(overlay().querySelector(BOX)!, "pointerdown", { clientX: 150, clientY: 150 });
    expect(spies.onBlockedMove).not.toHaveBeenCalled();
  });

  it("gives a plain element in a file with no animations its handles after one read", async () => {
    const { seen, overlay, render } = await select([]);

    expect(flags(seen.selection)).toEqual([true, true, true]);
    expect(handles(overlay()).dots).toBe(4);
    render({ selection: resolved(element("subtitle")) });
    expect(flags(seen.selection)).toEqual([true, true, true]);
    expect(parses.fetch).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed read instead of keeping the failure", async () => {
    parses.fetch.mockResolvedValueOnce(null);
    const { seen, render } = await select(null);
    const title = seen.selection!.element;
    expect(flags(seen.selection)[0]).toBe(false);

    answer([]);
    render({ selection: null });
    render({ selection: resolved(title) });
    await settle();
    expect(parses.fetch).toHaveBeenCalledTimes(2);
    expect(flags(seen.selection)[0]).toBe(true);
  });

  it("re-checks when the animations change, keeping the last answer until the new one lands", async () => {
    const selection = resolved(element("title"));
    const { seen, render } = await select([tween({ x: 120 })], { selection });
    expect(flags(seen.selection)[0]).toBe(true);

    let land: (parse: Parse) => void = () => undefined;
    parses.fetch.mockReturnValueOnce(new Promise<Parse>((resolve) => (land = resolve)));
    render({ selection, version: 1 });
    await settle();
    // The save re-resolves the selection while the new read is still in flight.
    render({ selection: resolved(selection.element), version: 1 });
    expect(flags(seen.selection)[0]).toBe(true);
    await act(async () => land({ animations: [loop({ x: 120 })] }));
    await settle();
    expect(flags(seen.selection)[0]).toBe(false);
    expect(parses.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the last answer when a re-check read fails, and takes the next good one", async () => {
    const selection = resolved(element("title"));
    const { seen, render } = await select([], { selection });
    expect(flags(seen.selection)[0]).toBe(true);

    parses.fetch.mockResolvedValueOnce(null);
    render({ selection, version: 1 });
    await settle();
    let land: (parse: Parse) => void = () => undefined;
    parses.fetch.mockReturnValueOnce(new Promise<Parse>((resolve) => (land = resolve)));
    render({ selection: resolved(selection.element), version: 1 });
    await settle();
    expect(parses.fetch).toHaveBeenCalledTimes(3);
    expect(flags(seen.selection)[0]).toBe(true);
    expect(seen.selection?.capabilities.commitCheckPending).toBeUndefined();

    await act(async () => land({ animations: [loop({ x: 120 })] }));
    await settle();
    expect(flags(seen.selection)[0]).toBe(false);
  });

  it("checks another project's file against that project's own parse", async () => {
    const { seen, render } = await select([loop({ x: 120 })], { projectId: "a" });
    const title = seen.selection!.element;
    expect(flags(seen.selection)[0]).toBe(false);

    answer([]);
    render({ selection: resolved(title), projectId: "b" });
    await settle();
    expect(parses.fetch).toHaveBeenLastCalledWith("b", "index.html");
    expect(flags(seen.selection)[0]).toBe(true);
  });

  // The per-element left/top channel supersedes the old refusal: each member saves its own move.
  it("lets a group move carried by one shared tween through as each member's own offset", async () => {
    const dots = [element("dot-1", "dot"), element("dot-2", "dot")];
    const preview = livePreview(dots, { y: 40 });
    const stagger = tween({ y: 40 }, { targetSelector: ".dot", method: "from" } as never);
    const [a, b] = dots.map(resolved);
    const { seen, overlay, spies } = await select([stagger], {
      selection: a!,
      groups: [a!, b!],
      preview,
    });

    expect(seen.groups.map((s) => flags(s)[0])).toEqual([true, true]);
    fire(overlay().querySelector(BOX)!, "pointerdown", { clientX: 150, clientY: 150 });
    expect(spies.onBlockedMove).not.toHaveBeenCalled();
    const groupPreflight = { preflightOnly: true, group: true };
    const commit = tryGsapDragIntercept(
      a!,
      { x: 0, y: 0 },
      [stagger],
      preview,
      vi.fn(async () => undefined),
      undefined,
      groupPreflight,
    );
    expect(await commit).toEqual({ status: "element-offset" });
  });

  it("toasts once on the primary press of a blocked element, before any travel", async () => {
    const { overlay, spies } = await select([loop({ x: 120 })]);
    const box = overlay().querySelector(BOX)!;

    fire(box, "pointerdown", { button: 2, clientX: 150, clientY: 150 });
    fire(overlay(), "pointerup", { button: 2 });
    expect(spies.onBlockedMove).not.toHaveBeenCalled();
    fire(box, "pointerdown", { clientX: 150, clientY: 150 });
    expect(spies.onBlockedMove).toHaveBeenCalledTimes(1);
    expect(spies.onBlockedMove.mock.calls[0]![0].capabilities.reasonIfDisabled).toBe(
      GSAP_EDIT_BLOCK_COPY["unroll-required"],
    );
    fire(overlay(), "pointermove", { clientX: 200, clientY: 150 });
    fire(overlay(), "pointerup", { clientX: 200, clientY: 150 });
    expect(spies.onBlockedMove).toHaveBeenCalledTimes(1);
    expect(spies.onManualDragStart).not.toHaveBeenCalled();
    expect(spies.onPathOffsetCommit).not.toHaveBeenCalled();
  });

  it("narrows each group member on its own and toasts the blocked one on a group press", async () => {
    const a = resolved(element("a"));
    const b = resolved(element("b"));
    const { seen, overlay, spies } = await select([loop({ x: 120 }, "#a")], {
      selection: a,
      groups: [a, b],
    });

    expect(seen.groups.map((s) => flags(s)[0])).toEqual([false, true]);
    fire(overlay().querySelector(BOX)!, "pointerdown", { clientX: 150, clientY: 150 });
    expect(spies.onBlockedMove).toHaveBeenCalledTimes(1);
    expect(spies.onBlockedMove.mock.calls[0]![0].element).toBe(a.element);
    expect(spies.onManualDragStart).not.toHaveBeenCalled();
  });

  it("re-checks only the members that changed when the group is handed back anew", async () => {
    const { a, b, seen, render } = await selectLoopedPair();
    const [narrowedA, narrowedB] = seen.groups;

    render({ selection: a, groups: [a, b] });
    expect(seen.groups[0]).toBe(narrowedA);
    expect(seen.groups[1]).toBe(narrowedB);
    const movedA = resolved(a.element);
    render({ selection: movedA, groups: [movedA, b] });
    expect(seen.groups[0]).not.toBe(narrowedA);
    expect(flags(seen.groups[0]!)[0]).toBe(false);
    expect(seen.groups[1]).toBe(narrowedB);
  });

  it("checks again on a new cache version even when that re-read fails", async () => {
    const { a, b, seen, render } = await selectLoopedPair();
    const [narrowedA] = seen.groups;

    parses.fetch.mockResolvedValueOnce(null);
    render({ selection: a, groups: [a, b], version: 1 });
    await settle();
    expect(seen.groups[0]).not.toBe(narrowedA);
    expect(flags(seen.groups[0]!)[0]).toBe(false);
  });

  it.each([
    ["rotation", loop({ rotation: 90 }), [true, true, false], { dots: 4, rotate: false }],
    ["resize", loop({ width: 320, height: 90 }), [true, false, true], { dots: 0, rotate: true }],
  ])(
    "narrows only %s when only that channel is a helper's",
    async (_, animation, expected, shown) => {
      const { seen, overlay } = await select([animation]);
      expect(flags(seen.selection)).toEqual(expected);
      expect(handles(overlay())).toEqual(shown);
    },
  );
});
