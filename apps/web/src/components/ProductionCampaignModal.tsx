import { readCampaignHostLocale } from "./TestCampaignModal";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@open-design/components";
import { getOpenDesignHost } from "@open-design/host";
import { openExternalUrl } from "../providers/registry";
import {
	touchpointStaticActionsMatch,
	type TouchpointStaticAction,
} from "./touchpoint-static-actions";
import {
	emitWebTouchpointDiagnostic,
	ensureWebTouchpointElement,
	readWebTouchpointHostContext,
	lockWebTouchpointModalScroll,
	supportsWebTouchpointCapabilities,
	trapWebTouchpointModalFocus,
	verifyWebTouchpoint,
	webTouchpointContext,
	type OpenDesignTouchpointElement,
	type WebTouchpointContent,
} from "./touchpoint-component";
import { emitProductionTouchpointLoadDiagnostic, loadProductionTouchpointDecision } from "./production-touchpoint-loader";
import {
	TestTouchpointMount,
	recordVisibleTestTouchpoint,
	useTestRuntime,
} from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import styles from "./TestCampaignModal.module.css";
const PLACEMENT = "opend.home.campaign-modal";
const MAX_LEASE_MS = 5 * 60_000;
const supportedCapabilities = new Set(["close", "static-action"]);

type Decision = {
	activityId: string;
	authorizationExpiresAt: string;
	touchpointDecisionId: string;
	deploymentId: string;
	endsAt: string;
	placementKey: string;
	serverTime: string;
	requiredCapabilities: string[];
	staticActions: TouchpointStaticAction[];
	content: WebTouchpointContent;
};
const closedKey = (subject: string, activity: string) =>
	`touchpoint-closed:${subject}:${activity}`;

/**
 * Parses an internal action at execution time. Browser URL normalization treats
 * backslashes as hierarchy separators, so manifest validation alone cannot be
 * the origin boundary.
 */
export function internalActionNavigationUrl(
	path: unknown,
	href = window.location.href,
): URL | null {
	if (typeof path !== "string") return null;
	try {
		const origin = new URL(href).origin;
		const target = new URL(path, href);
		return target.origin === origin ? target : null;
	} catch {
		return null;
	}
}

