// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTouchpointLifecycle, TOUCHPOINT_POLL_MS, REQUEST_TIMEOUT_MS, type TouchpointLifecycleLoad } from "../../src/components/touchpoint-lifecycle";

type Decision = { id: string };
const decision = { id: "published" };
const grant = (): TouchpointLifecycleLoad<Decision> => ({
  kind: "decision", value: decision, key: decision.id, validForMs: 120_000,
});
const tick = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("online withdrawal deadline", () => {
  it.each([35, 500, 5_000, 14_999])("removes an active decision within 30s including %i ms response time", async (latency) => {
    let withdrawn = false;
    const load = vi.fn(async (): Promise<TouchpointLifecycleLoad<Decision>> => {
      const result = withdrawn ? { kind: "clear" } as const : grant();
      await new Promise(resolve => setTimeout(resolve, withdrawn ? latency : 0));
      return result;
    });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", offlineFallback: true, load }));
    await tick(0);
    expect(result.current.current).toEqual(decision);
    await tick(1);
    withdrawn = true;
    await tick(30_000);
    expect(result.current.current, "withdrawal includes polling AND the response").toBeNull();
  });

  it("preserves the exact start boundary between shorter Test polls", async () => {
    const start = Date.now() + 25_000;
    const load = vi.fn(async (): Promise<TouchpointLifecycleLoad<Decision>> => Date.now() < start
      ? { kind: "waiting", retryAfterMs: start - Date.now() }
      : grant());
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", stopOnFailure: true, load }));
    await tick(24_999);
    expect(result.current.current).toBeNull();
    await tick(1);
    expect(result.current.current).toEqual(decision);
  });

  it("CMS-REL-009: Test withdrawal also includes response time inside 30s", async () => {
    let withdrawn = false;
    const load = vi.fn(async (): Promise<TouchpointLifecycleLoad<Decision>> => {
      if (!withdrawn) return grant();
      await new Promise(resolve => setTimeout(resolve, 5_000));
      return { kind: "clear" };
    });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", stopOnFailure: true, load }));
    await tick(1);
    expect(result.current.current).toEqual(decision);
    withdrawn = true;
    await tick(30_000);
    expect(result.current.current).toBeNull();
  });

  it.each([5_000, 14_999])("does not lose a withdrawal poll behind a slow pre-withdrawal grant (%i ms response)", async (latency) => {
    let withdrawn = false;
    let resolveOld!: (value: TouchpointLifecycleLoad<Decision>) => void;
    const load = vi.fn<() => Promise<TouchpointLifecycleLoad<Decision>>>()
      .mockResolvedValueOnce(grant())
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockImplementation(async () => {
        const answer = withdrawn ? { kind: "clear" } as const : grant();
        await new Promise(resolve => setTimeout(resolve, latency));
        return answer;
      });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", offlineFallback: true, load }));
    await tick(0);
    // Start a live round independently of the periodic timer. Its old answer
    // must not postpone the next withdrawal query by another whole interval.
    await tick(1);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(load).toHaveBeenCalledTimes(2);
    withdrawn = true;
    await tick(REQUEST_TIMEOUT_MS - 1);
    await act(async () => { resolveOld(grant()); });
    await tick(30_000 - REQUEST_TIMEOUT_MS);
    expect(result.current.current).toBeNull();
  });


  it.each(["offline", "unmounted"] as const)("does not drain a missed poll after the round becomes %s", async mode => {
    let resolveOld!: (value: TouchpointLifecycleLoad<Decision>) => void;
    const load = vi.fn<() => Promise<TouchpointLifecycleLoad<Decision>>>()
      .mockResolvedValueOnce(grant())
      .mockImplementation(() => new Promise(resolve => { resolveOld = resolve; }));
    const { unmount } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", offlineFallback: true, load }));
    await tick(2 * TOUCHPOINT_POLL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    if (mode === "unmounted") unmount();
    else await tick(REQUEST_TIMEOUT_MS - TOUCHPOINT_POLL_MS);
    await act(async () => { resolveOld(grant()); });
    await tick(2 * TOUCHPOINT_POLL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });


  it("reserves response time within the Test channel withdrawal deadline", async () => {
    const load = vi.fn(async () => grant());
    renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", stopOnFailure: true, load }));
    await tick(TOUCHPOINT_POLL_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("discards a missed poll when hidden instead of duplicating the return-to-page load", async () => {
    const hidden = vi.spyOn(document, "hidden", "get");
    const load = vi.fn<() => Promise<TouchpointLifecycleLoad<Decision>>>()
      .mockResolvedValueOnce(grant())
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(grant());
    renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", offlineFallback: true, load }));
    await tick(2 * TOUCHPOINT_POLL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(true);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(load).toHaveBeenCalledTimes(3);
  });
});
