import type { TouchpointStaticAction } from "./touchpoint-static-actions";
import { touchpointStaticActionsMatch } from "./touchpoint-static-actions";
import {
	ensureWebTouchpointElement,
	emitWebTouchpointDiagnostic,
	hasWebTouchpointCloseControl,
	readWebTouchpointHostContext,
	verifyWebTouchpoint,
	webTouchpointContext,
	type WebTouchpointContent,
	type OpenDesignTouchpointElement,
} from "./touchpoint-component";

import { useCallback, useEffect, useRef, useState } from "react";

export type AuthorizationTiming = Readonly<{
	serverTime: string;
	endsAt: string;
	authorizationExpiresAt: string;
}>;

/** The server grants display authority; clients may only shorten it. */
export function resolveAuthorizationDeadline(timing: AuthorizationTiming, maximumLeaseMs: number, rejectOversizedAuthorization = false): number | null {
	const serverTime = Date.parse(timing.serverTime);
	const endsAt = Date.parse(timing.endsAt);
	const authorizationExpiresAt = Date.parse(timing.authorizationExpiresAt);
	if (!Number.isFinite(serverTime) || !Number.isFinite(endsAt) || !Number.isFinite(authorizationExpiresAt) || endsAt <= serverTime || (rejectOversizedAuthorization && (authorizationExpiresAt > serverTime + maximumLeaseMs || authorizationExpiresAt > endsAt))) return null;
	return Math.min(authorizationExpiresAt, endsAt, serverTime + maximumLeaseMs);
}

export type TouchpointLifecycleLoad<T> =
	| Readonly<{ kind: "decision"; value: T; key: string; validForMs: number }>
	| Readonly<{ kind: "waiting"; retryAfterMs: number }>
	| Readonly<{ kind: "retain" }>
	| Readonly<{ kind: "clear"; ended?: boolean }>;

type LifecycleStatus = "loading" | "before" | "active" | "ended" | "error" | null;
export type TouchpointLifecycleOptions<T> = Readonly<{
	enabled: boolean;
	identity: string | null;
	load: (signal: AbortSignal, active: T | null) => Promise<TouchpointLifecycleLoad<T>>;
	onError?: (error: unknown) => void;
	/**
	 * Opts a host into lease handoff: a host remounted at another page position
	 * under the same key and identity resumes the previous host's unexpired
	 * lease instead of waiting for a network round trip. See `HANDOFF_WINDOW_MS`.
	 */
	handoffKey?: string;
}>;

type Clock = { monotonic: number; wall: number };
const clock = (): Clock => ({ monotonic: performance.now(), wall: Date.now() });
// A backwards wall-clock adjustment cannot grant time; a forward jump can only shorten it.
const elapsed = (start: Clock) => Math.max(0, performance.now() - start.monotonic, Date.now() - start.wall);
const POLL_MS = 30_000;
/**
 * One refresh fetches a context and every enabled placement's content, so the
 * budget has to cover a whole round, not one request. A ten-second budget was
 * measured being exceeded by a real round (11.5s) whose placements all
 * succeeded, which abandoned a campaign that was working.
 *
 * It stays well under `POLL_MS` on purpose: a budget at or above the interval
 * would let a hung attempt swallow the next tick entirely.
 */
export const REQUEST_TIMEOUT_MS = 15_000;
/**
 * A failed attempt used to get its next chance from the fixed 30s tick, which
 * for a sixty-second lease lands exactly when that lease expires — one failure
 * put display on the edge of going blank with no chance to recover.
 *
 * These bounded retries cover FAST failures (transport error, 5xx, DNS), which
 * return in milliseconds and leave the whole budget intact. A slow failure that
 * burns the full timeout cannot be retried inside the lease, and should not be:
 * a lease the server will not renew in time is one that ought to lapse.
 */
export const RETRY_BACKOFF_MS = [1_000, 3_000] as const;
const MAX_TIMER_MS = 2_147_483_647;
/**
 * A released lease is handed to a remount only within this window. It covers a
 * page switch, not a later return: sign-out, route away and back after a pause,
 * or any other long gap goes back to the server. The handed-off lease keeps its
 * original start, so it can only shorten, never extend, display authority.
 */
