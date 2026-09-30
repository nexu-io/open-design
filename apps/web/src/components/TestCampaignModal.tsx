import {
	TOUCHPOINT_COMPONENT_V2_RUNTIME_API_VERSION,
	TOUCHPOINT_COMPONENT_V2_SDK_VERSION,
	TOUCHPOINT_COMPONENT_V2_WRAPPER_VERSION,
} from "@open-design/contracts";
import type {
	TestRuntimeContext,
	TestRuntimeDecision,
} from "@open-design/contracts/api/touchpointTestRuntime";
import { getOpenDesignHost, OPEN_DESIGN_HOST_VERSION } from "@open-design/host";
import { mountTouchpoint } from "./touchpoint-lifecycle";
import {
	navigateCampaignTarget,
	resolveCampaignTarget,
	requireCampaignAction,
} from "./touchpoint-navigation";
import {
	TEST_MAX_AUTHORIZATION_MS,
	type TouchpointLifecycleLoad,
	resolveAuthorizationDeadline,
	touchpointWithdrawsDisplay,
	useTouchpointLifecycle,
} from "./touchpoint-lifecycle";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useI18n } from "../i18n";
import styles from "./TestCampaignModal.module.css";
import {
	emitWebTouchpointDiagnostic,
	ensureWebTouchpointElement,
	supportsWebTouchpointCapabilities,
	type WebTouchpointContent,
} from "./touchpoint-component";
import {
	type TouchpointStaticAction,
	touchpointStaticActionsMatch,
} from "./touchpoint-static-actions";

import {
	TEST_CAMPAIGN_PLACEMENTS,
	type TestCampaignPlacement,
	type TestDeployment,
	useTestDeploymentSelection,
} from "./test-deployment-selection";
export {
	TEST_CAMPAIGN_PLACEMENTS,
	type TestCampaignPlacement,
	type TestDeployment,
} from "./test-deployment-selection";

export const TEST_CAMPAIGN_MODAL_PLACEMENT =
	"opend.home.campaign-modal" as const;
export const TEST_CAMPAIGN_MODAL_CAPABILITIES = [
	"close",
	"static-action",
] as const;
const supportedCapabilities = new Set<string>(TEST_CAMPAIGN_MODAL_CAPABILITIES);
const placementCapabilities = new Set(["hover", "static-action"]);
type Scenario = "realtime";
export type TestContext = TestRuntimeContext;
export type TestDecision = TestRuntimeDecision<
	WebTouchpointContent,
	TouchpointStaticAction[]
>;
export type TestRuntimeSession = Readonly<{
	selectionKey: string;
	deployment: TestDeployment;
	context: TestContext;
	decisions: ReadonlyMap<TestCampaignPlacement, TestDecision>;
	isAuthorized: (placementKey?: TestCampaignPlacement) => boolean;
}>;
type TestPlacementAuthority = Readonly<{ received: TestClock; validForMs: number }>;
type TestRuntimeValue = Omit<TestRuntimeSession, "isAuthorized"> & Readonly<{
	authorizations: ReadonlyMap<TestCampaignPlacement, TestPlacementAuthority>;
}>;

let currentTestSession: TestRuntimeSession | null = null;
const testRuntimeListeners = new Set<() => void>();
/**
 * One entry per visible snapshot placement while its receipt is being
 * delivered or after the server accepted it. A failed delivery removes its
 * entry, so only a later visibility can start another one.
 */
type AcceptanceDelivery = { controller: AbortController; accepted: boolean };
const acceptanceState = new Map<string, AcceptanceDelivery>();
function resetAcceptanceDelivery(): void {
	for (const delivery of acceptanceState.values()) delivery.controller.abort();
	acceptanceState.clear();
}
function subscribeTestRuntime(listener: () => void): () => void {
	testRuntimeListeners.add(listener);
	return () => testRuntimeListeners.delete(listener);
}
function getTestRuntimeSnapshot(): TestRuntimeSession | null {
	return currentTestSession;
}
export function useTestRuntime(): TestRuntimeSession | null {
	return useSyncExternalStore(
		subscribeTestRuntime,
		getTestRuntimeSnapshot,
		getTestRuntimeSnapshot,
	);
}
export function setTestRuntimeSession(
	session: TestRuntimeSession | null,
): void {
	if (
		currentTestSession?.selectionKey !== session?.selectionKey ||
		currentTestSession?.context.testerMemberId !==
			session?.context.testerMemberId ||
		currentTestSession?.deployment.snapshotHash !==
			session?.deployment.snapshotHash
	)
		resetAcceptanceDelivery();
	currentTestSession = session;
	for (const listener of testRuntimeListeners) listener();
}
export function clearTestRuntimeSession(): void {
	if (!currentTestSession) return;
	currentTestSession = null;
	resetAcceptanceDelivery();
	for (const listener of testRuntimeListeners) listener();
}

/** Test decisions are valid only for the exact selected deployment and clock snapshot. */
export function isSelectedTestCampaignDecision(
	next: TestDecision,
	context: TestContext,
	placementKey: string = TEST_CAMPAIGN_MODAL_PLACEMENT,
): boolean {
	return (
		next.deploymentId === context.deploymentId &&
		next.placementKey === placementKey &&
		next.content?.placementKey === placementKey &&
		next.testContext?.deploymentId === context.deploymentId &&
		next.testContext?.scenario === context.scenario &&
		next.testContext?.updatedAt === context.updatedAt
	);
}

/**
 * Raised when a decision was issued under a different context generation than
 * the one this client holds. It keeps the mismatch diagnostic code, so a
 * context that is still stale after its one refetch reports as before.
 */
