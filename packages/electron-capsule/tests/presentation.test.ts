import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElectronStartupPresentation } from "@/presentation.js";

const mock = vi.hoisted(() => ({
  create: vi.fn(), load: vi.fn(), destroy: vi.fn(), destroyed: vi.fn(), execute: vi.fn(), once: vi.fn(),
}));
vi.mock("electron", () => ({ BrowserWindow: class {
  constructor(options: unknown) { mock.create(options); }
  loadURL = mock.load;
  destroy = mock.destroy;
  isDestroyed = mock.destroyed;
  once = mock.once;
  webContents = { executeJavaScript: mock.execute };
} }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.resetAllMocks(); });
const input = {
  productName: "Example",
  appearance: {
    schemaVersion: 1 as const, window: { width: 1040, height: 700, title: "Example" },
    splash: { width: 1280, height: 900, minimumVisibleMs: 2000, backgroundColor: "#f2f4f5",
      foregroundColor: "#1f2529", mutedColor: "#7a838a", initialLabel: "Starting…", readyLabel: "Ready" },
  },
};

it("creates no window until invoked, then mounts the declared sandboxed presentation", async () => {
  expect(mock.create).not.toHaveBeenCalled();
  mock.execute.mockResolvedValue(undefined);
  const presentation = await createElectronStartupPresentation(input);
  expect(mock.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    width: 1280, height: 900, frame: false, show: true, webPreferences: { sandbox: true },
  }));
  expect(mock.load).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^data:text\/html;charset=utf-8,/u));
  presentation.setProgress({ mode: "first-install", label: 'Preparing "exact"', receivedBytes: 1024, totalBytes: 2048 });
  expect(mock.execute).toHaveBeenCalledOnce();
  expect(mock.execute.mock.calls[0]![0]).toContain('First-time installation');
  expect(mock.execute.mock.calls[0]![0]).toContain('"ratio":0.5');
  mock.destroyed.mockReturnValue(true);
  presentation.setProgress({ label: "Late stage" });
  expect(mock.execute).toHaveBeenCalledTimes(1);
});

it("only renders observed changes without timers, history or invented percentages", async () => {
  mock.execute.mockResolvedValue(undefined);
  const presentation = await createElectronStartupPresentation(input);
  presentation.setProgress({ label: "Unpacking components", state: "begin" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(mock.execute).toHaveBeenCalledOnce();
  expect(mock.execute.mock.lastCall![0]).not.toContain('elapsed');
  expect(mock.execute.mock.lastCall![0]).toContain('"ratio":null');
  expect(vi.getTimerCount()).toBe(0);
});

it("destroys an uncommitted window when document mounting fails", async () => {
  const error = new Error("navigation failed");
  mock.load.mockRejectedValue(error);
  await expect(createElectronStartupPresentation(input)).rejects.toBe(error);
  expect(mock.destroy).toHaveBeenCalledOnce();
});

it("aggregates simultaneous downloads without rotating per-resource byte counters", async () => {
  mock.execute.mockResolvedValue(undefined);
  const presentation = await createElectronStartupPresentation(input);
  presentation.setProgress({ resourceId: "a", label: "Downloading components", receivedBytes: 10, totalBytes: 20 });
  presentation.setProgress({ resourceId: "b", label: "Downloading components", receivedBytes: 20, totalBytes: 40 });
  expect(mock.execute.mock.lastCall![0]).toContain("Downloading 2 components");
  expect(mock.execute.mock.lastCall![0]).toContain('"ratio":0.5');
  presentation.setProgress({ resourceId: "a", label: "Unpacking components", state: "begin" });
  expect(mock.execute.mock.lastCall![0]).not.toContain("Downloading 2 components");
  expect(mock.execute.mock.lastCall![0]).toContain("Downloading components");
});

it("validates media before allocating an interactive window", async () => {
  await expect(createElectronStartupPresentation({ ...input, media: { mimeType: "video/webm", base64: "invalid" } }))
    .rejects.toThrow("invalid Electron splash media");
  expect(mock.create).not.toHaveBeenCalled();
});
