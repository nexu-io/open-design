// Feature-local hooks for the onboarding first-generation funnel (spec
// §11.1): consuming the pending onboarding entry once per project, the
// chat_panel page_view, the auto-send seed/state a Home-submitted project
// arrives with, the first-loop / prompt-prefilled analytics trackers, and the
// auto-send-first-message dispatch itself.
//
// This cluster splits into FOUR separate hook calls (not one) because three
// of its effects each depend on a value computed by a DIFFERENT, not-yet-
// extracted part of the orchestrator's render — `hasPreviewableArtifact`
// (Cluster 9), `chatInitialDraft` (mixes in Cluster 14/15's `chatSeed`), and
// `handleSend` (Cluster 17). A single hook can only be called once per
// render at one position, so each of those three stays a small dedicated
// hook the orchestrator calls at the exact point its one dependency becomes
// available — mirroring how `useOpenTabsSync`/`useProjectFilesAndArtifacts`
// needed careful call-site placement for the same reason. `useOnboardingEntry`
// (the first hook below) has no such constraint and is called early, since it
// only reads `project`/the port.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunContextSelection } from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment, ProjectMetadata } from '../../../types';
import type { ProjectChatSendMeta } from '../types';
import {
  consumeOnboardingEntryForProject,
  type OnboardingEntry,
} from '../../../onboarding/onboarding-entry';
import { beginFirstLoop, recordFirstLoopStep } from '../../../onboarding/first-loop';
import {
  clearOnboardingSessionId,
  peekOnboardingSessionId,
} from '../../../analytics/onboarding-session';
import { trackOnboardingPromptPrefilled, trackPageView } from '../../../analytics/events';
import type { useAnalytics } from '../../../analytics/provider';
import { isDesignSystemWorkspaceMetadata } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

type Track = ReturnType<typeof useAnalytics>['track'];

export interface OnboardingEntryController {
  onboardingEntryRef: MutableRefObject<OnboardingEntry | null>;
  onboardingSeedPromptRef: MutableRefObject<string>;
  autoSendSeedRef: MutableRefObject<string | null>;
  autoSendAttachmentsRef: MutableRefObject<ChatAttachment[] | null>;
  autoSendContextRef: MutableRefObject<RunContextSelection | null>;
  autoSendFirstMessageRef: MutableRefObject<boolean>;
  autoSendAmrGateOkRef: MutableRefObject<boolean>;
  initialDraft: { projectId: string; value: string } | undefined;
  setInitialDraft: Dispatch<SetStateAction<{ projectId: string; value: string } | undefined>>;
}

/**
 * Consume the pending onboarding entry (set by the Home recommendation)
 * exactly once on mount, fire the chat_panel page_view, and stage the
 * auto-send seed/attachments/context a Home-submitted project arrives with.
 * Safe to call early in the render — depends only on `project`/the port.
 */