class StaleTestContextError extends Error {
	constructor(readonly detail?: string) {
		super("touchpoint_decision_mismatch");
	}
}

/**
 * A Test runtime refusal. A 410 is the server withdrawing the deployment, so
 * it carries the same `touchpointWithdrawal` mark as Production and ends a
 * lease that is already on screen instead of waiting for it to lapse.
 */
class TestRuntimeResponseError extends Error {
	readonly touchpointWithdrawal: boolean;
	constructor(code: string, status: number) {
		super(code);
		this.touchpointWithdrawal = status === 410;
	}
}

/**
 * One placement that did not answer within its own budget. It is dropped like
 * any failed presentation so the healthy ones still show, but it never
 * replaces a presentation that is already on screen.
 */
class TestPlacementTimeoutError extends Error {
	constructor(readonly placementKey: TestCampaignPlacement) {
		super("touchpoint_test_placement_timeout");
	}
}

/**
 * Budget of one placement request, below the lifecycle's whole-attempt budget
 * so a hung placement settles before the attempt is abandoned.
 */
export const TEST_PLACEMENT_REQUEST_TIMEOUT_MS = 10_000;

/** One placement answer that passed every selection and schedule check. */
type LoadedTestPlacement = Readonly<{
	placementKey: TestCampaignPlacement;
	decision: TestDecision;
	startsAt: number;
	endsAt: number;
	serverTime: number;
	validForMs: number;
	received: TestClock;
}>;

/** Elapsed time measured on both clocks, as the lifecycle measures its leases. */
type TestClock = Readonly<{ monotonic: number; wall: number }>;
const testClock = (): TestClock => ({ monotonic: performance.now(), wall: Date.now() });
const testElapsed = (start: TestClock) =>
	Math.max(0, performance.now() - start.monotonic, Date.now() - start.wall);

/** A decision that disagrees with the selection, carrying both identities. */
class TestDecisionMismatchError extends Error {
	constructor(readonly detail: string) {
		super("touchpoint_decision_mismatch");
	}
}

/**
 * Diagnostic identities for a rejected decision: the selected deployment and
 * placement, what this client expected (context and snapshot), and what the
 * server answered. A bare code cannot be correlated with a request.
 */
function decisionMismatchDetail(
	decision: TestDecision | null | undefined,
	context: TestContext,
	deployment: TestDeployment,
	placementKey: TestCampaignPlacement,
): string {
	return JSON.stringify({
		deploymentId: deployment.id,
		placementKey,
		expected: {
			activityId: deployment.activityId,
			snapshotHash: deployment.snapshotHash ?? null,
			contentVersionId: deployment.snapshot.contentVersionId,
			manifestHash: deployment.snapshot.manifestHash,
			artifactHash: deployment.snapshot.artifactHash,
			context: {
				deploymentId: context.deploymentId,
				scenario: context.scenario,
				updatedAt: context.updatedAt,
				testerMemberId: context.testerMemberId ?? null,
			},
		},
		received: decision
			? {
					deploymentId: decision.deploymentId ?? null,
					activityId: decision.activityId ?? null,
					placementKey: decision.placementKey ?? null,
					snapshotHash: decision.snapshotHash ?? null,
					contentVersionId: decision.content?.id ?? null,
					manifestHash: decision.manifestHash ?? null,
					artifactHash: decision.artifactHash ?? null,
					context: decision.testContext
						? {
								deploymentId: decision.testContext.deploymentId ?? null,
								scenario: decision.testContext.scenario ?? null,
								updatedAt: decision.testContext.updatedAt ?? null,
								testerMemberId: decision.testContext.testerMemberId ?? null,
							}
						: null,
				}
			: null,
	});
}

/** The diagnostic a failed Test load reports, keeping any identities it carries. */
function testLoadDiagnostic(error: unknown): { code: string; detail?: string } {
	const code =
		error instanceof Error ? error.message : "touchpoint_test_load_failed";
	const detail =
		error instanceof TestDecisionMismatchError ||
		error instanceof StaleTestContextError
			? error.detail
			: undefined;
	return detail === undefined ? { code } : { code, detail };
}

/**
 * Placements that are presented together. A failure hides only its own
 * presentation: the hover entry and its layer stay atomic, while the modal and
 * the badge are independent of each other and of the hover.
 */
const TEST_PRESENTATIONS: readonly (readonly TestCampaignPlacement[])[] = [
	["opend.home.account-badge"],
	["opend.home.campaign-modal"],
	["opend.home.hover-entry", "opend.home.hover-layer"],
];
function testPresentationOf(
	placementKey: TestCampaignPlacement,
): readonly TestCampaignPlacement[] {
	return (
		TEST_PRESENTATIONS.find((group) => group.includes(placementKey)) ?? [
			placementKey,
		]
	);
}

/**
 * A decision that names the selected deployment and scenario under another
 * context generation proves only that the client's context is out of date, not
 * that the decision is foreign. Every other disagreement remains a mismatch and
 * never triggers a context refetch.
 */
function isContextGenerationDrift(
	decision: TestDecision,
	context: TestContext,
): boolean {
	return (
		decision.deploymentId === context.deploymentId &&
		decision.testContext?.deploymentId === context.deploymentId &&
		decision.testContext.scenario === context.scenario &&
		(decision.testContext.updatedAt !== context.updatedAt ||
			decision.testContext.testerMemberId !== context.testerMemberId)
	);
}

