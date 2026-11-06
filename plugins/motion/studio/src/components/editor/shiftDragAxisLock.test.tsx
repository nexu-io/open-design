// @vitest-environment happy-dom
import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "./domEditing";
import type { GestureState, GroupGestureState } from "./domEditOverlayGestures";
import { DomEditGroupChrome, DomEditSelectionChrome } from "./DomEditSelectionChrome";
import { createManualOffsetDragMember } from "./manualOffsetDrag";
import { resolveSnapAdjustment } from "./snapEngine";
import { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function gestureHarness(gesture: Partial<GestureState> | null, group: GroupGestureState | null) {
  const opts = {
    gestureRef: { current: gesture },
    groupGestureRef: { current: group },
    selectionRef: { current: null },
    hoverSelectionRef: { current: null },
    boxRef: { current: null },
    blockedMoveRef: { current: null },
    waitingPressRef: { current: null },
    rafPausedRef: { current: false },
    suppressNextBoxClickRef: { current: false },
    snapGuidesRef: { current: null },
    setOverlayRect: vi.fn(),
    setGroupOverlayItems: vi.fn(),
    onCanvasMouseDown: vi.fn(),
    onCanvasPointerMoveRef: { current: vi.fn() },
    onPathOffsetCommitRef: { current: vi.fn() },
    onGroupPathOffsetCommitRef: { current: vi.fn() },
  };
  const handlers = createDomEditOverlayGestureHandlers(opts as never);
  const pointer = (clientX: number, clientY: number, shiftKey: boolean) =>
    ({ clientX, clientY, shiftKey, altKey: false, pointerId: 1, buttons: 1 }) as never;
  return { opts, handlers, pointer };
}

function singleDrag() {
  const element = document.createElement("div");
  return gestureHarness(
    {
      kind: "drag",
      mode: "path-offset",
      pointerId: 1,
      selection: { element } as unknown as DomEditSelection,
      startX: 100,
      startY: 100,
      originLeft: 10,
      originTop: 20,
      originWidth: 50,
      originHeight: 40,
      editScaleX: 1,
      editScaleY: 1,
      actualRotation: 0,
    },
    null,
  );
}

const groupGesture = () =>
  ({
    pointerId: 1,
    startX: 100,
    startY: 100,
    originItems: [],
    members: [],
  }) as unknown as GroupGestureState;

describe("shift+drag locks a move to the axis the pointer travels further on", () => {
  it("keeps a mostly horizontal single drag on its row", () => {
    const { opts, handlers, pointer } = singleDrag();
    handlers.onPointerMove(pointer(130, 108, true));
    expect(opts.setOverlayRect).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 40, top: 20 }),
    );
  });

  it("keeps a mostly vertical single drag on its column", () => {
    const { opts, handlers, pointer } = singleDrag();
    handlers.onPointerMove(pointer(95, 160, true));
    expect(opts.setOverlayRect).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 10, top: 80 }),
    );
  });

  it("frees the drag on the next move once shift is released, and locks again when pressed", () => {
    const { opts, handlers, pointer } = singleDrag();
    handlers.onPointerMove(pointer(130, 108, false));
    expect(opts.setOverlayRect).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 40, top: 28 }),
    );
    handlers.onPointerMove(pointer(140, 110, true));
    expect(opts.setOverlayRect).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 50, top: 20 }),
    );
  });

  it("locks a group drag the same way", () => {
    const group = groupGesture();
    const { handlers, pointer } = gestureHarness(null, group);
    handlers.onPointerMove(pointer(130, 108, true));
    expect([group.lastSnappedDx, group.lastSnappedDy]).toEqual([30, 0]);
  });

  it("snaps a locked drag only along its free axis", () => {
    const target = {
      id: "t",
      left: 0,
      top: 203,
      right: 400,
      bottom: 303,
      centerX: 200,
      centerY: 253,
    };
    const snap = (lockedAxis?: "x" | "y") =>
      resolveSnapAdjustment({
        movingRect: { left: 0, top: 0, width: 50, height: 200 },
        proposedDx: 97,
        proposedDy: 0,
        targets: [target],
        threshold: 6,
        disabled: false,
        lockedAxis,
      } as never);
    expect(snap().dy).toBe(3);
    const locked = snap("y");
    expect(locked.dy).toBe(0);
    expect(locked.guides.every((guide) => guide.axis === "x")).toBe(true);
  });
});

