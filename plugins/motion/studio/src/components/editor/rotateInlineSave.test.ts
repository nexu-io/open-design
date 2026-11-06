// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from "vitest";
import { savePlainRotation } from "../../hooks/plainRotation";
import { applyStudioRotation } from "./manualEdits";
import type { ElementOffsetStagerDeps } from "../../hooks/elementOffsetStager";
import type { DomEditSelection } from "./domEditing";
import type { GestureState, UseDomEditOverlayGesturesOptions } from "./domEditOverlayGestures";
import { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";

const ref = <T>(current: T) => ({ current });

function evt(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    pointerId: 1,
    button: 0,
    altKey: false,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {} },
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

async function rotateWord(before: (word: HTMLElement) => void = () => {}) {
  const sheet = document.head.appendChild(document.createElement("style"));
  sheet.textContent = "#word { display: inline; }";
  const element = document.body.appendChild(document.createElement("span"));
  element.id = "word";
  element.textContent = "Word";
  const selection = {
    element,
    id: "word",
    selector: "#word",
    selectorIndex: 0,
    sourceFile: "index.html",
    tagName: "span",
    label: "Word",
    textContent: "Word",
    textFields: [],
    capabilities: { canMove: true, canApplyManualRotation: true },
  } as unknown as DomEditSelection;
  const commitPositionPatchToHtml = vi.fn<ElementOffsetStagerDeps["commitPositionPatchToHtml"]>(
    () => Promise.resolve(),
  );
  const saves: Promise<void>[] = [];
  const opts: UseDomEditOverlayGesturesOptions = {
    overlayRef: ref<HTMLDivElement | null>(document.createElement("div")),
    iframeRef: ref<HTMLIFrameElement | null>(document.createElement("iframe")),
    boxRef: ref<HTMLDivElement | null>(document.createElement("div")),
    selectionRef: ref<DomEditSelection | null>(selection),
    hoverSelectionRef: ref<DomEditSelection | null>(null),
    overlayRectRef: ref({ left: 0, top: 0, width: 200, height: 100, editScaleX: 1, editScaleY: 1 }),
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
    onBoxSizeCommitRef: ref(() => {}),
    onRotationCommitRef: ref((s, next) => {
      const saved = savePlainRotation({ commitPositionPatchToHtml }, s, next);
      saves.push(saved);
      return saved;
    }),
    onCanvasPointerMoveRef: ref(() => Promise.resolve(null)),
    onCanvasMouseDown: () => {},
    snapGuidesRef: ref(null),
  } as unknown as UseDomEditOverlayGesturesOptions;
  before(element);
  const handlers = createDomEditOverlayGestureHandlers(opts);

  handlers.startGesture("rotate", evt(200, 50));
  handlers.onPointerMove(evt(100, 150));
  handlers.onPointerUp(evt(100, 150));
  await Promise.all(saves);

  expect(saves).toHaveLength(1);
  return commitPositionPatchToHtml.mock.calls[0]![1];
}

const INLINE_BLOCK = { type: "inline-style", property: "display", value: "inline-block" };
const turnOf = (patches: Awaited<ReturnType<typeof rotateWord>>) =>
  patches.findLast((patch) => patch.type === "inline-style" && patch.property === "rotate");

it("saves an inline span's turn with the inline-block it was drawn with, after the draft and the hold", async () => {
  expect(await rotateWord()).toContainEqual(INLINE_BLOCK);
});

it("saves inline-block and the whole turn for a word an older Studio already turned 15 deg", async () => {
  const plain = await rotateWord();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const legacy = await rotateWord((word) => applyStudioRotation(word, { angle: 15 }));
  expect(legacy).toContainEqual(INLINE_BLOCK);
  const degrees = (patches: typeof plain) => Number.parseFloat(String(turnOf(patches)?.value));
  expect(degrees(legacy)).toBe(degrees(plain) + 15);
});
