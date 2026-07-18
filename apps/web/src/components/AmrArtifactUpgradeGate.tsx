import { useEffect, useRef, useState } from 'react';
import {
  DAEMON_RUN_FINISHED_EVENT,
  type DaemonRunFinishedEventDetail,
} from '../providers/daemon';
import {
  AMR_ARTIFACT_UPGRADE_REQUEST_EVENT,
  amrArtifactUpgradeSessionKey,
  type AmrArtifactUpgradeDecision,
  type AmrArtifactUpgradeHomeOffer,
  type AmrArtifactUpgradeRequestDetail,
} from '../runtime/amr-artifact-upgrade';
import { isFreeAmrPlan } from '../runtime/amr-low-balance-plan';
import { AmrArtifactUpgradeDialog } from './AmrArtifactUpgradeDialog';

interface Props {
  plan: string | null;
  planResolved: boolean;
  profile: string | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  homeVisible: boolean;
  activeProjectId: string | null;
  activeConversationId: string | null;
  activeFileName: string | null;
  onHomeOfferChange?: (offer: AmrArtifactUpgradeHomeOffer | null) => void;
}

interface RouteSurface {
  homeVisible: boolean;
  offer: AmrArtifactUpgradeHomeOffer | null;
}

interface PendingSendDecision {
  sessionKey: string;
  settle: (decision: AmrArtifactUpgradeDecision) => void;
}

function hasOpenModal(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(
    '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
  ) !== null;
}

function homeOfferForRoute(
  projectId: string | null,
  conversationId: string | null,
  fileName: string | null,
): AmrArtifactUpgradeHomeOffer | null {
  const normalizedProjectId = projectId?.trim();
  const normalizedConversationId = conversationId?.trim();
  const sessionKey = amrArtifactUpgradeSessionKey(
    normalizedProjectId,
    normalizedConversationId,
  );
  if (!sessionKey || !normalizedProjectId || !normalizedConversationId) return null;
  return {
    sessionKey,
    projectId: normalizedProjectId,
    conversationId: normalizedConversationId,
    fileName: fileName || null,
  };
}

