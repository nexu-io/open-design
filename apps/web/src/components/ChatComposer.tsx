'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { localizePluginDescription } from './plugins-home/localization';
import type { Dict, Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { useAnalytics } from '../analytics/provider';
import {
  trackChatPanelClick,
  trackComposerSessionModeClick,
  trackContextLinkResult,
  trackFigmaHelpModalSurfaceView,
  trackProjectReferenceModalSurfaceView,
} from '../analytics/events';
import type {
  ComposerBarClickProps,
  DesignToolboxClickProps,
} from '@open-design/contracts/analytics';
import { sessionModeToTracking } from '@open-design/contracts/analytics';
import { projectRawUrl, uploadProjectFiles, openFolderDialog, applyLibraryAsset, fetchLibraryAssetElementHtml } from "../providers/registry";
import { openDesignSystemPickerTrigger } from '../providers/dom';
import { WorkingDirPicker } from './WorkingDirPicker';
import { duplicatePluginAsProject, patchProject } from "../state/projects";
import { navigate } from '../router';
import type { McpServerConfig } from "@open-design/contracts";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, Project, ProjectFile, ProjectMetadata, SkillSummary } from "../types";
import type {
  ContextItem,
  ChatAnalyticsEntryFrom,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  PluginSourceKind,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { Icon, type IconName } from "./Icon";
import { ComposerPlusMenu, PLUS_SUBMENU_RESOURCE_KIND } from './ComposerPlusMenu';
import { LibraryPicker } from './LibraryPicker';
import { FigmaImportModal } from './FigmaImportModal';
import { FigmaHelpModal } from './FigmaHelpModal';
import { ProjectReferenceModal } from './ProjectReferenceModal';
import { SessionModeToggle } from './SessionModeToggle';
import type { LibraryElementMeta } from '@open-design/contracts';
import {
  DESIGN_TOOLBOX_ACTIONS,
  getDesignToolboxAction,
  type DesignToolboxAction,
  type DesignToolboxActionId,
} from '../runtime/design-toolbox';
import { ComposerPluginPreview } from './ComposerPluginPreview';
import { PluginDetailsModal } from "./PluginDetailsModal";
import { SkillDetailsModal } from './SkillDetailsModal';
import { PluginsSection, type PluginsSectionHandle } from "./PluginsSection";
import {
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from "./PreviewDrawOverlay";
import { DesignSystemSwitchPicker } from "./DesignSystemSwitchPicker";
import { listenForConnectorsChanged } from './connectors-events';
import { PlaceholderCarousel } from './home-hero/PlaceholderCarousel';
import type { PlaceholderScenario } from './home-hero/placeholderScenarios';
import {
  normalizeChatAttachmentOrders,
  nextChatAttachmentOrder,
  workspaceContextIcon,
  workspaceContextTitle,
  workspaceContextDescription,
  lastPathSegment,
  projectFileMentionTitle,
  projectFileMentionDescription,
  workspaceContextKindLabel,
  prettySize,
  pluginMatchesQuery,
  buildDesignToolboxResources,
  designToolboxResourceMatchesQuery,
  designToolboxDefaultResources,
  designToolboxResourceKindLabel,
  designToolboxResourceIsActive,
  designToolboxSkillBadge,
  designToolboxSkillIcon,
  designToolboxContextLine,
  designToolboxDraftLine,
  designToolboxWorkspaceKindLabel,
  designToolboxResourceIndexLines,
  designToolboxCompactLine,
  mcpServerMatchesQuery,
  mcpTemplateMatchesQuery,
  pluginSourceLabel,
  pluginsAllowedForComposer,
  computeToolboxDetailPosition,
  type TranslateFn,
  type DesignToolboxResourceKind,
  type DesignToolboxResourceIndex,
  type DesignToolboxResourceBase,
  type DesignToolboxResource,
  StagedCommentAttachments,
  ToolsPluginsPanel,
  ToolsMcpPanel,
  ToolboxItemRow,
  ToolsSkillsPanel,
  ToolsImportPanel,
  SlashPopover,
  MentionPopover,
  DesignToolboxPanel,
  StagedRunContexts,
  useComposerModals,
  type ComposerModalsController,
  useComposerUpload,
  type ComposerUploadController,
  useWiredWorkingDirStatus,
  type WorkingDirStatusController,
  useSlashPopover,
  type SlashPopoverParams,
  type SlashPopoverController,
  useCommentAttachments,
  type CommentAttachmentsParams,
  type CommentAttachmentsController,
  useWiredComposerCatalogue,
  type ComposerCatalogueParams,
  type ComposerCatalogueController,
  useWorkspaceContextLinking,
  type WorkspaceContextLinkingParams,
  type WorkspaceContextLinkingController,
  useMentionPopover,
  type MentionPopoverParams,
  type MentionPopoverController,
  useStagedRunContext,
  type StagedRunContextParams,
  type StagedRunContextController,
  useAppliedPlugin,
  type AppliedPluginParams,
  type AppliedPluginController,
  useWiredComposerDraft,
  type ComposerDraftParams,
  type ComposerDraftController,
  designToolboxResourceTracking,
  inlineBackedPluginFromRestoredDraft,
  composerSendGate,
  expandHatchCommand,
  expandSearchCommand,
  trackComposerBar as trackComposerBarImpl,
  trackDesignToolbox as trackDesignToolboxImpl,
  duplicatePluginRecordAsProject as duplicatePluginRecordAsProjectImpl,
  handleEditorChange as handleEditorChangeImpl,
  applyDesignToolboxAction as applyDesignToolboxActionImpl,
  applyDesignToolboxSkill as applyDesignToolboxSkillImpl,
  applyDesignToolboxResource as applyDesignToolboxResourceImpl,
  setWorkingDirFolder as setWorkingDirFolderImpl,
  handlePickWorkingDir as handlePickWorkingDirImpl,
  clearWorkingDir as clearWorkingDirImpl,
  pickSlash as pickSlashAction,
  tryHandleMcpSlash as tryHandleMcpSlashAction,
  tryHandlePetSlash as tryHandlePetSlashAction,
  appendContextAttachment as appendContextAttachmentImpl,
  uploadFiles as uploadFilesImpl,
  addAssetsFromLibrary as addAssetsFromLibraryImpl,
  handlePasteFiles as handlePasteFilesImpl,
  handleDrop as handleDropImpl,
  removeStaged as removeStagedImpl,
  handleAnnotationEvent as handleAnnotationEventImpl,
  flushDeferredAnnotationSend as flushDeferredAnnotationSendImpl,
  handleReferenceProjects as handleReferenceProjectsImpl,
  handleLinkLocalCodeContext as handleLinkLocalCodeContextImpl,
  removeWorkspaceContext as removeWorkspaceContextImpl,
  submit as submitImpl,
  type DesignToolboxApplyDeps,
  type WorkingDirActionDeps,
  type PickSlashDeps,
  type UploadActionDeps,
  type AnnotationActionDeps,
  type DeferredAnnotationSendDeps,
  type ReferenceProjectsDeps,
  type LinkLocalCodeContextDeps,
  type RemoveWorkspaceContextDeps,
  type EditorChangeDeps,
  type SendActionDeps,
  type ChatSendMeta,
} from '../features/chat-composer';

type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import';

interface Props {
  projectId: string | null;
  projectFiles: ProjectFile[];
  activeProjectFileName?: string | null;
  streaming: boolean;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  sendDisabled?: boolean;
  initialDraft?: string;
  composerPlaceholder?: string;
  placeholderScenarios?: ReadonlyArray<PlaceholderScenario>;
  draftStorageKey?: string;
  // Lazy ensure — the composer calls this before its first upload, so the
  // project folder exists on disk before files land in it. Returns the
  // project id when ready.
  onEnsureProject: () => Promise<string | null>;
  commentAttachments?: ChatCommentAttachment[];
  onRemoveCommentAttachment?: (id: string) => void;
  // Available skills the user can compose into a turn via @<skill>. The
  // chat layer already filters out disabled skills before passing them in
  // here, so the picker can render the list as-is. Keep this optional so
  // the composer still works on surfaces that don't show a skills picker
  // (e.g. tests, screenshot harnesses).
  skills?: SkillSummary[];
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  onStop: () => void;
  // Opens the global settings dialog (CLI / model / agent picker). The
  // composer's leading gear icon routes here so users can switch models
  // without leaving the chat.
  onOpenSettings?: () => void;
  // Opens settings on the External MCP tab. Wired from ChatPane → App.
  // The composer's `/mcp` slash command and the MCP picker button route here.
  onOpenMcpSettings?: () => void;
  // The "+" menu's "add plugin" / "add connector" rows route to the home
  // surfaces (plugin registry / connector integrations). Wired from
  // ChatPane → ProjectView → App. Omitted → the add rows are hidden.
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // Optional pet wiring. The composer no longer renders a visible pet
  // entry, but existing manual `/pet` commands still route here.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  researchAvailable?: boolean;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  activeWorkspaceContext?: WorkspaceContextItem | null;
  initialWorkspaceContexts?: WorkspaceContextItem[];
  workspaceContexts?: WorkspaceContextItem[];
  // BYOK image-model picker shown above the textarea for protocols that
  // inject the daemon-side generate_image tool (SenseAudio, AIHubMix).
  // Hidden for every other BYOK tab so the composer stays clean. The
  // state owner is ProjectView (per-session, reset on refresh);
  // ChatComposer is a fully controlled select.
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
  byokVideoModel?: string;
  onChangeByokVideoModel?: (model: string) => void;
  byokSpeechModel?: string;
  onChangeByokSpeechModel?: (model: string) => void;
  byokSpeechVoice?: string;
  onChangeByokSpeechVoice?: (voice: string) => void;
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  // Set when the project was created with a plugin already pinned
  // (PluginLoopHome on Home). When provided, the in-composer plugin
  // rail collapses to the single pinned plugin so the user can see
  // which plugin is active without being offered every other installed
  // plugin (the user reported "选了 new-generation, 结果 composer 显
  // 示了多个 plugin"). The active plugin still appears as an
  // ActivePluginChip on each user message (see UserMessage in
  // ChatPane). Pass `null` (or omit) to render the full rail.
  pinnedPluginId?: string | null;
  footerAccessory?: ReactNode;
  // Slot rendered in the composer's bottom toolbar, immediately right of the
  // "+" menu. Hosts the working-directory pill so the folder selector sits by
  // the composer (mirroring the home input) instead of the file-panel header.
  leadingAccessory?: ReactNode;
  // Design-system picker slot rendered at the top of the composer (above
  // the textarea). The former standalone chrome header row was removed;
  // ProjectView owns the project record so it renders the picker as a slot.
  designSystemPicker?: ReactNode;
  // Project's current `designSystemId`. The mid-chat design-system picker
  // uses this to surface a "current" indicator and to no-op a redundant
  // switch. Optional so test/screenshot harnesses can omit it.
  currentDesignSystemId?: string | null;
  // Fires after a successful `PATCH /api/projects/:id` from the mid-chat
  // design-system picker. Receives the full patched `Project` straight
  // from the PATCH response so the parent replaces its mirror wholesale —
  // rebuilding from a stale `project` prop would drop server-owned fields
  // the daemon refreshes on every PATCH (e.g. `updatedAt`).
  onActiveDesignSystemChange?: (project: Project) => void;
  // Optional transient banner sink. The composer emits one short message
  // here when a mid-chat design-system switch lands (or fails) so the user
  // has explicit confirmation without re-opening the picker.
  onShowToast?: (message: string) => void;
}

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerDraftOptions {
  entryFrom?: ChatAnalyticsEntryFrom;
  sessionMode?: ChatSessionMode;
}

export interface ChatComposerHandle {
  setDraft: (text: string, options?: ChatComposerDraftOptions) => void;
  restoreDraft: (draft: {
    text: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
    /**
     * The queued turn's meta. When present, restoreDraft rebuilds the staged
     * plugin / connector / skill / MCP context (and re-shows their chips) so
     * editing a queued item keeps its bindings instead of silently dropping
     * them.
     */
    meta?: ChatSendMeta;
  }) => void;
  focus: () => void;
  /**
   * Run a design-toolbox action by id from outside the composer (e.g. the
   * assistant "next step" card). Resolves the action, matches its preferred
   * skill, and seeds the composer draft with the action prompt + `@skill`
   * mention — identical to picking the action inside the toolbox panel, so the
   * draft still waits for the user to send. No-op for an unknown id.
   */
  applyDesignToolboxAction: (id: DesignToolboxActionId) => void;
  /**
   * Seed the composer with a specific skill by id (same path as picking it in
   * the toolbox panel). Used by the next-step card's full skill list. No-op for
   * an unknown id.
   */
  applyDesignToolboxSkill: (skillId: string) => void;
  /** Legacy: open the standalone toolbox popover. Currently unused by callers. */
  openDesignToolbox: () => void;
}

// Defined in the slice (features/chat-composer/types.ts) so rules.ts/
// actions.ts can reference it too; re-exported here so ChatComposer.tsx
// stays the public import path (ProjectView, SideChatTab import it from
// './ChatComposer').
export type { ChatSendMeta };

/**
 * The chat composer: textarea + paste/drop/attach buttons + @-mention
 * picker. Attachments are uploaded into the active project's folder so
 * the agent can reference them by relative path on its next turn.
 *
 * `@` typed at a word boundary opens a popover listing project files.
 * Selecting one inserts `@<path>` into the prompt and stages it as an
 * attachment so the daemon also includes it explicitly.
 */
// Injectable hooks for the orchestrator. Each defaults to its wired hook (or,
// for the no-port pure-state hooks, the hook itself), so production callers
// pass nothing while tests swap a hook for a fake and render the orchestrator
// directly instead of mocking modules. Per-hook injection (not one bag) keeps
// each seam independently overridable, matching `MemorySection.tsx`'s
// `MemorySectionHooks` pattern.
interface ChatComposerHooks {
  useModals?: () => ComposerModalsController;
  useUpload?: () => ComposerUploadController;
  useWorkingDir?: () => WorkingDirStatusController;
  useSlash?: (params: SlashPopoverParams) => SlashPopoverController;
  useComments?: (params: CommentAttachmentsParams) => CommentAttachmentsController;
  useCatalogue?: (params: ComposerCatalogueParams) => ComposerCatalogueController;
  useWorkspaceContext?: (params: WorkspaceContextLinkingParams) => WorkspaceContextLinkingController;
  useMention?: (params: MentionPopoverParams) => MentionPopoverController;
  useStagedRunContext?: (params: StagedRunContextParams) => StagedRunContextController;
  useAppliedPlugin?: (params: AppliedPluginParams) => AppliedPluginController;
  useDraft?: (params: ComposerDraftParams) => ComposerDraftController;
}

export const ChatComposer = forwardRef<ChatComposerHandle, Props & ChatComposerHooks>(
  function ChatComposer(
    {
      projectId,
      projectFiles,
      activeProjectFileName = null,
      streaming,
      sessionMode = 'design',
      onSessionModeChange,
      sendDisabled = false,
      initialDraft,
      composerPlaceholder,
      placeholderScenarios = [],
      draftStorageKey,
      onEnsureProject,
      commentAttachments = [],
      onRemoveCommentAttachment,
      skills = [],
      onSend,
      onStop,
      onOpenMcpSettings,
      onBrowsePlugins,
      onOpenConnectors,
      petConfig,
      onAdoptPet,
      onTogglePet,
      onOpenPetSettings,
      researchAvailable = false,
      projectMetadata,
      onProjectMetadataChange,
      activeWorkspaceContext = null,
      initialWorkspaceContexts = [],
      workspaceContexts = [],
      byokApiProtocol,
      byokImageModel,
      onChangeByokImageModel,
      byokVideoModel,
      onChangeByokVideoModel,
      byokSpeechModel,
      onChangeByokSpeechModel,
      byokSpeechVoice,
      onChangeByokSpeechVoice,
      currentSkillId = null,
      onProjectSkillChange,
      pinnedPluginId = null,
      footerAccessory,
      leadingAccessory,
      designSystemPicker,
      onShowToast,
      useModals = useComposerModals,
      useUpload = useComposerUpload,
      useWorkingDir = useWiredWorkingDirStatus,
      useSlash = useSlashPopover,
      useComments = useCommentAttachments,
      useCatalogue = useWiredComposerCatalogue,
      useWorkspaceContext = useWorkspaceContextLinking,
      useMention = useMentionPopover,
      useStagedRunContext: useStagedRunContextHook = useStagedRunContext,
      useAppliedPlugin: useAppliedPluginHook = useAppliedPlugin,
      useDraft = useWiredComposerDraft,
    },
    ref
  ) {
    const { locale, t } = useI18n();
    const analytics = useAnalytics();
    // Portal target for the slice's dumb components (DesignToolboxPanel's
    // hover-detail, StagedRunContexts' attachment preview) — resolved once
    // here so those components stay DOM-free, matching the
    // `MemoryAdvancedModal` canary's `modalHost` pattern.
    const modalHost = typeof document === 'undefined' ? null : document.body;
    // Attachment thumbnails preview in a portal modal. State lives here (not a
    // feature hook) because the Escape-to-close `keydown` listener is an
    // accumulating browser subscription — it belongs to this single-instance
    // orchestrator, not to a per-mount feature hook.
    const [stagedPreview, setStagedPreview] = useState<ChatAttachment | null>(null);
    const stagedPreviewUrl = stagedPreview && projectId ? projectRawUrl(projectId, stagedPreview.path) : null;
    useEffect(() => {
      if (!stagedPreview) return;
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setStagedPreview(null);
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [stagedPreview]);
    const resolveStagedImageUrl = useCallback(
      (path: string) => (projectId ? projectRawUrl(projectId, path) : null),
      [projectId],
    );
    const activeFileContext =
      projectMetadata?.importedFrom === 'folder' && activeProjectFileName
        ? activeProjectFileName
        : null;
    const activeFileDisplayName = activeFileContext ? lastPathSegment(activeFileContext) : null;
    // The Lexical editor handle — drives text/mention/clear/focus from the
    // host. Replaces the old textareaRef + manual selection plumbing. IME
    // composition guarding now lives inside the editor's command handlers.
    // Declared here (rather than alongside the other composer refs below) so
    // it's available for the draft hook call right after, which needs it for
    // `replaceEditorDraft`/`insertInlineMentionSeparator`.
    const editorRef = useRef<LexicalComposerInputHandle | null>(null);
    const {
      draft,
      setDraft,
      draftRef,
      seededRef,
      placeholderScenario,
      setPlaceholderScenario,
      replaceEditorDraft,
      insertInlineMentionSeparator,
      clearDraft,
    } = useDraft({ initialDraft, draftStorageKey, editorRef });
    const composerRootRef = useRef<HTMLDivElement | null>(null);
    const pendingSessionModeRef = useRef<ChatSessionMode | null>(null);
    const previousSessionModeRef = useRef(sessionMode);

    useEffect(() => {
      if (previousSessionModeRef.current === sessionMode) return;
      if (pendingSessionModeRef.current && pendingSessionModeRef.current !== sessionMode) {
        pendingSessionModeRef.current = null;
      }
      previousSessionModeRef.current = sessionMode;
    }, [sessionMode]);

    // chat_panel page_view fires from ProjectView (which outlives
    // conversation switches) so the event measures real chat-panel
    // entries rather than ChatComposer remounts. See PR #2285 review
    // 2026-05-20 04:08 for the rationale.
    const modals = useModals();
    const {
      stagedVisualComments,
      setStagedVisualComments,
      streamingAnnotationSendPending,
      streamingAnnotationSendPendingRef,
      setStreamingAnnotationSendPending,
      streamingAnnotationSendEntryFromRef,
      currentCommentAttachments,
      removeCommentAttachment,
    } = useComments({ commentAttachments, onRemoveCommentAttachment });
    // Legacy standalone design-toolbox popover. The next-step card now renders
    // its own cascading skill menu, so nothing opens this anymore; kept compiling
    // behind `openDesignToolbox` until the panel subsystem is removed wholesale.
    const [designToolboxOpen, setDesignToolboxOpen] = useState(false);
    // stagedSkills/stagedMcpServers/stagedConnectors — the skills/MCP-servers/
    // connectors the user has @-mentioned or applied for this turn — now come
    // from useStagedRunContext (called below, once trackComposerBar exists).
    const linkedDirs = projectMetadata?.linkedDirs ?? [];
    const {
      stagedWorkspaceContexts,
      setStagedWorkspaceContexts,
      workspaceLinkedDirAdds,
      setWorkspaceLinkedDirAdds,
      promotedWorkspaceContextDir,
      setPromotedWorkspaceContextDir,
      dismissedWorkspaceContextId,
      setDismissedWorkspaceContextId,
      visibleWorkspaceContext,
      selectedWorkspaceContexts,
      selectedWorkspaceContextDirs,
      workspaceContextMetadataLinkedDirList,
      workingDir,
    } = useWorkspaceContext({ activeWorkspaceContext, initialWorkspaceContexts, linkedDirs });
    const upload = useUpload();
    const { staged, setStaged, nextAttachmentOrderRef } = upload;
    // MCP servers/templates, connectors, installed plugins, and the
    // `composerEngaged` fetch latch — all fetched lazily once the composer is
    // actually used (first focus, the tools popover opening, an @/slash
    // trigger, or a pre-seeded draft). Called here (rather than lower,
    // alongside the other design-toolbox catalogue memos) so `mcpServers` is
    // already defined for the `useSlashPopover` call right below, which needs
    // the raw (unfiltered) list.
    const catalogue = useCatalogue({
      projectId,
      initialEngaged: (draft ?? '').trim().length > 0,
    });
    const {
      mcpServers,
      mcpTemplates,
      connectors,
      installedPlugins,
      composerEngaged,
      markComposerEngaged,
      refreshConnectors,
    } = catalogue;
    const slashPopover = useSlash({
      researchAvailable,
      t,
      mcpServers,
      onOpenMcpSettings,
    });
    const { slash, setSlash, slashIndex, setSlashIndex, filteredSlash } = slashPopover;
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    const clearPluginsSection = useCallback(() => pluginsSectionRef.current?.clear(), []);
    const {
      activeAppliedPlugin,
      setActiveAppliedPlugin,
      inlineBackedPluginRef,
      setInlineBackedPlugin,
      handlePluginApplied,
      handlePluginCleared,
      removeAppliedPlugin,
    } = useAppliedPluginHook({ draft, setDraft, clearPluginsSection });
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts project context, MCP, Import actions,
    // and a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    // The "+" menu (ComposerPlusMenu) owns its own open / submenu state.
    // The `composerEngaged` fetch latch itself (deferring the plugin/MCP/
    // connector fetches until first focus, the tools popover opening, an
    // @/slash trigger, or a pre-seeded draft) now lives in the catalogue
    // hook above; see `markComposerEngaged`.
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // Always points at the latest `applyDesignToolboxAction` closure so the
    // imperative handle (whose deps array doesn't track `draft`/`t`) never seeds
    // the composer from a stale draft when the next-step card fires an action.
    const applyDesignToolboxActionRef = useRef<(action: DesignToolboxAction) => void>(() => {});
    // Same latest-closure trick for picking a skill by id from the next-step card.
    const applyDesignToolboxSkillByIdRef = useRef<(skillId: string) => void>(() => {});
    // Best-effort entry_from carried from a guided Next-step action: the card
    // only seeds the composer, so the tag is stashed here and consumed by the
    // next `sendComposedTurn` (then cleared). An explicit meta.entryFrom always
    // wins over this pending value.
    const pendingEntryFromRef = useRef<ChatAnalyticsEntryFrom | null>(null);
    const petEnabled = Boolean(onAdoptPet && onTogglePet);
    const workingDirStatus = useWorkingDir();
    // Live-check whether the selected working directory still exists, so a
    // folder deleted from disk turns the picker red without a page reload.
    // Re-checked when the dir changes, when the window/tab regains focus
    // (e.g. after deleting it in Finder), and when the picker is opened.
    const { checkWorkingDir } = workingDirStatus;
    useEffect(() => {
      void checkWorkingDir(workingDir);
      const onFocus = () => void checkWorkingDir(workingDir);
      const onVisible = () => {
        if (document.visibilityState === 'visible') void checkWorkingDir(workingDir);
      };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }, [checkWorkingDir, workingDir]);
    // Skills now come from the parent (App.tsx → ProjectView → ChatPane → ChatComposer)
    // pre-filtered by enabled/disabled state. We no longer fetch a fresh list
    // here to avoid showing skills the user has disabled via Settings.

    // The MCP servers/templates, installed-plugins, and connector-catalogue
    // fetches (each gated on `composerEngaged`) now live in the catalogue
    // hook above. This effect keeps only the connectors-changed
    // subscription: `listenForConnectorsChanged` is an ACCUMULATING
    // `window`/event listener, so per the slice's effect-placement rule it
    // stays here (a guaranteed single instance) rather than inside the hook,
    // which just exposes `refreshConnectors` for it to call.
    useEffect(() => {
      if (!composerEngaged) return;
      return listenForConnectorsChanged(() => void refreshConnectors());
    }, [composerEngaged, refreshConnectors]);

    const pluginsForComposer = useMemo(
      () => pluginsAllowedForComposer(installedPlugins),
      [installedPlugins],
    );

    const enabledMcpServers = useMemo(
      () => mcpServers.filter((s) => s.enabled),
      [mcpServers],
    );


    const designToolboxResourceIndex = useMemo<DesignToolboxResourceIndex>(
      () => ({
        skills,
        plugins: pluginsForComposer,
        mcpServers: enabledMcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
      }),
      [connectors, enabledMcpServers, mcpTemplates, pluginsForComposer, projectFiles, skills],
    );
    // Resolve which tabs to surface in the consolidated tools popover.
    // Plugins is always visible while a project is active so users can
    // apply context without leaving the composer. MCP shows when wired by
    // onOpenMcpSettings; see useSlashPopover (called earlier, alongside
    // mcpServers) for the slash-command catalog.

    const pickSlashDeps: PickSlashDeps = {
      slash,
      setSlash,
      replaceActiveTrigger: (text) => editorRef.current?.replaceActiveTrigger(text),
      focusEditor: () => editorRef.current?.focus(),
    };

    useImperativeHandle(
      ref,
      () => ({
        setDraft: (text: string, options?: ChatComposerDraftOptions) => {
          pendingEntryFromRef.current = options?.entryFrom ?? null;
          pendingSessionModeRef.current = options?.sessionMode ?? null;
          setDraft(text);
          editorRef.current?.setText(text);
          editorRef.current?.focus();
          seededRef.current = true;
        },
        restoreDraft: ({ text, attachments = [], commentAttachments = [], meta }) => {
          setDraft(text);
          const orderedAttachments = normalizeChatAttachmentOrders(attachments);
          setStaged(orderedAttachments);
          nextAttachmentOrderRef.current = nextChatAttachmentOrder(orderedAttachments);
          setStagedVisualComments(commentAttachments);
          // Rebuild staged context from the queued turn's meta so the
          // plugin / connector / skill / MCP / workspace-tab bindings (and their chips) come
          // back for editing instead of being dropped. Ids resolve against the
          // currently-loaded lists; ids that no longer resolve (uninstalled
          // since queueing) are skipped rather than crashing. The applied
          // plugin is restored from its full snapshot, so it needs no lookup.
          const ctx = meta?.context;
          setStagedSkills(
            ctx?.skillIds
              ? ctx.skillIds
                  .map((id) => skills.find((s) => s.id === id))
                  .filter((s): s is SkillSummary => Boolean(s))
              : [],
          );
          setStagedMcpServers(
            ctx?.mcpServerIds
              ? ctx.mcpServerIds
                  .map((id) => mcpServers.find((s) => s.id === id))
                  .filter((s): s is McpServerConfig => Boolean(s))
              : [],
          );
          setStagedConnectors(
            ctx?.connectorIds
              ? ctx.connectorIds
                  .map((id) => connectors.find((c) => c.id === id))
                  .filter((c): c is ConnectorDetail => Boolean(c))
              : [],
          );
          setStagedWorkspaceContexts(ctx?.workspaceItems ?? []);
          const restoredAppliedPlugin = meta?.appliedPluginSnapshot ?? null;
          setActiveAppliedPlugin(restoredAppliedPlugin);
          inlineBackedPluginRef.current = inlineBackedPluginFromRestoredDraft(
            text,
            restoredAppliedPlugin,
            meta,
          );
          upload.setUploadError(null);
          setMention(null);
          setSlash(null);
          editorRef.current?.setText(text);
          editorRef.current?.focus();
          seededRef.current = true;
        },
        focus: () => {
          editorRef.current?.focus();
        },
        applyDesignToolboxAction: (id: DesignToolboxActionId) => {
          const action = getDesignToolboxAction(id);
          if (!action) return;
          pendingEntryFromRef.current = 'next_step';
          applyDesignToolboxActionRef.current(action);
        },
        applyDesignToolboxSkill: (skillId: string) => {
          pendingEntryFromRef.current = 'next_step';
          applyDesignToolboxSkillByIdRef.current(skillId);
        },
        openDesignToolbox: () => {
          markComposerEngaged();
          setDesignToolboxOpen(true);
        },
      }),
      [connectors, mcpServers, pluginsForComposer, skills, markComposerEngaged]
    );

    // Fills the fixed page/area/project context for the rest of the composer
    // bottom bar (plus menu, design-system / working-dir switch, agent
    // selector, context-chip removal).
    const trackComposerBar = useCallback((
      fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>,
    ) => {
      trackComposerBarImpl(fields, { track: analytics.track, projectId });
    }, [analytics.track, projectId]);

    // Fills the fixed page/area/project context so toolbox call sites only
    // pass the event-specific fields (element + ids).
    const trackDesignToolbox = useCallback((
      fields: Omit<DesignToolboxClickProps, 'page_name' | 'area' | 'project_id'>,
    ) => {
      trackDesignToolboxImpl(fields, { track: analytics.track, projectId });
    }, [analytics.track, projectId]);

    // Called here (rather than alongside the other cluster hooks above)
    // because its bound remove callbacks need `trackComposerBar`, which
    // isn't defined until just above this point.
    const {
      stagedSkills,
      setStagedSkills,
      stagedMcpServers,
      setStagedMcpServers,
      stagedConnectors,
      setStagedConnectors,
      removeStagedSkill,
      removeStagedMcpServer,
      removeStagedConnector,
    } = useStagedRunContextHook({ draft, replaceEditorDraft, trackComposerBar });

    // Bundles everything the extracted design-toolbox-apply functions
    // (features/chat-composer/actions.ts) need from this component's scope,
    // since they're too entangled with draft/editor-ref/staging state to be
    // pure rules. Recreated each render so it always closes over the latest
    // draft/context (mirrors the old inline closures' behavior exactly).
    const designToolboxApplyDeps: DesignToolboxApplyDeps = {
      skills,
      visibleWorkspaceContext,
      draft,
      resourceIndex: designToolboxResourceIndex,
      t,
      setStagedSkills,
      setStagedMcpServers,
      setStagedConnectors,
      replaceEditorDraft,
      focusEditor: () => editorRef.current?.focus(),
      appendContextAttachment: (filePath) => appendContextAttachmentImpl(filePath, uploadActionDeps),
      setInlineBackedPlugin,
      applyPluginById: async (id, record) => {
        await pluginsSectionRef.current?.applyById(id, record);
      },
    };

    // Recreated each render (designToolboxApplyDeps is a fresh object every
    // render too), so this always captures the latest draft/context closure
    // for the imperative handle (see applyDesignToolboxActionRef).
    const applyDesignToolboxAction = useCallback((action: DesignToolboxAction) => {
      applyDesignToolboxActionImpl(action, designToolboxApplyDeps);
    }, [designToolboxApplyDeps]);
    applyDesignToolboxActionRef.current = applyDesignToolboxAction;

    const applyDesignToolboxSkill = useCallback((skill: SkillSummary) => {
      applyDesignToolboxSkillImpl(skill, designToolboxApplyDeps);
    }, [designToolboxApplyDeps]);
    // Latest-closure bridge for the imperative handle (see the ref declaration).
    applyDesignToolboxSkillByIdRef.current = (skillId: string) => {
      const skill = skills.find((s) => s.id === skillId);
      if (skill) applyDesignToolboxSkill(skill);
    };

    const applyDesignToolboxResource = useCallback((resource: DesignToolboxResource) => {
      applyDesignToolboxResourceImpl(resource, designToolboxApplyDeps);
    }, [designToolboxApplyDeps]);

    // Deps bag for the attachment/upload cluster's extracted functions (see
    // features/chat-composer/attachment-actions.ts): the staged-attachment
    // state + order ref, the already-landed upload UI-feedback hook's
    // setters, project lifecycle + transport (straight through from this
    // component's existing providers/registry imports, matching the
    // WorkingDirActionDeps precedent), analytics, the Lexical editor
    // primitives these functions drive, and the cross-cluster visual-comment
    // state `removeStaged` also clears. Recreated each render so it always
    // closes over the latest staged/draft/upload state.
    const uploadActionDeps: UploadActionDeps = {
      staged,
      setStaged,
      nextAttachmentOrderRef,
      setUploading: upload.setUploading,
      setUploadError: upload.setUploadError,
      setDragActive: upload.setDragActive,
      projectId,
      onEnsureProject,
      uploadProjectFiles,
      applyLibraryAsset,
      fetchLibraryAssetElementHtml,
      track: analytics.track,
      getEditorText: () => editorRef.current?.getText() ?? '',
      insertEditorText: (text) => editorRef.current?.insertText(text),
      focusEditor: () => editorRef.current?.focus(),
      replaceEditorDraft,
      draft,
      setStagedVisualComments,
      trackComposerBar,
    };

    // Registers the ANNOTATION_EVENT window listener (accumulating
    // subscription, must stay in the orchestrator per the effect-placement
    // rule) — the actual queue/send/draft handling lives in
    // `handleAnnotationEventImpl` (attachment-actions.ts), called with
    // `annotationActionDeps` (built further below, once `sendActionDeps` is
    // available). The listener callback only runs on a later event, by which
    // point this render's `annotationActionDeps` is assigned.
    useEffect(() => {
      function onAnnotation(e: Event) {
        const detail = (e as CustomEvent<AnnotationEventDetail>).detail;
        if (!detail) return;
        void handleAnnotationEventImpl(detail, annotationActionDeps);
      }
      window.addEventListener(ANNOTATION_EVENT, onAnnotation);
      return () => window.removeEventListener(ANNOTATION_EVENT, onAnnotation);
    }, [
      commentAttachments,
      draft,
      onSend,
      projectId,
      selectedWorkspaceContexts,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      t,
    ]);

    // Flushes a Mark send deferred while a run was streaming (see
    // `flushDeferredAnnotationSend` in attachment-actions.ts). Runs on every
    // dep change (cheap early-return inside), so it stays a plain effect
    // rather than an event listener; `deferredAnnotationSendDeps` (built
    // further below) is picked up fresh each time this effect re-fires,
    // since effects always run after the render that declared them.
    useEffect(() => {
      flushDeferredAnnotationSendImpl(deferredAnnotationSendDeps);
    }, [
      commentAttachments,
      draft,
      onSend,
      selectedWorkspaceContexts,
      sendDisabled,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      streamingAnnotationSendPending,
    ]);

    // Deps bag for the working-dir set/clear/pick action functions (see
    // features/chat-composer/actions.ts): transport + the cross-cluster
    // workspace-context state a promoted dir must reconcile against + the
    // working-dir-status hook's own recent-dirs writer.
    const workingDirActionDeps: WorkingDirActionDeps = {
      projectId,
      projectMetadata,
      workspaceContextMetadataLinkedDirList,
      selectedWorkspaceContextDirs,
      patchProject,
      openFolderDialog,
      onShowToast,
      onProjectMetadataChange,
      setPromotedWorkspaceContextDir,
      setWorkspaceLinkedDirAdds,
      rememberRecentDir: workingDirStatus.rememberRecentDir,
      t,
    };

    // Lexical drives every text change through this callback. Spans four
    // clusters (draft, applied-plugin, staged run-context, workspace-context)
    // with no single owning hook — see handleEditorChange in actions.ts.
    const editorChangeDeps: EditorChangeDeps = {
      draftRef,
      setDraft,
      activeAppliedPlugin,
      inlineBackedPluginRef,
      clearPluginsSection,
      setStagedSkills,
      setStagedMcpServers,
      setStagedConnectors,
      stagedWorkspaceContexts,
      setStagedWorkspaceContexts,
      workspaceLinkedDirAdds,
    };
    const handleEditorChange = useCallback((text: string, present: InlineMentionEntity[]) => {
      handleEditorChangeImpl(text, present, editorChangeDeps);
    }, [editorChangeDeps]);

    // `useMentionPopover` needs `pickSlash`/`appendContextAttachment` (bound
    // via `pickSlashDeps`/`uploadActionDeps`, both above this point) plus the
    // editor/plugin-ref primitives, so it's called here rather than earlier
    // alongside the other catalogue-derived hooks.
    const {
      mention,
      setMention,
      mentionIndex,
      mentionTab,
      setMentionTab,
      caretRect,
      setCaretRect,
      composerMentionEntities,
      filteredFiles,
      filteredWorkspaceContexts,
      filteredPlugins,
      filteredMcpServers,
      filteredConnectors,
      filteredSkills,
      handleEditorTrigger,
      handlePopoverKey,
      insertMention,
      insertPluginMention,
      insertMcpMention,
      insertConnectorMention,
      insertWorkspaceMention,
      insertSkillMention,
      handleMentionTabChange,
    } = useMention({
      projectFiles,
      workspaceContexts,
      pluginsForComposer,
      enabledMcpServers,
      connectors,
      skills,
      stagedSkills,
      staged,
      selectedWorkspaceContexts,
      slash,
      setSlash,
      slashIndex,
      setSlashIndex,
      filteredSlash,
      pickSlash: (cmd) => pickSlashAction(cmd, pickSlashDeps),
      insertEditorMention: (insert) => editorRef.current?.insertMention(insert),
      appendContextAttachment: (path) => appendContextAttachmentImpl(path, uploadActionDeps),
      setStagedSkills,
      setStagedMcpServers,
      setStagedConnectors,
      setStagedWorkspaceContexts,
      setInlineBackedPlugin,
      applyPluginById: async (id, record) => {
        await pluginsSectionRef.current?.applyById(id, record);
      },
      projectId,
      patchProject,
      onProjectSkillChange,
    });

    // Latch `composerEngaged` true on the first real interaction so the
    // catalogue hook's deferred fetches run exactly once, when they are
    // actually needed. `draft`/`mention`/`slash` are other clusters' state,
    // so this effect stays in the orchestrator; it only forwards to the
    // hook's own setter.
    useEffect(() => {
      if (composerEngaged) return;
      if (draft.trim().length > 0 || mention || slash) {
        markComposerEngaged();
      }
    }, [composerEngaged, draft, mention, slash, markComposerEngaged]);

    // Deps bag for the staged workspace-context linking cluster's extracted
    // functions (see features/chat-composer/actions.ts): project/link
    // transport, the staged/dismissed/promoted state from
    // useWorkspaceContextLinking, the mention-insertion + popover-clearing
    // editor primitives, and analytics. Covers appendWorkspacePrompt,
    // addLinkedDirs/addLinkedDir, handleReferenceProjects,
    // handleLinkLocalCodeContext, and removeWorkspaceContext — called
    // directly from their JSX call sites below rather than through a thin
    // per-function orchestrator wrapper.
    const workspaceContextActionDeps: ReferenceProjectsDeps & LinkLocalCodeContextDeps & RemoveWorkspaceContextDeps = {
      projectId,
      projectMetadata,
      workspaceLinkedDirAdds,
      setWorkspaceLinkedDirAdds,
      patchProject,
      onShowToast,
      onProjectMetadataChange,
      rememberRecentDir: workingDirStatus.rememberRecentDir,
      t,
      track: analytics.track,
      setProjectReferenceOpen: modals.setProjectReferenceOpen,
      openFolderDialog,
      setStagedWorkspaceContexts,
      insertInlineMentionSeparator,
      insertMention: (insert) => editorRef.current?.insertMention(insert),
      setMention,
      setSlash,
      markComposerEngaged,
      selectedWorkspaceContexts,
      workingDir,
      visibleWorkspaceContext,
      setDismissedWorkspaceContextId,
      draftRef,
      replaceEditorDraft,
      trackComposerBar,
    };

    const liveCommentAttachments = currentCommentAttachments();
    const { placeholderCarouselActive, placeholderSubmittable, hasComposerPayload, showStopButton, showSendButton } =
      composerSendGate({
        streaming,
        sendDisabled,
        activeFileContext,
        placeholderScenarios,
        draft,
        staged,
        commentAttachmentCount: liveCommentAttachments.length,
        mention,
        slash,
        placeholderScenario,
      });

    // Deps bag for `reset`/`sendComposedTurn`/`submit`/`currentRunContextMeta`
    // (see features/chat-composer/actions.ts): every staging setter a reset
    // clears, the Next-step pending refs, the Lexical editor/plugins-section
    // primitives, `onSend` itself, and everything a submit needs to resolve
    // pet/mcp slash interception, hatch/search expansion, and the
    // placeholder-carousel fallback prompt. Built here (once
    // `placeholderSubmittable` is available). The ANNOTATION_EVENT and
    // deferred-send-flush effects above reference `annotationActionDeps`/
    // `deferredAnnotationSendDeps` (both nest this object, built further
    // below) rather than a named wrapper — their closures only run after
    // this render completes, by which point those are assigned.
    const sendActionDeps: SendActionDeps = {
      pendingEntryFromRef,
      pendingSessionModeRef,
      nextAttachmentOrderRef,
      stagedWorkspaceContexts,
      workspaceLinkedDirAdds,
      setWorkspaceLinkedDirAdds,
      setStagedWorkspaceContexts,
      promotedWorkspaceContextDir,
      setPromotedWorkspaceContextDir,
      setDraft,
      setStaged,
      setStagedVisualComments,
      setStagedSkills,
      setStagedMcpServers,
      setStagedConnectors,
      clearPluginsSection,
      setInlineBackedPlugin,
      inlineBackedPluginRef,
      setActiveAppliedPlugin,
      activeAppliedPlugin,
      setUploadError: upload.setUploadError,
      setMention,
      setMentionTab,
      setSlash,
      clearEditor: () => editorRef.current?.clear(),
      setStreamingAnnotationSendPending,
      activeFileContext,
      activeFileDisplayName,
      onSend,
      draft,
      sendDisabled,
      petEnabled,
      petConfig,
      onTogglePet,
      onOpenPetSettings,
      onAdoptPet,
      onOpenMcpSettings,
      clearDraft,
      streaming,
      staged,
      currentCommentAttachments,
      researchAvailable,
      placeholderSubmittable,
      placeholderScenario,
      stagedSkills,
      stagedMcpServers,
      stagedConnectors,
      selectedWorkspaceContexts,
    };

    // Deps bag for the Mark draw-overlay's ANNOTATION_EVENT handler (see
    // features/chat-composer/attachment-actions.ts): nests the already-built
    // upload + send deps bags (every field either is already reachable
    // through one of them) rather than re-flattening 30+ fields.
    const annotationActionDeps: AnnotationActionDeps = {
      t,
      uploadActionDeps,
      sendActionDeps,
      draftRef,
      setDraft,
      setEditorText: (text) => editorRef.current?.setText(text),
      focusEditor: () => editorRef.current?.focus(),
      draft,
      staged,
      currentCommentAttachments,
      streaming,
      streamingAnnotationSendEntryFromRef,
      setStreamingAnnotationSendPending,
    };

    const deferredAnnotationSendDeps: DeferredAnnotationSendDeps = {
      streamingAnnotationSendPending,
      streamingAnnotationSendPendingRef,
      streaming,
      sendDisabled,
      draftRef,
      streamingAnnotationSendEntryFromRef,
      staged,
      currentCommentAttachments,
      sendActionDeps,
    };

    const submit = useCallback(() => submitImpl(sendActionDeps), [sendActionDeps]);

    const openDesignSystemPicker = useCallback(() => {
      openDesignSystemPickerTrigger(composerRootRef.current);
    }, []);

    return (
      <div
        className={[
          'composer',
          upload.dragActive ? 'drag-active' : '',
          activeFileContext ? 'composer-active-file-mode' : '',
        ].filter(Boolean).join(' ')}
        data-testid="chat-composer"
        ref={composerRootRef}
        onDragOver={(e) => {
          e.preventDefault();
          upload.setDragActive(true);
        }}
        onDragLeave={() => upload.setDragActive(false)}
        onDrop={(e) => handleDropImpl(e, uploadActionDeps)}
      >
        <div className="composer-shell">
          {/*
            Spec §8.4 — context bar above the composer input. The
            section now behaves as a pure context bar: it renders the
            active plugin's chips + inputs form when one is applied,
            but never the always-on rail. Plugins are picked from the
            tools-menu Plugins tab or the @-mention popover so the
            composer chrome stays out of the way until the user wants
            to attach context.
          */}
          {projectId ? (
            <PluginsSection
              ref={pluginsSectionRef}
              projectId={projectId}
              showRail={false}
              renderActiveChip={false}
              onApplied={handlePluginApplied}
              onCleared={handlePluginCleared}
              onChipDetails={(item: ContextItem) => {
                if (item.kind === 'plugin') {
                  const record = installedPlugins.find((p) => p.id === item.id);
                  if (record) modals.setDetailsRecord(record);
                  return;
                }
                if (item.kind === 'skill') {
                  modals.setDetailsSkill({
                    id: item.id,
                    summary: skills.find((skill) => skill.id === item.id) ?? null,
                  });
                }
              }}
            />
          ) : null}
          {designSystemPicker || selectedWorkspaceContexts.length > 0 || stagedSkills.length > 0 || stagedMcpServers.length > 0 || stagedConnectors.length > 0 || staged.length > 0 || activeAppliedPlugin ? (
            <StagedRunContexts
              designSystemPicker={designSystemPicker}
              workspaceItems={selectedWorkspaceContexts}
              currentWorkspaceContextId={visibleWorkspaceContext?.id ?? null}
              skills={stagedSkills}
              mcpServers={stagedMcpServers}
              connectors={stagedConnectors}
              attachments={staged}
              pluginChip={
                activeAppliedPlugin
                  ? {
                      id: activeAppliedPlugin.pluginId,
                      title: activeAppliedPlugin.pluginTitle ?? activeAppliedPlugin.pluginId,
                    }
                  : null
              }
              projectId={projectId}
              preview={stagedPreview}
              previewUrl={stagedPreviewUrl}
              modalHost={modalHost}
              onPreviewAttachment={setStagedPreview}
              onClosePreview={() => setStagedPreview(null)}
              resolveImageUrl={resolveStagedImageUrl}
              onRemoveWorkspace={(id) => void removeWorkspaceContextImpl(id, workspaceContextActionDeps)}
              onRemoveSkill={removeStagedSkill}
              onRemoveMcp={removeStagedMcpServer}
              onRemoveConnector={removeStagedConnector}
              onRemoveAttachment={(p) => removeStagedImpl(p, uploadActionDeps)}
              onRemovePlugin={removeAppliedPlugin}
              onPluginDetails={(id) => {
                const record = installedPlugins.find((plugin) => plugin.id === id);
                if (record) modals.setDetailsRecord(record);
              }}
              onSkillDetails={(id) => {
                modals.setDetailsSkill({
                  id,
                  summary: stagedSkills.find((skill) => skill.id === id)
                    ?? skills.find((skill) => skill.id === id)
                    ?? null,
                });
              }}
              t={t}
            />
          ) : null}
          {activeFileContext ? (
            <div
              className="composer-active-file"
              data-testid="composer-active-file"
              title={activeFileContext}
            >
              <span className="composer-active-file__label">{t('chat.activeFileEditingLabel')}</span>
              <span className="composer-active-file__name">{activeFileContext}</span>
            </div>
          ) : null}
          {currentCommentAttachments().length > 0 ? (
            <StagedCommentAttachments
              attachments={currentCommentAttachments()}
              onRemove={removeCommentAttachment}
              t={t}
            />
          ) : null}
          {/* The inline BYOK media-model pickers (image / video / speech +
              voice) were removed pending a unified model-selection surface.
              The selected models still flow into the run from the project's
              creation-time pick (see ProjectView byok*ModelOverride → submit);
              this only drops the per-composer override UI. The byok* props and
              handlers are intentionally retained as the plumbing the unified
              picker will reuse. */}
          <div
            className="composer-input-wrap"
            onFocus={() => markComposerEngaged()}
          >
            <LexicalComposerInput
              ref={editorRef}
              draft={draft}
              placeholder={
                activeFileDisplayName
                  ? t('chat.activeFilePlaceholder', { file: activeFileDisplayName })
                  : placeholderCarouselActive
                    ? ''
                    : composerPlaceholder ?? t('chat.composerPlaceholder')
              }
              title={activeFileDisplayName ?? composerPlaceholder ?? t('chat.composerPlaceholder')}
              knownEntities={composerMentionEntities}
              onChange={handleEditorChange}
              onTrigger={handleEditorTrigger}
              onEnterSend={() => void submit()}
              onPasteFiles={(files) => handlePasteFilesImpl(files, uploadActionDeps)}
              popoverOpen={Boolean(mention) || Boolean(slash && filteredSlash.length > 0)}
              onPopoverKey={handlePopoverKey}
              comboboxAria={{
                expanded: Boolean(mention),
                activeId: mention ? `mention-opt-${mentionIndex}` : null,
              }}
            />
            {placeholderScenarios.length > 0 ? (
              <PlaceholderCarousel
                scenarios={placeholderScenarios}
                active={placeholderCarouselActive}
                onScenarioChange={setPlaceholderScenario}
              />
            ) : null}
          </div>
          <CaretFloatingLayer
            caret={caretRect}
            open={Boolean(mention)}
            boundaryRef={composerRootRef}
          >
            <MentionPopover
              files={filteredFiles}
              workspaceContexts={filteredWorkspaceContexts}
              plugins={filteredPlugins}
              skills={filteredSkills}
              mcpServers={filteredMcpServers}
              connectors={filteredConnectors}
              query={mention?.q ?? ''}
              tab={mentionTab}
              onTabChange={handleMentionTabChange}
              activeIndex={mentionIndex}
              currentSkillId={currentSkillId}
              onPickFile={insertMention}
              onPickWorkspaceContext={insertWorkspaceMention}
              onPickPlugin={(record) => void insertPluginMention(record)}
              onPickSkill={(skill) => void insertSkillMention(skill)}
              onPickMcp={insertMcpMention}
              onPickConnector={insertConnectorMention}
            />
          </CaretFloatingLayer>
          <CaretFloatingLayer
            caret={caretRect}
            open={Boolean(slash && filteredSlash.length > 0)}
            boundaryRef={composerRootRef}
          >
            <SlashPopover
              commands={filteredSlash}
              activeIndex={Math.min(slashIndex, filteredSlash.length - 1)}
              onPick={(cmd) => pickSlashAction(cmd, pickSlashDeps)}
              onHover={(i) => setSlashIndex(i)}
              t={t}
            />
          </CaretFloatingLayer>
          <div className="composer-row">
            <input
              ref={fileInputRef}
              data-testid="chat-file-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                void uploadFilesImpl(files, uploadActionDeps);
                e.target.value = '';
              }}
            />
            <ComposerPlusMenu
              triggerTestId="chat-plus-trigger"
              placementPreference="up"
              onOpen={() => {
                trackComposerBar({ element: 'plus_menu_open' });
                markComposerEngaged();
              }}
              onSubmenuOpen={(submenu) => {
                // The toolbox flyout tracks its own open (design_toolbox_open).
                if (submenu === 'toolbox') return;
                trackComposerBar({
                  element: 'plus_submenu_open',
                  resource_kind: PLUS_SUBMENU_RESOURCE_KIND[submenu],
                });
              }}
              onSearchUsed={(submenu) => {
                trackComposerBar({
                  element: 'plus_search',
                  resource_kind: PLUS_SUBMENU_RESOURCE_KIND[submenu],
                });
              }}
              connectors={connectors}
              onPickConnector={(connector) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'connector',
                  resource_id: connector.id,
                });
                insertConnectorMention(connector);
              }}
              onAddConnector={() => {
                trackComposerBar({ element: 'plus_add', resource_kind: 'connector' });
                onOpenConnectors?.();
              }}
              plugins={pluginsForComposer}
              onPickPlugin={(record) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'plugin',
                  resource_id: record.id,
                });
                void insertPluginMention(record);
              }}
              onAddPlugin={() => {
                trackComposerBar({ element: 'plus_add', resource_kind: 'plugin' });
                onBrowsePlugins?.();
              }}
              skills={skills}
              onPickSkill={(skill) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'skill',
                  resource_id: skill.id,
                });
                void insertSkillMention(skill);
              }}
              mcpServers={enabledMcpServers}
              onPickMcp={(server) => {
                trackComposerBar({
                  element: 'plus_pick',
                  resource_kind: 'mcp',
                  resource_id: server.id,
                });
                insertMcpMention(server);
              }}
              onAddMcp={() => {
                trackComposerBar({ element: 'plus_add', resource_kind: 'mcp' });
                onOpenMcpSettings?.();
              }}
              onAttachFiles={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
              onReferenceProject={() => {
                trackComposerBar({ element: 'plus_pick', resource_kind: 'workspace', resource_id: 'reference-project' });
                trackProjectReferenceModalSurfaceView(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'project_reference_modal',
                  ...(projectId ? { project_id: projectId } : {}),
                });
                modals.setProjectReferenceOpen(true);
              }}
              onLinkLocalCode={() => {
                trackComposerBar({ element: 'plus_pick', resource_kind: 'workspace', resource_id: 'local-code' });
                void handleLinkLocalCodeContextImpl(workspaceContextActionDeps);
              }}
              attachLoading={upload.uploading}
              onSelectFromLibrary={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'library',
                });
                modals.setLibraryPickerOpen(true);
              }}
              onImportFigma={projectId ? () => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'figma_import',
                });
                modals.setFigmaModalOpen(true);
              } : undefined}
              onShowFigmaHelp={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'figma_help',
                });
                trackFigmaHelpModalSurfaceView(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'figma_help_modal',
                  ...(projectId ? { project_id: projectId } : {}),
                });
                modals.setFigmaHelpOpen(true);
              }}
              onOpenDesignSystems={projectId && designSystemPicker ? () => {
                trackComposerBar({ element: 'design_system_open' });
                openDesignSystemPicker();
              } : undefined}
              toolboxLabel={t('chat.designToolbox.title')}
              renderToolbox={(close) => (
                <DesignToolboxPanel
                  actions={DESIGN_TOOLBOX_ACTIONS}
                  skills={skills}
                  plugins={pluginsForComposer}
                  mcpServers={enabledMcpServers}
                  mcpTemplates={mcpTemplates}
                  connectors={connectors}
                  projectFiles={projectFiles}
                  activeSkillIds={stagedSkills.map((skill) => skill.id)}
                  activePluginId={activeAppliedPlugin?.pluginId ?? pinnedPluginId ?? null}
                  activeMcpServerIds={stagedMcpServers.map((server) => server.id)}
                  activeConnectorIds={stagedConnectors.map((connector) => connector.id)}
                  activeFilePaths={staged.map((item) => item.path)}
                  modalHost={modalHost}
                  onOpened={() => trackDesignToolbox({ element: 'design_toolbox_open' })}
                  onPickAction={(action) => {
                    trackDesignToolbox({
                      element: 'design_toolbox_action',
                      toolbox_action_id: action.id,
                    });
                    applyDesignToolboxAction(action);
                    close();
                  }}
                  onPickSkill={(skill) => {
                    trackDesignToolbox({
                      element: 'design_toolbox_resource',
                      resource_kind: 'skill',
                      resource_id: skill.id,
                    });
                    applyDesignToolboxSkill(skill);
                    close();
                  }}
                  onPickResource={(resource) => {
                    trackDesignToolbox({
                      element: 'design_toolbox_resource',
                      ...designToolboxResourceTracking(resource),
                    });
                    applyDesignToolboxResource(resource);
                    close();
                  }}
                />
              )}
            />
            {designToolboxOpen ? (
              <div className="composer-toolbox-standalone">
                {/* Click-catcher backdrop. A <div> (not a <button>) so it never
                    inherits the app's global button:hover fill, which otherwise
                    painted the whole screen when the cursor crossed it. */}
                <div
                  className="composer-toolbox-standalone-backdrop"
                  aria-hidden="true"
                  onClick={() => setDesignToolboxOpen(false)}
                />
                <div
                  className="plus-menu__popup composer-toolbox-standalone-popup"
                  role="menu"
                >
                  <DesignToolboxPanel
                    actions={DESIGN_TOOLBOX_ACTIONS}
                    skills={skills}
                    plugins={pluginsForComposer}
                    mcpServers={enabledMcpServers}
                    mcpTemplates={mcpTemplates}
                    connectors={connectors}
                    projectFiles={projectFiles}
                    activeSkillIds={stagedSkills.map((skill) => skill.id)}
                    activePluginId={activeAppliedPlugin?.pluginId ?? pinnedPluginId ?? null}
                    activeMcpServerIds={stagedMcpServers.map((server) => server.id)}
                    activeConnectorIds={stagedConnectors.map((connector) => connector.id)}
                    activeFilePaths={staged.map((item) => item.path)}
                    modalHost={modalHost}
                    onOpened={() => trackDesignToolbox({ element: 'design_toolbox_open' })}
                    onPickAction={(action) => {
                      trackDesignToolbox({
                        element: 'design_toolbox_action',
                        toolbox_action_id: action.id,
                      });
                      applyDesignToolboxAction(action);
                      setDesignToolboxOpen(false);
                    }}
                    onPickSkill={(skill) => {
                      trackDesignToolbox({
                        element: 'design_toolbox_resource',
                        resource_kind: 'skill',
                        resource_id: skill.id,
                      });
                      applyDesignToolboxSkill(skill);
                      setDesignToolboxOpen(false);
                    }}
                    onPickResource={(resource) => {
                      trackDesignToolbox({
                        element: 'design_toolbox_resource',
                        ...designToolboxResourceTracking(resource),
                      });
                      applyDesignToolboxResource(resource);
                      setDesignToolboxOpen(false);
                    }}
                  />
                </div>
              </div>
            ) : null}
            {leadingAccessory}
            <span className="composer-spacer" />
            {footerAccessory}
            <SessionModeToggle
              mode={sessionMode}
              onChange={(next) => {
                if (next !== sessionMode) {
                  trackComposerSessionModeClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'chat_composer',
                    element: 'session_mode_toggle',
                    mode_before: sessionModeToTracking(sessionMode),
                    mode_after: sessionModeToTracking(next),
                    project_id: projectId ?? undefined,
                  });
                }
                onSessionModeChange?.(next);
              }}
            />
            {showStopButton ? (
              <button
                type="button"
                className="composer-send stop od-tooltip"
                onClick={onStop}
                title={t('chat.stop')}
                data-tooltip={t('chat.stop')}
                aria-label={t('chat.stop')}
              >
                <Icon name="stop" size={16} />
                <span>{t('chat.stop')}</span>
              </button>
            ) : null}
            {showSendButton ? (
              <button
                type="button"
                className="composer-send od-tooltip"
                data-testid="chat-send"
                onClick={() => {
                  trackChatPanelClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'chat_panel',
                    element: 'send',
                  });
                  void submit();
                }}
                disabled={sendDisabled || !hasComposerPayload}
                aria-label={t('chat.send')}
                title={t('chat.send')}
                data-tooltip={t('chat.send')}
              >
                <Icon name="send" size={16} />
                <span>{t('chat.send')}</span>
              </button>
            ) : null}
          </div>
        </div>
        {projectId ? (
          <div className="composer-workdir-row">
            <WorkingDirPicker
              placement="up"
              workingDir={workingDir}
              invalid={workingDirStatus.workingDirMissing}
              recentDirs={workingDirStatus.recentDirs}
              onOpen={() => void checkWorkingDir(workingDir)}
              onPickDirectory={() => {
                // Fire on the click itself (intent), matching the home
                // composer's working_dir* elements so one dashboard counts the
                // action across both surfaces.
                trackComposerBar({ element: 'working_dir' });
                void handlePickWorkingDirImpl(workingDirActionDeps);
              }}
              onSelectRecent={(dir) => {
                trackComposerBar({ element: 'working_dir_recent' });
                void setWorkingDirFolderImpl(dir, workingDirActionDeps);
              }}
              onClear={() => {
                trackComposerBar({ element: 'working_dir_clear' });
                void clearWorkingDirImpl(workingDirActionDeps);
              }}
            />
          </div>
        ) : null}
        {upload.uploadError ? <span className="composer-hint">{upload.uploadError}</span> : null}
        {modals.detailsRecord ? (
          <PluginDetailsModal
            record={modals.detailsRecord}
            onClose={() => modals.setDetailsRecord(null)}
            onUse={async (record) => {
              setInlineBackedPlugin(null);
              await pluginsSectionRef.current?.applyById(record.id, record);
              modals.setDetailsRecord(null);
            }}
            onDuplicate={(record) => {
              void duplicatePluginRecordAsProjectImpl(record, {
                locale,
                t,
                duplicatePluginAsProject,
                navigate,
                setDetailsRecord: modals.setDetailsRecord,
                onShowToast,
              });
            }}
            hideUseAction
          />
        ) : null}
        {modals.detailsSkill ? (
          <SkillDetailsModal
            skillId={modals.detailsSkill.id}
            summary={modals.detailsSkill.summary}
            onClose={() => modals.setDetailsSkill(null)}
          />
        ) : null}
        {modals.libraryPickerOpen ? (
          <LibraryPicker
            onClose={() => modals.setLibraryPickerOpen(false)}
            onConfirm={(assets) => addAssetsFromLibraryImpl(assets, uploadActionDeps)}
          />
        ) : null}
        {modals.figmaModalOpen && projectId ? (
          <FigmaImportModal
            onClose={() => modals.setFigmaModalOpen(false)}
            resolveProjectId={async () => projectId}
            onImported={(result) => {
              // Prefill the composer with the reshape prompt; the user reviews
              // and sends to build the page from the decoded snapshot.
              setDraft(result.suggestedPrompt);
              editorRef.current?.setText(result.suggestedPrompt);
              editorRef.current?.focus();
            }}
            onFigmaUrl={(url, notes) => {
              const prompt = `Migrate the Figma file at ${url} into a responsive webpage using its design system.${notes ? ` ${notes}` : ''}`;
              setDraft(prompt);
              editorRef.current?.setText(prompt);
              editorRef.current?.focus();
              modals.setFigmaModalOpen(false);
            }}
          />
        ) : null}
        {modals.figmaHelpOpen ? (
          <FigmaHelpModal onClose={() => modals.setFigmaHelpOpen(false)} />
        ) : null}
        {modals.projectReferenceOpen ? (
          <ProjectReferenceModal
            currentProjectId={projectId}
            onClose={() => {
              // Only the dismiss paths (X / backdrop / Escape / Cancel) land
              // here — a confirmed pick closes via handleReferenceProjects,
              // which reports 'success' / 'failed'.
              trackContextLinkResult(analytics.track, {
                page_name: 'chat_panel',
                area: 'chat_composer',
                context_kind: 'project',
                result: 'cancelled',
                ...(projectId ? { project_id: projectId } : {}),
              });
              modals.setProjectReferenceOpen(false);
            }}
            onSelect={(items) => void handleReferenceProjectsImpl(items, workspaceContextActionDeps)}
          />
        ) : null}
      </div>
    );
  }
);
