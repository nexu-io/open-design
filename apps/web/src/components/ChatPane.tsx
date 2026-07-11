import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useAnalytics } from '../analytics/provider';
import { useT } from '../i18n';
import type { ProductType } from '../onboarding/recommendation';
import type { Dict } from '../i18n/types';
import { projectRawUrl } from '../providers/registry';
import type { TodoItem } from '../runtime/todos';
import type { AppliedPluginSnapshot, ChatSessionMode, WorkspaceContextItem } from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, ChatMessageFeedbackChange, Conversation, DesignSystemSummary, PreviewComment, Project, ProjectFile, ProjectMetadata, SkillSummary } from '../types';
import { commentsToAttachments } from '../comments';
import type { QuestionFormOpenRequest } from './AssistantMessage';
import type { BrandBrowserAssistConfirm } from './OdCard';
import {
  DESIGN_SYSTEM_NEXT_STEP_ACTIONS,
  type NextStepActionsVariant,
} from './NextStepActions';
import { AmrGuidance } from './AmrGuidance';
import { AmrLoginPill } from './AmrLoginPill';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatSendMeta,
} from './ChatComposer';
import type { PlaceholderScenario } from './home-hero/placeholderScenarios';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { Icon } from './Icon';
import { repoConnectCopy } from './design-system-github-evidence';
import type { SettingsSection } from './SettingsDialog';
import {
  buildRunErrorDiagnosticText,
  ChatConversationLoading,
  ChatRows,
  compactCount,
  ConversationRow,
  conversationMessageCount,
  conversationMetaLabel,
  ImportedFolderArtifacts,
  isAssistantMessageStreaming,
  isBrandExtractionNextStepProject,
  isDesignSystemNextStepProject,
  isProgrammaticBrandAssistantMessage,
  importedFolderArtifactsFor,
  nextUserContentByAssistantIdFor,
  pickStarters,
  QueuedSendStrip,
  retryableAssistantMessage,
  shouldHideEmptyBrandAssistantMessage,
  sortArtifactsByModified,
  useChatLogScrollAnchor,
  useComposerDraftSync,
  useComposerPortalLayout,
  useComposerStarterScenarios,
  useConversationHistory,
  useQueuedSendEditing,
  useRunErrorState,
  type AssistantCallbacks,
  type QueuedSendItem,
  type QueuedSendUpdate,
  type StarterPrompt,
} from '../features/chat-pane';

