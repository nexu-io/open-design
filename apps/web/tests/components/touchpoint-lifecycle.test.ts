// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountTouchpoint, REQUEST_TIMEOUT_MS, resolveAuthorizationDeadline, RETRY_BACKOFF_MS, useTouchpointLifecycle, type TouchpointLifecycleLoad, type TouchpointLifecycleOptions } from "../../src/components/touchpoint-lifecycle";
import * as host from "../../src/components/touchpoint-component";

const content: host.WebTouchpointContent = {
	id: "content-1",
	placementKey: "opend.home.campaign-modal",
	locale: "en-US",
	manifestHash: "sha256:manifest",
	entryPath: "entry.js",
	entryDigest: "sha256:entry",
	entryModule: "",
	resources: [],
	buildIdentity: { fingerprint: "test" },
	runtime: {
		kind: "web-component",
		apiVersion: 1,
		wrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
	},
	manifest: {
		formatVersion: 2,
		runtimeKind: "web-component",
		runtimeApiVersion: 1,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
		contentLine: "test",
		resources: ["entry.js"],
		images: [],
		placements: [
			{
				key: "opend.home.campaign-modal",
				entry: "entry.js",
				resources: [],
				locales: ["en-US"],
				requiredCapabilities: [],
				staticActions: [],
			},
		],
	},
};
let releases: Array<() => void>;
beforeEach(() => {
	vi.useFakeTimers();
	releases = [];
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(
		Object.assign([], { item: () => null }),
	);
});
afterEach(() => {
	releases.forEach((release) => release());
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// Both delivery adapters cross exactly the same lifecycle interface. Transport,
// authorization and receipt differences do not select a second DOM implementation.
describe.each(["test", "production"] as const)(
	"shared %s lifecycle",
	(mode) => {
		const setup = () => {
			const container = document.createElement("div");
			document.body.append(container);
			const resources = {
				entryUrl: "blob:content",
				resourceUrls: new Map<string, string>(),
				dispose: vi.fn(),
			};
			const verify = vi
				.spyOn(host, "verifyWebTouchpoint")
				.mockResolvedValue(resources);
			const dispose = vi
				.spyOn(host.OpenDesignTouchpointElement.prototype, "dispose")
				.mockResolvedValue();
			const mount = vi
				.spyOn(host.OpenDesignTouchpointElement.prototype, "mount")
				.mockImplementation(async function (
					this: host.OpenDesignTouchpointElement,
				) {
					this.shadowRoot?.replaceChildren(document.createTextNode("campaign"));
				});
			const onVisible = vi.fn(),
				dispatchAction = vi.fn(async () => {}),
				requestClose = vi.fn();
			let authorized = true;
			const start = () => {
				const release = mountTouchpoint(container, {
					content,
					placementKey: content.placementKey,
					staticActions: [],
					mode,
					locale: "en-US",
					isCurrent: () => authorized,
					dispatchAction,
					requestClose,
					onVisible,
				});
				releases.push(release);
				return release;
			};
			return {
				container,
				resources,
				verify,
				dispose,
				mount,
				onVisible,
				dispatchAction,
				requestClose,
				start,
				revoke: () => {
					authorized = false;
				},
			};
		};
		it("uses the common host and reports visibility only once after it becomes visible", async () => {
			const s = setup();
			let visible = false;
			vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() =>
				Object.assign(visible ? [new DOMRect()] : [], { item: () => null }),
			);
			s.start();
			await vi.advanceTimersByTimeAsync(16);
			expect(
				s.container.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
			).toBe("campaign");
			expect(s.mount.mock.calls[0]?.[2].mode).toBe(mode);
			expect(s.onVisible).not.toHaveBeenCalled();
			visible = true;
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(16);
			expect(s.onVisible).toHaveBeenCalledTimes(1);
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(16);
			expect(s.onVisible).toHaveBeenCalledTimes(1);
		});
		it("disposes late verification once and never mounts after cleanup", async () => {
			const s = setup();
			let resolve!: (value: typeof s.resources) => void;
			s.verify.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			const release = s.start();
			release();
			resolve(s.resources);
			await vi.advanceTimersByTimeAsync(0);
			expect(s.mount).not.toHaveBeenCalled();
			expect(s.resources.dispose).toHaveBeenCalledTimes(1);
			expect(s.dispose).toHaveBeenCalledTimes(1);
			expect(s.container.childNodes.length).toBe(0);
		});
		it("does not report or authorize actions after a pending mount is released", async () => {
			const s = setup();
			let finish!: () => void;
			s.mount.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						finish = resolve;
					}),
			);
			const release = s.start();
			await vi.advanceTimersByTimeAsync(0);
			release();
			finish();
			await vi.advanceTimersByTimeAsync(16);
			const callbacks = s.mount.mock.calls[0]?.[5];
			await callbacks?.dispatchAction?.("learn");
			callbacks?.requestClose?.();
			expect(s.dispatchAction).not.toHaveBeenCalled();
			expect(s.requestClose).not.toHaveBeenCalled();
			expect(s.onVisible).not.toHaveBeenCalled();
			expect(s.resources.dispose).toHaveBeenCalledTimes(1);
		});
		it("consults the adapter's live authorization for actions and visibility", async () => {
			const s = setup();
			s.start();
			await vi.advanceTimersByTimeAsync(0);
			const callbacks = s.mount.mock.calls[0]?.[5];
			await callbacks?.dispatchAction?.("learn");
			expect(s.dispatchAction).toHaveBeenCalledOnce();
			s.revoke();
			await callbacks?.dispatchAction?.("learn");
			callbacks?.requestClose?.();
			await vi.advanceTimersByTimeAsync(16);
			expect(s.dispatchAction).toHaveBeenCalledOnce();
			expect(s.requestClose).not.toHaveBeenCalled();
			expect(s.onVisible).not.toHaveBeenCalled();
		});
		it("rejects action identities not declared by the content manifest", async () => {
			const s = setup();
			const onError = vi.fn();
			releases.push(
				mountTouchpoint(s.container, {
					content,
					placementKey: content.placementKey,
					staticActions: [
						{
							id: "unexpected",
							target: { kind: "https", url: "https://example.com" },
						},
					],
					mode,
					locale: "en-US",
					isCurrent: () => true,
					dispatchAction: s.dispatchAction,
					onError,
				}),
			);
			await vi.advanceTimersByTimeAsync(0);
			expect(onError).toHaveBeenCalledWith("touchpoint_decision_mismatch");
			expect(s.mount).not.toHaveBeenCalled();
			expect(s.resources.dispose).toHaveBeenCalledOnce();
		});
	},
);

