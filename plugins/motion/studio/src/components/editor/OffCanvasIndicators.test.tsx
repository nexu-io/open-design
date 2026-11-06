// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { OffCanvasIndicators } from "./OffCanvasIndicators";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("rotates an off-canvas indicator with its element", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <OffCanvasIndicators
        rects={[{ key: "card", left: 80, top: 20, width: 40, height: 20, angle: 30 }]}
        elements={{ current: new Map() }}
        compRect={{ left: 0, top: 0, width: 100, height: 100 }}
        selection={null}
        groupSelections={[]}
        activeCompositionPathRef={{ current: null }}
        onSelectionChangeRef={{ current: () => undefined }}
      />,
    );
  });

  const indicator = host.querySelector<HTMLElement>('[role="button"]');
  expect(indicator?.parentElement?.style.transform).toBe("rotate(30deg)");
  expect(indicator?.parentElement?.style.transformOrigin).toBe("center");

  act(() => root.unmount());
  host.remove();
});