// Re-exported for external consumers that imported these as named helpers
// off `ChatPane.tsx` directly (e.g. `ConversationsMenu.tsx` imports
// `conversationMetaLabel`) — now sourced from the chat-pane slice.
export { buildRunErrorDiagnosticText, conversationMetaLabel, isAssistantMessageStreaming, retryableAssistantMessage };

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  loading?: boolean;
  error: string | null;
  projectId: string | null;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  // Analytics-only — forwarded to AssistantMessage so the feedback
  // events know which project surface the rating applies to. Optional
  // (defaults to null/'prototype') so unit tests can mount ChatPane
  // without project context.
  projectKindForTracking?: TrackingProjectKind | null;
  projectFiles: ProjectFile[];
  activeProjectFileName?: string | null;
  hasActiveDesignSystem?: boolean;
  activeDesignSystem?: DesignSystemSummary | null;
  sendDisabled?: boolean;
  queuedItems?: QueuedSendItem[];
  onRemoveQueuedSend?: (id: string) => void;
  onUpdateQueuedSend?: (id: string, update: QueuedSendUpdate) => void;
  onReorderQueuedSends?: (orderedIds: string[]) => void;
  onSendQueuedNow?: (id: string) => void;
  // Names that exist in the project folder. Tool cards and chips use this
  // set to decide whether a path can be opened as a tab.
  projectFileNames?: Set<string>;
  onEnsureProject: () => Promise<string | null>;
  previewComments?: PreviewComment[];
  attachedComments?: PreviewComment[];
  onAttachComment?: (comment: PreviewComment) => void;
  onDetachComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  onRetry?: (assistantMessage: ChatMessage) => void;
  onResumeRun?: (assistantMessage: ChatMessage) => void;
  onStop: () => void;
  // Skills available for @-mention assembly. ProjectView filters out the
  // user's disabled set before passing them in here.
  skills?: SkillSummary[];
  // Click-to-open chain: passes a basename up to ProjectView, which sets
  // FileWorkspace's openRequest. Tool cards, attachment chips, and
  // produced-file chips all call this.
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  // "Share to Open Design" button on each completed assistant message —
  // wired by ProjectView to handleSend with the bundled
  // `od-share-to-community` scenario's trigger prompt.
  onShareToOpenDesign?: (assistantMessageId: string) => void;
  shareToOpenDesignBusyMessageId?: string | null;
  forceStreamingMessageIds?: Set<string>;
  // Live-only streaming tool-input partials keyed by tool-use id. Threaded to
  // AssistantMessage so an in-flight Write/Edit can render its code in real
  // time before the full `tool_use` arrives. Never persisted.
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  initialDraft?: string;
  // Product path of the Home recommendation that started this project. When
  // set (and concrete), the empty-conversation starter cards show that path's
  // starters — one-click composer replacements — instead of the generic set.
  onboardingStarterPath?: ProductType | null;
  composerPlaceholder?: string;
  // Focus the right-hand Questions tab from the chat banner.
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onAssistantFeedback?: (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => void;
  // Client-side action for a brand-browser-assist od-card: open/focus the
  // Browser tab. Routed through the stable callbacks ref.
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  // "Next step" affordance handlers forwarded to the last assistant message.
  // The featured design-toolbox rows are driven directly off the composer ref
  // owned here, so they need no handler from ProjectView (unlike onArtifactShare).
  onArtifactShare?: (fileName: string) => void;
  onArtifactDownload?: (fileName: string) => void;
  onForkFromMessage?: (assistantMessage: ChatMessage) => void;
  forkingMessageId?: string | null;
  // Header "+" button — kicks off ProjectView's create-conversation flow.
  onNewConversation?: () => void;
  newConversationDisabled?: boolean;
  // Conversation list that used to live in the topbar. The chat tab now
  // owns the list so users can browse + switch conversations without
  // leaving the pane.
  conversations: Conversation[];
  activeConversationId: string | null;
  // The conversation whose history the live `messages` array currently
  // reflects. Null while a switch is mid-flight (or after a load failure),
  // which is exactly when `messages.length` must NOT be trusted as the active
  // conversation's count — see `conversationMessageCount`. Callers that do not
  // track this (mounts whose loader resets/retags `messages` asynchronously)
  // leave it undefined and fall back to the persisted `conversation.messageCount`
  // for a stable list count.
  messagesConversationId?: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  // Composer settings/CLI button forwards to here. The dialog lives in App
  // (it owns the AppConfig lifecycle) so we just pass the open trigger.
  onOpenSettings?: (section?: SettingsSection) => void;
  showByokRecoveryAction?: boolean;
  onSwitchToLocalCli?: () => void;
  onOpenAmrSettings?: () => void;
  onSwitchToAmrAndRetry?: (failedAssistant: ChatMessage) => void;
  // PR #3157: Antigravity's `agy -p` can't complete OAuth on its own,
  // so the auth banner offers a "Sign in via terminal" button that
  // POSTs to /api/agents/antigravity/oauth-launch. Handler resolves
  // after the daemon kicks off `osascript`/`x-terminal-emulator`/
  // `cmd /c start` so the UI can disable the button while in flight.
  onLaunchAntigravityOauth?: () => Promise<void>;
  // Same dialog, but landing on the External MCP tab. Forwarded to the
  // composer's `/mcp` slash and MCP picker button.
  onOpenMcpSettings?: () => void;
  // The composer "+" menu's "add plugin" / "add connector" rows route to the
  // home plugin-registry / connector-integration surfaces.
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // True when this project is a GitHub-backed design system whose repository
  // evidence has not fully landed. Surfaces a "Connect your repo" CTA in the
  // empty chat state alongside the starter examples.
  connectRepoNeeded?: boolean;
  // Live GitHub connector status, used only to pick the connect-repo CTA copy
  // (connect vs re-import). Undefined until the status fetch resolves.
  githubConnected?: boolean;
  // Fires when the connect-repo CTA button is clicked. The parent decides what
  // it does based on connector status (open Connectors, or prefill the composer
  // with the import instruction).
  onConnectRepo?: () => void;
  // True once the deterministic brand extraction actually reached ready. Until
  // then the next-step card must stay on continue/recover actions even if the
  // latest assistant row is terminal.
  brandExtractionComplete?: boolean;
  // True for a programmatically-extracted brand project whose AI enrichment
  // never ran. The next-step card uses this to offer AI Optimize after the
  // extraction completion message.
  brandEnrichmentEligible?: boolean;
  // Runs the optional brand-enrichment turn. The parent sends the project's
  // seeded enrichment prompt with the default per-turn skill bundle.
  onContinueBrandEnrichment?: () => void;
  brandEnrichmentBusy?: boolean;
  // Runs or resumes the selected agent for an incomplete brand extraction
  // scaffold. Distinct from AI Optimize, which assumes a ready system exists.
  onContinueBrandAgentExtraction?: () => void;
  continueBrandAgentExtractionBusy?: boolean;
  // Restarts the deterministic programmatic pass for an incomplete brand
  // extraction without creating a duplicate design-system item.
  onContinueBrandExtraction?: () => void;
  continueBrandExtractionBusy?: boolean;
  // Creates a fresh design project using the current extracted design system.
  onCreateDesignFromActiveDesignSystem?: () => void;
  createDesignFromActiveDesignSystemBusy?: boolean;
  // Duplicates a regular project into a new design-system workspace and starts
  // the design-system generation pass from that copied evidence.
  onCreateDesignSystemFromProject?: () => void;
  createDesignSystemFromProjectBusy?: boolean;
  // Bumped by the parent to push a draft into the composer (used by the
  // "Import repo" CTA). The nonce lets the same text fire more than once.
  composerDraftSignal?: { text: string; nonce: number };
  // Optional pet wiring forwarded straight through to ChatComposer's
  // /pet button. When omitted the composer hides the button entirely.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  activeWorkspaceContext?: WorkspaceContextItem | null;
  initialWorkspaceContexts?: WorkspaceContextItem[];
  workspaceContexts?: WorkspaceContextItem[];
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  researchAvailable?: boolean;
  // Immutable snapshot of the plugin pinned to this project. When set
  // we suppress the in-composer plugin rail (the user already picked a
  // plugin on Home) and render the active plugin as a context chip on
  // each user message — that satisfies §8 "show context inside the run
  // message" without forcing a separate side widget.
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  // SenseAudio BYOK only — wired straight through to ChatComposer for the
  // in-composer image-model picker. Active protocol is read so the picker
  // hides when the user is on any other BYOK tab (azure / openai / …).
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
  byokVideoModel?: string;
  onChangeByokVideoModel?: (model: string) => void;
  byokSpeechModel?: string;
  onChangeByokSpeechModel?: (model: string) => void;
  byokSpeechVoice?: string;
  onChangeByokSpeechVoice?: (voice: string) => void;
  composerFooterAccessory?: ReactNode;
  // Slot rendered next to the composer's "+" menu (e.g. the working-dir pill).
  composerLeadingAccessory?: ReactNode;
  // Forwarded straight to the chat composer's mid-chat design-system
  // switcher. ProjectView owns the project record so the parent is the
  // natural place to mirror the patched project after a PATCH lands.
  currentDesignSystemId?: string | null;
  onActiveDesignSystemChange?: (project: Project) => void;
  onShowToast?: (message: string) => void;
  // Optional transient UI owned by the project shell. Rendering it inside the
  // scroll-area wrapper keeps it structurally above the variable-height
  // composer instead of guessing a bottom offset from outside ChatPane.
  chatLogTray?: ReactNode;
  // Project header slot. The former standalone chrome header row was removed;
  // its back button, project title (editable) and design-system picker moved
  // into the top of the chat pane. ProjectView owns the project record so it
  // renders these as slots rather than ChatPane re-deriving the data.
  onBack?: () => void;
  backLabel?: string;
  projectHeader?: ReactNode;
  designSystemPicker?: ReactNode;
  config?: AppConfig;
}

