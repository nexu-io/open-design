import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { waitForElectronProductReady } from "../scripts/product-readiness.ts";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("does not resolve merely because the control plane is starting", async () => {
  const ready = { state: "running" };
  const readStatus = vi.fn().mockResolvedValueOnce({ state: "starting" }).mockResolvedValue(ready);
  const resolved = vi.fn();
  const pending = waitForElectronProductReady({ readStatus, assertAlive() {} }).then(resolved);
  await vi.advanceTimersByTimeAsync(149);
  expect(resolved).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(resolved).toHaveBeenCalledWith(ready);
});

it("follows the running Shell deadline beyond the initial discovery budget", async () => {
  const startedAt = Date.now();
  const startupDeadline = new Date(startedAt + 360_000).toISOString();
  const pending = waitForElectronProductReady({
    async readStatus() { return Date.now() - startedAt > 121_000 ? { state: "running" } : { state: "starting", startupDeadline }; },
    assertAlive() {},
  });
  await vi.advanceTimersByTimeAsync(122_000);
  await expect(pending).resolves.toMatchObject({ state: "running" });
});

it("fails closed at the declared deadline without sliding it on each poll", async () => {
  const startupDeadline = new Date(Date.now() + 100).toISOString();
  const pending = waitForElectronProductReady({ async readStatus() { return { state: "starting", startupDeadline }; }, assertAlive() {} });
  const rejected = expect(pending).rejects.toThrow("did not become product-ready");
  await vi.advanceTimersByTimeAsync(5_250);
  await rejected;
});

it.each(["failed", "stopping"])("rejects %s instead of reporting successful launch", async (state) => {
  await expect(waitForElectronProductReady({ async readStatus() { return { state }; }, assertAlive() {} })).rejects.toThrow(`startup ${state}`);
});

it("fails when a generation dies before ready", async () => {
  await expect(waitForElectronProductReady({ async readStatus() { return null; }, assertAlive() { throw new Error("generation exited"); } })).rejects.toThrow("generation exited");
});
