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
	type TouchpointLifecycleLoad,
	resolveAuthorizationDeadline,
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
	isAuthorized: () => boolean;
}>;
type TestRuntimeValue = Omit<TestRuntimeSession, "isAuthorized">;

let currentTestSession: TestRuntimeSession | null = null;
const testRuntimeListeners = new Set<() => void>();
const acceptanceState = new Map<string, "in-flight" | "accepted">();
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
	if (currentTestSession?.selectionKey !== session?.selectionKey)
		acceptanceState.clear();
	currentTestSession = session;
	for (const listener of testRuntimeListeners) listener();
}
export function clearTestRuntimeSession(): void {
	if (!currentTestSession) return;
	currentTestSession = null;
	acceptanceState.clear();
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
	constructor() {
		super("touchpoint_decision_mismatch");
	}
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
		session.isAuthorized() &&
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

export function readCampaignHostLocale(): string {
	return (
		document.documentElement.lang.trim() ||
		getOpenDesignHost()?.client.osLocale?.trim() ||
		"en-US"
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
): Promise<unknown> {
	const response = await fetch(
		`/api/touchpoints/test-runtime/test-deployments/${encodeURIComponent(input.deploymentId)}/acceptances`,
		{
			method: "POST",
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
		!session.isAuthorized() ||
		session.decisions.get(placementKey) !== decision ||
		session.context.scenario !== "realtime" ||
		decision.testContext.scheduleState !== "active"
	)
		return;
	const key = `${session.deployment.id}:${session.deployment.snapshotHash ?? decision.snapshotHash ?? ""}:${placementKey}`;
	if (acceptanceState.has(key)) return;
	acceptanceState.set(key, "in-flight");
	void recordTestAcceptance({
		deploymentId: session.deployment.id,
		snapshotHash: session.deployment.snapshotHash ?? decision.snapshotHash ?? "",
		placementKey,
		locale: decision.content.locale,
		scenario: session.context.scenario,
	})
		.then(() => acceptanceState.set(key, "accepted"))
		.catch((error) => {
			acceptanceState.delete(key);
			emitWebTouchpointDiagnostic({
				code:
					error instanceof Error
						? error.message
						: "touchpoint_test_acceptance_failed",
			});
		});
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
}: TestTouchpointMountProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		setReady(false);
		const authorized = () =>
			isAuthorized() &&
			currentTestSession?.isAuthorized() === true &&
			currentTestSession.decisions.get(placementKey) === decision;
		return mountTouchpoint(container, {
			content: decision.content,
			placementKey,
			staticActions: decision.staticActions,
			mode: "test",
			locale: readCampaignHostLocale(),
			isCurrent: authorized,
			dispatchAction: async (id) => {
				requireCampaignAction(await dispatchTestCampaignAction(decision, id));
			},
			requestClose,
			onCloseControlChange,
			onReady: () => {
				if (authorized()) setReady(true);
			},
			onVisible: () => {
				if (authorized()) onVisible(decision, placementKey);
			},
			onError: (error) =>
				emitWebTouchpointDiagnostic({
					code: error,
				}),
		});
	}, [
		decision,
		isAuthorized,
		onCloseControlChange,
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
			if (!response.ok) throw new Error("realtime_test_runtime_required");
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
			const loadPlacements = (selectedContext: TestContext) => Promise.all(
				placements.map(async (placementKey) => {
					const query = new URLSearchParams({
						deploymentId: selected.id,
						placementKey,
						locale,
					});
					const response = await fetch("/api/touchpoints/test-runtime?" + query, {
						cache: "no-store",
						signal,
					});
					if (!current()) return null;
					if (!response.ok) throw new Error("touchpoint_test_load_failed");
					const decision = (await response.json()) as TestDecision;
					if (!current()) return null;
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
							? new StaleTestContextError()
							: new Error("touchpoint_decision_mismatch");
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
						};
					const deadline = resolveAuthorizationDeadline(decision, 60_000, true);
					if (deadline === null) throw new Error("realtime_test_runtime_required");
					return {
						placementKey,
						decision,
						startsAt,
						endsAt,
						serverTime,
						validForMs: deadline - serverTime,
					};
				}),
			);
			let loaded: Awaited<ReturnType<typeof loadPlacements>>;
			try {
				loaded = await loadPlacements(selectedContext);
			} catch (error) {
				if (!(error instanceof StaleTestContextError) || !current()) throw error;
				// The server moved to a new context generation. Refetch it once for
				// this attempt; a server refusal throws and never restores the old one.
				if (context === selectedContext) context = null;
				const refreshed = context ?? (await acquireContext(signal));
				if (!current()) return { kind: "retain" };
				if (!refreshed) return { kind: "clear" };
				selectedContext = refreshed;
				loaded = await loadPlacements(selectedContext);
			}
			if (!current()) return { kind: "retain" };
			const decisions = loaded.filter(
				(item): item is NonNullable<typeof item> => item !== null,
			);
			if (decisions.length !== placements.length) return { kind: "retain" };
			const first = decisions[0];
			if (
				!first ||
				decisions.some(
					(item) => item.startsAt !== first.startsAt || item.endsAt !== first.endsAt,
				)
			)
				throw new Error("touchpoint_decision_mismatch");
			if (
				windowBounds &&
				(windowBounds.startsAt !== first.startsAt ||
					windowBounds.endsAt !== first.endsAt)
			)
				throw new Error("touchpoint_decision_mismatch");
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
			const validForMs = Math.min(...decisions.map((item) => item.validForMs));
			if (validForMs <= 0) return { kind: "clear" };
			// A refreshed context is a new authorization generation: publish its
			// decisions under a new lease key instead of renewing the stale session.
			const session =
				active?.selectionKey === selectionKey && active.context === selectedContext
					? active
					: Object.freeze<TestRuntimeValue>({
							selectionKey,
							deployment: selected,
							context: selectedContext,
							decisions: new Map(
								decisions.map((item) => [item.placementKey, item.decision]),
							),
						});
			return {
				kind: "decision",
				value: session,
				key: JSON.stringify([
					selectionKey,
					selectedContext.updatedAt,
					selectedContext.testerMemberId ?? null,
				]),
				validForMs,
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
		onError: (error) =>
			emitWebTouchpointDiagnostic({
				code:
					error instanceof Error ? error.message : "touchpoint_test_load_failed",
			}),
	});
	const runtimeSession = useMemo(
		() =>
			lifecycle.current &&
			Object.freeze<TestRuntimeSession>({
				...lifecycle.current,
				isAuthorized: () => lifecycle.isCurrent(lifecycle.generation),
			}),
		[lifecycle.current, lifecycle.generation, lifecycle.isCurrent],
	);
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
