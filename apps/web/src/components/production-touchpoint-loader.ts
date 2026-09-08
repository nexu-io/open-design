export type ProductionRuntimeRevocationReceipt = Readonly<{
	touchpointDecisionId: string;
	deploymentId: string;
	activityId: string;
	contentVersionId: string;
}>;
export type ProductionTouchpointLoadResult =
	| Readonly<{ kind: "decision"; value: unknown }>
	| Readonly<{ kind: "no-decision" }>
	| Readonly<{ kind: "revoked"; receipt: ProductionRuntimeRevocationReceipt }>;

export class ProductionTouchpointLoadError extends Error {
	constructor(readonly detail: string) { super("touchpoint_load_failed"); }
}

function receipt(value: unknown): ProductionRuntimeRevocationReceipt | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Partial<ProductionRuntimeRevocationReceipt>;
	return typeof candidate.touchpointDecisionId === "string" && typeof candidate.deploymentId === "string" && typeof candidate.activityId === "string" && typeof candidate.contentVersionId === "string" ? candidate as ProductionRuntimeRevocationReceipt : null;
}

/** Loads a production decision; only a server-authenticated 410 receipt revokes an active lease. */
export async function loadProductionTouchpointDecision(placementKey: string, locale: string, signal: AbortSignal, activeDecisionId?: string): Promise<ProductionTouchpointLoadResult> {
	let response: Response;
	try {
		const query = new URLSearchParams({ placementKey, locale });
		if (activeDecisionId) query.set("activeDecisionId", activeDecisionId);
		response = await fetch(`/api/touchpoints/production-runtime?${query}`, { cache: "no-store", signal });
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") throw error;
		throw new ProductionTouchpointLoadError("network");
	}
	if (response.status === 404) return { kind: "no-decision" };
	if (response.status === 410) {
		try {
			const body = await response.json() as { error?: unknown; receipt?: unknown };
			const parsed = body.error === "production_runtime_revoked" ? receipt(body.receipt) : null;
			if (!parsed) throw new ProductionTouchpointLoadError("http_410");
			return { kind: "revoked", receipt: parsed };
		} catch (error) {
			if (error instanceof ProductionTouchpointLoadError) throw error;
			throw new ProductionTouchpointLoadError("http_410");
		}
	}
	if (!response.ok) throw new ProductionTouchpointLoadError(`http_${String(response.status).slice(0, 3)}`);
	try {
		const value: unknown = await response.json();
		if (!value || typeof value !== "object") throw new ProductionTouchpointLoadError("invalid_dto");
		return { kind: "decision", value };
	} catch (error) {
		if (error instanceof ProductionTouchpointLoadError) throw error;
		throw new ProductionTouchpointLoadError("malformed_json");
	}
}
export function emitProductionTouchpointLoadDiagnostic(error: unknown) { return error instanceof ProductionTouchpointLoadError ? { code: "touchpoint_load_failed", detail: error.detail } as const : null; }
