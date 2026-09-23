// @vitest-environment jsdom
//
// OPEND-3436, the client half. Once the runtime is unreachable, the client
// stops asking.
//
// Three properties, and each of them is the whole point of one of the ACs:
//
//   - nothing keeps asking (no poll tick, no backoff chain), because a device
//     with no network answers every one of those the same way and the only
//     thing they cost is battery and a home screen waiting on them;
//   - coming back asks exactly ONCE, however many of `online`, `focus`,
//     `pageshow` and `visibilitychange` a single reconnection happens to fire;
//   - the activity still ends on the server's own schedule, on a timer, with no
//     network involved at all.
//
// The Test channel does not opt in, so every case here also has to leave its
// retry semantics exactly where they were.

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	RETRY_BACKOFF_MS,
	SERVER_FAULT_HEARTBEAT_MS,
	useTouchpointLifecycle,
	type TouchpointLifecycleLoad,
} from "../../src/components/touchpoint-lifecycle";

type Content = { text: string };
type Load = (
	signal: AbortSignal,
	active: Content | null,
) => Promise<TouchpointLifecycleLoad<Content>>;

const first: Content = { text: "campaign" };

/** A failure the loader classifies as "the runtime was not reached". */
const unreachable = () =>
	Object.assign(new Error("touchpoint_load_failed"), { touchpointOfflineFallback: true });
/** A failure that is the server answering, so it must never enter fallback. */
const refused = () => Object.assign(new Error("touchpoint_load_failed"), { detail: "http_401" });
/**
 * A 5xx. It enters fallback like any other unreached runtime, but the request
 * crossed a network that never broke, so nothing will fire to announce the
 * server's return.
 */
const serverError = () =>
	Object.assign(new Error("touchpoint_load_failed"), {
		touchpointOfflineFallback: true,
		touchpointServerError: true,
	});

