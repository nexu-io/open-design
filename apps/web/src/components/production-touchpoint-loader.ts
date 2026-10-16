import { parseTouchpointLoadMetrics, touchpointUtf8Bytes, TOUCHPOINT_LOAD_METRICS_HEADER } from "@open-design/contracts/api/touchpointLoadResults";
import { touchpointClientResourceSizes, touchpointResponseFailure, type TouchpointLoadOwner } from "./touchpoint-load-observability";
import {
	touchpointOfflineReplayOf,
	touchpointRevocationReceiptOf,
	type TouchpointRevocationReceipt,
	type TouchpointOfflineReplay,
} from "@open-design/contracts/api/touchpointOffline";
import type { TouchpointOfflineRecovery } from "./touchpoint-lifecycle";

export type ProductionRuntimeRevocationReceipt = TouchpointRevocationReceipt;
export type ProductionTouchpointLoadResult =
	/**
	 * `offlineReplay` is the daemon's own marker, carried up whole rather than
	 * reduced to a flag (OPEND-3436). The decision itself is the server's,
	 * timing included; what the marker says is that nobody asked the runtime
	 * just now — and, in `reason`, what stopped them.
	 *
	 * That reason is not decoration. Reducing it to "offline: true" lost the
	 * only fact a caller needs in order to decide whether anything will tell it
	 * when to start asking again, and a client that stopped asking with no way
	 * to find out kept a withdrawn activity on screen for the rest of the
	 * schedule. {@link productionTouchpointRecovery} is where it is decided.
	 */
	| Readonly<{ kind: "decision"; value: unknown; receivedAt?: number; offlineReplay: TouchpointOfflineReplay | null }>
	| Readonly<{ kind: "no-decision" }>
	| Readonly<{ kind: "revoked"; receipt: ProductionRuntimeRevocationReceipt }>;

/**
 * An explicit authentication or authorization refusal from the decision
 * endpoint. It is an answer, never an outage: it neither enters offline
 * fallback nor lets an earlier grant ride it out.
 */
const touchpointAuthorizationRefused = (detail: string) => detail === "http_401" || detail === "http_403";

