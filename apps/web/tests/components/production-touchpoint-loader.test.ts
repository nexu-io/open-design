// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionTouchpointLoadError, loadProductionTouchpointDecision } from "../../src/components/production-touchpoint-loader";

afterEach(() => vi.unstubAllGlobals());
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
});
