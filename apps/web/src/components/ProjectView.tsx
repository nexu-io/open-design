import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import { createArtifactParser } from '../artifacts/parser';
import { useT } from '../i18n';
import { streamMessage } from '../providers/anthropic';
import {
  fetchChatRunStatus,
  listActiveChatRuns,
  reattachDaemonRun,
  streamViaDaemon,
} from '../providers/daemon';
import {
  deletePreviewComment,
  fetchPreviewComments,
  fetchDesignSystem,
  fetchLiveArtifacts,
  fetchProjectFiles,
  fetchSkill,
  patchPreviewCommentStatus,
  upsertPreviewComment,
  writeProjectTextFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { composeSystemPrompt, type ResearchOptions } from '@open-design/contracts';
import { navigate } from '../router';
import { agentDisplayName, agentModelDisplayName } from '../utils/agentLabels';
import {
  apiProtocolAgentId,
  apiProtocolModelLabel,
} from '../utils/apiProtocol';
import { playSound, showCompletionNotification } from '../utils/notifications';
import { DEFAULT_NOTIFICATIONS } from '../state/config';
import type { TodoItem } from '../runtime/todos';
import { appendErrorStatusEvent } from '../runtime/chat-events';
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  getTemplate,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  saveMessage,
  saveTabs,
} from '../state/projects';
import type {
  AgentEvent,
  AgentInfo,
  AppConfig,
  Artifact,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  OpenTabsState,
  Project,
  PreviewComment,
  PreviewCommentTarget,
  ProjectFile,
  ProjectTemplate,
  LiveArtifactEventItem,
  LiveArtifactSummary,
  SkillSummary,
} from '../types';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  mergeAttachedComments,
  removeAttachedComment,
} from '../comments';
import { AppChromeHeader } from './AppChromeHeader';
import { AvatarMenu } from './AvatarMenu';
import { ChatPane } from './ChatPane';
import { decideAutoOpenAfterWrite } from './auto-open-file';
import { FileWorkspace } from './FileWorkspace';
import { CenteredLoader } from './Loading';

interface Props {
  project: Project;
  routeFileName: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  daemonLive: boolean;
  onModeChange: (mode: AppConfig['mode']) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onRefreshAgents: () => void;
  onOpenSettings: () => void;
  // Pet wiring forwarded to the chat composer so users can adopt /
  // wake / tuck a pet without leaving the project view.
  onAdoptPetInline?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  onBack: () => void;
  onClearPendingPrompt: () => void;
  onTouchProject: () => void;
  onProjectChange: (next: Project) => void;
  onProjectsRefresh: () => void;
}

let liveArtifactEventSequence = 0;
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';
const DEFAULT_CHAT_PANEL_WIDTH = 460;
const MIN_CHAT_PANEL_WIDTH = 320;
const MAX_CHAT_PANEL_WIDTH = 720;
const MIN_WORKSPACE_PANEL_WIDTH = 400;
const SPLIT_RESIZE_HANDLE_WIDTH = 8;
const CHAT_PANEL_KEYBOARD_STEP = 16;
const MIN_NORMAL_SPLIT_WIDTH =
  MIN_CHAT_PANEL_WIDTH + SPLIT_RESIZE_HANDLE_WIDTH + MIN_WORKSPACE_PANEL_WIDTH;

function workspacePanelMinWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MIN_WORKSPACE_PANEL_WIDTH;
  return splitWidth < MIN_NORMAL_SPLIT_WIDTH ? 0 : MIN_WORKSPACE_PANEL_WIDTH;
}

function maxChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MAX_CHAT_PANEL_WIDTH;
  const workspaceMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const viewportAwareMax = splitWidth - SPLIT_RESIZE_HANDLE_WIDTH - workspaceMinWidth;
  return Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(viewportAwareMax)));
}

function clampPreferredChatPanelWidth(width: number): number {
  return Math.min(MAX_CHAT_PANEL_WIDTH, Math.max(MIN_CHAT_PANEL_WIDTH, Math.round(width)));
}

function clampChatPanelWidth(width: number, maxWidth = MAX_CHAT_PANEL_WIDTH): number {
  const effectiveMax = Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(maxWidth)));
  const effectiveMin = Math.min(MIN_CHAT_PANEL_WIDTH, effectiveMax);
  return Math.min(effectiveMax, Math.max(effectiveMin, Math.round(width)));
}

function readSavedChatPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_PANEL_WIDTH;
  try {
    const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed)
      ? clampPreferredChatPanelWidth(parsed)
      : DEFAULT_CHAT_PANEL_WIDTH;
  } catch {
    return DEFAULT_CHAT_PANEL_WIDTH;
  }
}

function saveChatPanelWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CHAT_PANEL_WIDTH_STORAGE_KEY,
      String(clampPreferredChatPanelWidth(width)),
    );
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

function appendLiveArtifactEventItem(
  prev: LiveArtifactEventItem[],
  event: LiveArtifactEventItem['event'],
): LiveArtifactEventItem[] {
  liveArtifactEventSequence += 1;
  const next = [...prev, { id: liveArtifactEventSequence, event }];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

export function projectSplitClassName(workspaceFocused: boolean): string {
  return workspaceFocused ? 'split split-focus' : 'split';
}

function projectEventToAgentEvent(evt: ProjectEvent): LiveArtifactEventItem['event'] | null {
  if (evt.type === 'file-changed') return null;
  if (evt.type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: evt.action,
      projectId: evt.projectId,
      artifactId: evt.artifactId,
      title: evt.title,
      refreshStatus: evt.refreshStatus,
    };
  }
  return {
    kind: 'live_artifact_refresh',
    phase: evt.phase,
    projectId: evt.projectId,
    artifactId: evt.artifactId,
    refreshId: evt.refreshId,
    title: evt.title,
    refreshedSourceCount: evt.refreshedSourceCount,
    error: evt.error,
  };
}

