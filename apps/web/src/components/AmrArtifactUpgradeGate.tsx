import { useEffect, useRef, useState } from 'react';
import {
  DAEMON_RUN_FINISHED_EVENT,
  type DaemonRunFinishedEventDetail,
} from '../providers/daemon';
import {
  AMR_ARTIFACT_UPGRADE_REQUEST_EVENT,
  amrArtifactUpgradeSessionKey,
  type AmrArtifactUpgradeDecision,
  type AmrArtifactUpgradeRequestDetail,
} from '../runtime/amr-artifact-upgrade';
import { isFreePlanTier } from '../collab/team-plan';
import { AmrArtifactUpgradeDialog } from './AmrArtifactUpgradeDialog';

interface Props {
  /** Whether the currently selected chat model runs on OpenDesign Cloud. */
  cloudModelSelected: boolean;
  /**
   * The resolved raw plan id (see `resolvePlanTier`), NOT vela's account-scoped
   * `account.plan` — a team member reads `free` there while their team holds a
   * paid plan. `isFreePlanTier` re-asserts that here so a team-namespaced id can
   * never open this free-user upsell even if a caller feeds the raw projection.
   */
  plan: string | null;
  planResolved: boolean;
  profile: string | null;
  workspaceId?: string | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  homeVisible: boolean;
  activeProjectId: string | null;
  activeConversationId: string | null;
}

interface RouteSurface {
  homeVisible: boolean;
  sessionKey: string | null;
  plan: string | null;
  planResolved: boolean;
}

interface PendingHomeSuppression {
  sessionKey: string;
  plan: string | null;
  planResolved: boolean;
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

export function AmrArtifactUpgradeGate({
  cloudModelSelected,
  plan,
  planResolved,
  profile,
  workspaceId,
  metricsConsent,
  installationId,
  homeVisible,
  activeProjectId,
  activeConversationId,
}: Props) {
  const [pendingRevision, setPendingRevision] = useState(0);
  const [dialogSessionKey, setDialogSessionKey] = useState<string | null>(null);
  const [pendingHomeSuppression, setPendingHomeSuppression] =
    useState<PendingHomeSuppression | null>(null);
  const openRef = useRef(false);
  const pendingSendRef = useRef<PendingSendDecision | null>(null);
  const eligibleSessionsRef = useRef<Set<string>>(new Set());
  const promptedSessionsRef = useRef<Set<string>>(new Set());
  const seenRunIdsRef = useRef<Set<string>>(new Set());
  const previousSurfaceRef = useRef<RouteSurface>({
    homeVisible,
    sessionKey: amrArtifactUpgradeSessionKey(activeProjectId, activeConversationId),
    plan,
    planResolved,
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
        || detail.agentId !== 'amr'
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
        || !cloudModelSelected
        || !planResolved
        || !isFreePlanTier(plan)
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
  }, [cloudModelSelected, plan, planResolved]);

  useEffect(() => {
    const pending = pendingSendRef.current;
    if (!pending) return;

    // Billing status can be unavailable while the Vela account remains
    // logged in. An unknown plan must never leave an intercepted Send hanging.
    if (!cloudModelSelected || !planResolved || !isFreePlanTier(plan)) {
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
  }, [cloudModelSelected, pendingRevision, plan, planResolved]);

  useEffect(() => {
    const previous = previousSurfaceRef.current;
    if (
      homeVisible
      && !previous.homeVisible
      && previous.sessionKey
      && eligibleSessionsRef.current.has(previous.sessionKey)
      && !promptedSessionsRef.current.has(previous.sessionKey)
    ) {
      setPendingHomeSuppression({
        sessionKey: previous.sessionKey,
        plan: previous.plan,
        planResolved: previous.planResolved,
      });
    }
    previousSurfaceRef.current = {
      homeVisible,
      sessionKey: amrArtifactUpgradeSessionKey(activeProjectId, activeConversationId),
      plan,
      planResolved,
    };
  }, [
    activeConversationId,
    activeProjectId,
    homeVisible,
    plan,
    planResolved,
  ]);

  useEffect(() => {
    if (!pendingHomeSuppression) return;
    // The removed Home card used to consume this session's upgrade reminder.
    // Keep that suppression so returning to the project does not add a modal.
    if (
      pendingHomeSuppression.planResolved
      && cloudModelSelected
      && isFreePlanTier(pendingHomeSuppression.plan)
      && !hasOpenModal()
    ) {
      promptedSessionsRef.current.add(pendingHomeSuppression.sessionKey);
    }
    setPendingHomeSuppression(null);
  }, [cloudModelSelected, pendingHomeSuppression]);

  useEffect(() => {
    if (cloudModelSelected && (!planResolved || isFreePlanTier(plan))) return;
    if (!dialogSessionKey) return;
    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    pending?.settle(cloudModelSelected ? 'cancel' : 'proceed');
    openRef.current = false;
    setDialogSessionKey(null);
  }, [cloudModelSelected, dialogSessionKey, plan, planResolved]);

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
      workspaceId={workspaceId}
      metricsConsent={metricsConsent}
      installationId={installationId}
      onClose={() => settleDialog('cancel')}
      onContinue={() => settleDialog('proceed')}
    />
  ) : null;
}