/** Only the current live, authorized Test snapshot can navigate a registered action. */
export async function dispatchTestCampaignAction(
	decision: TestDecision,
	actionId: string,
): Promise<boolean> {
	const session = currentTestSession;
	const placement = TEST_CAMPAIGN_PLACEMENTS.find(
		(key) => key === decision.placementKey,
	);
	const target = resolveCampaignTarget(decision.staticActions, actionId);
	if (
		session &&
		placement &&
		session.isAuthorized(placement) &&
		session.decisions.get(placement) === decision &&
		decision.testContext.scheduleState === "active" &&
		decisionMatchesSelection(
			decision,
			session.context,
			session.deployment,
			placement,
		) &&
		navigator.userActivation?.isActive &&
		target
	) {
		try {
			if (await navigateCampaignTarget(target)) return true;
		} catch {
			// Report host navigation failure through the same action contract.
		}
	}
	emitWebTouchpointDiagnostic({
		code: "touchpoint_action_denied",
		detail: actionId,
	});
	return false;
}

function supportsHost(authenticated: boolean): boolean {
	const host = getOpenDesignHost();
	return (
		authenticated &&
		host?.version === OPEN_DESIGN_HOST_VERSION &&
		host.client.type === "desktop"
	);
}

function testPlacementIds(deployment: TestDeployment): TestCampaignPlacement[] {
	return TEST_CAMPAIGN_PLACEMENTS.filter((key) =>
		deployment.snapshot.placementKeys.includes(key),
	);
}

function expectedSnapshotMatches(
	decision: TestDecision,
	deployment: TestDeployment,
): boolean {
	const snapshot = deployment.snapshot;
	// Missing identities are not a compatible snapshot and must never authorize
	// a mount. Fixtures follow the same complete payload as the real API.
	return (
		Boolean(deployment.snapshotHash) &&
		decision.snapshotHash === deployment.snapshotHash &&
		Boolean(snapshot.contentVersionId) &&
		decision.content?.id === snapshot.contentVersionId &&
		Boolean(snapshot.manifestHash) &&
		decision.manifestHash === snapshot.manifestHash &&
		Boolean(snapshot.artifactHash) &&
		decision.artifactHash === snapshot.artifactHash
	);
}

function decisionMatchesSelection(
	decision: TestDecision,
	context: TestContext,
	deployment: TestDeployment,
	placementKey: TestCampaignPlacement,
): boolean {
	return (
		isSelectedTestCampaignDecision(decision, context, placementKey) &&
		decision.activityId === deployment.activityId &&
		decision.testContext.testerMemberId === context.testerMemberId &&
		["before", "active", "ended"].includes(decision.testContext.scheduleState) &&
		expectedSnapshotMatches(decision, deployment) &&
		touchpointStaticActionsMatch(
			decision.staticActions,
			decision.content.manifest.placements.find(
				(placement) => placement.key === placementKey,
			)?.staticActions ?? [],
		) &&
		decision.content.id.length > 0
	);
}

function acceptanceEvidence(
	input: Readonly<{
		deploymentId: string;
		snapshotHash: string;
		placementKey: string;
		locale: string;
		scenario: string;
	}>,
	href = typeof window === "undefined"
		? "http://127.0.0.1/"
		: window.location.href,
): string {
	let url: URL;
	try {
		url = new URL(href);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
	} catch {
		url = new URL("http://127.0.0.1/");
	}
	url.searchParams.set("cmsTestDeployment", input.deploymentId);
	url.searchParams.set("cmsTestSnapshot", input.snapshotHash);
	url.searchParams.set("cmsTestPlacement", input.placementKey);
	url.searchParams.set("cmsTestLocale", input.locale);
	return url.toString();
}

/**
 * Records the server-side Test acceptance produced by a real mounted host.
 * The URL is an evidence pointer to the current local host and identity; it is
 * never presented as a screenshot or written as a success receipt by the client.
 */
export async function recordTestAcceptance(
	input: Readonly<{
		deploymentId: string;
		snapshotHash: string;
		placementKey: TestCampaignPlacement;
		locale: string;
		scenario: Scenario;
		hostVersion?: string;
	}>,
	signal?: AbortSignal,
): Promise<unknown> {
	const response = await fetch(
		`/api/touchpoints/test-runtime/test-deployments/${encodeURIComponent(input.deploymentId)}/acceptances`,
		{
			method: "POST",
			signal,
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				placementKey: input.placementKey,
				hostVersion: input.hostVersion ?? String(OPEN_DESIGN_HOST_VERSION),
				locale: input.locale,
				scenario: input.scenario,
				evidence: acceptanceEvidence(input),
				hostCompatibility: process.env.NEXT_PUBLIC_CMS_HOST_RELEASE
					? {
							version: 1,
							snapshotHash: input.snapshotHash,
							hostFamily: "open-design-desktop",
							platform: "desktop",
							hostRelease: process.env.NEXT_PUBLIC_CMS_HOST_RELEASE,
							runtime: {
								kind: "web-component",
								apiVersion: TOUCHPOINT_COMPONENT_V2_RUNTIME_API_VERSION,
								wrapperVersion: TOUCHPOINT_COMPONENT_V2_WRAPPER_VERSION,
								sdkVersion: TOUCHPOINT_COMPONENT_V2_SDK_VERSION,
							},
							capabilities:
								input.placementKey === TEST_CAMPAIGN_MODAL_PLACEMENT
									? [...TEST_CAMPAIGN_MODAL_CAPABILITIES]
									: input.placementKey === "opend.home.account-badge"
										? ["static-action"]
										: [...placementCapabilities],
						}
					: undefined,
			}),
		},
	);
	if (!response.ok)
		throw new Error(`touchpoint_test_acceptance_http_${response.status}`);
	return response.json().catch(() => undefined);
}

