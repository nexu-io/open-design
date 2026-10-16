import { captureCmsVisible, cmsPrimaryCapture } from "../analytics/cms-touchpoints";
import { watchTouchpointVisibility } from "./touchpoint-lifecycle";
import { useTouchpointLoadOwner } from "./touchpoint-load-observability";
import { requireCampaignAction } from "./touchpoint-navigation";
import { useAnalytics } from "../analytics/provider";
import { useI18n } from "../i18n";
import { useCallback, useEffect, useRef } from "react";
import { getOpenDesignHost } from "@open-design/host";
import {
	emitWebTouchpointDiagnostic,
	ensureWebTouchpointElement,
	readWebTouchpointHostContext,
	supportsWebTouchpointCapabilities,
	verifyWebTouchpoint,
	webTouchpointContext,
	type OpenDesignTouchpointElement,
	type WebTouchpointContent,
} from "./touchpoint-component";
import {
	touchpointStaticActionsMatch,
	type TouchpointStaticAction,
} from "./touchpoint-static-actions";
import { dispatchProductionCampaignAction } from "./ProductionCampaignModal";
import { emitProductionTouchpointLoadDiagnostic, loadProductionTouchpointDecision, productionTouchpointRecovery } from "./production-touchpoint-loader";
import { resolveAuthorizationDeadline, touchpointContentIdentity, touchpointScheduleWindowMs, touchpointTimeContext, touchpointLeaseValue, type TouchpointLeaseValue, type TouchpointLifecycleLoad, useTouchpointLifecycle } from "./touchpoint-lifecycle";
import {
	TestTouchpointMount,
	recordVisibleTestTouchpoint,
	useTestRuntime,
} from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import styles from "./ProductionCampaignBadge.module.css";

const PLACEMENT = "opend.home.account-badge";
const supportedCapabilities = new Set(["static-action", "countdown-v1", "action-console-pricing-v1"]);
type Decision = {
	activityId: string;
	authorizationExpiresAt: string;
	content: WebTouchpointContent;
	deploymentId: string;
	endsAt: string;
	placementKey: string;
	requiredCapabilities: string[];
	serverTime: string;
	staticActions: TouchpointStaticAction[];
	touchpointDecisionId: string;
};
type AuthorizedDecision = TouchpointLeaseValue<Decision> & {
	sessionSubject: string;
};

export function canRenderProductionCampaignBadge(
	authenticated: boolean,
	sessionSubject: string | null,
) {
	const host = getOpenDesignHost();
	return authenticated && Boolean(sessionSubject) && host?.client.type === "desktop";
}

