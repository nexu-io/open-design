// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionTouchpointLoadError, loadProductionTouchpointDecision, prefetchProductionTouchpointDecisions } from "../../src/components/production-touchpoint-loader";
import { AMR_LOGIN_STATUS_EVENT } from "../../src/components/amrLoginPolling";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("production touchpoint decision loader", () => {
	it("keeps 404 absence quiet while bounding network, HTTP, and malformed response failures", async () => {
		const signal = new AbortController().signal;
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
		expect(await loadProductionTouchpointDecision("opend.home.account-badge", "en-US", signal)).toEqual({ kind: "no-decision" });
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("secret URL")));
		await expect(loadProductionTouchpointDecision("opend.home.account-badge", "en-US", signal)).rejects.toMatchObject({ detail: "network" } satisfies Partial<ProductionTouchpointLoadError>);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
		await expect(loadProductionTouchpointDecision("opend.home.account-badge", "en-US", signal)).rejects.toMatchObject({ detail: "http_500" } satisfies Partial<ProductionTouchpointLoadError>);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", { status: 200 })));
		await expect(loadProductionTouchpointDecision("opend.home.account-badge", "en-US", signal)).rejects.toMatchObject({ detail: "malformed_json" } satisfies Partial<ProductionTouchpointLoadError>);
	});
	it("requests the mounted decision and accepts only the exact four-field revocation receipt", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "production_runtime_revoked", receipt: { touchpointDecisionId: "decision-1", deploymentId: "deployment-1", activityId: "activity-1", contentVersionId: "version-1" } }), { status: 410 }));
		vi.stubGlobal("fetch", fetchMock);
		expect(await loadProductionTouchpointDecision("opend.home.account-badge", "en-US", new AbortController().signal, "decision-1")).toEqual({ kind: "revoked", receipt: { touchpointDecisionId: "decision-1", deploymentId: "deployment-1", activityId: "activity-1", contentVersionId: "version-1" } });
		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("activeDecisionId=decision-1"), expect.anything());
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "production_runtime_revoked", receipt: { touchpointDecisionId: "decision-1" } }), { status: 410 })));
		await expect(loadProductionTouchpointDecision("opend.home.account-badge", "en-US", new AbortController().signal, "decision-1")).rejects.toMatchObject({ detail: "http_410" } satisfies Partial<ProductionTouchpointLoadError>);
	});

	it("does not translate an abort into a load diagnostic", async () => {
		const abort = new DOMException("aborted", "AbortError");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
		await expect(loadProductionTouchpointDecision("opend.home.account-badge", "en-US", new AbortController().signal)).rejects.toBe(abort);
	});

	describe("cold-start prefetch", () => {
		const badge = "opend.home.account-badge";
		const ok = () => new Response(JSON.stringify({ touchpointDecisionId: "prefetched" }), { status: 200 });
		const load = (locale = "en-US", active?: string) => loadProductionTouchpointDecision(badge, locale, new AbortController().signal, active);
		it("serves the first load from a prefetch started beside the login status, reporting its age once", async () => {
			vi.useFakeTimers({ toFake: ["Date", "performance"] });
			const fetchMock = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValue(new Response(null, { status: 404 }));
			vi.stubGlobal("fetch", fetchMock);
			prefetchProductionTouchpointDecisions([badge], "en-US");
			vi.advanceTimersByTime(800);
			expect(await load()).toEqual({ kind: "decision", value: { touchpointDecisionId: "prefetched" }, ageMs: 800 });
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(await load()).toEqual({ kind: "no-decision" });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
		it.each([
			["another locale", (fetchMock: ReturnType<typeof vi.fn>) => load("zh-CN")],
			["a renewal of a mounted decision", () => load("en-US", "decision-1")],
			["a prefetch older than fifteen seconds", () => { vi.advanceTimersByTime(15_001); return load(); }],
			["a login status change", () => { window.dispatchEvent(new CustomEvent(AMR_LOGIN_STATUS_EVENT)); return load(); }],
		] as const)("fetches fresh for %s", async (_name, run) => {
			vi.useFakeTimers({ toFake: ["Date", "performance"] });
			const fetchMock = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValue(new Response(null, { status: 404 }));
			vi.stubGlobal("fetch", fetchMock);
			prefetchProductionTouchpointDecisions([badge], "en-US");
			expect(await run(fetchMock)).toEqual({ kind: "no-decision" });
			expect(fetchMock).toHaveBeenCalledTimes(2);
			await load();
		});
		it("measures prefetch age on a monotonic clock, so a wall clock stepping back cannot lengthen a lease", async () => {
			vi.useFakeTimers({ toFake: ["Date", "performance"] });
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok()));
			prefetchProductionTouchpointDecisions([badge], "en-US");
			vi.advanceTimersByTime(500);
			vi.setSystemTime(Date.now() - 60_000);
			expect(await load()).toMatchObject({ kind: "decision", ageMs: 500 });
		});
		it("keeps the prefetch for the retry of a load aborted while it waited", async () => {
			const fetchMock = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValue(new Response(null, { status: 404 }));
			vi.stubGlobal("fetch", fetchMock);
			prefetchProductionTouchpointDecisions([badge], "en-US");
			const aborted = new AbortController();
			const first = loadProductionTouchpointDecision(badge, "en-US", aborted.signal);
			const retry = load();
			aborted.abort();
			await expect(first).rejects.toMatchObject({ name: "AbortError" });
			expect(await retry).toMatchObject({ kind: "decision", value: { touchpointDecisionId: "prefetched" } });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
		it("reuses a signed-in no-decision answer instead of asking again", async () => {
			const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValue(ok());
			vi.stubGlobal("fetch", fetchMock);
			prefetchProductionTouchpointDecisions([badge], "en-US");
			expect(await load()).toEqual({ kind: "no-decision" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
		it.each([
			["a signed-out", () => Promise.resolve(new Response(null, { status: 401 }))],
			["a failed", () => Promise.reject(new TypeError("offline"))],
		] as const)("never reuses %s prefetch", async (_name, first) => {
			const fetchMock = vi.fn().mockImplementationOnce(first).mockResolvedValue(ok());
			vi.stubGlobal("fetch", fetchMock);
			prefetchProductionTouchpointDecisions([badge], "en-US");
			expect(await load()).toMatchObject({ kind: "decision", ageMs: 0 });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});
});
