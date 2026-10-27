import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useI18n } from "../i18n";
import { getOpenDesignHost } from "@open-design/host";
import { openExternalUrl } from "../providers/registry";
import {
	touchpointStaticActionsMatch,
	type TouchpointStaticAction,
} from "./touchpoint-static-actions";
import {
	emitWebTouchpointDiagnostic,
	ensureWebTouchpointElement,
	focusWebTouchpointModal,
	readWebTouchpointHostContext,
	lockWebTouchpointModalScroll,
	supportsWebTouchpointCapabilities,
	trapWebTouchpointModalFocus,
	verifyWebTouchpoint,
	webTouchpointContext,
	type OpenDesignTouchpointElement,
	type WebTouchpointContent,
} from "./touchpoint-component";
import {
	emitProductionTouchpointLoadDiagnostic,
	loadProductionTouchpointDecision,
	productionTouchpointRecovery,
} from "./production-touchpoint-loader";
import {
	resolveAuthorizationDeadline,
	touchpointContentIdentity,
	touchpointLeaseValue,
	touchpointScheduleWindowMs,
	touchpointWithdrawsDisplay,
	useTouchpointLifecycle,
	type TouchpointLeaseValue,
	type TouchpointLifecycleLoad,
} from "./touchpoint-lifecycle";
import {
	TestTouchpointMount,
	completeCampaignAction,
	recordVisibleTestTouchpoint,
	useTestRuntime,
} from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import styles from "./TestCampaignModal.module.css";
const PLACEMENT = "opend.home.campaign-modal";
export const PRODUCTION_ACTION_TELEMETRY_TIMEOUT_MS = 3_000;
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
const displayedKey = (subject: string, activity: string) =>
	`touchpoint-displayed:v1:${encodeURIComponent(subject)}:${encodeURIComponent(activity)}`;

/** Local impressions gate automatic presentation only, independently of publication. */
function wasDisplayed(subject: string, activity: string): boolean {
	try {
		return localStorage.getItem(displayedKey(subject, activity)) === "1";
	} catch {
		return false;
	}
}

function recordDisplayed(subject: string, activity: string): void {
	try {
		localStorage.setItem(displayedKey(subject, activity), "1");
	} catch {
		// Storage may be unavailable or full; presentation and dismissal still work.
	}
}

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

/**
 * Performs a server-validated click before the host consumes a static target.
 *
 * Takes the lease value, not the response DTO: how long authority lasts arrives
 * as `expiresAt`, from the lease's own window, so the decision's own (possibly
 * superseded) timing has no business being in scope here.
 */
export async function dispatchProductionCampaignAction(
	decision: TouchpointLeaseValue<Decision>,
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
	let response: Response | undefined;
	const telemetryController = new AbortController();
	const telemetryTimeout = setTimeout(
		() => telemetryController.abort(),
		PRODUCTION_ACTION_TELEMETRY_TIMEOUT_MS,
	);
	try {
		response = await fetch("/api/touchpoints/production-runtime/events", {
			method: "POST",
			headers: { "content-type": "application/json" },
			signal: telemetryController.signal,
			body: JSON.stringify({
				touchpointDecisionId: decision.touchpointDecisionId,
				activityId: decision.activityId,
				placementKey: decision.placementKey,
				eventId: crypto.randomUUID(),
				kind: "click",
			}),
		});
	} catch {
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_telemetry_failed",
			detail: "network",
		});
	} finally {
		clearTimeout(telemetryTimeout);
	}
	if (response && !response.ok && response.status < 500) {
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_denied",
			detail: actionId,
		});
		return false;
	}
	if (response && !response.ok && response.status >= 500) {
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_telemetry_failed",
			detail: `http_${response.status}`,
		});
	}
	if (generation !== currentGeneration() || expiresAt <= Date.now()) {
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_denied",
			detail: actionId,
		});
		return false;
	}
	let navigated = false;
	try {
		// The host may refuse an external URL; only its own answer is success.
		if (action.target.kind === "https")
			navigated = await openExternalUrl(action.target.url);
		else if (internalTarget) {
			window.location.assign(internalTarget.href);
			navigated = true;
		}
	} catch {
		navigated = false;
	}
	if (!navigated)
		emitWebTouchpointDiagnostic({
			code: "touchpoint_action_denied",
			detail: actionId,
		});
	return navigated;
}
/**
 * The Test presentation currently open in this modal. It is released when the
 * user dismisses it, the account changes, or another Test deployment (or
 * snapshot) is selected. Reloading the same selected deployment publishes a
 * session without decisions until the new ones arrive (a locale swap, a lease
 * renewal); that gap continues the open presentation instead of re-offering an
 * activity this account already saw.
 */
