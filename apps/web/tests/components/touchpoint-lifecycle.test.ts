// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountTouchpoint, resolveAuthorizationDeadline, useTouchpointLifecycle, type TouchpointLifecycleLoad, type TouchpointLifecycleOptions } from "../../src/components/touchpoint-lifecycle";
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
		await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
		expect(result.current.status).toBe("error");
		await act(async () => { pending.resolve({ kind: "decision", value: first, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBeNull();
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