export function AmrArtifactUpgradeGate({
  plan,
  planResolved,
  profile,
  metricsConsent,
  installationId,
  homeVisible,
  activeProjectId,
  activeConversationId,
  activeFileName,
  onHomeOfferChange,
}: Props) {
  const [pendingRevision, setPendingRevision] = useState(0);
  const [dialogSessionKey, setDialogSessionKey] = useState<string | null>(null);
  const [pendingHomeOffer, setPendingHomeOffer] =
    useState<AmrArtifactUpgradeHomeOffer | null>(null);
  const openRef = useRef(false);
  const pendingSendRef = useRef<PendingSendDecision | null>(null);
  const eligibleSessionsRef = useRef<Set<string>>(new Set());
  const promptedSessionsRef = useRef<Set<string>>(new Set());
  const homeOfferedSessionsRef = useRef<Set<string>>(new Set());
  const seenRunIdsRef = useRef<Set<string>>(new Set());
  const previousSurfaceRef = useRef<RouteSurface>({
    homeVisible,
    offer: homeOfferForRoute(
      activeProjectId,
      activeConversationId,
      activeFileName,
    ),
  });

  useEffect(() => {
    const handleRunFinished = (event: Event) => {
      const detail = (event as CustomEvent<DaemonRunFinishedEventDetail>).detail;
      const sessionKey = detail
        ? amrArtifactUpgradeSessionKey(detail.projectId, detail.conversationId)
        : null;
      if (
        !detail
        || typeof detail.runId !== 'string'
        || !detail.runId.trim()
        || !sessionKey
        || detail.result !== 'success'
        || !Number.isFinite(detail.artifactCount)
        || detail.artifactCount <= 0
        || seenRunIdsRef.current.has(detail.runId)
      ) {
        return;
      }
      seenRunIdsRef.current.add(detail.runId);
      eligibleSessionsRef.current.add(sessionKey);
    };
    window.addEventListener(DAEMON_RUN_FINISHED_EVENT, handleRunFinished);
    return () => window.removeEventListener(DAEMON_RUN_FINISHED_EVENT, handleRunFinished);
  }, []);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const requestEvent = event as CustomEvent<AmrArtifactUpgradeRequestDetail>;
      const detail = requestEvent.detail;
      const sessionKey = detail
        ? amrArtifactUpgradeSessionKey(detail.projectId, detail.conversationId)
        : null;
      if (
        !sessionKey
        || detail.source !== 'chat_send'
        || !eligibleSessionsRef.current.has(sessionKey)
        || !planResolved
        || !isFreeAmrPlan(plan)
      ) {
        return;
      }

      // A modal makes a second click impossible in normal UI, but keeping the
      // request claimed here also prevents programmatic/double sends from
      // slipping through while the first payload is awaiting a decision.
      if (pendingSendRef.current || openRef.current) {
        requestEvent.preventDefault();
        detail.settle('cancel');
        return;
      }
      if (promptedSessionsRef.current.has(sessionKey) || hasOpenModal()) return;

      requestEvent.preventDefault();
      pendingSendRef.current = { sessionKey, settle: detail.settle };
      setPendingRevision((value) => value + 1);
    };
    window.addEventListener(AMR_ARTIFACT_UPGRADE_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(AMR_ARTIFACT_UPGRADE_REQUEST_EVENT, handleRequest);
  }, [plan, planResolved]);

  useEffect(() => {
    const pending = pendingSendRef.current;
    if (!pending) return;

    // Billing status can be unavailable while the Vela account remains
    // logged in. An unknown plan must never leave an intercepted Send hanging.
    if (!planResolved || !isFreeAmrPlan(plan)) {
      pendingSendRef.current = null;
      pending.settle('proceed');
      return;
    }

    // Another product-critical modal appearing between the click and the
    // resolved plan wins. Let the original Send continue instead of building
    // a surprise modal queue behind it.
    if (hasOpenModal()) {
      pendingSendRef.current = null;
      pending.settle('proceed');
      return;
    }

    promptedSessionsRef.current.add(pending.sessionKey);
    openRef.current = true;
    setDialogSessionKey(pending.sessionKey);
  }, [pendingRevision, plan, planResolved]);

  useEffect(() => {
    const previous = previousSurfaceRef.current;
    if (
      homeVisible
      && !previous.homeVisible
      && previous.offer
      && eligibleSessionsRef.current.has(previous.offer.sessionKey)
      && !homeOfferedSessionsRef.current.has(previous.offer.sessionKey)
    ) {
      setPendingHomeOffer(previous.offer);
    }
    previousSurfaceRef.current = {
      homeVisible,
      offer: homeOfferForRoute(
        activeProjectId,
        activeConversationId,
        activeFileName,
      ),
    };
  }, [activeConversationId, activeFileName, activeProjectId, homeVisible]);

  useEffect(() => {
    if (!pendingHomeOffer || !planResolved) return;
    if (isFreeAmrPlan(plan) && !hasOpenModal()) {
      homeOfferedSessionsRef.current.add(pendingHomeOffer.sessionKey);
      promptedSessionsRef.current.add(pendingHomeOffer.sessionKey);
      onHomeOfferChange?.(pendingHomeOffer);
    }
    setPendingHomeOffer(null);
  }, [onHomeOfferChange, pendingHomeOffer, plan, planResolved]);

  useEffect(() => {
    if (!planResolved || isFreeAmrPlan(plan)) return;
    onHomeOfferChange?.(null);
    if (!dialogSessionKey) return;
    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    pending?.settle('cancel');
    openRef.current = false;
    setDialogSessionKey(null);
  }, [dialogSessionKey, onHomeOfferChange, plan, planResolved]);

  useEffect(() => () => {
    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    pending?.settle('cancel');
  }, []);

  const settleDialog = (decision: AmrArtifactUpgradeDecision) => {
    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    pending?.settle(decision);
    openRef.current = false;
    setDialogSessionKey(null);
  };

  return dialogSessionKey ? (
    <AmrArtifactUpgradeDialog
      profile={profile}
      metricsConsent={metricsConsent}
      installationId={installationId}
      onClose={() => settleDialog('cancel')}
      onContinue={() => settleDialog('proceed')}
    />
  ) : null;
}
