// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { trackStudioEvent } from "../../utils/studioTelemetry";
vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { DomEditSaveQueueOpenError } from "../../utils/domEditSaveQueue";
import type { DomEditSelection } from "./domEditing";
import type { GestureState, UseDomEditOverlayGesturesOptions } from "./domEditOverlayGestures";

// Origin box (overlay px). The gesture-start center is its centroid; the
// center-anchored resize must keep THIS point planted, which means the release
// must commit a nonzero offset equal to minus half the size growth.
const ORIGIN = { left: 0, top: 0, width: 200, height: 100 };
const ORIGIN_CENTER = {
  x: ORIGIN.left + ORIGIN.width / 2,
  y: ORIGIN.top + ORIGIN.height / 2,
};

// Consistent geometry stub: model the physical truth the real DOM would report.
// A CSS width/height change grows the box from its top-left, so the rendered
// center drifts by half the size delta; the element's own translate, which the gesture
// writes in plain px, pulls it back. `elementCornerOverlayPoints`
// returns the four corners of that drifted box; `overlayCornersCentroid` (kept
// real) averages them so the anchor loop can measure the true center each frame.
// An authored `translate: 25% 25%` follows the box size until the gesture writes px over it.
const authored = vi.hoisted(() => ({ percent: 0 }));
function inlineTranslate(element: HTMLElement): { x: number; y: number } | null {
  const value = element.style.getPropertyValue("translate");
  if (!value) return null;
  const [x = 0, y = 0] = value.split(" ").map((v) => Number.parseFloat(v) || 0);
  return { x, y };
}
function renderedTranslate(element: HTMLElement, width: number, height: number) {
  return inlineTranslate(element) ?? { x: authored.percent * width, y: authored.percent * height };
}

vi.mock("./plainTranslate", async () => {
  const actual = await vi.importActual<typeof import("./plainTranslate")>("./plainTranslate");
  return {
    ...actual,
    readTranslatePx: (element: HTMLElement) =>
      renderedTranslate(
        element,
        element.offsetWidth || ORIGIN.width,
        element.offsetHeight || ORIGIN.height,
      ),
  };
});

vi.mock("./domEditOverlayGeometry", async () => {
  const actual = await vi.importActual<typeof import("./domEditOverlayGeometry")>(
    "./domEditOverlayGeometry",
  );
  const { readStudioBoxSize } = await import("./manualEditsDom");
  const physicalCenter = (element: HTMLElement) => {
    const size = readStudioBoxSize(element);
    const width = size.width > 0 ? size.width : ORIGIN.width;
    const height = size.height > 0 ? size.height : ORIGIN.height;
    const offset = renderedTranslate(element, width, height);
    const start = { x: authored.percent * ORIGIN.width, y: authored.percent * ORIGIN.height };
    return {
      x: ORIGIN_CENTER.x + (width - ORIGIN.width) / 2 + offset.x - start.x,
      y: ORIGIN_CENTER.y + (height - ORIGIN.height) / 2 + offset.y - start.y,
      width,
      height,
    };
  };
  return {
    ...actual,
    elementCornerOverlayPoints: (_o: unknown, _i: unknown, element: HTMLElement) => {
      const c = physicalCenter(element);
      const hw = c.width / 2;
      const hh = c.height / 2;
      return {
        nw: { x: c.x - hw, y: c.y - hh },
        ne: { x: c.x + hw, y: c.y - hh },
        sw: { x: c.x - hw, y: c.y + hh },
        se: { x: c.x + hw, y: c.y + hh },
      };
    },
    orientedOverlayRect: (_o: unknown, _i: unknown, element: HTMLElement) => {
      const c = physicalCenter(element);
      return {
        left: c.x - c.width / 2,
        top: c.y - c.height / 2,
        width: c.width,
        height: c.height,
        editScaleX: 1,
        editScaleY: 1,
        angle: 0,
      };
    },
  };
});

const { createDomEditOverlayGestureHandlers } = await import("./useDomEditOverlayGestures");

function ref<T>(current: T) {
  return { current };
}

interface CommitCall {
  size: { width: number; height: number };
  offset: { x: number; y: number } | undefined;
}

