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