export function ProjectView({
  project,
  routeFileName,
  config,
  agents,
  skills,
  designSystems,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onRefreshAgents,
  onOpenSettings,
  onAdoptPetInline,
  onTogglePet,
  onOpenPetSettings,
  onBack,
  onClearPendingPrompt,
  onTouchProject,
  onProjectChange,
  onProjectsRefresh,
}: Props) {
  const t = useT();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);
  const [attachedComments, setAttachedComments] = useState<PreviewComment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);
  const [workspaceFocused, setWorkspaceFocused] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(readSavedChatPanelWidth);
  const [chatPanelMaxWidth, setChatPanelMaxWidth] = useState(MAX_CHAT_PANEL_WIDTH);
  const [workspacePanelMinWidth, setWorkspacePanelMinWidth] = useState(MIN_WORKSPACE_PANEL_WIDTH);
  const [resizingChatPanel, setResizingChatPanel] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const chatPanelWidthRef = useRef(chatPanelWidth);
  const preferredChatPanelWidthRef = useRef(chatPanelWidth);
  const resizeStartPreferredWidthRef = useRef(chatPanelWidth);
  const chatPanelMaxWidthRef = useRef(chatPanelMaxWidth);
  const resizeStateRef = useRef<{
    startClientX: number;
    startWidth: number;
    isRtl: boolean;
    hasMoved: boolean;
  } | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerClientXRef = useRef<number | null>(null);
  // The persisted set of open tabs + active tab. Persisted via PUT on every
  // change; loaded once when the project mounts.
  const [openTabsState, setOpenTabsState] = useState<OpenTabsState>({
    tabs: [],
    active: null,
  });
  const tabsLoadedRef = useRef(false);
  // Routed to FileWorkspace — bumped whenever the user clicks "open" on a
  // tool card, an attachment chip, or a produced-file chip in chat. We
  // include a nonce so re-clicking the same name after the user closed the
  // tab still focuses it.
  const [openRequest, setOpenRequest] = useState<{ name: string; nonce: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const sendTextBufferRef = useRef<BufferedTextUpdates | null>(null);
  const reattachTextBuffersRef = useRef<Set<BufferedTextUpdates>>(new Set());
  const reattachControllersRef = useRef<Map<string, AbortController>>(new Map());
  const reattachCancelControllersRef = useRef<Map<string, AbortController>>(new Map());
  const completedReattachRunsRef = useRef<Set<string>>(new Set());
  const skillCache = useRef<Map<string, string>>(new Map());
  const designCache = useRef<Map<string, string>>(new Map());
  const templateCache = useRef<Map<string, ProjectTemplate>>(new Map());
  // We auto-save the most recent artifact to the project folder. Track the
  // last name we persisted so re-renders during streaming don't spawn
  // duplicate writes.
  const savedArtifactRef = useRef<string | null>(null);
  // Pending Write tool invocations: tool_use_id -> destination basename.
  // When the matching tool_result lands we refresh the file list and open
  // the file as a tab once. Keying off the tool_use_id (rather than
  // diffing the file list at end-of-turn) lets us auto-open the moment
  // the agent's Write actually completes, without the previous synthetic
  // "live" tab that was causing flicker against manual opens.
  const pendingWritesRef = useRef<Map<string, string>>(new Map());

  // Load conversations on project switch. If none exist (older projects
  // pre-conversations, or a freshly created one whose default seed got
  // dropped), create one on the fly.
  useEffect(() => {
    let cancelled = false;
    setConversationLoadError(null);
    (async () => {
      try {
        const list = await listConversations(project.id);
        if (cancelled) return;
        if (list.length === 0) {
          const fresh = await createConversation(project.id);
          if (cancelled) return;
          if (fresh) {
            setConversations([fresh]);
            setActiveConversationId(fresh.id);
          } else {
            throw new Error('Could not create a conversation for this project.');
          }
        } else {
          setConversations(list);
          setActiveConversationId(list[0]!.id);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load conversations for this project.';
        setConversations([]);
        setActiveConversationId(null);
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    setWorkspaceFocused(false);
  }, [project.id]);

  // Load messages whenever the active conversation changes. This happens
  // on project mount (after conversations load) and on user-triggered
  // conversation switches.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setPreviewComments([]);
      setAttachedComments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [list, comments] = await Promise.all([
        listMessages(project.id, activeConversationId),
        fetchPreviewComments(project.id, activeConversationId),
      ]);
      if (cancelled) return;
      setMessages(list);
      setPreviewComments(comments);
      setAttachedComments([]);
      setArtifact(null);
      setError(null);
      savedArtifactRef.current = null;
      pendingWritesRef.current.clear();
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, activeConversationId]);

  useEffect(() => {
    return () => {
      sendTextBufferRef.current?.cancel();
      sendTextBufferRef.current = null;
      for (const textBuffer of reattachTextBuffersRef.current) textBuffer.cancel();
      reattachTextBuffersRef.current.clear();
      for (const controller of reattachControllersRef.current.values()) {
        controller.abort();
      }
      for (const controller of reattachCancelControllersRef.current.values()) {
        controller.abort();
      }
      reattachControllersRef.current.clear();
      reattachCancelControllersRef.current.clear();
    };
  }, [project.id, activeConversationId]);

  const cancelSendTextBuffer = useCallback((flushPending = false) => {
    if (flushPending) sendTextBufferRef.current?.flush();
    sendTextBufferRef.current?.cancel();
    sendTextBufferRef.current = null;
  }, []);

  const cancelReattachTextBuffers = useCallback((flushPending = false) => {
    for (const textBuffer of reattachTextBuffersRef.current) {
      if (flushPending) textBuffer.flush();
      textBuffer.cancel();
    }
    reattachTextBuffersRef.current.clear();
  }, []);

  // Detect the streaming `true → false` edge so we can fire the optional
  // completion sound / desktop notification exactly once per turn. Initial
  // mount keeps `prevStreamingRef.current = false`, so loading historical
  // conversations (where `streaming` is also false) never triggers a stray
  // ding. `messages` is on the dep array so the latest assistant message's
  // runStatus is visible at the moment we edge-detect; the early-return
  // guarantees only the edge actually does anything.
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    if (!(wasStreaming && !streaming)) return;

    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    const status = last.runStatus;
    if (status !== 'succeeded' && status !== 'failed') return;

    const cfg = config.notifications ?? DEFAULT_NOTIFICATIONS;
    if (cfg.soundEnabled) {
      playSound(status === 'succeeded' ? cfg.successSoundId : cfg.failureSoundId);
    }

    if (cfg.desktopEnabled) {
      // Successes only interrupt when the user is on another tab/window.
      // Failures alert regardless — losing a long agent run silently is
      // worse than a small interruption when the page is in focus.
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const isFocused = typeof document === 'undefined' ? true : document.hasFocus();
      if (status === 'failed' || isHidden || !isFocused) {
        const title = status === 'succeeded'
          ? t('notify.successTitle')
          : t('notify.failureTitle');
        const fallbackBody = status === 'succeeded'
          ? t('notify.successBody')
          : t('notify.failureBody');
        const trimmed = (last.content ?? '').trim();
        const body = trimmed ? trimmed.slice(0, 80) : fallbackBody;
        void showCompletionNotification({
          status,
          title,
          body,
          onClick: () => {
            if (typeof window !== 'undefined') window.focus();
          },
        });
      }
    }
  }, [streaming, messages, config.notifications, t]);

  // Hydrate the open-tabs state once per project. After this initial
  // load, every mutation flows through saveTabsState() which keeps DB +
  // local state coherent.
  useEffect(() => {
    let cancelled = false;
    tabsLoadedRef.current = false;
    (async () => {
      const state = await loadTabs(project.id);
      if (cancelled) return;
      setOpenTabsState(state);
      tabsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      setOpenTabsState(next);
      if (tabsLoadedRef.current) {
        void saveTabs(project.id, next);
      }
    },
    [project.id],
  );

  const refreshProjectFiles = useCallback(async (): Promise<ProjectFile[]> => {
    const next = await fetchProjectFiles(project.id);
    setProjectFiles(next);
    return next;
  }, [project.id]);

  const refreshLiveArtifacts = useCallback(async (): Promise<LiveArtifactSummary[]> => {
    const next = await fetchLiveArtifacts(project.id);
    setLiveArtifacts(next);
    return next;
  }, [project.id]);

  const refreshWorkspaceItems = useCallback(async (): Promise<ProjectFile[]> => {
    const [nextFiles] = await Promise.all([refreshProjectFiles(), refreshLiveArtifacts()]);
    return nextFiles;
  }, [refreshLiveArtifacts, refreshProjectFiles]);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    setOpenRequest({ name, nonce: Date.now() });
  }, []);

  // Set of project file names that the chat surface uses to decide whether
  // a tool card's path is openable as a tab. Recomputed on every file-list
  // change; tool cards just read from the set.
  const projectFileNames = useMemo(
    () => new Set(projectFiles.map((f) => f.name)),
    [projectFiles],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  // Keep the @-picker's source of truth fresh: every refreshSignal bump
  // (artifact saved, sketch saved, image uploaded) refetches; on first
  // mount we also do an initial pull so attachments staged before the
  // agent has written anything still see the user's pasted images.
  useEffect(() => {
    if (!daemonLive) return;
    void refreshWorkspaceItems();
  }, [daemonLive, refreshWorkspaceItems, filesRefresh]);

  // Live-reload: when the daemon's chokidar watcher reports a file change,
  // bump filesRefresh so the file list refetches with new mtimes — which
  // propagates through to FileViewer iframes via PR #384's ?v=${mtime}
  // cache-bust, triggering an automatic preview reload without a click.
  const handleProjectEvent = useCallback((evt: ProjectEvent) => {
    if (evt.type === 'file-changed') {
      setFilesRefresh((n) => n + 1);
      return;
    }
    const agentEvent = projectEventToAgentEvent(evt);
    if (!agentEvent) return;
    setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, agentEvent));
    void refreshLiveArtifacts();
    onProjectsRefresh();
  }, [onProjectsRefresh, refreshLiveArtifacts]);
  useProjectFileEvents(project.id, daemonLive, handleProjectEvent);

  // When the URL points at a specific file, fire an open request so the
  // FileWorkspace promotes it to an active tab. We watch routeFileName
  // (the parsed segment) so back/forward navigation triggers the same path.
  useEffect(() => {
    if (!routeFileName) return;
    requestOpenFile(routeFileName);
  }, [routeFileName, requestOpenFile]);

  // Sync the URL when the active tab changes, so reload + share-link both
  // land back on the same view. Replace (not push) on tab activation so the
  // history stack doesn't fill with every tab click.
  const lastSyncedFileRef = useRef<string | null>(null);
  useEffect(() => {
    const target = openTabsState.active && (
      projectFileNames.has(openTabsState.active) || isLiveArtifactTabId(openTabsState.active)
    )
      ? openTabsState.active
      : null;
    if (target === lastSyncedFileRef.current) return;
    lastSyncedFileRef.current = target;
    navigate(
      { kind: 'project', projectId: project.id, fileName: target },
      { replace: true },
    );
  }, [openTabsState.active, projectFileNames, project.id]);

  const handleEnsureProject = useCallback(async (): Promise<string | null> => {
    return project.id;
  }, [project.id]);

  const composedSystemPrompt = useCallback(async (): Promise<string> => {
    let skillBody: string | undefined;
    let skillName: string | undefined;
    let skillMode: SkillSummary['mode'] | undefined;
    let designSystemBody: string | undefined;
    let designSystemTitle: string | undefined;

    if (project.skillId) {
      const summary = skills.find((s) => s.id === project.skillId);
      skillName = summary?.name;
      skillMode = summary?.mode;
      const cached = skillCache.current.get(project.skillId);
      if (cached !== undefined) {
        skillBody = cached;
      } else {
        const detail = await fetchSkill(project.skillId);
        if (detail) {
          skillBody = detail.body;
          skillCache.current.set(project.skillId, detail.body);
        }
      }
    }
    if (project.designSystemId) {
      const summary = designSystems.find((d) => d.id === project.designSystemId);
      designSystemTitle = summary?.title;
      const cached = designCache.current.get(project.designSystemId);
      if (cached !== undefined) {
        designSystemBody = cached;
      } else {
        const detail = await fetchDesignSystem(project.designSystemId);
        if (detail) {
          designSystemBody = detail.body;
          designCache.current.set(project.designSystemId, detail.body);
        }
      }
    }
    let template: ProjectTemplate | undefined;
    const tplId = project.metadata?.templateId;
    if (project.metadata?.kind === 'template' && tplId) {
      const cached = templateCache.current.get(tplId);
      if (cached) {
        template = cached;
      } else {
        const fetched = await getTemplate(tplId);
        if (fetched) {
          templateCache.current.set(tplId, fetched);
          template = fetched;
        }
      }
    }
    return composeSystemPrompt({
      skillBody,
      skillName,
      skillMode,
      designSystemBody,
      designSystemTitle,
      metadata: project.metadata,
      template,
    });
  }, [
    project.skillId,
    project.designSystemId,
    project.metadata,
    skills,
    designSystems,
  ]);

  const persistMessage = useCallback(
    (m: ChatMessage) => {
      if (!activeConversationId) return;
      void saveMessage(project.id, activeConversationId, m);
    },
    [project.id, activeConversationId],
  );

  const persistMessageById = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      setMessages((curr) => {
        const found = curr.find((m) => m.id === messageId);
        if (found) void saveMessage(project.id, activeConversationId, found);
        return curr;
      });
    },
    [project.id, activeConversationId],
  );

  const updateMessageById = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage, persist = false) => {
      setMessages((curr) => {
        let saved: ChatMessage | null = null;
        const next = curr.map((m) => {
          if (m.id !== messageId) return m;
          const updated = updater(m);
          saved = updated;
          return updated;
        });
        if (persist && saved && activeConversationId) {
          void saveMessage(project.id, activeConversationId, saved);
        }
        return next;
      });
    },
    [project.id, activeConversationId],
  );

  const appendAssistantErrorEvent = useCallback(
    (messageId: string, message: string) => {
      if (!message) return;
      updateMessageById(
        messageId,
        (prev) => appendErrorStatusEvent(prev, message),
        true,
      );
    },
    [updateMessageById],
  );

  const refreshPreviewComments = useCallback(async () => {
    if (!activeConversationId) return;
    const next = await fetchPreviewComments(project.id, activeConversationId);
    setPreviewComments(next);
    setAttachedComments((current) =>
      current
        .map((attached) => next.find((comment) => comment.id === attached.id))
        .filter((comment): comment is PreviewComment => Boolean(comment)),
    );
  }, [project.id, activeConversationId]);

  const savePreviewComment = useCallback(
    async (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => {
      if (!activeConversationId) return null;
      const saved = await upsertPreviewComment(project.id, activeConversationId, { target, note });
      if (!saved) return null;
      setPreviewComments((current) => {
        const rest = current.filter((comment) => comment.id !== saved.id);
        return [saved, ...rest];
      });
      setAttachedComments((current) =>
        attachAfterSave ? mergeAttachedComments(current, saved) : current.map((comment) => comment.id === saved.id ? saved : comment),
      );
      return saved;
    },
    [project.id, activeConversationId],
  );

  const removePreviewComment = useCallback(
    async (commentId: string) => {
      if (!activeConversationId) return;
      const ok = await deletePreviewComment(project.id, activeConversationId, commentId);
      if (!ok) return;
      setPreviewComments((current) => current.filter((comment) => comment.id !== commentId));
      setAttachedComments((current) => removeAttachedComment(current, commentId));
    },
    [project.id, activeConversationId],
  );

  const attachPreviewComment = useCallback((comment: PreviewComment) => {
    setAttachedComments((current) => mergeAttachedComments(current, comment));
  }, []);

  const detachPreviewComment = useCallback((commentId: string) => {
    setAttachedComments((current) => removeAttachedComment(current, commentId));
  }, []);

  const patchAttachedStatuses = useCallback(
    async (attachments: ChatCommentAttachment[], status: PreviewComment['status']) => {
      if (!activeConversationId || attachments.length === 0) return;
      const persistedAttachments = attachments.filter(
        (attachment) => attachment.source !== 'board-batch',
      );
      if (persistedAttachments.length === 0) return;
      setPreviewComments((current) =>
        current.map((comment) =>
          persistedAttachments.some((attachment) => attachment.id === comment.id)
            ? { ...comment, status }
            : comment,
        ),
      );
      await Promise.all(
        persistedAttachments.map((attachment) =>
          patchPreviewCommentStatus(project.id, activeConversationId, attachment.id, status),
        ),
      );
      void refreshPreviewComments();
    },
    [project.id, activeConversationId, refreshPreviewComments],
  );

  useEffect(() => {
    if (!daemonLive || !activeConversationId || streaming) return;
    let cancelled = false;

    const attachRecoverableRuns = async () => {
      const activeRuns = messages.some(
        (m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus) && !m.runId,
      )
        ? await listActiveChatRuns(project.id, activeConversationId)
        : [];
      if (cancelled) return;
      const activeByMessage = new Map(
        activeRuns
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );

      for (const message of messages) {
        if (cancelled) return;
        if (message.role !== 'assistant') continue;
        if (!isActiveRunStatus(message.runStatus)) continue;
        const fallbackRun = !message.runId ? activeByMessage.get(message.id) : null;
        const runId = message.runId ?? fallbackRun?.id;
        if (!runId) continue;
        if (reattachControllersRef.current.has(runId)) continue;
        if (completedReattachRunsRef.current.has(runId)) continue;

        if (fallbackRun && !message.runId) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runId, runStatus: fallbackRun.status }),
            true,
          );
        }

        const status = fallbackRun ?? await fetchChatRunStatus(runId);
        if (cancelled) return;
        if (!status) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
            true,
          );
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        updateMessageById(
          message.id,
          (prev) => ({ ...prev, runStatus: status.status }),
          true,
        );

        const controller = new AbortController();
        const cancelController = new AbortController();
        reattachControllersRef.current.set(runId, controller);
        reattachCancelControllersRef.current.set(runId, cancelController);
        if (!isTerminalRunStatus(status.status)) {
          abortRef.current = controller;
          cancelRef.current = cancelController;
          setStreaming(true);
        }

        let persistTimer: ReturnType<typeof setTimeout> | null = null;
        const persistSoon = () => {
          if (persistTimer) return;
          persistTimer = setTimeout(() => {
            persistTimer = null;
            persistMessageById(message.id);
          }, 500);
        };
        const persistNow = () => {
          if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
          }
          textBuffer.flush();
          persistMessageById(message.id);
        };
        const textBuffer = createBufferedTextUpdates({
          updateMessage: (updater) => updateMessageById(message.id, updater),
          persistSoon,
        });
        reattachTextBuffersRef.current.add(textBuffer);
        const unregisterTextBuffer = () => {
          reattachTextBuffersRef.current.delete(textBuffer);
        };

        void reattachDaemonRun({
          runId,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          initialLastEventId: message.lastRunEventId ?? null,
          handlers: {
            onDelta: (delta) => {
              textBuffer.appendContent(delta);
            },
            onAgentEvent: (ev) => {
              textBuffer.appendEvent(ev);
            },
            onDone: () => {
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              updateMessageById(
                message.id,
                (prev) => ({ ...prev, runStatus: 'succeeded', endedAt: prev.endedAt ?? Date.now() }),
                true,
              );
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              if (abortRef.current === controller) abortRef.current = null;
              if (cancelRef.current === cancelController) cancelRef.current = null;
              setStreaming(false);
              persistNow();
              void refreshProjectFiles();
              onProjectsRefresh();
            },
            onError: (err) => {
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              setError(err.message);
              appendAssistantErrorEvent(message.id, err.message);
              updateMessageById(
                message.id,
                (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
                true,
              );
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              if (abortRef.current === controller) abortRef.current = null;
              if (cancelRef.current === cancelController) cancelRef.current = null;
              setStreaming(false);
              persistNow();
            },
          },
          onRunStatus: (runStatus) => {
            textBuffer.flush();
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: isTerminalRunStatus(runStatus) ? prev.endedAt ?? Date.now() : prev.endedAt,
              }),
              true,
            );
            if (runStatus === 'canceled') {
              textBuffer.cancel();
              unregisterTextBuffer();
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              if (abortRef.current === controller) abortRef.current = null;
              if (cancelRef.current === cancelController) cancelRef.current = null;
              setStreaming(false);
              persistNow();
            }
          },
          onRunEventId: (lastRunEventId) => {
            textBuffer.flush();
            updateMessageById(message.id, (prev) => ({ ...prev, lastRunEventId }));
            persistSoon();
          },
        })
          .catch((err) => {
            if ((err as Error).name !== 'AbortError') {
              const msg = err instanceof Error ? err.message : String(err);
              setError(msg);
              appendAssistantErrorEvent(message.id, msg);
              updateMessageById(
                message.id,
                (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
                true,
              );
            }
          })
          .finally(() => {
            textBuffer.flush();
            textBuffer.cancel();
            unregisterTextBuffer();
            if (persistTimer) clearTimeout(persistTimer);
            reattachControllersRef.current.delete(runId);
            reattachCancelControllersRef.current.delete(runId);
            if (abortRef.current === controller) abortRef.current = null;
            if (cancelRef.current === cancelController) cancelRef.current = null;
          });
      }
    };

    void attachRecoverableRuns();
    return () => {
      cancelled = true;
    };
  }, [
    daemonLive,
    activeConversationId,
    streaming,
    messages,
    project.id,
    updateMessageById,
    persistMessageById,
    refreshProjectFiles,
    onProjectsRefresh,
  ]);

  const handleSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[] = commentsToAttachments(attachedComments),
      meta?: { research?: ResearchOptions },
    ) => {
      if (!activeConversationId) return;
      if (streaming) return;
      if (!prompt.trim() && attachments.length === 0 && commentAttachments.length === 0) return;
      setError(null);
      const startedAt = Date.now();
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        createdAt: startedAt,
        attachments: attachments.length > 0 ? attachments : undefined,
        commentAttachments: commentAttachments.length > 0 ? commentAttachments : undefined,
      };
      const selectedAgent =
        config.mode === 'daemon' && config.agentId
          ? agentsById.get(config.agentId)
          : null;
      const selectedAgentChoice =
        config.mode === 'daemon' && config.agentId
          ? config.agentModels?.[config.agentId]
          : undefined;
      const assistantAgentId =
        config.mode === 'daemon'
          ? config.agentId ?? undefined
          : apiProtocolAgentId(config.apiProtocol);
      const assistantAgentName =
        config.mode === 'daemon'
          ? agentModelDisplayName(
              config.agentId,
              selectedAgent?.name,
              selectedAgentChoice?.model,
            )
          : apiProtocolModelLabel(config.apiProtocol, config.model);
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentId: assistantAgentId,
        agentName: assistantAgentName,
        events: [],
        createdAt: startedAt,
        runStatus: config.mode === 'daemon' ? 'running' : undefined,
        startedAt,
      };
      const nextHistory = [...messages, userMsg];
      setMessages([...nextHistory, assistantMsg]);
      setStreaming(true);
      setArtifact(null);
      savedArtifactRef.current = null;
      onTouchProject();
      persistMessage(userMsg);
      persistMessage(assistantMsg);
      if (commentAttachments.length > 0) {
        void patchAttachedStatuses(commentAttachments, 'applying');
        setAttachedComments([]);
      }
      // If this is the first turn, derive a working title from the prompt
      // so the conversation is identifiable in the dropdown without a
      // round-trip through the agent.
      if (messages.length === 0) {
        const title = prompt.slice(0, 60).trim();
        if (title) {
          setConversations((curr) =>
            curr.map((c) =>
              c.id === activeConversationId ? { ...c, title } : c,
            ),
          );
          void patchConversation(project.id, activeConversationId, { title });
        }
      }

      // Snapshot the file list at turn-start so we can diff after the
      // agent finishes and surface anything new (e.g. a generated .pptx)
      // as download chips on the assistant message.
      const beforeFileNames = new Set(projectFiles.map((f) => f.name));

      const parser = createArtifactParser();
      let liveHtml = '';

      const updateAssistant = (updater: (prev: ChatMessage) => ChatMessage) => {
        setMessages((curr) =>
          curr.map((m) => (m.id === assistantId ? updater(m) : m)),
        );
      };
      let persistTimer: ReturnType<typeof setTimeout> | null = null;
      const persistAssistantSoon = () => {
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
          persistTimer = null;
          persistMessageById(assistantId);
        }, 500);
      };
      const pushEvent = (ev: AgentEvent) => {
        textBuffer.flush();
        updateAssistant((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
        if (ev.kind === 'live_artifact') {
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts().then(() => {
            if (ev.action !== 'deleted') requestOpenFile(liveArtifactTabId(ev.artifactId));
          });
          onProjectsRefresh();
          return;
        }
        if (ev.kind === 'live_artifact_refresh') {
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts();
          onProjectsRefresh();
          return;
        }
        persistAssistantSoon();
        persistAssistantSoon();
        // Track Write tool invocations so we can auto-open the destination
        // file the moment the agent finishes writing it. The file-creating
        // tools we care about: Write (new file), Edit (existing file —
        // surfacing the freshly-modified file is also useful).
        if (ev.kind === 'tool_use' && (ev.name === 'Write' || ev.name === 'Edit')) {
          const filePath = (ev.input as { file_path?: unknown } | null)?.file_path;
          if (typeof filePath === 'string' && filePath.length > 0) {
            // Preserve the full path so decideAutoOpenAfterWrite can do a
            // path-suffix match against the project's relative file paths.
            // Reducing to a basename here would lose the segment alignment
            // we need to disambiguate same-basename collisions across the
            // project tree and outside it.
            pendingWritesRef.current.set(ev.id, filePath);
          }
        }
        if (ev.kind === 'tool_result') {
          const filePath = pendingWritesRef.current.get(ev.toolUseId);
          if (filePath) {
            pendingWritesRef.current.delete(ev.toolUseId);
            if (!ev.isError) {
              // Refresh first so FileWorkspace's file list (and the tab
              // body) sees the new content before we ask it to focus.
              // Only auto-open if the file actually landed in the project's
              // file list — otherwise an out-of-project Write (e.g. an
              // upstream repo edit) would spawn a permanent placeholder tab.
              void refreshProjectFiles().then((nextFiles) => {
                const decision = decideAutoOpenAfterWrite(filePath, nextFiles);
                if (decision.shouldOpen && decision.fileName) {
                  requestOpenFile(decision.fileName);
                }
              });
            }
          }
        }
      };

      const applyContentDelta = (delta: string) => {
        for (const ev of parser.feed(delta)) {
          if (ev.type === 'artifact:start') {
            liveHtml = '';
            setArtifact({
              identifier: ev.identifier,
              artifactType: ev.artifactType,
              title: ev.title,
              html: '',
            });
          } else if (ev.type === 'artifact:chunk') {
            liveHtml += ev.delta;
            setArtifact((prev) =>
              prev
                ? { ...prev, html: liveHtml }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: liveHtml,
                  },
            );
          } else if (ev.type === 'artifact:end') {
            setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
          }
        }
      };

      const textBuffer = createBufferedTextUpdates({
        updateMessage: updateAssistant,
        persistSoon: persistAssistantSoon,
        onContentDelta: applyContentDelta,
      });
      sendTextBufferRef.current = textBuffer;

      const controller = new AbortController();
      const cancelController = new AbortController();
      abortRef.current = controller;
      cancelRef.current = cancelController;
      const handlers = {
        onDelta: textBuffer.appendContent,
        onAgentEvent: (ev: AgentEvent) => {
          if (ev.kind === 'text') textBuffer.appendTextEvent(ev.text);
          else pushEvent(ev);
        },
        onDone: () => {
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          for (const ev of parser.flush()) {
            if (ev.type === 'artifact:end') {
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
          }
          updateAssistant((prev) => ({
            ...prev,
            endedAt: Date.now(),
            runStatus: config.mode === 'api' || prev.runId ? 'succeeded' : prev.runStatus,
          }));
          if (commentAttachments.length > 0) {
            void patchAttachedStatuses(commentAttachments, 'needs_review');
          }
          setStreaming(false);
          abortRef.current = null;
          cancelRef.current = null;
          // Persist the finished artifact to the project folder so it shows
          // up as a real tab (not just the synthetic "live" stream).
          setArtifact((prev) => {
            if (!prev || !prev.html) return prev;
            void persistArtifact(prev);
            return prev;
          });
          // Refetch the file list directly (rather than just bumping the
          // refresh signal) so we can diff against the pre-turn snapshot
          // and attach the new files to the assistant message as download
          // chips.
          void refreshProjectFiles().then((nextFiles) => {
            const produced = nextFiles.filter((f) => !beforeFileNames.has(f.name));
            setMessages((curr) => {
              const updated = curr.map((m) =>
                m.id === assistantId
                  ? produced.length > 0
                    ? { ...m, producedFiles: produced }
                    : m
                  : m,
              );
              const finalized = updated.find((m) => m.id === assistantId);
              if (finalized) persistMessage(finalized);
              return updated;
            });
          });
          onProjectsRefresh();
        },
        onError: (err: Error) => {
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          setError(err.message);
          appendAssistantErrorEvent(assistantId, err.message);
          updateAssistant((prev) => ({
            ...prev,
            endedAt: Date.now(),
            runStatus: config.mode === 'api' || prev.runId || isActiveRunStatus(prev.runStatus)
              ? 'failed'
              : prev.runStatus,
          }));
          if (commentAttachments.length > 0) {
            void patchAttachedStatuses(commentAttachments, 'failed');
          }
          setStreaming(false);
          abortRef.current = null;
          cancelRef.current = null;
          setMessages((curr) => {
            const finalized = curr.find((m) => m.id === assistantId);
            if (finalized) persistMessage(finalized);
            return curr;
          });
          void refreshProjectFiles();
        },
      };

      if (config.mode === 'daemon') {
        if (!config.agentId) {
          handlers.onError(new Error('Pick a local agent first (top bar).'));
          return;
        }
        const choice = selectedAgentChoice;
        void streamViaDaemon({
          agentId: config.agentId,
          history: nextHistory,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          handlers,
          projectId: project.id,
          conversationId: activeConversationId,
          assistantMessageId: assistantId,
          clientRequestId: crypto.randomUUID(),
          skillId: project.skillId ?? null,
          designSystemId: project.designSystemId ?? null,
          attachments: attachments.map((a) => a.path),
          commentAttachments,
          research: meta?.research,
          model: choice?.model ?? null,
          reasoning: choice?.reasoning ?? null,
          onRunCreated: (runId) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, runId, runStatus: 'queued' }), true);
          },
          onRunStatus: (runStatus) => {
            updateMessageById(
              assistantId,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: isTerminalRunStatus(runStatus) ? prev.endedAt ?? Date.now() : prev.endedAt,
              }),
              true,
            );
          },
          onRunEventId: (lastRunEventId) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, lastRunEventId }));
            persistAssistantSoon();
          },
        });
      } else {
        const systemPrompt = await composedSystemPrompt();
        const apiHistory = historyWithCommentAttachmentContext(nextHistory, userMsg.id);
        pushEvent({ kind: 'status', label: 'requesting', detail: config.model });
        void streamMessage(config, systemPrompt, apiHistory, controller.signal, {
          onDelta: (delta) => {
            handlers.onDelta(delta);
            handlers.onAgentEvent({ kind: 'text', text: delta });
          },
          onDone: handlers.onDone,
          onError: handlers.onError,
        });
      }
    },
    [
      attachedComments,
      activeConversationId,
      streaming,
      messages,
      config,
      agentsById,
      composedSystemPrompt,
      onTouchProject,
      project.id,
      projectFiles,
      refreshProjectFiles,
      refreshLiveArtifacts,
      requestOpenFile,
      persistMessage,
      persistMessageById,
      patchAttachedStatuses,
      updateMessageById,
      onProjectsRefresh,
    ],
  );

  const handleSendBoardCommentAttachments = useCallback(
    async (commentAttachments: ChatCommentAttachment[]) => {
      if (streaming || commentAttachments.length === 0) return;
      await handleSend('', [], commentAttachments);
    },
    [handleSend, streaming],
  );

  const persistArtifact = useCallback(
    async (art: Artifact) => {
      const baseName = (art.identifier || art.title || 'artifact')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'artifact';
      const ext = artifactExtensionFor(art);
      // Pick a name that doesn't collide with an existing project file.
      // The first run uses `<base>.<ext>`; subsequent runs append `-2`, `-3`…
      // so prior artifacts aren't silently overwritten.
      const existing = new Set(projectFiles.map((f) => f.name));
      let fileName = `${baseName}${ext}`;
      let n = 2;
      while (existing.has(fileName) && savedArtifactRef.current !== fileName) {
        fileName = `${baseName}-${n}${ext}`;
        n += 1;
      }
      if (savedArtifactRef.current === fileName) return;
      savedArtifactRef.current = fileName;
      const title = art.title || art.identifier || fileName;
      const metadata = {
        identifier: art.identifier,
        artifactType: art.artifactType,
        inferred: false,
      };
      const manifest =
        ext === '.html'
          ? createHtmlArtifactManifest({
              entry: fileName,
              title,
              sourceSkillId: project.skillId ?? undefined,
              designSystemId: project.designSystemId,
              metadata,
            })
          : inferLegacyManifest({
              entry: fileName,
              title,
              metadata: {
                ...metadata,
                sourceSkillId: project.skillId ?? undefined,
                designSystemId: project.designSystemId,
              },
            });
      const file = await writeProjectTextFile(project.id, fileName, art.html, {
        artifactManifest: manifest ?? undefined,
      });
      if (file) {
        setFilesRefresh((n) => n + 1);
        // Auto-open the freshly-persisted artifact as a tab so the user
        // sees it without an extra click. The Write-tool path already does
        // this for tool-emitted files; this handles the artifact-tag path.
        requestOpenFile(file.name);
      }
    },
    [project.id, projectFiles, requestOpenFile],
  );

  const handleContinueRemainingTasks = useCallback(
    (_assistantMessage: ChatMessage, todos: TodoItem[]) => {
      if (streaming || todos.length === 0) return;
      const remainingList = todos
        .map((todo, i) => {
          const label =
            todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content;
          return `${i + 1}. [${todo.status}] ${label}`;
        })
        .join('\n');
      const prompt =
        'Continue the remaining unfinished tasks from the previous run. ' +
        'Do not redo completed work. Focus only on these unfinished todos:\n\n' +
        `${remainingList}\n\n` +
        'Before making changes, inspect the current project files as needed. ' +
        'Update TodoWrite as you complete each remaining task.';
      void handleSend(prompt, [], []);
    },
    [streaming, handleSend],
  );

  const handleExportAsPptx = useCallback(
    (fileName: string) => {
      if (streaming) return;
      const baseTitle = fileName.replace(/\.html?$/i, '') || fileName;
      const prompt =
        `Export @${fileName} as an editable PPTX file titled "${baseTitle}".\n\n` +
        `**Generate.** Use python-pptx (preferred — full XML control). Apply the ` +
        `footer-rail + cursor-flow discipline from \`skills/pptx-html-fidelity-audit/SKILL.md\` ` +
        `Step 4 from the start: define \`CONTENT_MAX_Y = 6.70"\` and \`FOOTER_TOP = 6.85"\` ` +
        `as constants, route every content block through a \`Cursor\` that refuses to cross ` +
        `the rail, and use budget centering (not \`MARGIN_TOP\`) for hero/cover slides. ` +
        `Preserve \`<em>\` / \`<i>\` as \`italic=True\` on Latin runs only — never on CJK. ` +
        `Set the \`<a:latin>\` and \`<a:ea>\` typeface slots explicitly so Chinese runs ` +
        `don't fall back to Microsoft JhengHei.\n\n` +
        `**Verify (mandatory gate).** After writing, run ` +
        `\`python skills/pptx-html-fidelity-audit/scripts/verify_layout.py "${baseTitle}.pptx"\` ` +
        `(quote the path — filenames may contain spaces). Zero rail violations is the gate ` +
        `for "shippable". If violations remain, walk Steps 2-4 of the SKILL.md ` +
        `(extract dump → audit table → re-export) — do not declare done by eyeballing the ` +
        `deck. If 🟡 typography issues surface (italic missing, unexpected \`Calibri\` / ` +
        `\`Microsoft JhengHei\` in the XML), consult ` +
        `\`skills/pptx-html-fidelity-audit/references/font-discipline.md\` for the ` +
        `five-layer font audit.\n\n` +
        `**Customizing rails.** The default \`CONTENT_MAX_Y = 6.70"\` / ` +
        `\`FOOTER_TOP = 6.85"\` constants suit a 16:9 canvas with a slim footer. If the ` +
        `design system needs different rails (wider footer, 4:3 canvas), pass ` +
        `\`--content-max-y\` / \`--canvas-h\` to \`verify_layout.py\` and update the matching ` +
        `constants in the export script — see \`references/layout-discipline.md\` §1.\n\n` +
        `If \`python-pptx\` or the verifier is unavailable in this environment, say so ` +
        `explicitly — don't claim fidelity is correct without evidence.\n\n` +
        `Save into the current project folder (this conversation's working directory) as ` +
        `\`${baseTitle}.pptx\`. Report the on-disk path and a 1-line fidelity summary ` +
        `(e.g. "0 rail violations across 14 slides") when done.`;
      const attachment: ChatAttachment = {
        path: fileName,
        name: fileName,
        kind: 'file',
      };
      void handleSend(prompt, [attachment], []);
    },
    [streaming, handleSend],
  );

  const handleStop = useCallback(() => {
    const stoppedAt = Date.now();
    cancelSendTextBuffer(true);
    cancelReattachTextBuffers(true);
    cancelRef.current?.abort();
    cancelRef.current = null;
    for (const controller of reattachCancelControllersRef.current.values()) {
      controller.abort();
    }
    reattachCancelControllersRef.current.clear();
    abortRef.current?.abort();
    abortRef.current = null;
    for (const controller of reattachControllersRef.current.values()) {
      controller.abort();
    }
    reattachControllersRef.current.clear();
    setStreaming(false);
    setMessages((curr) => {
      const finalized: ChatMessage[] = [];
      const next = curr.map((m) => {
        if (m.role !== 'assistant') return m;
        if (isActiveRunStatus(m.runStatus)) {
          const updated = { ...m, runStatus: 'canceled' as const, endedAt: m.endedAt ?? stoppedAt };
          finalized.push(updated);
          return updated;
        }
        if (m.endedAt === undefined) {
          const updated = { ...m, endedAt: stoppedAt };
          finalized.push(updated);
          return updated;
        }
        return m;
      });
      for (const message of finalized) persistMessage(message);
      return next;
    });
  }, [cancelSendTextBuffer, cancelReattachTextBuffers, persistMessage]);

  const handleNewConversation = useCallback(async () => {
    setConversationLoadError(null);
    try {
      const fresh = await createConversation(project.id);
      if (!fresh) throw new Error('Could not create a conversation for this project.');
      setConversations((curr) => [fresh, ...curr]);
      setActiveConversationId(fresh.id);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create a conversation for this project.';
      setConversationLoadError(message);
      setError(message);
    }
  }, [project.id]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const ok = await deleteConversationApi(project.id, id);
      if (!ok) return;
      setConversations((curr) => {
        const next = curr.filter((c) => c.id !== id);
        if (next.length === 0) {
          // Re-seed so the project always has at least one conversation
          // to write into.
          void createConversation(project.id).then((fresh) => {
            if (fresh) {
              setConversations([fresh]);
              setActiveConversationId(fresh.id);
            }
          });
        } else if (id === activeConversationId) {
          setActiveConversationId(next[0]!.id);
        }
        return next;
      });
    },
    [project.id, activeConversationId],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim() || null;
      setConversations((curr) =>
        curr.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
      );
      await patchConversation(project.id, id, { title: trimmed });
    },
    [project.id],
  );

  const handleProjectRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === project.name) return;
      const updated: Project = { ...project, name: trimmed, updatedAt: Date.now() };
      onProjectChange(updated);
      void patchProject(project.id, { name: trimmed });
    },
    [project, onProjectChange],
  );

  const projectMeta = useMemo(() => {
    const skill = skills.find((s) => s.id === project.skillId)?.name;
    const ds = designSystems.find((d) => d.id === project.designSystemId)?.title;
    return [skill, ds].filter(Boolean).join(' · ') || t('project.metaFreeform');
  }, [skills, designSystems, project.skillId, project.designSystemId, t]);

  const isDeck = useMemo(
    () => skills.find((s) => s.id === project.skillId)?.mode === 'deck',
    [skills, project.skillId],
  );
  const chatResizeLabel = t('project.resizeChatPanel');
  const workspacePanelTrack =
    workspacePanelMinWidth === 0
      ? 'minmax(0, 1fr)'
      : `minmax(${workspacePanelMinWidth}px, 1fr)`;
  const chatPanelAriaMinWidth = Math.min(MIN_CHAT_PANEL_WIDTH, chatPanelMaxWidth);

  const renderPreferredChatPanelWidth = useCallback((
    preferredWidth: number,
    maxWidth = chatPanelMaxWidthRef.current,
  ): number => {
    const next = clampChatPanelWidth(preferredWidth, maxWidth);
    chatPanelWidthRef.current = next;
    setChatPanelWidth(next);
    return next;
  }, []);

  const applyChatPanelWidth = useCallback((width: number): number => {
    const nextPreferred = clampPreferredChatPanelWidth(
      clampChatPanelWidth(width, chatPanelMaxWidthRef.current),
    );
    preferredChatPanelWidthRef.current = nextPreferred;
    return renderPreferredChatPanelWidth(nextPreferred);
  }, [renderPreferredChatPanelWidth]);

  const finishChatPanelResize = useCallback((saveFinalWidth = true) => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    if (pointerFrameRef.current !== null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerClientXRef.current = null;
    resizeStateRef.current = null;
    setResizingChatPanel(false);
    if (saveFinalWidth) saveChatPanelWidth(preferredChatPanelWidthRef.current);
  }, []);

  useEffect(() => {
    chatPanelWidthRef.current = chatPanelWidth;
  }, [chatPanelWidth]);

  useEffect(() => {
    chatPanelMaxWidthRef.current = chatPanelMaxWidth;
  }, [chatPanelMaxWidth]);

  useLayoutEffect(() => {
    const split = splitRef.current;
    if (!split) return undefined;

    const updateAllowedWidth = () => {
      const splitWidth = split.clientWidth;
      const nextWorkspaceMin = workspacePanelMinWidthForSplit(splitWidth);
      const nextMax = maxChatPanelWidthForSplit(splitWidth);
      chatPanelMaxWidthRef.current = nextMax;
      setWorkspacePanelMinWidth(nextWorkspaceMin);
      setChatPanelMaxWidth(nextMax);
      renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current, nextMax);
    };

    updateAllowedWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateAllowedWidth);
      observer.observe(split);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateAllowedWidth);
    return () => window.removeEventListener('resize', updateAllowedWidth);
  }, [renderPreferredChatPanelWidth]);

  useEffect(() => () => finishChatPanelResize(false), [finishChatPanelResize]);

  const handleChatResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const split = splitRef.current;
    if (!split) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerCleanupRef.current?.();
    setResizingChatPanel(true);
    resizeStartPreferredWidthRef.current = preferredChatPanelWidthRef.current;

    const updateWidthFromClientX = (clientX: number) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = clientX - state.startClientX;
      if (delta === 0 && !state.hasMoved) return;
      state.hasMoved = true;
      const rawWidth = state.startWidth + (state.isRtl ? -delta : delta);
      applyChatPanelWidth(rawWidth);
    };

    const flushPendingPointerMove = () => {
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
        pointerFrameRef.current = null;
      }
      const clientX = pendingPointerClientXRef.current;
      pendingPointerClientXRef.current = null;
      if (clientX !== null) updateWidthFromClientX(clientX);
    };

    resizeStateRef.current = {
      startClientX: event.clientX,
      startWidth: chatPanelWidthRef.current,
      isRtl: window.getComputedStyle(split).direction === 'rtl',
      hasMoved: false,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      pendingPointerClientXRef.current = moveEvent.clientX;
      if (pointerFrameRef.current !== null) return;
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        flushPendingPointerMove();
      });
    };
    const handlePointerEnd = () => {
      flushPendingPointerMove();
      finishChatPanelResize(true);
    };
    const handlePointerCancel = () => {
      flushPendingPointerMove();
      preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
      renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
      finishChatPanelResize(false);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handlePointerCancel);
    };

    pointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handlePointerCancel);
  }, [applyChatPanelWidth, finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeBlur = useCallback(() => {
    if (!pointerCleanupRef.current) return;
    preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
    renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
    finishChatPanelResize(false);
  }, [finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    const split = splitRef.current;
    const isRtl = split ? window.getComputedStyle(split).direction === 'rtl' : false;
    if (event.key === 'ArrowLeft') {
      nextWidth = chatPanelWidthRef.current + (isRtl ? 1 : -1) * CHAT_PANEL_KEYBOARD_STEP;
    } else if (event.key === 'ArrowRight') {
      nextWidth = chatPanelWidthRef.current + (isRtl ? -1 : 1) * CHAT_PANEL_KEYBOARD_STEP;
    } else if (event.key === 'Home') {
      nextWidth = MIN_CHAT_PANEL_WIDTH;
    } else if (event.key === 'End') {
      nextWidth = chatPanelMaxWidthRef.current;
    }
    if (nextWidth === null) return;
    event.preventDefault();
    const next = applyChatPanelWidth(nextWidth);
    saveChatPanelWidth(next);
  }, [applyChatPanelWidth]);

  // Hand the pending prompt to ChatPane exactly once. We snapshot the value
  // into local state on mount so it survives the ChatPane remount triggered
  // when `activeConversationId` resolves from `null` to a real id (the
  // `key={activeConversationId}` on ChatPane otherwise wipes the freshly
  // seeded composer draft). Once the conversation id is in place — meaning
  // ChatPane has remounted with the seed still available — we clear both
  // the local snapshot and the persisted pendingPrompt so future
  // conversation switches don't keep re-seeding the composer.
  const [initialDraft, setInitialDraft] = useState<string | undefined>(
    project.pendingPrompt,
  );
  useEffect(() => {
    if (initialDraft && activeConversationId) {
      setInitialDraft(undefined);
    }
  }, [initialDraft, activeConversationId]);
  useEffect(() => {
    if (project.pendingPrompt) onClearPendingPrompt();
  }, [project.pendingPrompt, onClearPendingPrompt]);

  return (
    <div className="app">
      <AppChromeHeader
        onBack={onBack}
        backLabel={t('project.backToProjects')}
        actions={(
          <AvatarMenu
            config={config}
            agents={agents}
            daemonLive={daemonLive}
            onModeChange={onModeChange}
            onAgentChange={onAgentChange}
            onAgentModelChange={onAgentModelChange}
            onOpenSettings={onOpenSettings}
            onRefreshAgents={onRefreshAgents}
            onBack={onBack}
          />
        )}
      >
        <div className="app-project-title">
            <span
              className="title editable"
              data-testid="project-title"
              tabIndex={0}
              role="textbox"
              suppressContentEditableWarning
              contentEditable
              onBlur={(e) => handleProjectRename(e.currentTarget.textContent ?? '')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).blur();
                }
              }}
            >
              {project.name}
            </span>
            <span className="meta" data-testid="project-meta">{projectMeta}</span>
        </div>
      </AppChromeHeader>
      <div
        ref={splitRef}
        className={[
          projectSplitClassName(workspaceFocused),
          resizingChatPanel && !workspaceFocused ? 'is-resizing-chat' : '',
        ].filter(Boolean).join(' ')}
        style={workspaceFocused
          ? undefined
          : {
              gridTemplateColumns:
                `${chatPanelWidth}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`,
            }}
      >
        <div className="split-chat-slot" hidden={workspaceFocused}>
          {activeConversationId || conversationLoadError ? (
            <ChatPane
              // The conversation id is part of the key so switching conversations
              // resets internal scroll/draft state inside ChatPane and ChatComposer.
              key={activeConversationId ?? 'conversation-unavailable'}
              messages={messages}
              streaming={streaming}
              error={conversationLoadError ?? error}
              projectId={project.id}
              projectFiles={projectFiles}
              projectFileNames={projectFileNames}
              onEnsureProject={handleEnsureProject}
              previewComments={previewComments}
              attachedComments={attachedComments}
              onAttachComment={attachPreviewComment}
              onDetachComment={detachPreviewComment}
              onDeleteComment={(commentId) => void removePreviewComment(commentId)}
              onSend={handleSend}
              onStop={handleStop}
              onRequestOpenFile={requestOpenFile}
              initialDraft={initialDraft}
              onSubmitForm={(text) => {
                if (streaming) return;
                void handleSend(text, [], []);
              }}
              onContinueRemainingTasks={handleContinueRemainingTasks}
              onNewConversation={handleNewConversation}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onRenameConversation={handleRenameConversation}
              onOpenSettings={onOpenSettings}
              petConfig={config.pet}
              onAdoptPet={onAdoptPetInline}
              onTogglePet={onTogglePet}
              onOpenPetSettings={onOpenPetSettings}
              researchAvailable={config.mode === 'daemon'}
              projectMetadata={project.metadata}
              onProjectMetadataChange={(metadata) => {
                onProjectChange({ ...project, metadata });
              }}
            />
          ) : (
            <div className="pane" data-testid="chat-pane-loading">
              <CenteredLoader />
            </div>
          )}
        </div>
        {!workspaceFocused ? (
          <div
            className="split-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={chatResizeLabel}
            aria-valuemin={chatPanelAriaMinWidth}
            aria-valuemax={chatPanelMaxWidth}
            aria-valuenow={chatPanelWidth}
            tabIndex={0}
            title={chatResizeLabel}
            onPointerDown={handleChatResizePointerDown}
            onKeyDown={handleChatResizeKeyDown}
            onBlur={handleChatResizeBlur}
          />
        ) : null}
        <FileWorkspace
          projectId={project.id}
          files={projectFiles}
          liveArtifacts={liveArtifacts}
          onRefreshFiles={() => {
            void refreshWorkspaceItems();
          }}
          isDeck={isDeck}
          onExportAsPptx={handleExportAsPptx}
          streaming={streaming}
          openRequest={openRequest}
          liveArtifactEvents={liveArtifactEvents}
          tabsState={openTabsState}
          onTabsStateChange={persistTabsState}
          previewComments={previewComments}
          onSavePreviewComment={savePreviewComment}
          onRemovePreviewComment={removePreviewComment}
          onSendBoardCommentAttachments={handleSendBoardCommentAttachments}
          focusMode={workspaceFocused}
          onFocusModeChange={setWorkspaceFocused}
        />
      </div>
    </div>
  );
}