/** Production account-badge host. Unlike modals, this placement never exposes close. */
export function ProductionCampaignBadge({
	authenticated,
	sessionSubject,
}: {
	authenticated: boolean;
	sessionSubject: string | null;
}) {
	const analytics = useAnalytics();
	const trackRef = useRef(analytics.track);
	trackRef.current = analytics.track;
	const testRuntime = useTestRuntime();
	// A sibling entering or leaving the session must not rebuild this placement.
	const testRuntimeRef = useRef(testRuntime);
	testRuntimeRef.current = testRuntime;
	const { locale } = useI18n();
	const observation = useTouchpointLoadOwner("production", sessionSubject, locale);
	const testDecision = testRuntime?.decisions.get(PLACEMENT);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const enabled = !testRuntime && canRenderProductionCampaignBadge(authenticated, sessionSubject) && Boolean(sessionSubject) && Boolean(locale);
	const load = useCallback(async (signal: AbortSignal, active: AuthorizedDecision | null): Promise<TouchpointLifecycleLoad<AuthorizedDecision>> => {
		if (!locale || !sessionSubject) return { kind: "clear" };
		const priorAttempt = observation.get(PLACEMENT);
		const loaded = await loadProductionTouchpointDecision(PLACEMENT, locale, signal, active?.touchpointDecisionId, observation);
		if (loaded.kind === "revoked") {
			if (active && loaded.receipt.touchpointDecisionId === active.touchpointDecisionId && loaded.receipt.deploymentId === active.deploymentId && loaded.receipt.activityId === active.activityId && loaded.receipt.contentVersionId === active.content.id) return { kind: "clear" };
			return { kind: "retain" };
		}
		// `absent` keeps the empty attempt renewable, so later no-activity polls
		// renew it instead of opening a new load attempt (OBS-003; same as modal/hover).
		if (loaded.kind === "no-decision") return active ? { kind: "retain" } : { kind: "clear", absent: true };
		const next = loaded.value as Decision;
		const deadline = resolveAuthorizationDeadline(next);
		if (!next.activityId || !next.touchpointDecisionId || !next.deploymentId || !next.content?.id || next.placementKey !== PLACEMENT || next.content?.placementKey !== PLACEMENT || deadline === null || !Number.isFinite(deadline)) {
			if (next.placementKey !== PLACEMENT || next.content?.placementKey !== PLACEMENT) emitWebTouchpointDiagnostic({ code: "touchpoint_decision_mismatch" });
			return { kind: "clear" };
		}
		if (!supportsWebTouchpointCapabilities(next.content, next.requiredCapabilities, supportedCapabilities)) {
			observation.reject(PLACEMENT, "capability_unsupported");
			emitWebTouchpointDiagnostic({ code: "touchpoint_capability_unsupported", detail: next.requiredCapabilities?.join(",") });
			return { kind: "clear" };
		}
		return { kind: "decision", value: { ...touchpointLeaseValue(next), sessionSubject }, replaceValue: observation.get(PLACEMENT) !== priorAttempt, key: touchpointContentIdentity(next), validForMs: deadline - Date.parse(next.serverTime), offlineValidForMs: touchpointScheduleWindowMs(next), offlineRecovery: productionTouchpointRecovery(loaded.offlineReplay) ?? undefined, timeContexts: new Map([[PLACEMENT, touchpointTimeContext(next, loaded.receivedAt)]]) };
	}, [locale, sessionSubject, observation]);
	const onError = useCallback((error: unknown) => {
		const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
		if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
	}, []);
	const lifecycle = useTouchpointLifecycle({ enabled, identity: enabled ? JSON.stringify([sessionSubject, locale]) : null, load, onError, observability: observation, offlineFallback: true });
	const decision = lifecycle.current;
	const clear = lifecycle.clear;
	const timeRef = useRef(lifecycle.timeContexts?.get(PLACEMENT));
	timeRef.current = lifecycle.timeContexts?.get(PLACEMENT);
	useEffect(() => {
		const element = containerRef.current?.querySelector<OpenDesignTouchpointElement>("opend-touchpoint");
		if (timeRef.current && decision?.content.runtime.apiVersion === 2) void element?.updateTime(timeRef.current).catch(() => clear());
	}, [clear, decision, lifecycle.timeContexts]);

	useEffect(() => {
		ensureWebTouchpointElement();
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (
			!container ||
			!decision ||
			!authenticated ||
			decision.sessionSubject !== sessionSubject
		)
			return;
		let cancelled = false;
		const mountGeneration = lifecycle.generation;
		const attempt = observation.get(PLACEMENT);
		let stopVisibility: (() => void) | undefined;
		const current = () =>
			!cancelled &&
			authenticated &&
			decision.sessionSubject === sessionSubject &&
			lifecycle.isCurrent(mountGeneration);
		// OPEND-3378: a mount abandoned only because the lease was momentarily
		// not current must be restarted by the next same-key grant.
		const abandonFencedMount = () => {
			attempt?.cancel("page_left");
			if (!cancelled) lifecycle.reportFencedMount(mountGeneration);
			dispose();
		};
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
				const decodeStarted = performance.now();
				verified = await verifyWebTouchpoint(decision.content);
				attempt?.enrich({ decode_validate_ms: Math.max(0, performance.now() - decodeStarted) });
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
					timeRef.current,
				);
				if (!current() || !context) {
					if (!current()) abandonFencedMount();
					else dispose();
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
						runtimeApiVersion: decision.content.runtime.apiVersion,
						attempt,
						dispatchAction: async (actionId) => {
							requireCampaignAction(await dispatchProductionCampaignAction(
								decision,
								actionId,
								mountGeneration,
								() => lifecycle.isCurrent(mountGeneration) ? mountGeneration : -1,
								lifecycle.deadline,
								{ track: trackRef.current, cmsCapture: cmsPrimaryCapture(attempt) },
							));
						},
						onDiagnostic: emitWebTouchpointDiagnostic,
					},
				);
				if (!current()) abandonFencedMount();
				else { attempt?.ready(); stopVisibility = watchTouchpointVisibility({ element, isCurrent: current, onVisible: () => { const eventId = attempt?.exposure(decision, detail => emitWebTouchpointDiagnostic({ code: "touchpoint_exposure_telemetry_failed", detail })); captureCmsVisible(trackRef.current, attempt, eventId); } }); }
			} catch (error) {
				if (current()) {
					attempt?.fail(error, "mount");
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
			stopVisibility?.();
			attempt?.cancel("page_left");
			dispose();
			container.replaceChildren();
		};
	}, [authenticated, decision, sessionSubject, clear, lifecycle.generation, lifecycle.isCurrent, lifecycle.reportFencedMount]);

	const onTestVisible = useCallback(
		(next: TestDecision, placementKey: TestCampaignPlacement) => {
			const runtime = testRuntimeRef.current;
			if (runtime) recordVisibleTestTouchpoint(runtime, next, placementKey, trackRef.current);
		},
		[],
	);
	if (authenticated && testRuntime && testDecision) {
		return (
			<div className={styles.badge} data-testid="production-campaign-badge">
				<TestTouchpointMount
					decision={testDecision}
					placementKey={PLACEMENT}
					testId="production-campaign-badge-element"
					isAuthorized={testRuntime.isAuthorized}
					onVisible={onTestVisible}
				/>
			</div>
		);
	}
	return authenticated && decision?.sessionSubject === sessionSubject ? (
		<div
			className={styles.badge}
			ref={containerRef}
			data-testid="production-campaign-badge"
		/>
	) : null;
}