/** Called only after a current Test placement has mounted and become visible. */
export function recordVisibleTestTouchpoint(
	session: TestRuntimeSession,
	decision: TestDecision,
	placementKey: TestCampaignPlacement,
): void {
	if (
		currentTestSession !== session ||
		!session.isAuthorized(placementKey) ||
		session.decisions.get(placementKey) !== decision ||
		session.context.scenario !== "realtime" ||
		decision.testContext.scheduleState !== "active"
	)
		return;
	const snapshotHash =
		session.deployment.snapshotHash ?? decision.snapshotHash ?? "";
	const key = `${session.deployment.id}:${snapshotHash}:${placementKey}`;
	if (acceptanceState.has(key)) return;
	const delivery: AcceptanceDelivery = {
		controller: new AbortController(),
		accepted: false,
	};
	acceptanceState.set(key, delivery);
	// Visibility is evidence for this snapshot only. A renewed lease may replace
	// the session object, but the evidence never transfers to another snapshot,
	// tester or schedule state.
	const isCurrent = () => {
		const current = currentTestSession;
		const currentDecision = current?.decisions.get(placementKey);
		return (
			acceptanceState.get(key) === delivery &&
			!delivery.controller.signal.aborted &&
			current?.selectionKey === session.selectionKey &&
			current.isAuthorized(placementKey) &&
			current.context.testerMemberId === session.context.testerMemberId &&
			current.context.scenario === "realtime" &&
			current.deployment.id === session.deployment.id &&
			(current.deployment.snapshotHash ?? currentDecision?.snapshotHash ?? "") ===
				snapshotHash &&
			currentDecision?.testContext.scheduleState === "active"
		);
	};
	void deliverTestAcceptance(
		{
			deploymentId: session.deployment.id,
			snapshotHash,
			placementKey,
			locale: decision.content.locale,
			scenario: session.context.scenario,
		},
		delivery.controller.signal,
		isCurrent,
	)
		.then((accepted) => {
			if (accepted && isCurrent()) delivery.accepted = true;
		})
		.finally(() => {
			if (!delivery.accepted && acceptanceState.get(key) === delivery)
				acceptanceState.delete(key);
		});
}

/** Backoff before each retry of one visibility's receipt (OPEND-3327). */
export const TEST_ACCEPTANCE_RETRY_MS = [1_000, 3_000, 10_000, 30_000] as const;
/** Deadline of one receipt POST; a hanging request counts as a transport failure. */
export const TEST_ACCEPTANCE_REQUEST_TIMEOUT_MS = 10_000;

/** Server answers that can change on retry; every other 4xx is final. */
function retriesTestAcceptance(error: unknown): boolean {
	const status = /^touchpoint_test_acceptance_http_(\d+)$/.exec(
		error instanceof Error ? error.message : "",
	);
	if (!status) return true;
	const code = Number(status[1]);
	return code >= 500 || code === 408 || code === 429;
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		signal.addEventListener("abort", finish, { once: true });
		if (signal.aborted) finish();
	});
}

/**
 * Resolves once the page is shown again, or at once when it is not hidden.
 *
 * A hidden page is not a revoked session: `isCurrent` reads `!document.hidden`
 * through the lease, so without this pause a retry that fell while the tab was
 * in the background would end delivery for good, and the watcher that produced
 * the visibility has already stopped and will not produce another one.
 */
function waitUntilShown(signal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		const check = () => {
			if (document.hidden && !signal.aborted) return;
			document.removeEventListener("visibilitychange", check);
			signal.removeEventListener("abort", check);
			resolve();
		};
		document.addEventListener("visibilitychange", check);
		signal.addEventListener("abort", check, { once: true });
		check();
	});
}

/**
 * Delivers one visible placement's receipt at most once per success.
 *
 * A single visibility is the only evidence the watcher produces, so a lost
 * POST (5xx, transport failure, timeout) must be retried here rather than
 * waiting for a visibility that may never recur. Retries are bounded by
 * {@link TEST_ACCEPTANCE_RETRY_MS}, each attempt by its own deadline, and all
 * stop the moment `isCurrent` says the lease, decision or selection is gone.
 * The server stays the acceptance gate: a non-retryable 4xx ends delivery.
 */
async function deliverTestAcceptance(
	input: Parameters<typeof recordTestAcceptance>[0],
	signal: AbortSignal,
	isCurrent: () => boolean,
): Promise<boolean> {
	for (let attempt = 0; attempt <= TEST_ACCEPTANCE_RETRY_MS.length; attempt++) {
		if (attempt > 0) {
			await waitForRetry(TEST_ACCEPTANCE_RETRY_MS[attempt - 1]!, signal);
		}
		if (document.hidden) await waitUntilShown(signal);
		if (!isCurrent()) return false;
		const request = new AbortController();
		const cancel = () => request.abort();
		signal.addEventListener("abort", cancel, { once: true });
		const timeout = setTimeout(cancel, TEST_ACCEPTANCE_REQUEST_TIMEOUT_MS);
		// A transport that ignores the abort signal must not hold delivery forever.
		const abandoned = new Promise<never>((_resolve, reject) =>
			request.signal.addEventListener(
				"abort",
				() => reject(new Error("touchpoint_test_acceptance_timeout")),
				{ once: true },
			),
		);
		try {
			await Promise.race([recordTestAcceptance(input, request.signal), abandoned]);
			return isCurrent();
		} catch (error) {
			// Hidden is paused, not revoked: the next attempt waits to be shown.
			if (!isCurrent() && !document.hidden) return false;
			emitWebTouchpointDiagnostic({
				code:
					error instanceof Error
						? error.message
						: "touchpoint_test_acceptance_failed",
				detail: JSON.stringify({
					deploymentId: input.deploymentId,
					snapshotHash: input.snapshotHash,
					placementKey: input.placementKey,
					attempt: attempt + 1,
				}),
			});
			if (!retriesTestAcceptance(error)) return false;
		} finally {
			clearTimeout(timeout);
			signal.removeEventListener("abort", cancel);
		}
	}
	return false;
}

