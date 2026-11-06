// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "./domEditingTypes";
import type { DomEditGroupPathOffsetCommit } from "./domEditOverlayGestures";
import { STUDIO_OFFSET_X_PROP, STUDIO_OFFSET_Y_PROP } from "./manualEdits";
import { isStudioManualEditGestureLiveIn } from "./manualEditsDom";
import { readTranslatePx } from "./plainTranslate";
import { moveDomGroupBy } from "./domGroupMoveBy";
import { GsapEditBlockedError } from "../../hooks/gsapEditOutcome";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({ drag: vi.fn() }));
vi.mock("../../hooks/gsapRuntimeBridge", () => ({
  tryGsapDragIntercept: mocks.drag,
  tryGsapRotationIntercept: vi.fn(),
}));
vi.mock("../../hooks/useAnimatedPropertyCommit", () => ({
  useAnimatedPropertyCommit: () => ({
    commitAnimatedProperty: vi.fn(),
    commitAnimatedProperties: vi.fn(),
  }),
}));
vi.mock("../../hooks/useSafeGsapCommitMutation", () => ({
  useGsapSaveFailureTelemetry: () => vi.fn(),
  useSafeGsapCommitMutation: (commit: unknown) => commit,
}));
vi.mock("../../utils/studioSaveDiagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/studioSaveDiagnostics")>()),
  trackStudioEditBlocked: vi.fn(),
  trackStudioSaveFailure: vi.fn(),
}));

import { mountGsapAwareEditing } from "../../hooks/useGsapAwareEditing.testHelpers";

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

/** A preview iframe drawn at half size: 200x100 composition px in a 100x50 box. */
function preview(): Document {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const win = iframe.contentWindow!;
  Object.defineProperty(win, "frameElement", { configurable: true, value: iframe });
  Object.defineProperty(win, "innerWidth", { configurable: true, value: 200 });
  Object.defineProperty(win, "innerHeight", { configurable: true, value: 100 });
  iframe.getBoundingClientRect = () => new DOMRect(50, 40, 100, 50);
  return iframe.contentDocument!;
}

const turned = (deg: number, scale: number) => {
  const r = (deg * Math.PI) / 180;
  return [scale * Math.cos(r), scale * Math.sin(r), -scale * Math.sin(r), scale * Math.cos(r)];
};

