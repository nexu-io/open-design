import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachElectronProcessErrorHandlers,
  isHarmlessElectronSocketOptionError,
} from "@/runtime/session/process-errors.js";

afterEach(() => vi.restoreAllMocks());

describe("Electron process error boundary", () => {
  it("recognizes only the narrow setTypeOfService EINVAL platform error", () => {
    const harmless = Object.assign(new Error("setTypeOfService EINVAL"), { code: "EINVAL" });
    expect(isHarmlessElectronSocketOptionError(harmless)).toBe(true);
    expect(isHarmlessElectronSocketOptionError(Object.assign(new Error("setTypeOfService EINVAL"), { code: "EACCES" }))).toBe(false);
    expect(isHarmlessElectronSocketOptionError(Object.assign(new Error("write EINVAL"), { code: "EINVAL" }))).toBe(false);
    expect(isHarmlessElectronSocketOptionError("setTypeOfService EINVAL")).toBe(false);
  });

  it("observes the harmless exception without detaching the lease", () => {
    const observe = vi.fn();
    const lease = attachElectronProcessErrorHandlers(observe);
    const harmless = Object.assign(new Error("setTypeOfService EINVAL"), { code: "EINVAL" });
    const handler = process.listeners("uncaughtException").at(-1)!;
    handler(harmless, "uncaughtException");
    expect(observe).toHaveBeenCalledWith({
      classification: "ignored-platform-error",
      error: harmless,
      source: "uncaught-exception",
    });
    expect(process.listeners("uncaughtException")).toContain(handler);
    lease.dispose();
  });

  it("records, detaches, and restores fail-fast for an unhandled rejection", () => {
    const observe = vi.fn();
    const scheduled: Array<() => void> = [];
    vi.spyOn(global, "setImmediate").mockImplementation(((callback: () => void) => {
      scheduled.push(callback);
      return {} as NodeJS.Immediate;
    }) as typeof setImmediate);
    const beforeUncaught = process.listenerCount("uncaughtException");
    const beforeRejection = process.listenerCount("unhandledRejection");
    const lease = attachElectronProcessErrorHandlers(observe);
    const error = new Error("fatal fixture rejection");
    const handler = process.listeners("unhandledRejection").at(-1)!;
    handler(error, Promise.resolve());
    expect(observe).toHaveBeenCalledWith({ classification: "fatal", error, source: "unhandled-rejection" });
    expect(process.listenerCount("uncaughtException")).toBe(beforeUncaught);
    expect(process.listenerCount("unhandledRejection")).toBe(beforeRejection);
    expect(scheduled).toHaveLength(1);
    lease.dispose();
  });
});