export const HANDOFF_WINDOW_MS = 10_000;
type ReleasedLease = Readonly<{ identity: string; key: string; value: unknown; start: Clock; validForMs: number; releasedAt: Clock }>;
const releasedLeases = new Map<string, ReleasedLease>();

/** Drops every pending handoff so module state never crosses a test boundary. */
export function resetTouchpointLeaseHandoffs(): void {
	releasedLeases.clear();
}

/** Only a failure carrying the server's own withdrawal may end a live lease. */
const withdrawsDisplay = (error: unknown) =>
	typeof error === "object" && error !== null && (error as { touchpointWithdrawal?: unknown }).touchpointWithdrawal === true;

/**
 * One scheduling implementation for both runtime adapters. A response supplies
 * server-relative authority, never a client activation time. Renewing the same
 * immutable decision keeps its mount identity while replacing its lease.
 */
export function useTouchpointLifecycle<T>({ enabled, identity, load, onError, handoffKey }: TouchpointLifecycleOptions<T>) {
	const [state, setState] = useState<{ identity: string | null; current: T | null; generation: number; status: LifecycleStatus }>({ identity: null, current: null, generation: 0, status: null });
	const generation = useRef(0);
	const lease = useRef<{ identity: string; key: string; value: T; generation: number; start: Clock; validForMs: number } | null>(null);
	const inputs = useRef({ enabled, identity, onError });
	inputs.current = { enabled, identity, onError };
	const clearRef = useRef<() => void>(() => {});
	const clear = useCallback(() => clearRef.current(), []);
	const isCurrent = useCallback((expected: number) => {
		const current = lease.current;
		return Boolean(current && inputs.current.enabled && current.identity === inputs.current.identity && current.generation === expected && elapsed(current.start) < current.validForMs && !document.hidden);
	}, []);

	useEffect(() => {
		let stopped = false;
		let ended = false;
		// Suspend display during recovery; a no-decision reply may retain only the original, unextended lease.
		let revalidationLease: typeof lease.current = null;
		let request: AbortController | null = null;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let expiryTimer: ReturnType<typeof setTimeout> | undefined;
		let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let retryIndex = 0;
		/** When the current cycle began, so retries can be kept inside it. */
		let cycleStart: Clock | null = null;
		let status: LifecycleStatus = enabled && identity ? "loading" : null;
		const publish = () => {
			if (stopped) return;
			const next = { identity, current: lease.current?.value ?? null, generation: generation.current, status };
			setState(previous => previous.identity === next.identity && previous.current === next.current && previous.generation === next.generation && previous.status === next.status ? previous : next);
		};
		const cancelRequest = () => {
			request?.abort();
			request = null;
			clearTimeout(timeout);
		};
		const revoke = () => {
			cancelRequest();
			clearTimeout(expiryTimer);
			clearTimeout(boundaryTimer);
			clearTimeout(retryTimer);
			lease.current = null;
			++generation.current;
			publish();
		};
		/** Revocation, withdrawal, expiry and page recovery never hand a lease on. */
		const forget = () => {
			if (handoffKey) releasedLeases.delete(handoffKey);
		};
		/**
		 * A timeout or transport failure is not a revocation. Cancel the attempt
		 * and keep display authority the server already granted; `armExpiry`
		 * still retires it at its own deadline, so one poll may be missed and a
		 * second consecutive failure lets the lease lapse on its own. A lease
		 * already fenced by `wake` stays withdrawn: page recovery has no
		 * evidence the activity is still live.
		 */
		const abandonAttempt = (error: unknown) => {
			cancelRequest();
			if (withdrawsDisplay(error) || !lease.current || elapsed(lease.current.start) >= lease.current.validForMs) {
				revalidationLease = null;
				status = "error";
				forget();
				revoke();
			}
			// Scheduled after any revoke above, which clears the retry timer: an
			// authoritative withdrawal must not be retried back onto the screen.
			//
			// A retry must also finish inside the cycle that spawned it. `refresh`
			// declines to start while a request is in flight, so a chain that ran
			// past the next tick would not merely be late — it would swallow that
			// tick entirely. Requiring room for the retry AND its full budget is
			// what makes "retries cover fast failures" true in the code and not
			// only in this comment: a failure that burned the whole budget leaves
			// no room by construction, so it is never retried.
			const delay = RETRY_BACKOFF_MS[retryIndex] ?? 0;
			const remainingInCycle = cycleStart === null ? 0 : POLL_MS - elapsed(cycleStart);
			if (
				!withdrawsDisplay(error) &&
				retryIndex < RETRY_BACKOFF_MS.length &&
				delay + REQUEST_TIMEOUT_MS <= remainingInCycle
			) {
				retryIndex += 1;
				clearTimeout(retryTimer);
				retryTimer = setTimeout(() => void refresh(true), delay);
			}
			inputs.current.onError?.(error);
		};
		clearRef.current = () => { revalidationLease = null; forget(); revoke(); };
		revoke();
		if (!enabled || !identity) {
			forget();
			return () => { stopped = true; revoke(); };
		}

		const armExpiry = () => {
			clearTimeout(expiryTimer);
			const tick = () => {
				const current = lease.current;
				if (stopped || !current) return;
				const remaining = current.validForMs - elapsed(current.start);
				if (remaining <= 0) {
					forget();
					revoke();
				}
				else expiryTimer = setTimeout(tick, Math.min(remaining, MAX_TIMER_MS));
			};
			tick();
		};
		/**
		 * `retrying` distinguishes a scheduled retry from a fresh cycle. Only a
		 * fresh cycle restores the retry budget: without that, the first cycle to
		 * exhaust its retries would leave every later cycle with none.
		 */
		const refresh = async (retrying = false) => {
			if (stopped || ended || request || document.hidden) return;
			if (!retrying) {
				retryIndex = 0;
				cycleStart = clock();
				clearTimeout(retryTimer);
			}
			const controller = new AbortController();
			const started = clock();
			request = controller;
			const ownsRequest = () => !stopped && request === controller && !controller.signal.aborted;
			timeout = setTimeout(() => {
				if (!ownsRequest()) return;
				abandonAttempt(new Error("touchpoint_request_timeout"));
			}, REQUEST_TIMEOUT_MS);
			try {
				const result = await load(controller.signal, lease.current?.value ?? revalidationLease?.value ?? null);
				if (!ownsRequest()) return;
				clearTimeout(timeout);
				request = null;
				// A completed attempt restores the full retry budget for the next one.
				retryIndex = 0;
				clearTimeout(retryTimer);
				if (result.kind === "retain") {
					if (!lease.current && revalidationLease && elapsed(revalidationLease.start) < revalidationLease.validForMs) {
						lease.current = { ...revalidationLease, generation: generation.current };
						status = "active";
						publish();
						armExpiry();
					}
					revalidationLease = null;
					return;
				}
				if (result.kind === "clear") {
					revalidationLease = null;
					forget();
					ended = result.ended === true;
					status = ended ? "ended" : null;
					revoke();
					return;
				}
				if (result.kind === "waiting") {
					revalidationLease = null;
					forget();
					if (!Number.isFinite(result.retryAfterMs)) throw new Error("touchpoint_invalid_timing");
					status = "before";
					revoke();
					const retry = () => {
						if (stopped) return;
						const remaining = result.retryAfterMs - elapsed(started);
						if (remaining > MAX_TIMER_MS) boundaryTimer = setTimeout(retry, MAX_TIMER_MS);
						else boundaryTimer = setTimeout(() => void refresh(), Math.max(100, remaining));
					};
					retry();
					return;
				}
				status = "active";
				clearTimeout(boundaryTimer);
				if (!Number.isFinite(result.validForMs) || result.validForMs <= elapsed(started)) {
					revoke();
					return;
				}
				const previous = lease.current ?? revalidationLease;
				const same = previous?.key === result.key && previous.identity === identity && elapsed(previous.start) < previous.validForMs;
				if (!same) ++generation.current;
				lease.current = { identity, key: result.key, value: same ? previous.value : result.value, generation: generation.current, start: started, validForMs: result.validForMs };
				revalidationLease = null;
				publish();
				armExpiry();
			} catch (error) {
				if (stopped || controller.signal.aborted) return;
				abandonAttempt(error);
			} finally {
				if (request === controller) {
					request = null;
					clearTimeout(timeout);
				}
			}
		};
		const wake = () => {
			if (stopped || ended) return;
			revalidationLease = lease.current ?? revalidationLease;
			status = document.hidden ? status : "loading";
			forget();
			revoke();
			if (!document.hidden) void refresh();
		};
		// Ordinary window focus is not page recovery. A still-valid visible lease
		// keeps its mount while refreshing; hidden/pageshow/online still fence it.
		const focus = () => {
			if (stopped || ended) return;
			const current = lease.current;
			if (!document.hidden && current && elapsed(current.start) < current.validForMs) {
				void refresh();
			} else {
				wake();
			}
		};
		const offline = () => cancelRequest();
		const released = handoffKey ? releasedLeases.get(handoffKey) : undefined;
		if (handoffKey) releasedLeases.delete(handoffKey);
		if (
			released &&
			released.identity === identity &&
			elapsed(released.releasedAt) <= HANDOFF_WINDOW_MS &&
			elapsed(released.start) < released.validForMs &&
			!document.hidden
		) {
			++generation.current;
			lease.current = { identity, key: released.key, value: released.value as T, generation: generation.current, start: released.start, validForMs: released.validForMs };
			status = "active";
			publish();
			armExpiry();
		}
		void refresh();
		const interval = setInterval(() => void refresh(), POLL_MS);
		window.addEventListener("focus", focus);
		window.addEventListener("online", wake);
		window.addEventListener("pageshow", wake);
		window.addEventListener("offline", offline);
		document.addEventListener("visibilitychange", wake);
		return () => {
			const current = lease.current;
			if (handoffKey && current && current.identity === identity && elapsed(current.start) < current.validForMs && !document.hidden)
				releasedLeases.set(handoffKey, { identity: current.identity, key: current.key, value: current.value, start: current.start, validForMs: current.validForMs, releasedAt: clock() });
			stopped = true;
			revoke();
			clearTimeout(retryTimer);
			clearInterval(interval);
			window.removeEventListener("focus", focus);
			window.removeEventListener("online", wake);
			window.removeEventListener("pageshow", wake);
			window.removeEventListener("offline", offline);
			document.removeEventListener("visibilitychange", wake);
		};
	}, [enabled, handoffKey, identity, load]);

	return {
		current: enabled && state.identity === identity ? state.current : null,
		status: enabled && state.identity === identity ? state.status : null,
		generation: state.generation,
		clear,
		isCurrent,
		get deadline() {
			const current = lease.current;
			return current && inputs.current.enabled && current.identity === inputs.current.identity ? Date.now() + Math.max(0, current.validForMs - elapsed(current.start)) : 0;
		},
	};
}


