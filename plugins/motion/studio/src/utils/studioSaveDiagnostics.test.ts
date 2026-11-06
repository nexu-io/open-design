import { describe, expect, it, vi } from "vitest";

const trackStudioEvent = vi.hoisted(() => vi.fn());
vi.mock("./studioTelemetry", () => ({ trackStudioEvent }));

import {
  StudioFileConflictError,
  StudioSaveHttpError,
  StudioSaveNetworkError,
  buildStudioSaveFailureProperties,
  getStudioSaveStatusCode,
  retryStudioSave,
  trackStudioEditBlocked,
} from "./studioSaveDiagnostics";

describe("studio save diagnostics", () => {
  it("preserves conflict versions and both sides for explicit recovery UI", () => {
    const error = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: '"sha256:new"',
      currentContent: "external",
      attemptedContent: "local",
    });

    expect(getStudioSaveStatusCode(error)).toBe(409);
    expect(error).toMatchObject({
      filePath: "index.html",
      currentVersion: '"sha256:new"',
      currentContent: "external",
      attemptedContent: "local",
    });
  });

  it("builds save_failure properties with stable diagnostics", () => {
    const error = new StudioSaveHttpError("Failed to save index.html (503)", 503);

    expect(
      buildStudioSaveFailureProperties({
        source: "code_editor",
        error,
        filePath: "index.html",
        mutationType: "put",
        attempt: 3,
      }),
    ).toEqual({
      source: "code_editor",
      error_message: "Failed to save index.html (503)",
      status_code: 503,
      file_path: "index.html",
      mutation_type: "put",
      attempt: 3,
      label: undefined,
      target_id: undefined,
      target_selector: undefined,
      target_source_file: undefined,
    });
  });

  it("emits expected direct-edit refusals on edit_blocked", () => {
    const error = new Error("This animation is computed at runtime");

    trackStudioEditBlocked({
      source: "gsap_commit",
      error,
      filePath: "index.html",
      mutationType: "drag",
    });

    expect(trackStudioEvent).toHaveBeenCalledWith("edit_blocked", {
      source: "gsap_commit",
      error_message: error.message,
      status_code: null,
      file_path: "index.html",
      mutation_type: "drag",
      attempt: undefined,
      label: undefined,
      target_id: undefined,
      target_selector: undefined,
      target_source_file: undefined,
    });
  });

  it("reads nested status codes from error causes", () => {
    const cause = new StudioSaveHttpError("Too many requests", 429);
    const error = new Error("retry wrapper") as Error & { cause?: unknown };
    error.cause = cause;

    expect(getStudioSaveStatusCode(error)).toBe(429);
  });

  it("retries transient save failures with exponential backoff and jitter", async () => {
    const sleeps: number[] = [];
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new StudioSaveHttpError("Server restarting", 503))
      .mockRejectedValueOnce(new StudioSaveHttpError("Still restarting", 503))
      .mockRejectedValueOnce(new StudioSaveHttpError("Almost ready", 503))
      .mockResolvedValue("saved");

    await expect(
      retryStudioSave(operation, {
        random: () => 0.5,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
        },
      }),
    ).resolves.toBe("saved");

    expect(operation).toHaveBeenCalledTimes(4);
    expect(operation.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3, 4]);
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  it("does not retry non-transient client failures", async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(new StudioSaveHttpError("Too large", 413));

    await expect(
      retryStudioSave(operation, {
        sleep: async () => {},
      }),
    ).rejects.toThrow("Too large");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries typed network failures", async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new StudioSaveNetworkError("network dropped"))
      .mockResolvedValue("saved");

    await expect(
      retryStudioSave(operation, {
        sleep: async () => {},
      }),
    ).resolves.toBe("saved");

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry plain JavaScript errors", async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(new Error("local assertion failed"));

    await expect(
      retryStudioSave(operation, {
        sleep: async () => {},
      }),
    ).rejects.toThrow("local assertion failed");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("aborts while waiting between retry attempts", async () => {
    const controller = new AbortController();
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(new StudioSaveHttpError("Server restarting", 503));

    const pending = retryStudioSave(operation, {
      signal: controller.signal,
      sleep: async (_delayMs, signal) => {
        controller.abort();
        if (signal?.aborted) throw new DOMException("Save aborted", "AbortError");
      },
    });

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
