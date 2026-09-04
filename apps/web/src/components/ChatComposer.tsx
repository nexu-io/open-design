'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { ThinkingOrb } from './composer/ThinkingOrb';
import { useI18n } from '../i18n';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';
import type { Dict, Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { useAnalytics } from '../analytics/provider';
import {
  trackChatPanelClick,
  trackComposerBarClick,
  trackContextLinkResult,
  trackDesignToolboxClick,
  trackFigmaHelpModalSurfaceView,
  trackFileUploadResult,
  trackProjectReferenceModalSurfaceView,
} from '../analytics/events';
import type {
  ComposerBarClickProps,
  DesignToolboxClickProps,
} from '@open-design/contracts/analytics';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { notifyCompletionFeedbackGesture } from '../utils/notifications';
import { projectRawUrl, uploadProjectFiles, openFolderDialog, fetchRecentLinkedDirs, pushRecentLinkedDir, dirExists, applyLibraryAsset, fetchLibraryAssetElementHtml } from "../providers/registry";
import {
  duplicatePluginAsProject,
  patchProject,
} from "../state/projects";
import { navigate } from '../router';
import { fetchMcpServers } from "../state/mcp";
import type { McpServerConfig, McpTemplate } from "../state/mcp";
import { listPlugins } from "../state/projects";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, Project, ProjectFile, ProjectMetadata, SkillSummary } from "../types";
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import type {
  ContextItem,
  AppliedPluginSnapshot,
  ChatAnalyticsEntryFrom,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  PluginSourceKind,
  ResearchOptions,
  RunContextSelection,
  WorkspaceCollabContext,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { buildVisualAnnotationAttachment, commentTargetDisplayName } from '../comments';
import { Icon, type IconName } from "./Icon";
import { ChatCloseIcon, ChatFileIcon, ChatSendArrowIcon } from "./chat/primitives/icons";
import { ComposerPlusMenu, PLUS_SUBMENU_RESOURCE_KIND, type PlusMenuSubmenu } from './ComposerPlusMenu';
import { LibraryPicker } from './LibraryPicker';
import { FigmaImportModal } from './FigmaImportModal';
import { FigmaHelpModal } from './FigmaHelpModal';
import {
  ProjectReferenceModal,
  type ProjectReferenceSelection,
} from './ProjectReferenceModal';
import { assetTitle, elementMetaOf } from './LibraryAssetMeta';
import type { LibraryAsset, LibraryElementMeta } from '@open-design/contracts';
import {
  DESIGN_TOOLBOX_ACTIONS,
  designToolboxActionBadge,
  designToolboxActionDescription,
  designToolboxActionMatchesQuery,
  designToolboxActionTitle,
  findDesignToolboxSkill,
  getDesignToolboxAction,
  skillMatchesQuery,
  type DesignToolboxAction,
  type DesignToolboxActionId,
} from '../runtime/design-toolbox';
import { ComposerPluginPreview } from './ComposerPluginPreview';
import { computeToolboxDetailPosition } from './composer-detail-position';
import { PluginDetailsModal } from "./PluginDetailsModal";
import { SkillDetailsModal } from './SkillDetailsModal';
import { PluginsSection, type PluginsSectionHandle } from "./PluginsSection";
import { BUILT_IN_PETS, CUSTOM_PET_ID } from "./pet/pets";
import {
  inlineMentionToken,
  mentionTokenPresent,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { workspaceContextLinkedDir, workspaceContextLinkedDirs } from './workspace-context';
import { useProjectCollabContext } from '../collab/collab-context';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from "./PreviewDrawOverlay";
import {
  formatAttachmentSize,
  middleTruncateFileName,
  splitFileName,
} from '../runtime/chat/attachment';
import {
  attachmentNavDelta,
  attachmentNavState,
  type AttachmentNavState,
} from '../runtime/chat/attachment-nav';
import {
  buildStagedAttachmentCards,
  looksLikeImageName,
  runWithConcurrency,
  STAGED_UPLOAD_CONCURRENCY,
  type PendingUpload,
  type StagedAttachmentCard,
} from '../runtime/chat/staged-attachment';

/**
 * Window event for staging attachments that are ALREADY uploaded to the
 * project (ChatAttachment shape, not File). Mirrors ANNOTATION_EVENT's
 * pattern; used by surfaces that materialize files themselves — e.g. the
 * design browser's hover "添加到对话" capture, which writes the PNG via
 * writeProjectBase64File before notifying the composer.
 */
export const STAGE_ATTACHMENT_EVENT = 'opendesign:stage-attachment';
export interface StageAttachmentEventDetail {
  attachments: ChatAttachment[];
}
import { DesignSystemSwitchPicker } from "./DesignSystemSwitchPicker";
import { listenForConnectorsChanged } from './connectors-events';
import { fetchConnectorCatalogSnapshot } from './connectors-state';
import { PlaceholderCarousel } from './home-hero/PlaceholderCarousel';
import type { PlaceholderScenario } from './home-hero/placeholderScenarios';
import { quotePromptPrefix, splitQuotedPrompt, type ChatQuote } from '../runtime/chat/quote-selection';
import {
  loadComposerDraftExtras,
  sanitizeQuotes,
  saveComposerDraftExtras,
  type ComposerDraftContext,
} from '../runtime/chat/composer-draft';
import { QuotedRefs } from './chat/QuotedRefs';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface TrackedWorkspaceLinkedDir {
  dir: string;
  previousLinkedDirs: string[];
}

/**
 * 一批 id 落到当前已加载的列表上:能对上的变成对象,对不上的原样退回来。
 *
 * 两条恢复路径共用它 —— 队列里点「编辑」和刷新之后重建,拿的是同一套判据,
 * 不会出现「队列那边认得这个技能、刷新这边不认」这种分叉。
 *
 * 「对不上」有两种截然不同的原因,这个函数**不区分**,由调用方决定怎么办:
 *   · 真的没了(技能卸了 / MCP 删了)—— 该丢
 *   · 列表还没拉回来(输入框的插件 / MCP / 连接器是**懒加载**的,首屏就是空的)
 *     —— 这时候丢等于把用户挂上去的绑定无声吞掉,所以刷新那条路径要留着重试
 */
function resolveStagedById<T extends { id: string }>(
  ids: string[] | undefined,
  pool: T[],
): { resolved: T[]; unresolved: string[] } {
  const resolved: T[] = [];
  const unresolved: string[] = [];
  for (const id of ids ?? []) {
    const hit = pool.find((item) => item.id === id);
    if (hit) resolved.push(hit);
    else unresolved.push(id);
  }
  return { resolved, unresolved };
}

/** 按 id 合并进已挂的一批,已经在里面的不重复添加(用户手动挂的优先保留)。 */
function mergeStagedById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((item) => item.id));
  const additions = incoming.filter((item) => !seen.has(item.id));
  return additions.length > 0 ? [...current, ...additions] : current;
}