beforeEach(() => {
	// `performance` is in `toFake` deliberately: the lifecycle measures elapsed
	// time as `max(monotonic, wall)`, so leaving the monotonic clock real makes
	// every lease look ~0ms old and the expiry cases pass for the wrong reason.
	vi.useFakeTimers({
		toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
	vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/**
 * What the daemon actually answers when the runtime is unreachable: 200, this
 * decision rebuilt from its cache, and a marker saying so. The browser's own
 * connection is fine — the answer came over it — so nothing will announce the
 * runtime's return; `"unannounced"` is that fact, and it is the same fact for
 * both reasons the daemon can give.
 */
const offlineDecision = (validForMs: number): TouchpointLifecycleLoad<Content> => ({
	kind: "decision",
	value: first,
	key: "same",
	validForMs,
	offlineRecovery: "unannounced",
});

describe("offline fallback stops the client asking", () => {
	it("cancels the poll and the backoff chain once the runtime is unreachable", async () => {
		const load = vi
			.fn<Load>()
			// A window that outlasts the whole observation, so the only thing this
			// case can measure is timer-driven asking. The ONE request the end of a
			// window is allowed to make has its own case below.
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockRejectedValue(unreachable());
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		// The first poll tick fails: that is the attempt that enters fallback.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// Two minutes of nothing. No backoff retry, no 30s tick, no duplicate.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(120_000);
		});
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("leaves a channel that has not opted in on its own retry schedule", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 600_000 })
			.mockRejectedValue(unreachable());
		renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		// One attempt plus its full backoff budget, exactly as before this ticket.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS.reduce((total, ms) => total + ms, 0));
		});
		expect(load).toHaveBeenCalledTimes(2 + RETRY_BACKOFF_MS.length);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load.mock.calls.length).toBeGreaterThan(2 + RETRY_BACKOFF_MS.length);
	});

	it("never enters fallback on an answer the server gave", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 600_000 })
			.mockRejectedValue(refused());
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS.reduce((total, ms) => total + ms, 0));
		});
		expect(load).toHaveBeenCalledTimes(2 + RETRY_BACKOFF_MS.length);
	});

	it("coalesces a reconnection's events into a single revalidation", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 600_000 })
			.mockRejectedValue(unreachable());
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// One reconnection, four events: a weak network fires whichever of these
		// it happens to fire, and the client may not ask four times for it.
		act(() => {
			window.dispatchEvent(new Event("online"));
			window.dispatchEvent(new Event("focus"));
			window.dispatchEvent(new Event("pageshow"));
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(load).toHaveBeenCalledTimes(3);

		// It failed again. That is still not a reason to start a loop.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(120_000);
		});
		expect(load).toHaveBeenCalledTimes(3);

		// A LATER reconnection is a new user-visible event and may ask again.
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(load).toHaveBeenCalledTimes(4);
	});

	it("resumes the normal poll as soon as one revalidation succeeds", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 600_000 })
			.mockRejectedValueOnce(unreachable())
			.mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: 600_000 });
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(load).toHaveBeenCalledTimes(3);
		// Back on the network, back on the 30s tick.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(4);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(5);
	});

	it("keeps a cache-replayed activity mounted, on the schedule's own window", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 })
			// The daemon answered from cache: same activity, authorized to the end.
			.mockResolvedValueOnce(offlineDecision(600_000))
			.mockRejectedValue(unreachable());
		const { result } = renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		const generation = result.current.generation;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// Well past the sixty seconds the first authorization granted, and well
		// past two poll intervals: still the same mount, and no new requests.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(180_000);
		});
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("retires a cache-replayed activity on its own end time, with no network", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce(offlineDecision(120_000))
			.mockRejectedValue(unreachable());
		const { result } = renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.current).toBe(first);
		expect(load).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(119_999);
		});
		expect(result.current.current).toBe(first);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		// Display is over the instant the schedule says so...
		expect(result.current.current).toBeNull();
		// ...and the end of the window is the one moment worth one request, so the
		// daemon reclaims the package instead of holding it until something else
		// happens to ask. One request, not a loop.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300_000);
		});
		expect(load).toHaveBeenCalledTimes(2);
	});

	// The sleep case, modelled the way a sleep actually presents itself: the wall
	// clock jumps while the timer queue does not run. `armExpiry`'s timer is
	// therefore still pending at the moment the page comes back, and the lease it
	// was going to retire is still the published one.
	//
	// Returning to the page must take that lease down BEFORE it revalidates
	// anything, or a device that slept past the end of an activity shows it again
	// for as long as the recovery request takes — which, with no network, is the
	// full request budget.
	it("does not flash an activity that ended while the device was asleep", async () => {
		const pending = new Promise<TouchpointLifecycleLoad<Content>>(() => {});
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce(offlineDecision(120_000))
			.mockReturnValue(pending);
		const { result } = renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.current).toBe(first);

		// Asleep for ten minutes: `Date.now()` moves, the timer queue does not.
		act(() => {
			vi.setSystemTime(Date.now() + 600_000);
			window.dispatchEvent(new Event("focus"));
		});
		// Nothing awaited: the lease is gone by the time the event handler returns.
		expect(result.current.current).toBeNull();
		// ...and the recovery it also starts is the single one, still in flight.
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("still lets a withdrawal end display while in fallback", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce(offlineDecision(600_000))
			.mockResolvedValue({ kind: "clear" });
		const { result } = renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.current).toBe(first);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.current).toBeNull();
	});
});

