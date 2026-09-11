import { readCampaignHostLocale } from "./TestCampaignModal";
import { useCallback, useEffect, useRef, useState } from "react";
import { getOpenDesignHost } from "@open-design/host";
import {
	emitWebTouchpointDiagnostic,
	supportsWebTouchpointCapabilities,
	type WebTouchpointContent,
} from "./touchpoint-component";
import { HoverTouchpointOverlay } from "./HoverTouchpointOverlay";
import { dispatchProductionCampaignAction } from "./ProductionCampaignModal";
import { touchpointStaticActionsMatch, type TouchpointStaticAction } from "./touchpoint-static-actions";
import { emitProductionTouchpointLoadDiagnostic, loadProductionTouchpointDecision } from "./production-touchpoint-loader";
import { recordVisibleTestTouchpoint, useTestRuntime } from "./TestCampaignModal";
import type { TestCampaignPlacement, TestDecision } from "./TestCampaignModal";

const ENTRY_PLACEMENT = "opend.home.hover-entry";
const LAYER_PLACEMENT = "opend.home.hover-layer";
const MAX_LEASE_MS = 5 * 60_000;
const RECHECK_MS = 30_000;
const supportedCapabilities = new Set(["hover", "static-action"]);
type RuntimeDecision = Readonly<{ activityId: string; authorizationExpiresAt: string; touchpointDecisionId: string; deploymentId: string; endsAt: string; placementKey: string; serverTime: string; requiredCapabilities: string[]; content: WebTouchpointContent; staticActions: TouchpointStaticAction[] }>;
type ValidDecision = Readonly<{ decision: RuntimeDecision; deadline: number; actionIds: ReadonlySet<string> }>;
type ActiveHover = Readonly<{ entry: ValidDecision; layer: ValidDecision; expiresAt: number; authorizationGeneration: number; sessionSubject: string }>;

function validDecision(value: unknown, placementKey: string): ValidDecision | null {
	if (!value || typeof value !== "object") return null;
	const decision = value as RuntimeDecision;
	const deadline = Math.min(Date.parse(decision.authorizationExpiresAt), Date.parse(decision.endsAt), Date.parse(decision.serverTime) + MAX_LEASE_MS);
	if (!decision.activityId || !decision.touchpointDecisionId || !decision.deploymentId || decision.placementKey !== placementKey || decision.content?.placementKey !== placementKey || !Number.isFinite(deadline) || deadline <= Date.now()) return null;
	const placement = decision.content.manifest.placements.find((candidate) => candidate.key === placementKey);
	if (!placement || !supportsWebTouchpointCapabilities(decision.content, decision.requiredCapabilities, supportedCapabilities) || !touchpointStaticActionsMatch(decision.staticActions, placement.staticActions)) return null;
	return { decision, deadline, actionIds: new Set(placement.staticActions.map((action) => action.id)) };
}

