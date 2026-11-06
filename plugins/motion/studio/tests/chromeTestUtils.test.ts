import { TimeoutError, type Browser } from "puppeteer-core";
import { describe, expect, it, vi } from "vitest";
import { closeTestChrome, launchTestChrome } from "./chromeTestUtils";

vi.mock("../vite.browser", () => ({
  findSystemChrome: () => "/test/chrome",
  browserVersion: () => "Chrome 152.0.7977.30",
}));

const fakeBrowser = (close: () => Promise<void>) => {
  const kill = vi.fn();
  const disconnect = vi.fn(async () => undefined);
  const browser = { close, disconnect, process: () => ({ kill }) } as unknown as Browser;
  return { browser, kill, disconnect };
};

describe("closeTestChrome", () => {
  it("kills a Chrome whose close never finishes", async () => {
    const { browser, kill, disconnect } = fakeBrowser(() => new Promise(() => undefined));
    await closeTestChrome(browser, 0);
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("leaves a Chrome that closed alone", async () => {
    const { browser, kill } = fakeBrowser(async () => undefined);
    await closeTestChrome(browser, 60_000);
    expect(kill).not.toHaveBeenCalled();
  });
});

describe("launchTestChrome", () => {
  it("names the selected browser and the failed attempt before retrying", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const { browser } = fakeBrowser(async () => undefined);
      const failure = new TimeoutError("WS endpoint was not announced");
      const launch = vi
        .fn()
        .mockImplementationOnce(async () => {
          vi.advanceTimersByTime(20_000);
          throw failure;
        })
        .mockResolvedValueOnce(browser);
      await expect(launchTestChrome(launch)).resolves.toBe(browser);
      expect(info.mock.calls).toEqual([
        ["[studio-test-chrome] launch 1/2: /test/chrome (Chrome 152.0.7977.30)"],
        ["[studio-test-chrome] launch 2/2: /test/chrome (Chrome 152.0.7977.30)"],
        ["[studio-test-chrome] launch 2/2 ready after 0 ms"],
      ]);
      expect(error.mock.calls).toEqual([
        ["[studio-test-chrome] launch 1/2 failed after 20000 ms: WS endpoint was not announced"],
      ]);
    } finally {
      vi.useRealTimers();
      info.mockRestore();
      error.mockRestore();
    }
  });

  it("stops after the second stuck launch and preserves its error", async () => {
    const failure = new TimeoutError("still stuck");
    const launch = vi.fn().mockRejectedValue(failure);
    await expect(launchTestChrome(launch)).rejects.toBe(failure);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("bounds each launch and tries once more after a stuck one", async () => {
    const { browser } = fakeBrowser(async () => undefined);
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new TimeoutError("stuck"))
      .mockResolvedValueOnce(browser);
    await expect(launchTestChrome(launch)).resolves.toBe(browser);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch.mock.calls[0]![0]).toMatchObject({ timeout: 20_000, dumpio: true });
  });

  it("tries once more after a stuck launch that Windows reports as already running", async () => {
    vi.useFakeTimers();
    try {
      const { browser } = fakeBrowser(async () => undefined);
      const launch = vi
        .fn()
        .mockImplementationOnce(async () => {
          vi.advanceTimersByTime(20_000);
          throw new Error("The browser is already running for C:\\tmp\\x");
        })
        .mockResolvedValueOnce(browser);
      await expect(launchTestChrome(launch)).resolves.toBe(browser);
      expect(launch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a launch that failed for another reason", async () => {
    const launch = vi.fn().mockRejectedValue(new Error("no such file"));
    await expect(launchTestChrome(launch)).rejects.toThrow("no such file");
    expect(launch).toHaveBeenCalledOnce();
  });
});
