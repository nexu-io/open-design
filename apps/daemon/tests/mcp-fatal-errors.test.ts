import { afterEach, describe, expect, it, vi } from "vitest";
import { _installMcpFatalErrorHandlers, runMcpStdio } from "../src/mcp.js";

describe("MCP stdio fatal error handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports uncaught exceptions to stderr and exits unsuccessfully", () => {
    const writeStderr = vi.fn();
    const exit = vi.fn();
    const dispose = _installMcpFatalErrorHandlers({ writeStderr, exit });

    (
      process as unknown as {
        emit(name: string, ...values: unknown[]): boolean;
      }
    ).emit("uncaughtException", new Error("stdio crashed"));

    expect(writeStderr).toHaveBeenCalledWith(
      expect.stringContaining("stdio crashed"),
    );
    expect(exit).toHaveBeenCalledWith(1);
    dispose();
  });

  it("uses stderr for default reporting without writing protocol stdout", () => {
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exit = vi.fn();
    const dispose = _installMcpFatalErrorHandlers({ exit });

    (
      process as unknown as {
        emit(name: string, ...values: unknown[]): boolean;
      }
    ).emit("uncaughtException", new Error("default reporter crashed"));

    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("default reporter crashed"),
    );
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    dispose();
  });

  it("reports non-Error unhandled rejections and removes both handlers", () => {
    const writeStderr = vi.fn();
    const exit = vi.fn();
    const listenerCount = (event: string) =>
      (process as unknown as { listeners(name: string): unknown[] }).listeners(
        event,
      ).length;
    const emitProcessEvent = (event: string, ...args: unknown[]) =>
      (
        process as unknown as {
          emit(name: string, ...values: unknown[]): boolean;
        }
      ).emit(event, ...args);
    const exceptionListeners = listenerCount("uncaughtException");
    const rejectionListeners = listenerCount("unhandledRejection");
    const dispose = _installMcpFatalErrorHandlers({ writeStderr, exit });

    expect(listenerCount("uncaughtException")).toBe(exceptionListeners + 1);
    expect(listenerCount("unhandledRejection")).toBe(rejectionListeners + 1);
    emitProcessEvent("unhandledRejection", "rejected value");
    expect(writeStderr).toHaveBeenCalledWith(
      expect.stringContaining("rejected value"),
    );
    expect(exit).toHaveBeenCalledWith(1);

    dispose();
    expect(listenerCount("uncaughtException")).toBe(exceptionListeners);
    expect(listenerCount("unhandledRejection")).toBe(rejectionListeners);
  });

  it("cleans up handlers when startup initialization fails", async () => {
    const exceptionListeners = process.listeners("uncaughtException").length;
    const rejectionListeners = process.listeners("unhandledRejection").length;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(() => {
      expect(process.listeners("uncaughtException").length).toBe(
        exceptionListeners + 1,
      );
      expect(process.listeners("unhandledRejection").length).toBe(
        rejectionListeners + 1,
      );
      throw new Error("idle controller initialization failed");
    });

    await expect(
      runMcpStdio({ daemonUrl: "http://127.0.0.1:1234" }),
    ).rejects.toThrow("idle controller initialization failed");
    expect(process.listeners("uncaughtException").length).toBe(
      exceptionListeners,
    );
    expect(process.listeners("unhandledRejection").length).toBe(
      rejectionListeners,
    );
  });
});
