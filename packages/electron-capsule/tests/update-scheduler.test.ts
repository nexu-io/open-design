import { afterEach, expect, it, vi } from "vitest";
import { startElectronUpdateScheduler } from "@/update-scheduler.js";

afterEach(() => { vi.useRealTimers(); });
const schedule = { initialDelayMs: 5, intervalMs: 100, backoffInitialMs: 10, backoffMaxMs: 20 };

it("waits for the initial boundary, never overlaps and stops with its session", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let finish!: () => void;
  const check = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const observe = vi.fn();
  startElectronUpdateScheduler({ schedule, signal: controller.signal, check, observe });
  await vi.advanceTimersByTimeAsync(4);
  expect(check).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(check).toHaveBeenCalledExactlyOnceWith(controller.signal);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(check).toHaveBeenCalledTimes(1);
  controller.abort();
  finish();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(check).toHaveBeenCalledTimes(1);
  expect(observe.mock.calls).toEqual([["started"]]);
  expect(vi.getTimerCount()).toBe(0);
});

it("caps failure backoff and resets it after a successful check", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const check = vi.fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  startElectronUpdateScheduler({ schedule, signal: controller.signal, check, observe: vi.fn() });
  for (const [delay, count] of [[5, 1], [10, 2], [20, 3], [20, 4], [100, 5], [10, 6]]) {
    await vi.advanceTimersByTimeAsync(delay! - 1);
    expect(check).toHaveBeenCalledTimes(count! - 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(count!);
  }
  controller.abort();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not schedule an already closed session and rejects invalid budgets", () => {
  vi.useFakeTimers();
  const check = vi.fn(), observe = vi.fn();
  startElectronUpdateScheduler({ schedule, signal: AbortSignal.abort(), check, observe });
  expect(vi.getTimerCount()).toBe(0);
  expect(() => startElectronUpdateScheduler({ schedule: { ...schedule, intervalMs: 0 },
    signal: new AbortController().signal, check, observe })).toThrow("intervalMs");
});