/** Performs a server-validated click before the host consumes a static target. */
export async function dispatchProductionCampaignAction(
	decision: Decision,
	actionId: string,
	generation: number,
	currentGeneration: () => number,
	expiresAt: number,
): Promise<boolean> {
	const action = decision.staticActions.find(
		(candidate) => candidate.id === actionId,
	);
	const internalTarget =
		action?.target.kind === "internal"
			? internalActionNavigationUrl(action.target.path)
			: undefined;
	if (
		!action ||
		(action.target.kind === "internal" && !internalTarget) ||
		generation !== currentGeneration() ||
		expiresAt <= Date.now() ||
		!navigator.userActivation?.isActive
	) {
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_denied",
			detail: actionId,
		});
		return false;
	}
	try {
		const response = await fetch("/api/touchpoints/production-runtime/events", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				touchpointDecisionId: decision.touchpointDecisionId,
				activityId: decision.activityId,
				placementKey: decision.placementKey,
				eventId: crypto.randomUUID(),
				kind: "click",
			}),
		});
		if (
			!response.ok ||
			generation !== currentGeneration() ||
			expiresAt <= Date.now()
		) {
			emitWebTouchpointDiagnostic({
				code: "touchpoint_action_denied",
				detail: actionId,
			});
			return false;
		}
		if (action.target.kind === "https")
			await openExternalUrl(action.target.url);
		else if (internalTarget) window.location.assign(internalTarget.href);
	else return false;
		return true;
	} catch {
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_denied",
			detail: actionId,
		});
		return false;
	}
}
/** Production v2 modal shares the Test adapter; it does not fall back to a frame when bytes or runtime identity fail. */
type AuthorizedDecision = Decision & {
	authorizationDeadline: number;
	sessionSubject: string;
};
export function ProductionCampaignModal({
	authenticated,
	sessionSubject,
}: {
	authenticated: boolean;
	sessionSubject: string | null;
}) {
	const [decision, setDecision] = useState<AuthorizedDecision | null>(null);
	const testRuntime = useTestRuntime();
	const testDecision = testRuntime?.decisions.get(PLACEMENT);
	const [testClosed, setTestClosed] = useState(false);
	const decisionRef = useRef<AuthorizedDecision | null>(null);
	const [closed, setClosed] = useState(false);
	const elementRef = useRef<HTMLDivElement | null>(null);
	const modalRef = useRef<HTMLDivElement | null>(null);
	const expiry = useRef(0);
	const requestGeneration = useRef(0);
	const authorizationGeneration = useRef(0);
	const leaseGeneration = useRef(0);
	const restoreFocus = useRef<HTMLElement | null>(null);
	const clear = useCallback(() => {
		expiry.current = 0;
		++requestGeneration.current;
		++authorizationGeneration.current;
		++leaseGeneration.current;
		decisionRef.current = null;
		setDecision(null);
	}, []);
	useEffect(() => {
		ensureWebTouchpointElement();
	}, []);
	useEffect(() => {
		const locale = readCampaignHostLocale();
		if (testRuntime) {
			clear();
			return;
		}
		if (
			!authenticated ||
			!sessionSubject ||
			getOpenDesignHost()?.client.type !== "desktop" ||
			!locale
		) {
			clear();
			return;
		}
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const controller = new AbortController();
		const subject = sessionSubject;
		const requestGenerationRef = requestGeneration;
		const current = (requestGeneration: number) =>
			!cancelled &&
			requestGeneration === requestGenerationRef.current &&
			authenticated &&
			sessionSubject === subject;
		const decide = async () => {
			const nextRequestGeneration = ++requestGeneration.current;
			try {
				const loaded = await loadProductionTouchpointDecision(
					PLACEMENT, locale, controller.signal, decisionRef.current?.touchpointDecisionId,
				);
				if (!current(nextRequestGeneration)) return;
				if (loaded.kind === "revoked") {
					const active = decisionRef.current;
					if (active && loaded.receipt.touchpointDecisionId === active.touchpointDecisionId && loaded.receipt.deploymentId === active.deploymentId && loaded.receipt.activityId === active.activityId && loaded.receipt.contentVersionId === active.content.id) clear();
					return;
				}
				if (loaded.kind === "no-decision") { if (!decisionRef.current) clear(); return; }
				const next = loaded.value as Decision;
				if (!current(nextRequestGeneration)) return;
				const deadline = Math.min(
					Date.parse(next.authorizationExpiresAt),
					Date.parse(next.endsAt),
					Date.parse(next.serverTime) + MAX_LEASE_MS,
				);
				if (
					!next.activityId ||
					next.placementKey !== PLACEMENT ||
					next.content?.placementKey !== PLACEMENT ||
					!Number.isFinite(deadline) ||
					deadline <= Date.now() ||
					sessionStorage.getItem(closedKey(subject, next.activityId))
				) {
					if (
						next.placementKey !== PLACEMENT ||
						next.content?.placementKey !== PLACEMENT
					)
						emitWebTouchpointDiagnostic({
							code: "touchpoint_decision_mismatch",
						});
					clear();
					return;
				}
				if (
					!supportsWebTouchpointCapabilities(
						next.content,
						next.requiredCapabilities,
						supportedCapabilities,
					)
				) {
					emitWebTouchpointDiagnostic({
						code: "touchpoint_capability_unsupported",
						detail: next.requiredCapabilities?.join(","),
					});
					clear();
					return;
				}
				if (expiry.current > Date.now()) return;
				// Revoke the old mount and cancel its lease timer before scheduling React's replacement cleanup.
				++authorizationGeneration.current;
				const nextLeaseGeneration = ++leaseGeneration.current;
				if (timer) clearTimeout(timer);
				expiry.current = deadline;
				const authorized = {
					...next,
					authorizationDeadline: deadline,
					sessionSubject: subject,
				} as AuthorizedDecision;
				decisionRef.current = authorized;
				setDecision(authorized);
				timer = setTimeout(
					() => {
						if (leaseGeneration.current === nextLeaseGeneration) clear();
					},
					Math.max(0, deadline - Date.now()),
				);
			} catch (error) {
				if (!current(nextRequestGeneration) || (error instanceof DOMException && error.name === "AbortError")) return;
				const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
				if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
				clear();
			}
		};
		void decide();
		const wake = () => {
			if (!document.hidden) void decide();
		};
		window.addEventListener("focus", wake);
		window.addEventListener("online", wake);
		return () => {
			cancelled = true;
			controller.abort();
			if (timer) clearTimeout(timer);
			window.removeEventListener("focus", wake);
			window.removeEventListener("online", wake);
			clear();
		};
	}, [authenticated, sessionSubject, testRuntime]);
	useEffect(() => {
		const container = elementRef.current;
		if (
			!container ||
			!decision ||
			!authenticated ||
			decision.sessionSubject !== sessionSubject
		)
			return;
		let cancelled = false;
		const mountGeneration = ++authorizationGeneration.current;
		const current = () =>
			!cancelled &&
			mountGeneration === authorizationGeneration.current &&
			authenticated &&
			decision.sessionSubject === sessionSubject;
		let verified: Awaited<ReturnType<typeof verifyWebTouchpoint>> | undefined;
		const element = document.createElement(
			"opend-touchpoint",
		) as OpenDesignTouchpointElement;
		let elementDisposed = false;
		let verifiedDisposed = false;
		const disposeElement = () => {
			if (elementDisposed) return;
			elementDisposed = true;
			void element.dispose(verified?.resourceUrls).catch(() => undefined);
		};
		const disposeVerified = () => {
			if (!verified || verifiedDisposed) return;
			verifiedDisposed = true;
			verified.dispose();
		};
		const dispose = () => {
			disposeElement();
			disposeVerified();
		};
		container.replaceChildren(element);
		void (async () => {
			try {
				verified = await verifyWebTouchpoint(decision.content);
				if (elementDisposed) disposeVerified();
				if (!current()) {
					dispose();
					return;
				}
				const manifestPlacement = decision.content.manifest.placements.find(
					(placement) => placement.key === PLACEMENT,
				);
				if (
					!manifestPlacement ||
					manifestPlacement.key !== PLACEMENT ||
					!touchpointStaticActionsMatch(
						decision.staticActions,
						manifestPlacement.staticActions,
					)
				) {
					emitWebTouchpointDiagnostic({ code: "touchpoint_decision_mismatch" });
					dispose();
					clear();
					return;
				}
				const context = webTouchpointContext(
					decision.content,
					readWebTouchpointHostContext(
						decision.content.locale,
						document.documentElement.classList.contains("dark")
							? "dark"
							: "light",
					),
				);
				if (!current() || !context) {
					dispose();
					if (current() && !context)
						emitWebTouchpointDiagnostic({
							code: "touchpoint_locale_unsupported",
						});
					return;
				}
				await element.mount(
					verified.entryUrl,
					decision.content.entryDigest,
					{ ...context, mode: "production" },
					verified.resourceUrls,
					new Set(decision.staticActions.map((action) => action.id)),
					{
						requestClose: () => setClosed(true),
						dispatchAction: async (id) => {
							await dispatchProductionCampaignAction(
								decision,
								id,
								mountGeneration,
								() => authorizationGeneration.current,
								decision.authorizationDeadline,
							);
						},
						onDiagnostic: emitWebTouchpointDiagnostic,
					},
				);
				if (!current()) dispose();
			} catch (error) {
				if (current()) {
					emitWebTouchpointDiagnostic({
						code:
							error instanceof Error ? error.message : "touchpoint_load_failed",
					});
					clear();
				}
				dispose();
			}
		})();
		return () => {
			cancelled = true;
			++authorizationGeneration.current;
			dispose();
			container.replaceChildren();
		};
	}, [authenticated, decision, sessionSubject]);
	useEffect(() => {
		if (!decision) return;
		restoreFocus.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const releaseScrollLock = lockWebTouchpointModalScroll();
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") setClosed(true);
			else trapWebTouchpointModalFocus(event, modalRef.current);
		};
		document.addEventListener("keydown", key);
		queueMicrotask(() =>
			modalRef.current?.querySelector<HTMLElement>("button")?.focus(),
		);
		return () => {
			document.removeEventListener("keydown", key);
			releaseScrollLock();
			restoreFocus.current?.focus();
		};
	}, [decision]);
	useEffect(() => {
		if (!closed || !decision || !sessionSubject) return;
		sessionStorage.setItem(closedKey(sessionSubject, decision.activityId), "1");
		clear();
		setClosed(false);
	}, [closed, decision, sessionSubject]);
	useEffect(() => {
		if (!testDecision || testClosed || !authenticated) return;
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const releaseScrollLock = lockWebTouchpointModalScroll();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setTestClosed(true);
			else trapWebTouchpointModalFocus(event, modalRef.current);
		};
		document.addEventListener("keydown", onKeyDown);
		queueMicrotask(() => modalRef.current?.querySelector<HTMLElement>("button")?.focus());
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			releaseScrollLock();
			previous?.focus();
		};
	}, [authenticated, testClosed, testDecision]);
	useEffect(() => {
		if (!testDecision) setTestClosed(false);
	}, [testDecision]);
	const closeTestModal = useCallback(() => setTestClosed(true), []);
	const onTestVisible = useCallback(
		(next: TestDecision, placementKey: TestCampaignPlacement) => {
			if (testRuntime) recordVisibleTestTouchpoint(testRuntime, next, placementKey);
		},
		[testRuntime],
	);
	if (authenticated && testRuntime && testDecision && !testClosed) {
		return (
			<div className={styles.backdrop} role="dialog" aria-label="Test campaign" aria-modal="true">
				<div className={styles.modal} ref={modalRef} tabIndex={-1}>
					<Button type="button" onClick={() => setTestClosed(true)}>Close</Button>
					<TestTouchpointMount
						decision={testDecision}
						placementKey={PLACEMENT}
						testId="campaign-custom-element"
						onVisible={onTestVisible}
						requestClose={closeTestModal}
					/>
				</div>
			</div>
		);
	}
	return authenticated && decision?.sessionSubject === sessionSubject ? (
		<div
			className={styles.backdrop}
			role="dialog"
			aria-label="Campaign"
			aria-modal="true"
		>
			<div className={styles.modal} ref={modalRef} tabIndex={-1}>
				<Button type="button" onClick={() => setClosed(true)}>
					Close
				</Button>
				<div ref={elementRef} data-testid="campaign-custom-element" />
			</div>
		</div>
	) : null;
}
