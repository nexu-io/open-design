// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelContext } from "./types";

// The real package defines `document.modelContext` as an import side effect.
// A mock cannot do that, so tests stand the object up themselves to represent
// the import having happened.
const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("@mcp-b/global", () => ({}));
vi.mock("../telemetry/client", () => ({ trackEvent }));

let loadModelContextPolyfill: typeof import("./polyfill").loadModelContextPolyfill;

function installModelContext(): ModelContext {
  const modelContext: ModelContext = { registerTool: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(document, "modelContext", {
    value: modelContext,
    configurable: true,
    writable: true,
  });
  return modelContext;
}

beforeEach(async () => {
  vi.resetModules();
  ({ loadModelContextPolyfill } = await import("./polyfill"));
  trackEvent.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
  vi.restoreAllMocks();
});

describe("loadModelContextPolyfill", () => {
  it("returns the model context the package defines", async () => {
    const modelContext = installModelContext();

    await expect(loadModelContextPolyfill()).resolves.toBe(modelContext);
    expect(trackEvent).toHaveBeenCalledWith("webmcp.polyfill_loaded");
  });

  it("shares one load between callers that race", async () => {
    installModelContext();

    // Identity, not a call count: the guard being tested is the module-level
    // promise, and the ESM registry would dedupe the import either way.
    const first = loadModelContextPolyfill();
    const second = loadModelContextPolyfill();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(await second);
  });

  it("reuses the settled load rather than starting another", async () => {
    installModelContext();

    const first = loadModelContextPolyfill();
    await first;

    expect(loadModelContextPolyfill()).toBe(first);
  });

  it("returns null when the package loads but defines nothing", async () => {
    // Studio must still boot. A missing agent surface is not a broken editor.
    const first = loadModelContextPolyfill();
    await expect(first).resolves.toBeNull();

    expect(trackEvent).toHaveBeenCalledWith("webmcp.polyfill_failed", {
      error_name: "ModelContextMissingError",
    });
    const retry = loadModelContextPolyfill();
    expect(retry).not.toBe(first);
    await expect(retry).resolves.toBeNull();
  });

  it("reports a polyfill failure and lets a later mount retry", async () => {
    const failure = new TypeError("blocked by policy");
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      get: () => {
        throw failure;
      },
    });

    const first = loadModelContextPolyfill();
    await expect(first).resolves.toBeNull();
    expect(trackEvent).toHaveBeenCalledWith("webmcp.polyfill_failed", {
      error_name: "TypeError",
    });

    Reflect.deleteProperty(document, "modelContext");
    const modelContext = installModelContext();
    const retry = loadModelContextPolyfill();
    expect(retry).not.toBe(first);
    await expect(retry).resolves.toBe(modelContext);
  });
});