export function ProductionCampaignHover({ authenticated, sessionSubject }: { authenticated: boolean; sessionSubject: string | null }) {
	const [active, setActive] = useState<ActiveHover | null>(null);
	const testRuntime = useTestRuntime();
	const testEntry = testRuntime?.decisions.get(ENTRY_PLACEMENT);
	const testLayer = testRuntime?.decisions.get(LAYER_PLACEMENT);
	const expiryRef = useRef(0);
	const activeRef = useRef<ActiveHover | null>(null);
	const requestGenerationRef = useRef(0);
	const authorizationGenerationRef = useRef(0);
	const clear = useCallback(() => { ++requestGenerationRef.current; ++authorizationGenerationRef.current; expiryRef.current = 0; activeRef.current = null; setActive(null); }, []);
	useEffect(() => {
		if (testRuntime) {
			clear();
			return;
		}
		const locale = readCampaignHostLocale();
		if (!authenticated || !sessionSubject || getOpenDesignHost()?.client.type !== "desktop" || !locale) { clear(); return; }
		let timer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;
		const controller = new AbortController();
		const current = (requestGeneration: number) => !cancelled && requestGeneration === requestGenerationRef.current;
		const decide = async () => {
			const requestGeneration = ++requestGenerationRef.current;
			try {
				const mounted = activeRef.current;
				const [entryLoaded, layerLoaded] = await Promise.all([
					loadProductionTouchpointDecision(ENTRY_PLACEMENT, locale, controller.signal, mounted?.entry.decision.touchpointDecisionId),
					loadProductionTouchpointDecision(LAYER_PLACEMENT, locale, controller.signal, mounted?.layer.decision.touchpointDecisionId),
				]);
				if (!current(requestGeneration)) return;
				const matchesMounted = (loaded: typeof entryLoaded, decision: RuntimeDecision | undefined) =>
					loaded.kind === "revoked" &&
					decision &&
					loaded.receipt.touchpointDecisionId === decision.touchpointDecisionId &&
					loaded.receipt.deploymentId === decision.deploymentId &&
					loaded.receipt.activityId === decision.activityId &&
					loaded.receipt.contentVersionId === decision.content.id;
				if (matchesMounted(entryLoaded, mounted?.entry.decision) || matchesMounted(layerLoaded, mounted?.layer.decision)) { clear(); return; }
				if (entryLoaded.kind === "revoked" || layerLoaded.kind === "revoked") return;

				if (entryLoaded.kind === "no-decision" || layerLoaded.kind === "no-decision") { if (!mounted) clear(); return; }
				if (entryLoaded.kind !== "decision" || layerLoaded.kind !== "decision") return;
				const entry = validDecision(entryLoaded.value, ENTRY_PLACEMENT); const layer = validDecision(layerLoaded.value, LAYER_PLACEMENT);
				if (!entry || !layer || entry.decision.activityId !== layer.decision.activityId || entry.decision.deploymentId !== layer.decision.deploymentId || readCampaignHostLocale() !== locale) { clear(); return; }
				const previous = activeRef.current;
				const replacement = !previous || previous.entry.decision.touchpointDecisionId !== entry.decision.touchpointDecisionId || previous.layer.decision.touchpointDecisionId !== layer.decision.touchpointDecisionId;
				if (!replacement && expiryRef.current > Date.now()) return;
				if (timer) clearTimeout(timer);
				const expiresAt = Math.min(entry.deadline, layer.deadline);
				expiryRef.current = expiresAt;
				const authorizationGeneration = replacement ? ++authorizationGenerationRef.current : previous.authorizationGeneration;
				const nextActive = { entry, layer, expiresAt, authorizationGeneration, sessionSubject }; activeRef.current = nextActive; setActive(nextActive);
				timer = setTimeout(() => { if (expiryRef.current === expiresAt) clear(); }, Math.max(0, expiresAt - Date.now()));
			} catch (error) {
				if (!current(requestGeneration) || (error instanceof DOMException && error.name === "AbortError")) return;
				const diagnostic = emitProductionTouchpointLoadDiagnostic(error);
				if (diagnostic) emitWebTouchpointDiagnostic(diagnostic);
				clear();
			}
		};
		const wake = () => { if (!document.hidden) void decide(); };
		void decide(); const recheck = setInterval(() => void decide(), RECHECK_MS);
		window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
		return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); clearInterval(recheck); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); clear(); };
	}, [authenticated, clear, sessionSubject, testRuntime]);
	const onTestVisible = useCallback((decision: TestDecision, placementKey: TestCampaignPlacement) => {
		if (testRuntime) recordVisibleTestTouchpoint(testRuntime, decision, placementKey);
	}, [testRuntime]);
	const onEntryVisible = useCallback(() => {
		if (testEntry) onTestVisible(testEntry, ENTRY_PLACEMENT);
	}, [onTestVisible, testEntry]);
	const onLayerVisible = useCallback(() => {
		if (testLayer) onTestVisible(testLayer, LAYER_PLACEMENT);
	}, [onTestVisible, testLayer]);
	const onDiagnostic = useCallback((code: string) => emitWebTouchpointDiagnostic({ code }), []);
	const dispatchEntryAction = useCallback((actionId: string) => {
		if (!active) return Promise.resolve();
		return dispatchProductionCampaignAction(active.entry.decision, actionId, active.authorizationGeneration, () => authorizationGenerationRef.current, active.expiresAt).then(() => undefined);
	}, [active]);
	const dispatchLayerAction = useCallback((actionId: string) => {
		if (!active) return Promise.resolve();
		return dispatchProductionCampaignAction(active.layer.decision, actionId, active.authorizationGeneration, () => authorizationGenerationRef.current, active.expiresAt).then(() => undefined);
	}, [active]);
	if (authenticated && testRuntime && testEntry && testLayer) {
		return (
			<HoverTouchpointOverlay
				entry={testEntry.content}
				layer={testLayer.content}
				mode="test"
				onEntryVisible={onEntryVisible}
				onLayerVisible={onLayerVisible}
				onDiagnostic={onDiagnostic}
			/>
		);
	}
	return authenticated && active?.sessionSubject === sessionSubject ? <HoverTouchpointOverlay entry={active.entry.decision.content} layer={active.layer.decision.content} entryActionIds={active.entry.actionIds} layerActionIds={active.layer.actionIds} onDiagnostic={onDiagnostic} dispatchEntryAction={dispatchEntryAction} dispatchLayerAction={dispatchLayerAction} /> : null;
}
