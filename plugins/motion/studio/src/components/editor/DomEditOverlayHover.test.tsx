// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { DomEditSelection } from "./domEditing";
import "./domEditOverlayTestMocks";
import { DomEditOverlay } from "./DomEditOverlay";
import { DomEditOverlay as PackageDomEditOverlay } from "../../index";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hoverState = vi.hoisted(() => ({ angle: 0 }));

vi.mock("./useDomEditOverlayRects", () => ({
  useDomEditOverlayRects: ({ hoverSelectionRef }: { hoverSelectionRef: { current: unknown } }) => ({
    overlayRect: null,
    overlayRectRef: { current: null },
    setOverlayRect: () => undefined,
    hoverRect: hoverSelectionRef.current
      ? {
          left: 20,
          top: 30,
          width: 100,
          height: 40,
          editScaleX: 1,
          editScaleY: 1,
          angle: hoverState.angle,
        }
      : null,
    groupOverlayItems: [],
    groupOverlayItemsRef: { current: [] },
    setGroupOverlayItems: () => undefined,
    childRects: [],
  }),
}));

function renderHover(angle: number): string {
  hoverState.angle = angle;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const element = document.createElement("div");
  const hoverSelection = { element } as unknown as DomEditSelection;
  act(() => {
    root.render(
      <DomEditOverlay
        iframeRef={{ current: document.createElement("iframe") }}
        activeCompositionPath={null}
        selection={null}
        hoverSelection={hoverSelection}
        onCanvasMouseDown={() => undefined}
        onCanvasPointerMove={() => Promise.resolve(null)}
        onCanvasPointerLeave={() => undefined}
        onSelectionChange={() => undefined}
        onBlockedMove={() => undefined}
        onPathOffsetCommit={() => undefined}
        onGroupPathOffsetCommit={() => undefined}
        onBoxSizeCommit={() => undefined}
        onRotationCommit={() => undefined}
      />,
    );
  });
  const box = host.querySelector<HTMLElement>('[data-dom-edit-hover-box="true"]');
  const transform = box?.style.transform ?? "";
  act(() => root.unmount());
  host.remove();
  return transform;
}

it("rotates the hover box with the element", () => {
  expect(renderHover(30)).toBe("rotate(30deg)");
});

it("leaves the hover box untransformed at angle zero", () => {
  expect(renderHover(0)).toBe("");
});

it("is exported from the package entry, so a host can mount it with its own commits", () => {
  expect(PackageDomEditOverlay).toBe(DomEditOverlay);
});