type MountAdapter = Readonly<{
	content: WebTouchpointContent;
	placementKey: string;
	staticActions: readonly TouchpointStaticAction[];
	mode: "test" | "production";
	locale: string;
	isCurrent: () => boolean;
	dispatchAction: (id: string) => Promise<void>;
	requestClose?: () => void;
	onReady?: () => void;
	onVisible?: () => void;
	onCloseControlChange?: (available: boolean | null) => void;
	onError?: (code: string) => void;
}>;

/** Shared Test/Production host lifecycle. Late verification and mount completion
 * cannot resurrect a released host; each resource is disposed once. Adapters own
 * authorization, action transport and receipts, never the DOM lifecycle. */
export function mountTouchpoint(
	container: HTMLElement,
	adapter: MountAdapter,
): () => void {
	ensureWebTouchpointElement();
	const element = document.createElement(
		"opend-touchpoint",
	) as OpenDesignTouchpointElement;
	let cancelled = false,
		elementDisposed = false,
		verifiedDisposed = false;
	let verified: Awaited<ReturnType<typeof verifyWebTouchpoint>> | undefined;
	let frame: number | undefined;
	let mounted = false,
		recorded = false;
	let observer: MutationObserver | undefined;
	const current = () => !cancelled && adapter.isCurrent();
	const dispose = () => {
		if (!elementDisposed) {
			elementDisposed = true;
			void element.dispose(verified?.resourceUrls).catch(() => undefined);
		}
		if (verified && !verifiedDisposed) {
			verifiedDisposed = true;
			verified.dispose();
		}
	};
	const recordWhenVisible = () => {
		if (!mounted || recorded || frame !== undefined || !adapter.onVisible)
			return;
		frame = requestAnimationFrame(() => {
			frame = undefined;
			if (
				!current() ||
				document.hidden ||
				!element.isConnected ||
				element.hidden ||
				element.getClientRects().length === 0
			)
				return;
			recorded = true;
			adapter.onVisible?.();
		});
	};
	const fail = (code: string) => {
		emitWebTouchpointDiagnostic({ code });
		adapter.onCloseControlChange?.(false);
		adapter.onError?.(code);
	};
	adapter.onCloseControlChange?.(null);
	container.replaceChildren(element);
	document.addEventListener("visibilitychange", recordWhenVisible);
	void (async () => {
		try {
			verified = await verifyWebTouchpoint(adapter.content);
			if (!current()) {
				dispose();
				return;
			}
			const placement = adapter.content.manifest.placements.find(
				(p) => p.key === adapter.placementKey,
			);
			if (
				!placement ||
				adapter.content.placementKey !== adapter.placementKey ||
				!touchpointStaticActionsMatch(
					adapter.staticActions,
					placement.staticActions,
				)
			) {
				fail("touchpoint_decision_mismatch");
				dispose();
				return;
			}
			const context = webTouchpointContext(
				adapter.content,
				readWebTouchpointHostContext(
					adapter.locale,
					document.documentElement.classList.contains("dark")
						? "dark"
						: "light",
				),
			);
			if (!context) {
				fail("touchpoint_locale_unsupported");
				dispose();
				return;
			}
			await element.mount(
				verified.entryUrl,
				adapter.content.entryDigest,
				{ ...context, mode: adapter.mode },
				verified.resourceUrls,
				new Set(adapter.staticActions.map((a) => a.id)),
				{
					requestClose: adapter.requestClose
						? () => {
								if (current()) adapter.requestClose?.();
							}
						: undefined,
					dispatchAction: async (id) => {
						if (current()) await adapter.dispatchAction(id);
					},
					onDiagnostic: emitWebTouchpointDiagnostic,
				},
			);
			if (!current()) {
				dispose();
				return;
			}
			mounted = true;
			if (adapter.onCloseControlChange) {
				const update = () => {
					if (current())
						adapter.onCloseControlChange?.(
							hasWebTouchpointCloseControl(element),
						);
				};
				update();
				observer = new MutationObserver(update);
				const options: MutationObserverInit = {
					attributes: true,
					attributeFilter: [
						"aria-label",
						"aria-disabled",
						"aria-hidden",
						"class",
						"disabled",
						"hidden",
						"style",
						"title",
					],
					childList: true,
					characterData: true,
					subtree: true,
				};
				if (element.shadowRoot) observer.observe(element.shadowRoot, options);
				const dialog = element.closest('[role="dialog"]');
				if (dialog) observer.observe(dialog, options);
			}
			adapter.onReady?.();
			recordWhenVisible();
		} catch (error) {
			if (current())
				fail(error instanceof Error ? error.message : "touchpoint_load_failed");
			dispose();
		}
	})();
	return () => {
		cancelled = true;
		observer?.disconnect();
		document.removeEventListener("visibilitychange", recordWhenVisible);
		if (frame !== undefined) cancelAnimationFrame(frame);
		adapter.onCloseControlChange?.(null);
		dispose();
		if (element.parentNode === container) container.replaceChildren();
	};
}
