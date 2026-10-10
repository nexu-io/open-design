// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	useTestDeploymentSelection,
	type TestDeployment,
} from "../../src/components/test-deployment-selection";
import { emitWebTouchpointDiagnostic } from "../../src/components/touchpoint-component";

vi.mock("../../src/components/touchpoint-component", () => ({
	emitWebTouchpointDiagnostic: vi.fn(),
}));
const deployment = (id: string): TestDeployment => ({
	id,
	activityId: "activity",
	snapshotHash: "snapshot",
	snapshot: {
		contentVersionId: "v1",
		placementKeys: ["opend.home.campaign-modal"],
	},
});

const catalogPage = (deployments: TestDeployment[], nextCursor: unknown) =>
	Response.json({ deployments, nextCursor });
const catalogUrl = (cursor: string) =>
	`/api/touchpoints/test-runtime/deployments?${new URLSearchParams({ cursor })}`;
const nonOd = (id: string): TestDeployment => ({
	...deployment(id), snapshot: { placementKeys: ["other.product"] },
});
function pendingBody() {
	let resolve!: (body: unknown) => void;
	const promise = new Promise<unknown>((done) => { resolve = done; });
	const response = Response.json({});
	vi.spyOn(response, "json").mockReturnValue(promise);
	return { response, resolve };
}