type OpenTestPresentation = Readonly<{
	campaignKey: string;
	selectionKey: string;
}>;
function testSelectionKeyOf(
	runtime: NonNullable<ReturnType<typeof useTestRuntime>>,
): string {
	return JSON.stringify([
		runtime.deployment.id,
		runtime.deployment.snapshotHash ?? "",
	]);
}
/** Production v2 modal shares the Test adapter; it does not fall back to a frame when bytes or runtime identity fail. */
type AuthorizedDecision = TouchpointLeaseValue<Decision> & { sessionSubject: string };
type OpenPresentation = Readonly<{
	sessionSubject: string;
	activityId: string;
	deadline: number;
}>;
/** One successful Production mount; `record` records its impression once it can be seen. */
type PresentedMount = Readonly<{ record: () => void }>;

/**
 * Host frame for the campaign modal. The backdrop blocks the page only once
 * verified content has mounted: before the first mount completes, and after a
 * verification failure or a mount that throws or times out, the frame stays
 * hidden and inert, so a failure never leaves an empty gray overlay behind. A
 * replacement of content already on screen keeps the frame until it settles.
 * The mount container stays in place in both states so content can mount.
 */
function CampaignModalFrame({
	presented,
	label,
	modalRef,
	children,
}: {
	presented: boolean;
	label: string;
	modalRef: RefObject<HTMLDivElement>;
	children: ReactNode;
}) {
	return (
		<div
			className={presented ? styles.backdrop : undefined}
			role={presented ? "dialog" : undefined}
			aria-label={presented ? label : undefined}
			aria-modal={presented ? "true" : undefined}
			hidden={!presented}
		>
			<div className={styles.modal} ref={modalRef} tabIndex={-1}>
				{children}
			</div>
		</div>
	);
}
export function ProductionCampaignModal({
	authenticated,
	sessionSubject,
}: {
	authenticated: boolean;
	sessionSubject: string | null;
}) {
	const { locale, t } = useI18n();
	const testRuntime = useTestRuntime();
	// A sibling entering or leaving the session must not rebuild this placement.
	const testRuntimeRef = useRef(testRuntime);
	testRuntimeRef.current = testRuntime;
	const testDecision = testRuntime?.decisions.get(PLACEMENT);
	// Test follows the production rule: one automatic presentation per account,
	// activity and device. Only the presentation already open may continue (its
	// own visibility record, lease renewal or locale swap); any new offer of a
	// recorded activity stays closed, as does a dismissed one.
	const [dismissedTestCampaigns, setDismissedTestCampaigns] = useState<ReadonlySet<string>>(() => new Set());
	const openTestCampaign = useRef<OpenTestPresentation | null>(null);
	const [replaySelection, setReplaySelection] = useState<string | null>(null);
	const replayKey = testRuntime && sessionSubject ? JSON.stringify([
		sessionSubject, testRuntime.selectionKey, testRuntime.deployment.id, testRuntime.deployment.snapshotHash,
		testRuntime.context.testerMemberId,
	]) : null;
	const replaying = replayKey !== null && replaySelection === replayKey;
	useEffect(() => { setReplaySelection(null); }, [replayKey]);
	const testActivityId = testDecision?.activityId;
	const testCampaignKey = testDecision
		? JSON.stringify([sessionSubject, testActivityId])
		: null;
	const testSelectionKey = testRuntime ? testSelectionKeyOf(testRuntime) : null;
	if (
		openTestCampaign.current &&
		(!authenticated || openTestCampaign.current.selectionKey !== testSelectionKey)
	)
		openTestCampaign.current = null;
	const continuesOpenTestCampaign =
		openTestCampaign.current?.campaignKey === testCampaignKey;
	const testClosed =
		testCampaignKey === null ||
		dismissedTestCampaigns.has(testCampaignKey) ||
		(!continuesOpenTestCampaign &&
			!!sessionSubject &&
			!!testActivityId &&
			wasDisplayed(sessionSubject, testActivityId) && !replaying);
	if (testCampaignKey !== null && testSelectionKey !== null)
		openTestCampaign.current =
			authenticated && !testClosed
				? { campaignKey: testCampaignKey, selectionKey: testSelectionKey }
				: null;
	const closeTestModal = useCallback(() => {
		setReplaySelection(null);
		if (testCampaignKey !== null) {
			setDismissedTestCampaigns(previous => new Set([...previous, testCampaignKey]));
		}
	}, [testCampaignKey]);
	const [closed, setClosed] = useState(false);
	const openPresentation = useRef<OpenPresentation | null>(null);
	const clearOpenPresentation = useCallback(() => {
		openPresentation.current = null;
	}, []);
	// Whether mounted content backs the frame; see `CampaignModalFrame`.
	const [testPresented, setTestPresented] = useState(false);
	const [presentedMount, setPresentedMount] = useState<PresentedMount | null>(null);
	const elementRef = useRef<HTMLDivElement | null>(null);
	const modalRef = useRef<HTMLDivElement>(null);
	const restoreFocus = useRef<HTMLElement | null>(null);
	const productionEnabled = !testRuntime && authenticated && !!sessionSubject && getOpenDesignHost()?.client.type === "desktop";
	const load = useCallback(
		async (signal: AbortSignal, active: AuthorizedDecision | null): Promise<TouchpointLifecycleLoad<AuthorizedDecision>> => {
			if (!locale || !sessionSubject) return { kind: "clear" };
			const requestedAt = Date.now();
			const loaded = await loadProductionTouchpointDecision(PLACEMENT, locale, signal, active?.touchpointDecisionId);
			if (signal.aborted) return { kind: "clear" };
			if (loaded.kind === "revoked") {
				const revokesActive =
					active !== null &&
					loaded.receipt.touchpointDecisionId === active.touchpointDecisionId &&
					loaded.receipt.deploymentId === active.deploymentId &&
					loaded.receipt.activityId === active.activityId &&
					loaded.receipt.contentVersionId === active.content.id;
				if (!active || revokesActive) clearOpenPresentation();
				return revokesActive ? { kind: "clear" } : { kind: "retain" };
			}
			if (loaded.kind === "no-decision") {
				if (!active) clearOpenPresentation();
				return active ? { kind: "retain" } : { kind: "clear" };
			}
			const next = loaded.value as Decision;
			const deadline = resolveAuthorizationDeadline(next);
			const serverTime = Date.parse(next.serverTime);
			if (!next.activityId || !next.touchpointDecisionId || !next.deploymentId || !next.content?.id || next.placementKey !== PLACEMENT || next.content?.placementKey !== PLACEMENT || deadline === null || !Number.isFinite(serverTime) || !supportsWebTouchpointCapabilities(next.content, next.requiredCapabilities, supportedCapabilities)) {
				clearOpenPresentation();
				if (next.placementKey !== PLACEMENT || next.content?.placementKey !== PLACEMENT) emitWebTouchpointDiagnostic({ code: "touchpoint_decision_mismatch" });
				else if (!supportsWebTouchpointCapabilities(next.content, next.requiredCapabilities, supportedCapabilities)) emitWebTouchpointDiagnostic({ code: "touchpoint_capability_unsupported", detail: next.requiredCapabilities?.join(",") });
				return { kind: "clear" };
			}
			const renewedPresentation = openPresentation.current;
			if (
				active?.activityId === next.activityId &&
				renewedPresentation?.sessionSubject === sessionSubject &&
				renewedPresentation.activityId === next.activityId
			)
				openPresentation.current = {
					...renewedPresentation,
					// Anchor at request start so response latency cannot extend this presentation.
					deadline: requestedAt + deadline - serverTime,
				};
			const presentation = openPresentation.current;
			if (
				presentation &&
				(presentation.sessionSubject !== sessionSubject || presentation.deadline <= Date.now())
			)
				clearOpenPresentation();
			// Only the presentation still on screen may cross a locale transition or a
			// lease renewal. `active` is not that test: a lease revoked by the page
			// fence stays behind as the revalidation subject, so keying the exemption
			// on its activity let every wake re-offer an activity this device had
			// already been shown. A stored impression never overrides a fresh
			// authorization, expiry, revocation, or account fence.
			const continuesOpenPresentation =
				openPresentation.current === presentation &&
				presentation?.sessionSubject === sessionSubject &&
				presentation.activityId === next.activityId &&
				presentation.deadline > Date.now();
			// A recorded activity that is not the open presentation may not be
			// published. Retaining is only for an offer arriving BESIDE a live
			// presentation, which keeps its mount; with nothing on screen a retain
			// would republish the very lease the page fence just withdrew, so the
			// suppressed offer has to clear instead.
			if (!continuesOpenPresentation && wasDisplayed(sessionSubject, next.activityId))
				return openPresentation.current ? { kind: "retain" } : { kind: "clear" };
			return { kind: "decision", value: { ...touchpointLeaseValue(next), sessionSubject }, key: touchpointContentIdentity(next), validForMs: deadline - serverTime, offlineValidForMs: touchpointScheduleWindowMs(next), offlineRecovery: productionTouchpointRecovery(loaded.offlineReplay) ?? undefined };
		},
		[clearOpenPresentation, locale, sessionSubject],
	);
	const onError = useCallback((error: unknown) => {
		// The lifecycle keeps display authority through a transport failure and
		// ends it only for the server's own withdrawal; the presentation on screen
		// has to follow the same rule. Releasing it on every error told the
		// impression gate the modal was gone while it was still mounted, so the
		// recovering poll suppressed the activity it was still showing.
		if (touchpointWithdrawsDisplay(error)) clearOpenPresentation();
		const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
		if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
	}, [clearOpenPresentation]);
	const lifecycle = useTouchpointLifecycle<AuthorizedDecision>({ enabled: productionEnabled, identity: productionEnabled ? JSON.stringify([sessionSubject, locale]) : null, load, onError, offlineFallback: true });
	const { current: decision, generation, clear, isCurrent, reportFencedMount } = lifecycle;
	const closeProductionModal = useCallback(() => {
		clearOpenPresentation();
		setClosed(true);
	}, [clearOpenPresentation]);
	useEffect(() => {
		if (!authenticated || !sessionSubject || openPresentation.current?.sessionSubject !== sessionSubject)
			clearOpenPresentation();
	}, [authenticated, clearOpenPresentation, sessionSubject]);
	/*
	 * There is deliberately no visibility fence here.
	 *
	 * One existed, to release the open presentation whenever the page went
	 * hidden. Its premise was that "a hidden page withdraws the lease and takes
	 * this modal down with it", so the presentation was genuinely over and the
	 * offer arriving on wake was a new one. OPEND-3363 removed that premise:
	 * hiding now cancels only the request in flight and leaves both the lease
	 * and this modal exactly as they were.
	 *
	 * Releasing the presentation anyway left the campaign on screen with nothing
	 * recorded as presenting it, and the poll that follows on return read the
	 * device impression, found no open presentation, and cleared the host — the
	 * campaign vanished on a tab switch, which is the symptom both fixes were
	 * written to remove.
	 *
	 * What the fence was protecting is still protected, by the presentation's own
	 * deadline: it is anchored to the authorization that opened it, so a sleep
	 * long enough to lapse the lease also lapses the presentation, and the offer
	 * that arrives on wake is correctly read as a new one.
	 */
	useEffect(() => {
		ensureWebTouchpointElement();
	}, []);
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
		const mountGeneration = generation;
		const presentedToken: PresentedMount = { record: () => recordWhenVisible() };
		const current = () => !cancelled && isCurrent(mountGeneration);
		// OPEND-3378: a mount abandoned only because the lease was momentarily
		// not current must be restarted by the next same-key grant.
		const abandonFencedMount = () => {
			if (!cancelled) reportFencedMount(mountGeneration);
			dispose();
		};
		let verified: Awaited<ReturnType<typeof verifyWebTouchpoint>> | undefined;
		const element = document.createElement(
			"opend-touchpoint",
		) as OpenDesignTouchpointElement;
		let visibleFrame: number | undefined;
		let mounted = false;
		let recorded = false;
		const recordWhenVisible = () => {
			if (!mounted || recorded || visibleFrame !== undefined) return;
			visibleFrame = requestAnimationFrame(() => {
				visibleFrame = undefined;
				if (
					!current() ||
					lifecycle.deadline <= Date.now() ||
					document.hidden ||
					!element.isConnected ||
					element.hidden ||
					element.getClientRects().length === 0
				)
					return;
				recordDisplayed(decision.sessionSubject, decision.activityId);
				recorded = true;
			});
		};
		document.addEventListener("visibilitychange", recordWhenVisible);
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
					abandonFencedMount();
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
					setPresentedMount(null);
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
					if (!current()) abandonFencedMount();
					else dispose();
					if (current() && !context) {
						setPresentedMount(null);
						emitWebTouchpointDiagnostic({
							code: "touchpoint_locale_unsupported",
						});
					}
					return;
				}
				await element.mount(
					verified.entryUrl,
					decision.content.entryDigest,
					{ ...context, mode: "production" },
					verified.resourceUrls,
					new Set(decision.staticActions.map((action) => action.id)),
					{
						requestClose: closeProductionModal,
						dispatchAction: (id) =>
							completeCampaignAction(
								dispatchProductionCampaignAction(
									decision,
									id,
									mountGeneration,
									() => (isCurrent(mountGeneration) ? mountGeneration : -1),
									lifecycle.deadline,
								),
								closeProductionModal,
								() => current() && lifecycle.deadline > Date.now(),
							),
						onDiagnostic: emitWebTouchpointDiagnostic,
					},
				);
				if (!current()) {
					abandonFencedMount();
					return;
				}
				mounted = true;
				openPresentation.current = {
					sessionSubject: decision.sessionSubject,
					activityId: decision.activityId,
					deadline: lifecycle.deadline,
				};
				// Revealing the frame records the impression once it is laid out.
				setPresentedMount(presentedToken);
			} catch (error) {
				if (!current()) {
					dispose();
					return;
				}
				if (current()) {
					clearOpenPresentation();
					setPresentedMount(null);
					emitWebTouchpointDiagnostic({
						code:
							error instanceof Error ? error.message : "touchpoint_load_failed",
					});
				}
				dispose();
			}
		})();
		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", recordWhenVisible);
			if (visibleFrame !== undefined) cancelAnimationFrame(visibleFrame);
			dispose();
			container.replaceChildren();
		};
	}, [authenticated, closeProductionModal, decision, generation, isCurrent, reportFencedMount, sessionSubject]);
	const productionPresented = presentedMount !== null && decision !== null;
	useEffect(() => {
		if (!decision) setPresentedMount(null);
	}, [decision]);
	useEffect(() => {
		presentedMount?.record();
	}, [presentedMount]);
	useEffect(() => {
		if (!decision || !productionPresented) return;
		restoreFocus.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const releaseScrollLock = lockWebTouchpointModalScroll();
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeProductionModal();
			else trapWebTouchpointModalFocus(event, modalRef.current);
		};
		document.addEventListener("keydown", key);
		queueMicrotask(() => focusWebTouchpointModal(modalRef.current));
		return () => {
			document.removeEventListener("keydown", key);
			releaseScrollLock();
			restoreFocus.current?.focus();
		};
	}, [closeProductionModal, decision, productionPresented]);
	useEffect(() => {
		if (!closed || !decision || !sessionSubject) return;
		clearOpenPresentation();
		clear();
		setClosed(false);
	}, [clear, clearOpenPresentation, closed, decision, sessionSubject]);
	useEffect(() => {
		if (!testDecision || testClosed || !authenticated) setTestPresented(false);
	}, [authenticated, testClosed, testDecision]);
	useEffect(() => {
		if (!testDecision || testClosed || !authenticated || !testPresented) return;
		const previous =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const releaseScrollLock = lockWebTouchpointModalScroll();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeTestModal();
			else trapWebTouchpointModalFocus(event, modalRef.current);
		};
		document.addEventListener("keydown", onKeyDown);
		queueMicrotask(() => focusWebTouchpointModal(modalRef.current));
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			releaseScrollLock();
			previous?.focus();
		};
	}, [authenticated, testClosed, testDecision, testPresented, closeTestModal]);
	const onTestVisible = useCallback(
		(next: TestDecision, placementKey: TestCampaignPlacement) => {
			const runtime = testRuntimeRef.current;
			if (!runtime) return;
			if (sessionSubject && next.activityId && placementKey === PLACEMENT)
				recordDisplayed(sessionSubject, next.activityId);
			recordVisibleTestTouchpoint(runtime, next, placementKey);
		},
		[sessionSubject],
	);
	if (authenticated && testRuntime && testDecision && !testClosed) {
		return (
			<CampaignModalFrame presented={testPresented} label="Test campaign" modalRef={modalRef}>
				<TestTouchpointMount
					decision={testDecision}
					placementKey={PLACEMENT}
					testId="campaign-custom-element"
					onVisible={onTestVisible}
					requestClose={closeTestModal}
					isAuthorized={testRuntime.isAuthorized}
					onPresentedChange={setTestPresented}
				/>
			</CampaignModalFrame>
		);
	}
	if (authenticated && sessionSubject && testRuntime && testDecision && testClosed && testRuntime.isAuthorized()) {
		return <button type="button" className={styles.replay} onClick={() => {
			if (!testRuntime.isAuthorized() || !replayKey || !testCampaignKey) return;
			setReplaySelection(replayKey);
			setDismissedTestCampaigns(previous => {
				const next = new Set(previous);
				next.delete(testCampaignKey);
				return next;
			});
		}}>{t("campaign.testReplay")}</button>;
	}
	return authenticated && decision?.sessionSubject === sessionSubject ? (
		<CampaignModalFrame presented={productionPresented} label="Campaign" modalRef={modalRef}>
			<div ref={elementRef} data-testid="campaign-custom-element" />
		</CampaignModalFrame>
	) : null;
}