type Tab = 'chat' | 'comments';

const CONVERSATION_ROW_HEIGHT_PX = 34;
const CONVERSATION_VIRTUALIZE_THRESHOLD = 36;
const CONVERSATION_OVERSCAN_ROWS = 8;

// Injectable hooks for the orchestrator. Each defaults to its wired hook, so
// production callers pass nothing while tests swap a hook for a fake and
// render the orchestrator directly instead of mocking modules. Per-hook
// injection (not one bag) keeps each seam independently overridable,
// matching `MemorySection.tsx`'s `MemorySectionHooks` pattern. Prop names
// are deliberately distinct from the hook identifiers they default to — a
// destructuring parameter default that references its own binding name
// throws a TDZ error.
interface ChatPaneHooks {
  useStarterScenarios?: typeof useComposerStarterScenarios;
  useHistory?: typeof useConversationHistory;
  usePortalLayout?: typeof useComposerPortalLayout;
  useQueuedSend?: typeof useQueuedSendEditing;
  useRunError?: typeof useRunErrorState;
  useDraftSync?: typeof useComposerDraftSync;
  useScrollAnchor?: typeof useChatLogScrollAnchor;
}

export function ChatPane({
  messages,
  streaming,
  loading = false,
  sendDisabled = false,
  queuedItems = [],
  error,
  projectId,
  sessionMode = 'design',
  onSessionModeChange,
  projectKindForTracking = null,
  projectFiles,
  activeProjectFileName = null,
  hasActiveDesignSystem = false,
  activeDesignSystem = null,
  projectFileNames,
  onEnsureProject,
  previewComments = [],
  attachedComments = [],
  onAttachComment,
  onDetachComment,
  onDeleteComment,
  onSend,
  onRetry,
  onResumeRun,
  onStop,
  onRemoveQueuedSend,
  onUpdateQueuedSend,
  onReorderQueuedSends,
  onSendQueuedNow,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  onShareToOpenDesign,
  shareToOpenDesignBusyMessageId,
  forceStreamingMessageIds,
  liveToolInput,
  initialDraft,
  onboardingStarterPath = null,
  composerPlaceholder,
  onOpenQuestions,
  onContinueRemainingTasks,
  onAssistantFeedback,
  onBrandBrowserAssistConfirm,
  onArtifactShare,
  onArtifactDownload,
  onForkFromMessage,
  forkingMessageId = null,
  onNewConversation,
  newConversationDisabled = false,
  conversations,
  activeConversationId,
  messagesConversationId = null,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
  showByokRecoveryAction = false,
  onSwitchToLocalCli,
  onOpenAmrSettings,
  onSwitchToAmrAndRetry,
  onLaunchAntigravityOauth,
  onOpenMcpSettings,
  onBrowsePlugins,
  onOpenConnectors,
  connectRepoNeeded,
  githubConnected,
  onConnectRepo,
  brandExtractionComplete = false,
  brandEnrichmentEligible,
  onContinueBrandEnrichment,
  brandEnrichmentBusy,
  onContinueBrandAgentExtraction,
  continueBrandAgentExtractionBusy,
  onContinueBrandExtraction,
  continueBrandExtractionBusy,
  onCreateDesignFromActiveDesignSystem,
  createDesignFromActiveDesignSystemBusy,
  onCreateDesignSystemFromProject,
  createDesignSystemFromProjectBusy,
  composerDraftSignal,
  petConfig,
  onAdoptPet,
  onTogglePet,
  onOpenPetSettings,
  projectMetadata,
  onProjectMetadataChange,
  activeWorkspaceContext,
  initialWorkspaceContexts = [],
  workspaceContexts = [],
  currentSkillId = null,
  onProjectSkillChange,
  researchAvailable,
  activePluginSnapshot,
  skills = [],
  byokApiProtocol,
  byokImageModel,
  onChangeByokImageModel,
  byokVideoModel,
  onChangeByokVideoModel,
  byokSpeechModel,
  onChangeByokSpeechModel,
  byokSpeechVoice,
  onChangeByokSpeechVoice,
  composerLeadingAccessory,
  composerFooterAccessory,
  currentDesignSystemId,
  onActiveDesignSystemChange,
  onShowToast,
  chatLogTray,
  onBack,
  backLabel,
  projectHeader,
  designSystemPicker,
  config,
  useStarterScenarios = useComposerStarterScenarios,
  useHistory = useConversationHistory,
  usePortalLayout = useComposerPortalLayout,
  useQueuedSend = useQueuedSendEditing,
  useRunError = useRunErrorState,
  useDraftSync = useComposerDraftSync,
  useScrollAnchor = useChatLogScrollAnchor,
}: Props & ChatPaneHooks) {
  const t = useT();
  const analytics = useAnalytics();
  const displayMessages = useMemo(
    () => messages.filter((message) => !shouldHideEmptyBrandAssistantMessage(message, projectMetadata)),
    [messages, projectMetadata],
  );
  const logRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const composerSlotRef = useRef<HTMLDivElement | null>(null);
  const composerLayerRef = useRef<HTMLDivElement | null>(null);
  const queuedSendStripRef = useRef<HTMLDivElement | null>(null);
  const tailSpacerRef = useRef<HTMLDivElement | null>(null);
  // AssistantMessage's interaction callbacks are re-created per render and
  // excluded from its memo comparison (so streaming doesn't re-render every
  // message). Route them through this ref so a memoized message still calls the
  // LATEST handler. See areAssistantMessagePropsEqual in AssistantMessage.tsx.
  const assistantCallbacksRef = useRef<AssistantCallbacks>({
    onContinueRemainingTasks,
    onAssistantFeedback,
    onBrandBrowserAssistConfirm,
    onArtifactShare,
    onForkFromMessage,
    onShareToOpenDesign,
    onNextStepAiOptimize: onContinueBrandEnrichment,
    onNextStepContinueExtraction: onContinueBrandExtraction,
    onNextStepContinueAiExtraction: onContinueBrandAgentExtraction,
    onNextStepCreateDesign: onCreateDesignFromActiveDesignSystem,
    onNextStepCreateDesignSystem: onCreateDesignSystemFromProject,
  });
  assistantCallbacksRef.current = {
    onContinueRemainingTasks,
    onAssistantFeedback,
    onBrandBrowserAssistConfirm,
    onArtifactShare,
    onForkFromMessage,
    onShareToOpenDesign,
    onNextStepAiOptimize: onContinueBrandEnrichment,
    onNextStepContinueExtraction: onContinueBrandExtraction,
    onNextStepContinueAiExtraction: onContinueBrandAgentExtraction,
    onNextStepCreateDesign: onCreateDesignFromActiveDesignSystem,
    onNextStepCreateDesignSystem: onCreateDesignSystemFromProject,
  };
  const {
    handleToolboxAction,
    handleNextStepPromptAction,
    handlePickSkill,
    handleStarterCardClick,
    nextStepVariant,
    featuredToolboxSkillNames,
    starterTemplateCards,
    composerPlaceholderScenarios,
  } = useStarterScenarios(composerRef, {
    displayMessages,
    projectMetadata,
    sessionMode,
    onSessionModeChange,
    skills,
    onboardingStarterPath,
    t,
    loading,
    initialDraft,
    queuedItemsLength: queuedItems.length,
    brandExtractionComplete,
    analyticsTrack: analytics.track,
  });
  const [tab, setTab] = useState<Tab>('chat');
  const {
    historyWrapRef,
    showConvList,
    setShowConvList,
    conversationSearch,
    setConversationSearch,
    activeConversation,
    filteredConversations,
    handleToggleHistoryList,
    handleStartNewConversation,
    handleSelectConversation,
  } = useHistory(conversations, activeConversationId, t, {
    analyticsTrack: analytics.track,
    onNewConversation,
    newConversationDisabled,
    onSelectConversation,
  });
  const { composerPortalTarget, composerPortalRect, composerSlotHeight } =
    usePortalLayout(composerSlotRef, composerLayerRef, tab);
  const {
    editingQueuedSendId,
    setEditingQueuedSendId,
    handleEditQueuedSend,
    handleRemoveQueuedSend,
    handleSendQueuedNow,
  } = useQueuedSend(composerRef, queuedItems, {
    analyticsTrack: analytics.track,
    projectId,
    onRemoveQueuedSend,
    onSendQueuedNow,
  });
  const {
    lastAssistantId,
    hasActiveRunMessage,
    retryAssistant,
    runFailureUi,
    canResumeFailedRun,
    displayError,
    errorDiagnosticText,
    errorSourcePeek,
    runErrorTone,
    errorCardOwnerId,
    amrSwitchPayload,
    showByokRecoveryCta,
    showErrorActions,
    copiedErrorDiagnostic,
    errorSourceOpen,
    setErrorSourceOpen,
    copyErrorDiagnostic,
    inlineAmrLoginStatus,
    handleAmrLoginStatusChange,
    handleAmrRecharge,
    handleAmrUpgrade,
    handleAmrSignInStarted,
    handleAmrSwitchActivate,
  } = useRunError(displayMessages, streaming, error, {
    projectId,
    activeConversationId,
    projectKindForTracking,
    config,
    analyticsTrack: analytics.track,
    onRetry,
    showByokRecoveryAction,
    onSwitchToLocalCli,
    onSwitchToAmrAndRetry,
    onOpenAmrSettings,
    t,
  });
  const {
    scrolledFromBottom,
    chatLogScrollable,
    chatLogScrolling,
    jumpToBottom,
    armAnchorForSend,
    resetScrollTrackingForSend,
    unpinFromBottom,
  } = useScrollAnchor(logRef, tailSpacerRef, queuedSendStripRef, {
    activeConversationId,
    displayMessages,
    streaming,
    tab,
    error,
  });
  const importedFolderArtifacts = useMemo(
    () => importedFolderArtifactsFor(projectFiles, projectMetadata),
    [projectFiles, projectMetadata],
  );
  const showImportedFolderArtifacts = projectMetadata?.importedFrom === 'folder';
  const { composerDraftStorageKey } = useDraftSync(composerRef, {
    initialDraft,
    composerDraftSignal,
    projectId,
    activeConversationId,
  });
  // Only the first user message gets the active-plugin chip — the
  // plugin is project-scoped so re-stamping it on every reply would be
  // noise. Subsequent messages still run under the same snapshot.
  const firstUserMessageId = useMemo(
    () => displayMessages.find((m) => m.role === 'user')?.id,
    [displayMessages],
  );
  const shouldBalanceFinishedTranscript =
    !loading &&
    !streaming &&
    !displayError &&
    !hasActiveRunMessage &&
    displayMessages.length > 0;
  // Map each assistant message id to the user message that follows it (if any)
  // so the chat-side Questions banner can reopen that exact answered form in
  // the right-hand panel later.
  const nextUserContentByAssistantId = useMemo(
    () => nextUserContentByAssistantIdFor(displayMessages),
    [displayMessages],
  );

  const composerNode = (
    <ChatComposer
      ref={composerRef}
      designSystemPicker={designSystemPicker}
      projectId={projectId}
      projectFiles={projectFiles}
      activeProjectFileName={activeProjectFileName}
      sessionMode={sessionMode}
      onSessionModeChange={onSessionModeChange}
      skills={skills}
      streaming={streaming}
      sendDisabled={sendDisabled}
      initialDraft={initialDraft}
      composerPlaceholder={composerPlaceholder}
      placeholderScenarios={composerPlaceholderScenarios}
      draftStorageKey={composerDraftStorageKey}
      onEnsureProject={onEnsureProject}
      commentAttachments={commentsToAttachments(attachedComments)}
      onRemoveCommentAttachment={onDetachComment}
      onSend={(prompt, attachments, commentAttachments, meta) => {
        resetScrollTrackingForSend();
        if (editingQueuedSendId && onUpdateQueuedSend) {
          const original = queuedItems.find((item) => item.id === editingQueuedSendId);
          const update: QueuedSendUpdate = {
            prompt,
            attachments,
            commentAttachments,
          };
          const nextMeta = meta ?? original?.meta;
          if (nextMeta !== undefined) update.meta = nextMeta;
          onUpdateQueuedSend(editingQueuedSendId, update);
          setEditingQueuedSendId(null);
          return;
        }
        // Arm "anchor to top": the messages effect promotes this once
        // the new user turn renders, pinning it to the top of the view.
        // Clear any stale reserve from the previous turn first so a resend
        // doesn't strand the new turn below a leftover gap (release #3653).
        armAnchorForSend();
        onSend(prompt, attachments, commentAttachments, meta);
      }}
      onStop={onStop}
      onOpenSettings={onOpenSettings}
      onOpenMcpSettings={onOpenMcpSettings}
      onBrowsePlugins={onBrowsePlugins}
      onOpenConnectors={onOpenConnectors}
      petConfig={petConfig}
      onAdoptPet={onAdoptPet}
      onTogglePet={onTogglePet}
      onOpenPetSettings={onOpenPetSettings}
      researchAvailable={researchAvailable}
      projectMetadata={projectMetadata}
      onProjectMetadataChange={onProjectMetadataChange}
      activeWorkspaceContext={activeWorkspaceContext}
      initialWorkspaceContexts={initialWorkspaceContexts}
      workspaceContexts={workspaceContexts}
      byokApiProtocol={byokApiProtocol}
      byokImageModel={byokImageModel}
      onChangeByokImageModel={onChangeByokImageModel}
      byokVideoModel={byokVideoModel}
      onChangeByokVideoModel={onChangeByokVideoModel}
      byokSpeechModel={byokSpeechModel}
      onChangeByokSpeechModel={onChangeByokSpeechModel}
      byokSpeechVoice={byokSpeechVoice}
      onChangeByokSpeechVoice={onChangeByokSpeechVoice}
      currentSkillId={currentSkillId}
      onProjectSkillChange={onProjectSkillChange}
      pinnedPluginId={activePluginSnapshot?.pluginId ?? null}
      footerAccessory={composerFooterAccessory}
      leadingAccessory={composerLeadingAccessory}
      currentDesignSystemId={currentDesignSystemId}
      onActiveDesignSystemChange={onActiveDesignSystemChange}
      onShowToast={onShowToast}
    />
  );
  const shouldPortalComposer =
    tab === 'chat'
    && composerPortalTarget !== null
    && composerPortalRect !== null
    && composerPortalRect.width > 0;
  const composerSlotStyle: CSSProperties | undefined = shouldPortalComposer
    ? { minHeight: composerSlotHeight > 0 ? composerSlotHeight : undefined }
    : undefined;

  return (
    <div className="pane">
      <div className="chat-project-header">
        {onBack ? (
          <button
            type="button"
            className="chat-project-back"
            onClick={onBack}
            title={backLabel}
            aria-label={backLabel}
          >
            <Icon name="arrow-left" size={16} />
          </button>
        ) : null}
        {projectHeader ? (
          <span className="chat-project-header-title">{projectHeader}</span>
        ) : null}
        <div
          className={`chat-history-wrap chat-session-switcher${showConvList ? ' open' : ''}`}
          ref={historyWrapRef}
        >
          <button
            type="button"
            className="chat-session-trigger icon-only"
            data-testid="conversation-history-trigger"
            title={
              activeConversation?.title
                ? `${t('chat.conversationsTitle')} · ${activeConversation.title}`
                : t('chat.conversationsTitle')
            }
            aria-label={t('chat.conversationsAria')}
            aria-haspopup="menu"
            aria-expanded={showConvList}
            onClick={handleToggleHistoryList}
          >
            <Icon name="comment" size={16} />
          </button>
          {showConvList ? (
            <div className="chat-history-menu" role="menu" data-testid="conversation-history-menu">
              <div className="chat-history-menu-head">
                <span className="chat-history-menu-title">
                  {t('chat.conversationsHeading')}
                  <span className="chat-history-menu-count">
                    <span data-testid="conversation-history-count">
                    {filteredConversations.length === conversations.length
                      ? compactCount(conversations.length)
                      : `${compactCount(filteredConversations.length)} / ${compactCount(conversations.length)}`}
                    </span>
                  </span>
                </span>
                {onNewConversation ? (
                  <button
                    type="button"
                    className="chat-history-new"
                    data-testid="conversation-history-new"
                    disabled={newConversationDisabled}
                    onClick={handleStartNewConversation}
                  >
                    <Icon name="plus" size={11} />
                    <span>{t('chat.new')}</span>
                  </button>
                ) : null}
              </div>
              <label className="chat-history-search">
                <Icon name="search" size={12} />
                <input
                  type="search"
                  value={conversationSearch}
                  onChange={(event) => setConversationSearch(event.currentTarget.value)}
                  placeholder="Search conversations"
                  data-testid="conversation-history-search"
                />
                {conversationSearch ? (
                  <button
                    type="button"
                    className="chat-history-search-clear"
                    onClick={() => setConversationSearch('')}
                    aria-label={t('chat.comments.clear')}
                  >
                    <Icon name="close" size={10} />
                  </button>
                ) : null}
              </label>
              <div className="chat-history-list" data-testid="conversation-list">
                {conversations.length === 0 ? (
                  <div className="chat-history-empty">
                    {t('chat.emptyConversations')}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="chat-history-empty">
                    No conversations match.
                  </div>
                ) : (
                  filteredConversations.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      active={c.id === activeConversationId}
                      messageCount={conversationMessageCount(c, activeConversationId, messagesConversationId, messages.length)}
                      onSelect={() => handleSelectConversation(c.id)}
                      onDelete={() => onDeleteConversation(c.id)}
                      t={t}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {tab === 'chat' ? (
        <>
          <div className={`chat-log-wrap${chatLogTray ? ' has-chat-log-tray' : ''}`}>
            <div
              className={[
                'chat-log',
                loading ? 'is-loading' : '',
                chatLogScrollable ? 'is-scrollable' : '',
                chatLogScrolling ? 'is-scrolling' : '',
                shouldBalanceFinishedTranscript ? 'is-balanced-transcript' : '',
              ].filter(Boolean).join(' ')}
              ref={logRef}
              aria-busy={loading}
              onClickCapture={(e) => {
                // Expanding an accordion (tool card / thinking block) should
                // grow downward with the clicked header staying put. While a
                // run is glued to the bottom, the ResizeObserver would re-pin
                // to the bottom on the height change and push the header up,
                // so unpin the moment the user toggles one open.
                const toggle = (e.target as HTMLElement).closest(
                  '.thinking-toggle, .action-card-toggle, button.op-card-head, [aria-expanded]',
                );
                if (toggle && logRef.current?.contains(toggle)) {
                  unpinFromBottom();
                }
              }}
            >
              {loading ? <ChatConversationLoading t={t} /> : null}
              {displayMessages.length === 0 && !loading ? (
                <div className="chat-empty-wrap">
                  {showImportedFolderArtifacts ? (
                    <ImportedFolderArtifacts
                      projectId={projectId}
                      files={importedFolderArtifacts}
                      onOpenFile={onRequestOpenFile}
                      t={t}
                      projectRawUrl={projectRawUrl}
                    />
                  ) : (
                    <>
                      <div className="chat-empty">
                        <span className="chat-empty-title">
                          {t('chat.startTitle')}
                        </span>
                      </div>
                      <div className="chat-examples" role="list">
                        {starterTemplateCards.map((ex, i) => (
                          <button
                            key={`${ex.title}-${i}`}
                            type="button"
                            role="listitem"
                            className="chat-example"
                            style={{ animationDelay: `${i * 70}ms` }}
                            onClick={() => handleStarterCardClick(ex.prompt)}
                            title={t('chat.fillInputTitle')}
                          >
                            <span className="chat-example-icon" aria-hidden>
                              {ex.icon}
                            </span>
                            <span className="chat-example-body">
                              <span className="chat-example-head">
                                <span className="chat-example-title">{ex.title}</span>
                                {ex.tag ? (
                                  <span className="chat-example-tag">{ex.tag}</span>
                                ) : null}
                              </span>
                              <span className="chat-example-prompt">{ex.prompt}</span>
                            </span>
                            <span className="chat-example-cta" aria-hidden>
                              ↵
                            </span>
                          </button>
                        ))}
                      </div>
                      {connectRepoNeeded ? (
                        <div className="chat-connect-repo" role="note">
                          <span className="chat-connect-repo-icon" aria-hidden>
                            <Icon name="github" size={18} />
                          </span>
                          <span className="chat-connect-repo-body">
                            <span className="chat-connect-repo-title">
                              {repoConnectCopy(t, githubConnected).cardTitle}
                            </span>
                            <span className="chat-connect-repo-text">
                              {repoConnectCopy(t, githubConnected).cardBody}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="primary-ghost"
                            disabled={githubConnected === undefined}
                            onClick={() => onConnectRepo?.()}
                          >
                            <Icon name="github" size={13} />
                            {repoConnectCopy(t, githubConnected).buttonLabel}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
              <ChatRows
                messages={displayMessages}
                streaming={streaming}
                liveToolInput={liveToolInput}
                projectId={projectId}
                projectKindForTracking={projectKindForTracking}
                activeConversationId={activeConversationId}
                activeConversationKey={activeConversationId ?? 'no-conversation'}
                projectFiles={projectFiles}
                projectMetadata={projectMetadata}
                projectFileNames={projectFileNames}
                onRequestOpenFile={onRequestOpenFile}
                onRequestPluginDetails={onRequestPluginDetails}
                onRequestDesignSystemDetails={onRequestDesignSystemDetails}
                onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
                activePluginActionPaths={activePluginActionPaths}
                hiddenPluginActionPaths={hiddenPluginActionPaths}
                onShareToOpenDesign={onShareToOpenDesign}
                shareToOpenDesignBusyMessageId={shareToOpenDesignBusyMessageId}
                forceStreamingMessageIds={forceStreamingMessageIds}
                lastAssistantId={lastAssistantId}
                firstUserMessageId={firstUserMessageId}
                activePluginSnapshot={activePluginSnapshot}
                activeDesignSystem={activeDesignSystem}
                hasActiveDesignSystem={hasActiveDesignSystem}
                errorCardOwnerId={errorCardOwnerId}
                nextUserContentByAssistantId={nextUserContentByAssistantId}
                assistantCallbacksRef={assistantCallbacksRef}
                onContinueRemainingTasks={onContinueRemainingTasks}
                onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
                onArtifactShare={onArtifactShare}
                onToolboxAction={handleToolboxAction}
                onNextStepPromptAction={handleNextStepPromptAction}
                onNextStepAiOptimize={onContinueBrandEnrichment}
                nextStepAiOptimizeBusy={brandEnrichmentBusy}
                onNextStepContinueExtraction={onContinueBrandExtraction}
                nextStepContinueExtractionBusy={continueBrandExtractionBusy}
                onNextStepContinueAiExtraction={onContinueBrandAgentExtraction}
                nextStepContinueAiExtractionBusy={continueBrandAgentExtractionBusy}
                onNextStepCreateDesign={onCreateDesignFromActiveDesignSystem}
                nextStepCreateDesignBusy={createDesignFromActiveDesignSystemBusy}
                onNextStepCreateDesignSystem={onCreateDesignSystemFromProject}
                nextStepCreateDesignSystemBusy={createDesignSystemFromProjectBusy}
                onPickSkill={handlePickSkill}
                onArtifactDownload={onArtifactDownload}
                nextStepSkills={skills}
                toolboxSkillNames={featuredToolboxSkillNames}
                nextStepVariant={nextStepVariant}
                onForkFromMessage={onForkFromMessage}
                onAssistantFeedback={onAssistantFeedback}
                forkingMessageId={forkingMessageId}
                t={t}
                onOpenQuestions={onOpenQuestions}
                scrollContainerRef={logRef}
                projectRawUrl={projectRawUrl}
              />
              {displayError ? (
                <div className="run-error" data-tone={runErrorTone}>
                  {/* ① type title + ② detail */}
                  <div className="run-error__main">
                    <span className="run-error__icon" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M8 4.5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div className="run-error__copy">
                      {runFailureUi ? (
                        <p className="run-error__title">{t(runFailureUi.titleKey)}</p>
                      ) : null}
                      <p className="run-error__desc">{displayError}</p>
                    </div>
                  </div>
                  {/* ④ collapsible error source */}
                  {errorDiagnosticText ? (
                    <div className={`run-error__source${errorSourceOpen ? ' is-open' : ''}`}>
                      <div className="run-error__source-head">
                        <button
                          type="button"
                          className="run-error__source-bar"
                          aria-expanded={errorSourceOpen}
                          aria-label={
                            errorSourceOpen
                              ? t('chat.runError.sourceCollapseAria')
                              : t('chat.runError.sourceExpandAria')
                          }
                          onClick={() => setErrorSourceOpen((open) => !open)}
                        >
                          <svg className="run-error__source-chevron" viewBox="0 0 12 12" fill="none">
                            <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="run-error__source-label">{t('chat.runError.sourceLabel')}</span>
                          {errorSourcePeek ? (
                            <span className="run-error__source-peek">{errorSourcePeek}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="run-error__source-copy"
                          onClick={() => void copyErrorDiagnostic()}
                          aria-label={copiedErrorDiagnostic ? t('chat.copyDone') : t('chat.copyErrorDiagnostic')}
                          title={copiedErrorDiagnostic ? t('chat.copyDone') : t('chat.copyErrorDiagnostic')}
                        >
                          <Icon name={copiedErrorDiagnostic ? 'check' : 'copy'} size={13} />
                        </button>
                      </div>
                      <div className="run-error__source-full">
                        <pre>{errorDiagnosticText}</pre>
                      </div>
                    </div>
                  ) : null}
                  {/* ③ fix actions */}
                  {showErrorActions ? (
                    <div className="run-error__actions">
                      {showByokRecoveryCta ? (
                        <button
                          type="button"
                          className="chat-error-action"
                          onClick={onSwitchToLocalCli}
                        >
                          {t('avatar.useLocal')}
                        </button>
                      ) : null}
                      {retryAssistant && onRetry && runFailureUi ? (
                        <>
                          {runFailureUi.primaryAction === 'authorize' ? (
                            // Sign in to AMR inline — the pill drives vela login,
                            // surfaces the activation URL/code when the browser
                            // doesn't auto-open, and on success we retry the run
                            // without bouncing the user out to Settings.
                            <AmrLoginPill
                              className="chat-error-amr-login"
                              signInLabel={t('chat.amrError.authorizeCta')}
                              amrEntrySourceDetail="chat_error_authorize_retry"
                              initialStatus={inlineAmrLoginStatus}
                              skipInitialRefresh
                              metricsConsent={config?.telemetry?.metrics === true}
                              installationId={config?.installationId}
                              showActivationDetails
                              hideSignedOutStatus
                              revealPendingCancelAction
                              onSignInStarted={handleAmrSignInStarted}
                              onStatusChange={handleAmrLoginStatusChange}
                            />
                          ) : runFailureUi.primaryAction === 'launch-terminal-auth' ? (
                            <button
                              type="button"
                              className="chat-error-action"
                              onClick={() => {
                                onLaunchAntigravityOauth?.();
                              }}
                            >
                              {t('chat.antigravityError.launchTerminalCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'launch-terminal-switch-model' ? (
                            <button
                              type="button"
                              className="chat-error-action"
                              onClick={() => {
                                onLaunchAntigravityOauth?.();
                              }}
                            >
                              {t('chat.antigravityError.launchSwitchModelCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'recharge' ? (
                            <button
                              type="button"
                              className="chat-error-action"
                              onClick={handleAmrRecharge}
                            >
                              {t('chat.amrError.rechargeCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'upgrade' ? (
                            <button
                              type="button"
                              className="chat-error-action"
                              onClick={handleAmrUpgrade}
                            >
                              {t('chat.amrBalanceGate.plansCta')}
                            </button>
                          ) : null}
                          {canResumeFailedRun ? (
                            // Resumable failure: continue the agent's existing
                            // CLI session instead of restarting from scratch, so
                            // partial work is kept. Replaces the from-scratch
                            // Retry as the single primary recovery action. Use
                            // the wired resume handler when present, otherwise a
                            // plain send of the continue prompt — never the
                            // re-sending Retry path, which would resume + repeat.
                            <button
                              type="button"
                              className="ghost chat-error-retry"
                              onClick={() =>
                                onResumeRun
                                  ? onResumeRun(retryAssistant)
                                  : onSend(RESUME_CONTINUE_PROMPT, [], [])
                              }
                            >
                              {t('chat.resumeRunCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'retry' || runFailureUi.secondaryRetry ? (
                            <button
                              type="button"
                              className="ghost chat-error-retry"
                              onClick={() => onRetry(retryAssistant)}
                            >
                              {t('promptTemplates.retry')}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {amrSwitchPayload ? (
                <AmrGuidance
                  {...amrSwitchPayload}
                  sourceDetail="chat_error_switch_retry_card"
                  metricsConsent={config?.telemetry?.metrics === true}
                  onActivate={handleAmrSwitchActivate}
                />
              ) : null}
              {/* Dynamic spacer: when a turn is anchored to the top, this
                  grows just enough to let the user message reach the top of
                  the viewport, then shrinks as the reply streams in below. */}
              <div className="chat-log-tail-spacer" ref={tailSpacerRef} aria-hidden />
            </div>
            {chatLogTray}
            {/* Always mounted so the CSS transition can play in both
                directions; the `chat-jump-btn-active` class flips the
                slide + opacity, and `aria-hidden` + `tabIndex={-1}`
                keep it out of the a11y tree when it's not visible.
                Also suppressed while the conversation-history dropdown is
                open: the dropdown sits in a separate stacking context, so
                without this the button bleeds through it (#4123). */}
            <button
              type="button"
              className={`chat-jump-btn${scrolledFromBottom && !showConvList ? ' chat-jump-btn-active' : ''}`}
              onClick={jumpToBottom}
              title={t('chat.scrollToLatest')}
              aria-hidden={!scrolledFromBottom || showConvList}
              tabIndex={scrolledFromBottom && !showConvList ? 0 : -1}
            >
              <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
              <span>{t('chat.jumpToLatest')}</span>
            </button>
          </div>
          <QueuedSendStrip
            containerRef={queuedSendStripRef}
            items={queuedItems}
            editingId={editingQueuedSendId}
            onEdit={handleEditQueuedSend}
            onRemove={handleRemoveQueuedSend}
            onReorder={onReorderQueuedSends}
            onSendNow={handleSendQueuedNow}
          />
          <div
            className="chat-composer-slot"
            ref={composerSlotRef}
            style={composerSlotStyle}
            aria-hidden={shouldPortalComposer ? true : undefined}
          >
            {shouldPortalComposer ? null : composerNode}
          </div>
          {shouldPortalComposer && composerPortalTarget && composerPortalRect
            ? createPortal(
                <div
                  className="chat-composer-fixed-layer"
                  ref={composerLayerRef}
                  style={{
                    left: composerPortalRect.left,
                    bottom: composerPortalRect.bottom,
                    width: composerPortalRect.width,
                  }}
                >
                  {composerNode}
                </div>,
                composerPortalTarget,
              )
            : null}
        </>
      ) : null}
    </div>
  );
}
