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

	// OPEND-3375, the client half. Vela answers a request that carries an
	// `activeDecisionId` for a deployment that has been taken down with
	// `410 production_runtime_withdrawn` and NO receipt — byte-identical in shape
	// to a rollout withdrawal that cannot name a receipt.
	//
	// The client already does the right thing with it, because the receipt parse
	// is what decides: anything that does not produce all four fields becomes an
	// `http_410`, and `http_410` is the one detail that sets `touchpointWithdrawal`.
	// This case exists to pin that, not to fix it — a 410 the client cannot read a
	// receipt out of must never be softened into "transport noise the lease rides
	// out", which is what every other failure is.
	it("OPEND-3375: withdraws display on a 410 whose body carries no readable receipt", async () => {
		const signal = new AbortController().signal;
		const bodies = [
			// What OPEND-3375 makes Vela send for a withdrawn deployment.
			JSON.stringify({ error: "production_runtime_withdrawn" }),
			// The rollout withdrawal it is deliberately shaped like.
			JSON.stringify({ error: "production_runtime_revoked" }),
			// And the degenerate cases, which must not be treated any differently.
			JSON.stringify({ error: "production_runtime_revoked", receipt: null }),
			"",
		];
		for (const body of bodies) {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 410 })));
			const failure = await loadProductionTouchpointDecision(
				"opend.home.campaign-modal",
				"en-US",
				signal,
				"decision-1",
			).then(() => null, (error: unknown) => error);
			expect(failure, `410 body ${JSON.stringify(body)} must withdraw display`).toBeInstanceOf(ProductionTouchpointLoadError);
			expect(failure).toMatchObject({
				detail: "http_410",
				// The flag `withdrawsDisplay` reads in the shared lifecycle: this is
				// the only failure allowed to end a lease the server already granted.
				touchpointWithdrawal: true,
			});
		}
	});

	it("does not translate an abort into a load diagnostic", async () => {
		const abort = new DOMException("aborted", "AbortError");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
		await expect(loadProductionTouchpointDecision("opend.home.account-badge", "en-US", new AbortController().signal)).rejects.toBe(abort);
	});
});
