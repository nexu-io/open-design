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
}>;

type Clock = { monotonic: number; wall: number };
const clock = (): Clock => ({ monotonic: performance.now(), wall: Date.now() });
// A backwards wall-clock adjustment cannot grant time; a forward jump can only shorten it.
const elapsed = (start: Clock) => Math.max(0, performance.now() - start.monotonic, Date.now() - start.wall);
const POLL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TIMER_MS = 2_147_483_647;

/**
 * One scheduling implementation for both runtime adapters. A response supplies
 * server-relative authority, never a client activation time. Renewing the same
 * immutable decision keeps its mount identity while replacing its lease.
 */
export function useTouchpointLifecycle<T>({ enabled, identity, load, onError }: TouchpointLifecycleOptions<T>) {
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
			lease.current = null;
			++generation.current;
			publish();
		};
		clearRef.current = () => { revalidationLease = null; revoke(); };
		revoke();
		if (!enabled || !identity) return () => { stopped = true; revoke(); };

		const armExpiry = () => {
			clearTimeout(expiryTimer);
			const tick = () => {
				const current = lease.current;
				if (stopped || !current) return;
				const remaining = current.validForMs - elapsed(current.start);
				if (remaining <= 0) revoke();
				else expiryTimer = setTimeout(tick, Math.min(remaining, MAX_TIMER_MS));
			};
			tick();
		};
		const refresh = async () => {
			if (stopped || ended || request || document.hidden) return;
			const controller = new AbortController();
			const started = clock();
			request = controller;
			const ownsRequest = () => !stopped && request === controller && !controller.signal.aborted;
			timeout = setTimeout(() => {
				if (!ownsRequest()) return;
				status = "error";
				revalidationLease = null;
				revoke();
				inputs.current.onError?.(new Error("touchpoint_request_timeout"));
			}, REQUEST_TIMEOUT_MS);
			try {
				const result = await load(controller.signal, lease.current?.value ?? revalidationLease?.value ?? null);
				if (!ownsRequest()) return;
				clearTimeout(timeout);
				request = null;
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
					ended = result.ended === true;
					status = ended ? "ended" : null;
					revoke();
					return;
				}
				if (result.kind === "waiting") {
					revalidationLease = null;
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
				status = "error";
				revalidationLease = null;
				revoke();
				inputs.current.onError?.(error);
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
		void refresh();
		const interval = setInterval(() => void refresh(), POLL_MS);
		window.addEventListener("focus", focus);
		window.addEventListener("online", wake);
		window.addEventListener("pageshow", wake);
		window.addEventListener("offline", offline);
		document.addEventListener("visibilitychange", wake);
		return () => {
			stopped = true;
			revoke();
			clearInterval(interval);
			window.removeEventListener("focus", focus);
			window.removeEventListener("online", wake);
			window.removeEventListener("pageshow", wake);
			window.removeEventListener("offline", offline);
			document.removeEventListener("visibilitychange", wake);
		};
	}, [enabled, identity, load]);

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
