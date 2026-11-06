// @vitest-environment happy-dom

import React, { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioLeftPanels } from "../components/StudioLeftPanels";
import type { StudioRightPanels } from "../components/StudioRightPanels";
import { useStudioSidePanels } from "./useStudioSidePanels";

const rightProps = vi.hoisted(() => [] as { recordEdit: (project: string) => string }[]);
vi.mock("../components/StudioLeftPanels", () => ({ StudioLeftPanels: () => null }));
vi.mock("../components/StudioRightPanels", () => ({
  StudioRightPanels: (props: { recordEdit: (project: string) => string }) => {
    rightProps.push(props);
    return null;
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  rightProps.length = 0;
});

function Panels({ project }: { project: string }) {
  const right = { recordEdit: () => project } as unknown as ComponentProps<
    typeof StudioRightPanels
  >;
  return useStudioSidePanels({} as ComponentProps<typeof StudioLeftPanels>, right, project);
}

describe("useStudioSidePanels", () => {
  it("keeps a panel handler from one project calling that project after a switch", () => {
    root = createRoot(document.createElement("div"));
    act(() => root!.render(<Panels project="a" />));
    const kept = rightProps.at(-1)!.recordEdit;
    act(() => root!.render(<Panels project="b" />));
    expect(kept("")).toBe("a");
    expect(rightProps.at(-1)!.recordEdit("")).toBe("b");
  });
});
