import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { getOpenDesignHost } from "@open-design/host";
import { openExternalUrl } from "../providers/registry";
import type { TouchpointStaticAction } from "./touchpoint-static-actions";
import {
	emitWebTouchpointDiagnostic,
	ensureWebTouchpointElement,
	lockWebTouchpointModalScroll,
	supportsWebTouchpointCapabilities,
	trapWebTouchpointModalFocus,
	type WebTouchpointContent,
} from "./touchpoint-component";
import {
	emitProductionTouchpointLoadDiagnostic,
	loadProductionTouchpointDecision,
} from "./production-touchpoint-loader";
import {
	mountTouchpoint,
	resolveAuthorizationDeadline,
	useTouchpointLifecycle,
	type TouchpointLifecycleLoad,
} from "./touchpoint-lifecycle";
import {
	TestTouchpointMount,
	recordVisibleTestTouchpoint,
	useTestRuntime,
} from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import styles from "./TestCampaignModal.module.css";
const PLACEMENT = "opend.home.campaign-modal";
const MAX_LEASE_MS = 5 * 60_000;
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
const testDecisionIds = new WeakMap<TestDecision, number>();
let nextTestDecisionId = 0;
/** A stable per-object key: a Test decision object is exactly one mount. */
function testDecisionMountKey(decision: TestDecision): number {
	const known = testDecisionIds.get(decision);
	if (known !== undefined) return known;
	const id = ++nextTestDecisionId;
	testDecisionIds.set(decision, id);
	return id;
}
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
	try {
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
/**
 * One modal chrome for Test and Production. The backdrop stays invisible and
 * inert until the component reports that it mounted, so a slow or failed load
 * never leaves an empty grey layer over the app; scroll lock, focus trap and
 * Escape exist only while something is actually presented.
 *
 * Callers key the shell by mount identity (a Production generation, a Test
 * decision), so every replacement mount starts hidden again; a renewal that
 * keeps its mount keeps the shell presented.
 */
function CampaignModalShell({
	label,
	ready,
	onClose,
	children,
}: {
	label: string;
	ready: boolean;
	onClose: () => void;
	children: ReactNode;
}) {
	const modalRef = useRef<HTMLDivElement | null>(null);
	const [presented, setPresented] = useState(ready);
	if (ready && !presented) setPresented(true);
	useEffect(() => {
		if (!presented) return;
		const previous =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const releaseScrollLock = lockWebTouchpointModalScroll();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			else trapWebTouchpointModalFocus(event, modalRef.current);
		};
		document.addEventListener("keydown", onKeyDown);
		queueMicrotask(() =>
			(
				modalRef.current?.querySelector<HTMLElement>("button") ??
				modalRef.current
			)?.focus(),
		);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			releaseScrollLock();
			previous?.focus();
		};
	}, [onClose, presented]);
	return (
		<div
			className={styles.backdrop}
			role="dialog"
			aria-label={label}
			aria-modal="true"
			aria-hidden={presented ? undefined : true}
			data-state={presented ? "open" : "loading"}
		>
			<div className={styles.modal} ref={modalRef} tabIndex={-1}>
				{children}
			</div>
		</div>
	);
}