// The 5xx half of fallback, and why it needs anything extra at all.
//
// Going quiet costs nothing when the thing that broke was the device's network,
// because its repair fires `online`. It costs everything when the thing that
// broke was the server: the request crossed a network that is still perfectly
// healthy, `navigator.onLine` never went false, and a user who leaves the app
// open on the page the activity appears on fires no `focus`, no `pageshow` and
// no `visibilitychange` either. Nothing, anywhere, will announce that the
// server came back.
//
// What that costs is the ticket's own product bargain. A revocation is only
// ever delivered in the answer to a request this client makes, so a client that
// has stopped asking cannot be told an activity was pulled — it keeps showing
// it for the rest of the cached window, on a device that has been back online
// the whole time. The heartbeat is the bound on that, and these cases pin the
// bound rather than the mechanism: one request per interval, none before it,
// and a withdrawal that actually lands when it arrives.
describe("a 5xx fallback keeps a slow heartbeat", () => {
	it("asks exactly once when the bound elapses, and not a millisecond before", async () => {
		const load = vi
			.fn<Load>()
			// An hour-long window, so nothing in this case can be explained by the
			// lease expiring: every request after the second one is the heartbeat.
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockRejectedValue(serverError());
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		// The first poll tick fails with a 5xx: that is the attempt that enters
		// fallback, and the only one that arms the heartbeat.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// One millisecond short of the bound. No event has fired, so a request
		// here could only come from a poll or a backoff chain, and neither is
		// supposed to survive fallback.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS - 1);
		});
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(load).toHaveBeenCalledTimes(3);

		// That heartbeat failed the same way. The next chance is the next bound,
		// not sooner: a heartbeat that fails must not turn into a retry chain.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS - 1);
		});
		expect(load).toHaveBeenCalledTimes(3);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(load).toHaveBeenCalledTimes(4);
	});

	// The guard against over-fixing. A device with no network answers every
	// request the same way for the same reason, and its recovery IS announced,
	// so a heartbeat there is pure battery with nothing to buy.
	it("starts no heartbeat when the transport is what failed", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockRejectedValue(unreachable());
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// Well past the bound, and past the poll tick that follows it.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS + 30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// And this is silence by design, not a hook that has stopped working:
		// the event that does announce this failure's recovery still asks.
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(load).toHaveBeenCalledTimes(3);
	});

	it("returns to the thirty-second poll as soon as one heartbeat gets through", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockRejectedValueOnce(serverError())
			.mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 });
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// The bound falls on a poll tick — it is a multiple of the interval — and
		// that tick is still standing down, so this is one request either way.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS);
		});
		expect(load).toHaveBeenCalledTimes(3);

		// Reachable again, so recovery goes back through the ordinary interval
		// rather than a second mechanism running beside it.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(4);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(5);
	});

	// The whole reason the heartbeat exists. No event fires in this case at all:
	// if the client does not ask, the withdrawal is never delivered and the
	// pulled activity stays on screen for the rest of the cached window.
	it("delivers a withdrawal that only the heartbeat could have asked for", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockRejectedValueOnce(serverError())
			// The server is back, and its answer is that the activity is gone —
			// the shape a 410 revocation receipt arrives in.
			.mockResolvedValue({ kind: "clear" });
		const { result } = renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.current).toBe(first);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		// A 5xx does not take display down: the lease the server granted is still
		// inside its window, which is exactly why the revocation matters.
		expect(result.current.current).toBe(first);
		expect(load).toHaveBeenCalledTimes(2);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS);
		});
		expect(load).toHaveBeenCalledTimes(3);
		expect(result.current.current).toBeNull();
	});
});

// The entry that actually happens in production.
//
// A failed REQUEST is not how this client learns the runtime is gone. The
// daemon absorbs that: it answers 200 with the decision it had cached and an
// `offlineReplay` marker. So the browser's own connection is demonstrably
// healthy — this very answer crossed it — which is precisely why nothing will
// announce the runtime coming back, and why the cases above that reject a
// `serverError()` were pinning a path production never takes.
describe("a cached answer from a reachable daemon keeps the same heartbeat", () => {
	const cached = (): TouchpointLifecycleLoad<Content> => ({
		kind: "decision",
		value: first,
		key: "same",
		validForMs: 3_600_000,
		offlineRecovery: "unannounced",
	});

	it("arms on the 200 the daemon actually sends, not only on a failed request", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockResolvedValue(cached());
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// The existing bargain, unchanged: two minutes of standing down.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(120_000);
		});
		expect(load).toHaveBeenCalledTimes(2);

		// And then the bound, which is the only thing that will ever ask again.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS - 120_000);
		});
		expect(load).toHaveBeenCalledTimes(3);

		// Still cached, so still bounded — one per interval, not a chain.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS - 1);
		});
		expect(load).toHaveBeenCalledTimes(3);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(load).toHaveBeenCalledTimes(4);
	});

	it("stops the heartbeat the moment the daemon has a live answer again", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 })
			.mockResolvedValueOnce(cached())
			.mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: 3_600_000 });
		renderHook(() =>
			useTouchpointLifecycle({
				enabled: true,
				identity: "production",
				load,
				offlineFallback: true,
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS);
		});
		expect(load).toHaveBeenCalledTimes(3);
		// Live again: the 30s poll takes recovery back and the heartbeat is gone.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(4);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(load).toHaveBeenCalledTimes(5);
	});
});