function dedupeWorkspaceContextItems(items: WorkspaceContextItem[]): WorkspaceContextItem[] {
  const out: WorkspaceContextItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function trackedWorkspaceLinkedDirsForContexts(
  items: WorkspaceContextItem[],
  linkedDirs: string[],
): Record<string, TrackedWorkspaceLinkedDir> {
  const out: Record<string, TrackedWorkspaceLinkedDir> = {};
  for (const item of items) {
    const dir = workspaceContextLinkedDir(item) ?? '';
    if (!dir || !linkedDirs.includes(dir)) continue;
    out[item.id] = {
      dir,
      previousLinkedDirs: linkedDirs.filter((linkedDir) => linkedDir !== dir),
    };
  }
  return out;
}

type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import';

type MentionTab = 'all' | 'tabs' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

const USER_PLUGIN_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

interface SlashCommand {
  id: string;
  // Visible label, e.g. `/hatch`. Shown in the popover row.
  label: string;
  // Text inserted into the draft when the user picks the entry. The
  // cursor is positioned at the end of `insert`, so a trailing space
  // is the difference between a "ready for argument" command and a
  // "submit immediately" one.
  insert: string;
  // i18n key of the short description shown next to the label.
  descKey: keyof Dict;
  // Optional argument hint shown after the description.
  argHint?: string;
  // Icon glyph from the project Icon set.
  icon: 'sparkles' | 'eye' | 'sliders';
}

type DesignToolboxResourceKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'mcp-template'
  | 'connector'
  | 'file';

interface DesignToolboxResourceIndex {
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
}

type DesignToolboxResourceBase = {
  key: string;
  kind: DesignToolboxResourceKind;
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: IconName;
  searchText: string;
};

type DesignToolboxResource =
  | (DesignToolboxResourceBase & { kind: 'skill'; skill: SkillSummary })
  | (DesignToolboxResourceBase & { kind: 'plugin'; plugin: InstalledPluginRecord })
  | (DesignToolboxResourceBase & { kind: 'mcp'; server: McpServerConfig })
  | (DesignToolboxResourceBase & { kind: 'mcp-template'; template: McpTemplate })
  | (DesignToolboxResourceBase & { kind: 'connector'; connector: ConnectorDetail })
  | (DesignToolboxResourceBase & { kind: 'file'; file: ProjectFile });

export type ChatSendOutcome = void | 'restore-draft';

interface Props {
  /**
   * 正文取词(设计稿组件 23)攒下的引用。输入框上方那枚「N 条注释」芯片就是它,
   * 发送时作为引文前缀带给 agent。
   */
  quotes?: ChatQuote[];
  onClearQuotes?: () => void;
  /**
   * 刷新之后把落盘的引用还给宿主。引用的 state 在宿主(ChatPane)那儿,但**生命周期
   * 一直由输入框驱动**:发送时就是输入框调 `onClearQuotes` 清掉的。恢复走同一个方向,
   * 才不会出现「谁负责把它捞回来」这种两边都以为对方管的空档。
   */
  onRestoreQuotes?: (quotes: ChatQuote[]) => void;
  projectId: string | null;
  projectFiles: ProjectFile[];
  activeProjectFileName?: string | null;
  streaming: boolean;
  sessionMode?: ChatSessionMode;
  sendDisabled?: boolean;
  // Read-only viewer of a team-shared project: makes the Lexical editor
  // non-editable (in addition to `sendDisabled` blocking the send action) so
  // the user cannot type into the composer at all.
  inputDisabled?: boolean;
  initialDraft?: string;
  /**
   * 别人家的「在传中」卡片,借这个托盘画一下。
   *
   * 目前只有一个来源:首页挑好文件按下发送,项目页已经开出来了、文件还在传的
   * 那几秒(`state/home-attachment-handoff.ts`)。这些卡的**字节、object URL、
   * 生命周期都不归 composer 管** —— composer 只是把它们和自己的那几张排在同一
   * 排里,顺序仍按 `order`。它们不进 `staged`,所以也不影响「这一发有没有东西
   * 可发」的判断。
   */
  externalPendingUploads?: readonly PendingUpload[];
  /** 人把上面那种卡「×」掉了。谁给的卡谁负责撤。 */
  onRemoveExternalPendingUpload?: (pendingId: string) => void;
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
  ) => ChatSendOutcome | Promise<ChatSendOutcome>;
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
  /** Reports which standalone quick-pill popover is open (null when none), so
   *  the host that renders the pills can carry `aria-expanded` on them. The
   *  popovers live here but their triggers do not. */
  onStandalonePanelChange?: (panel: ComposerStandalonePanel) => void;
  // Optional pet wiring. The composer no longer renders a visible pet
  // entry, but existing manual `/pet` commands still route here.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  researchAvailable?: boolean;
  projectMetadata?: ProjectMetadata;
  // Fired after the daemon accepts a metadata PATCH, with the authoritative
  // post-patch project (fresh `updatedAt` included). Callers must replace
  // their whole project copy with it: forwarding only the metadata onto a
  // stale copy lets an older detail snapshot win recency comparisons and
  // shadow the change (e.g. the working-dir label never updating).
  onProjectMetadataChange?: (updated: Project) => void;
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

/** Which of the two standalone quick-pill popovers is open, if either. */
export type ComposerStandalonePanel = 'plugins' | 'toolbox' | null;

export interface ChatComposerHandle {
  setDraft: (text: string, options?: ChatComposerDraftOptions) => void;
  restoreDraft: (draft: {
    /**
     * 队列里存的正文 —— 里面**可能已经折着**一段 `> 原文` 的引文前缀。
     * 传 `quotes` 进来,restoreDraft 会把那段拆掉;不传就原样进输入框。
     */
    text: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
    /**
     * 这一条排队时带着的引用。给了它,芯片才会变回芯片(并从正文里拆掉)——
     * 正文里那份是散文,拆不出结构。省略等同于「这一条没有引用」,
     * 于是宿主当前的芯片会被清空,而不是漏给下一发。
     */
    quotes?: ChatQuote[];
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
  /** Open the standalone toolbox popover (the 设计百宝箱 quick pill above the
   *  composer input; the "+" menu no longer carries a toolbox row). `opener` is
   *  the control focus returns to when the popover is dismissed. */
  openDesignToolbox: (opener?: HTMLElement | null) => void;
  /** Open the standalone plugins popover (the 插件 quick pill above the
   *  composer input; the "+" menu no longer carries a plugins row). `opener` is
   *  the control focus returns to when the popover is dismissed. */
  openPluginsPanel: (opener?: HTMLElement | null) => void;
  /** Schedule closing whichever standalone popover is open (hover-leave from
   *  a quick pill); re-opening or hovering the popup cancels it. */
  scheduleComposerPanelClose: () => void;
  /**
   * Open the composer "+" menu from outside, optionally landing on a specific
   * flyout.
   */
  openPlusMenu: (submenu?: PlusMenuSubmenu) => void;
}

export interface ChatSendMeta {
  /** Stable identity for one confirmed user submission. Queueing and the
   *  eventual daemon run reuse it so retries of the same UI action are
   *  idempotent without collapsing separate sends that share the same text. */
  clientRequestId?: string;
  queueOnly?: boolean;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  appliedPluginSnapshotId?: string;
  inlineAppliedPlugin?: {
    pluginId: string;
    label: string;
  };
  // Per-turn skill ids picked via the @-mention popover. The chat layer
  // forwards these to the daemon's `skillIds` field so the system prompt
  // for this run only is composed with the extra skill bodies, without
  // touching the project's persistent `skillId`.
  skillIds?: string[];
  /** Overrides the run_created / run_finished `entry_from` analytics prop for
   *  this send (e.g. 'mark' when the turn is sent from the Mark draw overlay).
   *  Behavior never depends on it; it only shapes PostHog props. */
  entryFrom?: ChatAnalyticsEntryFrom;
  /** One-shot run mode override for seeded follow-ups before parent state catches up. */
  sessionMode?: ChatSessionMode;
  /**
   * 这一发带上的引用,**结构形态**。
   *
   * 正文里已经有一份折进去的 `> 原文`(见 `submit()`),但那是给 agent 读的散文,
   * 拆不回芯片。排队的那一条要是只剩散文,用户点「编辑」取回来就只能是散文 ——
   * 这正是它存在的理由。
   *
   * 纯 UI 字段:daemon 的请求体是白名单(`providers/daemon.ts` 里逐个字段列出来的),
   * 所以它到不了后端;但它**会**跟着队列进 localStorage,所以写进来之前必须过
   * `sanitizeQuotes` 的上限。
   */
  quotes?: ChatQuote[];
}

type DataTransferItemWithFileSystemEntry = DataTransferItem & {
  webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
};

function dataTransferContainsDirectory(dataTransfer: DataTransfer): boolean {
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = (item as DataTransferItemWithFileSystemEntry).webkitGetAsEntry?.();
    if (entry?.isDirectory === true) return true;
  }
  return false;
}

/**
 * The chat composer: textarea + paste/drop/attach buttons + @-mention
 * picker. Attachments are uploaded into the active project's folder so
 * the agent can reference them by relative path on its next turn.
 *
 * `@` typed at a word boundary opens a popover listing project files.
 * Selecting one inserts `@<path>` into the prompt and stages it as an
 * attachment so the daemon also includes it explicitly.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, Props>(
  function ChatComposer(
    {
      projectId,
      projectFiles,
      activeProjectFileName = null,
      streaming,
      sessionMode = 'design',
      sendDisabled = false,
      inputDisabled = false,
      initialDraft,
      externalPendingUploads,
      onRemoveExternalPendingUpload,
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
      onStandalonePanelChange,
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
      quotes,
      onClearQuotes,
      onRestoreQuotes,
    },
    ref
  ) {
    const { locale, t } = useI18n();
    const analytics = useAnalytics();
    const { workspaceContext } = useProjectCollabContext();
    const activeFileContext =
      projectMetadata?.importedFrom === 'folder' && activeProjectFileName
        ? activeProjectFileName
        : null;
    const activeFileDisplayName = activeFileContext ? lastPathSegment(activeFileContext) : null;
    const [draft, setDraft] = useState(() => initialDraft ?? loadComposerDraft(draftStorageKey) ?? "");
    /*
     * 刷新之后要回来的**整份**负载。读一次就够 —— 会话一换,`ProjectView` 会拿
     * `${project.id}:${activeConversationId}` 当 key 把整棵 ChatPane 重挂,
     * 这个 useRef 跟着重建,所以「按会话隔离」是挂载边界保证的,不靠这里判。
     */
    const restoredExtrasRef = useRef(loadComposerDraftExtras(draftStorageKey));
    const [placeholderScenario, setPlaceholderScenario] = useState<PlaceholderScenario | null>(null);
    const composerRootRef = useRef<HTMLDivElement | null>(null);
    const pendingSessionModeRef = useRef<ChatSessionMode | null>(null);
    // Synchronous mirror of `draft`. Event handlers that mutate the draft off
    // a captured render closure (notably the annotation listener, where two
    // uploads can resolve concurrently) read/write this ref so their edits
    // compose instead of clobbering one another. Kept in lockstep with `draft`
    // by handleEditorChange (the editor is the single source for typing) and by
    // the programmatic-set paths below.
    const draftRef = useRef(draft);
    // Submission admission can cross asynchronous gates before the composer
    // is cleared. Keep a synchronous latch so a second Enter/click in that
    // window cannot enqueue the same still-visible payload again.
    const composedSendPendingRef = useRef(false);
    // The latch above prevents duplicates, but a ref alone leaves the UI
    // completely unchanged while an async admission gate (notably AMR's
    // workspace billing check) is pending. Mirror it in state so Send turns
    // into an immediate, non-interactive "Preparing..." pill instead of
    // looking like the click was lost.
    const [composedSendPending, setComposedSendPending] = useState(false);
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
    // 附件存的是**项目里的相对路径**,不是文件本身 —— 刷新之后原样成立,直接回来。
    const [staged, setStaged] = useState<ChatAttachment[]>(
      () => normalizeChatAttachmentOrders(restoredExtrasRef.current.attachments),
    );
    // Manual editor height set by dragging the shell's gray backdrop up/down.
    // null = the default auto-grow min/max behavior.
    const [manualEditorHeight, setManualEditorHeight] = useState<number | null>(null);
    const nextAttachmentOrderRef = useRef(nextChatAttachmentOrder(restoredExtrasRef.current.attachments));
    const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
    const [figmaModalOpen, setFigmaModalOpen] = useState(false);
    const [figmaHelpOpen, setFigmaHelpOpen] = useState(false);
    const [projectReferenceOpen, setProjectReferenceOpen] = useState(false);
    /*
     * 只恢复**输入框自己攒的**那批标注。宿主用 `commentAttachments` 传进来的那批由
     * daemon 持有,刷新之后本来就会自己回来 —— 一起存下来会在刷新后变成两份。
     */
    const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>(
      () => restoredExtrasRef.current.commentAttachments,
    );
    const streamingAnnotationSendPendingRef = useRef(false);
    // Remembers the entry_from that the deferred streaming send must carry once
    // it flushes. The Mark draw-overlay tags 'mark' synchronously; without this
    // the flush effect would report the run as the default composer entry.
    const streamingAnnotationSendEntryFromRef = useRef<ChatSendMeta['entryFrom']>(undefined);
    const [streamingAnnotationSendPending, setStreamingAnnotationSendPendingState] = useState(false);
    // Skills the user has @-mentioned for this turn. We dedupe on id and
    // strip the chip when the user removes the corresponding `@<skill>`
    // token from the draft, keeping draft and chips in sync.
    const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
    // Legacy standalone design-toolbox popover. The next-step card now renders
    // its own cascading skill menu, so nothing opens this anymore; kept compiling
    // behind `openDesignToolbox` until the panel subsystem is removed wholesale.
    const [designToolboxOpen, setDesignToolboxOpen] = useState(false);
    const [pluginsPanelOpen, setPluginsPanelOpen] = useState(false);
    // Shared close timer for the two legacy standalone popovers (插件 /
    // 设计百宝箱).
    const panelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    function cancelComposerPanelClose() {
      if (panelCloseTimerRef.current) {
        clearTimeout(panelCloseTimerRef.current);
        panelCloseTimerRef.current = null;
      }
    }
    function scheduleComposerPanelClose() {
      cancelComposerPanelClose();
      panelCloseTimerRef.current = setTimeout(() => {
        panelCloseTimerRef.current = null;
        setPluginsPanelOpen(false);
        setDesignToolboxOpen(false);
      }, 260);
    }
    useEffect(() => () => {
      if (panelCloseTimerRef.current) clearTimeout(panelCloseTimerRef.current);
    }, []);
    // The control a standalone popover was opened from. Explicit openers are
    // preferred, but imperative callers that run synchronously from a click can
    // omit one: capture the active control before focus moves into the panel.
    const panelOpenerRef = useRef<HTMLElement | null>(null);
    function resolveStandalonePanelOpener(opener?: HTMLElement | null): HTMLElement | null {
      if (opener) return opener;
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    }
    /** Close whichever standalone popover is open BECAUSE THE USER DISMISSED IT
     *  (Escape, backdrop) and return focus to the control that opened it. Paths
     *  where the user picked something keep the plain setters: the composer
     *  takes focus there, and pulling it back to the opener would fight that. */
    function dismissStandalonePanels() {
      cancelComposerPanelClose();
      setPluginsPanelOpen(false);
      setDesignToolboxOpen(false);
      const opener = panelOpenerRef.current;
      panelOpenerRef.current = null;
      opener?.focus();
    }
    const openStandalonePanel: ComposerStandalonePanel = designToolboxOpen
      ? 'toolbox'
      : pluginsPanelOpen
        ? 'plugins'
        : null;
    useEffect(() => {
      onStandalonePanelChange?.(openStandalonePanel);
    }, [onStandalonePanelChange, openStandalonePanel]);
    // Escape closes the popover, matching ComposerPlusMenu's own document-level
    // handler. Without it, Escape pressed while focus sat in the plugin search
    // did nothing at all.
    useEffect(() => {
      if (openStandalonePanel == null) return;
      function onKey(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        dismissStandalonePanels();
      }
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [openStandalonePanel]);
    // External "+"-menu open request — nonce-keyed so every request re-opens
    // even after the menu was dismissed.
    const [plusMenuOpenRequest, setPlusMenuOpenRequest] = useState<
      { nonce: number; submenu?: PlusMenuSubmenu } | null
    >(null);
    const [stagedMcpServers, setStagedMcpServers] = useState<McpServerConfig[]>([]);
    const [stagedConnectors, setStagedConnectors] = useState<ConnectorDetail[]>([]);
    const linkedDirs = projectMetadata?.linkedDirs ?? [];
    // 工作区上下文条目是自包含的(id / kind / label / path),存下来直接还原,
    // 和宿主本轮给的 `initialWorkspaceContexts` 合并去重。
    const [stagedWorkspaceContexts, setStagedWorkspaceContexts] = useState<WorkspaceContextItem[]>(
      () => dedupeWorkspaceContextItems([
        ...initialWorkspaceContexts,
        ...restoredExtrasRef.current.context.workspaceItems,
      ]),
    );
    const [workspaceLinkedDirAdds, setWorkspaceLinkedDirAdds] = useState<Record<string, TrackedWorkspaceLinkedDir>>(
      () => trackedWorkspaceLinkedDirsForContexts(initialWorkspaceContexts, linkedDirs),
    );
    const [promotedWorkspaceContextDir, setPromotedWorkspaceContextDir] = useState<string | null>(null);
    const [dismissedWorkspaceContextId, setDismissedWorkspaceContextId] = useState<string | null>(null);
    const activeWorkspaceContextId = activeWorkspaceContext?.id ?? null;
    const previousWorkspaceContextIdRef = useRef<string | null>(activeWorkspaceContextId);
    const [dragActive, setDragActive] = useState(false);
    // Lexical owns the caret, so the mention/slash trigger state only carries
    // the typed query — no cursor offset.
    const [mention, setMention] = useState<{ q: string } | null>(null);
    // Active-row index for the @-popover's visible union (files → tabs →
    // plugins → skills → mcp → connectors). Resets to 0 whenever the query
    // identity or tab changes; drives the visual highlight + Enter/Tab target.
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionTab, setMentionTab] = useState<MentionTab>('all');
    // Viewport caret box the floating popover anchors against. Sampled by the
    // editor at trigger-detection time; null when no trigger is live.
    const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
    // Slash-command popover state — when the draft starts with `/` and the
    // cursor is still inside that token (no space committed yet), we show a
    // small palette of supported commands. The query is the text after `/`
    // so the user can type-to-filter.
    const [slash, setSlash] = useState<{ q: string } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    /* 待发送托盘里【还没传完 / 传失败】的那几张卡(设计稿 #61 / #63)。
       它们不进 `staged` —— `staged` 是「能跟着这条消息发出去的附件」,而这几张
       还没有服务端路径。两条列表在渲染时才合并(`buildStagedAttachmentCards`)。 */
    const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
    /* 本地 `File` 留在 ref 里,不进 state:重试要能只重发那一个文件,而 `File`
       本身不参与渲染,放进 state 只会让每次上传都多一轮无谓的 diff。
       `previewUrl` 一并记着,移除 / 传完时要 revoke,不然长会话里会漏一串 blob。 */
    const pendingFilesRef = useRef<Map<string, { file: File; previewUrl: string | null }>>(new Map());
    const pendingSeqRef = useRef(0);
    // 组件被卸掉时(切项目 / 关面板)把还没 revoke 的本地缩略图一次收干净。
    useEffect(() => {
      const files = pendingFilesRef.current;
      return () => {
        if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
        for (const entry of files.values()) {
          if (entry.previewUrl) {
            try {
              URL.revokeObjectURL(entry.previewUrl);
            } catch {
              /* 撤不掉不影响功能 */
            }
          }
        }
        files.clear();
      };
    }, []);
    // External MCP servers configured by the user. Fetched lazily on mount;
    // shown in the slash-command palette so `/mcp <id>` inserts a hint into
    // the prompt that nudges the model to use that server's tools.
    const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
    const [mcpTemplates, setMcpTemplates] = useState<McpTemplate[]>([]);
    const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
    // Installed plugins, fetched lazily for the tools-menu Plugins tab and
    // the @-mention picker. Both surfaces share the same list so applying
    // a plugin from either path lands on the same project context.
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
    // Detail modal — opened from a context chip click (kind === 'plugin')
    // or from the tools-menu "Details" affordance.
    const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
    const [detailsSkill, setDetailsSkill] = useState<{
      id: string;
      summary?: SkillSummary | null;
    } | null>(null);
    const [activeAppliedPlugin, setActiveAppliedPlugin] =
      useState<AppliedPluginSnapshot | null>(null);
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    const inlineBackedPluginRef = useRef<{ id: string; label: string } | null>(null);
    async function duplicateDetailsPlugin(record: InstalledPluginRecord) {
      try {
        const result = await duplicatePluginAsProject(record.id, {
          name: localizePluginTitle(locale, record),
        }, workspaceContext);
        setDetailsRecord(null);
        navigate({
          kind: 'project',
          projectId: result.projectId,
          conversationId: result.conversationId,
          fileName: result.relPath,
        });
      } catch {
        onShowToast?.(t('pluginCard.duplicateFailed'));
      }
    }
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts project context, MCP, Import actions,
    // and a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    // The "+" menu (ComposerPlusMenu) owns its own open / submenu state.
    // Defer the (large) plugin / MCP / connector fetches until the composer is
    // actually used — first focus, the tools popover opening, an @/slash
    // trigger, or a pre-seeded draft. An untouched empty composer (e.g. a home
    // surface the user bounces off, or a background chat) never pays for the
    // full plugin-manifest list. Latches once true and never resets.
    const [composerEngaged, setComposerEngaged] = useState(
      () => (draft ?? '').trim().length > 0
        || restoredExtrasRef.current.context.skillIds.length > 0
        || restoredExtrasRef.current.context.mcpServerIds.length > 0
        || restoredExtrasRef.current.context.connectorIds.length > 0,
    );
    // Match HomeHero's empty-editor behavior: once the user places the real
    // caret in this composer, hide/pause the decorative typewriter overlay so
    // CSS no longer suppresses the native blinking caret. Blur resumes the
    // animation only while the composer is still genuinely empty.
    const [composerFocused, setComposerFocused] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // The Lexical editor handle — drives text/mention/clear/focus from the
    // host. Replaces the old textareaRef + manual selection plumbing. IME
    // composition guarding now lives inside the editor's command handlers.
    const editorRef = useRef<LexicalComposerInputHandle | null>(null);
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
    const [recentDirs, setRecentDirs] = useState<string[]>([]);
    useEffect(() => {
      let cancelled = false;
      void fetchRecentLinkedDirs().then((dirs) => {
        if (!cancelled) setRecentDirs(dirs);
      });
      return () => {
        cancelled = true;
      };
    }, []);
    const rememberRecentDir = useCallback(async (dir: string) => {
      setRecentDirs((prev) => [dir, ...prev.filter((d) => d !== dir)].slice(0, 5));
      const persisted = await pushRecentLinkedDir(dir);
      setRecentDirs(persisted);
    }, []);
    const visibleWorkspaceContext =
      activeWorkspaceContext && activeWorkspaceContext.id !== dismissedWorkspaceContextId
        ? activeWorkspaceContext
        : null;
    const selectedWorkspaceContexts = useMemo(() => {
      const out: WorkspaceContextItem[] = [];
      const seen = new Set<string>();
      const push = (item: WorkspaceContextItem | null | undefined) => {
        if (!item) return;
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(item);
      };
      push(visibleWorkspaceContext);
      for (const item of stagedWorkspaceContexts) push(item);
      return out;
    }, [stagedWorkspaceContexts, visibleWorkspaceContext]);
    const selectedWorkspaceContextDirs = useMemo<string[]>(
      () => workspaceContextLinkedDirs(selectedWorkspaceContexts),
      [selectedWorkspaceContexts],
    );
    const workspaceContextMetadataLinkedDirList = useMemo<string[]>(
      () =>
        Array.from(new Set([
          ...Object.values(workspaceLinkedDirAdds).map((tracked) => tracked.dir),
          ...selectedWorkspaceContextDirs,
        ])),
      [selectedWorkspaceContextDirs, workspaceLinkedDirAdds],
    );
    const workspaceContextLinkedDirList = useMemo<string[]>(
      () =>
        workspaceContextMetadataLinkedDirList.filter((dir) => dir !== promotedWorkspaceContextDir),
      [promotedWorkspaceContextDir, workspaceContextMetadataLinkedDirList],
    );
    const workspaceContextLinkedDirSet = useMemo<Set<string>>(
      () => new Set(workspaceContextLinkedDirList),
      [workspaceContextLinkedDirList],
    );
    // The project's working directory: the local folder the agent can read
    // (via `linkedDirs` → `--add-dir`). Shown in the WorkingDirPicker below
    // the input, mirroring Home. Context-only folders are still linked for
    // agent read access, but they should not become the displayed primary dir.
    const workingDir = linkedDirs.find((dir) => !workspaceContextLinkedDirSet.has(dir)) ?? null;
    // Live-check whether the selected working directory still exists, so a
    // folder deleted from disk turns the picker red without a page reload.
    // Re-checked when the dir changes, when the window/tab regains focus
    // (e.g. after deleting it in Finder), and when the picker is opened.
    const [workingDirMissing, setWorkingDirMissing] = useState(false);
    const checkWorkingDir = useCallback(async () => {
      if (!workingDir) {
        setWorkingDirMissing(false);
        return;
      }
      const ok = await dirExists(workingDir);
      setWorkingDirMissing(!ok);
    }, [workingDir]);
    useEffect(() => {
      void checkWorkingDir();
      const onFocus = () => void checkWorkingDir();
      const onVisible = () => {
        if (document.visibilityState === 'visible') void checkWorkingDir();
      };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }, [checkWorkingDir]);
    // initialDraft is only honored on the first non-empty value the parent
    // hands us. After we seed once, the composer is fully under user control
    // — re-renders that pass the same prompt back must not reseed. If the
    // initial useState above already consumed a non-empty initialDraft we
    // mark it seeded immediately, so an early clear by the user (typing or
    // backspace before the parent stops passing initialDraft) does not get
    // overwritten by the effect.
    const seededRef = useRef(Boolean(initialDraft));

    useEffect(() => {
      if (seededRef.current) return;
      if (initialDraft && initialDraft !== draft) {
        setDraft(initialDraft);
        seededRef.current = true;
      } else if (initialDraft === undefined) {
        seededRef.current = true;
      }
    }, [initialDraft, draft]);

    useEffect(() => {
      saveComposerDraft(draftStorageKey, draft);
    }, [draftStorageKey, draft]);

    /*
     * ── 刷新之后把整份草稿写回去 ──────────────────────────────────────────
     *
     * 正文、附件、标注、工作区条目在 `useState` 初值里就已经回来了(它们自包含,
     * 不需要问任何人)。这里处理剩下两件**需要等**的事。
     */

    /** 还没落到芯片上的绑定 id。列表回来一批就消一批,始终对不上的就此丢掉。 */
    const pendingRestoredContextRef = useRef<ComposerDraftContext | null>(
      restoredExtrasRef.current.context.skillIds.length > 0
        || restoredExtrasRef.current.context.mcpServerIds.length > 0
        || restoredExtrasRef.current.context.connectorIds.length > 0
        ? restoredExtrasRef.current.context
        : null,
    );

    /*
     * 技能 / MCP / 连接器只存了 id(存完整对象等于把 `McpServerConfig.env` 里的
     * 用户 API key 写进 localStorage),所以要等对应的列表拉回来才能变成芯片。
     * 这几份列表是**懒加载**的:首屏一律是空数组。要是在挂载那一下就解析,
     * 用户挂上去的每一枚 MCP / 连接器芯片都会被无声吞掉 —— 看起来像「存了个寂寞」。
     * 所以这里跟着列表变化重试,解析掉的从待办里划掉,划不掉的留着等下一批。
     */
    useEffect(() => {
      const pending = pendingRestoredContextRef.current;
      if (!pending) return;
      const nextSkills = resolveStagedById(pending.skillIds, skills);
      const nextMcp = resolveStagedById(pending.mcpServerIds, mcpServers);
      const nextConnectors = resolveStagedById(pending.connectorIds, connectors);
      if (nextSkills.resolved.length > 0) {
        setStagedSkills((current) => mergeStagedById(current, nextSkills.resolved));
      }
      if (nextMcp.resolved.length > 0) {
        setStagedMcpServers((current) => mergeStagedById(current, nextMcp.resolved));
      }
      if (nextConnectors.resolved.length > 0) {
        setStagedConnectors((current) => mergeStagedById(current, nextConnectors.resolved));
      }
      pendingRestoredContextRef.current =
        nextSkills.unresolved.length + nextMcp.unresolved.length + nextConnectors.unresolved.length > 0
          ? {
              skillIds: nextSkills.unresolved,
              mcpServerIds: nextMcp.unresolved,
              connectorIds: nextConnectors.unresolved,
              workspaceItems: [],
            }
          : null;
    }, [skills, mcpServers, connectors]);

    /*
     * 引用的 state 住在宿主那儿,所以只能还回去。挂载一次就够 ——
     * 之后是用户在操作,再塞回去会把人家刚清掉的东西又变出来。
     */
    const restoredQuotesHandedBackRef = useRef(false);
    useEffect(() => {
      if (restoredQuotesHandedBackRef.current) return;
      restoredQuotesHandedBackRef.current = true;
      const restored = restoredExtrasRef.current.quotes;
      if (restored.length === 0) return;
      onRestoreQuotes?.(restored);
    }, [onRestoreQuotes]);

    /*
     * 攒上去的东西跟着写下去。`reset()` 把这几样清空之后,这里写出的是空负载 ——
     * 空负载不落盘,于是「发出去了」和「草稿没了」是同一件事,不需要单独去 remove。
     */
    useEffect(() => {
      saveComposerDraftExtras(draftStorageKey, {
        attachments: staged,
        commentAttachments: stagedVisualComments,
        quotes: quotes ?? [],
        context: {
          skillIds: stagedSkills.map((item) => item.id),
          mcpServerIds: stagedMcpServers.map((item) => item.id),
          connectorIds: stagedConnectors.map((item) => item.id),
          // 只存**用户自己挂上去的**那几条。当前工作区那一条来自
          // `activeWorkspaceContext`,刷新之后宿主会重新给 —— 存下来会让它变成
          // 摘不掉的常驻项(用户「×」掉之后下次刷新又长回来)。
          workspaceItems: stagedWorkspaceContexts,
        },
      });
    }, [
      draftStorageKey,
      staged,
      stagedVisualComments,
      quotes,
      stagedSkills,
      stagedMcpServers,
      stagedConnectors,
      stagedWorkspaceContexts,
    ]);

    useEffect(() => {
      if (previousWorkspaceContextIdRef.current === activeWorkspaceContextId) return;
      previousWorkspaceContextIdRef.current = activeWorkspaceContextId;
      setDismissedWorkspaceContextId(null);
      setPromotedWorkspaceContextDir(null);
    }, [activeWorkspaceContextId]);

    // Latch `composerEngaged` true on the first real interaction so the
    // deferred fetches below run exactly once, when they are actually needed.
    useEffect(() => {
      if (composerEngaged) return;
      if (draft.trim().length > 0 || mention || slash) {
        setComposerEngaged(true);
      }
    }, [composerEngaged, draft, mention, slash]);

    // Lazy-fetch the user's external MCP servers list (once engaged) so the
    // `/mcp …` slash palette and the composer's MCP button popover have
    // something to render. We deliberately do not reactively re-fetch when
    // the user toggles servers from Settings — the dialog refreshes itself,
    // and the chat composer rehydrates next time the user re-opens it. A
    // background poll would be cheap but unnecessary for the typical
    // edit-once-then-chat workflow.
    useEffect(() => {
      if (!composerEngaged) return;
      let cancelled = false;
      void (async () => {
        const data = await fetchMcpServers();
        if (cancelled || !data) return;
        setMcpServers(data.servers);
        setMcpTemplates(data.templates);
      })();
      return () => {
        cancelled = true;
      };
    }, [composerEngaged]);

    // Skills now come from the parent (App.tsx → ProjectView → ChatPane → ChatComposer)
    // pre-filtered by enabled/disabled state. We no longer fetch a fresh list
    // here to avoid showing skills the user has disabled via Settings.

    // Lazy-fetch installed plugins once on mount; the tools-menu Plugins
    // tab and the @-mention picker both consume this list.
    useEffect(() => {
      if (!projectId || !composerEngaged) return;
      let cancelled = false;
      void listPlugins().then((rows) => {
        if (cancelled) return;
        setInstalledPlugins(rows);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId, composerEngaged]);

    useEffect(() => {
      if (!composerEngaged) return;
      let cancelled = false;
      void fetchConnectorCatalogSnapshot().then((rows) => {
        if (cancelled) return;
        setConnectors(rows.filter((connector) => connector.status === 'connected'));
      });
      return () => {
        cancelled = true;
      };
    }, [composerEngaged]);

    useEffect(() => {
      if (!composerEngaged) return;
      let cancelled = false;
      async function refreshConnectors() {
        const rows = await fetchConnectorCatalogSnapshot({ refreshDiscovery: true });
        if (cancelled) return;
        setConnectors(rows.filter((connector) => connector.status === 'connected'));
      }
      const stopListening = listenForConnectorsChanged(() => void refreshConnectors());
      return () => {
        cancelled = true;
        stopListening();
      };
    }, [composerEngaged]);

    useEffect(() => {
      const inlinePlugin = inlineBackedPluginRef.current;
      if (!activeAppliedPlugin || inlinePlugin?.id !== activeAppliedPlugin.pluginId) return;
      if (mentionTokenPresent(draft, inlinePlugin.label)) return;
      inlineBackedPluginRef.current = null;
      pluginsSectionRef.current?.clear();
    }, [activeAppliedPlugin, draft]);

    // Composer-side plugin list: hide bundled atoms (pipeline-only). Keep
    // the full installed list available even when the project was created
    // from a pinned plugin, so users can switch or layer different plugin
    // context from the tools menu and @ picker.
    const pluginsForComposer = useMemo<InstalledPluginRecord[]>(() => {
      const allowedKinds = new Set(['skill', 'scenario', 'bundle']);
      return installedPlugins.filter((p) => {
        const k = p.manifest?.od?.kind;
        return !k || allowedKinds.has(k);
      });
    }, [installedPlugins]);

    const enabledMcpServers = useMemo(
      () => mcpServers.filter((s) => s.enabled),
      [mcpServers],
    );

    function inlineBackedPluginFromRestoredDraft(
      text: string,
      appliedPlugin: AppliedPluginSnapshot | null | undefined,
      meta: ChatSendMeta | undefined,
    ): { id: string; label: string } | null {
      if (!appliedPlugin) return null;
      const restoredInline = meta?.inlineAppliedPlugin;
      if (restoredInline?.pluginId !== appliedPlugin.pluginId) return null;
      return mentionTokenPresent(text, restoredInline.label)
        ? { id: appliedPlugin.pluginId, label: restoredInline.label }
        : null;
    }

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
    const composerMentionEntities = useMemo(
      () =>
        buildComposerMentionEntities({
          connectors,
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills,
          staged,
          workspaceContexts: selectedWorkspaceContexts,
        }),
      [connectors, enabledMcpServers, pluginsForComposer, projectFiles, selectedWorkspaceContexts, skills, staged],
    );
    // Resolve which tabs to surface in the consolidated tools popover.
    // Plugins is always visible while a project is active so users can
    // apply context without leaving the composer. MCP shows when wired by
    // Catalog of supported slash commands. Each entry shows up in the
    // popover when the user types `/` in the composer. The `insert`
    // value is what we drop into the draft when the user picks the
    // entry — usually the canonical command form with a trailing space
    // ready for an argument.
    const slashCommands = useMemo<SlashCommand[]>(() => {
      const list: SlashCommand[] = [];
      // External MCP servers — `/mcp` opens settings, `/mcp <id>` inserts a
      // prompt-side hint nudging the model to use that server's tools. The
      // hint flows through to the agent verbatim; the daemon already wired
      // the MCP config into the agent's launch so the tools are callable.
      if (onOpenMcpSettings) {
        list.push({
          id: 'mcp',
          label: '/mcp',
          insert: '/mcp ',
          descKey: 'pet.slashMcp',
          icon: 'sliders',
          argHint: 'open settings · <server-id> to insert hint',
        });
      }
      for (const s of enabledMcpServers) {
        list.push({
          id: `mcp-${s.id}`,
          label: `/mcp ${s.id}`,
          insert: `Use the \`${s.id}\` MCP server tools. `,
          descKey: 'pet.slashMcp',
          icon: 'sparkles',
          argHint: s.label || s.transport,
        });
      }
      if (researchAvailable) {
        list.push({
          id: 'search',
          label: '/search',
          insert: '/search ',
          descKey: 'pet.slashSearch',
          icon: 'sparkles',
          argHint: t('pet.slashSearchArg'),
        });
      }
      return list;
    }, [researchAvailable, t, enabledMcpServers, onOpenMcpSettings]);

    const filteredSlash = useMemo(() => {
      if (!slash) return [] as SlashCommand[];
      const q = slash.q.toLowerCase();
      if (!q) return slashCommands;
      return slashCommands.filter((c) => c.label.toLowerCase().includes(q));
    }, [slash, slashCommands]);

    function pickSlash(cmd: SlashCommand) {
      if (!slash) return;
      // Replace the in-flight `/<query>` trigger with the picked command's
      // canonical insertion text. Lexical owns the caret afterwards.
      editorRef.current?.replaceActiveTrigger(cmd.insert);
      editorRef.current?.focus();
      setSlash(null);
    }

    // Expand a `/hatch <concept>` draft into the canonical hatch-pet
    // skill prompt before sending. Returns null when the draft is not a
    // hatch command so the caller can fall through to the regular
    // submit path.
    function expandHatchCommand(input: string): string | null {
      const m = /^\/hatch(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const concept = m[1]?.trim() ?? '';
      const intro = concept
        ? `Hatch a Codex-compatible animated pet for me. Concept: ${concept}.`
        : 'Hatch a Codex-compatible animated pet for me.';
      return [
        intro,
        '',
        'Use the @hatch-pet skill end-to-end:',
        '1. Generate the base look with $imagegen.',
        '2. Generate every row strip (idle, running-right, waving, jumping, failed, waiting, running, review).',
        '3. Mirror running-left from running-right only when the design is symmetric.',
        '4. Run the deterministic scripts (extract / compose / validate / contact-sheet / videos).',
        '5. Package the result into ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/ with pet.json + spritesheet.webp.',
        '',
        'When the spritesheet is saved, tell me the absolute path and the pet folder name. I will adopt it from Settings → Pets → Recently hatched.',
      ].join('\n');
    }

    // `/mcp` (no arg) opens settings on the External MCP tab — pure UX hook,
    // never sent to the agent. `/mcp <id>` is intentionally NOT intercepted
    // here: the slash palette already replaces it with a natural-language
    // hint sentence ("Use the `<id>` MCP server tools."), and the user is
    // expected to keep typing the rest of the prompt before sending.
    function tryHandleMcpSlash(): boolean {
      if (!onOpenMcpSettings) return false;
      const trimmed = draft.trim();
      if (!/^\/mcp\s*$/i.test(trimmed)) return false;
      onOpenMcpSettings();
      setDraft('');
      editorRef.current?.clear();
      return true;
    }

    function expandSearchCommand(input: string): { prompt: string; query: string } | null {
      const m = /^\/search(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const query = m[1]?.trim() ?? '';
      if (!query) return null;
      return {
        query,
        prompt: [
          `Search for: ${query}`,
          '',
          'Before answering, your first tool action must be the OD research command for your shell.',
          'POSIX: "$OD_NODE_BIN" "$OD_BIN" research search --query "<search query>" --max-sources 5',
          'PowerShell: & $env:OD_NODE_BIN $env:OD_BIN research search --query "<search query>" --max-sources 5',
          'cmd.exe: "%OD_NODE_BIN%" "%OD_BIN%" research search --query "<search query>" --max-sources 5',
          'Use the canonical query below as the exact search query, with safe quoting for your shell.',
          '',
          'Canonical query:',
          '',
          '```text',
          query.replace(/```/g, '`\u200b`\u200b`'),
          '```',
          "If the OD command fails, keep the stderr / exit status in the tool trace and daemon logs, then use your own search capability as fallback. Label the fallback clearly in your answer — the user asked for a search, so they are owed the fact that these results did not come from the research command, but not the provider name or the error text.",
          'After the command returns JSON or fallback search results, write a reusable Markdown report into Design Files at `research/<safe-query-slug>.md` or another fresh project-relative path.',
          'The report must include the query, fetched time, short summary, key findings, source list with [1], [2] citations, and a note that source content is external untrusted evidence.',
          'Then summarize the findings with citations by source index and mention the Markdown report path.',
        ].join('\n'),
      };
    }

    // Parse a `/pet [arg]` slash command out of the draft. Recognized
    // forms: `/pet` (toggle wake/tuck), `/pet wake`, `/pet tuck`,
    // `/pet adopt` (open settings), or `/pet <id>` to adopt a built-in
    // by id. The slash is stripped from the draft on a successful match
    // so the user does not accidentally send the command to the agent.
    function tryHandlePetSlash(): boolean {
      if (!petEnabled) return false;
      const trimmed = draft.trim();
      const match = /^\/pet(?:\s+(\S+))?$/i.exec(trimmed);
      if (!match) return false;
      const arg = match[1]?.toLowerCase();
      if (!arg || arg === 'toggle') {
        onTogglePet?.();
      } else if (arg === 'wake' || arg === 'show') {
        if (petConfig?.adopted) {
          if (!petConfig.enabled) onTogglePet?.();
        } else {
          onOpenPetSettings?.();
        }
      } else if (arg === 'tuck' || arg === 'hide') {
        if (petConfig?.enabled) onTogglePet?.();
      } else if (arg === 'adopt' || arg === 'settings' || arg === 'change') {
        onOpenPetSettings?.();
      } else if (arg === CUSTOM_PET_ID) {
        onAdoptPet?.(CUSTOM_PET_ID);
      } else {
        const pet = BUILT_IN_PETS.find((p) => p.id === arg);
        if (pet) {
          onAdoptPet?.(pet.id);
        } else {
          return false;
        }
      }
      setDraft('');
      editorRef.current?.clear();
      return true;
    }

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
        restoreDraft: ({ text, attachments = [], commentAttachments = [], quotes: restoredQuotes = [], meta }) => {
          /*
           * 引用是发送时**折进正文**的(`submit()` 里那个 `> 原文` 前缀),所以
           * 取回来要做两件事,缺一不可:把芯片还给宿主,并把正文里那段引文拆掉。
           * 只做前一件,引文会在屏幕上出现两遍(芯片一遍、正文一遍);
           * 只做后一件,就是今天这个 bug 反过来——正文被啃掉一截还没有芯片。
           *
           * 拆不干净就不拆(`splitQuotedPrompt` 只在前缀完全对得上时动手),
           * 老队列里没有 `meta.quotes` 的那些于是原样退回今天的行为。
           */
          const body = splitQuotedPrompt(text, restoredQuotes);
          setDraft(body);
          // 引用的 state 住在宿主那儿,只能还回去 —— 和刷新恢复走的是同一条路。
          // 无条件调用:取回一条**没有**引用的队列项时,必须把上一条留下的芯片清掉,
          // 否则它们会被折进下一发的正文里。
          onRestoreQuotes?.(restoredQuotes);
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
          // 队列这条路径是**一次性**解析:点「编辑」时懒加载的列表早就回来了,
          // 对不上就是真的没了。刷新那条路径首屏列表还是空的,处理方式不同 ——
          // 见 `pendingRestoredContextRef`。
          setStagedSkills(resolveStagedById(ctx?.skillIds, skills).resolved);
          setStagedMcpServers(resolveStagedById(ctx?.mcpServerIds, mcpServers).resolved);
          setStagedConnectors(resolveStagedById(ctx?.connectorIds, connectors).resolved);
          pendingRestoredContextRef.current = null;
          setStagedWorkspaceContexts(ctx?.workspaceItems ?? []);
          const restoredAppliedPlugin = meta?.appliedPluginSnapshot ?? null;
          setActiveAppliedPlugin(restoredAppliedPlugin);
          inlineBackedPluginRef.current = inlineBackedPluginFromRestoredDraft(
            text,
            restoredAppliedPlugin,
            meta,
          );
          setUploadError(null);
          setMention(null);
          setSlash(null);
          editorRef.current?.setText(body);
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
        openDesignToolbox: (opener?: HTMLElement | null) => {
          cancelComposerPanelClose();
          setComposerEngaged(true);
          panelOpenerRef.current = resolveStandalonePanelOpener(opener);
          // The two popovers share one anchor spot — opening one closes the
          // other so hover-switching between the pills swaps panels.
          setPluginsPanelOpen(false);
          setDesignToolboxOpen(true);
        },
        openPluginsPanel: (opener?: HTMLElement | null) => {
          cancelComposerPanelClose();
          setComposerEngaged(true);
          panelOpenerRef.current = resolveStandalonePanelOpener(opener);
          setDesignToolboxOpen(false);
          setPluginsPanelOpen(true);
        },
        scheduleComposerPanelClose: () => {
          scheduleComposerPanelClose();
        },
        openPlusMenu: (submenu?: PlusMenuSubmenu) => {
          setComposerEngaged(true);
          setPlusMenuOpenRequest((prev) => ({
            nonce: (prev?.nonce ?? 0) + 1,
            ...(submenu ? { submenu } : {}),
          }));
        },
      }),
      [connectors, mcpServers, pluginsForComposer, skills]
    );

    function reset() {
      pendingEntryFromRef.current = null;
      pendingSessionModeRef.current = null;
      const linkedWorkspaceContexts = stagedWorkspaceContexts.filter((item) => (
        Boolean(item.absolutePath?.trim()) && Boolean(workspaceLinkedDirAdds[item.id])
      ));
      const linkedWorkspaceContextIds = new Set(linkedWorkspaceContexts.map((item) => item.id));
      const nextWorkspaceLinkedDirAdds = Object.fromEntries(
        Object.entries(workspaceLinkedDirAdds).filter(([id]) => linkedWorkspaceContextIds.has(id)),
      );
      setDraft("");
      setStaged([]);
      nextAttachmentOrderRef.current = 0;
      setStagedVisualComments([]);
      setStagedSkills([]);
      setStagedMcpServers([]);
      setStagedConnectors([]);
      setStagedWorkspaceContexts(linkedWorkspaceContexts);
      setWorkspaceLinkedDirAdds(nextWorkspaceLinkedDirAdds);
      if (
        promotedWorkspaceContextDir &&
        !linkedWorkspaceContexts.some((item) => item.absolutePath?.trim() === promotedWorkspaceContextDir)
      ) {
        setPromotedWorkspaceContextDir(null);
      }
      pluginsSectionRef.current?.clear();
      inlineBackedPluginRef.current = null;
      setActiveAppliedPlugin(null);
      setUploadError(null);
      setMention(null);
      setMentionTab('all');
      setSlash(null);
      editorRef.current?.clear();
    }

    function currentCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return sortChatCommentAttachmentsByOrder([...commentAttachments, ...stagedVisualComments, ...extra]);
    }

    function setStreamingAnnotationSendPending(value: boolean) {
      streamingAnnotationSendPendingRef.current = value;
      setStreamingAnnotationSendPendingState(value);
    }

    function currentRunContextMeta(): ChatSendMeta | undefined {
      const skillIds = stagedSkills.map((s) => s.id);
      const pluginIds = activeAppliedPlugin ? [activeAppliedPlugin.pluginId] : [];
      const mcpServerIds = stagedMcpServers.map((s) => s.id);
      const connectorIds = stagedConnectors.map((c) => c.id);
      const workspaceItems = selectedWorkspaceContexts;
      const context: RunContextSelection = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(pluginIds.length > 0 ? { pluginIds } : {}),
        ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
        ...(connectorIds.length > 0 ? { connectorIds } : {}),
        ...(workspaceItems.length > 0 ? { workspaceItems } : {}),
      };
      const meta: ChatSendMeta = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(activeAppliedPlugin
          ? {
              appliedPluginSnapshot: activeAppliedPlugin,
              appliedPluginSnapshotId: activeAppliedPlugin.snapshotId,
              ...(inlineBackedPluginRef.current?.id === activeAppliedPlugin.pluginId
                ? {
                    inlineAppliedPlugin: {
                      pluginId: activeAppliedPlugin.pluginId,
                      label: inlineBackedPluginRef.current.label,
                    },
                  }
                : {}),
            }
          : {}),
        ...(Object.keys(context).length > 0 ? { context } : {}),
      };
      return Object.keys(meta).length > 0 ? meta : undefined;
    }

    function finishComposedSend(
      outcome: ChatSendOutcome | Promise<ChatSendOutcome>,
      pendingMetadata?: { entryFrom: ChatSendMeta['entryFrom'] | null; sessionMode: ChatSessionMode | null },
    ) {
      void Promise.resolve(outcome).then(
        (result) => {
          if (result === 'restore-draft') {
            if (pendingMetadata?.entryFrom && !pendingEntryFromRef.current) {
              pendingEntryFromRef.current = pendingMetadata.entryFrom;
            }
            if (pendingMetadata?.sessionMode && !pendingSessionModeRef.current) {
              pendingSessionModeRef.current = pendingMetadata.sessionMode;
            }
            return;
          }
          reset();
        },
        () => {
          if (pendingMetadata?.entryFrom && !pendingEntryFromRef.current) {
            pendingEntryFromRef.current = pendingMetadata.entryFrom;
          }
          if (pendingMetadata?.sessionMode && !pendingSessionModeRef.current) {
            pendingSessionModeRef.current = pendingMetadata.sessionMode;
          }
        },
      ).finally(() => {
        composedSendPendingRef.current = false;
        setComposedSendPending(false);
      });
    }

    function beginComposedSend(
      send: () => ChatSendOutcome | Promise<ChatSendOutcome>,
      pendingMetadata?: { entryFrom: ChatSendMeta['entryFrom'] | null; sessionMode: ChatSessionMode | null },
    ): boolean {
      if (composedSendPendingRef.current) return false;
      composedSendPendingRef.current = true;
      setComposedSendPending(true);
      try {
        finishComposedSend(send(), pendingMetadata);
        return true;
      } catch (error) {
        composedSendPendingRef.current = false;
        setComposedSendPending(false);
        throw error;
      }
    }

    /**
     * 这一发**真正带走**的正文。
     *
     * 正文取词攒下的引用是折进正文发给 agent 的(`> 原文` 前缀,设计稿组件 23):
     * 用 markdown 的引用块,agent 一眼分得清「这是我上一轮说的话」和「这是新指令」。
     * 前缀由 `quotePromptPrefix` 独家定义 —— 取回编辑时的 `splitQuotedPrompt`
     * 拆的就是它,两边共用一个函数才不会一边改了另一边没跟上。
     *
     * 折这一步必须只有这一个出处:输入框有**四条**送信路(回车 / 点击、
     * 标注面板直接发、标注面板排队、流式期间的延迟发)。原来只有 `submit()`
     * 折了前缀,另外三条各自拼 `[draft, note]` —— 于是从标注面板发出去的那一发:
     * 芯片被清掉了、`meta.quotes` 也挂上了,唯独 agent 一个字都没收到。
     * 清空芯片必须意味着「已经带走」(OPEND-2551 同一族)。
     */
    function composeOutgoingPrompt(body: string): string {
      return `${quotePromptPrefix(quotes ?? [])}${body}`.trim();
    }

    function sendComposedTurn(
      prompt: string,
      attachments: ChatAttachment[],
      nextCommentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): boolean {
      setStreamingAnnotationSendPending(false);
      if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return false;
      const nextAttachments =
        activeFileContext && !attachments.some((attachment) => attachment.path === activeFileContext)
          ? [
              {
                path: activeFileContext,
                name: activeFileDisplayName ?? activeFileContext,
                kind: 'file' as const,
              },
              ...attachments,
            ]
          : attachments;
      // Apply pending Next-step metadata if the caller didn't set its own
      // fields, then clear it so it only colors the immediate next send.
      const pendingEntryFrom = pendingEntryFromRef.current;
      const pendingSessionMode = pendingSessionModeRef.current;
      pendingEntryFromRef.current = null;
      pendingSessionModeRef.current = null;
      // 引用同时走两条路:折进正文给 agent 读,和**原样**挂在 meta 上给队列存。
      // 后者是「点编辑取回来还是芯片」的唯一依据 —— 正文那份拆不出结构。
      // 过一道 sanitize 是因为队列会原样落进 localStorage,那一层不设防。
      const outgoingQuotes = sanitizeQuotes(quotes ?? []);
      const effectiveMetaShape: ChatSendMeta = {
        ...(meta ?? {}),
        ...(pendingEntryFrom && !meta?.entryFrom ? { entryFrom: pendingEntryFrom } : {}),
        ...(pendingSessionMode && !meta?.sessionMode ? { sessionMode: pendingSessionMode } : {}),
        ...(outgoingQuotes.length > 0 ? { quotes: outgoingQuotes } : {}),
      };
      const effectiveMeta =
        Object.keys(effectiveMetaShape).length > 0 ? effectiveMetaShape : undefined;
      // 引用是这一条消息的上下文,发出去就该清掉 —— 它不是长期状态
      onClearQuotes?.();
      return beginComposedSend(
        () => onSend(prompt, nextAttachments, nextCommentAttachments, effectiveMeta),
        { entryFrom: pendingEntryFrom, sessionMode: pendingSessionMode },
      );
    }

    function queueMeta(meta?: ChatSendMeta): ChatSendMeta {
      return { ...(meta ?? {}), queueOnly: true };
    }

    function reserveAttachmentOrders(count: number): number {
      const orderStart = Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(staged));
      nextAttachmentOrderRef.current = orderStart + count;
      return orderStart;
    }

    function appendOrderedStagedAttachments(attachments: ChatAttachment[]) {
      if (attachments.length === 0) return;
      setStaged((current) => {
        const knownPaths = new Set(current.map((attachment) => attachment.path));
        const nextAttachments = attachments.filter((attachment) => !knownPaths.has(attachment.path));
        if (nextAttachments.length === 0) return current;
        const next = sortChatAttachmentsByOrder([...current, ...nextAttachments]);
        nextAttachmentOrderRef.current = Math.max(
          nextAttachmentOrderRef.current,
          nextChatAttachmentOrder(next),
        );
        return next;
      });
    }

    function appendContextAttachment(filePath: string) {
      setStaged((current) => {
        if (current.some((item) => item.path === filePath)) return current;
        const order = Math.max(nextAttachmentOrderRef.current, nextChatAttachmentOrder(current));
        nextAttachmentOrderRef.current = order + 1;
        return sortChatAttachmentsByOrder([
          ...current,
          {
            path: filePath,
            name: filePath.split("/").pop() || filePath,
            kind: looksLikeImage(filePath) ? "image" : "file",
            order,
          },
        ]);
      });
    }

    function replaceEditorDraft(text: string) {
      draftRef.current = text;
      setDraft(text);
      editorRef.current?.setText(text);
    }

    function insertInlineMentionSeparator() {
      const current = editorRef.current?.getText() ?? draftRef.current;
      if (current.trim() && !/\s$/.test(current)) {
        editorRef.current?.insertText(' ');
      }
    }

    function appendWorkspacePrompt(item: WorkspaceContextItem) {
      setStagedWorkspaceContexts((current) =>
        current.some((candidate) => candidate.id === item.id)
          ? current
          : [...current, item],
      );
      insertInlineMentionSeparator();
      editorRef.current?.insertMention({
        token: inlineMentionToken(item.label),
        entity: { id: item.id, kind: 'workspace', label: item.label },
      });
      setMention(null);
      setSlash(null);
      setComposerEngaged(true);
    }

    async function addLinkedDirs(dirs: string[]): Promise<Map<string, TrackedWorkspaceLinkedDir | null> | false> {
      if (!projectId) return false;
      const trimmedDirs = Array.from(new Set(dirs.map((dir) => dir.trim()).filter(Boolean)));
      if (trimmedDirs.length === 0) return new Map();
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      const nextLinkedDirs = [...existing];
      const trackedByDir = new Map<string, TrackedWorkspaceLinkedDir | null>();
      let changed = false;
      for (const trimmed of trimmedDirs) {
        if (nextLinkedDirs.includes(trimmed)) {
          const ownedByWorkspaceContext = Object.values(workspaceLinkedDirAdds).some(
            (tracked) => tracked.dir === trimmed,
          );
          trackedByDir.set(trimmed, ownedByWorkspaceContext ? { dir: trimmed, previousLinkedDirs: existing } : null);
          continue;
        }
        nextLinkedDirs.push(trimmed);
        trackedByDir.set(trimmed, { dir: trimmed, previousLinkedDirs: existing });
        changed = true;
      }
      if (changed) {
        const metadata: ProjectMetadata = { ...base, linkedDirs: nextLinkedDirs };
        const result = await patchProject(projectId, { metadata }, workspaceContext);
        if (!result?.metadata) {
          onShowToast?.(t('homeWorkingDir.applyFailed'));
          return false;
        }
        onProjectMetadataChange?.(result);
        for (const trimmed of trimmedDirs) void rememberRecentDir(trimmed);
      }
      return trackedByDir;
    }

    async function addLinkedDir(dir: string): Promise<TrackedWorkspaceLinkedDir | null | false> {
      const trackedByDir = await addLinkedDirs([dir]);
      if (trackedByDir === false) return false;
      return trackedByDir.get(dir.trim()) ?? null;
    }

    async function handleReferenceProjects(selections: ProjectReferenceSelection[]) {
      const items = selections.map(({ project, resolvedDir }) => {
        const path = resolvedDir.trim();
        return {
          id: `project:${project.id}`,
          kind: 'project',
          label: project.name || project.id,
          title: project.name || project.id,
          path: project.id,
          ...(path ? { absolutePath: path } : {}),
        } satisfies WorkspaceContextItem;
      });
      const trackedByDir = await addLinkedDirs(items.map((item) => workspaceContextLinkedDir(item) ?? ''));
      if (trackedByDir === false) {
        trackContextLinkResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          context_kind: 'project',
          result: 'failed',
          count: items.length,
          ...(projectId ? { project_id: projectId } : {}),
        });
        return;
      }
      for (const item of items) {
        appendWorkspacePrompt(item);
      }
      setProjectReferenceOpen(false);
      trackContextLinkResult(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_composer',
        context_kind: 'project',
        result: 'success',
        count: items.length,
        ...(projectId ? { project_id: projectId } : {}),
      });
      const trackedAdds: Record<string, TrackedWorkspaceLinkedDir> = {};
      for (const item of items) {
        const path = workspaceContextLinkedDir(item);
        const trackedLinkedDir = path ? trackedByDir.get(path) ?? null : null;
        if (trackedLinkedDir) trackedAdds[item.id] = trackedLinkedDir;
      }
      if (Object.keys(trackedAdds).length > 0) {
        setWorkspaceLinkedDirAdds((current) => ({ ...current, ...trackedAdds }));
      }
    }

    async function handleLinkLocalCodeContext() {
      const selected = await openFolderDialog();
      if (!selected) {
        trackContextLinkResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          context_kind: 'local_code',
          result: 'cancelled',
          ...(projectId ? { project_id: projectId } : {}),
        });
        return;
      }
      const trackedLinkedDir = await addLinkedDir(selected);
      if (trackedLinkedDir === false) {
        trackContextLinkResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          context_kind: 'local_code',
          result: 'failed',
          ...(projectId ? { project_id: projectId } : {}),
        });
        return;
      }
      const label = selected.split(/[/\\]/).filter(Boolean).pop() || selected;
      const item: WorkspaceContextItem = {
        id: `local-code:${selected}`,
        kind: 'local-code',
        label,
        title: label,
        absolutePath: selected,
      };
      appendWorkspacePrompt(item);
      if (trackedLinkedDir) {
        setWorkspaceLinkedDirAdds((current) => ({ ...current, [item.id]: trackedLinkedDir }));
      }
      trackContextLinkResult(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_composer',
        context_kind: 'local_code',
        result: 'success',
        count: 1,
        ...(projectId ? { project_id: projectId } : {}),
      });
    }

    async function insertSkillMention(skill: SkillSummary) {
      const applied = await applyProjectSkill(skill);
      if (!applied) return;
      // Stage the skill so it rides this turn's skillIds, then insert an
      // atomic `@<name>` pill carrying the skill's real id. The onChange
      // prune keys on `skill:<id>` being present in the editor text, so the
      // chip survives until the user deletes the pill.
      setStagedSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
      );
      editorRef.current?.insertMention({
        token: inlineMentionToken(skill.name),
        entity: { id: skill.id, kind: 'skill', label: skill.name },
      });
      setMention(null);
    }

    function stageSkillForCurrentTurn(skill: SkillSummary) {
      setStagedSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
      );
    }

    function applyDesignToolboxPrompt(
      prompt: string,
      skill: SkillSummary | null,
    ) {
      const nextPrompt = skill
        ? `${inlineMentionToken(skill.name)}\n${prompt}`
        : prompt;
      if (skill) stageSkillForCurrentTurn(skill);
      applyDesignToolboxDraft(nextPrompt);
    }

    function applyDesignToolboxDraft(prompt: string) {
      replaceEditorDraft(prompt);
      editorRef.current?.focus();
    }

    // Fills the fixed page/area/project context for the rest of the composer
    // bottom bar (plus menu, design-system / working-dir switch, agent
    // selector, context-chip removal).
    const trackComposerBar = (
      fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>,
    ) => {
      trackComposerBarClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_composer',
        ...(projectId ? { project_id: projectId } : {}),
        ...fields,
      });
    };

    // Fills the fixed page/area/project context so toolbox call sites only
    // pass the event-specific fields (element + ids).
    const trackDesignToolbox = (
      fields: Omit<DesignToolboxClickProps, 'page_name' | 'area' | 'project_id'>,
    ) => {
      trackDesignToolboxClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_composer',
        ...(projectId ? { project_id: projectId } : {}),
        ...fields,
      });
    };

    // Every toolbox resource carries a common `kind` + `id`, and the tracking
    // enum mirrors `DesignToolboxResourceKind` exactly, so this is a direct
    // projection.
    function designToolboxResourceTracking(resource: DesignToolboxResource): {
      resource_kind: NonNullable<DesignToolboxClickProps['resource_kind']>;
      resource_id: string;
    } {
      return { resource_kind: resource.kind, resource_id: resource.id };
    }

    function applyDesignToolboxAction(action: DesignToolboxAction) {
      const skill = findDesignToolboxSkill(action, skills);
      applyDesignToolboxPrompt(
        designToolboxActionPrompt({
          action,
          skill,
          workspaceItem: visibleWorkspaceContext,
          activeDraft: draft,
          resourceIndex: designToolboxResourceIndex,
          t,
        }),
        skill,
      );
    }
    // Recreated each render, so this captures the latest draft/context closure
    // for the imperative handle (see applyDesignToolboxActionRef).
    applyDesignToolboxActionRef.current = applyDesignToolboxAction;

    function applyDesignToolboxSkill(skill: SkillSummary) {
      applyDesignToolboxPrompt(
        designToolboxSkillPrompt({
          skill,
          workspaceItem: visibleWorkspaceContext,
          activeDraft: draft,
          resourceIndex: designToolboxResourceIndex,
          t,
        }),
        skill,
      );
    }
    // Latest-closure bridge for the imperative handle (see the ref declaration).
    applyDesignToolboxSkillByIdRef.current = (skillId: string) => {
      const skill = skills.find((s) => s.id === skillId);
      if (skill) applyDesignToolboxSkill(skill);
    };

    function applyDesignToolboxResource(resource: DesignToolboxResource) {
      if (resource.kind === 'skill') {
        applyDesignToolboxSkill(resource.skill);
        return;
      }

      const prompt = designToolboxResourcePrompt({
        resource,
        workspaceItem: visibleWorkspaceContext,
        activeDraft: draft,
        resourceIndex: designToolboxResourceIndex,
        t,
      });

      if (resource.kind === 'plugin') {
        void (async () => {
          inlineBackedPluginRef.current = {
            id: resource.plugin.id,
            label: resource.plugin.title,
          };
          await pluginsSectionRef.current?.applyById(resource.plugin.id, resource.plugin);
          applyDesignToolboxDraft(`${inlineMentionToken(resource.plugin.title)}\n${prompt}`);
        })();
        return;
      }

      if (resource.kind === 'mcp') {
        const label = resource.server.label || resource.server.id;
        setStagedMcpServers((current) =>
          current.some((item) => item.id === resource.server.id)
            ? current
            : [...current, resource.server],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(label)}\n${prompt}`);
        return;
      }

      if (resource.kind === 'connector') {
        setStagedConnectors((current) =>
          current.some((item) => item.id === resource.connector.id)
            ? current
            : [...current, resource.connector],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(resource.connector.name)}\n${prompt}`);
        return;
      }

      if (resource.kind === 'file') {
        const path = resource.file.path ?? resource.file.name;
        appendContextAttachment(path);
        applyDesignToolboxDraft(`${inlineMentionToken(path)}\n${prompt}`);
        return;
      }

      applyDesignToolboxDraft(prompt);
    }

    function removeStagedSkill(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'skill', resource_id: id });
      const skill = stagedSkills.find((s) => s.id === id) ?? null;
      setStagedSkills((prev) => prev.filter((s) => s.id !== id));
      const labels = [id, skill?.name ?? ''];
      replaceEditorDraft(stripInlineMentionLabels(draft, labels));
    }

    function removeStagedMcpServer(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'mcp', resource_id: id });
      const server = stagedMcpServers.find((item) => item.id === id) ?? null;
      setStagedMcpServers((prev) => prev.filter((item) => item.id !== id));
      replaceEditorDraft(stripInlineMentionLabels(draft, [
        id,
        server?.label ?? '',
      ]));
    }

    function removeStagedConnector(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'connector', resource_id: id });
      const connector = stagedConnectors.find((item) => item.id === id) ?? null;
      setStagedConnectors((prev) => prev.filter((item) => item.id !== id));
      replaceEditorDraft(stripInlineMentionLabels(draft, [
        id,
        connector?.name ?? '',
      ]));
    }

    function workspaceContextDirStillReferenced(id: string, dir: string): boolean {
      return Object.entries(workspaceLinkedDirAdds).some(
        ([candidateId, candidate]) => candidateId !== id && candidate.dir === dir,
      ) || selectedWorkspaceContexts.some((item) => (
        item.id !== id && workspaceContextLinkedDir(item) === dir
      )) || workingDir === dir;
    }

    async function removeTrackedWorkspaceLinkedDir(
      id: string,
      tracked: TrackedWorkspaceLinkedDir,
    ): Promise<boolean> {
      if (!projectId) return true;
      if (workspaceContextDirStillReferenced(id, tracked.dir)) {
        setWorkspaceLinkedDirAdds((current) => {
          const { [id]: _removed, ...rest } = current;
          return rest;
        });
        return true;
      }
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const currentLinkedDirs = base.linkedDirs ?? [...tracked.previousLinkedDirs, tracked.dir];
      const nextLinkedDirs = currentLinkedDirs.filter((dir) => dir !== tracked.dir);
      const metadata: ProjectMetadata = { ...base, linkedDirs: nextLinkedDirs };
      const result = await patchProject(projectId, { metadata }, workspaceContext);
      if (!result?.metadata) {
        onShowToast?.(t('homeWorkingDir.applyFailed'));
        return false;
      }
      onProjectMetadataChange?.(result);
      setWorkspaceLinkedDirAdds((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      return true;
    }

    async function removeWorkspaceContext(id: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'workspace', resource_id: id });
      const workspaceItem = selectedWorkspaceContexts.find((item) => item.id === id) ?? null;
      const trackedLinkedDir = workspaceLinkedDirAdds[id] ?? null;
      if (trackedLinkedDir && !(await removeTrackedWorkspaceLinkedDir(id, trackedLinkedDir))) {
        return;
      }
      if (visibleWorkspaceContext?.id === id) setDismissedWorkspaceContextId(id);
      setStagedWorkspaceContexts((prev) => prev.filter((item) => item.id !== id));
      if (!trackedLinkedDir) {
        setWorkspaceLinkedDirAdds((current) => {
          const { [id]: _removed, ...rest } = current;
          return rest;
        });
      }
      if (workspaceItem) {
        replaceEditorDraft(stripInlineMentionLabels(draftRef.current, [
          workspaceItem.label,
          workspaceItem.id,
          workspaceItem.title ?? '',
          workspaceItem.path ?? '',
          workspaceItem.absolutePath ?? '',
          workspaceItem.url ?? '',
        ]));
      }
    }

    async function ensureProject(): Promise<string | null> {
      if (projectId) return projectId;
      return onEnsureProject();
    }

    /* ── 逐文件上传(设计稿 #61 / #63)────────────────────────────────
     *
     * 原来这里是**原子**的:一次 `uploadProjectFiles(id, files)` 打包发,成功之后
     * 芯片才出现。于是上传的那几秒界面上一张卡都没有,失败也只有一行全局提示 ——
     * 哪个文件没传上去、能不能只重发那一个,都说不出来。
     *
     * 现在**一个文件一个请求**。`uploadProjectFiles` 本来就收 `File[]`,给它一个
     * 长度为 1 的数组走的是同一个端点、同一份契约 —— 后端和 `packages/contracts`
     * 都不用动,换来的是失败能落到具体那张卡上(原来只有 `failed[].name`,
     * 同名文件根本对不回去)。
     *
     * 代价是请求数从 ⌈N/12⌉ 变成 N,所以并发限到 `STAGED_UPLOAD_CONCURRENCY`。
     */
    function stageOnePendingUpload(file: File, order: number): PendingUpload {
      pendingSeqRef.current += 1;
      const id = `pu-${pendingSeqRef.current}`;
      const kind = looksLikeImageName(file.name, file.type) ? 'image' as const : 'file' as const;
      // 本地缩略图只为上传的那几秒服务;拿不到(jsdom / 老浏览器)就退回灰底占位。
      let previewUrl: string | null = null;
      if (kind === 'image' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          previewUrl = null;
        }
      }
      pendingFilesRef.current.set(id, { file, previewUrl });
      return {
        id,
        name: file.name,
        kind,
        ...(Number.isFinite(file.size) ? { size: file.size } : {}),
        order,
        state: 'uploading',
        ...(previewUrl ? { previewUrl } : {}),
      };
    }

    function releasePendingUpload(id: string) {
      const entry = pendingFilesRef.current.get(id);
      if (entry?.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(entry.previewUrl);
        } catch {
          /* 已经撤过或环境不支持 —— 撤不掉不影响功能 */
        }
      }
      pendingFilesRef.current.delete(id);
    }

    function dropPendingUpload(id: string) {
      releasePendingUpload(id);
      setPendingUploads((current) => current.filter((item) => item.id !== id));
    }

    /**
     * 传一个文件。传成功就把占位卡换成真附件(**同一个 `order`**,所以它落回
     * 用户当初挑的那个位置,不因为先传完而插队);失败就把卡留在托盘里标红,
     * 等人点重试或者「×」。
     */
    async function runOnePendingUpload(
      projectIdForUpload: string,
      entry: PendingUpload,
    ): Promise<{ ok: boolean; error?: string }> {
      const local = pendingFilesRef.current.get(entry.id);
      // 人在这一轮里已经把卡「×」掉了 —— 别再把结果塞回托盘。
      if (!local) return { ok: true };
      try {
        const result = await uploadProjectFiles(
          projectIdForUpload,
          [local.file],
          undefined,
          workspaceContext,
        );
        const uploaded = result.uploaded[0];
        // 人在等结果的这几秒里把卡撤了,结果就地丢掉(文件本身已经落到项目里,
        // 和「传完再点×」是同一个语义 —— 不进待发列表,也不回删)。
        if (!pendingFilesRef.current.has(entry.id)) return { ok: Boolean(uploaded) };
        if (uploaded) {
          appendOrderedStagedAttachments([{ ...uploaded, order: entry.order }]);
          dropPendingUpload(entry.id);
          return { ok: true };
        }
        const detail = result.error ?? result.failed[0]?.error;
        setPendingUploads((current) =>
          current.map((item) => (item.id === entry.id ? { ...item, state: 'failed' } : item)),
        );
        return { ok: false, ...(detail ? { error: detail } : {}) };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        if (pendingFilesRef.current.has(entry.id)) {
          setPendingUploads((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, state: 'failed' } : item)),
          );
        }
        return { ok: false, error: detail };
      }
    }

    /** 只重发这一个文件。本地 `File` 还在 `pendingFilesRef` 里,失败时没有清掉。 */
    async function retryPendingUpload(pendingId: string) {
      const target = pendingUploads.find((item) => item.id === pendingId);
      if (!target || !pendingFilesRef.current.has(pendingId)) return;
      const id = await ensureProject();
      if (!id) return;
      setUploadError(null);
      setPendingUploads((current) =>
        current.map((item) => (item.id === pendingId ? { ...item, state: 'uploading' } : item)),
      );
      await runOnePendingUpload(id, { ...target, state: 'uploading' });
    }

    async function uploadFiles(files: File[]) {
      if (files.length === 0) return;
      const id = await ensureProject();
      if (!id) return;
      setUploading(true);
      setUploadError(null);
      // Cohort math is identical to the Design Files Upload button; see
      // `analytics/upload-tracking.ts`. v2 doc fires one
      // file_upload_result per surface so this path reports
      // `page_name='chat_panel'` / `area='chat_composer'`.
      const cohort = deriveUploadCohort(files);
      const orderStart = reserveAttachmentOrders(files.length);
      try {
        const entries = files.map((file, index) => stageOnePendingUpload(file, orderStart + index));
        setPendingUploads((current) => [...current, ...entries]);
        const outcomes = await runWithConcurrency(
          entries,
          STAGED_UPLOAD_CONCURRENCY,
          (entry) => runOnePendingUpload(id, entry),
        );
        const failures = outcomes.filter((outcome) => !outcome.ok);
        const partial = failures.length > 0;
        if (partial) {
          // 全局那一行提示【保留】。稿子里没有它 —— 稿子把失败全交给卡片上的
          // 「重试」,可那一格只画了图卡(S13:文档宽卡的失败态没画,「重试」放哪
          // 没说)。在设计补上那一态之前,文档卡失败就只剩这一行能说话,
          // 收掉它等于让「.txt 传失败」变成完全无声。
          const failedCount = failures.length;
          const uploadedCount = outcomes.length - failedCount;
          const firstFailure = failures.find((outcome) => outcome.error)?.error;
          const detail = firstFailure ? ` (${firstFailure})` : '';
          setUploadError(
            uploadedCount > 0
              ? t('questions.uploadPartialFailed', { uploaded: uploadedCount, failed: failedCount }) + detail
              : t('questions.uploadFailed', { failed: failedCount }) + detail,
          );
          console.warn('Some attachments failed to upload', failures);
        }
        // 埋点仍然是**一次挑文件一条事件**(v2 文档的口径),不随请求数变成 N 条。
        const firstError = failures.find((outcome) => outcome.error)?.error;
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: partial ? 'failed' : 'success',
          ...(partial && firstError ? { error_code: firstError } : {}),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadError(`${t('chat.annotationUploadFailed')} (${detail})`);
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: 'failed',
          error_code: detail,
        });
      } finally {
        setUploading(false);
      }
    }

    // "Select from library" (资源库): copy each chosen asset into the project's
    // design files and stage it as an attachment chip, mirroring how the native
    // file picker materializes uploads into the project on attach. The apply
    // call records a provenance back-link so the registry knows the asset was
    // consumed.
    async function addAssetsFromLibrary(assets: LibraryAsset[]) {
      if (assets.length === 0) return;
      const id = await ensureProject();
      if (!id) return;
      setUploading(true);
      setUploadError(null);
      const orderStart = reserveAttachmentOrders(assets.length);
      try {
        const applied: ChatAttachment[] = [];
        // Element-pick captures carry their picked node's markup; collect it so
        // we can drop the HTML straight into the composer input (the image still
        // attaches as a normal reference).
        const elementBlocks: string[] = [];
        let failed = 0;
        for (const asset of assets) {
          const res = await applyLibraryAsset(
            asset.id,
            id,
            undefined,
            undefined,
            workspaceContext,
          );
          if (!res?.relPath) {
            failed += 1;
            continue;
          }
          applied.push({
            path: res.relPath,
            name: assetTitle(asset),
            kind: asset.kind === 'image' ? 'image' : 'file',
          });
          const element = elementMetaOf(asset);
          if (element?.hasHtml) {
            const html = await fetchLibraryAssetElementHtml(asset.id);
            if (html) elementBlocks.push(formatElementHtmlBlock(asset, element, html));
          }
        }
        if (applied.length > 0) {
          appendOrderedStagedAttachments(assignChatAttachmentOrders(applied, orderStart));
        }
        if (elementBlocks.length > 0) {
          const existing = editorRef.current?.getText() ?? '';
          editorRef.current?.insertText((existing.trim() ? '\n\n' : '') + elementBlocks.join('\n\n'));
          editorRef.current?.focus();
        }
        if (failed > 0) {
          setUploadError(
            applied.length > 0
              ? `Added ${applied.length} item(s), but ${failed} failed.`
              : `Could not add ${failed} item(s) from the library.`,
          );
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadError(`Could not add from library (${detail}).`);
      } finally {
        setUploading(false);
      }
    }

    async function uploadClipboardImagesFromAsyncClipboard() {
      if (!navigator.clipboard?.read) return false;
      try {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        const stamp = Date.now();
        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (!imageType) continue;
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
          files.push(new File([blob], `clipboard-screenshot-${stamp}.${extension}`, { type: imageType }));
        }
        if (files.length === 0) return false;
        await uploadFiles(files);
        return true;
      } catch (err) {
        console.warn('Could not read image from clipboard', err);
        return false;
      }
    }

    useEffect(() => {
      function onAnnotation(e: Event) {
        const detail = (e as CustomEvent<AnnotationEventDetail>).detail;
        if (!detail) return;
        void (async () => {
          let acked = false;
          const ack = (result: { ok: boolean; message?: string }) => {
            if (acked) return;
            acked = true;
            detail.ack?.(result);
          };
          let uploaded: ChatAttachment[] = [];
          let visualAttachmentInput: Parameters<typeof buildVisualAnnotationAttachment>[0] | null = null;
          let visualAttachment: ChatCommentAttachment | null = null;
          try {
            // Upload the annotation screenshot together with any images the
            // user attached in the markup composer. The screenshot (when
            // present) is first so it keeps backing the structured visual
            // comment; the rest ride along as ordinary chat attachments.
            const annotationFiles = [detail.file, ...(detail.extraFiles ?? [])].filter(
              (f): f is File => Boolean(f),
            );
            if (annotationFiles.length > 0) {
              const orderStart = reserveAttachmentOrders(annotationFiles.length);
              const id = await ensureProject();
              if (!id) {
                ack({ ok: false, message: t('chat.annotationProjectCreateFailed') });
                return;
              }
              setUploading(true);
              const result = await uploadProjectFiles(id, annotationFiles, undefined, workspaceContext);
              if (result.uploaded.length > 0) {
                uploaded = assignChatAttachmentOrders(result.uploaded, orderStart);
              }
              if (result.failed.length > 0) {
                const detailText = result.error ? ` (${result.error})` : '';
                setUploadError(t('questions.uploadFailed', { failed: result.failed.length }) + detailText);
                if (uploaded.length === 0) {
                  ack({ ok: false, message: t('chat.annotationUploadFailed') });
                  return;
                }
              }
            }
            // The structured visual comment is built whenever the mark has a
            // location, with or without the screenshot upload. When the
            // preview capture failed (#4080) the screenshot is absent, but
            // file/bounds/markKind still anchor the marked region for the
            // agent (#4084) — dropping them would reduce the send to bare
            // prose and force the agent to guess what "this part" means.
            if (detail.markKind && detail.bounds) {
              const screenshot = detail.file && uploaded.length > 0 ? uploaded[0] : null;
              visualAttachmentInput = {
                order: screenshot && isFiniteAttachmentOrder(screenshot.order) ? screenshot.order : 1,
                idSeed: screenshot?.path
                  ?? `${detail.filePath || 'preview'}-${detail.markKind}-${Math.round(detail.bounds.x * 1000)}-${Math.round(detail.bounds.y * 1000)}`,
                ...(screenshot ? { screenshotPath: screenshot.path } : {}),
                markKind: detail.markKind,
                note: detail.note,
                bounds: detail.bounds,
                target: detail.target
                  ? {
                      filePath: detail.target.filePath || detail.filePath || screenshot?.path || '',
                      elementId: detail.target.elementId,
                      selector: detail.target.selector,
                      label: detail.target.label,
                      text: detail.target.text,
                      position: detail.target.position,
                      htmlHint: detail.target.htmlHint,
                    }
                  : {
                      filePath: detail.filePath || screenshot?.path || '',
                      position: detail.bounds,
                    },
              };
            }
            setUploading(false);

            const appendAnnotationToComposer = () => {
              if (uploaded.length > 0) {
                appendOrderedStagedAttachments(uploaded);
              }
              if (visualAttachmentInput) {
                setStagedVisualComments((current) => [
                  ...current,
                  buildVisualAnnotationAttachment({
                    ...visualAttachmentInput!,
                  }),
                ]);
              }
              if (detail.note) {
                // Accumulate through draftRef so two annotations resolving
                // concurrently compose (each reads the other's write) instead
                // of both starting from the same stale closure. Mirror the
                // result into the editor with setText so the now-non-empty
                // editor does not fire an onChange('') that would clobber the
                // accumulated draft back to empty.
                const nextDraft = draftRef.current
                  ? `${draftRef.current}\n${detail.note}`
                  : detail.note;
                draftRef.current = nextDraft;
                setDraft(nextDraft);
                editorRef.current?.setText(nextDraft);
              }
              editorRef.current?.focus();
            };

            if (detail.action === 'queue') {
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                });
              }
              // 引文前缀走共用的那一处 —— 标注面板发出去的这一发同样会清掉芯片,
              // 不折进去就是「清空了但没带走」(OPEND-2551)。
              const prompt = composeOutgoingPrompt([draft.trim(), detail.note].filter(Boolean).join('\n'));
              const attachments = sortChatAttachmentsByOrder([...staged, ...uploaded]);
              const nextCommentAttachments = currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
              // Mark draw-overlay → run: tag entry_from='mark' so the dashboard
              // separates annotation-driven runs from plain composer sends.
              sendComposedTurn(prompt, attachments, nextCommentAttachments, { ...queueMeta(currentRunContextMeta()), entryFrom: 'mark' });
              ack({ ok: true });
              return;
            }

            if (detail.action === 'send') {
              if (streaming) {
                appendAnnotationToComposer();
                // Carry entry_from='mark' through the deferred send so the
                // flush effect below reports the run as a Mark annotation
                // rather than the default composer entry.
                streamingAnnotationSendEntryFromRef.current = 'mark';
                setStreamingAnnotationSendPending(true);
                ack({ ok: true });
                return;
              }
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                });
              }
              // 引文前缀走共用的那一处 —— 标注面板发出去的这一发同样会清掉芯片,
              // 不折进去就是「清空了但没带走」(OPEND-2551)。
              const prompt = composeOutgoingPrompt([draft.trim(), detail.note].filter(Boolean).join('\n'));
              const attachments = sortChatAttachmentsByOrder([...staged, ...uploaded]);
              const nextCommentAttachments = currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
              // Mark draw-overlay → run: tag entry_from='mark' so the dashboard
              // separates annotation-driven runs from plain composer sends.
              sendComposedTurn(prompt, attachments, nextCommentAttachments, { ...currentRunContextMeta(), entryFrom: 'mark' });
              ack({ ok: true });
              return;
            }

            if (detail.action === 'draft') {
              appendAnnotationToComposer();
              ack({ ok: true });
              return;
            }

            ack({ ok: false, message: t('chat.annotationFailed') });
          } catch (err) {
            console.warn('Could not send annotation', err);
            setUploadError(err instanceof Error ? err.message : t('chat.annotationFailed'));
            ack({ ok: false, message: t('chat.annotationFailed') });
          } finally {
            setUploading(false);
          }
        })();
      }
      window.addEventListener(ANNOTATION_EVENT, onAnnotation);
      return () => window.removeEventListener(ANNOTATION_EVENT, onAnnotation);
    }, [
      commentAttachments,
      draft,
      onSend,
      projectId,
      // 引用要折进这条路发出去的正文,闭包必须拿到当下这一份。
      quotes,
      selectedWorkspaceContexts,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      t,
    ]);

    // Stages attachments that a surface already uploaded to the project itself
    // (ChatAttachment shape, not File) — e.g. the design browser's hover
    // "添加到对话" capture, which writes the PNG via writeProjectBase64File
    // before notifying the composer. Mirrors ANNOTATION_EVENT's pattern above.
    useEffect(() => {
      function onStageAttachment(e: Event) {
        const detail = (e as CustomEvent<StageAttachmentEventDetail>).detail;
        const attachments = detail?.attachments?.filter(
          (item): item is ChatAttachment => Boolean(item && item.path && item.name),
        );
        if (!attachments || attachments.length === 0) return;
        const orderStart = reserveAttachmentOrders(attachments.length);
        appendOrderedStagedAttachments(assignChatAttachmentOrders(attachments, orderStart));
        editorRef.current?.focus();
      }
      window.addEventListener(STAGE_ATTACHMENT_EVENT, onStageAttachment);
      return () => window.removeEventListener(STAGE_ATTACHMENT_EVENT, onStageAttachment);
    }, [staged]);

    useEffect(() => {
      if (!streamingAnnotationSendPending || !streamingAnnotationSendPendingRef.current) return;
      if (streaming || sendDisabled) return;
      // Read the ref, not the closed-over `draft`: the accumulating annotation
      // handler writes draftRef synchronously, so the ref is authoritative even
      // if this effect's render closure predates the last accumulation.
      const prompt = composeOutgoingPrompt(draftRef.current.trim());
      // Consume the entry_from captured when the send was deferred (Mark
      // draw-overlay sets 'mark'); clear it so a later plain send is unaffected.
      const pendingEntryFrom = streamingAnnotationSendEntryFromRef.current;
      streamingAnnotationSendEntryFromRef.current = undefined;
      const baseMeta = currentRunContextMeta();
      const meta = pendingEntryFrom ? { ...baseMeta, entryFrom: pendingEntryFrom } : baseMeta;
      sendComposedTurn(prompt, staged, currentCommentAttachments(), meta);
    }, [
      commentAttachments,
      draft,
      onSend,
      // 同上:延迟发的那一发也要带上此刻的引用。
      quotes,
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

    // Paste handler invoked by the editor's PastePlugin. `files` are the items
    // the clipboard exposed synchronously; when empty we fall back to the
    // async Clipboard API to recover pasted screenshots that some browsers
    // only surface through `navigator.clipboard.read()`.
    function handlePasteFiles(files: File[]) {
      if (files.length > 0) {
        void uploadFiles(files);
        return;
      }
      void uploadClipboardImagesFromAsyncClipboard();
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      // Chromium exposes dropped directories as zero-byte `File` objects in
      // `dataTransfer.files`. Appending one to FormData makes Electron try to
      // read the directory as a file, which raises EISDIR in the main process
      // before the renderer's fetch promise can report a normal upload error.
      // Inspect the richer item entry first and never hand a directory to the
      // multipart stack.
      if (dataTransferContainsDirectory(e.dataTransfer)) {
        setUploadError(t('chat.attachmentFolderUnsupported'));
        return;
      }
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFiles(files);
    }

    // Dragging the shell's gray backdrop (not its children) vertically
    // resizes the editor: up = taller. Dragging back at/below the default
    // height clears the override and returns to auto-grow.
    function handleShellResizeMouseDown(e: React.MouseEvent<HTMLDivElement>) {
      if (e.target !== e.currentTarget) return;
      if (e.button !== 0) return;
      const editorEl = e.currentTarget.querySelector<HTMLElement>('.composer-input-editor');
      if (!editorEl) return;
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = editorEl.getBoundingClientRect().height;
      const DEFAULT_MIN = 72;
      const onMove = (ev: MouseEvent) => {
        const delta = startY - ev.clientY;
        const max = Math.round(window.innerHeight * 0.6);
        const next = Math.min(max, Math.max(DEFAULT_MIN, Math.round(startHeight + delta)));
        setManualEditorHeight(next <= DEFAULT_MIN + 4 ? null : next);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
      };
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }

    async function handleLinkFolder() {
      if (!projectId) return;
      const selected = await openFolderDialog();
      if (!selected) return;
      await addLinkedDir(selected);
    }

    function linkedDirsWithWorkspaceContext(primaryDir: string | null): string[] {
      const primary = primaryDir?.trim();
      const contextDirs = primary
        ? workspaceContextMetadataLinkedDirList.filter((dir) => dir !== primary)
        : workspaceContextMetadataLinkedDirList;
      return Array.from(new Set([
        ...(primary ? [primary] : []),
        ...contextDirs,
      ]));
    }

    // The WorkingDirPicker treats the project's working directory as a single
    // primary folder, so selecting one replaces the primary `linkedDirs` entry
    // while preserving staged workspace-context dirs. The folder is read-only
    // awareness for the agent (→ `--add-dir`), not a Design Files import, and
    // `baseDir` is never touched.
    async function setWorkingDirFolder(dir: string) {
      if (!projectId) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const metadata: ProjectMetadata = {
        ...base,
        linkedDirs: linkedDirsWithWorkspaceContext(dir),
      };
      const result = await patchProject(projectId, { metadata }, workspaceContext);
      // The daemon rejects stale/inaccessible/system dirs with
      // INVALID_LINKED_DIR (patchProject → null). Only commit the selection
      // and promote it in recents when the project accepted it; otherwise
      // surface the failure and leave recents untouched so a rejected path
      // isn't re-promoted to the top of the menu.
      if (!result?.metadata) {
        onShowToast?.(t('homeWorkingDir.applyFailed'));
        return;
      }
      onProjectMetadataChange?.(result);
      const promotedDir = dir.trim();
      setPromotedWorkspaceContextDir(
        selectedWorkspaceContextDirs.includes(promotedDir) ? promotedDir : null,
      );
      setWorkspaceLinkedDirAdds((current) => {
        const nextEntries = Object.entries(current).filter(([, tracked]) => (
          tracked.dir !== promotedDir
        ));
        return nextEntries.length === Object.keys(current).length
          ? current
          : Object.fromEntries(nextEntries);
      });
      void rememberRecentDir(dir);
    }
    async function handlePickWorkingDir() {
      const selected = await openFolderDialog();
      if (selected) await setWorkingDirFolder(selected);
    }
    async function clearWorkingDir() {
      if (!projectId) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const metadata: ProjectMetadata = {
        ...base,
        linkedDirs: linkedDirsWithWorkspaceContext(null),
      };
      const result = await patchProject(projectId, { metadata }, workspaceContext);
      if (result?.metadata) {
        setPromotedWorkspaceContextDir(null);
        onProjectMetadataChange?.(result);
      }
    }

    // Lexical drives every text change through this callback. `present` is the
    // entity list the editor's text currently references (MentionNodes plus
    // plain `@token`s matched against composerMentionEntities, deduped by
    // kind:id). We prune the staged skill/mcp/connector chips to whatever the
    // text still references — generalizing the old skill-only regex prune so a
    // hand-deleted token also drops its chip and never leaks into the run
    // context. Workspace contexts that added linked dirs are kept visible until
    // the chip remove button clears the matching metadata access. `staged`
    // (files) is intentionally NOT pruned: users attach files via the upload
    // button without leaving an `@<path>` token.
    function handleEditorChange(text: string, present: InlineMentionEntity[]) {
      draftRef.current = text;
      setDraft(text);
      const set = new Set(present.map((e) => `${e.kind}:${e.id}`));
      if (
        activeAppliedPlugin
        && inlineBackedPluginRef.current?.id === activeAppliedPlugin.pluginId
        && !set.has(`plugin:${activeAppliedPlugin.pluginId}`)
        && !mentionTokenPresent(text, inlineBackedPluginRef.current.label)
      ) {
        inlineBackedPluginRef.current = null;
        pluginsSectionRef.current?.clear();
      }
      setStagedSkills((prev) => prev.filter((s) => set.has(`skill:${s.id}`)));
      setStagedMcpServers((prev) => prev.filter((m) => set.has(`mcp:${m.id}`)));
      setStagedConnectors((prev) =>
        prev.filter((c) => set.has(`connector:${c.id}`)),
      );
      setStagedWorkspaceContexts((prev) =>
        prev.filter((item) => set.has(`workspace:${item.id}`) || Boolean(workspaceLinkedDirAdds[item.id])),
      );
    }

    // Lexical reports the active @/slash trigger derived from the caret. The
    // mention popover state collapses to `{ q }`; the slash state replicates
    // the old detection effect (reset the keyboard index on open). IME
    // suppression already happened in the editor (it bails while composing).
    function handleEditorTrigger({
      mention: nextMention,
      slash: nextSlash,
      anchorRect,
    }: {
      mention: { q: string } | null;
      slash: { q: string } | null;
      anchorRect: CaretRect | null;
    }) {
      setCaretRect(anchorRect);
      if (nextMention && !mention) {
        setMentionTab('all');
      } else if (!nextMention) {
        setMentionTab('all');
      }
      setMention((prev) => {
        // Reset the active row only when the query identity changes (mirror of
        // the slash reset) so re-renders from unrelated state don't snap it.
        if (nextMention && (!prev || prev.q !== nextMention.q)) setMentionIndex(0);
        return nextMention;
      });
      if (nextSlash) {
        setSlash(nextSlash);
        setSlashIndex(0);
      } else {
        setSlash(null);
      }
    }

    // Routes popover navigation keys lifted verbatim from the old textarea
    // onKeyDown. Returns true when the key was consumed so the editor can
    // preventDefault; false lets the editor handle it normally (e.g. plain
    // arrow keys when no popover is open).
    function handlePopoverKey(
      key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
    ): boolean {
      if (slash && filteredSlash.length > 0) {
        if (key === 'ArrowDown') {
          setSlashIndex((i) => (i + 1) % filteredSlash.length);
          return true;
        }
        if (key === 'ArrowUp') {
          setSlashIndex(
            (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
          );
          return true;
        }
        if (key === 'Tab' || key === 'Enter') {
          const safe = Math.min(slashIndex, filteredSlash.length - 1);
          pickSlash(filteredSlash[safe]!);
          return true;
        }
        if (key === 'Escape') {
          setSlash(null);
          return true;
        }
      }
      if (mention && key === 'Escape') {
        setMention(null);
        return true;
      }
      if (mention) {
        // Drive a single index over the visible section union. MentionPopover
        // renders the same files-first section order and highlights the
        // matching row from activeIndex.
        const showFiles = mentionTab === 'all' || mentionTab === 'files';
        const showTabs = mentionTab === 'all' || mentionTab === 'tabs';
        const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
        const showSkills = mentionTab === 'all' || mentionTab === 'skills';
        const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
        const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
        const total =
          (showFiles ? filteredFiles.length : 0) +
          (showTabs ? filteredWorkspaceContexts.length : 0) +
          (showPlugins ? filteredPlugins.length : 0) +
          (showSkills ? filteredSkills.length : 0) +
          (showMcp ? filteredMcpServers.length : 0) +
          (showConnectors ? filteredConnectors.length : 0);
        if (total > 0) {
          if (key === 'ArrowDown') {
            setMentionIndex((i) => (i + 1) % total);
            return true;
          }
          if (key === 'ArrowUp') {
            setMentionIndex((i) => (i - 1 + total) % total);
            return true;
          }
          if (key === 'Tab' || key === 'Enter') {
            pickMentionByFlatIndex(Math.min(mentionIndex, total - 1));
            return true;
          }
        }
      }
      return false;
    }

    // Resolve a flat visible-section index to the right insert call. Section
    // order MUST match MentionPopover's render order (files→tabs→plugins
    // →skills→mcp→connectors); the activeIndex highlight and Enter target stay in
    // lockstep across "All" and individual tabs.
    function pickMentionByFlatIndex(flat: number) {
      let i = flat;
      if (mentionTab === 'all' || mentionTab === 'files') {
        if (i < filteredFiles.length) {
          insertMention(filteredFiles[i]!.path ?? filteredFiles[i]!.name);
          return;
        }
        i -= filteredFiles.length;
      }
      if (mentionTab === 'all' || mentionTab === 'tabs') {
        if (i < filteredWorkspaceContexts.length) {
          insertWorkspaceMention(filteredWorkspaceContexts[i]!);
          return;
        }
        i -= filteredWorkspaceContexts.length;
      }
      if (mentionTab === 'all' || mentionTab === 'plugins') {
        if (i < filteredPlugins.length) {
          void insertPluginMention(filteredPlugins[i]!);
          return;
        }
        i -= filteredPlugins.length;
      }
      if (mentionTab === 'all' || mentionTab === 'skills') {
        if (i < filteredSkills.length) {
          void insertSkillMention(filteredSkills[i]!);
          return;
        }
        i -= filteredSkills.length;
      }
      if (mentionTab === 'all' || mentionTab === 'mcp') {
        if (i < filteredMcpServers.length) {
          insertMcpMention(filteredMcpServers[i]!);
          return;
        }
        i -= filteredMcpServers.length;
      }
      if (mentionTab === 'all' || mentionTab === 'connectors') {
        if (i < filteredConnectors.length) {
          insertConnectorMention(filteredConnectors[i]!);
          return;
        }
      }
    }

    function insertMention(filePath: string) {
      editorRef.current?.insertMention({
        token: inlineMentionToken(filePath),
        entity: { id: filePath, kind: 'file', label: filePath },
      });
      if (!staged.some((s) => s.path === filePath)) {
        appendContextAttachment(filePath);
      }
      setMention(null);
    }

    async function insertPluginMention(record: InstalledPluginRecord) {
      editorRef.current?.insertMention({
        token: inlineMentionToken(record.title),
        entity: { id: record.id, kind: 'plugin', label: record.title },
      });
      setMention(null);
      inlineBackedPluginRef.current = { id: record.id, label: record.title };
      await pluginsSectionRef.current?.applyById(record.id, record);
    }

    function insertMcpMention(server: McpServerConfig) {
      setStagedMcpServers((current) => (
        current.some((item) => item.id === server.id) ? current : [...current, server]
      ));
      editorRef.current?.insertMention({
        token: inlineMentionToken(server.label || server.id),
        entity: { id: server.id, kind: 'mcp', label: server.label || server.id },
      });
      setMention(null);
    }

    function insertConnectorMention(connector: ConnectorDetail) {
      setStagedConnectors((current) => (
        current.some((item) => item.id === connector.id) ? current : [...current, connector]
      ));
      editorRef.current?.insertMention({
        token: inlineMentionToken(connector.name),
        entity: { id: connector.id, kind: 'connector', label: connector.name },
      });
      setMention(null);
    }

    function insertWorkspaceMention(item: WorkspaceContextItem) {
      setStagedWorkspaceContexts((current) =>
        current.some((candidate) => candidate.id === item.id)
          ? current
          : [...current, item],
      );
      editorRef.current?.insertMention({
        token: inlineMentionToken(item.label),
        entity: { id: item.id, kind: 'workspace', label: item.label },
      });
      setMention(null);
    }

    async function applyProjectSkill(skill: SkillSummary): Promise<boolean> {
      if (!projectId) return false;
      const result = await patchProject(projectId, { skillId: skill.id }, workspaceContext);
      if (!result) return false;
      onProjectSkillChange?.(result.skillId ?? skill.id);
      return true;
    }

    function removeStaged(p: string) {
      trackComposerBar({ element: 'context_remove', resource_kind: 'attachment', resource_id: p });
      setStaged((s) => s.filter((a) => a.path !== p));
      setStagedVisualComments((current) => current.filter((attachment) => attachment.screenshotPath !== p));
      // Strip the `@<path>` token from the draft and push the result back into
      // the editor so the pill disappears in lockstep with the chip.
      replaceEditorDraft(stripInlineMentionToken(draft, p));
    }

    function removeCommentAttachment(id: string) {
      setStagedVisualComments((current) => current.filter((attachment) => attachment.id !== id));
      if (!stagedVisualComments.some((attachment) => attachment.id === id)) {
        onRemoveCommentAttachment?.(id);
      }
    }

    async function submit() {
      const prompt = composeOutgoingPrompt(draft.trim());
      // 「这一发能不能走」只问 `canSend` 这一处 —— 见它的注释(OPEND-2551)。
      // 位置在最前面是有意的:下面的 `/hatch`、`/search` 两条支路会绕过后续流程,
      // 判据留在它们后面的话,那两条支路等于又多了一套自己的答案。
      if (!canSend) return;
      // Intercept `/pet …` and `/mcp` before sending so the slash command
      // never hits the agent — these are local UX hooks, not model prompts.
      if (tryHandlePetSlash()) return;
      if (tryHandleMcpSlash()) return;
      // `/hatch <concept>` expands into the canonical hatch-pet skill
      // prompt and *is* sent to the agent — the agent runs the skill,
      // packages a Codex pet under `~/.codex/pets/`, and the user
      // adopts it from "Recently hatched" in pet settings afterwards.
      const contextMeta = currentRunContextMeta();
      const hatched = expandHatchCommand(prompt);
      const nextCommentAttachments = currentCommentAttachments();
      if (hatched) {
        if (streaming) return;
        setStreamingAnnotationSendPending(false);
        notifyCompletionFeedbackGesture();
        beginComposedSend(() => onSend(hatched, staged, nextCommentAttachments, contextMeta));
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        setStreamingAnnotationSendPending(false);
        notifyCompletionFeedbackGesture();
        beginComposedSend(
          () => onSend(search.prompt, staged, nextCommentAttachments, {
            ...contextMeta,
            research: { enabled: true, query: search.query },
          }),
        );
        return;
      }
      notifyCompletionFeedbackGesture();
      sendComposedTurn(prompt, staged, nextCommentAttachments, contextMeta);
    }

    // The @-picker offers a unified search across context surfaces:
    // workspace tabs first, then project files, plugins, skills, active MCP
    // servers, and connectors. Picked
    // entities keep an inline @ token for orientation while richer
    // context is still applied behind the scenes when available.
    const mentionQuery = mention ? mention.q.toLowerCase() : '';
    // The suggestion lists below only matter while the @-popover is open
    // (each is `[]` otherwise). Memoize them on `[mention, mentionQuery,
    // <source>]` so the filter/sort passes run only when the query or the
    // backing list actually changes — not on every unrelated composer render
    // (streaming flips, draft typing routed through Lexical, staged-chip churn).
    // `mention` is in the deps (not just `mentionQuery`) so the open/close gate
    // re-evaluates: a null→{q:''} transition keeps the query '' but must flip
    // the list from `[]` to live results.
    const filteredWorkspaceContexts = useMemo(
      () =>
        mention
          ? workspaceContexts
              .filter((item) => {
                if (!mentionQuery) return true;
                return workspaceContextSearchText(item).toLowerCase().includes(mentionQuery);
              })
              .slice(0, 12)
          : [],
      [mention, mentionQuery, workspaceContexts],
    );
    const filteredFiles = useMemo(
      () =>
        mention
          ? projectFiles
              .filter((f) => f.type === undefined || f.type === "file")
              .filter((f) => {
                const key = f.path ?? f.name;
                return key.toLowerCase().includes(mentionQuery);
              })
              .slice(0, 12)
          : [],
      [mention, mentionQuery, projectFiles],
    );
    const filteredPlugins = useMemo(
      () =>
        mention
          ? pluginsForComposer
              .filter((p) => {
                if (!mentionQuery) return true;
                return (
                  p.title.toLowerCase().includes(mentionQuery) ||
                  p.id.toLowerCase().includes(mentionQuery) ||
                  (p.manifest?.description ?? '').toLowerCase().includes(mentionQuery) ||
                  (p.manifest?.tags ?? []).join(' ').toLowerCase().includes(mentionQuery)
                );
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, pluginsForComposer],
    );
    const filteredMcpServers = useMemo(
      () =>
        mention
          ? enabledMcpServers
              .filter((s) => {
                if (!mentionQuery) return true;
                return [
                  s.id,
                  s.label ?? '',
                  s.transport,
                  s.url ?? '',
                  s.command ?? '',
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(mentionQuery);
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, enabledMcpServers],
    );
    const filteredConnectors = useMemo(
      () =>
        mention
          ? connectors
              .filter((connector) => {
                if (!mentionQuery) return true;
                return [
                  connector.id,
                  connector.name,
                  connector.provider,
                  connector.category,
                  connector.description ?? '',
                  connector.accountLabel ?? '',
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(mentionQuery);
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, connectors],
    );
    // Already-staged skills drop out of the suggestion list (carried over
    // from main) so the @-popover keeps moving forward as the user picks.
    const filteredSkills = useMemo(() => {
      if (!mention) return [];
      const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
      return skills
        .filter((s) => !stagedSkillIds.has(s.id))
        .filter((s) => skillMatchesQuery(s, mentionQuery))
        .sort((a, b) => skillMentionRank(a, mentionQuery) - skillMentionRank(b, mentionQuery));
    }, [mention, mentionQuery, skills, stagedSkills]);
    const liveCommentAttachments = currentCommentAttachments();
    const placeholderCarouselActive =
      !streaming
      && !sendDisabled
      && !activeFileContext
      && placeholderScenarios.length > 0
      && draft.trim().length === 0
      && staged.length === 0
      && liveCommentAttachments.length === 0
      && !mention
      && !slash;
    // Deliberately does NOT include the placeholder carousel's rotating
    // scenario text: that ghost text stands in for the editor's own
    // placeholder while the composer is genuinely empty, and must never make
    // Send (or Enter) submittable on its own — see the emptiness guard in
    // `submit()` above (recvqaj7eKpxH6).
    const hasComposerPayload =
      draft.trim().length > 0
      || staged.length > 0
      || liveCommentAttachments.length > 0
      || sanitizeQuotes(quotes ?? []).length > 0;
    /**
     * 「这一发能不能走」的**唯一**判据。
     *
     * 发送按钮的 disabled、回车走的 `submit()`,读的都必须是它。
     * OPEND-2551 报的就是这件事被问出了两个答案:芯片(输入框上方那排「N 条注释」)
     * 已经挂着、输入框本身是空的,按钮灰着 —— 可回车发得出去。当时按钮问的是
     * `hasComposerPayload`(它不数引用),而 `submit()` 问的是「折好的正文空不空」,
     * 而引用**是折进正文的**,所以同一时刻它非空。同一个问题、两处各算各的,
     * 早晚会分叉;分叉之后症状出现在离原因最远的地方(用户看到的是「按钮坏了」)。
     */
    const canSend = !sendDisabled && hasComposerPayload;
    /**
     * 摆到台面上的那枚「已应用插件」芯片(OPEND-2412)。
     *
     * 首页自由输入、以及「用这套设计系统创建」都会给这一发绑上 `od-default`
     * 这枚**兜底路由**。它不是用户挑的插件,只是「这一发还没选场景」的内部说法 ——
     * 摆成一枚可见芯片,读起来就像用户自己挂了个叫 “Default design router” 的东西,
     * 旁边还给一颗移除按钮。产品裁决:**界面不展示,底层照旧**。
     *
     * 所以过滤只发生在**呈现**这一层。`activeAppliedPlugin` 一个字都不能动 ——
     * 它还在喂 `pinnedPluginId`、`currentRunContextMeta()`(落库 + 重试都读它)
     * 和 daemon 侧的 snapshot 绑定;把 state 本身清掉是静默的功能回退。
     */
    const visibleAppliedPlugin =
      activeAppliedPlugin && activeAppliedPlugin.pluginId !== DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID
        ? activeAppliedPlugin
        : null;
    const showAdmissionPendingButton = composedSendPending && !streaming;
    const showStopButton = streaming && !hasComposerPayload;
    const showSendButton = (!streaming || hasComposerPayload) && !showAdmissionPendingButton;
    /* 托盘里要摆的那一排卡:已传好的 `staged` 与还在传 / 传失败的 `pendingUploads`
       合成一排,顺序按用户当初挑文件的顺序(合并规则是纯函数,单测在
       `tests/runtime/chat/staged-attachment.test.ts`)。
       ⚠️ **只有 `state === 'ready'` 的卡进得了 `hasComposerPayload`** —— 上面那个
       判断读的是 `staged`,没读这里,所以「在传的文件算不算 payload」的语义没被这次
       改动动过(那条已知 bug 属于另一个 PR,见规格 §4-A 末尾)。 */
    const stagedAttachmentCards = useMemo(
      () => buildStagedAttachmentCards(
        staged,
        externalPendingUploads && externalPendingUploads.length > 0
          ? [...externalPendingUploads, ...pendingUploads]
          : pendingUploads,
      ),
      [staged, pendingUploads, externalPendingUploads],
    );
    /** 「×」按卡的归属分流:自己的走本地,别人寄放的还给它的主人。 */
    const removePendingCard = (pendingId: string) => {
      if (pendingFilesRef.current.has(pendingId)) {
        dropPendingUpload(pendingId);
        return;
      }
      onRemoveExternalPendingUpload?.(pendingId);
    };

    const openDesignSystemPicker = () => {
      const trigger = composerRootRef.current?.querySelector<HTMLButtonElement>(
        '[data-testid="project-ds-picker-trigger"]',
      );
      if (!trigger || trigger.disabled) return;
      window.requestAnimationFrame(() => {
        if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
        trigger.focus({ preventScroll: true });
      });
    };

    return (
      <div
        className={[
          'composer',
          dragActive ? 'drag-active' : '',
          activeFileContext ? 'composer-active-file-mode' : '',
          inputDisabled ? 'composer-readonly' : '',
        ].filter(Boolean).join(' ')}
        data-testid="chat-composer"
        ref={composerRootRef}
        onDragOver={(e) => {
          if (inputDisabled) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={inputDisabled ? undefined : handleDrop}
      >
        {designToolboxOpen ? (
          <div className="composer-toolbox-standalone">
            {/* Click-catcher backdrop. A <div> (not a <button>) so it never
                inherits the app's global button:hover fill, which otherwise
                painted the whole screen when the cursor crossed it. */}
            <div
              className="composer-toolbox-standalone-backdrop"
              aria-hidden="true"
              onClick={dismissStandalonePanels}
            />
            <div
              className="plus-menu__popup composer-toolbox-standalone-popup"
              role="menu"
              onMouseEnter={cancelComposerPanelClose}
              onMouseLeave={scheduleComposerPanelClose}
            >
              <DesignToolboxPanel
                workspaceContext={workspaceContext}
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
        {/* Standalone plugins popover — the 插件 quick pill's surface, now
            that the "+" menu no longer carries a plugins row. Same anchor
            and backdrop pattern as the toolbox popover above. */}
        {pluginsPanelOpen ? (
          <div className="composer-toolbox-standalone">
            <div
              className="composer-toolbox-standalone-backdrop"
              aria-hidden="true"
              onClick={dismissStandalonePanels}
            />
            <div
              className="plus-menu__popup composer-toolbox-standalone-popup composer-plugins-standalone-popup"
              data-testid="composer-plugins-popup"
              role="menu"
              onMouseEnter={cancelComposerPanelClose}
              onMouseLeave={scheduleComposerPanelClose}
            >
              <StandalonePluginsPane
                workspaceContext={workspaceContext}
                plugins={pluginsForComposer}
                onPick={(record) => {
                  trackComposerBar({
                    element: 'plus_pick',
                    resource_kind: 'plugin',
                    resource_id: record.id,
                  });
                  void insertPluginMention(record);
                  setPluginsPanelOpen(false);
                }}
                onAdd={onBrowsePlugins ? () => {
                  trackComposerBar({ element: 'plus_add', resource_kind: 'plugin' });
                  setPluginsPanelOpen(false);
                  onBrowsePlugins();
                } : undefined}
              />
            </div>
          </div>
        ) : null}
        <div
          className={`composer-shell${manualEditorHeight != null ? ' composer-shell--manual-height' : ''}`}
          style={
            manualEditorHeight != null
              ? ({ '--composer-manual-h': `${manualEditorHeight}px` } as React.CSSProperties)
              : undefined
          }
          onMouseDown={handleShellResizeMouseDown}
        >
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
              onApplied={(brief, applied) => {
                setActiveAppliedPlugin(applied.appliedPlugin);
                // Use functional setState so stale closures from the @-mention
                // flow (which awaits applyById after setDraft) still see the
                // latest draft value before deciding whether to seed.
                if (typeof brief === 'string' && brief.length > 0) {
                  setDraft((cur) => (cur.trim().length === 0 ? brief : cur));
                }
              }}
              onCleared={() => {
                inlineBackedPluginRef.current = null;
                setActiveAppliedPlugin(null);
              }}
              onChipDetails={(item: ContextItem) => {
                if (item.kind === 'plugin') {
                  const record = installedPlugins.find((p) => p.id === item.id);
                  if (record) setDetailsRecord(record);
                  return;
                }
                if (item.kind === 'skill') {
                  setDetailsSkill({
                    id: item.id,
                    summary: skills.find((skill) => skill.id === item.id) ?? null,
                  });
                }
              }}
            />
          ) : null}
          {selectedWorkspaceContexts.length > 0 || stagedSkills.length > 0 || stagedMcpServers.length > 0 || stagedConnectors.length > 0 || visibleAppliedPlugin ? (
            <StagedRunContexts
              workspaceItems={selectedWorkspaceContexts}
              currentWorkspaceContextId={visibleWorkspaceContext?.id ?? null}
              skills={stagedSkills}
              mcpServers={stagedMcpServers}
              connectors={stagedConnectors}
              pluginChip={
                visibleAppliedPlugin
                  ? {
                      id: visibleAppliedPlugin.pluginId,
                      title: visibleAppliedPlugin.pluginTitle ?? visibleAppliedPlugin.pluginId,
                    }
                  : null
              }
              onRemoveWorkspace={removeWorkspaceContext}
              onRemoveSkill={removeStagedSkill}
              onRemoveMcp={removeStagedMcpServer}
              onRemoveConnector={removeStagedConnector}
              onRemovePlugin={() => {
                pluginsSectionRef.current?.clear();
                setActiveAppliedPlugin(null);
              }}
              onPluginDetails={(id) => {
                const record = installedPlugins.find((plugin) => plugin.id === id);
                if (record) setDetailsRecord(record);
              }}
              onSkillDetails={(id) => {
                setDetailsSkill({
                  id,
                  summary: stagedSkills.find((skill) => skill.id === id)
                    ?? skills.find((skill) => skill.id === id)
                    ?? null,
                });
              }}
              t={t}
            />
          ) : null}
          {/* 待发送附件自己占一个托盘,不和 plugin / skill / MCP 芯片挤在同一行:
              稿子的 `.composer > .tray` 只装附件(盘点 #60 第 5 条)。 */}
          {stagedAttachmentCards.length > 0 ? (
            <StagedAttachmentTray
              cards={stagedAttachmentCards}
              projectId={projectId}
              onRemoveStaged={removeStaged}
              onRemovePending={removePendingCard}
              onRetryPending={(id) => void retryPendingUpload(id)}
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
          {/* 稿子第 67 格:引用芯片在输入框**上方**,不占写字的地方 */}
          {quotes && quotes.length > 0 ? (
            <QuotedRefs quotes={quotes} onClear={() => onClearQuotes?.()} />
          ) : null}
          <div
            className="composer-input-wrap"
            onFocus={() => {
              setComposerEngaged(true);
              setComposerFocused(true);
            }}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setComposerFocused(false);
            }}
          >
            <LexicalComposerInput
              ref={editorRef}
              draft={draft}
              inputDisabled={inputDisabled}
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
              onPasteFiles={handlePasteFiles}
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
                paused={composerFocused}
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
              onTabChange={(nextTab) => {
                setMentionTab(nextTab);
                setMentionIndex(0);
              }}
              activeIndex={mentionIndex}
              stagedSkillIds={new Set(stagedSkills.map((skill) => skill.id))}
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
              onPick={pickSlash}
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
                void uploadFiles(files);
                e.target.value = '';
              }}
            />
            <ComposerPlusMenu
              workspaceContext={workspaceContext}
              triggerTestId="chat-plus-trigger"
              // 聊天面板走稿子那枚描边加号;home hero 不传这个,保持共享 Icon
              // 的实心 remix 字形(产品裁决 2026-09-03:不动全站)。
              strokeGlyph
              placementPreference="up"
              openRequest={plusMenuOpenRequest}
              onOpen={() => {
                trackComposerBar({ element: 'plus_menu_open' });
                setComposerEngaged(true);
              }}
              onSubmenuOpen={(submenu) => {
                // The working-dir flyout carries actions, not a resource list.
                if (submenu === 'workingDir') return;
                trackComposerBar({
                  element: 'plus_submenu_open',
                  resource_kind: PLUS_SUBMENU_RESOURCE_KIND[submenu],
                });
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
                setProjectReferenceOpen(true);
              }}
              onLinkLocalCode={() => {
                trackComposerBar({ element: 'plus_pick', resource_kind: 'workspace', resource_id: 'local-code' });
                void handleLinkLocalCodeContext();
              }}
              workingDir={workingDir}
              recentWorkingDirs={recentDirs}
              onPickWorkingDir={() => {
                trackComposerBar({ element: 'plus_pick', resource_kind: 'workspace', resource_id: 'working-dir' });
                void handlePickWorkingDir();
              }}
              onSelectRecentWorkingDir={(dir) => {
                trackComposerBar({ element: 'plus_pick', resource_kind: 'workspace', resource_id: 'working-dir-recent' });
                void setWorkingDirFolder(dir);
              }}
              onClearWorkingDir={() => {
                trackComposerBar({ element: 'plus_pick', resource_kind: 'workspace', resource_id: 'working-dir-clear' });
                void clearWorkingDir();
              }}
              attachLoading={uploading}
              onSelectFromLibrary={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'library',
                });
                setLibraryPickerOpen(true);
              }}
              onImportFigma={projectId ? () => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'figma_import',
                });
                setFigmaModalOpen(true);
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
                setFigmaHelpOpen(true);
              }}
              onOpenDesignSystems={projectId && designSystemPicker ? () => {
                trackComposerBar({ element: 'design_system_open' });
                openDesignSystemPicker();
              } : undefined}
            />
            {/* #5517: the design-system picker sits inline in the composer's
                icon row (palette icon) instead of the staged-context bar. */}
            {designSystemPicker}
            {leadingAccessory}
            <span className="composer-spacer" />
            {/* No mode picker in the composer (2026-08-19, product): the row
                carried a 规划/设计/提问 chooser that every run defaulted past.
                `sessionMode` still flows through this component — a
                conversation keeps its stored mode and next-step actions still
                switch it (ChatPane.handleNextStepPromptAction) — it just is
                not chosen from here any more. */}
            {footerAccessory}
            {showAdmissionPendingButton ? (
              <button
                type="button"
                className="composer-send stop admission-pending"
                data-testid="chat-send-pending"
                disabled
                aria-busy="true"
                aria-label={t('assistant.statusPreparing')}
              >
                {/* 预检那一档是本分支独有的(main 没有 admission-pending)。
                    合并 main 时几何取了它的 32px 方框,那里装不下文字,所以这里
                    只留球 —— 「正在准备」仍然由 `aria-label` + `aria-busy` 说给
                    读屏,视觉上和运行态一样靠球表达「有事在发生」。按钮本身保留:
                    它要挡住预检期间的第二次点击。 */}
                <ComposerRunIcon className="composer-run-glyph" />
              </button>
            ) : null}
            {showStopButton ? (
              <button
                type="button"
                className="composer-send stop od-tooltip"
                onClick={onStop}
                aria-label={t('chat.stop')}
                title={t('chat.stop')}
                data-tooltip={t('chat.stop')}
              >
                {/* Executing = the send mark's own box (底.svg: the 32px
                    near-black squircle, no arrow) carrying one of two green
                    glyphs. At rest it is the matrix loader; on hover/focus it
                    is the stop square (Group 2147224570.svg), so the button
                    shows what clicking it does. Both render and CSS swaps
                    which one is visible, so nothing reflows mid-run.
                    The button used to widen into a labelled pill — dot-matrix
                    + 思考中, swapping to 停止 on hover — but a 32px square has
                    no room for that copy, so 停止 moved to the hover tooltip;
                    the aria-label already carried it. */}
                <ComposerRunIcon className="composer-run-glyph" />
                <ComposerStopIcon className="composer-stop-glyph" />
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
                disabled={!canSend}
                aria-label={t('chat.send')}
                title={t('chat.send')}
                data-tooltip={t('chat.send')}
              >
                {/* Home's send mark: the glyph fills half of its own box, so
                    it renders at the button's full 32px rather than inset.

                    合并 main 时产品拍板取这一版(2026-09-05):本分支 09-04 曾按
                    交付稿 `729fa43ce7` 把它改成「盒子 28 / 图标 16」,而 main 的
                    `2e4c1a753b`(#7635 / OPEND-2553)在 7 小时后带着自己那份设计
                    上线,明确覆盖了项目输入区。两份设计撞在同一颗控件上,取已上线
                    的那份 —— 在合并里悄悄撤销别人已上线的工作,不该由做合并的人
                    代劳。稿子那一格的 28/16 就此作废,判据见本次合并说明。 */}
                <Icon name="arrow-up-fill" size={32} />
              </button>
            ) : null}
          </div>
        </div>
        {/* #5517 renders no working-dir row inside a project — its ChatComposer
            imports WorkingDirPicker but never mounts it. Product chose full
            alignment (2026-07-21) over keeping this as the only mid-project
            re-bind entry. Home still picks a working directory for NEW projects. */}
        {uploadError ? <span className="composer-hint">{uploadError}</span> : null}
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            workspaceContext={workspaceContext}
            onClose={() => setDetailsRecord(null)}
            onUse={async (record) => {
              inlineBackedPluginRef.current = null;
              await pluginsSectionRef.current?.applyById(record.id, record);
              setDetailsRecord(null);
            }}
            onDuplicate={(record) => void duplicateDetailsPlugin(record)}
            hideUseAction
          />
        ) : null}
        {detailsSkill ? (
          <SkillDetailsModal
            skillId={detailsSkill.id}
            summary={detailsSkill.summary}
            onClose={() => setDetailsSkill(null)}
          />
        ) : null}
        {libraryPickerOpen ? (
          <LibraryPicker
            onClose={() => setLibraryPickerOpen(false)}
            onConfirm={(assets) => addAssetsFromLibrary(assets)}
          />
        ) : null}
        {figmaModalOpen && projectId ? (
          <FigmaImportModal
            onClose={() => setFigmaModalOpen(false)}
            resolveProjectId={async () => projectId}
            workspaceContext={workspaceContext}
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
              setFigmaModalOpen(false);
            }}
          />
        ) : null}
        {figmaHelpOpen ? (
          <FigmaHelpModal onClose={() => setFigmaHelpOpen(false)} />
        ) : null}
        {projectReferenceOpen ? (
          <ProjectReferenceModal
            currentProjectId={projectId}
            workspaceContext={workspaceContext}
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
              setProjectReferenceOpen(false);
            }}
            onSelect={(items) => void handleReferenceProjects(items)}
          />
        ) : null}
      </div>
    );
  }
);

