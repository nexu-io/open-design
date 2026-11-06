import { afterAll, beforeAll } from "vitest";

// Mounting a whole <Timeline> in happy-dom needs a width to lay out against and a size report.
class MockResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

export function installTimelineMountEnv(): void {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  beforeAll(() => {
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 900,
    });
  });
  afterAll(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    if (originalClientWidth)
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    document.body.innerHTML = "";
  });
}

export const KEYFRAMED_CARD = new Map([
  [
    "card",
    [
      {
        id: "card-position",
        targetSelector: "#card",
        method: "to" as const,
        position: 0,
        duration: 2,
        properties: {},
        propertyGroup: "position" as const,
        keyframes: {
          format: "percentage" as const,
          keyframes: [
            { percentage: 0, properties: { x: 0 } },
            { percentage: 50, properties: { x: 100 } },
          ],
        },
      },
    ],
  ],
]);