describe("shift+click on a selected box still toggles the element under the pointer", () => {
  it.each([
    ["group", () => gestureHarness(null, groupGesture())],
    ["single", () => singleMemberDrag()],
  ])(
    "hands a %s shift press that never travelled to the canvas as an additive click",
    (_, make) => {
      const { opts, handlers, pointer } = make();
      handlers.onPointerUp(pointer(101, 100, true));
      expect(opts.onCanvasMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({ shiftKey: true }),
        expect.objectContaining({ preferClipAncestor: false }),
      );
      expect(opts.suppressNextBoxClickRef.current).toBe(true);
    },
  );

  it("leaves a plain press on the group box alone", () => {
    const { opts, handlers, pointer } = gestureHarness(null, groupGesture());
    handlers.onPointerUp(pointer(101, 100, false));
    expect(opts.onCanvasMouseDown).not.toHaveBeenCalled();
  });
});

describe("a shift press on a selected box starts the drag", () => {
  const rect = { left: 10, top: 10, width: 200, height: 100, editScaleX: 1, editScaleY: 1 };
  const gestures = () => ({
    startGesture: vi.fn(),
    startGroupDrag: vi.fn(),
    startBlockedMove: vi.fn(),
  });
  const shiftPress = (el: Element) =>
    act(() => {
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          shiftKey: true,
          pointerId: 1,
        }),
      );
    });

  function mount(node: (spies: ReturnType<typeof gestures>) => React.ReactNode) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const spies = gestures();
    act(() => root.render(node(spies)));
    const box = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    return { spies, box, unmount: () => act(() => root.unmount()) };
  }

  const single = (canMove: boolean) =>
    mount((spies) => (
      <DomEditSelectionChrome
        selection={
          {
            element: document.createElement("div"),
            capabilities: { canApplyManualOffset: canMove },
          } as unknown as DomEditSelection
        }
        overlayRect={rect}
        allowCanvasMovement
        allowBodyDrag
        boxRef={createRef()}
        boxChromeClass=""
        boxClipPath={undefined}
        selectionKey="box"
        groupSelectionCount={0}
        gestures={spies as never}
        onBoxClick={vi.fn()}
      />
    ));

  const group = (groupCanMove: boolean) =>
    mount((spies) => (
      <DomEditGroupChrome
        groupOverlayItems={[]}
        groupBounds={rect}
        allowCanvasMovement
        allowBodyDrag
        groupCanMove={groupCanMove}
        gestures={spies as never}
        onBoxClick={vi.fn()}
      />
    ));

  it("drags a single selection", () => {
    const { spies, box, unmount } = single(true);
    shiftPress(box);
    expect(spies.startGesture).toHaveBeenCalledWith("drag", expect.anything());
    unmount();
  });

  it("drags a group selection", () => {
    const { spies, box, unmount } = group(true);
    shiftPress(box);
    expect(spies.startGroupDrag).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("leaves a shift press on a box that cannot move to the multi-select toggle", () => {
    const one = single(false);
    shiftPress(one.box);
    expect(one.spies.startBlockedMove).not.toHaveBeenCalled();
    one.unmount();
    const many = group(false);
    shiftPress(many.box);
    expect(many.spies.startGroupDrag).not.toHaveBeenCalled();
    many.unmount();
  });
});

type GsapStub = {
  set: (el: Element, vars: object) => void;
  getProperty: (el: Element, p: string) => number;
};

function previewGsap(): GsapStub {
  const win = window as unknown as { gsap?: GsapStub };
  if (win.gsap) return win.gsap;
  const positions = new WeakMap<Element, Record<string, number>>();
  win.gsap = {
    set: (el, vars) => positions.set(el, { ...positions.get(el), ...vars }),
    getProperty: (el, prop) => positions.get(el)?.[prop] ?? 0,
  };
  return win.gsap;
}