describe("complete Test deployment catalog pagination", () => {
	it("walks past 50 non-OD deployments and publishes only after the OD tail completes", async () => {
		const tail = deferred();
		const cursor = "created/id +&?=/%中文";
		const fetch = vi.fn()
			.mockResolvedValueOnce(catalogPage(Array.from({ length: 50 }, (_, i) => nonOd(`other-${i}`)), cursor))
			.mockReturnValueOnce(tail.promise);
		vi.stubGlobal("fetch", fetch);
		const onSelection = vi.fn();
		const onRequestResult = vi.fn();
		const { result } = renderHook(() => useTestDeploymentSelection({ ...options, onSelection, onRequestResult }));
		await flush();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls[0]![0]).toBe("/api/touchpoints/test-runtime/deployments");
		expect(fetch.mock.calls[1]![0]).toBe(catalogUrl(cursor));
		expect(fetch.mock.calls[1]![1].signal).toBe(fetch.mock.calls[0]![1].signal);
		expect(fetch.mock.calls[1]![1].cache).toBe("no-store");
		expect(result.current.deployments).toEqual([]);
		expect(onSelection).not.toHaveBeenCalled();
		expect(onRequestResult).not.toHaveBeenCalled();
		await act(async () => { tail.resolve(catalogPage([deployment("legal-tail")], null)); });
		expect(result.current.selected?.id).toBe("legal-tail");
		expect(onSelection).toHaveBeenCalledTimes(1);
		expect(onRequestResult).toHaveBeenCalledExactlyOnceWith(false);
		expect(result.current.catalogCompleteness).toBe("complete");
	});

	it("preserves server order, manual tail selection and all identical references beyond 50 OD rows", async () => {
		const ids = Array.from({ length: 61 }, (_, i) => `od-${60 - i}`);
		let newer = false;
		const fetch = vi.fn().mockImplementation(async (url: string) => url === catalogUrl("tail")
			? catalogPage(ids.slice(50).map(deployment), null)
			: catalogPage([...(newer ? [deployment("newest")] : []), ...ids.slice(0, 50).map(deployment)], "tail"));
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() => useTestDeploymentSelection({ ...options, manual: true }));
		await flush();
		expect(result.current.deployments.map(row => row.id)).toEqual(ids);
		expect(result.current.selected).toBeNull();
		act(() => result.current.select(ids.at(-1)!));
		const selected = result.current.selected;
		const catalog = result.current.deployments;
		expect(selected?.id).toBe(ids.at(-1));
		await advance(30_000);
		expect(result.current.deployments).toBe(catalog);
		expect(result.current.selected).toBe(selected);
		newer = true;
		await advance(30_000);
		expect(result.current.deployments.map(row => row.id)).toEqual(["newest", ...ids]);
		expect(result.current.deployments.slice(1).every((row, i) => row === catalog[i])).toBe(true);
		expect(result.current.selected).toBe(selected);
	});

	it("accepts a legacy one-page response while reporting unknown completeness", async () => {
		const fetch = vi.fn().mockResolvedValue(response("legacy"));
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() => useTestDeploymentSelection(options));
		await flush();
		expect(result.current.selected?.id).toBe("legacy");
		expect(result.current.catalogCompleteness).toBe("unknown");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it.each(["http", "network", "malformed-body", "invalid-row", "duplicate-od", "duplicate-non-od", "repeat", "cycle", "missing-cursor", "invalid-cursor"])(
		"retains the last catalog and never calls authority callbacks with partial results on %s", async failure => {
			const fetch = vi.fn().mockResolvedValueOnce(catalogPage([deployment("old")], null));
			vi.stubGlobal("fetch", fetch);
			const onSelection = vi.fn();
			const onRequestResult = vi.fn();
			const { result } = renderHook(() => useTestDeploymentSelection({ ...options, onSelection, onRequestResult }));
			await flush();
			const selected = result.current.selected;
			const catalog = result.current.deployments;
			onSelection.mockClear(); onRequestResult.mockClear();
			fetch.mockResolvedValueOnce(catalogPage([deployment("new"), nonOd("other")], "tail"));
			if (failure === "network") fetch.mockRejectedValueOnce(new Error("network"));
			else if (failure === "http") fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
			else if (failure === "malformed-body") fetch.mockResolvedValueOnce(new Response("{"));
			else if (failure === "invalid-row") fetch.mockResolvedValueOnce(Response.json({ deployments: [null], nextCursor: null }));
			else if (failure === "duplicate-od") fetch.mockResolvedValueOnce(catalogPage([deployment("new")], null));
			else if (failure === "duplicate-non-od") fetch.mockResolvedValueOnce(catalogPage([nonOd("other")], null));
			else if (failure === "repeat") fetch.mockResolvedValueOnce(catalogPage([], "tail"));
			else if (failure === "cycle") fetch.mockResolvedValueOnce(catalogPage([], "third")).mockResolvedValueOnce(catalogPage([], "tail"));
			else if (failure === "missing-cursor") fetch.mockResolvedValueOnce(response("tail"));
			else fetch.mockResolvedValueOnce(catalogPage([], {}));
			await advance(30_000);
			expect(result.current.selected).toBe(selected);
			expect(result.current.deployments).toBe(catalog);
			expect(onSelection).not.toHaveBeenCalled();
			expect(onRequestResult).toHaveBeenCalledExactlyOnceWith(true);
			const calls = fetch.mock.calls.length;
			await advance(60_000);
			expect(fetch).toHaveBeenCalledTimes(calls);
		},
	);

	it.each(["", "   ", 1, false, {}, []])("rejects an invalid first-page cursor %j", async cursor => {
		const onSelection = vi.fn();
		const onRequestResult = vi.fn();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogPage([deployment("partial")], cursor)));
		const { result } = renderHook(() => useTestDeploymentSelection({ ...options, onSelection, onRequestResult }));
		await flush();
		expect(result.current.deployments).toEqual([]);
		expect(onSelection).not.toHaveBeenCalled();
		expect(onRequestResult).toHaveBeenCalledExactlyOnceWith(true);
	});

	it.each([401, 403, 410])("clears current selection and authority callback on later-page %s", async status => {
		const fetch = vi.fn()
			.mockResolvedValueOnce(catalogPage([deployment("old")], null))
			.mockResolvedValueOnce(catalogPage([deployment("partial")], "tail"))
			.mockResolvedValueOnce(new Response(null, { status }));
		vi.stubGlobal("fetch", fetch);
		const onSelection = vi.fn();
		const onRequestResult = vi.fn();
		const { result } = renderHook(() => useTestDeploymentSelection({ ...options, onSelection, onRequestResult }));
		await flush(); onSelection.mockClear(); onRequestResult.mockClear();
		await advance(30_000);
		expect(result.current.deployments).toEqual([]);
		expect(result.current.selected).toBeNull();
		expect(onSelection).toHaveBeenCalledExactlyOnceWith(null);
		expect(onRequestResult).toHaveBeenCalledExactlyOnceWith(true);
	});

	it("shares a whole-walk deadline across slow pages and fences a late tail body after retry", async () => {
		const first = deferred();
		const tail = pendingBody();
		const fetch = vi.fn().mockResolvedValueOnce(catalogPage([deployment("old")], null))
			.mockReturnValueOnce(first.promise).mockResolvedValueOnce(tail.response)
			.mockResolvedValueOnce(catalogPage([deployment("recovered")], null));
		vi.stubGlobal("fetch", fetch);
		const onSelection = vi.fn();
		const onRequestResult = vi.fn();
		const { result } = renderHook(() => useTestDeploymentSelection({ ...options, onSelection, onRequestResult }));
		await flush(); onSelection.mockClear(); onRequestResult.mockClear();
		await advance(30_000); await advance(6_000);
		await act(async () => { first.resolve(catalogPage([deployment("partial")], "tail")); });
		expect(fetch).toHaveBeenCalledTimes(3);
		await event("focus"); expect(fetch).toHaveBeenCalledTimes(3);
		await advance(3_999);
		expect(onRequestResult).not.toHaveBeenCalled();
		await advance(1);
		expect(fetch.mock.calls[2]![1].signal.aborted).toBe(true);
		expect(result.current.selected?.id).toBe("old");
		expect(onSelection).not.toHaveBeenCalled();
		expect(onRequestResult).toHaveBeenCalledExactlyOnceWith(true);
		await event("online");
		expect(result.current.selected?.id).toBe("recovered");
		onSelection.mockClear(); onRequestResult.mockClear();
		await act(async () => { tail.resolve({ deployments: [deployment("late")], nextCursor: null }); });
		expect(result.current.selected?.id).toBe("recovered");
		expect(onSelection).not.toHaveBeenCalled();
		expect(onRequestResult).not.toHaveBeenCalled();
	});

	it.each(["owner", "disabled", "unmount", "offline", "hidden"])("fences a tail body after %s even when abort is ignored", async kind => {
		const tail = pendingBody();
		const fetch = vi.fn().mockResolvedValueOnce(catalogPage([deployment("old")], null))
			.mockResolvedValueOnce(catalogPage([deployment("partial")], "tail"))
			.mockResolvedValueOnce(tail.response)
			.mockResolvedValueOnce(catalogPage([deployment("other-owner")], null));
		vi.stubGlobal("fetch", fetch);
		const onSelection = vi.fn(); const onRequestResult = vi.fn();
		const props = { ...options, onSelection, onRequestResult };
		const { result, rerender, unmount } = renderHook(props => useTestDeploymentSelection(props), { initialProps: props });
		await flush(); await advance(30_000);
		expect(fetch).toHaveBeenCalledTimes(3);
		if (kind === "owner") rerender({ ...props, owner: "account-b" });
		else if (kind === "disabled") rerender({ ...props, enabled: false });
		else if (kind === "unmount") unmount();
		else if (kind === "offline") await event("offline");
		else {
			vi.spyOn(document, "hidden", "get").mockReturnValue(true);
			await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
		}
		await flush();
		expect(fetch.mock.calls[2]![1].signal.aborted).toBe(true);
		const selected = result.current.selected;
		onSelection.mockClear(); onRequestResult.mockClear();
		vi.mocked(emitWebTouchpointDiagnostic).mockClear();
		// A malformed late body must not produce diagnostics for an abandoned owner.
		await act(async () => { tail.resolve({ deployments: [null], nextCursor: {} }); });
		expect(result.current.selected).toBe(selected);
		expect(onSelection).not.toHaveBeenCalled();
		expect(onRequestResult).not.toHaveBeenCalled();
		expect(emitWebTouchpointDiagnostic).not.toHaveBeenCalled();
	});

	it("walks every page without a total-page cap, including empty filtered pages", async () => {
		let page = 0;
		const fetch = vi.fn().mockImplementation(async () => {
			page++;
			return page === 257 ? catalogPage([deployment("last")], null)
				: catalogPage([nonOd(`other-${page}`)], `cursor-${page}`);
		});
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() => useTestDeploymentSelection(options));
		await flush();
		expect(fetch).toHaveBeenCalledTimes(257);
		expect(result.current.selected?.id).toBe("last");
	});
});
const response = (...ids: string[]) =>
	Response.json({ deployments: ids.map(deployment) });
