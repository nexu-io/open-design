import {
	touchpointOfflineReplayOf,
	type TouchpointOfflineReplay,
} from "@open-design/contracts/api/touchpointOffline";
import type { TouchpointOfflineRecovery } from "./touchpoint-lifecycle";

export type ProductionRuntimeRevocationReceipt = Readonly<{
	touchpointDecisionId: string;
	deploymentId: string;
	activityId: string;
	contentVersionId: string;
}>;
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
	| Readonly<{ kind: "decision"; value: unknown; offlineReplay: TouchpointOfflineReplay | null }>
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
		return { kind: "decision", value, offlineReplay: touchpointOfflineReplayOf(value) };
	} catch (error) {
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