/** An element whose box centre is `at` plus its own move carried through its ancestors' linear map. */
function layer(doc: Document, id: string, parent = [1, 0, 0, 1], gsap?: object) {
  const element = Object.assign(doc.createElement("div"), gsap ? { _gsap: gsap } : {});
  doc.body.append(element);
  const own = () => {
    if (!gsap) return readTranslatePx(element);
    const read = (prop: string) => Number.parseFloat(element.style.getPropertyValue(prop)) || 0;
    return { x: read(STUDIO_OFFSET_X_PROP), y: read(STUDIO_OFFSET_Y_PROP) };
  };
  element.getBoundingClientRect = () => {
    const { x, y } = own();
    const [a, b, c, d] = parent as [number, number, number, number];
    return new DOMRect(60 + a * x + c * y - 20, 40 + b * x + d * y - 10, 40, 20);
  };
  const selection = {
    element,
    id,
    selector: `#${id}`,
    label: id,
    capabilities: { canApplyManualOffset: true },
  } as unknown as DomEditSelection;
  const centre = () => {
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  return { element, selection, centre };
}

function mountGroupCommit() {
  const showToast = vi.fn();
  const save = vi.fn().mockResolvedValue(undefined);
  const stageElementPositionOffset = vi.fn(() => ({ save, rollback: vi.fn() }));
  const { editing, root } = mountGsapAwareEditing({ showToast, stageElementPositionOffset });
  const commit = (u: DomEditGroupPathOffsetCommit[], o?: { refusalToast?: boolean }) =>
    editing().handleGsapAwareGroupPathOffsetCommit(u, o);
  const moveBy = (moves: Parameters<typeof moveDomGroupBy>[0]) =>
    act(() => moveDomGroupBy(moves, (u) => commit(u, { refusalToast: false })));
  return {
    commit: (u: DomEditGroupPathOffsetCommit[]) => commit(u),
    moveBy,
    showToast,
    stageElementPositionOffset,
    root,
  };
}

const moved = (from: { x: number; y: number }, to: { x: number; y: number }) => ({
  x: to.x - from.x,
  y: to.y - from.y,
});

describe("handleDomGroupMoveBy", () => {
  it("moves each box by its delta in composition px, saved under one undo entry", async () => {
    const doc = preview();
    const offset = layer(doc, "offset");
    offset.element.style.setProperty("translate", "30px 0px");
    const halved = layer(doc, "halved", [0.5, 0, 0, 0.5]);
    const before = [offset.centre(), halved.centre()];
    const { moveBy, stageElementPositionOffset, showToast, root } = mountGroupCommit();

    await moveBy([
      { selection: offset.selection, delta: { x: 10, y: 0 } },
      { selection: halved.selection, delta: { x: 0, y: -5 } },
    ]);

    expect(moved(before[0]!, offset.centre())).toEqual({ x: 10, y: 0 });
    expect(moved(before[1]!, halved.centre())).toEqual({ x: 0, y: -5 });
    const calls = stageElementPositionOffset.mock.calls as unknown as unknown[][];
    expect(calls.map((call) => call[1])).toEqual([
      { x: 40, y: 0 },
      { x: 0, y: -10 },
    ]);
    expect(calls[0]![3]).toMatch(/^group-drag:\d+$/);
    expect(calls[1]![3]).toBe(calls[0]![3]);
    expect(showToast).not.toHaveBeenCalled();
    expect(isStudioManualEditGestureLiveIn(doc)).toBe(false);
    act(() => root.unmount());
  });

  it("lands exactly under a half-scale parent with a rotated ancestor", async () => {
    const doc = preview();
    const tilted = layer(doc, "tilted", turned(30, 0.5));
    const before = tilted.centre();
    const { moveBy, root } = mountGroupCommit();

    await moveBy([{ selection: tilted.selection, delta: { x: 10, y: 0 } }]);

    const delta = moved(before, tilted.centre());
    // Exact to the 0.001 px a translate is written with.
    expect(delta.x).toBeCloseTo(10, 3);
    expect(delta.y).toBeCloseTo(0, 3);
    act(() => root.unmount());
  });

  it("moves a member GSAP positions through the GSAP write, planned and written at one delta", async () => {
    mocks.drag.mockResolvedValue({ status: "persisted" });
    const doc = preview();
    const animated = layer(doc, "animated", [1, 0, 0, 1], { renderTransform: () => {} });
    const before = animated.centre();
    const { moveBy, stageElementPositionOffset, root } = mountGroupCommit();

    await moveBy([{ selection: animated.selection, delta: { x: 10, y: 0 } }]);

    const write = mocks.drag.mock.calls.find((call) => !call[6]?.preflightOnly);
    expect(write?.[0]).toBe(animated.selection);
    expect(write?.[1]).toEqual({ x: 10, y: 0 });
    const plan = mocks.drag.mock.calls.find((call) => call[6]?.preflightOnly);
    expect(plan?.[1]).toEqual(write?.[1]);
    expect(moved(before, animated.centre())).toEqual({ x: 10, y: 0 });
    expect(stageElementPositionOffset).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("skips a zero delta, and writes nothing when every delta is zero", async () => {
    const doc = preview();
    const still = layer(doc, "still");
    const { moveBy, stageElementPositionOffset, root } = mountGroupCommit();

    await moveBy([{ selection: still.selection, delta: { x: 0, y: 0 } }]);

    expect(stageElementPositionOffset).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it.each([
    [
      "a member that can't take a manual move",
      (doc: Document) => {
        const locked = layer(doc, "locked");
        Object.assign(locked.selection.capabilities, {
          canApplyManualOffset: false,
          reasonIfDisabled: "Locked by a helper loop.",
        });
        return locked;
      },
      /helper loop/,
    ],
    [
      "a member an animation took over",
      (doc: Document) => layer(doc, "folded", [1, 0, 0, 1], { x: "94px" }),
      /animation took over/,
    ],
    [
      "a member the GSAP write refuses",
      (doc: Document) => {
        mocks.drag.mockResolvedValue({ status: "blocked", reason: "no-selector" });
        return layer(doc, "blocked", [1, 0, 0, 1], { renderTransform: () => {} });
      },
      new GsapEditBlockedError("no-selector").message,
    ],
  ])("refuses %s before any write, without a Studio toast", async (_, make, reason) => {
    const doc = preview();
    const fine = layer(doc, "fine");
    const refused = make(doc);
    const before = [fine.centre(), refused.centre()];
    const { moveBy, stageElementPositionOffset, showToast, root } = mountGroupCommit();

    await expect(
      moveBy([
        { selection: fine.selection, delta: { x: 10, y: 0 } },
        { selection: refused.selection, delta: { x: 10, y: 0 } },
      ]),
    ).rejects.toThrow(reason);

    expect(stageElementPositionOffset).not.toHaveBeenCalled();
    expect(mocks.drag.mock.calls.some((call) => !call[6]?.preflightOnly)).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
    expect([fine.centre(), refused.centre()]).toEqual(before);
    expect(isStudioManualEditGestureLiveIn(doc)).toBe(false);
    act(() => root.unmount());
  });

  it.each([
    ["an animation took over", () => layer(preview(), "folded", [1, 0, 0, 1], { x: "94px" }), true],
    [
      "the GSAP write refuses",
      () => {
        mocks.drag.mockResolvedValue({ status: "blocked", reason: "no-selector" });
        return layer(preview(), "blocked", [1, 0, 0, 1], { renderTransform: () => {} });
      },
      false,
    ],
  ])("still toasts on a canvas group drag when %s", async (_, make, plainTranslate) => {
    const { selection } = make();
    const { commit, showToast, root } = mountGroupCommit();

    await expect(
      act(() => commit([{ selection, next: { x: 1, y: 2 }, plainTranslate }])),
    ).rejects.toThrow();

    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
    act(() => root.unmount());
  });
});
