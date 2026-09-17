import { AMR_LOGIN_STATUS_EVENT } from "./amrLoginPolling";

export type ProductionRuntimeRevocationReceipt = Readonly<{
	touchpointDecisionId: string;
	deploymentId: string;
	activityId: string;
	contentVersionId: string;
}>;
export type ProductionTouchpointLoadResult =
	/** `ageMs` is how long a prefetched response waited; callers subtract it from the lease. */
	| Readonly<{ kind: "decision"; value: unknown; ageMs: number }>
	| Readonly<{ kind: "no-decision" }>
	| Readonly<{ kind: "revoked"; receipt: ProductionRuntimeRevocationReceipt }>;

export class ProductionTouchpointLoadError extends Error {
	/**
	 * A 410 is the server's own withdrawal and must clear display authority even
	 * when its receipt body is unreadable. Every other failure is transport or
	 * protocol noise, which the shared lifecycle rides out on the existing lease.
	 */
	readonly touchpointWithdrawal: boolean;
	constructor(readonly detail: string) {
		super("touchpoint_load_failed");
		this.touchpointWithdrawal = detail === "http_410";
	}
}

function receipt(value: unknown): ProductionRuntimeRevocationReceipt | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Partial<ProductionRuntimeRevocationReceipt>;
	return typeof candidate.touchpointDecisionId === "string" && typeof candidate.deploymentId === "string" && typeof candidate.activityId === "string" && typeof candidate.contentVersionId === "string" ? candidate as ProductionRuntimeRevocationReceipt : null;
}

const PREFETCH_TTL_MS = 15_000;
const prefetched = new Map<string, Readonly<{ locale: string; startedAt: number; response: Promise<Response | null> }>>();
const discardPrefetched = () => prefetched.clear();

/**
 * Cold-start timing only: sends the first decision request beside the login
 * status instead of after it. It grants nothing — hosts still wait for their
 * own authentication gates, and a login status change discards every unused
 * response. A prefetch is reused once, for the same placement and locale;
 * a signed-out (401) or failed one is asked again, while a signed-in answer —
 * including 404 "no campaign" — is final, so the host never pays two trips.
 */
export function prefetchProductionTouchpointDecisions(placementKeys: readonly string[], locale: string): void {
	window.removeEventListener(AMR_LOGIN_STATUS_EVENT, discardPrefetched);
	window.addEventListener(AMR_LOGIN_STATUS_EVENT, discardPrefetched, { once: true });
	for (const placementKey of placementKeys) {
		const query = new URLSearchParams({ placementKey, locale });
		const response = fetch(`/api/touchpoints/production-runtime?${query}`, { cache: "no-store" }).catch(() => null);
		prefetched.set(placementKey, { locale, startedAt: performance.now(), response });
	}
}

/** A load aborted while waiting leaves the prefetch for its retry; only the load that reads it consumes it. */
async function takePrefetched(placementKey: string, locale: string, signal: AbortSignal, activeDecisionId?: string) {
	const entry = prefetched.get(placementKey);
	// Monotonic: a wall clock stepping back must not extend the TTL or the lease.
	if (!entry || activeDecisionId || entry.locale !== locale || performance.now() - entry.startedAt > PREFETCH_TTL_MS) {
		prefetched.delete(placementKey);
		return null;
	}
	const response = await entry.response;
	if (signal.aborted || prefetched.get(placementKey) !== entry) return null;
	prefetched.delete(placementKey);
	return response && response.status !== 401 ? { response, ageMs: performance.now() - entry.startedAt } : null;
}

/** Loads a production decision; only a server-authenticated 410 receipt revokes an active lease. */
export async function loadProductionTouchpointDecision(placementKey: string, locale: string, signal: AbortSignal, activeDecisionId?: string): Promise<ProductionTouchpointLoadResult> {
	let response: Response;
	let ageMs = 0;
	try {
		// Without a pending prefetch the request starts synchronously, exactly as before.
		const reused = prefetched.has(placementKey) ? await takePrefetched(placementKey, locale, signal, activeDecisionId) : null;
		if (signal.aborted) throw new DOMException("aborted", "AbortError");
		const query = new URLSearchParams({ placementKey, locale });
		if (activeDecisionId) query.set("activeDecisionId", activeDecisionId);
		ageMs = reused?.ageMs ?? 0;
		response = reused?.response ?? await fetch(`/api/touchpoints/production-runtime?${query}`, { cache: "no-store", signal });
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
		return { kind: "decision", value, ageMs };
	} catch (error) {
		if (error instanceof ProductionTouchpointLoadError) throw error;
		throw new ProductionTouchpointLoadError("malformed_json");
	}
}
export function emitProductionTouchpointLoadDiagnostic(error: unknown) { return error instanceof ProductionTouchpointLoadError ? { code: "touchpoint_load_failed", detail: error.detail } as const : null; }
