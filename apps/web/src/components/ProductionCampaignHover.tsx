import {
	prepareCmsTouchpointContent,
	captureCmsVisible,
	captureCmsClose,
	cmsPrimaryCapture,
} from "../analytics/cms-touchpoints";
import { useTouchpointLoadOwner } from "./touchpoint-load-observability";
import { useAnalytics } from "../analytics/provider";
import {
	dispatchTestCampaignAction,
	recordVisibleTestTouchpoint,
	recordTestTouchpointClose,
	testTouchpointLoadAttempt,
	testTouchpointTimeContext,
	useTestRuntime,
} from "./TestCampaignModal";
import { useI18n } from "../i18n";
import { useCallback, useMemo, useRef } from "react";
import { getOpenDesignHost } from "@open-design/host";
import {
	emitWebTouchpointDiagnostic,
	supportsWebTouchpointCapabilities,
	type WebTouchpointContent,
} from "./touchpoint-component";
import { HoverTouchpointOverlay } from "./HoverTouchpointOverlay";
import { dispatchProductionCampaignAction } from "./ProductionCampaignModal";
import {
	touchpointStaticActionsMatch,
	type TouchpointStaticAction,
} from "./touchpoint-static-actions";
import {
	emitProductionTouchpointLoadDiagnostic,
	loadProductionTouchpointDecision,
	productionTouchpointPairRecovery,
	productionTouchpointRecovery,
	ProductionTouchpointLoadError,
	type ProductionTouchpointLoadResult,
} from "./production-touchpoint-loader";
import {
	resolveAuthorizationDeadline,
	touchpointContentIdentity,
	touchpointLeaseValue,
	touchpointScheduleWindowMs,
	touchpointTimeContext,
	type TouchpointLeaseValue,
	type TouchpointLifecycleLoad,
	useTouchpointLifecycle,
} from "./touchpoint-lifecycle";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import { requireCampaignAction } from "./touchpoint-navigation";

const ENTRY_PLACEMENT = "opend.home.hover-entry";
const LAYER_PLACEMENT = "opend.home.hover-layer";
const supportedCapabilities = new Set(["hover", "static-action", "countdown-v1", "action-console-pricing-v1"]);
type RuntimeDecision = Readonly<{
	activityId: string;
	authorizationExpiresAt: string;
	touchpointDecisionId: string;
	deploymentId: string;
	endsAt: string;
	placementKey: string;
	serverTime: string;
	requiredCapabilities: string[];
	content: WebTouchpointContent;
	staticActions: TouchpointStaticAction[];
}>;
type ValidDecision = Readonly<{
	decision: TouchpointLeaseValue<RuntimeDecision>;
	actionIds: ReadonlySet<string>;
}>;
type ActiveHover = Readonly<{
	entry: ValidDecision;
	layer: ValidDecision;
	sessionSubject: string;
}>;

function validDecision(
	value: unknown,
	placementKey: string,
	onUnsupported: () => void,
): { valid: ValidDecision; validForMs: number; offlineValidForMs: number } | null {
	if (!value || typeof value !== "object") return null;
	const decision = value as RuntimeDecision;
	const deadline = resolveAuthorizationDeadline(decision);
	if (
		!decision.activityId ||
		!decision.touchpointDecisionId ||
		!decision.deploymentId ||
		!decision.content?.id ||
		decision.placementKey !== placementKey ||
		decision.content?.placementKey !== placementKey ||
		deadline === null ||
		!Number.isFinite(deadline)
	)
		return null;
	const placement = decision.content.manifest.placements.find(
		(candidate) => candidate.key === placementKey,
	);
	if (!supportsWebTouchpointCapabilities(decision.content, decision.requiredCapabilities, supportedCapabilities)) {
		onUnsupported();
		return null;
	}
	if (
		!placement ||
		!touchpointStaticActionsMatch(decision.staticActions, placement.staticActions)
	)
		return null;
	// `validForMs` is computed from the response's own timing, and only then is
	// the timing dropped: what the lease keeps is content identity.
	return {
		valid: {
			decision: touchpointLeaseValue(decision),
			actionIds: new Set(placement.staticActions.map((action) => action.id)),
		},
		validForMs: deadline - Date.parse(decision.serverTime),
		offlineValidForMs: touchpointScheduleWindowMs(decision),
	};
}