/**
 * A campaign CTA hands the user to its target and ends the presentation with
 * it: an accepted action closes the host modal, while a refused, expired or
 * failed one rejects to the component and leaves the modal where it is. The
 * close applies only to the presentation that dispatched the action; one
 * replaced, revoked or unmounted while the navigation was pending is left to
 * its own lifecycle.
 */
export async function completeCampaignAction(
	accepted: Promise<boolean>,
	requestClose: (() => void) | undefined,
	stillCurrent: () => boolean,
): Promise<void> {
	requireCampaignAction(await accepted);
	if (stillCurrent()) requestClose?.();
}

export type TestTouchpointMountProps = Readonly<{
	decision: TestDecision;
	placementKey: TestCampaignPlacement;
	testId: string;
	className?: string;
	onVisible: (
		decision: TestDecision,
		placementKey: TestCampaignPlacement,
	) => void;
	requestClose?: () => void;
	isAuthorized: () => boolean;
	onCloseControlChange?: (available: boolean | null) => void;
	/**
	 * Reports that content became ready (`true`) or failed to verify or mount
	 * (`false`). A replacement in flight reports nothing until it settles.
	 */
	onPresentedChange?: (presented: boolean) => void;
}>;

/** Mounts one immutable v2 placement in the real OpenDesign Shadow DOM host. */
export function TestTouchpointMount({
	decision,
	placementKey,
	testId,
	className,
	onVisible,
	requestClose,
	isAuthorized,
	onCloseControlChange,
	onPresentedChange,
}: TestTouchpointMountProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		setReady(false);
		let active = true;
		const authorized = () =>
			active &&
			isAuthorized() &&
			currentTestSession?.isAuthorized(placementKey) === true &&
			currentTestSession.decisions.get(placementKey) === decision;
		const dispose = mountTouchpoint(container, {
			content: decision.content,
			placementKey,
			staticActions: decision.staticActions,
			mode: "test",
			// The runtime decision carries the locale requested by app i18n.
			// Global DOM language can be overwritten by an embedded editor.
			locale: decision.content.locale,
			isCurrent: authorized,
			dispatchAction: async (id) => {
				// Only the modal ends with its CTA; a hover entry stays in place.
				await completeCampaignAction(
					dispatchTestCampaignAction(decision, id),
					placementKey === "opend.home.campaign-modal" ? requestClose : undefined,
					authorized,
				);
			},
			requestClose,
			onCloseControlChange,
			onReady: () => {
				if (!authorized()) return;
				setReady(true);
				onPresentedChange?.(true);
			},
			onVisible: () => {
				if (authorized()) onVisible(decision, placementKey);
			},
			onError: (error) => {
				emitWebTouchpointDiagnostic({
					code: error,
				});
				onPresentedChange?.(false);
			},
		});
		return () => {
			active = false;
			dispose();
		};
	}, [
		decision,
		isAuthorized,
		onCloseControlChange,
		onPresentedChange,
		onVisible,
		placementKey,
		requestClose,
	]);
	return (
		<div
			ref={containerRef}
			className={className}
			data-testid={testId}
			hidden={!ready}
		/>
	);
}

/**
 * Keeps the placements whose whole presentation loaded (OPEND-3298 P1).
 *
 * A withdrawal anywhere withdraws the deployment, so it is rethrown. When
 * every presentation failed, the first failure is rethrown so the lifecycle
 * keeps its error handling. Otherwise each failed presentation is reported
 * and dropped, and the healthy ones are returned in placement order.
 */
function isolateTestPresentationFailures<T>(
	placements: readonly TestCampaignPlacement[],
	settled: readonly PromiseSettledResult<T>[],
): T[] {
	const failed = new Map<TestCampaignPlacement, unknown>();
	settled.forEach((result, index) => {
		if (result.status === "rejected") failed.set(placements[index]!, result.reason);
	});
	const withdrawal = [...failed.values()].find(touchpointWithdrawsDisplay);
	if (withdrawal) throw withdrawal;
	if (!failed.size)
		return settled.map((result) => (result as PromiseFulfilledResult<T>).value);
	const healthy: T[] = [];
	settled.forEach((result, index) => {
		const placementKey = placements[index]!;
		const presentation = testPresentationOf(placementKey).filter((key) =>
			placements.includes(key),
		);
		if (
			result.status === "fulfilled" &&
			!presentation.some((key) => failed.has(key))
		)
			healthy.push(result.value);
	});
	const [first] = failed.values();
	if (!healthy.length) throw first;
	for (const error of failed.values())
		emitWebTouchpointDiagnostic(testLoadDiagnostic(error));
	return healthy;
}

function validIso(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
			value,
		) &&
		Number.isFinite(Date.parse(value))
	);
}

