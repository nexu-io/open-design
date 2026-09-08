import { readCampaignHostLocale } from "./TestCampaignModal";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { emitProductionTouchpointLoadDiagnostic, loadProductionTouchpointDecision } from "./production-touchpoint-loader";
import {
	TestTouchpointMount,
	recordVisibleTestTouchpoint,
	useTestRuntime,
} from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";
import styles from "./ProductionCampaignBadge.module.css";

const PLACEMENT = "opend.home.account-badge";
const MAX_LEASE_MS = 5 * 60_000;
const RECHECK_MS = 30_000;
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
type AuthorizedDecision = Decision & {
	authorizationDeadline: number;
	sessionSubject: string;
};

export function canRenderProductionCampaignBadge(
	authenticated: boolean,
	sessionSubject: string | null,
) {
	const host = getOpenDesignHost();
	return (
		authenticated &&
		Boolean(sessionSubject) &&
		host?.client.type === "desktop" &&
		Boolean(host.client.osLocale?.trim())
	);
}

/** Production account-badge host. Unlike modals, this placement never exposes close. */
export function ProductionCampaignBadge({
	authenticated,
	sessionSubject,
}: {
	authenticated: boolean;
	sessionSubject: string | null;
}) {
	const [decision, setDecision] = useState<AuthorizedDecision | null>(null);
	const testRuntime = useTestRuntime();
	const testDecision = testRuntime?.decisions.get(PLACEMENT);
	const decisionRef = useRef<AuthorizedDecision | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const expiry = useRef(0);
	const requestGeneration = useRef(0);
	const authorizationGeneration = useRef(0);
	const leaseGeneration = useRef(0);
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
		const host = getOpenDesignHost();
		const locale = readCampaignHostLocale();
		if (testRuntime) {
			clear();
			return;
		}
		if (
			!canRenderProductionCampaignBadge(authenticated, sessionSubject) ||
			!sessionSubject
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
					deadline <= Date.now()
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
		const recheck = setInterval(() => void decide(), RECHECK_MS);
		window.addEventListener("focus", wake);
		window.addEventListener("online", wake);
		document.addEventListener("visibilitychange", wake);
		return () => {
			cancelled = true;
			controller.abort();
			if (timer) clearTimeout(timer);
			clearInterval(recheck);
			window.removeEventListener("focus", wake);
			window.removeEventListener("online", wake);
			document.removeEventListener("visibilitychange", wake);
			clear();
		};
	}, [authenticated, sessionSubject, clear, testRuntime]);

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
						dispatchAction: async (actionId) => {
							await dispatchProductionCampaignAction(
								decision,
								actionId,
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
	}, [authenticated, decision, sessionSubject, clear]);

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