/** Production v2 modal shares the Test adapter; it does not fall back to a frame when bytes or runtime identity fail. */
type AuthorizedDecision = Decision & {
	sessionSubject: string;
	presentationKey: string;
};
type OpenPresentation = Readonly<{
	sessionSubject: string;
	activityId: string;
	deadline: number;
}>;
export function ProductionCampaignModal({
	authenticated,
	sessionSubject,
}: {
	authenticated: boolean;
	sessionSubject: string | null;
}) {
	const { locale } = useI18n();
	const testRuntime = useTestRuntime();
	const testDecision = testRuntime?.decisions.get(PLACEMENT);
	// Test follows the production rule: one automatic presentation per account,
	// activity and device. Only the presentation already open may continue (its
	// own visibility record, lease renewal, redeployment or locale swap); any new
	// offer of a recorded activity stays closed, as does a dismissed one.
	const [dismissedTestCampaigns, setDismissedTestCampaigns] = useState<ReadonlySet<string>>(() => new Set());
	const openTestCampaign = useRef<string | null>(null);
	const testActivityId = testDecision?.activityId;
	const testCampaignKey = testDecision
		? JSON.stringify([sessionSubject, testActivityId])
		: null;
	const testClosed =
		testCampaignKey === null ||
		dismissedTestCampaigns.has(testCampaignKey) ||
		(openTestCampaign.current !== testCampaignKey &&
			!!sessionSubject &&
			!!testActivityId &&
			wasDisplayed(sessionSubject, testActivityId));
	openTestCampaign.current =
		authenticated && testRuntime && !testClosed ? testCampaignKey : null;
	const closeTestModal = useCallback(() => {
		if (testCampaignKey !== null) {
			setDismissedTestCampaigns(previous => new Set([...previous, testCampaignKey]));
		}
	}, [testCampaignKey]);
	const [readyTestDecision, setReadyTestDecision] = useState<TestDecision | null>(null);
	// A failed component suppresses only that decision, never the activity:
	// a later locale or corrected redeployment is a new decision and may present.
	const [failedTestDecisions, setFailedTestDecisions] = useState<ReadonlySet<TestDecision>>(() => new Set());
	const onTestFailed = useCallback((failed: TestDecision) => {
		setFailedTestDecisions(previous => new Set([...previous, failed]));
	}, []);
	const [closed, setClosed] = useState(false);
	const openPresentation = useRef<OpenPresentation | null>(null);
	const clearOpenPresentation = useCallback(() => {
		openPresentation.current = null;
	}, []);
	const elementRef = useRef<HTMLDivElement | null>(null);
	/** Decisions whose component failed to present; never offered again in this app session. */
	const failedPresentations = useRef<Set<string>>(new Set());
	const [readyGeneration, setReadyGeneration] = useState<number | null>(null);
	const productionEnabled = !testRuntime && authenticated && !!sessionSubject && getOpenDesignHost()?.client.type === "desktop";
	const load = useCallback(
		async (signal: AbortSignal, active: AuthorizedDecision | null): Promise<TouchpointLifecycleLoad<AuthorizedDecision>> => {
			if (!locale || !sessionSubject) return { kind: "clear" };
			const requestedAt = Date.now();
			const loaded = await loadProductionTouchpointDecision(PLACEMENT, locale, signal, active?.touchpointDecisionId);
			if (signal.aborted) return { kind: "clear" };
			if (loaded.kind === "revoked") {
				clearOpenPresentation();
				return active && loaded.receipt.touchpointDecisionId === active.touchpointDecisionId && loaded.receipt.deploymentId === active.deploymentId && loaded.receipt.activityId === active.activityId && loaded.receipt.contentVersionId === active.content.id ? { kind: "clear" } : { kind: "retain" };
			}
			if (loaded.kind === "no-decision") {
				clearOpenPresentation();
				return active ? { kind: "retain" } : { kind: "clear" };
			}
			const next = loaded.value as Decision;
			const deadline = resolveAuthorizationDeadline(next, MAX_LEASE_MS);
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
					deadline: requestedAt - loaded.ageMs + deadline - serverTime,
				};
			const presentation = openPresentation.current;
			if (
				presentation &&
				(presentation.sessionSubject !== sessionSubject || presentation.deadline <= Date.now())
			)
				clearOpenPresentation();
			// Only this mounted activity may cross a locale transition. A stored impression
			// never overrides a fresh authorization, expiry, revocation, or account fence.
			const continuesOpenPresentation =
				openPresentation.current === presentation &&
				presentation?.sessionSubject === sessionSubject &&
				presentation.activityId === next.activityId &&
				presentation.deadline > Date.now();
			if (!continuesOpenPresentation && active?.activityId !== next.activityId && wasDisplayed(sessionSubject, next.activityId)) return { kind: "retain" };
			const key = next.touchpointDecisionId + ":" + next.deploymentId + ":" + next.activityId + ":" + next.content.id;
			if (failedPresentations.current.has(JSON.stringify([sessionSubject, key]))) return { kind: "clear" };
			return { kind: "decision", value: { ...next, sessionSubject, presentationKey: key }, key, validForMs: deadline - serverTime - loaded.ageMs };
		},
		[clearOpenPresentation, locale, sessionSubject],
	);
	const onError = useCallback((error: unknown) => {
		clearOpenPresentation();
		const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
		if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
	}, [clearOpenPresentation]);
	const lifecycle = useTouchpointLifecycle<AuthorizedDecision>({ enabled: productionEnabled, identity: productionEnabled ? JSON.stringify([sessionSubject, locale]) : null, load, onError });
	const { current: decision, generation, clear, isCurrent } = lifecycle;
	const closeProductionModal = useCallback(() => {
		clearOpenPresentation();
		setClosed(true);
	}, [clearOpenPresentation]);
	useEffect(() => {
		if (!authenticated || !sessionSubject || openPresentation.current?.sessionSubject !== sessionSubject)
			clearOpenPresentation();
	}, [authenticated, clearOpenPresentation, sessionSubject]);
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
		const mountGeneration = generation;
		return mountTouchpoint(container, {
			content: decision.content,
			placementKey: PLACEMENT,
			staticActions: decision.staticActions,
			mode: "production",
			locale: decision.content.locale,
			isCurrent: () => isCurrent(mountGeneration),
			dispatchAction: async (id) => {
				await dispatchProductionCampaignAction(
					decision,
					id,
					mountGeneration,
					() => (isCurrent(mountGeneration) ? mountGeneration : -1),
					lifecycle.deadline,
				);
			},
			requestClose: closeProductionModal,
			onReady: () => {
				openPresentation.current = {
					sessionSubject: decision.sessionSubject,
					activityId: decision.activityId,
					deadline: lifecycle.deadline,
				};
				setReadyGeneration(mountGeneration);
			},
			onVisible: () => {
				if (lifecycle.deadline > Date.now())
					recordDisplayed(decision.sessionSubject, decision.activityId);
			},
			onError: () => {
				failedPresentations.current.add(
					JSON.stringify([decision.sessionSubject, decision.presentationKey]),
				);
				clearOpenPresentation();
				clear();
			},
		});
	}, [authenticated, clear, clearOpenPresentation, closeProductionModal, decision, generation, isCurrent, sessionSubject]);
	useEffect(() => {
		if (!closed || !decision || !sessionSubject) return;
		clearOpenPresentation();
		clear();
		setClosed(false);
	}, [clear, clearOpenPresentation, closed, decision, sessionSubject]);
	const onTestVisible = useCallback(
		(next: TestDecision, placementKey: TestCampaignPlacement) => {
			if (!testRuntime) return;
			if (sessionSubject && next.activityId && placementKey === PLACEMENT)
				recordDisplayed(sessionSubject, next.activityId);
			recordVisibleTestTouchpoint(testRuntime, next, placementKey);
		},
		[sessionSubject, testRuntime],
	);
	if (authenticated && testRuntime && testDecision && !testClosed && !failedTestDecisions.has(testDecision)) {
		return (
			<CampaignModalShell
				key={testDecisionMountKey(testDecision)}
				label="Test campaign"
				ready={readyTestDecision === testDecision}
				onClose={closeTestModal}
			>
				<TestTouchpointMount
					decision={testDecision}
					placementKey={PLACEMENT}
					testId="campaign-custom-element"
					onVisible={onTestVisible}
					requestClose={closeTestModal}
					isAuthorized={testRuntime.isAuthorized}
					onReady={setReadyTestDecision}
					onFailed={onTestFailed}
				/>
			</CampaignModalShell>
		);
	}
	return authenticated && decision?.sessionSubject === sessionSubject ? (
		<CampaignModalShell
			key={generation}
			label="Campaign"
			ready={readyGeneration === generation}
			onClose={closeProductionModal}
		>
			<div ref={elementRef} data-testid="campaign-custom-element" />
		</CampaignModalShell>
	) : null;
}