function buildHarness(
  onBoxSizeCommit?: UseDomEditOverlayGesturesOptions["onBoxSizeCommitRef"]["current"],
) {
  const element = document.createElement("div");
  document.body.append(element);

  const selection = {
    element,
    id: "box",
    selector: "#box",
    selectorIndex: 0,
    sourceFile: "index.html",
    tagName: "div",
    label: "Box",
    textContent: "",
    textFields: [],
    capabilities: {
      canEditText: false,
      canEditLayout: true,
      canMove: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: false,
      canAdjustOpacity: true,
      canAdjustFill: true,
      canAdjustBorderRadius: true,
      canAdjustStroke: true,
      canAdjustShadow: true,
      canAdjustZIndex: true,
    },
    computedStyle: { display: "block", position: "absolute" },
  } as unknown as DomEditSelection;

  const commits: CommitCall[] = [];
  const overlayEl = document.createElement("div");
  const iframe = document.createElement("iframe");

  const opts: UseDomEditOverlayGesturesOptions = {
    activeCompositionPathRef: { current: null },
    overlayRef: ref<HTMLDivElement | null>(overlayEl),
    iframeRef: ref<HTMLIFrameElement | null>(iframe),
    boxRef: ref<HTMLDivElement | null>(document.createElement("div")),
    selectionRef: ref<DomEditSelection | null>(selection),
    hoverSelectionRef: ref<DomEditSelection | null>(null),
    overlayRectRef: ref<OverlayRectLike | null>({
      left: ORIGIN.left,
      top: ORIGIN.top,
      width: ORIGIN.width,
      height: ORIGIN.height,
      editScaleX: 1,
      editScaleY: 1,
    }) as never,
    groupOverlayItemsRef: ref([]),
    gestureRef: ref<GestureState | null>(null),
    groupGestureRef: ref(null),
    blockedMoveRef: ref(null),
    waitingPressRef: ref(null),
    rafPausedRef: ref(false),
    suppressNextBoxClickRef: ref(false),
    setOverlayRect: () => {},
    setGroupOverlayItems: () => {},
    onBlockedMoveRef: ref(() => {}),
    onManualDragStartRef: ref(() => {}),
    onPathOffsetCommitRef: ref(() => {}),
    onGroupPathOffsetCommitRef: ref(() => {}),
    onBoxSizeCommitRef: ref(
      onBoxSizeCommit ??
        ((_s, size, offset) => {
          commits.push({ size, offset });
        }),
    ),
    onRotationCommitRef: ref(() => {}),
    onCanvasPointerMoveRef: ref(() => Promise.resolve(null)),
    onCanvasMouseDown: () => {},
    snapGuidesRef: ref(null),
  };

  const handlers = createDomEditOverlayGestureHandlers(opts);
  return { handlers, commits, selection, opts };
}

type OverlayRectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  editScaleX: number;
  editScaleY: number;
};

function evt(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    pointerId: 1,
    button: 0,
    buttons: 1,
    altKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {} },
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

async function finishResize(handlers: ReturnType<typeof createDomEditOverlayGestureHandlers>) {
  handlers.startGesture("resize", evt(ORIGIN_CENTER.x + 100, ORIGIN_CENTER.y), {
    resizeHandle: "se",
  });
  handlers.onPointerMove(evt(ORIGIN_CENTER.x + 150, ORIGIN_CENTER.y));
  handlers.onPointerUp(evt(ORIGIN_CENTER.x + 150, ORIGIN_CENTER.y));
  await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = "";
  authored.percent = 0;
});

