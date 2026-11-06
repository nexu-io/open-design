import { vi } from "vitest";

vi.mock("./useDomEditCompositionRect", () => ({
  useDomEditCompositionRect: () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 450,
    scaleX: 1,
    scaleY: 1,
  }),
}));

vi.mock("./offCanvasIndicatorRefresh", () => ({
  startOffCanvasIndicatorRefresh: () => () => undefined,
}));