function buildComposerMentionEntities({
  connectors,
  files,
  mcpServers,
  plugins,
  skills,
  staged,
  workspaceContexts,
}: {
  connectors: ConnectorDetail[];
  files: ProjectFile[];
  mcpServers: McpServerConfig[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  staged: ChatAttachment[];
  workspaceContexts: WorkspaceContextItem[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
  const workspaceSeen = new Set<string>();
  for (const item of workspaceContexts) {
    if (!item.id || !item.label) continue;
    const key = `workspace:${item.id}`;
    if (workspaceSeen.has(key)) continue;
    workspaceSeen.add(key);
    entities.push({
      id: item.id,
      kind: 'workspace',
      label: item.label,
      token: inlineMentionToken(item.label),
      title: `Workspace: ${item.label}`,
    });
  }
  for (const plugin of plugins) {
    entities.push({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.title,
      token: inlineMentionToken(plugin.title),
      title: `Plugin: ${plugin.title}`,
    });
  }
  for (const skill of skills) {
    entities.push({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token: inlineMentionToken(skill.name),
      title: `Skill: ${skill.name}`,
    });
    if (skill.id !== skill.name) {
      entities.push({
        id: skill.id,
        kind: 'skill',
        label: skill.id,
        token: inlineMentionToken(skill.id),
        title: `Skill: ${skill.name}`,
      });
    }
  }
  for (const server of mcpServers) {
    const label = server.label || server.id;
    entities.push({
      id: server.id,
      kind: 'mcp',
      label,
      token: inlineMentionToken(label),
      title: `MCP: ${label}`,
    });
    if (server.id !== label) {
      entities.push({
        id: server.id,
        kind: 'mcp',
        label: server.id,
        token: inlineMentionToken(server.id),
        title: `MCP: ${label}`,
      });
    }
  }
  for (const connector of connectors) {
    entities.push({
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token: inlineMentionToken(connector.name),
      title: `Connector: ${connector.name}`,
    });
    if (connector.id !== connector.name) {
      entities.push({
        id: connector.id,
        kind: 'connector',
        label: connector.id,
        token: inlineMentionToken(connector.id),
        title: `Connector: ${connector.name}`,
      });
    }
  }
  const filePaths = new Set<string>();
  for (const file of files) {
    const path = file.path ?? file.name;
    if (!path || filePaths.has(path)) continue;
    filePaths.add(path);
    entities.push({
      id: path,
      kind: 'file',
      label: path,
      token: inlineMentionToken(path),
      title: `File: ${path}`,
    });
  }
  for (const attachment of staged) {
    if (!attachment.path || filePaths.has(attachment.path)) continue;
    filePaths.add(attachment.path);
    entities.push({
      id: attachment.path,
      kind: 'file',
      label: attachment.path,
      token: inlineMentionToken(attachment.path),
      title: `File: ${attachment.path}`,
    });
  }
  return entities;
}

function isFiniteAttachmentOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// Upper bound on element markup folded into the composer input so a huge node's
// outerHTML can't swamp the prompt; the screenshot still attaches in full.
const MAX_ELEMENT_HTML_CHARS = 8000;

/**
 * Render a captured element's markup as a composer-input block: a one-line
 * descriptor (selector + rendered size) followed by a fenced HTML code block.
 * Used when an element-pick library asset is pulled into the chat so the user
 * sees — and can edit — the element's HTML inline before sending.
 */
function formatElementHtmlBlock(
  asset: LibraryAsset,
  element: LibraryElementMeta,
  html: string,
): string {
  const descriptor = element.selector || element.tag || assetTitle(asset);
  const size = element.width && element.height ? ` · ${element.width}×${element.height}` : '';
  const trimmed = html.trim();
  const body =
    trimmed.length > MAX_ELEMENT_HTML_CHARS
      ? `${trimmed.slice(0, MAX_ELEMENT_HTML_CHARS)}\n<!-- …truncated -->`
      : trimmed;
  return `Captured element ${descriptor}${size}\n\n\`\`\`html\n${body}\n\`\`\``;
}

function normalizeChatAttachmentOrders(attachments: ChatAttachment[]): ChatAttachment[] {
  let fallbackOrder = 0;
  return attachments.map((attachment) => {
    if (isFiniteAttachmentOrder(attachment.order)) {
      fallbackOrder = Math.max(fallbackOrder, Math.floor(attachment.order) + 1);
      return { ...attachment, order: Math.floor(attachment.order) };
    }
    const order = fallbackOrder;
    fallbackOrder += 1;
    return { ...attachment, order };
  });
}

function assignChatAttachmentOrders(
  attachments: ChatAttachment[],
  orderStart: number,
): ChatAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    order: orderStart + index,
  }));
}