/** Real Electron Test harness for all enabled OpenDesign placements. */
export function TestCampaignModal({
	authenticated,
	sessionSubject,
}: {
	authenticated: boolean;
	sessionSubject?: string | null;
}) {
	const { locale } = useI18n();
	const compatible = supportsHost(authenticated);
	const owner = sessionSubject ?? null;
	const [showControls] = useState(
		() =>
			typeof window !== "undefined" &&
			new URLSearchParams(window.location.search).get("cmsTestControls") === "1",
	);
	const {
		deployments,
		selected: deployment,
		select,
	} = useTestDeploymentSelection({
		enabled: compatible,
		owner,
		manual: showControls,
	});
	const publishedSession = useRef<TestRuntimeSession | null>(null);
	useEffect(() => {
		ensureWebTouchpointElement();
	}, []);

	const adapter = useMemo(() => {
		if (!deployment) return null;
		const selected = deployment;
		const placements = testPlacementIds(selected);
		// A snapshot may be renewed without remounting only within the same UI language.
		const selectionKey = JSON.stringify([
			selected.id,
			selected.snapshotHash ?? "",
			locale,
		]);
		let context: TestContext | null = null;
		let contextRequest: Promise<TestContext | null> | null = null;
		let windowBounds: Readonly<{ startsAt: number; endsAt: number }> | null =
			null;
		/**
		 * The last answer each placement received, with the monotonic time its
		 * authority runs out. A renewal whose placement is merely slow presents
		 * that answer again, but only within the authority it already granted.
		 */
		const lastAuthorized = new Map<
			TestCampaignPlacement,
			{ context: TestContext; item: LoadedTestPlacement }
		>();
		/** Resolves `null` for a context response this selection cannot use. */
		const fetchContext = async (signal: AbortSignal): Promise<TestContext | null> => {
			const response = await fetch("/api/touchpoints/test-runtime/context", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					deploymentId: selected.id,
					scenario: "realtime",
				}),
				signal,
			});
			if (!response.ok)
				throw new TestRuntimeResponseError(
					"realtime_test_runtime_required",
					response.status,
				);
			const next = (await response.json()) as TestContext;
			return next &&
				next.deploymentId === selected.id &&
				next.scenario === "realtime" &&
				!("simulatedAt" in next) &&
				validIso(next.updatedAt)
				? next
				: null;
		};
		/**
		 * Single-flight: every caller that needs a context while one is being
		 * fetched shares that request, and only the in-flight request installs
		 * its result.
		 */
		const acquireContext = (signal: AbortSignal): Promise<TestContext | null> => {
			if (!contextRequest) {
				const request: Promise<TestContext | null> = fetchContext(signal)
					.then((next) => {
						if (contextRequest === request) context = next;
						return next;
					})
					.finally(() => {
						if (contextRequest === request) contextRequest = null;
					});
				contextRequest = request;
			}
			return contextRequest;
		};
		const load = async (
			signal: AbortSignal,
			active: TestRuntimeValue | null,
		): Promise<TouchpointLifecycleLoad<TestRuntimeValue>> => {
			const started = testClock();
			const current = () => !signal.aborted;
			if (!placements.length) return { kind: "clear" };
			// A held context must not add a turn before the placement requests start.
			let selectedContext: TestContext;
			if (context) selectedContext = context;
			else {
				const acquired = await acquireContext(signal);
				if (!current()) return { kind: "retain" };
				if (!acquired) return { kind: "clear" };
				selectedContext = acquired;
			}
			/**
			 * A withdrawal from any placement is the server's answer for the whole
			 * campaign, so it must not wait behind a sibling that hangs until the
			 * lifecycle's request budget aborts the attempt — an aborted attempt is
			 * retained, and the withdrawal it collected would be lost with it. The
			 * first withdrawal cancels the siblings and settles the attempt at once.
			 */
			const loadPlacements = async (selectedContext: TestContext) => {
				const siblings = new AbortController();
				const cancelSiblings = () => siblings.abort();
				signal.addEventListener("abort", cancelSiblings, { once: true });
				let withdrawal: unknown = null;
				try {
					const settled = await Promise.allSettled(
						placements.map((placementKey) => {
							// A hung placement must not hold back its healthy siblings until the
							// lifecycle abandons the whole attempt.
							const request = new AbortController();
							const cancelRequest = () => request.abort();
							siblings.signal.addEventListener("abort", cancelRequest, { once: true });
							let timer: ReturnType<typeof setTimeout> | undefined;
							const expired = new Promise<never>((_resolve, reject) => {
								timer = setTimeout(() => {
									request.abort();
									reject(new TestPlacementTimeoutError(placementKey));
								}, TEST_PLACEMENT_REQUEST_TIMEOUT_MS);
							});
							return Promise.race([
								loadPlacement(selectedContext, placementKey, request.signal),
								expired,
							])
								.catch((error: unknown) => {
									if (touchpointWithdrawsDisplay(error)) {
										withdrawal ??= error;
										siblings.abort();
									}
									throw error;
								})
								.finally(() => {
									clearTimeout(timer);
									siblings.signal.removeEventListener("abort", cancelRequest);
								});
						}),
					);
					if (withdrawal) throw withdrawal;
					return settled;
				} finally {
					signal.removeEventListener("abort", cancelSiblings);
				}
			};
			const loadPlacement = async (
				selectedContext: TestContext,
				placementKey: (typeof placements)[number],
				requestSignal: AbortSignal,
			) => {
					const query = new URLSearchParams({
						deploymentId: selected.id,
						placementKey,
						locale,
					});
					// Server time precedes its awaited reads; request and body latency consume the grant.
					const received = testClock();
					const response = await fetch("/api/touchpoints/test-runtime?" + query, {
						cache: "no-store",
						signal: requestSignal,
					});
					if (!current()) return null;
					if (!response.ok)
						throw new TestRuntimeResponseError(
							"touchpoint_test_load_failed",
							response.status,
						);
					const decision = (await response.json()) as TestDecision;
					if (!current() || requestSignal.aborted) return null;
					if (
						!decision ||
						!decisionMatchesSelection(
							decision,
							selectedContext,
							selected,
							placementKey,
						)
					)
						throw isContextGenerationDrift(decision, selectedContext)
							? new StaleTestContextError(
									decisionMismatchDetail(
										decision,
										selectedContext,
										selected,
										placementKey,
									),
								)
							: new TestDecisionMismatchError(
									decisionMismatchDetail(
										decision,
										selectedContext,
										selected,
										placementKey,
									),
								);
					if (
						!validIso(decision.serverTime) ||
						!validIso(decision.startsAt) ||
						!validIso(decision.endsAt) ||
						!validIso(decision.authorizationExpiresAt) ||
						decision.testContext.scenario !== "realtime" ||
						"simulatedAt" in decision.testContext
					)
						throw new Error("realtime_test_runtime_required");
					const serverTime = Date.parse(decision.serverTime);
					const startsAt = Date.parse(decision.startsAt);
					const endsAt = Date.parse(decision.endsAt);
					if (startsAt >= endsAt) throw new Error("realtime_test_runtime_required");
					const expected =
						serverTime < startsAt
							? "before"
							: serverTime < endsAt
								? "active"
								: "ended";
					if (decision.testContext.scheduleState !== expected)
						throw new Error("realtime_test_runtime_required");
					const capabilities =
						placementKey === TEST_CAMPAIGN_MODAL_PLACEMENT
							? supportedCapabilities
							: placementCapabilities;
					if (
						!supportsWebTouchpointCapabilities(
							decision.content,
							decision.requiredCapabilities,
							capabilities,
						)
					)
						throw new Error("touchpoint_capability_unsupported");
					if (expected === "ended")
						return {
							placementKey,
							decision,
							startsAt,
							endsAt,
							serverTime,
							validForMs: 0,
							received,
						};
					const deadline = resolveAuthorizationDeadline(decision, TEST_MAX_AUTHORIZATION_MS);
					if (deadline === null) throw new Error("realtime_test_runtime_required");
					return {
						placementKey,
						decision,
						startsAt,
						endsAt,
						serverTime,
						validForMs: deadline - serverTime,
						received,
					};
			};
			let settled = await loadPlacements(selectedContext);
			if (!current()) return { kind: "retain" };
			const failures = (results: typeof settled) =>
				results.flatMap((result) =>
					result.status === "rejected" ? [result.reason as unknown] : [],
				);
			if (failures(settled).some((error) => error instanceof StaleTestContextError)) {
				const withdrawal = failures(settled).find(touchpointWithdrawsDisplay);
				if (withdrawal) throw withdrawal;
				// The server moved to a new context generation. Refetch it once for
				// this attempt; a server refusal throws and never restores the old one.
				if (context === selectedContext) context = null;
				const refreshed = context ?? (await acquireContext(signal));
				if (!current()) return { kind: "retain" };
				if (!refreshed) return { kind: "clear" };
				selectedContext = refreshed;
				settled = await loadPlacements(selectedContext);
				if (!current()) return { kind: "retain" };
			}
			// Record every fresh answer, then let a placement that is on screen but
			// merely slow present its last answer again. Only that placement is
			// held back, and only within the authority its answer granted: its
			// healthy siblings still adopt their own renewals, so one hung request
			// can no longer freeze the whole session until the first lease lapses.
			settled = settled.map((result, index): (typeof settled)[number] => {
				const placementKey = placements[index]!;
				if (result.status === "fulfilled") {
					if (result.value)
						lastAuthorized.set(placementKey, {
							context: selectedContext,
							item: result.value,
						});
					return result;
				}
				if (
					!(result.reason instanceof TestPlacementTimeoutError) ||
					!active?.decisions.has(placementKey)
				)
					return result;
				const previous = lastAuthorized.get(placementKey);
				if (!previous || previous.context !== selectedContext) return result;
				const remaining =
					previous.item.validForMs - testElapsed(previous.item.received);
				// Each placement expires independently; a short hold cannot cap its siblings.
				if (remaining <= 0) return result;
				return {
					status: "fulfilled",
					value: previous.item,
				};
			});
			const loaded = isolateTestPresentationFailures(placements, settled);
			if (!current()) return { kind: "retain" };
			const decisions = loaded.filter(
				(item): item is NonNullable<typeof item> => item !== null,
			);
			if (decisions.length !== loaded.length) return { kind: "retain" };
			const first = decisions[0];
			if (
				!first ||
				decisions.some(
					(item) => item.startsAt !== first.startsAt || item.endsAt !== first.endsAt,
				)
			)
				throw new TestDecisionMismatchError(
					JSON.stringify({
						deploymentId: selected.id,
						placements: decisions.map((item) => ({
							placementKey: item.placementKey,
							startsAt: item.decision.startsAt,
							endsAt: item.decision.endsAt,
						})),
					}),
				);
			if (
				windowBounds &&
				(windowBounds.startsAt !== first.startsAt ||
					windowBounds.endsAt !== first.endsAt)
			)
				throw new TestDecisionMismatchError(
					JSON.stringify({
						deploymentId: selected.id,
						placementKey: first.placementKey,
						expected: windowBounds,
						received: { startsAt: first.startsAt, endsAt: first.endsAt },
					}),
				);
			windowBounds = { startsAt: first.startsAt, endsAt: first.endsAt };
			if (
				decisions.some(
					(item) => item.decision.testContext.scheduleState === "ended",
				)
			)
				return { kind: "clear", ended: true };
			if (
				decisions.some(
					(item) => item.decision.testContext.scheduleState === "before",
				)
			)
				return {
					kind: "waiting",
					retryAfterMs: Math.max(
						...decisions.map((item) => item.startsAt - item.serverTime),
					),
				};
			const remaining = (item: LoadedTestPlacement) => item.validForMs - testElapsed(item.received);
			const authorized = decisions.filter((item) => remaining(item) > 0);
			if (!authorized.length) return { kind: "clear" };
			// The session lasts through its longest grant. Its placements are pruned
			// separately at their own deadlines, without rebuilding healthy hosts.
			const sameContext = active?.selectionKey === selectionKey && active.context === selectedContext;
			const session = Object.freeze<TestRuntimeValue>({
				selectionKey,
				deployment: selected,
				context: selectedContext,
				decisions: new Map(authorized.map((item) => [
					item.placementKey,
					(sameContext && active.decisions.get(item.placementKey)) || item.decision,
				])),
				authorizations: new Map(authorized.map((item) => [item.placementKey, {
					received: item.received, validForMs: item.validForMs,
				}])),
			});
			return {
				kind: "decision",
				value: session,
				key: JSON.stringify([
					selectionKey,
					selectedContext.updatedAt,
					selectedContext.testerMemberId ?? null,
				]),
				// Convert the remaining placement grants to the lifecycle's load-start baseline.
				validForMs: Math.max(...authorized.map(remaining)) + testElapsed(started),
				replaceValue: true,
			};
		};
		return { selectionKey, load };
	}, [deployment, locale]);

	const load = useCallback(
		(signal: AbortSignal, active: TestRuntimeValue | null) =>
			adapter
				? adapter.load(signal, active)
				: Promise.resolve({ kind: "clear" } as const),
		[adapter],
	);
	const lifecycle = useTouchpointLifecycle<TestRuntimeValue>({
		enabled: compatible && adapter !== null,
		identity: adapter ? owner + ":" + adapter.selectionKey : null,
		load,
		onError: (error) => emitWebTouchpointDiagnostic(testLoadDiagnostic(error)),
	});
	const authorityRef = useRef(lifecycle.current);
	authorityRef.current = lifecycle.current;
	const expired = useRef(new WeakSet<TestClock>());
	const [, expirePlacement] = useState(0);
	const isSessionAuthorized = useCallback((placementKey?: TestCampaignPlacement) => {
		if (!lifecycle.isCurrent(lifecycle.generation)) return false;
		if (!placementKey) return true;
		const grant = authorityRef.current?.authorizations.get(placementKey);
		return !!grant && !expired.current.has(grant.received) && testElapsed(grant.received) < grant.validForMs;
	}, [lifecycle.generation, lifecycle.isCurrent]);
	// A held placement may end between polls, even while another round is in flight.
	// Retire that grant once; a later clock correction cannot revive it.
	const live: TestCampaignPlacement[] = [];
	let nextExpiry = Infinity;
	for (const placementKey of lifecycle.current?.decisions.keys() ?? []) {
		const grant = lifecycle.current!.authorizations.get(placementKey)!;
		const remaining = grant.validForMs - testElapsed(grant.received);
		if (remaining <= 0) expired.current.add(grant.received);
		if (!expired.current.has(grant.received)) {
			live.push(placementKey);
			nextExpiry = Math.min(nextExpiry, remaining);
		}
	}
	const liveKey = live.join("\n");
	useEffect(() => {
		if (!Number.isFinite(nextExpiry)) return;
		const timer = setTimeout(() => expirePlacement((tick) => tick + 1), nextExpiry);
		return () => clearTimeout(timer);
	}, [lifecycle.current, nextExpiry]);
	// Publish a new session only when the lease or its live placements change.
	const runtimeSession = useMemo(() => {
		const current = lifecycle.current;
		if (!current) return null;
		const keys = liveKey ? (liveKey.split("\n") as TestCampaignPlacement[]) : [];
		return Object.freeze<TestRuntimeSession>({
			...current,
			decisions: new Map(keys.map((key) => [key, current.decisions.get(key)!])),
			isAuthorized: isSessionAuthorized,
		});
	}, [lifecycle.current, liveKey, isSessionAuthorized]);
	useEffect(() => {
		if (!deployment) {
			publishedSession.current = null;
			clearTestRuntimeSession();
			return;
		}
		const session =
			runtimeSession ??
			Object.freeze<TestRuntimeSession>({
				selectionKey:
					adapter?.selectionKey ??
					deployment.id + ":" + (deployment.snapshotHash ?? ""),
				deployment,
				context: {
					deploymentId: deployment.id,
					scenario: "realtime",
					updatedAt: "",
				},
				decisions: new Map<TestCampaignPlacement, TestDecision>(),
				isAuthorized: () => false,
			});
		publishedSession.current = session;
		setTestRuntimeSession(session);
	}, [adapter, deployment, runtimeSession]);
	useEffect(
		() => () => {
			if (currentTestSession === publishedSession.current)
				clearTestRuntimeSession();
		},
		[],
	);

	if (!showControls || !compatible || deployments.length === 0) return null;
	return (
		<div className={styles.control} data-testid="touchpoint-test-selector">
			<label>
				Test activity
				<select
					aria-label="Test activity"
					value={deployment?.id ?? ""}
					onChange={(event) => {
						select(event.target.value);
					}}
				>
					<option value="">Select a Test activity</option>
					{deployments.map((candidate) => (
						<option key={candidate.id} value={candidate.id}>
							{candidate.activityId}
						</option>
					))}
				</select>
			</label>
			{deployment && (
				<output role="status" data-testid="touchpoint-test-clock">
					Test time: realtime / {lifecycle.status ?? "loading"}
				</output>
			)}
		</div>
	);
}
