import { touchpointOfflineReplayOf } from "@open-design/contracts/api/touchpointOffline";

export type ProductionRuntimeRevocationReceipt = Readonly<{
	touchpointDecisionId: string;
	deploymentId: string;
	activityId: string;
	contentVersionId: string;
}>;
export type ProductionTouchpointLoadResult =
	/**
	 * `offline` is true when the daemon rebuilt this decision from its own cache
	 * because the runtime was unreachable (OPEND-3436). The decision itself is
	 * the server's, timing included; what the flag says is only that nobody
	 * asked the server just now, so this client should stop asking too.
	 */
	| Readonly<{ kind: "decision"; value: unknown; offline: boolean }>
	| Readonly<{ kind: "no-decision" }>
	| Readonly<{ kind: "revoked"; receipt: ProductionRuntimeRevocationReceipt }>;

export class ProductionTouchpointLoadError extends Error {
	/**
	 * A 410 is the server's own withdrawal and must clear display authority even
	 * when its receipt body is unreadable. Every other failure is transport or
	 * protocol noise, which the shared lifecycle rides out on the existing lease.
	 */
	readonly touchpointWithdrawal: boolean;
	/**
	 * Whether this failure means the runtime was never reached, and the client
	 * may therefore go quiet and live off what the daemon already holds
	 * (OPEND-3436).
	 *
	 * Only two details qualify, and the exclusions are the interesting part. A
	 * 4xx is the server answering — a client that fell back on a 401 would keep
	 * a signed-out session's campaign on screen. `malformed_json` and
	 * `invalid_dto` are exclusions too: the bytes arrived, so the runtime was
	 * reached, and a body this client cannot read is a protocol defect rather
	 * than a licence to substitute a cached one.
	 */
	readonly touchpointOfflineFallback: boolean;
	/**
	 * Which KIND of unreachable this was, and therefore whether anything will
	 * announce its recovery.
	 *
	 * `network` is the device's own connection failing, and its repair fires
	 * `online`. A 5xx is not: the request crossed a network that stayed up the
	 * whole time and came back with an answer, so `navigator.onLine` never went
	 * false and no browser event will ever say the server is healthy again. That
	 * is the difference the shared lifecycle's heartbeat is keyed on — see
	 * `touchpointFallbackFromServerError` — and it is only ever read for a
	 * failure that already qualifies above.
	 */
	readonly touchpointServerError: boolean;
	constructor(readonly detail: string) {
		super("touchpoint_load_failed");
		this.touchpointWithdrawal = detail === "http_410";
		this.touchpointServerError = /^http_5\d\d$/u.test(detail);
		this.touchpointOfflineFallback = detail === "network" || this.touchpointServerError;
	}
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
		return { kind: "decision", value, offline: touchpointOfflineReplayOf(value) !== null };
	} catch (error) {
		if (error instanceof ProductionTouchpointLoadError) throw error;
		throw new ProductionTouchpointLoadError("malformed_json");
	}
}
export function emitProductionTouchpointLoadDiagnostic(error: unknown) { return error instanceof ProductionTouchpointLoadError ? { code: "touchpoint_load_failed", detail: error.detail } as const : null; }