export function ProductionCampaignHover({
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
	const observation = useTouchpointLoadOwner(
		"production",
		sessionSubject,
		locale,
	);
	const testEntry = testRuntime?.decisions.get(ENTRY_PLACEMENT);
	const testLayer = testRuntime?.decisions.get(LAYER_PLACEMENT);
	const testEntryActionIds = useMemo(
		() =>
			testEntry && new Set(testEntry.staticActions.map((action) => action.id)),
		[testEntry],
	);
	const testLayerActionIds = useMemo(
		() =>
			testLayer && new Set(testLayer.staticActions.map((action) => action.id)),
		[testLayer],
	);
	const dispatchTestEntryAction = useCallback(
		async (actionId: string) => {
			if (testEntry)
				requireCampaignAction(
					await dispatchTestCampaignAction(testEntry, actionId, {
						track: trackRef.current,
					}),
				);
		},
		[testEntry],
	);
	const dispatchTestLayerAction = useCallback(
		async (actionId: string) => {
			if (testLayer)
				requireCampaignAction(
					await dispatchTestCampaignAction(testLayer, actionId, {
						track: trackRef.current,
					}),
				);
		},
		[testLayer],
	);
	const enabled =
		!testRuntime &&
		authenticated &&
		Boolean(sessionSubject) &&
		getOpenDesignHost()?.client.type === "desktop" &&
		Boolean(locale);
	const load = useCallback(
		async (
			signal: AbortSignal,
			active: ActiveHover | null,
		): Promise<TouchpointLifecycleLoad<ActiveHover>> => {
			if (!locale || !sessionSubject) return { kind: "clear" };
			const priorEntryAttempt = observation.get(ENTRY_PLACEMENT);
			const priorLayerAttempt = observation.get(LAYER_PLACEMENT);
			// Withdrawal is placement-local authority; renewal needs both answers.
			const results = await new Promise<
				| [
						PromiseSettledResult<ProductionTouchpointLoadResult>,
						PromiseSettledResult<ProductionTouchpointLoadResult>,
				  ]
				| null
			>((resolve, reject) => {
				// Cancel the sibling without aborting the lifecycle's ownership signal:
				// that signal must still authorize applying the withdrawal.
				const controller = new AbortController();
				let settled = false;
				const finish = (complete: () => void) => {
					if (settled) return;
					settled = true;
					signal.removeEventListener("abort", onAbort);
					complete();
					controller.abort();
				};
				const onAbort = () =>
					finish(() => reject(new DOMException("aborted", "AbortError")));
				signal.addEventListener("abort", onAbort, { once: true });
				if (signal.aborted) {
					onAbort();
					return;
				}
				const decisions = [active?.entry.decision, active?.layer.decision];
				const requests = [
					loadProductionTouchpointDecision(
						ENTRY_PLACEMENT,
						locale,
						controller.signal,
						decisions[0]?.touchpointDecisionId,
						observation,
					),
					loadProductionTouchpointDecision(
						LAYER_PLACEMENT,
						locale,
						controller.signal,
						decisions[1]?.touchpointDecisionId,
						observation,
					),
				] as const;
				requests.forEach((request, index) => {
					// Both rejection handlers stay attached after early completion, so an
					// abort or a transport that finishes late cannot escape or revive display.
					void request.then(
						(loaded) => {
							const decision = decisions[index];
							if (
								loaded.kind === "revoked" &&
								decision &&
								loaded.receipt.touchpointDecisionId ===
									decision.touchpointDecisionId &&
								loaded.receipt.deploymentId === decision.deploymentId &&
								loaded.receipt.activityId === decision.activityId &&
								loaded.receipt.contentVersionId === decision.content.id
							)
								finish(() => resolve(null));
						},
						(error: unknown) => {
							if (
								error instanceof ProductionTouchpointLoadError &&
								error.touchpointWithdrawal
							)
								finish(() => reject(error));
						},
					);
				});
				void Promise.allSettled(requests).then(([entry, layer]) => {
					finish(() => resolve([entry, layer]));
				});
			});
			if (!results) return { kind: "clear" };
			const [entryResult, layerResult] = results;
			const entryLoaded =
				entryResult.status === "fulfilled" ? entryResult.value : null;
			const layerLoaded =
				layerResult.status === "fulfilled" ? layerResult.value : null;
			for (const result of results) {
				if (result.status === "rejected") throw result.reason;
			}
			if (!entryLoaded || !layerLoaded) return { kind: "retain" };
			if (entryLoaded.kind === "revoked" || layerLoaded.kind === "revoked")
				return { kind: "retain" };
			if (
				entryLoaded.kind === "no-decision" ||
				layerLoaded.kind === "no-decision"
			)
				return active ? { kind: "retain" } : { kind: "clear", absent: true };
			if (entryLoaded.kind !== "decision" || layerLoaded.kind !== "decision")
				return { kind: "retain" };
			const entry = validDecision(entryLoaded.value, ENTRY_PLACEMENT, () =>
				observation.reject(ENTRY_PLACEMENT, "capability_unsupported"),
			);
			const layer = validDecision(layerLoaded.value, LAYER_PLACEMENT, () =>
				observation.reject(LAYER_PLACEMENT, "capability_unsupported"),
			);
			if (
				!entry ||
				!layer ||
				entry.valid.decision.activityId !== layer.valid.decision.activityId ||
				entry.valid.decision.deploymentId !== layer.valid.decision.deploymentId ||
				entry.valid.decision.content.id !== layer.valid.decision.content.id ||
				(entryLoaded.value as RuntimeDecision).endsAt !==
					(layerLoaded.value as RuntimeDecision).endsAt
			) {
				emitWebTouchpointDiagnostic({
					code: "touchpoint_pair_mismatch",
					detail: "opend.home.hover-entry:opend.home.hover-layer",
				});
				return { kind: "clear" };
			}
			await Promise.all([
				prepareCmsTouchpointContent(
					observation.forDecision(ENTRY_PLACEMENT, entry.valid.decision),
					entry.valid.decision,
					() => !signal.aborted,
				),
				prepareCmsTouchpointContent(
					observation.forDecision(LAYER_PLACEMENT, layer.valid.decision),
					layer.valid.decision,
					() => !signal.aborted,
				),
			]);
			if (signal.aborted) return { kind: "retain" };
			return {
				kind: "decision",
				value: { entry: entry.valid, layer: layer.valid, sessionSubject },
				replaceValue:
					observation.get(ENTRY_PLACEMENT) !== priorEntryAttempt ||
					observation.get(LAYER_PLACEMENT) !== priorLayerAttempt,
				timeContexts: new Map([
					[
						ENTRY_PLACEMENT,
						touchpointTimeContext(
							entryLoaded.value as RuntimeDecision,
							entryLoaded.receivedAt,
						),
					],
					[
						LAYER_PLACEMENT,
						touchpointTimeContext(
							layerLoaded.value as RuntimeDecision,
							layerLoaded.receivedAt,
						),
					],
				]),
				// Admission requires a single activity, deployment, content version
				// and schedule. Keep the existing mount key for compatible renewals.
				key: `${touchpointContentIdentity(entry.valid.decision)}:${layer.valid.decision.content.id}`,
				validForMs: Math.min(entry.validForMs, layer.validForMs),
				// The pair is only as scheduled as its shorter half.
				offlineValidForMs: Math.min(
					entry.offlineValidForMs,
					layer.offlineValidForMs,
				),
				// Both halves, not either — see `productionTouchpointPairRecovery`,
				// which also owns how the two recovery policies combine.
				offlineRecovery:
					productionTouchpointPairRecovery(
						productionTouchpointRecovery(entryLoaded.offlineReplay),
						productionTouchpointRecovery(layerLoaded.offlineReplay),
					) ?? undefined,
			};
		},
		[locale, sessionSubject, observation],
	);
	const onError = useCallback((error: unknown) => {
		const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
		if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
	}, []);
	const lifecycle = useTouchpointLifecycle({
		enabled,
		identity: enabled ? JSON.stringify([sessionSubject, locale]) : null,
		load,
		onError,
		observability: observation,
		offlineFallback: true,
	});
	const active = lifecycle.current;
	// Renewing the same lease must not change the overlay mount identity.
	const isTestAuthorized = useCallback(
		() =>
			testRuntimeRef.current?.isAuthorized(ENTRY_PLACEMENT) === true &&
			testRuntimeRef.current.isAuthorized(LAYER_PLACEMENT),
		[],
	);
	const isProductionAuthorized = useCallback(
		() => lifecycle.isCurrent(lifecycle.generation),
		[lifecycle.isCurrent, lifecycle.generation],
	);
	const onProductionFencedMount = useCallback(
		() => lifecycle.reportFencedMount(lifecycle.generation),
		[lifecycle.generation, lifecycle.reportFencedMount],
	);
	const onTestVisible = useCallback(
		(decision: TestDecision, placementKey: TestCampaignPlacement) => {
			const runtime = testRuntimeRef.current;
			if (runtime)
				recordVisibleTestTouchpoint(
					runtime,
					decision,
					placementKey,
					trackRef.current,
				);
		},
		[],
	);
	const onEntryVisible = useCallback(() => {
		if (testEntry) onTestVisible(testEntry, ENTRY_PLACEMENT);
	}, [onTestVisible, testEntry]);
	const onLayerVisible = useCallback(() => {
		if (testLayer) onTestVisible(testLayer, LAYER_PLACEMENT);
	}, [onTestVisible, testLayer]);
	const onTestLayerClose = useCallback(() => {
		if (testLayer && isTestAuthorized())
			recordTestTouchpointClose(testLayer, "close", trackRef.current);
	}, [testLayer, isTestAuthorized]);
	const onProductionLayerClose = useCallback(() => {
		if (!active || !isProductionAuthorized()) return;
		const attempt = observation.forDecision(LAYER_PLACEMENT, active.layer.decision);
		const eventId = captureCmsClose(trackRef.current, attempt, "close");
		if (eventId) attempt?.close(active.layer.decision, eventId, isProductionAuthorized,
			(detail) => emitWebTouchpointDiagnostic({ code: "touchpoint_close_telemetry_failed", detail }));
	}, [active, isProductionAuthorized, observation]);
	const onDiagnostic = useCallback(
		(code: string) => emitWebTouchpointDiagnostic({ code }),
		[],
	);
	const recordProductionExposure = useCallback(
		(placement: string) => {
			if (
				!active ||
				!lifecycle.isCurrent(lifecycle.generation) ||
				document.hidden
			)
				return;
			const decision =
				placement === ENTRY_PLACEMENT
					? active.entry.decision
					: active.layer.decision;
			const attempt = observation.forDecision(placement, decision);
			const eventId = attempt?.exposure(decision, (detail) =>
				emitWebTouchpointDiagnostic({
					code: "touchpoint_exposure_telemetry_failed",
					detail,
				}),
			);
			captureCmsVisible(trackRef.current, attempt, eventId);
		},
		[
			active,
			lifecycle.generation,
			lifecycle.isCurrent,
			sessionSubject,
			observation,
		],
	);
	const onProductionEntryVisible = useCallback(
		() => recordProductionExposure(ENTRY_PLACEMENT),
		[recordProductionExposure],
	);
	const onProductionLayerVisible = useCallback(
		() => recordProductionExposure(LAYER_PLACEMENT),
		[recordProductionExposure],
	);
	const dispatchEntryAction = useCallback(
		(actionId: string) => {
			if (!active) return Promise.resolve();
			const generation = lifecycle.generation;
			return dispatchProductionCampaignAction(
				active.entry.decision,
				actionId,
				generation,
				() => (lifecycle.isCurrent(generation) ? generation : -1),
				lifecycle.deadline,
				{
					track: trackRef.current,
					cmsCapture: cmsPrimaryCapture(
						observation.forDecision(
							active.entry.decision.placementKey,
							active.entry.decision,
						),
						active.entry.decision,
					),
				},
			).then(requireCampaignAction);
		},
		[active, lifecycle.generation, lifecycle.isCurrent],
	);
	const dispatchLayerAction = useCallback(
		(actionId: string) => {
			if (!active) return Promise.resolve();
			const generation = lifecycle.generation;
			return dispatchProductionCampaignAction(
				active.layer.decision,
				actionId,
				generation,
				() => (lifecycle.isCurrent(generation) ? generation : -1),
				lifecycle.deadline,
				{
					track: trackRef.current,
					cmsCapture: cmsPrimaryCapture(
						observation.forDecision(
							active.layer.decision.placementKey,
							active.layer.decision,
						),
						active.layer.decision,
					),
				},
			).then(requireCampaignAction);
		},
		[active, lifecycle.generation, lifecycle.isCurrent],
	);
	if (
		authenticated &&
		testRuntime &&
		testEntry &&
		testLayer &&
		testEntry.activityId === testLayer.activityId &&
		testEntry.deploymentId === testLayer.deploymentId
	)
		return (
			<HoverTouchpointOverlay
				entry={testEntry.content}
				entryAttempt={testTouchpointLoadAttempt(testEntry)}
				layerAttempt={testTouchpointLoadAttempt(testLayer)}
				layer={testLayer.content}
				isAuthorized={isTestAuthorized}
				mode="test"
				entryTime={testTouchpointTimeContext(testEntry)}
				layerTime={testTouchpointTimeContext(testLayer)}
				entryActionIds={testEntryActionIds}
				layerActionIds={testLayerActionIds}
				dispatchEntryAction={dispatchTestEntryAction}
				dispatchLayerAction={dispatchTestLayerAction}
				onEntryVisible={onEntryVisible}
				onLayerVisible={onLayerVisible}
				onLayerClose={onTestLayerClose}
				onDiagnostic={onDiagnostic}
			/>
		);
	return authenticated && active?.sessionSubject === sessionSubject ? (
		<HoverTouchpointOverlay
			entry={active.entry.decision.content}
			layer={active.layer.decision.content}
			isAuthorized={isProductionAuthorized}
			onFencedMount={onProductionFencedMount}
			entryAttempt={observation.get(ENTRY_PLACEMENT)}
			layerAttempt={observation.get(LAYER_PLACEMENT)}
			entryTime={lifecycle.timeContexts?.get(ENTRY_PLACEMENT)}
			layerTime={lifecycle.timeContexts?.get(LAYER_PLACEMENT)}
			onEntryVisible={onProductionEntryVisible}
			onLayerVisible={onProductionLayerVisible}
			onLayerClose={onProductionLayerClose}
			entryActionIds={active.entry.actionIds}
			layerActionIds={active.layer.actionIds}
			onDiagnostic={onDiagnostic}
			dispatchEntryAction={dispatchEntryAction}
			dispatchLayerAction={dispatchLayerAction}
		/>
	) : null;
}