const options = { enabled: true, owner: "account-a", manual: false };
const flush = async () => {
	await act(async () => {});
};
const advance = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
};
const event = async (name: string) => {
	await act(async () => {
		window.dispatchEvent(new Event(name));
	});
};
function deferred() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe("Test deployment directory discovery", () => {
	it("polls an empty directory at 30 seconds and preserves identical snapshot references", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(response())
			.mockImplementation(async () => response("a"));
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() => useTestDeploymentSelection(options));
		await flush();
		expect(result.current.selected).toBeNull();
		await advance(29_999);
		expect(fetch).toHaveBeenCalledTimes(1);
		await advance(1);
		expect(result.current.selected?.id).toBe("a");
		const selected = result.current.selected;
		const catalog = result.current.deployments;
		await advance(30_000);
		expect(result.current.selected).toBe(selected);
		expect(result.current.deployments).toBe(catalog);
		// JSON field order is not a changed snapshot; real snapshot changes are.
		fetch.mockImplementation(async () =>
			Response.json({
				deployments: [
					{
						...deployment("a"),
						snapshot: {
							placementKeys: ["opend.home.campaign-modal"],
							contentVersionId: "v1",
						},
					},
				],
			}),
		);
		await advance(30_000);
		expect(result.current.selected).toBe(selected);
		fetch.mockImplementation(async () =>
			Response.json({
				deployments: [
					{
						...deployment("a"),
						snapshot: { ...deployment("a").snapshot, contentVersionId: "v2" },
					},
				],
			}),
		);
		await advance(30_000);
		expect(result.current.selected).not.toBe(selected);
	});

	it.each(["focus", "online", "pageshow"])(
		"discovers a replacement on %s without waiting for the poll",
		async (name) => {
			vi.stubGlobal(
				"fetch",
				vi
					.fn()
					.mockResolvedValueOnce(response("a"))
					.mockResolvedValueOnce(response("b")),
			);
			const { result } = renderHook(() => useTestDeploymentSelection(options));
			await flush();
			await event(name);
			expect(result.current.selected?.id).toBe("b");
		},
	);

	it("pauses hidden discovery and refreshes on visibility recovery", async () => {
		let hidden = false;
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		const fetch = vi.fn().mockImplementation(async () => response("a"));
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() => useTestDeploymentSelection(options));
		await flush();
		hidden = true;
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await advance(60_000);
		expect(fetch).toHaveBeenCalledTimes(1);
		hidden = false;
		fetch.mockImplementation(async () => response("b"));
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(result.current.selected?.id).toBe("b");
	});

	it.each(["http", "malformed", "invalid-row", "duplicate", "network"])(
		"retains selection on %s failure, but clears a confirmed empty directory",
		async (failure) => {
			const fetch = vi.fn().mockResolvedValueOnce(response("a"));
			vi.stubGlobal("fetch", fetch);
			const { result } = renderHook(() => useTestDeploymentSelection(options));
			await flush();
			const selected = result.current.selected;
			fetch.mockImplementation(async () => {
				if (failure === "network") throw new Error("network unavailable");
				if (failure === "http") return new Response(null, { status: 503 });
				if (failure === "duplicate") return response("b", "b");
				return Response.json(
					failure === "malformed" ? {} : { deployments: [null] },
				);
			});
			await advance(30_000);
			expect(result.current.selected).toBe(selected);
			expect(emitWebTouchpointDiagnostic).toHaveBeenCalled();
			fetch.mockImplementation(async () => response());
			await advance(30_000);
			expect(result.current.selected).toBe(selected);
			await event("online");
			expect(result.current.selected).toBeNull();
		},
	);

	it("times out without losing selection and rejects a late response after a successful retry", async () => {
		const pending = deferred();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(response("a"))
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce(response("b"));
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() => useTestDeploymentSelection(options));
		await flush();
		await advance(30_000);
		await event("focus");
		expect(fetch).toHaveBeenCalledTimes(2); // single flight
		await advance(10_000);
		expect(result.current.selected?.id).toBe("a");
		expect(emitWebTouchpointDiagnostic).toHaveBeenCalledWith({
			code: "touchpoint_test_catalog_timeout",
		});
		await event("online");
		expect(result.current.selected?.id).toBe("b");
		await act(async () => {
			pending.resolve(response("stale"));
		});
		expect(result.current.selected?.id).toBe("b");
	});

	it("isolates accounts and ignores an old account response even when abort is ignored", async () => {
		const pending = deferred();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(response("a"))
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce(response("b"));
		vi.stubGlobal("fetch", fetch);
		const { result, rerender, unmount } = renderHook(
			(props) => useTestDeploymentSelection(props),
			{ initialProps: options },
		);
		await flush();
		await advance(30_000);
		rerender({ ...options, owner: "account-b" });
		expect(result.current.selected).toBeNull();
		await flush();
		expect(result.current.selected?.id).toBe("b");
		await act(async () => {
			pending.resolve(response("stale-a"));
		});
		expect(result.current.selected?.id).toBe("b");
		rerender({ ...options, enabled: false });
		expect(result.current.selected).toBeNull();
		unmount();
		await event("focus");
		await advance(60_000);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("preserves manual selection when newer deployments arrive and does not auto-select after removal", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(response("a"));
		vi.stubGlobal("fetch", fetch);
		const { result } = renderHook(() =>
			useTestDeploymentSelection({ ...options, manual: true }),
		);
		await flush();
		expect(result.current.selected).toBeNull();
		act(() => result.current.select("a"));
		const selected = result.current.selected;
		fetch.mockImplementation(async () => response("b", "a"));
		await advance(30_000);
		expect(result.current.selected).toBe(selected);
		fetch.mockImplementation(async () => response("b"));
		await advance(30_000);
		expect(result.current.selected).toBeNull();
		act(() => result.current.select("b"));
		expect(result.current.selected?.id).toBe("b");
	});
});