describe("anchored corner resize — the release commit feeds the center-pin offset", () => {
  it("onPointerUp passes a nonzero offset that keeps the center planted", () => {
    const { handlers, commits } = buildHarness();

    // Start an SE corner resize. Pointer starts 100px right of the center.
    handlers.startGesture("resize", evt(ORIGIN_CENTER.x + 100, ORIGIN_CENTER.y), {
      resizeHandle: "se",
    });

    // Drag outward to radial scale 1.5 (dist 150 / 100). Several frames so the
    // per-frame center-pin anchor accumulates and converges into g.lastResizeAnchor.
    for (let i = 0; i < 5; i++) {
      handlers.onPointerMove(evt(ORIGIN_CENTER.x + 150, ORIGIN_CENTER.y));
    }

    handlers.onPointerUp(evt(ORIGIN_CENTER.x + 150, ORIGIN_CENTER.y));

    expect(commits).toHaveLength(1);
    const { size, offset } = commits[0]!;

    // Proportional 1.5x growth of the 200x100 base.
    expect(size.width).toBeCloseTo(300, 0);
    expect(size.height).toBeCloseTo(150, 0);

    // The committed offset must be present and nonzero — the open question.
    expect(offset).toBeDefined();
    if (!offset) return;
    expect(offset.x).not.toBe(0);
    expect(offset.y).not.toBe(0);

    // And it must equal minus half the size growth, i.e. it re-pins the center to
    // exactly the gesture-start center (offset = -(finalSize - origin)/2).
    expect(offset.x).toBeCloseTo(-(size.width - ORIGIN.width) / 2, 0);
    expect(offset.y).toBeCloseTo(-(size.height - ORIGIN.height) / 2, 0);
  });

  it("puts the grabbed corner on the pointer when the size rounds to whole px", () => {
    const { handlers, commits } = buildHarness();
    const grabbed = { x: ORIGIN_CENTER.x + 100, y: ORIGIN_CENTER.y + 50 };
    handlers.startGesture("resize", evt(grabbed.x, grabbed.y), {
      resizeHandle: "se",
      resizeCorner: grabbed,
    });
    // Radial scale 1.503: the pointer asks for 300.6 x 150.3, Studio writes 301 x 150.
    for (let i = 0; i < 5; i++)
      handlers.onPointerMove(evt(ORIGIN_CENTER.x + 150.3, ORIGIN_CENTER.y + 75.15));
    handlers.onPointerUp(evt(ORIGIN_CENTER.x + 150.3, ORIGIN_CENTER.y + 75.15));

    const { size, offset } = commits[0]!;
    expect(size).toEqual({ width: 301, height: 150 });
    const corner = {
      x: ORIGIN_CENTER.x + (size.width - ORIGIN.width) / 2 + offset!.x + size.width / 2,
      y: ORIGIN_CENTER.y + (size.height - ORIGIN.height) / 2 + offset!.y + size.height / 2,
    };
    expect(corner.x).toBeCloseTo(ORIGIN_CENTER.x + 300.6 / 2, 6);
    expect(corner.y).toBeCloseTo(ORIGIN_CENTER.y + 150.3 / 2, 6);
  });

  it("moves the grabbed corner with the cursor when the press lands beside it", () => {
    const { handlers, commits } = buildHarness();
    handlers.startGesture("resize", evt(ORIGIN_CENTER.x + 106, ORIGIN_CENTER.y), {
      resizeHandle: "se",
      resizeCorner: { x: ORIGIN_CENTER.x + 100, y: ORIGIN_CENTER.y },
    });
    handlers.onPointerMove(evt(ORIGIN_CENTER.x + 156, ORIGIN_CENTER.y));
    handlers.onPointerUp(evt(ORIGIN_CENTER.x + 156, ORIGIN_CENTER.y));

    expect(commits).toHaveLength(1);
    expect(commits[0]!.size.width).toBeCloseTo(300, 1);
    expect(commits[0]!.size.height).toBeCloseTo(150, 1);
  });

  it("keeps the centre on the first frame when the authored translate is a percent", async () => {
    const { orientedOverlayRect } = await import("./domEditOverlayGeometry");
    authored.percent = 0.25;
    const { handlers, selection } = buildHarness();
    handlers.startGesture("resize", evt(ORIGIN_CENTER.x + 100, ORIGIN_CENTER.y), {
      resizeHandle: "se",
    });
    handlers.onPointerMove(evt(ORIGIN_CENTER.x + 150, ORIGIN_CENTER.y));
    const rect = orientedOverlayRect(null as never, null as never, selection.element)!;
    expect(rect.left + rect.width / 2).toBeCloseTo(ORIGIN_CENTER.x, 1);
    expect(rect.top + rect.height / 2).toBeCloseTo(ORIGIN_CENTER.y, 1);
  });

  it("does not log a paused save queue as an ordinary resize failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handlers } = buildHarness(() => Promise.reject(new DomEditSaveQueueOpenError()));

    await finishResize(handlers);

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("still logs an ordinary resize failure", async () => {
    const failure = new Error("save failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handlers } = buildHarness(() => Promise.reject(failure));

    await finishResize(handlers);

    expect(consoleError).toHaveBeenCalledWith("resize commit failed", failure);
  });
});

describe("resize usage at pointer release", () => {
  it("counts one completed resize despite multiple pointer moves", async () => {
    vi.mocked(trackStudioEvent).mockClear();
    const h = buildHarness(async () => ({ ok: true, changed: true }));
    await finishResize(h.handlers);
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: "resize",
      surface: "preview",
      method: "drag",
    });
  });
  it.each([undefined, { ok: true as const, changed: false }])(
    "does not count an unchanged or unconfirmed resize",
    async (result) => {
      vi.mocked(trackStudioEvent).mockClear();
      const h = buildHarness(async () => result);
      await finishResize(h.handlers);
      expect(trackStudioEvent).not.toHaveBeenCalled();
    },
  );
});

describe("move and rotation usage", () => {
  it.each(["drag", "rotate"] as const)("counts %s once after pointer release", async (kind) => {
    vi.mocked(trackStudioEvent).mockClear();
    const h = buildHarness();
    h.selection.capabilities.canApplyManualRotation = true;
    const saved = vi.fn(async () => ({ ok: true as const, changed: true }));
    h.opts.onPathOffsetCommitRef.current = saved;
    h.opts.onRotationCommitRef.current = saved;
    h.handlers.startGesture(kind, evt(200, 50));
    h.handlers.onPointerMove(evt(150, 120));
    h.handlers.onPointerMove(evt(100, 150));
    expect(trackStudioEvent).not.toHaveBeenCalled();
    h.handlers.onPointerUp(evt(100, 150));
    await Promise.resolve();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: kind === "drag" ? "move" : "rotate",
      surface: "preview",
      method: "drag",
    });
  });
});
