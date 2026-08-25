import { describe, expect, it, vi } from "vitest";

import { claimElectronSingleInstanceLock, ElectronLaunchHandoffQueue } from "@/runtime/single-instance.js";

describe("Electron single-instance preflight", () => {
  it("bridges a short previous-process exit window", async () => {
    const requestSingleInstanceLock = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const wait = vi.fn(async () => undefined);
    await expect(claimElectronSingleInstanceLock({ requestSingleInstanceLock }, { attempts: 3, retryIntervalMs: 10, wait })).resolves.toBe(true);
    expect(requestSingleInstanceLock).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("keeps only bounded protocol handoffs and drops arbitrary argv", () => {
    const queue = new ElectronLaunchHandoffQueue("od", 2);
    queue.enqueue(["--unsafe", "/tmp/private", "od://first"]);
    queue.enqueue(["od://second"]);
    queue.enqueue(["od://third"]);
    expect(queue.drain()).toEqual({ focusRequested: true, deepLinks: ["od://second", "od://third"] });
    expect(queue.drain()).toEqual({ focusRequested: false, deepLinks: [] });
  });
});