function draggableMember(key: string) {
  const gsap = previewGsap();
  const element = document.createElement("div");
  document.body.append(element);
  gsap.set(element, { x: 10, y: -10 });
  const selection = {
    element,
    capabilities: { canApplyManualOffset: true },
  } as unknown as DomEditSelection;
  const result = createManualOffsetDragMember({
    key,
    selection,
    element,
    rect: { left: 0, top: 0, width: 50, height: 40, editScaleX: 1, editScaleY: 1 },
  } as never);
  if (!result.ok) throw new Error(result.reason);
  const at = () => [gsap.getProperty(element, "x"), gsap.getProperty(element, "y")];
  return { member: result.member, selection, at };
}

function singleMemberDrag() {
  const { member, selection, at } = draggableMember("single");
  const harness = gestureHarness(
    {
      kind: "drag",
      mode: "path-offset",
      pointerId: 1,
      selection,
      startX: 100,
      startY: 100,
      originLeft: 0,
      originTop: 0,
      originWidth: 50,
      originHeight: 40,
      editScaleX: 1,
      editScaleY: 1,
      actualRotation: 0,
      pathOffsetMember: member,
      initialPathOffset: member.initialPathOffset,
      manualEditDragToken: member.gestureToken,
    },
    null,
  );
  return { ...harness, at };
}

function groupMemberDrag() {
  const a = draggableMember("a");
  const b = draggableMember("b");
  const group = {
    pointerId: 1,
    startX: 100,
    startY: 100,
    originItems: [],
    members: [a.member, b.member],
  };
  const harness = gestureHarness(null, group as unknown as GroupGestureState);
  return { ...harness, at: () => [a.at(), b.at()] };
}

afterEach(() => {
  delete (window as unknown as { gsap?: GsapStub }).gsap;
});

describe("a press that stays under the drag threshold puts the preview back where it started", () => {
  it.each([true, false])("single, shift %s", (shift) => {
    const { handlers, pointer, at } = singleMemberDrag();
    handlers.onPointerMove(pointer(102, 100, shift));
    expect(at()).toEqual([12, -10]);
    handlers.onPointerUp(pointer(102, 100, shift));
    expect(at()).toEqual([10, -10]);
  });

  it.each([true, false])("group, shift %s", (shift) => {
    const { handlers, pointer, at } = groupMemberDrag();
    handlers.onPointerMove(pointer(102, 100, shift));
    handlers.onPointerUp(pointer(102, 100, shift));
    expect(at()).toEqual([
      [10, -10],
      [10, -10],
    ]);
  });
});

describe("a drag that travelled is not a click, even when it ends near its start", () => {
  it.each([
    ["single", singleMemberDrag, "onPathOffsetCommitRef"],
    ["group", groupMemberDrag, "onGroupPathOffsetCommitRef"],
  ] as const)("commits a %s shift drag instead of toggling", (_, make, commit) => {
    const { opts, handlers, pointer } = make();
    handlers.onPointerMove(pointer(180, 100, true));
    handlers.onPointerMove(pointer(101, 100, true));
    handlers.onPointerUp(pointer(101, 100, true));
    expect(opts.onCanvasMouseDown).not.toHaveBeenCalled();
    expect(opts[commit].current).toHaveBeenCalledTimes(1);
  });
});

describe("a cancelled drag puts the preview back where it started", () => {
  it("returns a single drag that travelled to its start and saves nothing", () => {
    const { opts, handlers, pointer, at } = singleMemberDrag();
    handlers.onPointerMove(pointer(140, 100, false));
    expect(at()).toEqual([50, -10]);
    handlers.clearPointerState({ current: null });
    expect(at()).toEqual([10, -10]);
    expect(opts.gestureRef.current).toBeNull();
    expect(opts.onPathOffsetCommitRef.current).not.toHaveBeenCalled();
  });
});
