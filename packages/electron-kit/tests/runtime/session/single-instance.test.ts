import { describe, expect, it, vi } from "vitest";

import {
  claimElectronSingleInstanceLock,
  ElectronLaunchHandoffQueue,
  findElectronProtocolUrl,
  parseElectronInstallerReplacementData,
} from "@/runtime/session/single-instance.js";

describe("Electron single-instance preflight", () => {
  it("asks only once for an ordinary launch", async () => {
    const requestSingleInstanceLock = vi.fn(() => false);
    await expect(claimElectronSingleInstanceLock({ requestSingleInstanceLock })).resolves.toBe(false);
    expect(requestSingleInstanceLock).toHaveBeenCalledOnce();
    expect(requestSingleInstanceLock).toHaveBeenCalledWith();
  });

  it("lets only a typed installer replacement bridge the previous process exit", async () => {
    const requestSingleInstanceLock = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const wait = vi.fn(async () => undefined);
    await expect(claimElectronSingleInstanceLock(
      { requestSingleInstanceLock },
      { kind: "installer-replacement", installAttemptId: "install-7", attempts: 3, retryIntervalMs: 10, wait },
    )).resolves.toBe(true);
    expect(requestSingleInstanceLock).toHaveBeenCalledTimes(3);
    expect(requestSingleInstanceLock).toHaveBeenCalledWith({ kind: "installer-replacement", installAttemptId: "install-7" });
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("rejects untrusted replacement data", async () => {
    const requestSingleInstanceLock = vi.fn(() => true);
    await expect(claimElectronSingleInstanceLock(
      { requestSingleInstanceLock },
      { kind: "installer-replacement", installAttemptId: "contains spaces" },
    )).rejects.toThrow("invalid Electron installer replacement attempt");
    expect(requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(parseElectronInstallerReplacementData({ kind: "installer-replacement", installAttemptId: "install-7" }))
      .toEqual({ kind: "installer-replacement", installAttemptId: "install-7" });
    expect(parseElectronInstallerReplacementData({ kind: "installer-replacement", installAttemptId: "" })).toBeNull();
  });

  it("keeps only bounded typed focus and protocol handoffs", () => {
    const queue = new ElectronLaunchHandoffQueue("od", 2);
    expect(queue.enqueue({ type: "deep-link", source: "initial-argv", url: "https://unsafe.test" })).toBe(false);
    expect(queue.enqueue({ type: "focus", source: "app-activate" })).toBe(true);
    expect(queue.enqueue({ type: "deep-link", source: "mac-open-url", url: "od://second" })).toBe(true);
    expect(queue.enqueue({ type: "deep-link", source: "second-instance", url: "od://third" })).toBe(true);
    expect(queue.drain()).toEqual([
      { type: "deep-link", source: "mac-open-url", url: "od://second" },
      { type: "deep-link", source: "second-instance", url: "od://third" },
    ]);
    expect(queue.drain()).toEqual([]);
    queue.enqueue({ type: "focus", source: "second-instance" });
    queue.cancel();
    expect(queue.enqueue({ type: "focus", source: "app-activate" })).toBe(false);
    expect(queue.drain()).toEqual([]);
  });

  it("extracts one protocol URL without retaining arbitrary argv", () => {
    expect(findElectronProtocolUrl("od", ["--unsafe", "/tmp/private", "od://first", "od://second"])).toBe("od://first");
    expect(findElectronProtocolUrl("od", ["https://unsafe.test", "--unsafe"])).toBeNull();
  });
});
