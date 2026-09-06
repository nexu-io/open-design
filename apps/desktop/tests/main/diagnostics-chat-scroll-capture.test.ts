import { describe, expect, it, vi } from "vitest";

/**
 * Why this file exists
 * --------------------
 * The chat scroll freeze lives in a MOUNTED chat log. Reaching the in-app
 * Export logs button means walking to Settings, which is a route change that
 * unmounts the chat and takes the frozen surface with it — so the one export
 * route a stuck colleague can use without destroying the evidence is the
 * desktop Help menu, which never navigates.
 *
 * That path goes Electron main -> daemon and never touches the renderer, so
 * main has to reach back in and ask for the scene before it fetches the bundle.
 * These specs pin that it does, and that a renderer which cannot answer never
 * costs the colleague the logs they came for.
 */

const { showSaveDialog, writeFileMock, fetchBundle } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: "/tmp/bundle.zip" })),
  writeFileMock: vi.fn(async () => undefined),
  fetchBundle: vi.fn(async () => Buffer.from("zip")),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  app: { getPath: vi.fn(() => "/home/user/Downloads") },
  dialog: { showSaveDialog },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}));

vi.mock("node:fs/promises", () => ({ writeFile: writeFileMock }));

vi.mock("../../src/main/diagnostics-fetch.js", () => ({
  fetchDiagnosticsBundle: fetchBundle,
}));

import {
  exportDiagnosticsToFile,
  requestRendererChatScrollCapture,
} from "../../src/main/diagnostics.js";

interface FakeWindow {
  isDestroyed: () => boolean;
  webContents: { executeJavaScript: ReturnType<typeof vi.fn> };
}

function fakeWindow(executeJavaScript: ReturnType<typeof vi.fn>): FakeWindow {
  return { isDestroyed: () => false, webContents: { executeJavaScript } };
}

describe("requestRendererChatScrollCapture", () => {
  it("asks the renderer for the chat-scroll scene", async () => {
    const executeJavaScript = vi.fn(async (_code: string, _userGesture: boolean) => true);

    await requestRendererChatScrollCapture(fakeWindow(executeJavaScript) as never);

    expect(executeJavaScript).toHaveBeenCalledTimes(1);
    const [code, userGesture] = executeJavaScript.mock.calls[0] as unknown as [string, boolean];
    expect(code).toContain("__odCaptureChatScrollForensics");
    expect(userGesture).toBe(true);
  });

  it("is a no-op without a window", async () => {
    await expect(requestRendererChatScrollCapture(null)).resolves.toBeUndefined();
  });

  it("swallows a renderer that rejects", async () => {
    const executeJavaScript = vi.fn(async () => {
      throw new Error("renderer gone");
    });

    await expect(
      requestRendererChatScrollCapture(fakeWindow(executeJavaScript) as never),
    ).resolves.toBeUndefined();
  });

  it("gives up on a renderer that never answers instead of holding the export", async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn(() => new Promise(() => undefined));
    const pending = requestRendererChatScrollCapture(fakeWindow(executeJavaScript) as never);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("the Help-menu export collects the renderer scene first", () => {
  it("captures before it fetches the bundle", async () => {
    const order: string[] = [];
    const executeJavaScript = vi.fn(async () => {
      order.push("capture");
      return true;
    });
    fetchBundle.mockImplementation(async () => {
      order.push("fetch");
      return Buffer.from("zip");
    });

    const result = await exportDiagnosticsToFile(
      { discoverDaemonBaseUrl: vi.fn(async () => "http://127.0.0.1:1234") },
      fakeWindow(executeJavaScript) as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(order).toEqual(["capture", "fetch"]);
  });
});