const timing = {
	serverTime: "2030-01-01T00:00:00.000Z",
	endsAt: "2030-01-01T00:05:00.000Z",
	authorizationExpiresAt: "2030-01-01T01:00:00.000Z",
};

describe("resolveAuthorizationDeadline", () => {
	it("keeps production's five-minute safety bound without treating it as a server rejection", () => {
		expect(resolveAuthorizationDeadline(timing, 5 * 60_000)).toBe(Date.parse(timing.endsAt));
	});
	it("rejects Test authorization beyond its sixty-second contract or activity window", () => {
		expect(resolveAuthorizationDeadline(timing, 60_000, true)).toBeNull();
		expect(resolveAuthorizationDeadline({ ...timing, endsAt: "2030-01-01T00:00:10.000Z", authorizationExpiresAt: "2030-01-01T00:00:30.000Z" }, 60_000, true)).toBeNull();
	});
	it("expires at a valid authorization before the activity end", () => {
		expect(resolveAuthorizationDeadline({ ...timing, authorizationExpiresAt: "2030-01-01T00:00:30.000Z" }, 60_000, true)).toBe(Date.parse("2030-01-01T00:00:30.000Z"));
	});
});

type Content = { text: string };
type Load = TouchpointLifecycleOptions<Content>["load"];
// Match the web suite's deferred-I/O helper: its TypeScript lib predates Promise.withResolvers.
function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>(next => { resolve = next; });
	return { promise, resolve };
}
const first = { text: "campaign" };
const second = { text: "campaign-renewed" };

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
	vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("shared display lifecycle", () => {
	it("keeps an unexpired visible decision mounted while focus revalidation is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("focus")); });
		expect(load).toHaveBeenCalledTimes(2);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
		expect(result.current.current).toBe(first);
		act(() => { window.dispatchEvent(new Event("focus")); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { pending.resolve({ kind: "decision", value: { ...first }, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
	});

	it("still withdraws display and authority on actual page hiding", async () => {
		const load = vi.fn<Load>().mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => { document.dispatchEvent(new Event("visibilitychange")); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
	});
	it("renews authority without replacing a visible decision, then expires even after no-decision polls", async () => {
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 })
			.mockResolvedValueOnce({ kind: "decision", value: { text: "campaign" }, key: "same", validForMs: 60_000 })
			.mockResolvedValue({ kind: "retain" });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
		await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
		expect(result.current.status).toBe("active");
	});

	it("refetches at the start boundary but cannot activate until the server grants authority", async () => {
		const grant = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "waiting", retryAfterMs: 500 }).mockReturnValue(grant.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(499); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("before");
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		await act(async () => { grant.resolve({ kind: "decision", value: first, key: "first", validForMs: 1000 }); });
		expect(result.current.current).toBe(first);
	});

	it("ignores an old environment response after selection changes", async () => {
		const old = deferred<TouchpointLifecycleLoad<Content>>();
		const oldLoad: Load = () => old.promise;
		const nextLoad: Load = async () => ({ kind: "decision", value: first, key: "next", validForMs: 60_000 });
		const { result, rerender } = renderHook(({ identity, load }) => useTouchpointLifecycle({ enabled: true, identity, load }), { initialProps: { identity: "old", load: oldLoad } });
		rerender({ identity: "next", load: nextLoad });
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		await act(async () => { old.resolve({ kind: "decision", value: { text: "stale" }, key: "old", validForMs: 60_000 }); });
		expect(result.current.current).toBe(first);
	});

	it("expiry fences a renewal response still in flight", async () => {
		const late = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 31_000 }).mockReturnValue(late.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
		expect(result.current.current).toBeNull();
		await act(async () => { late.resolve({ kind: "decision", value: first, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBeNull();
	});

	it("subtracts response latency and does not extend leases when the local clock moves backwards", async () => {
		const response = deferred<TouchpointLifecycleLoad<Content>>();
		const load: Load = () => response.promise;
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(400); response.resolve({ kind: "decision", value: first, key: "same", validForMs: 1000 }); });
		expect(result.current.current).toBe(first);
		vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
		await act(async () => { await vi.advanceTimersByTimeAsync(599); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
	});

	it("withdraws old authority synchronously on wake and rejects a timed-out revalidation", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("online")); expect(result.current.isCurrent(generation)).toBe(false); });
		expect(result.current.current).toBeNull();
		await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
		expect(result.current.status).toBe("error");
		await act(async () => { pending.resolve({ kind: "decision", value: first, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBeNull();
	});
	it("keeps a visible lease when a polling refresh times out, then retires it at its own deadline", async () => {
		const stalled = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(stalled.promise);
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
		// The lease still retires on the server's deadline, not on the retries:
		// every attempt after t=30s stays pending, so none of them can renew it.
		await act(async () => { await vi.advanceTimersByTimeAsync(60_000 - 30_000 - REQUEST_TIMEOUT_MS - 1); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
	});

	it("keeps a visible lease when a polling refresh fails, and clears once it lapses", async () => {
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("error");
	});

	it("rides out consecutive polling failures inside the lease, then clears at the granted deadline", async () => {
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 120_000 }).mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		for (const tick of [30_000, 60_000, 90_000]) {
			await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
			expect(result.current.current, `lease must survive the failure at ${tick}ms`).toBe(first);
			expect(result.current.generation).toBe(generation);
			expect(result.current.isCurrent(generation)).toBe(true);
		}
		// Let the final cycle's retries run: the loop stops on the 90s tick itself.
		// Backoffs are sequential: each retry is scheduled from the previous
		// failure, so the cycle's last retry lands at their SUM.
		const lastRetryAt = RETRY_BACKOFF_MS.reduce((total, delay) => total + delay, 0);
		await act(async () => { await vi.advanceTimersByTimeAsync(lastRetryAt); });
		// Each cycle is one attempt plus its full retry budget, and every cycle gets
		// that budget back — an earlier exhausted cycle must not silence later ones.
		expect(onError).toHaveBeenCalledTimes(3 * (1 + RETRY_BACKOFF_MS.length));
		expect(result.current.current).toBe(first);
		// The lease still retires on the deadline the server granted, never later.
		await act(async () => { await vi.advanceTimersByTimeAsync(120_000 - 90_000 - lastRetryAt - 1); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
	});

	it("retries a fast failure within seconds instead of waiting out the poll interval", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "one", validForMs: 60_000 })
			.mockRejectedValueOnce(new Error("touchpoint_test_load_failed"))
			.mockResolvedValue({ kind: "decision", value: second, key: "two", validForMs: 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		// The failure must not have to wait for the next 30s tick: at that point
		// only one poll would remain before the sixty-second lease expires.
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
		expect(load).toHaveBeenCalledTimes(3);
		expect(result.current.current).toBe(second);
	});

	it("bounds the retries and returns to the poll interval", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "one", validForMs: 60_000 })
			.mockRejectedValue(new Error("touchpoint_test_load_failed"));
		renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
		expect(load).toHaveBeenCalledTimes(3);
		await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
		expect(load).toHaveBeenCalledTimes(4);
		// Exhausted: no third retry, and nothing further until the next tick.
		await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
		expect(load).toHaveBeenCalledTimes(4);
	});

	it("never lets a retry chain run into — and swallow — the next poll", async () => {
		// `refresh` declines to start while a request is in flight, so a retry that
		// outlives its cycle does not just arrive late: it costs the next tick.
		const stalling = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "one", validForMs: 300_000 })
			.mockReturnValue(stalling.promise);
		renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		// Cycle at 30s stalls and is abandoned at its budget; no room is left for a
		// retry plus another full budget inside this cycle, so none is scheduled.
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000 + REQUEST_TIMEOUT_MS); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0] ?? 0); });
		expect(load, "a timed-out attempt must not be retried").toHaveBeenCalledTimes(2);
		// The next tick therefore still lands on schedule.
		await act(async () => { await vi.advanceTimersByTimeAsync(60_000 - 30_000 - REQUEST_TIMEOUT_MS - (RETRY_BACKOFF_MS[0] ?? 0)); });
		expect(load, "the 60s poll must not have been swallowed").toHaveBeenCalledTimes(3);
	});

	it("gives a slow response the full fifteen-second budget before abandoning it", async () => {
		const slow = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockReturnValue(slow.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		// The retest measured an 11.5s round against the old ten-second budget.
		await act(async () => { await vi.advanceTimersByTimeAsync(11_500); });
		expect(result.current.status).not.toBe("error");
		await act(async () => { slow.resolve({ kind: "decision", value: first, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBe(first);
	});

	it("clears a visible lease when the failure carries the server's own withdrawal", async () => {
		const withdrawal = Object.assign(new Error("touchpoint_load_failed"), { touchpointWithdrawal: true });
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockRejectedValue(withdrawal);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("error");
	});

	it("cannot restore an original lease that expires while a wake request is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
		act(() => { window.dispatchEvent(new Event("focus")); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(2000); pending.resolve({ kind: "retain" }); });
		expect(result.current.current).toBeNull();
	});
});