function nextChatAttachmentOrder(attachments: ChatAttachment[]): number {
  return attachments.reduce(
    (max, attachment, index) =>
      Math.max(max, isFiniteAttachmentOrder(attachment.order) ? Math.floor(attachment.order) + 1 : index + 1),
    0,
  );
}

function sortChatAttachmentsByOrder(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function sortChatCommentAttachmentsByOrder(attachments: ChatCommentAttachment[]): ChatCommentAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

/* 5×5 dot-matrix "cross expand" glyph shown inside the black send button while
   a run is executing: a plus shape blooms outward from the center in Manhattan
   steps (delay = 220ms × Manhattan distance from the middle dot); the faint
   base grid stays static. Dots use currentColor so the glyph adapts to the
   button's light-on-dark (and dark-mode inverted) fill. */
/* Running glyph: the `thinking-orbs` solving orb (vendored in
   composer/ThinkingOrb.tsx) — the bands of a dotted sphere scramble in quarter
   turns, then click back. It draws to a <canvas> and parks itself when the tab
   is hidden or the element scrolls out of view, and honours
   prefers-reduced-motion by holding a single frame.

   The vendored copy is fixed at the package's 20px preset (the two sizes it
   ships are separately tuned designs, not a scale factor) — the mark's own ink
   box is ~14px, and the extra 6px still clear the 32px disc — and PINNED to
   the dark palette: this disc is #202020 in BOTH app themes, so an auto theme
   would paint dark ink onto the dark disc under a light app and vanish. Dark =
   light ink, which the CSS filter on `.composer-run-glyph` then carries to the
   mark's green. */
function ComposerRunIcon({ className }: { className?: string }) {
  return (
    <ThinkingOrb
      className={className}
      // The orb labels itself (role="img" + "Solving…"); the button it sits in
      // is already labelled 停止, so keep it out of the a11y tree.
      aria-hidden
    />
  );
}

/* Stop mark shown while the run button is hovered/focused (Group
   2147224570.svg): a 14px rounded square centred in the send mark's own 32
   box. Kept at the source's 32 viewBox and rendered at 32px — like the send
   arrow — so it lands exactly where the file draws it, and `currentColor`
   picks the button's green up from `--send-ground`. */
function ComposerStopIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18 9.00004C20.7614 9.00005 23 11.2386 23 14V18C23 20.7614 20.7614 22.9999 18 23L14 23C11.2386 23 9 20.7614 9 18V14C9 11.2386 11.2386 9.00001 14 9.00002L18 9.00004Z" />
    </svg>
  );
}