export function useOnboardingEntry(
  port: ProjectViewTransportPort,
  projectId: string,
  projectPendingPrompt: string | null | undefined,
  onClearPendingPrompt: () => void,
  track: Track,
): OnboardingEntryController {
  // Onboarding first-generation funnel (spec §11.1). Consume the pending entry
  // (set by the Home recommendation) exactly once on mount; the refs guard the
  // two lifecycle events so each fires only for the genuine first send / first
  // successful generation of a recommendation-started project.
  const onboardingEntryInitRef = useRef(false);
  const onboardingEntryRef = useRef<OnboardingEntry | null>(null);
  // The prompt the recommendation prefilled into the composer. Prefer the seed
  // cached WITH the onboarding entry (it survives a reopen-before-send, whereas
  // `project.pendingPrompt` is wiped by `onClearPendingPrompt` on the first
  // mount); fall back to `pendingPrompt` for the very first mount / any project
  // without a cached seed. The first-prompt-sent funnel event compares the
  // actually-sent prompt against this seed so `has_prefilled_prompt` reflects
  // real behavior — the user is free to edit, clear, or replace the suggestion
  // before sending (spec §7.4 / §8.2).
  const onboardingSeedPromptRef = useRef('');
  if (!onboardingEntryInitRef.current) {
    onboardingEntryInitRef.current = true;
    onboardingEntryRef.current = consumeOnboardingEntryForProject(projectId);
    onboardingSeedPromptRef.current =
      onboardingEntryRef.current?.seedPrompt ?? (projectPendingPrompt ?? '').trim();
    // Pin the first-loop ledger for THIS project so later delivery taps (the
    // FileViewer share/export path) can close the loop by project id without
    // prop plumbing. Project-scoped, so an unrelated project's delivery never
    // closes this loop.
    if (onboardingEntryRef.current) beginFirstLoop(projectId, onboardingEntryRef.current);
  }

  // P0 page_view page_name=chat_panel — fire once per project mount.
  // ProjectView outlives conversation switches (ChatPane is keyed by
  // activeConversationId so it remounts when the user switches chats,
  // but this component does not), so page_view stays a "chat-panel
  // entry" metric instead of becoming a "conversation switch" count.
  const chatPanelPageViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (chatPanelPageViewFiredRef.current === projectId) return;
    chatPanelPageViewFiredRef.current = projectId;
    trackPageView(track, { page_name: 'chat_panel' });
    // Onboarding's 4th step ("生成进度页") fires here, not in
    // `DesignSystemDetailView`: the Generate path navigates
    // straight to the project's chat_panel, not to the design
    // system detail surface. If an onboarding session id is still
    // in sessionStorage we stamp the funnel's last row here and
    // clear so any later DS visit doesn't inherit the attribution.
    const onboardingSessionId = peekOnboardingSessionId();
    if (onboardingSessionId) {
      trackPageView(track, {
        page_name: 'onboarding',
        area: 'generation_progress',
        step_index: 'progress',
        step_name: 'generation',
        onboarding_session_id: onboardingSessionId,
      });
      clearOnboardingSessionId();
    }
  }, [track, projectId]);

  // The persisted set of open tabs + active tab. Persisted via PUT on every
  // change; loaded once when the project mounts.
  //
  // PluginLoopHome auto-send case: when the project was created with
  // `autoSendFirstMessage`, app.tsx left a sessionStorage flag telling us
  // to fire the prompt as a real user message immediately. We must NOT
  // seed initialDraft in that case — otherwise the textarea echoes the
  // prompt while it is also streaming as the first user message. The ref
  // captures the prompt independently so downstream effects can still
  // dispatch the auto-send without going through initialDraft.
  const autoSendSeedRef = useRef<string | null>(null);
  const autoSendAttachmentsRef = useRef<ChatAttachment[] | null>(null);
  const autoSendContextRef = useRef<RunContextSelection | null>(null);
  const autoSendFirstMessageRef = useRef(false);
  const autoSendAmrGateOkRef = useRef(false);
  if (autoSendSeedRef.current === null) {
    const isAutoSend = port.hasAutoSendFirstMessageFlag(projectId);
    const amrGateOk = port.readAmrGateOkFlag(projectId);
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendAmrGateOkRef.current = isAutoSend && amrGateOk;
    autoSendSeedRef.current = isAutoSend ? (projectPendingPrompt ?? '') : '';
    autoSendAttachmentsRef.current = isAutoSend ? port.readAutoSendAttachments(projectId) : [];
    autoSendContextRef.current = isAutoSend ? port.readAutoSendContext(projectId) : null;
  }

  const [initialDraft, setInitialDraft] = useState<
    { projectId: string; value: string } | undefined
  >(
    autoSendSeedRef.current || !projectPendingPrompt
      ? undefined
      : { projectId, value: projectPendingPrompt },
  );
  // Hand the pending prompt to ChatPane exactly once per project. The local
  // project-scoped snapshot survives the conversation-id remount, while the
  // persisted pendingPrompt is cleared so refreshes and later entries do not
  // re-seed the composer.
  useEffect(() => {
    const pendingPrompt = projectPendingPrompt;
    if (!pendingPrompt) return;
    if (autoSendFirstMessageRef.current) {
      autoSendSeedRef.current = pendingPrompt;
      onClearPendingPrompt();
      return;
    }
    setInitialDraft((current) =>
      current?.projectId === projectId ? current : { projectId, value: pendingPrompt },
    );
    onClearPendingPrompt();
  }, [projectId, projectPendingPrompt, onClearPendingPrompt]);

  return {
    onboardingEntryRef,
    onboardingSeedPromptRef,
    autoSendSeedRef,
    autoSendAttachmentsRef,
    autoSendContextRef,
    autoSendFirstMessageRef,
    autoSendAmrGateOkRef,
    initialDraft,
    setInitialDraft,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredOnboardingEntry(
  projectId: string,
  projectPendingPrompt: string | null | undefined,
  onClearPendingPrompt: () => void,
  track: Track,
): OnboardingEntryController {
  return useOnboardingEntry(
    projectViewTransportPort,
    projectId,
    projectPendingPrompt,
    onClearPendingPrompt,
    track,
  );
}

/**
 * First-loop ledger: the artifact reaching the preview is the "view" step of
 * the loop (spec §8.3). Recorded once per project; a no-op for any project
 * not started from a recommendation. Called at the point `hasPreviewableArtifact`
 * (Cluster 9's derived memo) becomes available in the orchestrator's render.
 */
export function useFirstLoopViewedTracking(
  hasPreviewableArtifact: boolean,
  onboardingEntryRef: MutableRefObject<OnboardingEntry | null>,
  projectId: string,
  track: Track,
): void {
  const firstLoopViewedRef = useRef(false);
  useEffect(() => {
    if (!hasPreviewableArtifact || firstLoopViewedRef.current) return;
    if (!onboardingEntryRef.current) return;
    firstLoopViewedRef.current = true;
    recordFirstLoopStep(track, 'artifact_viewed', projectId);
  }, [hasPreviewableArtifact, track, projectId, onboardingEntryRef]);
}

/**
 * Home → Studio handoff confirmation (spec §11.1 onboarding_prompt_prefilled):
 * the recommendation's first request actually reached this composer. Fires
 * once, only for recommendation-started projects that arrived with a seed.
 * Called at the point `chatInitialDraft` (mixing in Cluster 14/15's
 * `chatSeed`) becomes available in the orchestrator's render.
 */
export function useOnboardingPromptPrefilledTracking(
  onboardingEntryRef: MutableRefObject<OnboardingEntry | null>,
  chatInitialDraft: string | undefined,
  track: Track,
): void {
  const onboardingPrefilledFiredRef = useRef(false);
  useEffect(() => {
    const entry = onboardingEntryRef.current;
    if (!entry || onboardingPrefilledFiredRef.current) return;
    if (typeof chatInitialDraft !== 'string' || chatInitialDraft.trim().length === 0) return;
    onboardingPrefilledFiredRef.current = true;
    trackOnboardingPromptPrefilled(track, {
      entry_source: entry.source,
      product_type: entry.productType,
      recommendation_id: entry.recommendationId,
      ...(entry.role ? { role: entry.role } : {}),
      ...(entry.useCases && entry.useCases.length > 0 ? { use_cases: entry.useCases } : {}),
    });
  }, [chatInitialDraft, track, onboardingEntryRef]);
}

export interface AutoSendFirstMessageParams {
  activeConversationId: string | null;
  messagesInitialized: boolean;
  streaming: boolean;
  messagesLength: number;
  projectIsProgrammaticBrandExtraction: boolean;
  projectMetadata: ProjectMetadata | undefined;
  projectPendingPrompt: string | null | undefined;
  initialDraft: { projectId: string; value: string } | undefined;
  handleSend: (
    text: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ProjectChatSendMeta,
  ) => void | Promise<unknown>;
}

/**
 * PluginLoopHome auto-send: when the user submits on Home, app.tsx sets the
 * auto-send-first-message session flag and routes through createProject.
 * Once the conversation id resolves and the composer is mounted, fire
 * `handleSend(pendingPrompt)` exactly once so the user lands inside a
 * running pipeline without an extra click. Must be called AFTER `handleSend`
 * (Cluster 17) is defined in the orchestrator's render.
 */
export function useAutoSendFirstMessage(
  port: ProjectViewTransportPort,
  projectId: string,
  autoSendSeedRef: MutableRefObject<string | null>,
  autoSendAttachmentsRef: MutableRefObject<ChatAttachment[] | null>,
  autoSendContextRef: MutableRefObject<RunContextSelection | null>,
  autoSendAmrGateOkRef: MutableRefObject<boolean>,
  params: AutoSendFirstMessageParams,
): void {
  const autoSentRef = useRef(false);
  const {
    activeConversationId,
    messagesInitialized,
    streaming,
    messagesLength,
    projectIsProgrammaticBrandExtraction,
    projectMetadata,
    projectPendingPrompt,
    initialDraft,
    handleSend,
  } = params;

  useEffect(() => {
    if (autoSentRef.current) return;
    if (!activeConversationId) return;
    // Wait for the initial listMessages DB read to land. Without this gate
    // the auto-send fires before the in-flight DB response, which then
    // arrives with `setMessages([])` and wipes the freshly-pushed user +
    // assistant placeholder out of React state — leaving the daemon's run
    // with no in-memory message to attach the runId to.
    if (!messagesInitialized) return;
    if (streaming) return;
    if (projectIsProgrammaticBrandExtraction) {
      port.clearAutoSendSession(projectId);
      autoSendAttachmentsRef.current = [];
      autoSentRef.current = true;
      return;
    }
    if (messagesLength > 0) return;
    if (!port.hasAutoSendFirstMessageFlag(projectId)) return;
    // Prefer the seed captured at mount (autoSendSeedRef) — it survives
    // even after onClearPendingPrompt wipes project.pendingPrompt on the
    // server. Fall back to the live values for any edge case where the
    // ref was not populated (e.g. sessionStorage error path).
    const seed = (
      autoSendSeedRef.current ||
      (initialDraft?.projectId === projectId ? initialDraft.value : '') ||
      projectPendingPrompt ||
      ''
    ).trim();
    const attachments = autoSendAttachmentsRef.current ?? [];
    const context = autoSendContextRef.current ?? port.readAutoSendContext(projectId);
    if (!seed && attachments.length === 0) {
      return;
    }
    autoSentRef.current = true;
    if (isDesignSystemWorkspaceMetadata(projectMetadata)) {
      port.markDesignSystemAuditAutoRepairEligible(projectId);
    }
    port.clearAutoSendSession(projectId);
    autoSendAttachmentsRef.current = [];
    void handleSend(seed, attachments, [], {
      ...(context ? { context } : {}),
      // The home submit already gated this exact task (and the user answered
      // any soft warning there); asking again would double-prompt.
      ...(autoSendAmrGateOkRef.current ? { amrGatePrechecked: true } : {}),
    });
  }, [
    activeConversationId,
    messagesInitialized,
    streaming,
    messagesLength,
    projectId,
    projectIsProgrammaticBrandExtraction,
    projectMetadata,
    initialDraft,
    projectPendingPrompt,
    handleSend,
    port,
    autoSendSeedRef,
    autoSendAttachmentsRef,
    autoSendContextRef,
    autoSendAmrGateOkRef,
  ]);
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredAutoSendFirstMessage(
  projectId: string,
  autoSendSeedRef: MutableRefObject<string | null>,
  autoSendAttachmentsRef: MutableRefObject<ChatAttachment[] | null>,
  autoSendContextRef: MutableRefObject<RunContextSelection | null>,
  autoSendAmrGateOkRef: MutableRefObject<boolean>,
  params: AutoSendFirstMessageParams,
): void {
  useAutoSendFirstMessage(
    projectViewTransportPort,
    projectId,
    autoSendSeedRef,
    autoSendAttachmentsRef,
    autoSendContextRef,
    autoSendAmrGateOkRef,
    params,
  );
}