export class ProductionTouchpointLoadError extends Error {
	/**
	 * Whether this failure ends display authority outright, as the server's
	 * own withdrawal does.
	 *
	 * A 410 is that withdrawal and must clear display even when its receipt
	 * body is unreadable. A 401 or 403 is the same kind of answer about the
	 * ACCOUNT rather than the activity (OPEND-3436 AC9): the server has refused
	 * this session, so nothing it granted earlier — least of all a lease the
	 * offline fallback stretched to `endsAt` — may keep that session's campaign
	 * on screen. Treating it as "try again later" is what let a rejected
	 * account keep displaying from cache. See {@link touchpointAuthorizationRefused}.
	 *
	 * Every other failure is transport or protocol noise, which the shared
	 * lifecycle rides out on the existing lease.
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
		this.touchpointWithdrawal = detail === "http_410" || touchpointAuthorizationRefused(detail);
		this.touchpointServerError = /^http_5\d\d$/u.test(detail);
		this.touchpointOfflineFallback = detail === "network" || this.touchpointServerError;
	}
}

/** Loads a production decision; only a server-authenticated 410 receipt revokes an active lease. */
export async function loadProductionTouchpointDecision(placementKey: string, locale: string, signal: AbortSignal, activeDecisionId?: string, observation?: TouchpointLoadOwner): Promise<ProductionTouchpointLoadResult> {
	const observed = observation?.begin(placementKey);
	let response: Response;
	try {
		const query = new URLSearchParams({ placementKey, locale, emptyResponse: "200" });
		if (activeDecisionId) query.set("activeDecisionId", activeDecisionId);
		response = await fetch(`/api/touchpoints/production-runtime?${query}`, { cache: "no-store", signal });
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") throw error;
		if (observed) observation?.failure(observed, new ProductionTouchpointLoadError("network"));
		throw new ProductionTouchpointLoadError("network");
	}
	if (signal.aborted) throw new DOMException("aborted", "AbortError");
	if (response.status === 404) { if (observed) observation?.empty(observed, "no_activity"); return { kind: "no-decision" }; }
	if (response.status === 410) {
		try {
			const parsed = touchpointRevocationReceiptOf(await response.json());
			if (!parsed) throw new ProductionTouchpointLoadError("http_410");
			// A valid receipt can name an unrelated grant; the host applies the
			// exact binding check before retiring its visible attempt with the lease.
			if (!activeDecisionId) observation?.cancel("revoked");
			return { kind: "revoked", receipt: parsed };
		} catch (error) {
			observation?.cancel("revoked");
			if (error instanceof ProductionTouchpointLoadError) throw error;
			throw new ProductionTouchpointLoadError("http_410");
		}
	}
	if (!response.ok) {
		const error = Object.assign(new ProductionTouchpointLoadError(`http_${String(response.status).slice(0, 3)}`), await touchpointResponseFailure(response));
		if (observed) observation?.failure(observed, error);
		if (error.touchpointWithdrawal) observation?.cancel("revoked");
		throw error;
	}
	try {
		const bodyStarted = performance.now();
		let value: unknown;
		let decodeMs: number | null = null;
		let localBytes: number | null = null;
		if (typeof response.text === "function") {
			const text = await response.text();
			localBytes = touchpointUtf8Bytes(text);
			const decodeStarted = performance.now();
			value = JSON.parse(text); decodeMs = Math.max(0, performance.now() - decodeStarted);
		} else value = await response.json();
		if (signal.aborted) throw new DOMException("aborted", "AbortError");
		const localMs = Math.max(0, performance.now() - bodyStarted - (decodeMs ?? 0));
		if (value && typeof value === "object" && !Array.isArray(value) && "decision" in value && value.decision === null) { if (observed) observation?.empty(observed, "no_activity"); return { kind: "no-decision" }; }
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProductionTouchpointLoadError("invalid_dto");
		if (observed) {
			observation?.decision(placementKey, observed, value, parseTouchpointLoadMetrics(response.headers?.get(TOUCHPOINT_LOAD_METRICS_HEADER)), { ...touchpointClientResourceSizes(value), local_transfer_ms: typeof response.text === "function" ? localMs : null, local_response_bytes: localBytes, decode_validate_ms: decodeMs, ...(touchpointOfflineReplayOf(value) ? { cache_source: "offline_fallback" as const, cache_hit: true, public_transfer_ms: null, resource_read_ms: null, public_response_bytes: null, public_base64_bytes: null } : {}) });
		}
		return { kind: "decision", value, receivedAt: Date.now(), offlineReplay: touchpointOfflineReplayOf(value) };
	} catch (error) {
		if (signal.aborted) throw error;
		if (observed) observation?.failure(observed, error instanceof ProductionTouchpointLoadError ? error : new Error("decode_error"));
		if (error instanceof ProductionTouchpointLoadError) throw error;
		throw new ProductionTouchpointLoadError("malformed_json");
	}
}
/**
 * What a replay means for recovery: will anything announce the end of it?
 *
 * For every reason the daemon can give the answer is no, and the argument is
 * the same one each time and does not turn on the reason at all — which is
 * exactly why it has to be written down rather than assumed. A replayed body
 * ARRIVED. It crossed this browser's own connection to the daemon and came
 * back 200, which proves that connection is working. Both reasons name
 * something on the far side of the daemon — the runtime answering 5xx
 * (`upstream_unavailable`), or the daemon's own DNS, connect or timeout to it
 * failing (`upstream_unreachable`) — and that far side is invisible from here.
 * `navigator.onLine` never goes false, so `online` cannot fire, and a user who
 * stays on the page fires nothing else either.
 *
 * The switch is exhaustive on purpose. A third reason added upstream will not
 * compile until somebody rules on it, which is the only thing keeping this a
 * decision rather than a constant that happens to be right today. The fallback
 * is the conservative direction — keep asking — because being wrong that way
 * costs one request every few minutes, and being wrong the other way costs a
 * withdrawn campaign nobody can take off the screen.
 */
export function productionTouchpointRecovery(replay: TouchpointOfflineReplay | null): TouchpointOfflineRecovery | null {
	if (!replay) return null;
	switch (replay.reason) {
		case "upstream_unavailable":
		case "upstream_unreachable":
			return "unannounced";
		default: {
			const unruled: never = replay.reason;
			void unruled;
			return "unannounced";
		}
	}
}

/**
 * The recovery policy for a placement assembled from TWO decisions.
 *
 * Both halves, not either: one live half proves the runtime answered, so the
 * pair is still worth polling — polling too often costs a request, polling too
 * seldom costs a campaign that misses a schedule change. When both are
 * replayed, the pair takes the more conservative of the two policies, for the
 * same reason the switch above defaults that way.
 */
export const productionTouchpointPairRecovery = (
	entry: TouchpointOfflineRecovery | null,
	layer: TouchpointOfflineRecovery | null,
): TouchpointOfflineRecovery | null =>
	entry === null || layer === null ? null : entry === "unannounced" || layer === "unannounced" ? "unannounced" : "announced";

export function emitProductionTouchpointLoadDiagnostic(error: unknown) { return error instanceof ProductionTouchpointLoadError ? { code: "touchpoint_load_failed", detail: error.detail } as const : null; }