function artifactExtensionFor(art: Artifact): '.html' | '.jsx' | '.tsx' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  return '.html';
}

function assistantAgentDisplayName(
  agentId: string | null,
  fallbackName?: string,
): string | undefined {
  return agentDisplayName(agentId, fallbackName) ?? undefined;
}

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

type BufferedTextUpdates = ReturnType<typeof createBufferedTextUpdates>;

function createBufferedTextUpdates({
  updateMessage,
  persistSoon,
  onContentDelta,
}: {
  updateMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  persistSoon: () => void;
  onContentDelta?: (delta: string) => void;
}) {
  let pendingContentDelta = '';
  let pendingTextEventDelta = '';
  let flushFrame: number | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let flushing = false;
  let needsFlush = false;
  const hasDocument = typeof document !== 'undefined';

  const cancelScheduledFlush = () => {
    if (flushFrame !== null) {
      cancelAnimationFrame(flushFrame);
      flushFrame = null;
    }
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    if (disposed) return;
    if (flushing) {
      needsFlush = true;
      return;
    }
    cancelScheduledFlush();
    if (!pendingContentDelta && !pendingTextEventDelta && !needsFlush) return;
    flushing = true;
    needsFlush = false;
    const contentDelta = pendingContentDelta;
    const textEventDelta = pendingTextEventDelta;
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    try {
      updateMessage((prev) => ({
        ...prev,
        content: prev.content + contentDelta,
        events: textEventDelta
          ? [...(prev.events ?? []), { kind: 'text', text: textEventDelta }]
          : prev.events,
      }));
      persistSoon();
      if (contentDelta) onContentDelta?.(contentDelta);
    } finally {
      flushing = false;
    }
    if (pendingContentDelta || pendingTextEventDelta || needsFlush) {
      needsFlush = false;
      scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    if (disposed || flushFrame !== null || flushTimer !== null) return;
    flushFrame = requestAnimationFrame(() => {
      flushFrame = null;
      flush();
    });
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 250);
  };

  const appendContent = (delta: string) => {
    if (disposed) return;
    pendingContentDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendTextEvent = (delta: string) => {
    if (disposed) return;
    pendingTextEventDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendEvent = (ev: AgentEvent) => {
    if (disposed) return;
    if (ev.kind === 'text') {
      appendTextEvent(ev.text);
      return;
    }
    flush();
    updateMessage((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
    persistSoon();
  };

  const cancel = () => {
    disposed = true;
    cancelScheduledFlush();
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    needsFlush = false;
    if (hasDocument) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  }

  if (hasDocument) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return { appendContent, appendTextEvent, appendEvent, flush, cancel };
}