function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'project') return 'folder';
  if (item.kind === 'local-code') return 'terminal';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

function workspaceContextTitle(item: WorkspaceContextItem, t: TranslateFn): string {
  return [
    workspaceContextKindLabel(item.kind, t),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

function workspaceContextDescription(item: WorkspaceContextItem, t: TranslateFn): string {
  if (item.kind === 'design-files') return item.path || t('chat.designToolbox.context.designFiles');
  if (item.kind === 'project') return item.absolutePath || item.path || item.title || item.id;
  if (item.kind === 'local-code') return item.absolutePath || item.path || item.title || item.id;
  if (item.kind === 'terminal') return item.title || t('chat.designToolbox.context.terminal');
  return item.url || item.path || item.absolutePath || item.title || item.tabId || item.id;
}

function lastPathSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || path;
}

function projectFileMentionTitle(file: ProjectFile, fallback: string): string {
  return file.name || lastPathSegment(fallback);
}

function projectFileMentionDescription(file: ProjectFile, fallback: string): string {
  const label = projectFileMentionTitle(file, fallback);
  if (fallback && fallback !== label) return fallback;
  return [file.kind, file.mime].filter(Boolean).join(' · ');
}

function workspaceContextSearchText(item: WorkspaceContextItem): string {
  return [
    item.id,
    item.kind,
    item.label,
    item.tabId ?? '',
    item.path ?? '',
    item.absolutePath ?? '',
    item.url ?? '',
    item.title ?? '',
  ].join(' ');
}

function workspaceContextKindLabel(kind: WorkspaceContextItem['kind'], t: TranslateFn): string {
  switch (kind) {
    case 'browser':
      return t('chat.designToolbox.context.browser');
    case 'design-files':
      return t('chat.designToolbox.context.designFiles');
    case 'design-system':
      return t('chat.designToolbox.context.designSystem');
    case 'folder':
      return t('chat.designToolbox.context.folder');
    case 'project':
      return t('workspaceTabs.project');
    case 'local-code':
      return t('dsCreate.localCodeLabel');
    case 'terminal':
      return t('chat.designToolbox.context.terminal');
    case 'side-chat':
      return t('chat.designToolbox.context.sideChat');
    case 'live-artifact':
      return t('chat.designToolbox.context.liveArtifact');
    case 'file':
    default:
      return t('chat.designToolbox.context.file');
  }
}

function StagedRunContexts({
  designSystemPicker,
  workspaceItems,
  currentWorkspaceContextId,
  skills,
  mcpServers,
  connectors,
  pluginChip,
  onRemoveWorkspace,
  onRemoveSkill,
  onRemoveMcp,
  onRemoveConnector,
  onRemovePlugin,
  onPluginDetails,
  onSkillDetails,
  t,
}: {
  designSystemPicker?: ReactNode;
  workspaceItems: WorkspaceContextItem[];
  currentWorkspaceContextId: string | null;
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
  pluginChip?: { id: string; title: string } | null;
  onRemoveWorkspace: (id: string) => void;
  onRemoveSkill: (id: string) => void;
  onRemoveMcp: (id: string) => void;
  onRemoveConnector: (id: string) => void;
  onRemovePlugin?: () => void;
  onPluginDetails?: (id: string) => void;
  onSkillDetails?: (id: string) => void;
  t: TranslateFn;
}) {
  const { workspaceContext } = useProjectCollabContext();
  return (
    <div
      className="staged-row staged-context-row"
      data-testid="staged-contexts"
    >
      {designSystemPicker ? (
        <div className="staged-context-picker staged-context-picker--design-system">
          {designSystemPicker}
        </div>
      ) : null}
      {pluginChip ? (
        <div className="staged-chip staged-context staged-context--plugin" data-staged-kind="plugin">
          {/* Two sibling controls — a details button (icon + name) and the
              remove button — rather than a role=button wrapper containing the
              remove button. Nested interactive controls break focus order and
              assistive-tech announcements. */}
          <button
            type="button"
            className="staged-context-open"
            onClick={() => onPluginDetails?.(pluginChip.id)}
            title={pluginChip.title}
            aria-label={pluginChip.title}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="sparkles" size={12} />
            </span>
            <span className="staged-name">{pluginChip.title}</span>
          </button>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemovePlugin?.()}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: pluginChip.title })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ) : null}
      {workspaceItems.map((workspaceItem) => {
        const kindLabel =
          workspaceItem.id === currentWorkspaceContextId
            ? t('fileViewer.versions.current')
            : workspaceContextKindLabel(workspaceItem.kind, t);
        return (
          <div
            key={workspaceItem.id}
            className={`staged-chip staged-context staged-context--workspace staged-context--workspace-${workspaceItem.kind}`}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name={workspaceContextIcon(workspaceItem)} size={12} />
            </span>
            <span className="staged-name" title={workspaceContextTitle(workspaceItem, t)}>
              <span className="staged-context-kind">{kindLabel}</span>
              {workspaceItem.label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveWorkspace(workspaceItem.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: workspaceItem.label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {skills.map((s) => (
        <div
          key={s.id}
          className={`staged-chip staged-context staged-context--skill staged-skill-${s.source ?? 'built-in'}`}
        >
          <button
            type="button"
            className="staged-context-open"
            onClick={() => onSkillDetails?.(s.id)}
            title={s.description || s.name}
            aria-label={s.name}
          >
            <span className="staged-name">@{s.name}</span>
          </button>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveSkill(s.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: s.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      {mcpServers.map((server) => {
        const label = server.label || server.id;
        return (
          <div
            key={server.id}
            className="staged-chip staged-context staged-context--mcp"
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="link" size={12} />
            </span>
            <span className="staged-name" title={server.command || server.url || server.id}>
              @{label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveMcp(server.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="staged-chip staged-context staged-context--connector"
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="link" size={12} />
          </span>
          <span className="staged-name" title={connector.accountLabel ?? connector.provider}>
            @{connector.name}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveConnector(connector.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: connector.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── 待发送附件托盘(设计稿组件 21,第 60–64 格)──────────────────────────
 *
 * 与「已发送」那一侧(`ChatPane.tsx` 的 `UserAttachmentRow`)**共用同一张卡**:
 * 同样 57px 方卡 / 180px 文档卡、同样的主名中间省略 + 后缀保留,靠 CSS 里
 * `.composer-att` 与 `.msg.user` 共写一份选择器落实,不另抄一套模板。
 * 稿子这条是有来历的:两侧长得不一样时,同一批文件在按下发送的那一瞬会整个
 * 跳一下形状,而两套模板还会各自漂移 —— 线上那版就是这么裂的。
 *
 * 托盘只多两样东西:右上角一枚 hover 才出的「×」,和上传中 / 失败的叠加物。
 * 托盘靠左(已发送那一侧要贴右,因为它压在用户气泡上方)。
 */
export function StagedAttachmentTray({
  cards,
  projectId,
  onRemoveStaged,
  onRemovePending,
  onRetryPending,
  t,
}: {
  cards: StagedAttachmentCard[];
  projectId: string | null;
  onRemoveStaged: (path: string) => void;
  onRemovePending: (pendingId: string) => void;
  onRetryPending: (pendingId: string) => void;
  t: TranslateFn;
}) {
  const { workspaceContext } = useProjectCollabContext();
  const rowRef = useRef<HTMLDivElement>(null);
  const { prev, next, page } = useStagedTrayNav(rowRef, cards.length);
  // 点缩略图看大图 —— 这是产品**已有**的能力,稿子那一格把卡画成了不可点的
  // `<span>`。删掉一个人已经在用的入口要产品拍板,所以这里保留(报告里记着)。
  const [preview, setPreview] = useState<StagedAttachmentCard | null>(null);
  const previewUrl = preview
    ? preview.previewUrl
      ?? (preview.path && projectId ? projectRawUrl(projectId, preview.path, workspaceContext) : null)
    : null;
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);
  const removeCard = (card: StagedAttachmentCard) => {
    if (card.pendingId) onRemovePending(card.pendingId);
    else if (card.path) onRemoveStaged(card.path);
  };
  return (
    <>
      {/* 壳子只为箭头存在:箭头要绝对定位压在这一行的两端,而滚动容器自己
          不能 `position: relative` —— 那样绝对定位的孩子会跟着内容一起滚走。 */}
      <div className={`composer-att-wrap${prev ? ' is-prev' : ''}${next ? ' is-next' : ''}`}>
        <div className="composer-att" data-testid="staged-attachments" ref={rowRef}>
          {cards.map((card) => {
            const removeLabel = card.state === 'uploading'
              ? t('chat.att.cancelUpload', { name: card.name })
              : t('chat.removeAria', { name: card.name });
            const del = (
              <button
                type="button"
                className="msg-att-del"
                onClick={() => removeCard(card)}
                aria-label={removeLabel}
              >
                <ChatCloseIcon size={10} />
              </button>
            );
            const stateClass = card.state === 'uploading'
              ? ' is-up'
              : card.state === 'failed' ? ' is-fail' : '';
            if (card.kind === 'file') {
              return (
                <StagedTrayDocCard
                  key={card.key}
                  card={card}
                  stateClass={stateClass}
                  del={del}
                />
              );
            }
            const thumbUrl = card.previewUrl
              ?? (card.path && projectId ? projectRawUrl(projectId, card.path, workspaceContext) : null);
            return (
              <span key={card.key} className={`msg-att-img${stateClass}`} data-testid="staged-attachment-image">
                <span className="msg-att-ph">
                  {card.state === 'failed' ? (
                    /* 失败卡里「重试」铺满整块缩略图 —— 57px 见方的卡横着放不下
                       「↻ 重试」,竖排两行才落得进方块里。
                       失败卡不描红框:红只留给【可以点的那一下】,不是「这张卡出事了」。 */
                    <button
                      type="button"
                      className="msg-att-rt"
                      data-testid="staged-att-retry"
                      onClick={() => card.pendingId && onRetryPending(card.pendingId)}
                      title={card.name}
                    >
                      <Icon name="refresh" size={14} />
                      <span>{t('chat.att.retry')}</span>
                    </button>
                  ) : card.state === 'ready' && thumbUrl ? (
                    <button
                      type="button"
                      className="msg-att-mini-btn"
                      onClick={() => setPreview(card)}
                      title={card.name}
                      aria-label={t('chat.attachments.preview', { name: card.name })}
                    >
                      <img className="msg-att-mini" src={thumbUrl} alt="" aria-hidden />
                    </button>
                  ) : thumbUrl ? (
                    /* 上传中:缩略图压暗(`.is-up .msg-att-mini { opacity: .45 }`),
                       这几秒它不是一个可点的东西。 */
                    <img className="msg-att-mini" src={thumbUrl} alt="" aria-hidden />
                  ) : (
                    <span className="msg-att-mini" aria-hidden />
                  )}
                </span>
                {del}
              </span>
            );
          })}
        </div>
        {/* 一枚朝下的箭头转 ±90 度当左右用,判据与已发送那一行同一份纯函数。
            两颗**常驻**,出没交给壳上的 `is-prev` / `is-next`(稿子 `.att-wrap.is-prev > .att-nav.mod-prev`
            就是这么写的);这也是本仓的约定 —— 条件显示的元素保持挂载、用 CSS 切,
            React 卸载会把退场过渡整个跳过。 */}
        <button
          type="button"
          className="msg-att-nav mod-prev"
          data-testid="staged-att-nav-prev"
          aria-label={t('chat.attachments.scrollPrev')}
          onClick={() => page('prev')}
        >
          <i>
            <Icon name="chevron-down" size={14} />
          </i>
        </button>
        <button
          type="button"
          className="msg-att-nav mod-next"
          data-testid="staged-att-nav-next"
          aria-label={t('chat.attachments.scrollNext')}
          onClick={() => page('next')}
        >
          <i>
            <Icon name="chevron-down" size={14} />
          </i>
        </button>
      </div>
      {preview && previewUrl ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
        >
          <div className="staged-preview-card" data-testid="staged-preview-card">
            <div className="staged-preview-head" data-testid="staged-preview-head">
              <span title={preview.path ?? preview.name}>{preview.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setPreview(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={previewUrl} alt={preview.name} />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/**
 * 文档卡(#62)。名字是它唯一的身份,所以反过来【必须】挂名字;
 * 主名中间省略、后缀永远完整,量法与已发送那一侧同一份纯函数。
 *
 * 托盘里它额外吃 `padding-inline-end: 28px` 给右上角的「×」让位,
 * 而「×」自己的偏移是 5px(图卡是 4px)—— 两张卡的边框 / 内边距不同,
 * 稿子给的就是两个值,别统一成一个。
 */
function StagedTrayDocCard({
  card,
  stateClass,
  del,
}: {
  card: StagedAttachmentCard;
  stateClass: string;
  del: ReactNode;
}) {
  const { base, ext } = splitFileName(card.name);
  const nameRef = useRef<HTMLSpanElement>(null);
  const displayBase = useTrayTruncatedName(nameRef, base, ext);
  const size = formatAttachmentSize(card.size);
  return (
    <span className={`msg-att-doc${stateClass}`} title={card.name}>
      <ChatFileIcon size={15} className="msg-att-fi" />
      <span className="msg-att-tx">
        <span className="msg-att-nm" ref={nameRef}>
          <span className="msg-att-base">{displayBase}</span>
          {ext ? <span className="msg-att-ext">{ext}</span> : null}
        </span>
        {/* 拿不到体积就空着这一行,不写 `0 B` —— 但位置留着,
            否则同一行里有体积和没体积的卡会差一行高。 */}
        <span className="msg-att-meta">{size ?? ''}</span>
      </span>
      {del}
    </span>
  );
}

/** 量文字宽度用的离屏 canvas。一份就够,反复建会在长会话里堆出几百个。 */
let trayMeasureCtx: CanvasRenderingContext2D | null | undefined;

function trayTextMeasurerFor(el: HTMLElement | null): ((text: string) => number) | null {
  if (!el || typeof document === 'undefined') return null;
  if (trayMeasureCtx === undefined) {
    try {
      trayMeasureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      // jsdom / 没有 canvas 的运行环境:量不到就不截,由 CSS overflow 兜底。
      trayMeasureCtx = null;
    }
  }
  const ctx = trayMeasureCtx;
  if (!ctx) return null;
  const cs = window.getComputedStyle(el);
  if (!cs.fontSize) return null;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return (text: string) => ctx.measureText(text).width;
}

/**
 * 文件名中间省略(#59 的量法,#62 复用)。
 *
 * 量的是 `.msg-att-nm` 自己的可用宽度,而它在一张定宽 180px 的卡里、且被
 * `.msg-att-tx { flex: 1 }` 钉住 —— 所以这个宽度是常量,不随名字长短变。
 * 这是绕开「越截越短」棘轮的关键:**不能拿截过的名字再去量**。
 */
function useTrayTruncatedName(
  ref: MutableRefObject<HTMLSpanElement | null>,
  base: string,
  ext: string,
): string {
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      const node = ref.current;
      if (!alive || !node) return;
      if (!node.clientWidth) {
        setAvail(0);
        return;
      }
      const measurer = trayTextMeasurerFor(node);
      const extWidth = measurer && ext ? measurer(ext) : 0;
      setAvail(node.clientWidth - extWidth);
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(measure).catch(() => {});
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [ref, ext]);
  return useMemo(
    () => (avail > 0 ? middleTruncateFileName(base, avail, trayTextMeasurerFor(ref.current)) : base),
    [ref, base, avail],
  );
}

/**
 * 托盘的翻页箭头(#64)。判据与已发送那一行**同一份纯函数**
 * (`runtime/chat/attachment-nav.ts`),稿子里两处底色相同,所以渐变和箭头也共用。
 *
 * 四路重算,少一路就会看见错的箭头:`scroll`(滚动中两端的结论一直在翻)、
 * `ResizeObserver`(面板宽度变了)、`resize`(容器定宽时窗口缩放不触发容器自身的
 * resize)、`document.fonts.ready`(文档卡里的文字宽度要等字体到位才定下来)。
 */
function useStagedTrayNav(
  ref: MutableRefObject<HTMLDivElement | null>,
  count: number,
): AttachmentNavState & { page: (direction: 'prev' | 'next') => void } {
  const [state, setState] = useState<AttachmentNavState>({ prev: false, next: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const sync = () => {
      const node = ref.current;
      if (!alive || !node) return;
      const measured = attachmentNavState(node);
      setState((current) =>
        current.prev === measured.prev && current.next === measured.next ? current : measured,
      );
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(sync);
      observer.observe(el);
    }
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(sync).catch(() => {});
    return () => {
      alive = false;
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      observer?.disconnect();
    };
  }, [ref, count]);

  const page = useCallback(
    (direction: 'prev' | 'next') => {
      const node = ref.current;
      if (!node) return;
      const rtl =
        typeof window !== 'undefined' && window.getComputedStyle(node).direction === 'rtl';
      const left = attachmentNavDelta(direction, node.clientWidth, rtl);
      if (typeof node.scrollBy === 'function') node.scrollBy({ left, behavior: 'smooth' });
      else node.scrollLeft += left;
    },
    [ref],
  );

  return { ...state, page };
}

function StagedCommentAttachments({
  attachments,
  onRemove,
  t,
}: {
  attachments: ChatCommentAttachment[];
  onRemove: (id: string) => void;
  t: TranslateFn;
}) {
  const visibleAttachments = attachments.filter((attachment) => attachment.selectionKind !== 'visual');
  if (visibleAttachments.length === 0) return null;
  return (
    <div className="staged-row comment-staged-row" data-testid="staged-comment-attachments">
      {visibleAttachments.map((a) => (
        <div key={a.id} className="staged-chip staged-comment">
          <span
            className="staged-name"
            title={`${a.screenshotPath ? `${a.screenshotPath}: ` : ''}${commentTargetDisplayName(a)}${a.comment ? `: ${a.comment}` : ''}`}
          >
            <strong>{commentTargetDisplayName(a)}</strong>
            {a.comment ? <span>{a.comment}</span> : null}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemove(a.id)}
            title={t('chat.comments.removeAttachment')}
            data-tooltip={t('chat.comments.removeAttachment')}
            aria-label={t('chat.comments.removeAttachmentAria', { name: a.elementId })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * The 插件 quick pill's standalone popover content. Reuses the "+" menu
 * plugins-flyout structure verbatim (plus-menu__plugin-pane: search + list
 * column + hover preview column) so the surface keeps the exact look it had
 * as a menu flyout — ToolsPluginsPanel's composer-tools-* layout collided
 * with the plus-menu popup container.
 */
function StandalonePluginsPane({
  plugins,
  onPick,
  onAdd,
  workspaceContext,
}: {
  plugins: InstalledPluginRecord[];
  onPick: (record: InstalledPluginRecord) => void;
  onAdd?: () => void;
  workspaceContext: WorkspaceCollabContext | null;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [hoveredPluginId, setHoveredPluginId] = useState<string | null>(null);
  const filteredPlugins = useMemo(
    () => plugins.filter((p) => pluginMatchesQuery(p, query)),
    [plugins, query],
  );
  // Mirror the "+" menu flyout: default the preview to the first filtered row
  // so the panel is never blank while open.
  const hoveredPlugin =
    filteredPlugins.find((p) => p.id === hoveredPluginId) ?? filteredPlugins[0] ?? null;

  return (
    <div className="plus-menu__plugin-pane">
      <div className="plus-menu__plugin-main">
        <div className="plus-menu__search">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('entry.navPlugins')}
            aria-label={t('entry.navPlugins')}
          />
        </div>
        <div className="plus-menu__list">
          {filteredPlugins.length === 0 ? (
            <div className="plus-menu__empty">{t('homeHero.noPlugins')}</div>
          ) : (
            filteredPlugins.map((plugin) => (
              <button
                key={plugin.id}
                type="button"
                role="menuitem"
                className={`plus-menu__item${
                  plugin.id === hoveredPlugin?.id ? ' is-previewed' : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHoveredPluginId(plugin.id)}
                onFocus={() => setHoveredPluginId(plugin.id)}
                onClick={() => onPick(plugin)}
              >
                <Icon name="sparkles" size={15} className="plus-menu__item-icon" />
                <span>{localizePluginTitle(locale, plugin)}</span>
              </button>
            ))
          )}
        </div>
        {onAdd ? (
          <>
            <div className="plus-menu__divider" />
            <button
              type="button"
              role="menuitem"
              className="plus-menu__item"
              onClick={onAdd}
            >
              <Icon name="plus" size={15} className="plus-menu__item-icon" />
              <span>{t('homeHero.addPlugin')}</span>
            </button>
          </>
        ) : null}
      </div>
      {hoveredPlugin ? (
        <ComposerPluginPreview
          record={hoveredPlugin}
          locale={locale}
          workspaceContext={workspaceContext}
        />
      ) : null}
    </div>
  );
}

function ToolsPluginsPanel({
  plugins,
  activePluginId,
  onApply,
  onShowDetails,
}: {
  plugins: InstalledPluginRecord[];
  activePluginId: string | null;
  onApply: (record: InstalledPluginRecord) => void | Promise<void>;
  onShowDetails: (record: InstalledPluginRecord) => void;
}) {
  const { locale, t } = useI18n();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [source, setSource] = useState<'community' | 'mine'>('community');
  const [query, setQuery] = useState('');
  const communityPlugins = useMemo(
    () => plugins.filter((p) => p.sourceKind === 'bundled'),
    [plugins],
  );
  const userPlugins = useMemo(
    () => plugins.filter((p) => USER_PLUGIN_SOURCE_KINDS.has(p.sourceKind)),
    [plugins],
  );
  const scopedPlugins = source === 'community' ? communityPlugins : userPlugins;
  const visiblePlugins = useMemo(
    () => scopedPlugins.filter((p) => pluginMatchesQuery(p, query)),
    [scopedPlugins, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <div className="composer-tools-segments" role="tablist" aria-label={t('chat.plus.plugins')}>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'community'}
            className={`composer-tools-segment${source === 'community' ? ' active' : ''}`}
            onClick={() => setSource('community')}
            title={`${t('pluginsView.scope.official')} · ${communityPlugins.length}`}
          >
            {t('pluginsView.scope.official')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'mine'}
            className={`composer-tools-segment${source === 'mine' ? ' active' : ''}`}
            onClick={() => setSource('mine')}
            title={`${t('pluginsView.scope.personal')} · ${userPlugins.length}`}
          >
            {t('pluginsView.scope.personal')}
          </button>
        </div>
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('pluginsHome.searchPlaceholder')}
          aria-label={t('pluginsHome.searchAria')}
        />
      </div>
      {visiblePlugins.length === 0 ? (
        <div className="composer-tools-empty">
          {plugins.length === 0 ? (
            <>
              {t('pluginsHome.emptyCatalog')}
            </>
          ) : query ? (
            <>{t('pluginsView.emptyNoMatchTitle')} · {t('pluginsView.emptyNoMatchHint')}</>
          ) : (
            <>{source === 'community'
              ? t('pluginsView.emptyOfficialPluginsTitle')
              : t('pluginsView.emptyPersonalPluginsTitle')}</>
          )}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visiblePlugins.map((p) => {
            const pluginTitle = localizePluginTitle(locale, p);
            const pluginDescription = localizePluginDescription(locale, p);
            return (
            <div
              key={p.id}
              className={`composer-tools-row composer-tools-row--plugin${
                p.id === activePluginId ? ' active' : ''
              }`}
            >
              <button
                type="button"
                className="composer-tools-row-main"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(p.id);
                  try {
                    await onApply(p);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                aria-busy={pendingId === p.id ? 'true' : undefined}
                title={pluginDescription || pluginTitle}
              >
                <Icon name="sparkles" size={12} />
                <span className="composer-tools-row-body">
                  <strong>{pluginTitle}</strong>
                  {pluginDescription ? (
                    <span className="composer-tools-row-meta">
                      {pluginDescription}
                    </span>
                  ) : (
                    <span className="composer-tools-row-meta">{p.id}</span>
                  )}
                </span>
                {pendingId === p.id ? (
                  <span className="composer-tools-row-pending">{t('pluginCard.applying')}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="composer-tools-row-side"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onShowDetails(p)}
                title={t('pluginCard.detailsAria', { title: pluginTitle })}
                aria-label={t('pluginCard.detailsAria', { title: pluginTitle })}
              >
                <Icon name="eye" size={12} />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ToolsMcpPanel({
  servers,
  templates,
  onInsert,
  onManage,
}: {
  servers: McpServerConfig[];
  templates: McpTemplate[];
  onInsert: (serverId: string) => void;
  onManage: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const visibleServers = useMemo(
    () => servers.filter((s) => mcpServerMatchesQuery(s, query)),
    [servers, query],
  );
  const visibleTemplates = useMemo(
    () => templates.filter((tpl) => mcpTemplateMatchesQuery(tpl, query)).slice(0, 8),
    [templates, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('common.searchEllipsis')}
          aria-label={t('mcpClient.title')}
        />
      </div>
      {visibleServers.length === 0 ? (
        <div className="composer-tools-empty">
          {servers.length === 0
            ? t('mcpClient.emptyTitle')
            : t('pluginsView.emptyNoMatchTitle')}
        </div>
      ) : (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">{t('settings.mediaProviderConfigured')}</div>
          {visibleServers.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(s.id)}
              title={s.label || s.id}
            >
              <Icon name="link" size={12} />
              <span className="composer-tools-row-body">
                <strong>{s.label || s.id}</strong>
                <span className="composer-tools-row-meta">{s.transport}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {visibleTemplates.length > 0 ? (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">{t('entry.tabTemplates')}</div>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onManage}
              title={tpl.label}
            >
              <Icon name="plus" size={12} />
              <span className="composer-tools-row-body">
                <strong>{tpl.label}</strong>
                <span className="composer-tools-row-meta">
                  {tpl.transport}
                  {tpl.category ? ` · ${tpl.category}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="composer-tools-row composer-tools-row-action"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onManage}
      >
        <Icon name="settings" size={12} />
        <span>{t('mcpClient.addServer')}</span>
      </button>
    </>
  );
}

function DesignToolboxPanel({
  actions,
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  activeSkillIds,
  activePluginId,
  activeMcpServerIds,
  activeConnectorIds,
  activeFilePaths,
  onPickAction,
  onPickSkill,
  onPickResource,
  onOpened,
  workspaceContext,
}: {
  actions: DesignToolboxAction[];
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
  activeSkillIds: string[];
  activePluginId: string | null;
  activeMcpServerIds: string[];
  activeConnectorIds: string[];
  activeFilePaths: string[];
  onPickAction: (action: DesignToolboxAction) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickResource: (resource: DesignToolboxResource) => void;
  onOpened?: () => void;
  workspaceContext: WorkspaceCollabContext | null;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  // Fire once when the toolbox panel mounts (i.e. the user opened it).
  useEffect(() => {
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeSkillSet = useMemo(() => new Set(activeSkillIds), [activeSkillIds]);
  const activeMcpServerSet = useMemo(() => new Set(activeMcpServerIds), [activeMcpServerIds]);
  const activeConnectorSet = useMemo(() => new Set(activeConnectorIds), [activeConnectorIds]);
  const activeFileSet = useMemo(() => new Set(activeFilePaths), [activeFilePaths]);
  const resources = useMemo(
    () =>
      buildDesignToolboxResources({
        skills,
        plugins,
        mcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
        locale,
        t,
      }),
    [connectors, locale, mcpServers, mcpTemplates, plugins, projectFiles, skills, t],
  );
  const visibleActions = useMemo(
    () =>
      actions.filter((action) => {
        const skill = findDesignToolboxSkill(action, skills);
        return designToolboxActionMatchesQuery(
          action,
          query,
          skill,
          t,
          skill ? [localizeSkillName(locale, skill), localizeSkillDescription(locale, skill)] : [],
        );
      }),
    [actions, query, skills, locale, t],
  );
  const visibleResources = useMemo(
    () => {
      const source = query
        ? resources.filter((resource) => designToolboxResourceMatchesQuery(resource, query))
        : designToolboxDefaultResources(actions, resources);
      return source.slice(0, query ? 14 : 8);
    },
    [actions, query, resources],
  );

  // One shared hover-detail panel for the whole list — swapping a single
  // portaled panel as the cursor sweeps rows, instead of one panel per row
  // (which ghosted: the close delay left several stacked on screen at once).
  const [toolboxDetail, setToolboxDetail] = useState<{
    key: string;
    left: number;
    top: number;
    node: ReactNode;
  } | null>(null);
  const detailCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelDetailClose() {
    if (detailCloseTimer.current) {
      clearTimeout(detailCloseTimer.current);
      detailCloseTimer.current = null;
    }
  }
  function showToolboxDetail(key: string, rect: DOMRect, node: ReactNode) {
    cancelDetailClose();
    // Plugin rows render a tall visual preview; the helper clamps both axes
    // into the viewport so the fixed panel never lands off-screen on a
    // narrow pane (see computeToolboxDetailPosition).
    const { left, top } = computeToolboxDetailPosition(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      { detailWidth: 264, gap: 8, margin: 8, estimatedHeight: 340 },
    );
    setToolboxDetail({ key, left, top, node });
  }
  function scheduleToolboxDetailClose(key: string) {
    cancelDetailClose();
    detailCloseTimer.current = setTimeout(() => {
      setToolboxDetail((cur) => (cur?.key === key ? null : cur));
      detailCloseTimer.current = null;
    }, 160);
  }
  useEffect(() => () => cancelDetailClose(), []);

  return (
    <>
      <div className="composer-design-toolbox-head">
        <div className="composer-design-toolbox-title">
          <Icon name="lightbulb" size={14} />
          <span>{t('chat.designToolbox.title')}</span>
        </div>
      </div>
      <div className="plus-menu__search">
        <Icon name="search" size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.designToolbox.searchPlaceholder')}
          aria-label={t('chat.designToolbox.searchAria')}
        />
      </div>
      {visibleActions.length > 0 || visibleResources.length > 0 ? (
        <div className="plus-menu__list">
          {visibleActions.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.followupSection')}
            </div>
          ) : null}
          {visibleActions.map((action) => {
            const skill = findDesignToolboxSkill(action, skills);
            const actionTitle = designToolboxActionTitle(action, t);
            const actionDescription = designToolboxActionDescription(action, t);
            const skillName = skill ? localizeSkillName(locale, skill) : null;
            return (
              <ToolboxItemRow
                key={action.id}
                detailKey={action.id}
                icon={action.icon}
                name={actionTitle}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => onPickAction(action)}
                detail={
                  <>
                    <div className="plus-menu__detail-title">{actionTitle}</div>
                    {actionDescription ? (
                      <div className="plus-menu__detail-desc">{actionDescription}</div>
                    ) : null}
                    {skillName ? (
                      <div className="plus-menu__detail-skill">@{skillName}</div>
                    ) : null}
                    <div className="plus-menu__detail-badge">
                      {designToolboxActionBadge(action, t)}
                    </div>
                  </>
                }
              />
            );
          })}
          {visibleResources.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.resourcesSection')}
            </div>
          ) : null}
          {visibleResources.map((resource) => {
            const active = designToolboxResourceIsActive(resource, {
              skillIds: activeSkillSet,
              pluginId: activePluginId,
              mcpServerIds: activeMcpServerSet,
              connectorIds: activeConnectorSet,
              filePaths: activeFileSet,
            });
            return (
              <ToolboxItemRow
                key={resource.key}
                detailKey={resource.key}
                icon={resource.icon}
                name={resource.title}
                active={active}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => {
                  if (resource.kind === 'skill') {
                    onPickSkill(resource.skill);
                  } else {
                    onPickResource(resource);
                  }
                }}
                detail={
                  // Plugin rows reuse the rich visual preview (poster /
                  // sandboxed example iframe + meta); every other kind keeps
                  // the compact text detail since it has no preview asset.
                  resource.kind === 'plugin' ? (
                    <ComposerPluginPreview
                      record={resource.plugin}
                      locale={locale}
                      workspaceContext={workspaceContext}
                    />
                  ) : (
                    <>
                      <div className="plus-menu__detail-title">{resource.title}</div>
                      {resource.subtitle ? (
                        <div className="plus-menu__detail-desc">{resource.subtitle}</div>
                      ) : null}
                      <div className="plus-menu__detail-skill">
                        {designToolboxResourceKindLabel(resource.kind, t)}
                      </div>
                      <div className="plus-menu__detail-badge">
                        {active ? t('chat.designToolbox.selected') : resource.badge}
                      </div>
                    </>
                  )
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="plus-menu__empty">
          {t('chat.designToolbox.noResources', { query })}
        </div>
      )}
      {toolboxDetail
        ? createPortal(
            <div
              className="plus-menu__detail"
              style={{ left: toolboxDetail.left, top: toolboxDetail.top }}
              onMouseEnter={cancelDetailClose}
              onMouseLeave={() => scheduleToolboxDetailClose(toolboxDetail.key)}
            >
              {toolboxDetail.node}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// A single toolbox row, styled like the Connectors/Plugins submenu rows
// (single line: icon + name). Clicking applies the entry; hovering shows a
// third-level detail panel (title / description / @skill / badge). The detail
// panel is PORTALED to <body> because the parent flyout uses `overflow-y: auto`
// (height-capped scroll) which would otherwise clip a nested panel.
// The hover detail panel is owned by the PARENT
// (DesignToolboxPanel) as ONE shared panel — not per-row — so sweeping across
// rows swaps the single panel in place instead of stacking several portaled
// panels that briefly coexist (the close delay would otherwise leave 2-4 of
// them on screen at once, reading as ghosting). The row just reports hover
// enter/leave with its rect + detail node.
function ToolboxItemRow({
  icon,
  name,
  active,
  detailKey,
  detail,
  onHover,
  onLeave,
  onPick,
}: {
  icon: IconName;
  name: string;
  active?: boolean;
  detailKey: string;
  detail: ReactNode;
  onHover: (key: string, rect: DOMRect, detail: ReactNode) => void;
  onLeave: (key: string) => void;
  onPick: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={rowRef}
      className="plus-menu__subitem"
      onMouseEnter={() => {
        const r = rowRef.current?.getBoundingClientRect();
        if (r) onHover(detailKey, r, detail);
      }}
      onMouseLeave={() => onLeave(detailKey)}
    >
      <button
        type="button"
        role="menuitem"
        className={`plus-menu__item${active ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
      >
        <Icon name={icon} size={14} className="plus-menu__item-icon" />
        <span>{name}</span>
      </button>
    </div>
  );
}

function ToolsSkillsPanel({
  skills,
  currentSkillId,
  onPick,
}: {
  skills: SkillSummary[];
  currentSkillId: string | null;
  onPick: (skill: SkillSummary) => void | Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visibleSkills = useMemo(
    () => skills.filter((s) => skillMatchesQuery(s, query)).slice(0, 24),
    [skills, query],
  );
  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('pluginsView.searchSkills')}
          aria-label={t('pluginsView.searchSkills')}
        />
      </div>
      {visibleSkills.length === 0 ? (
        <div className="composer-tools-empty">
          {skills.length === 0
            ? t('pluginsView.emptyOfficialSkillsTitle')
            : t('pluginsView.emptyNoMatchTitle')}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visibleSkills.map((skill) => {
            const active = skill.id === currentSkillId;
            return (
              <button
                key={skill.id}
                type="button"
                role="menuitem"
                className={`composer-tools-row${active ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(skill.id);
                  try {
                    await onPick(skill);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                title={localizeSkillDescription(locale, skill)}
              >
                <Icon name={active ? 'check' : 'file'} size={12} />
                <span className="composer-tools-row-body">
                  <strong>{localizeSkillName(locale, skill)}</strong>
                  <span className="composer-tools-row-meta">
                    {skill.mode}
                    {skill.surface ? ` · ${skill.surface}` : ''}
                  </span>
                </span>
                {pendingId === skill.id ? (
                  <span className="composer-tools-row-pending">{t('pluginCard.applying')}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.source,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}


function buildDesignToolboxResources({
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  locale,
  t,
}: DesignToolboxResourceIndex & { locale: Locale; t: TranslateFn }): DesignToolboxResource[] {
  const resources: DesignToolboxResource[] = [];

  for (const skill of skills) {
    const title = localizeSkillName(locale, skill);
    const subtitle = localizeSkillDescription(locale, skill);
    resources.push({
      key: `skill:${skill.id}`,
      kind: 'skill',
      id: skill.id,
      title,
      subtitle,
      badge: designToolboxSkillBadge(skill, t),
      icon: designToolboxSkillIcon(skill),
      searchText: [
        'skill',
        skill.id,
        skill.name,
        title,
        subtitle,
        skill.mode,
        skill.surface ?? '',
        skill.category ?? '',
        ...skill.triggers,
      ].join(' '),
      skill,
    });
  }

  for (const plugin of plugins) {
    const subtitle = localizePluginDescription(locale, plugin) || plugin.id;
    resources.push({
      key: `plugin:${plugin.id}`,
      kind: 'plugin',
      id: plugin.id,
      title: localizePluginTitle(locale, plugin),
      subtitle,
      badge: plugin.manifest?.od?.kind ?? 'plugin',
      icon: 'sparkles',
      searchText: [
        'plugin',
        plugin.id,
        plugin.title,
        plugin.sourceKind,
        plugin.source,
        subtitle,
        ...(plugin.manifest?.tags ?? []),
        plugin.manifest?.od?.kind ?? '',
        plugin.manifest?.od?.scenario ?? '',
        plugin.manifest?.od?.mode ?? '',
      ].join(' '),
      plugin,
    });
  }

  for (const server of mcpServers) {
    const title = server.label || server.id;
    const subtitle = server.command || server.url || server.transport;
    resources.push({
      key: `mcp:${server.id}`,
      kind: 'mcp',
      id: server.id,
      title,
      subtitle,
      badge: 'MCP',
      icon: 'link',
      searchText: [
        'mcp',
        server.id,
        title,
        subtitle,
        server.transport,
        server.templateId ?? '',
      ].join(' '),
      server,
    });
  }

  for (const template of mcpTemplates) {
    resources.push({
      key: `mcp-template:${template.id}`,
      kind: 'mcp-template',
      id: template.id,
      title: template.label,
      subtitle: template.description,
      badge: template.category,
      icon: 'plus',
      searchText: [
        'mcp template',
        template.id,
        template.label,
        template.description,
        template.transport,
        template.category,
        template.homepage ?? '',
        template.example ?? '',
      ].join(' '),
      template,
    });
  }

  for (const connector of connectors) {
    const toolCount = connector.toolCount ?? connector.tools.length;
    resources.push({
      key: `connector:${connector.id}`,
      kind: 'connector',
      id: connector.id,
      title: connector.name,
      subtitle: [
        connector.description ?? connector.provider,
        toolCount > 0 ? `${toolCount} tools` : null,
        connector.accountLabel ?? null,
      ].filter(Boolean).join(' · '),
      badge: connector.category || 'connector',
      icon: 'link',
      searchText: [
        'connector',
        connector.id,
        connector.name,
        connector.provider,
        connector.category,
        connector.description ?? '',
        connector.accountLabel ?? '',
        ...(connector.featuredToolNames ?? []),
        ...(connector.allowedToolNames ?? []),
        ...connector.tools.slice(0, 20).flatMap((tool) => [tool.name, tool.title, tool.description ?? '']),
      ].join(' '),
      connector,
    });
  }

  const seenFiles = new Set<string>();
  for (const file of projectFiles) {
    if (file.type === 'dir') continue;
    const path = file.path ?? file.name;
    if (!path || seenFiles.has(path)) continue;
    seenFiles.add(path);
    resources.push({
      key: `file:${path}`,
      kind: 'file',
      id: path,
      title: path,
      subtitle: [file.kind, file.mime, file.artifactKind ?? ''].filter(Boolean).join(' · '),
      badge: file.artifactKind ?? file.kind,
      icon: looksLikeImage(path) ? 'image' : 'file',
      searchText: [
        'file',
        'design file',
        path,
        file.name,
        file.kind,
        file.mime,
        file.artifactKind ?? '',
      ].join(' '),
      file,
    });
  }

  return resources;
}

function designToolboxResourceMatchesQuery(
  resource: DesignToolboxResource,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return resource.searchText.toLowerCase().includes(q);
}

function designToolboxDefaultResources(
  actions: DesignToolboxAction[],
  resources: DesignToolboxResource[],
): DesignToolboxResource[] {
  const out: DesignToolboxResource[] = [];
  const seen = new Set<string>();
  function add(resource: DesignToolboxResource | null | undefined) {
    if (!resource || seen.has(resource.key)) return;
    seen.add(resource.key);
    out.push(resource);
  }
  function addByKindId(kind: DesignToolboxResourceKind, id: string) {
    add(resources.find((resource) => resource.kind === kind && resource.id === id));
  }

  addByKindId('skill', 'creative-director');
  for (const action of actions) {
    const skill = resources.find((resource) =>
      resource.kind === 'skill'
      && action.preferredSkillIds.some((id) => resource.skill.id === id || resource.skill.name === id),
    );
    add(skill);
  }
  for (const term of ['design', 'image', 'video', 'motion', 'figma']) {
    for (const resource of resources) {
      if (out.length >= 8) return out;
      if (resource.kind !== 'skill' && designToolboxResourceMatchesQuery(resource, term)) {
        add(resource);
      }
    }
  }
  return out;
}

function designToolboxResourceKindLabel(
  kind: DesignToolboxResourceKind,
  t: TranslateFn,
): string {
  switch (kind) {
    case 'skill':
      return t('chat.designToolbox.kind.skill');
    case 'plugin':
      return t('chat.designToolbox.kind.plugin');
    case 'mcp':
      return t('chat.designToolbox.kind.mcp');
    case 'mcp-template':
      return t('chat.designToolbox.kind.mcpTemplate');
    case 'connector':
      return t('chat.designToolbox.kind.connector');
    case 'file':
      return t('chat.designToolbox.kind.designFile');
  }
}

function designToolboxResourceIsActive(
  resource: DesignToolboxResource,
  active: {
    skillIds: Set<string>;
    pluginId: string | null;
    mcpServerIds: Set<string>;
    connectorIds: Set<string>;
    filePaths: Set<string>;
  },
): boolean {
  switch (resource.kind) {
    case 'skill':
      return active.skillIds.has(resource.skill.id);
    case 'plugin':
      return active.pluginId === resource.plugin.id;
    case 'mcp':
      return active.mcpServerIds.has(resource.server.id);
    case 'connector':
      return active.connectorIds.has(resource.connector.id);
    case 'file':
      return active.filePaths.has(resource.file.path ?? resource.file.name);
    case 'mcp-template':
      return false;
  }
}


function isDesignToolboxSkill(skill: SkillSummary): boolean {
  const category = skill.category ?? '';
  if (
    [
      'animation-motion',
      'creative-direction',
      'image-generation',
      'video-generation',
      'web-artifacts',
    ].includes(category)
  ) {
    return true;
  }
  return [
    'animation',
    'motion',
    'gsap',
    'polish',
    'critique',
    'taste',
    'anti slop',
    'anti ai',
    'image',
    'asset',
    'reference',
    'icon',
    'logo',
    'chart',
    'diagram',
    'echarts',
    'three',
    'spline',
    'rive',
    'lottie',
    'mapbox',
    'deck.gl',
    'video',
    'frontend',
    'beautify',
  ].some((term) => skillMatchesQuery(skill, term));
}

function designToolboxDefaultSkills(
  actions: DesignToolboxAction[],
  skills: SkillSummary[],
): SkillSummary[] {
  const out: SkillSummary[] = [];
  const seen = new Set<string>();
  function add(skill: SkillSummary | null | undefined) {
    if (!skill || seen.has(skill.id)) return;
    seen.add(skill.id);
    out.push(skill);
  }
  for (const action of actions) {
    add(findDesignToolboxSkill(action, skills));
  }
  for (const action of actions) {
    for (const id of action.preferredSkillIds) {
      add(skills.find((skill) => skill.id === id || skill.name === id));
    }
  }
  return out;
}

function designToolboxSkillBadge(skill: SkillSummary, t: TranslateFn): string {
  if (skill.mode === 'video' || skill.category === 'video-generation') return t('chat.designToolbox.badge.video');
  if (skill.mode === 'image' || skill.category === 'image-generation') return t('chat.designToolbox.badge.image');
  if (skill.category === 'animation-motion') return t('chat.designToolbox.badge.motion');
  if (skill.category === 'creative-direction') return t('chat.designToolbox.badge.polish');
  return skill.mode;
}

function designToolboxSkillIcon(skill: SkillSummary): IconName {
  if (skill.mode === 'video' || skill.category === 'video-generation') return 'play';
  if (skill.mode === 'image' || skill.category === 'image-generation') return 'image';
  if (skill.category === 'animation-motion') return 'sliders';
  if (skill.category === 'creative-direction') return 'sparkles';
  return 'file';
}

function designToolboxContextLine(
  workspaceItem: WorkspaceContextItem | null,
  t: TranslateFn,
): string {
  if (!workspaceItem) {
    return t('chat.designToolbox.prompt.contextGeneric');
  }
  const label = workspaceItem.label || workspaceItem.path || workspaceItem.title || workspaceItem.id;
  return t('chat.designToolbox.prompt.contextSpecific', {
    kind: designToolboxWorkspaceKindLabel(workspaceItem.kind, t),
    label,
  });
}

function designToolboxDraftLine(activeDraft: string, t: TranslateFn): string {
  const trimmed = activeDraft.trim();
  if (!trimmed) return '';
  return t('chat.designToolbox.prompt.preserveDraft', { draft: trimmed });
}

function designToolboxWorkspaceKindLabel(
  kind: WorkspaceContextItem['kind'],
  t: TranslateFn,
): string {
  switch (kind) {
    case 'browser':
      return t('chat.designToolbox.context.browser');
    case 'design-files':
      return t('chat.designToolbox.context.designFiles');
    case 'design-system':
      return t('chat.designToolbox.context.designSystem');
    case 'folder':
    case 'project':
    case 'local-code':
      return t('chat.designToolbox.context.folder');
    case 'terminal':
      return t('chat.designToolbox.context.terminal');
    case 'side-chat':
      return t('chat.designToolbox.context.sideChat');
    case 'live-artifact':
      return t('chat.designToolbox.context.liveArtifact');
    case 'file':
    default:
      return t('chat.designToolbox.context.file');
  }
}

function designToolboxActionPrompt({
  action,
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  action: DesignToolboxAction;
  skill: SkillSummary | null;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  const skillLine = skill
    ? t('chat.designToolbox.prompt.selectedSkill', { skill: skill.name })
    : t('chat.designToolbox.prompt.noSkill');
  const resourceLines = designToolboxResourceIndexLines(resourceIndex, t);
  const draftLine = designToolboxDraftLine(activeDraft, t);
  const base = [
    designToolboxContextLine(workspaceItem, t),
    skillLine,
    ...resourceLines,
    draftLine,
  ].filter(Boolean);

  switch (action.id) {
    case 'auto-match':
      return [
        ...base,
        t('chat.designToolbox.prompt.autoMatchIntro'),
        t('chat.designToolbox.prompt.autoMatchStep1'),
        t('chat.designToolbox.prompt.autoMatchStep2'),
        t('chat.designToolbox.prompt.autoMatchStep3'),
        t('chat.designToolbox.prompt.autoMatchStep4'),
      ].join('\n');
    case 'asset-search':
      return [
        ...base,
        t('chat.designToolbox.prompt.assetSearch'),
      ].join('\n');
    case 'icon-workflow':
      return [
        ...base,
        t('chat.designToolbox.prompt.iconWorkflow'),
      ].join('\n');
    case 'image-replace':
      return [
        ...base,
        t('chat.designToolbox.prompt.imageReplace'),
      ].join('\n');
    case 'reference-extract':
      return [
        ...base,
        t('chat.designToolbox.prompt.referenceExtract'),
      ].join('\n');
    case 'motion':
      return [
        ...base,
        t('chat.designToolbox.prompt.motion'),
      ].join('\n');
    case 'motion-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.motionPolish'),
      ].join('\n');
    case 'transition-motion':
      return [
        ...base,
        t('chat.designToolbox.prompt.transitionMotion'),
      ].join('\n');
    case 'plan-outline':
      return [
        ...base,
        t('chat.designToolbox.prompt.planOutline'),
      ].join('\n');
    case 'threejs-scene':
      return [
        ...base,
        t('chat.designToolbox.prompt.threejsScene'),
      ].join('\n');
    case 'anti-ai-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.antiAiPolish'),
      ].join('\n');
    case 'visual-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.visualPolish'),
      ].join('\n');
    case 'image-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.imageGen'),
      ].join('\n');
    case 'chart-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.chartGen'),
      ].join('\n');
    case 'logo-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.logoGen'),
      ].join('\n');
    case 'video-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.videoGen'),
      ].join('\n');
  }

  return [
    ...base,
    t('chat.designToolbox.prompt.autoMatchIntro'),
  ].join('\n');
}

function designToolboxSkillPrompt({
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  skill: SkillSummary;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  return [
    designToolboxContextLine(workspaceItem, t),
    t('chat.designToolbox.prompt.useSkill', { skill: skill.name }),
    ...designToolboxResourceIndexLines(resourceIndex, t),
    designToolboxDraftLine(activeDraft, t),
    t('chat.designToolbox.prompt.skillInstruction'),
  ].filter(Boolean).join('\n');
}

function designToolboxResourcePrompt({
  resource,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  resource: Exclude<DesignToolboxResource, { kind: 'skill' }>;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  const base = [
    designToolboxContextLine(workspaceItem, t),
    t('chat.designToolbox.prompt.selectedResource', {
      kind: designToolboxResourceKindLabel(resource.kind, t),
      title: resource.title,
      id: resource.id,
    }),
    resource.subtitle ? t('chat.designToolbox.prompt.resourceDescription', { description: resource.subtitle }) : '',
    ...designToolboxResourceIndexLines(resourceIndex, t),
    designToolboxDraftLine(activeDraft, t),
  ].filter(Boolean);

  switch (resource.kind) {
    case 'plugin':
      return [
        ...base,
        t('chat.designToolbox.prompt.pluginResource'),
      ].join('\n');
    case 'mcp':
      return [
        ...base,
        t('chat.designToolbox.prompt.mcpResource'),
      ].join('\n');
    case 'mcp-template':
      return [
        ...base,
        t('chat.designToolbox.prompt.mcpTemplateResource'),
      ].join('\n');
    case 'connector':
      return [
        ...base,
        t('chat.designToolbox.prompt.connectorResource'),
      ].join('\n');
    case 'file':
      return [
        ...base,
        t('chat.designToolbox.prompt.fileResource'),
      ].join('\n');
  }
}

function designToolboxResourceIndexLines(
  index: DesignToolboxResourceIndex,
  t: TranslateFn,
): string[] {
  const files = index.projectFiles
    .filter((file) => file.type !== 'dir')
    .map((file) => file.path ?? file.name);
  return [
    t('chat.designToolbox.prompt.resourceIndex', {
      skills: index.skills.length,
      plugins: index.plugins.length,
      mcpEnabled: index.mcpServers.length,
      mcpTemplates: index.mcpTemplates.length,
      connectors: index.connectors.length,
      files: files.length,
    }),
    designToolboxCompactLine(t('chat.designToolbox.prompt.searchableSkills'), index.skills.map((skill) => skill.name), 60, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.searchablePlugins'), index.plugins.map((plugin) => plugin.title), 40, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.availableMcp'), [
      ...index.mcpServers.map((server) => server.label || server.id),
      ...index.mcpTemplates.map((template) => t('chat.designToolbox.prompt.mcpTemplateName', { name: template.label })),
    ], 40, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.connectedConnectors'), index.connectors.map((connector) => connector.name), 30, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.referenceDesignFiles'), files, 40, t),
    t('chat.designToolbox.prompt.processRule'),
  ].filter(Boolean);
}

function designToolboxCompactLine(
  label: string,
  values: string[],
  limit: number,
  t: TranslateFn,
): string {
  const clean = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (clean.length === 0) return '';
  const shown = clean.slice(0, limit);
  const suffix = clean.length > shown.length
    ? t('chat.designToolbox.prompt.moreSuffix', { count: clean.length - shown.length })
    : '';
  return t('chat.designToolbox.prompt.compactLine', {
    label,
    values: shown.join(', '),
    suffix,
  });
}

function skillMentionRank(skill: SkillSummary, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  if (id.startsWith(q) || name.startsWith(q)) return 0;
  return 1;
}

function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function mcpTemplateMatchesQuery(tpl: McpTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    tpl.id,
    tpl.label,
    tpl.description,
    tpl.transport,
    tpl.category,
    tpl.homepage ?? '',
    tpl.example ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function pluginSourceLabel(plugin: InstalledPluginRecord, t: TranslateFn): string {
  return plugin.sourceKind === 'bundled' ? t('chat.mentionPluginOfficial') : t('chat.mentionPluginMine');
}

function ToolsImportPanel({
  t,
  onLinkFolder,
  currentDesignSystemId,
  onSwitchDesignSystem,
}: {
  t: TranslateFn;
  onLinkFolder: () => Promise<void> | void;
  currentDesignSystemId?: string | null;
  // When omitted (no active project) the design-system import row stays
  // disabled with the existing "Coming soon" affordance so users aren't
  // routed into a picker that has nothing to PATCH. Returns true on a
  // successful PATCH so the picker can close itself; false leaves the
  // picker open so the user can retry.
  onSwitchDesignSystem?: (
    designSystemId: string | null,
    title: string | null,
  ) => Promise<boolean>;
}) {
  const [view, setView] = useState<'root' | 'designSystems'>('root');

  if (view === 'designSystems' && onSwitchDesignSystem) {
    return (
      <DesignSystemSwitchPicker
        t={t}
        currentDesignSystemId={currentDesignSystemId}
        onSelect={onSwitchDesignSystem}
        onBack={() => setView('root')}
      />
    );
  }

  return (
    <div className="composer-tools-list">
      <ImportItem icon="upload" label={t('chat.importFig')} t={t} />
      <ImportItem icon="grid" label={t('chat.importWeb')} t={t} />
      <ImportItem
        icon="folder"
        label={t('chat.importFolder')}
        t={t}
        enabled
        onClick={() => void onLinkFolder()}
      />
      <ImportItem
        icon="sparkles"
        label={t('chat.importSkills')}
        t={t}
        enabled={!!onSwitchDesignSystem}
        onClick={() => setView('designSystems')}
        testId="composer-import-design-systems"
      />
      <ImportItem icon="file" label={t('chat.importProject')} t={t} />
    </div>
  );
}

function ImportItem({
  icon,
  label,
  t,
  enabled,
  onClick,
  testId,
}: {
  icon: "upload" | "link" | "grid" | "folder" | "sparkles" | "file";
  label: string;
  t: TranslateFn;
  enabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`composer-import-item${enabled ? ' composer-import-item-enabled' : ''}`}
      role="menuitem"
      tabIndex={-1}
      disabled={!enabled}
      title={enabled ? label : t('chat.importComingSoon')}
      onClick={enabled && onClick ? onClick : (e) => e.preventDefault()}
      data-testid={testId}
    >
      <span className="ico" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="composer-import-item-label">{label}</span>
      {!enabled && <span className="composer-import-item-soon">{t('chat.importSoon')}</span>}
    </button>
  );
}

function SlashPopover({
  commands,
  activeIndex,
  onPick,
  onHover,
  t,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
  t: TranslateFn;
}) {
  return (
    <div className="slash-popover" data-testid="slash-popover">
      <div className="slash-popover-head">
        <span>{t('pet.slashPopoverTitle')}</span>
        <span className="slash-popover-hint">{t('pet.slashPopoverHint')}</span>
      </div>
      {/* The rows live in their own scroll port, not directly in the
          height-capped popover column — see `.slash-popover-list`. Carrying
          `role="listbox"` down here also keeps the header out of the
          listbox, whose only children may be options. */}
      <div
        className="slash-popover-list"
        role="listbox"
        aria-label={t('pet.slashPopoverAria')}
      >
        {commands.map((cmd, idx) => {
          const active = idx === activeIndex;
          return (
            <button
              key={cmd.id}
              id={`slash-opt-${idx}`}
              type="button"
              role="option"
              aria-selected={active}
              className={`slash-item${active ? ' active' : ''}`}
              onMouseDown={(e) => {
                // Prevent the textarea from losing focus before the click
                // handler fires — otherwise selectionStart resets and the
                // pick replacement targets the wrong substring.
                e.preventDefault();
              }}
              onMouseEnter={() => onHover(idx)}
              onClick={() => onPick(cmd)}
            >
              <span className="slash-item-icon" aria-hidden>
                <Icon name={cmd.icon} size={13} />
              </span>
              <span className="slash-item-body">
                <span className="slash-item-row">
                  <code className="slash-item-label">{cmd.label}</code>
                  {cmd.argHint ? (
                    <span className="slash-item-arg">{cmd.argHint}</span>
                  ) : null}
                </span>
                <span className="slash-item-desc">{t(cmd.descKey)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MentionPopover({
  files,
  workspaceContexts,
  connectors,
  plugins,
  skills,
  mcpServers,
  query,
  tab,
  onTabChange,
  activeIndex,
  stagedSkillIds,
  onPickFile,
  onPickWorkspaceContext,
  onPickPlugin,
  onPickSkill,
  onPickMcp,
  onPickConnector,
}: {
  files: ProjectFile[];
  workspaceContexts: WorkspaceContextItem[];
  connectors: ConnectorDetail[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  query: string;
  tab: MentionTab;
  onTabChange: (tab: MentionTab) => void;
  activeIndex: number;
  stagedSkillIds: Set<string>;
  onPickFile: (path: string) => void;
  onPickWorkspaceContext: (item: WorkspaceContextItem) => void;
  onPickPlugin: (record: InstalledPluginRecord) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickMcp: (server: McpServerConfig) => void;
  onPickConnector: (connector: ConnectorDetail) => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const tabs: Array<{ id: MentionTab; label: string }> = [
    { id: 'all', label: t('chat.mentionTabAll') },
    { id: 'files', label: t('chat.mentionTabFiles') },
    { id: 'tabs', label: t('chat.mentionTabTabs') },
    { id: 'plugins', label: t('chat.mentionTabPlugins') },
    { id: 'skills', label: t('chat.mentionTabSkills') },
    { id: 'mcp', label: t('chat.mentionTabMcp') },
    { id: 'connectors', label: t('chat.mentionTabConnectors') },
  ];
  const showTabs = tab === 'all' || tab === 'tabs';
  const showFiles = tab === 'all' || tab === 'files';
  const showPlugins = tab === 'all' || tab === 'plugins';
  const showSkills = tab === 'all' || tab === 'skills';
  const showMcp = tab === 'all' || tab === 'mcp';
  const showConnectors = tab === 'all' || tab === 'connectors';
  const hasVisibleResults =
    (showFiles && files.length > 0) ||
    (showTabs && workspaceContexts.length > 0) ||
    (showPlugins && plugins.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showMcp && mcpServers.length > 0) ||
    (showConnectors && connectors.length > 0);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [connectors, files, plugins, skills, mcpServers, tab, workspaceContexts]);
  let optionIndex = 0;
  return (
    <div className="mention-popover" data-testid="mention-popover">
      <div className="mention-tabs" role="tablist" aria-label={t('chat.mentionTabsAria')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`mention-tab${tab === item.id ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mention-results" ref={ref} role="listbox" id="mention-listbox">
        {!hasVisibleResults ? (
          <div className="mention-empty">
            {query ? (
              <>{t('chat.mentionNoResults', { query })}</>
            ) : (
              <>{t('chat.mentionSearchPrompt')}</>
            )}
          </div>
        ) : null}
        {showFiles && files.length > 0 ? (
          <>
            <div className="mention-section-label" data-testid="mention-section-label">{t('chat.mentionSectionFiles')}</div>
            {files.map((f) => {
              const key = f.path ?? f.name;
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`file-${key}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickFile(key)}
                >
                  <Icon name="file" size={12} />
                  <span className="mention-item-body">
                    <strong data-testid="mention-item-name">{projectFileMentionTitle(f, key)}</strong>
                    <span className="mention-meta mention-meta--desc mention-meta--path">
                      {projectFileMentionDescription(f, key)}
                    </span>
                  </span>
                  {f.size != null ? (
                    <span className="mention-meta mention-item-kind">{prettySize(f.size)}</span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : null}
        {showTabs && workspaceContexts.length > 0 ? (
          <>
            <div className="mention-section-label" data-testid="mention-section-label">{t('chat.mentionSectionTabs')}</div>
            {workspaceContexts.map((item) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`workspace-${item.kind}-${item.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item mention-item--workspace${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickWorkspaceContext(item)}
                  title={workspaceContextTitle(item, t)}
                >
                  <Icon name={workspaceContextIcon(item)} size={12} />
                  <span className="mention-item-body">
                    <strong data-testid="mention-item-name">{item.label}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {workspaceContextDescription(item, t)}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{workspaceContextKindLabel(item.kind, t)}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showPlugins && plugins.length > 0 ? (
          <>
            <div className="mention-section-label" data-testid="mention-section-label">{t('chat.mentionSectionPlugins')}</div>
            {plugins.map((p) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              const pluginTitle = localizePluginTitle(locale, p);
              const pluginDescription = localizePluginDescription(locale, p);
              return (
                <button
                  key={`plugin-${p.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item mention-item--plugin${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickPlugin(p)}
                  title={pluginDescription || pluginTitle}
                >
                  <Icon name="sparkles" size={12} />
                  <span className="mention-item-body">
                    <strong data-testid="mention-item-name">{pluginTitle}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {pluginDescription || p.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{pluginSourceLabel(p, t)}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showSkills && skills.length > 0 ? (
          <>
            <div className="mention-section-label" data-testid="mention-section-label">{t('chat.mentionSectionSkills')}</div>
            {skills.map((skill) => {
              const flat = optionIndex;
              optionIndex += 1;
              const rowActive = flat === activeIndex;
              const isStaged = stagedSkillIds.has(skill.id);
              return (
                <button
                  key={`skill-${skill.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={rowActive}
                  className={`mention-item${rowActive ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickSkill(skill)}
                  title={localizeSkillDescription(locale, skill)}
                >
                  <Icon name={isStaged ? 'check' : 'file'} size={12} />
                  <span className="mention-item-body">
                    <strong data-testid="mention-item-name">{localizeSkillName(locale, skill)}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {localizeSkillDescription(locale, skill) || skill.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{isStaged ? t('chat.mentionActiveSkill') : skill.mode}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showMcp && mcpServers.length > 0 ? (
          <>
            <div className="mention-section-label" data-testid="mention-section-label">{t('chat.mentionSectionMcp')}</div>
            {mcpServers.map((server) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`mcp-${server.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickMcp(server)}
                  title={t('chat.mentionUseMcpTitle', { name: server.label || server.id })}
                >
                  <Icon name="link" size={12} />
                  <span className="mention-item-body">
                    <strong data-testid="mention-item-name">{server.label || server.id}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {server.url || server.command || server.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{server.transport}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showConnectors && connectors.length > 0 ? (
          <>
            <div className="mention-section-label" data-testid="mention-section-label">{t('chat.mentionSectionConnectors')}</div>
            {connectors.map((connector) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`connector-${connector.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickConnector(connector)}
                  title={t('chat.mentionUseConnectorTitle', { name: connector.name })}
                >
                  <Icon name="link" size={12} />
                  <span className="mention-item-body">
                    <strong data-testid="mention-item-name">{connector.name}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {connector.description || connector.provider || connector.id}
                    </span>
                  </span>
                  <span className="mention-meta mention-item-kind">{connector.accountLabel ?? connector.provider}</span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripInlineMentionToken(text: string, label: string): string {
  const token = inlineMentionToken(label);
  return text.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

function stripInlineMentionLabels(text: string, labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  return uniqueLabels.reduce(
    (current, label) => stripInlineMentionToken(current, label),
    text,
  );
}

function loadComposerDraft(key?: string): string | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveComposerDraft(key: string | undefined, draft: string) {
  if (!key || typeof window === 'undefined') return;
  try {
    if (draft) {
      window.localStorage.setItem(key, draft);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in privacy modes; the composer should still work.
  }
}

function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
