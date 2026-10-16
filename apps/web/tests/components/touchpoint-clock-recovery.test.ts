// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTouchpointLifecycle, type TouchpointLifecycleLoad } from "../../src/components/touchpoint-lifecycle";

const epoch = Date.parse("2030-01-01T00:00:00Z");
const value = { campaign: "bounded" };
type Answer = TouchpointLifecycleLoad<typeof value>;
const grant = (): Answer => ({ kind: "decision", key: "same", value, validForMs: 60_000 });
const step = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const event = () => act(() => { window.dispatchEvent(new Event("focus")); });
const pending = () => {
  let resolve!: (answer: Answer) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Answer>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(epoch);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("OPEND-3378 wall-clock correction", () => {
  it("a failure during a forward jump preserves the recoverable grant", async () => {
    const request = pending();
    const load = vi.fn().mockResolvedValueOnce(grant()).mockReturnValueOnce(request.promise).mockResolvedValue({ kind: "retain" });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
    await step();
    vi.setSystemTime(epoch + 3_600_000); event();
    expect(result.current.current).toBeNull(); // Conservative sleep/clock uncertainty fence.
    await act(async () => { request.reject(new Error("transport")); });
    vi.setSystemTime(epoch); event(); await step();
    expect(result.current.current).toBe(value);
  });

  it("a valid response during a forward jump mounts after correction without another grant", async () => {
    const request = pending();
    const load = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ kind: "retain" });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
    vi.setSystemTime(epoch + 3_600_000);
    await act(async () => { request.resolve(grant()); });
    expect(result.current.current).toBeNull();
    vi.setSystemTime(epoch); await step(1_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBe(value);
    expect(result.current.isCurrent(result.current.generation)).toBe(true);
  });

  it("an expiry callback delivered during a forward jump restores after correction", async () => {
    // Model a queued timer delivered while only wall time is ahead. Advancing
    // fake time by 60s would expire BOTH clocks and test a different condition.
    let expiry!: () => void;
    const timeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, ms?: number) => {
      if (ms === 60_000) expiry = callback;
      return timeout(callback, ms);
    }) as typeof setTimeout);
    const load = vi.fn().mockResolvedValueOnce(grant()).mockResolvedValue({ kind: "retain" });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
    await step(); expect(expiry).toBeTypeOf("function");
    vi.setSystemTime(epoch + 3_600_000); act(() => { expiry(); });
    expect(result.current.current).toBeNull();
    vi.setSystemTime(epoch); await step(1_000);
    expect(result.current.current).toBe(value);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

it.each(["clear", "withdrawal", "identity", "disabled", "monotonic expiry"] as const)(
  "clock correction cannot undo %s while a response is suspended", async reason => {
    const request = pending();
    const load = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ kind: "retain" });
    const { result, rerender } = renderHook(({ identity, enabled }) => useTouchpointLifecycle({ enabled, identity, load }),
      { initialProps: { identity: "A", enabled: true } });
    vi.setSystemTime(epoch + 3_600_000);
    await act(async () => { request.resolve(grant()); });
    expect(result.current.current).toBeNull();
    if (reason === "clear") act(() => result.current.clear());
    if (reason === "withdrawal") {
      load.mockRejectedValue(Object.assign(new Error("withdrawal"), { touchpointWithdrawal: true }));
      event(); await step();
    }
    if (reason === "identity") rerender({ identity: "B", enabled: true });
    if (reason === "disabled") rerender({ identity: "A", enabled: false });
    if (reason === "monotonic expiry") await step(60_000);
    vi.setSystemTime(epoch); await step(1_000);
    expect(result.current.current).toBeNull();
  },
);

it("unmount cancels the correction watcher and all lifecycle timers", async () => {
  const request = pending();
  const load = vi.fn().mockReturnValue(request.promise);
  const { unmount } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
  vi.setSystemTime(epoch + 3_600_000);
  await act(async () => { request.resolve(grant()); });
  unmount(); expect(vi.getTimerCount()).toBe(0);
});

it("a backward jump cannot extend real authorization lifetime", async () => {
  const load = vi.fn().mockResolvedValueOnce(grant()).mockResolvedValue({ kind: "retain" });
  const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
  await step(); vi.setSystemTime(epoch - 3_600_000);
  await step(59_999); expect(result.current.current).toBe(value);
  await step(1); expect(result.current.current).toBeNull();
  vi.setSystemTime(epoch); await step(1_000); expect(result.current.current).toBeNull();
});

it("a forward jump cannot spend the fast retry budget", async () => {
  const request = pending();
  const load = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ kind: "retain" });
  renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
  vi.setSystemTime(epoch + 3_600_000);
  await act(async () => { request.reject(new Error("transport")); });
  await step(999); expect(load).toHaveBeenCalledTimes(1);
  await step(1); expect(load).toHaveBeenCalledTimes(2);
});

it("a waiting boundary survives a forward jump followed by correction", async () => {
  const request = pending();
  const load = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ kind: "retain" });
  renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
  vi.setSystemTime(epoch + 3_600_000);
  await act(async () => { request.resolve({ kind: "waiting", retryAfterMs: 6_000 }); });
  vi.setSystemTime(epoch); await step(5_999); expect(load).toHaveBeenCalledTimes(1);
  await step(1); expect(load).toHaveBeenCalledTimes(2);
});

it("a suspended offline grant still asks for reclamation at true expiry", async () => {
  const request = pending();
  const load = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ kind: "retain" });
  const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
  vi.setSystemTime(epoch + 3_600_000);
  await act(async () => { request.resolve({ ...grant(), kind: "decision", key: "same", value, validForMs: 60_000, offlineRecovery: "announced" }); });
  await step(60_000);
  expect(load).toHaveBeenCalledTimes(2);
  vi.setSystemTime(epoch); await step(1_000);
  expect(result.current.current).toBeNull();
});
