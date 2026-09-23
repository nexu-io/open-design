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
import { resolveAuthorizationDeadline, touchpointContentIdentity, touchpointLeaseValue, type TouchpointLeaseValue, type TouchpointLifecycleLoad, useTouchpointLifecycle } from "./touchpoint-lifecycle";
import {
	TestTouchpointMount,
	recordVisibleTestTouchpoint,
	useTestRuntime,
} from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import styles from "./ProductionCampaignBadge.module.css";

const PLACEMENT = "opend.home.account-badge";
const supportedCapabilities = new Set(["static-action"]);
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
	const testRuntime = useTestRuntime();
	const { locale } = useI18n();
	const testDecision = testRuntime?.decisions.get(PLACEMENT);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const enabled = !testRuntime && canRenderProductionCampaignBadge(authenticated, sessionSubject) && Boolean(sessionSubject) && Boolean(locale);
	const load = useCallback(async (signal: AbortSignal, active: AuthorizedDecision | null): Promise<TouchpointLifecycleLoad<AuthorizedDecision>> => {
		if (!locale || !sessionSubject) return { kind: "clear" };
		const loaded = await loadProductionTouchpointDecision(PLACEMENT, locale, signal, active?.touchpointDecisionId);
		if (loaded.kind === "revoked") {
			if (active && loaded.receipt.touchpointDecisionId === active.touchpointDecisionId && loaded.receipt.deploymentId === active.deploymentId && loaded.receipt.activityId === active.activityId && loaded.receipt.contentVersionId === active.content.id) return { kind: "clear" };
			return { kind: "retain" };
		}
		if (loaded.kind === "no-decision") return active ? { kind: "retain" } : { kind: "clear" };
		const next = loaded.value as Decision;
		const deadline = resolveAuthorizationDeadline(next);
		if (!next.activityId || !next.touchpointDecisionId || !next.deploymentId || !next.content?.id || next.placementKey !== PLACEMENT || next.content?.placementKey !== PLACEMENT || deadline === null || !Number.isFinite(deadline)) {
			if (next.placementKey !== PLACEMENT || next.content?.placementKey !== PLACEMENT) emitWebTouchpointDiagnostic({ code: "touchpoint_decision_mismatch" });
			return { kind: "clear" };
		}
		if (!supportsWebTouchpointCapabilities(next.content, next.requiredCapabilities, supportedCapabilities)) {
			emitWebTouchpointDiagnostic({ code: "touchpoint_capability_unsupported", detail: next.requiredCapabilities?.join(",") });
			return { kind: "clear" };
		}
		return { kind: "decision", value: { ...touchpointLeaseValue(next), sessionSubject }, key: touchpointContentIdentity(next), validForMs: deadline - Date.parse(next.serverTime), offlineRecovery: productionTouchpointRecovery(loaded.offlineReplay) ?? undefined };
	}, [locale, sessionSubject]);
	const onError = useCallback((error: unknown) => {
		const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
		if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
	}, []);
	const lifecycle = useTouchpointLifecycle({ enabled, identity: enabled ? JSON.stringify([sessionSubject, locale]) : null, load, onError, offlineFallback: true });
	const decision = lifecycle.current;
	const clear = lifecycle.clear;

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
		const current = () =>
			!cancelled &&
			authenticated &&
			decision.sessionSubject === sessionSubject &&
			lifecycle.isCurrent(mountGeneration);
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
						dispatchAction: async (actionId) => {
							await dispatchProductionCampaignAction(
								decision,
								actionId,
								mountGeneration,
								() => lifecycle.isCurrent(mountGeneration) ? mountGeneration : -1,
								lifecycle.deadline,
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
			dispose();
			container.replaceChildren();
		};
	}, [authenticated, decision, sessionSubject, clear, lifecycle.generation, lifecycle.isCurrent]);

	const onTestVisible = useCallback(
		(next: TestDecision, placementKey: TestCampaignPlacement) => {
			if (testRuntime) recordVisibleTestTouchpoint(testRuntime, next, placementKey);
		},
		[testRuntime],
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
