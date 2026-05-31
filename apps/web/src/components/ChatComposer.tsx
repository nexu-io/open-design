import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from 'react-dom';
import { useI18n, useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { useAnalytics } from '../analytics/provider';
import {
  trackChatPanelClick,
  trackFileUploadResult,
} from '../analytics/events';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { IMAGE_MODELS } from "../media/models";
import { projectRawUrl, uploadProjectFiles, openFolderDialog, fetchConnectors } from "../providers/registry";
import { patchProject } from "../state/projects";
import { fetchMcpServers } from "../state/mcp";
import type { McpServerConfig, McpTemplate } from "../state/mcp";
import { listPlugins } from "../state/projects";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ProjectFile, ProjectMetadata, SkillSummary } from "../types";
import type {
  ContextItem,
  ConnectorDetail,
  InstalledPluginRecord,
  PluginSourceKind,
  ResearchOptions,
  RunContextSelection,
} from '@open-design/contracts';
import { buildVisualAnnotationAttachment, commentTargetDisplayName } from '../comments';
import { Icon } from "./Icon";
import { PluginDetailsModal } from "./PluginDetailsModal";
import { PluginsSection, type PluginsSectionHandle } from "./PluginsSection";
import { BUILT_IN_PETS, CUSTOM_PET_ID } from "./pet/pets";
import {
  buildInlineMentionParts,
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { isImeComposing } from '../utils/imeComposing';
import {
  reconcileInsertions,
  stripPluginInsertedTokens,
  type TrackedInsertion,
} from '../utils/pluginInsertionTracking';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from "./PreviewDrawOverlay";

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import' | 'pet';

type MentionTab = 'all' | 'plugins' | 'skills' | 'mcp' | 'connectors' | 'files';

const USER_PLUGIN_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

const COMPOSER_TEXTAREA_MIN_HEIGHT = 88;
const COMPOSER_TEXTAREA_MAX_HEIGHT = 184;

function composerTextareaMaxHeight(): number {
  if (typeof window === 'undefined') return COMPOSER_TEXTAREA_MAX_HEIGHT;
  return Math.max(
    COMPOSER_TEXTAREA_MIN_HEIGHT,
    Math.min(COMPOSER_TEXTAREA_MAX_HEIGHT, Math.round(window.innerHeight * 0.34)),
  );
}

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

interface Props {
  projectId: string | null;
  projectFiles: ProjectFile[];
  streaming: boolean;
  sendDisabled?: boolean;
  initialDraft?: string;
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
  // Optional pet wiring — when present, the composer renders a small
  // 🐾 button + popover so users can adopt / wake / tuck a pet without
  // leaving chat. Typing `/pet` (or `/pet wake|tuck|<id>`) is parsed
  // out of the draft and routed to the same handlers.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  researchAvailable?: boolean;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  // SenseAudio BYOK image-model picker shown above the textarea. Hidden
  // when the active chat protocol is anything other than 'senseaudio',
  // so the composer stays clean for every other BYOK tab. The state
  // owner is ProjectView (per-session, reset on refresh); ChatComposer
  // is a fully controlled select.
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
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
}

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  restoreDraft: (draft: {
    text: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
  }) => void;
  focus: () => void;
}

export interface ChatSendMeta {
  research?: ResearchOptions;
  context?: RunContextSelection;
  // Per-turn skill ids picked via the @-mention popover. The chat layer
  // forwards these to the daemon's `skillIds` field so the system prompt
  // for this run only is composed with the extra skill bodies, without
  // touching the project's persistent `skillId`.
  skillIds?: string[];
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
      streaming,
      sendDisabled = false,
      initialDraft,
      draftStorageKey,
      onEnsureProject,
      commentAttachments = [],
      onRemoveCommentAttachment,
      skills = [],
      onSend,
      onStop,
      onOpenMcpSettings,
      petConfig,
      onAdoptPet,
      onTogglePet,
      onOpenPetSettings,
      researchAvailable = false,
      projectMetadata,
      onProjectMetadataChange,
      byokApiProtocol,
      byokImageModel,
      onChangeByokImageModel,
      currentSkillId = null,
      onProjectSkillChange,
      pinnedPluginId = null,
      footerAccessory,
    },
    ref
  ) {
    const t = useT();
    const analytics = useAnalytics();
    const [draft, setDraft] = useState(
      () => initialDraft ?? loadComposerDraft(draftStorageKey) ?? "",
    );
    // Synchronous mirror of the latest committed draft value.
    // `updateDraft` reads this as `prev` instead of relying on the
    // closure `draft` (which only updates after re-render) or
    // `setDraft((prev) => …)` (whose updater is double-invoked
    // under React StrictMode and would mutate
    // `pluginInsertedTokensRef` twice). The ref is updated
    // synchronously by `updateDraft` before `setDraft`, so the
    // next call sees a fresh `prev` even when React batches
    // multiple updates within one tick. Initialized from the same
    // source as the React state to keep the two in lockstep on
    // first render. See `updateDraft` below and #2929 round 5.
    const draftRef = useRef<string>(
      initialDraft ?? loadComposerDraft(draftStorageKey) ?? "",
    );

    // chat_panel page_view fires from ProjectView (which outlives
    // conversation switches) so the event measures real chat-panel
    // entries rather than ChatComposer remounts. See PR #2285 review
    // 2026-05-20 04:08 for the rationale.
    const [staged, setStaged] = useState<ChatAttachment[]>([]);
    const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>([]);
    const streamingAnnotationSendPendingRef = useRef(false);
    const [streamingAnnotationSendPending, setStreamingAnnotationSendPendingState] = useState(false);
    // Skills the user has @-mentioned for this turn. We dedupe on id and
    // strip the chip when the user removes the corresponding `@<skill>`
    // token from the draft, keeping draft and chips in sync.
    const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
    const [stagedMcpServers, setStagedMcpServers] = useState<McpServerConfig[]>([]);
    const [stagedConnectors, setStagedConnectors] = useState<ConnectorDetail[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [mention, setMention] = useState<{
      q: string;
      cursor: number;
    } | null>(null);
    const [composerScrollTop, setComposerScrollTop] = useState(0);
    // Slash-command popover state — when the draft starts with `/` and
    // the cursor is still inside that token (no space committed yet),
    // we show a small palette of supported commands. The query is the
    // text after `/` so the user can type-to-filter.
    const [slash, setSlash] = useState<{
      q: string;
      cursor: number;
    } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
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
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    // Instance-aware tracking for `@<token>` mentions this surface
    // inserted into the draft via the @-mention popover plugin-pick
    // path (`insertPluginMention`). Each entry pins the precise
    // start offset of `@`, so two `@Airbnb` mentions in the same
    // draft (one composer-inserted, one user-authored) are
    // distinguishable — the chip-clear strip removes only tracked
    // instances (#2929 round 3). See utils/pluginInsertionTracking.ts
    // for the diff/reconcile/strip primitives.
    //
    // Lifecycle invariants:
    //   - add: `insertPluginMention` pushes { token, start } using the
    //     `insertStart` returned by `replaceMentionWithText`
    //   - reconcile: `handleChange` runs LCP/LCS diff on each
    //     keystroke and shifts/drops entries whose offsets crossed
    //     the edit, plus revalidates surviving entries against the
    //     mention boundary so `@Airbnbify`-style corruption prunes
    //   - clear: `reset()` empties the array on send; `onCleared`
    //     strips by range and empties the array
    //
    // Tools-menu / details-modal applies route through
    // `pluginsSectionRef.current.applyById` without writing to the
    // draft, so the array stays empty for those surfaces and the
    // post-clear strip is a no-op. Every draft mutation in this
    // component goes through the `updateDraft` chokepoint, which
    // runs `reconcileInsertions` against the prev → next diff. That
    // includes typing, slash-command pick, file/MCP/connector
    // insertion, skill chip remove, annotation append, imperative
    // handle, post-send reset, and the on-cleared strip itself —
    // so a tracked offset can never go stale relative to the draft
    // and re-introduce the original #2881 orphan-mention symptom
    // (#2929 round 4).
    //
    // Each entry carries the `pluginId` of the apply that produced
    // it. When the active plugin changes (e.g. tools-menu `applyById`
    // replaces plugin A with plugin B without writing to the draft),
    // entries for the previous active plugin are dropped via
    // `setActivePlugin`. Without that, clearing B's chip would still
    // strip A's `@A` from the draft — silent user-text deletion in a
    // supported replace-plugin flow (#2929 round 6).
    const pluginInsertedTokensRef = useRef<TrackedInsertion[]>([]);
    // The plugin id whose chip is currently mounted in PluginsSection's
    // chip strip, or `null` after the strip clears or before any apply
    // succeeds. Updated via `setActivePlugin`, which also drops any
    // tracked entries whose `pluginId` does not match the new active
    // — a no-op for `insertPluginMention` (the new entry it just
    // pushed matches), critical for tools-menu / details-modal
    // applies that arrive without an accompanying draft insertion.
    const activePluginIdRef = useRef<string | null>(null);
    // Monotonic counter that hands out unique `insertionId` strings to
    // entries pushed by `insertPluginMention`. The id survives
    // `reconcileInsertions` (utils/pluginInsertionTracking.ts forwards
    // the field) so the in-flight handler's failure path can locate
    // its own tracked entry even after intervening reconciles or
    // `onCleared` mutations of the array (#2929 round 10 codex
    // review). Plain ref counter is enough — the id only needs to be
    // unique within a single composer instance and is never persisted.
    const insertionIdSeqRef = useRef(0);

    // Single chokepoint for setting the active plugin. Routes every
    // `applyById` call so the tracker stays in lockstep with the
    // chip strip's currently-mounted plugin.
    function setActivePlugin(pluginId: string | null): void {
      if (activePluginIdRef.current === pluginId) return;
      if (pluginInsertedTokensRef.current.length > 0) {
        pluginInsertedTokensRef.current =
          pluginInsertedTokensRef.current.filter(
            (entry) => entry.pluginId === pluginId,
          );
      }
      activePluginIdRef.current = pluginId;
    }
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts MCP / Import / Pet quick actions and
    // a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    const [toolsOpen, setToolsOpen] = useState(false);
    const [toolsTab, setToolsTab] = useState<ToolsTab>('plugins');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const composingRef = useRef(false);
    const toolsMenuRef = useRef<HTMLDivElement | null>(null);
    const toolsTriggerRef = useRef<HTMLButtonElement | null>(null);
    const petEnabled = Boolean(onAdoptPet && onTogglePet);
    const [petMenuOpen, setPetMenuOpen] = useState(false);
    const petWrapRef = useRef<HTMLDivElement | null>(null);
    const [petMenuStyle, setPetMenuStyle] = useState<React.CSSProperties>({});
    const linkedDirs = projectMetadata?.linkedDirs ?? [];
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
        updateDraft(initialDraft);
        seededRef.current = true;
      } else if (initialDraft === undefined) {
        seededRef.current = true;
      }
    }, [initialDraft, draft]);

    useEffect(() => {
      saveComposerDraft(draftStorageKey, draft);
    }, [draftStorageKey, draft]);

    useEffect(() => {
      if (!toolsOpen) return;
      function onPointer(e: MouseEvent) {
        const target = e.target as Node;
        if (toolsMenuRef.current?.contains(target)) return;
        if (toolsTriggerRef.current?.contains(target)) return;
        setToolsOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setToolsOpen(false);
      }
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointer);
        document.removeEventListener('keydown', onKey);
      };
    }, [toolsOpen]);

    useEffect(() => {
      if (!petMenuOpen) return;
      function onPointer(e: MouseEvent) {
        const target = e.target as Node;
        if (petWrapRef.current?.contains(target)) return;
        setPetMenuOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setPetMenuOpen(false);
      }
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointer);
        document.removeEventListener('keydown', onKey);
      };
    }, [petMenuOpen]);

    // Viewport-aware pet menu positioning — flips the popover to stay
    // within screen bounds instead of clipping at the edge.
    useEffect(() => {
      if (!petMenuOpen) return;
      const wrap = petWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const menuW = 260;
      const menuH = 200;
      const gap = 6;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      // Prefer opening upward (bottom of menu above the button).
      // Flip downward when there isn't enough room above.
      // When neither direction fits, clamp to viewport bounds.
      let top: number;
      if (rect.top >= menuH + gap) {
        top = rect.top - menuH - gap;
      } else if (rect.bottom + menuH + gap <= viewH) {
        top = rect.bottom + gap;
      } else {
        top = Math.max(gap, viewH - menuH - gap);
      }
      // Right-align by default (menu right edge ≈ button right edge).
      // Shift left when the menu would spill past the viewport left edge.
      const left = Math.max(8, Math.min(viewW - menuW - 8, rect.right - menuW));
      setPetMenuStyle({
        position: 'fixed',
        top,
        left,
        bottom: 'auto',
        right: 'auto',
      });
    }, [petMenuOpen]);

    // Lazy-fetch the user's external MCP servers list once on mount so the
    // `/mcp …` slash palette and the composer's MCP button popover have
    // something to render. We deliberately do not reactively re-fetch when
    // the user toggles servers from Settings — the dialog refreshes itself,
    // and the chat composer rehydrates next time the user re-opens it. A
    // background poll would be cheap but unnecessary for the typical
    // edit-once-then-chat workflow.
    useEffect(() => {
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
    }, []);

    // Skills now come from the parent (App.tsx → ProjectView → ChatPane → ChatComposer)
    // pre-filtered by enabled/disabled state. We no longer fetch a fresh list
    // here to avoid showing skills the user has disabled via Settings.

    // Lazy-fetch installed plugins once on mount; the tools-menu Plugins
    // tab and the @-mention picker both consume this list.
    useEffect(() => {
      if (!projectId) return;
      let cancelled = false;
      void listPlugins().then((rows) => {
        if (cancelled) return;
        setInstalledPlugins(rows);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId]);

    useEffect(() => {
      let cancelled = false;
      void fetchConnectors().then((rows) => {
        if (cancelled) return;
        setConnectors(rows.filter((connector) => connector.status === 'connected'));
      });
      return () => {
        cancelled = true;
      };
    }, []);

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
    const composerMentionEntities = useMemo(
      () =>
        buildComposerMentionEntities({
          connectors,
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills,
          staged,
        }),
      [connectors, enabledMcpServers, pluginsForComposer, projectFiles, skills, staged],
    );
    const composerMentionParts = useMemo(
      () => buildInlineMentionParts(draft, composerMentionEntities),
      [composerMentionEntities, draft],
    );

    function resizeTextarea() {
      const ta = textareaRef.current;
      if (!ta) return;
      const maxHeight = composerTextareaMaxHeight();
      ta.style.height = 'auto';
      const nextHeight = Math.min(
        Math.max(ta.scrollHeight, COMPOSER_TEXTAREA_MIN_HEIGHT),
        maxHeight,
      );
      ta.style.height = `${nextHeight}px`;
      ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }

    useLayoutEffect(() => {
      resizeTextarea();
    }, [draft, composerMentionParts, staged.length, stagedSkills.length]);

    useEffect(() => {
      function onResize() {
        resizeTextarea();
      }
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
      setComposerScrollTop(textareaRef.current?.scrollTop ?? 0);
    }, [composerMentionParts]);

    // Resolve which tabs to surface in the consolidated tools popover.
    // Plugins is always visible while a project is active so users can
    // apply context without leaving the composer. MCP shows when wired by
    // the parent (App); Import is always available. Pet controls stay out
    // of the project context picker so the @ panel remains project-scoped.
    const availableTabs = useMemo<ToolsTab[]>(() => {
      const tabs: ToolsTab[] = [];
      if (projectId) {
        tabs.push('plugins');
        tabs.push('skills');
      }
      if (onOpenMcpSettings) tabs.push('mcp');
      tabs.push('import');
      return tabs;
    }, [projectId, onOpenMcpSettings]);

    // When the popover opens, snap the active tab to the first available one
    // so the user never lands on an empty / hidden tab if their config
    // changes mid-session.
    useEffect(() => {
      if (!toolsOpen) return;
      if (!availableTabs.includes(toolsTab)) {
        const first = availableTabs[0];
        if (first) setToolsTab(first);
      }
    }, [toolsOpen, availableTabs, toolsTab]);

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
          descKey: 'pet.slashPet',
          icon: 'sliders',
          argHint: 'open settings · <server-id> to insert hint',
        });
      }
      for (const s of enabledMcpServers) {
        list.push({
          id: `mcp-${s.id}`,
          label: `/mcp ${s.id}`,
          insert: `Use the \`${s.id}\` MCP server tools. `,
          descKey: 'pet.slashPet',
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
      if (petEnabled) {
        list.push(
          {
            id: 'pet',
            label: '/pet',
            insert: '/pet ',
            descKey: 'pet.slashPet',
            icon: 'sparkles',
            argHint: 'wake | tuck | <petId>',
          },
          {
            id: 'pet-wake',
            label: '/pet wake',
            insert: '/pet wake',
            descKey: 'pet.slashPetWake',
            icon: 'eye',
          },
          {
            id: 'pet-tuck',
            label: '/pet tuck',
            insert: '/pet tuck',
            descKey: 'pet.slashPetTuck',
            icon: 'eye',
          },
          {
            id: 'hatch',
            label: '/hatch',
            insert: '/hatch ',
            descKey: 'pet.slashHatch',
            icon: 'sparkles',
            argHint: t('pet.slashHatchArg'),
          },
        );
      }
      return list;
    }, [petEnabled, researchAvailable, t, enabledMcpServers, onOpenMcpSettings]);

    const filteredSlash = useMemo(() => {
      if (!slash) return [] as SlashCommand[];
      const q = slash.q.toLowerCase();
      if (!q) return slashCommands;
      return slashCommands.filter((c) => c.label.toLowerCase().includes(q));
    }, [slash, slashCommands]);

    function pickSlash(cmd: SlashCommand) {
      const ta = textareaRef.current;
      if (!ta || !slash) return;
      const before = draft.slice(0, slash.cursor);
      const after = draft.slice(slash.cursor);
      // Replace the in-flight `/<query>` token with the picked
      // command's canonical insertion text.
      const replaced = before.replace(/\/[^\s/]*$/, cmd.insert);
      const next = replaced + after;
      updateDraft(next);
      setSlash(null);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
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
      updateDraft('');
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
          'If the OD command fails because Tavily is not configured or unavailable, report that error, then use your own search capability as fallback and label the fallback clearly.',
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
      updateDraft('');
      return true;
    }

    useImperativeHandle(
      ref,
      () => ({
        setDraft: (text: string) => {
          updateDraft(text);
          seededRef.current = true;
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            const pos = text.length;
            ta.setSelectionRange(pos, pos);
          });
        },
        restoreDraft: ({ text, attachments = [], commentAttachments = [] }) => {
          updateDraft(text);
          setStaged(attachments);
          setStagedVisualComments(commentAttachments);
          setStagedSkills([]);
          setStagedMcpServers([]);
          setStagedConnectors([]);
          setUploadError(null);
          setMention(null);
          setSlash(null);
          seededRef.current = true;
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            const pos = text.length;
            ta.setSelectionRange(pos, pos);
          });
        },
        focus: () => {
          textareaRef.current?.focus();
        },
      }),
      []
    );

    // Single chokepoint for every draft mutation. Reconciles the
    // tracked plugin-mention offsets against the prev → next diff so
    // any setDraft path — typing, slash command, file/MCP/connector
    // insertion, skill chip removal, annotation append, imperative
    // handle, post-send reset, on-cleared strip — keeps
    // `pluginInsertedTokensRef` in lockstep with the draft.
    //
    // Implementation note (#2929 round 5): the reconcile and the
    // ref mutation happen *outside* the `setDraft` updater, using
    // the synchronous `draftRef` mirror as `prev`. Putting them
    // inside `setDraft((prev) => …)` would not be safe under
    // React StrictMode, which double-invokes setState updaters in
    // development to detect impurity — the second invocation
    // would re-shift or re-drop already-reconciled entries,
    // bringing back the #2881 orphan-mention symptom for every
    // user keystroke in the dev build.
    function updateDraft(next: string | ((prev: string) => string)): void {
      const prev = draftRef.current;
      const value = typeof next === 'function' ? next(prev) : next;
      if (prev === value) return;
      if (pluginInsertedTokensRef.current.length > 0) {
        pluginInsertedTokensRef.current = reconcileInsertions(
          pluginInsertedTokensRef.current,
          prev,
          value,
        );
      }
      draftRef.current = value;
      setDraft(value);
    }

    function reset() {
      updateDraft("");
      setStaged([]);
      setStagedVisualComments([]);
      setStagedSkills([]);
      setStagedMcpServers([]);
      setStagedConnectors([]);
      setUploadError(null);
      setMention(null);
      setSlash(null);
      // Drop tracked plugin-mention insertions when the draft is wiped
      // — otherwise a later chip clear would prune user-authored text
      // that happened to share a label with a previously-applied
      // plugin (#2929 round 2/3). Also clear the active-plugin id
      // so the next applyById is treated as a fresh activation
      // rather than a "same plugin re-apply" (#2929 round 6).
      pluginInsertedTokensRef.current = [];
      activePluginIdRef.current = null;
    }

    function currentCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return [...commentAttachments, ...stagedVisualComments, ...extra];
    }

    function setStreamingAnnotationSendPending(value: boolean) {
      streamingAnnotationSendPendingRef.current = value;
      setStreamingAnnotationSendPendingState(value);
    }

    function currentRunContextMeta(): ChatSendMeta | undefined {
      const skillIds = stagedSkills.map((s) => s.id);
      const mcpServerIds = stagedMcpServers.map((s) => s.id);
      const connectorIds = stagedConnectors.map((c) => c.id);
      const context: RunContextSelection = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
        ...(connectorIds.length > 0 ? { connectorIds } : {}),
      };
      const meta: ChatSendMeta = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(Object.keys(context).length > 0 ? { context } : {}),
      };
      return Object.keys(meta).length > 0 ? meta : undefined;
    }

    function sendComposedTurn(
      prompt: string,
      attachments: ChatAttachment[],
      nextCommentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): boolean {
      setStreamingAnnotationSendPending(false);
      if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return false;
      onSend(prompt, attachments, nextCommentAttachments, meta);
      reset();
      return true;
    }

    async function insertSkillMention(skill: SkillSummary) {
      const applied = await applyProjectSkill(skill);
      if (!applied) return;
      replaceMentionWithText(`${inlineMentionToken(skill.name)} `);
    }

    function removeStagedSkill(id: string) {
      setStagedSkills((prev) => prev.filter((s) => s.id !== id));
      // Also strip the matching `@<id>` token from the draft so the chip
      // and the textarea stay in sync. We allow trailing whitespace to be
      // collapsed too.
      updateDraft((d) =>
        d
          .replace(new RegExp(`(^|\\s)@${escapeRegExp(id)}(\\s|$)`, 'g'), '$1$2')
          .replace(/\s{2,}/g, ' '),
      );
    }

    async function ensureProject(): Promise<string | null> {
      if (projectId) return projectId;
      return onEnsureProject();
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
      try {
        const result = await uploadProjectFiles(id, files);
        if (result.uploaded.length > 0) {
          setStaged((s) => [...s, ...result.uploaded]);
        }
        const partial = result.failed.length > 0;
        if (partial) {
          const failedCount = result.failed.length;
          const uploadedCount = result.uploaded.length;
          const detail = result.error ? ` (${result.error})` : '';
          setUploadError(
            uploadedCount > 0
              ? `Attached ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
              : `Attachment upload failed for ${failedCount} file(s)${detail}.`,
          );
          console.warn('Some attachments failed to upload', result.failed);
        }
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: partial ? 'failed' : 'success',
          ...(partial && result.error ? { error_code: result.error } : {}),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadError(`Attachment upload failed (${detail}).`);
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
            if (detail.file) {
              const id = await ensureProject();
              if (!id) {
                ack({ ok: false, message: t('chat.annotationProjectCreateFailed') });
                return;
              }
              setUploading(true);
              const result = await uploadProjectFiles(id, [detail.file]);
              if (result.uploaded.length > 0) {
                uploaded = result.uploaded;
                if (detail.action !== 'send') {
                  setStaged((s) => [...s, ...uploaded]);
                }
                const screenshot = uploaded[0];
                if (screenshot && detail.markKind && detail.bounds) {
                  visualAttachmentInput = {
                    order: 1,
                    idSeed: screenshot.path,
                    screenshotPath: screenshot.path,
                    markKind: detail.markKind,
                    note: detail.note,
                    bounds: detail.bounds,
                    target: detail.target
                      ? {
                          filePath: detail.target.filePath || detail.filePath || screenshot.path,
                          elementId: detail.target.elementId,
                          selector: detail.target.selector,
                          label: detail.target.label,
                          text: detail.target.text,
                          position: detail.target.position,
                          htmlHint: detail.target.htmlHint,
                        }
                      : {
                          filePath: detail.filePath || screenshot.path,
                          position: detail.bounds,
                        },
                  };
                  if (detail.action !== 'send') {
                    setStagedVisualComments((current) => [
                      ...current,
                      buildVisualAnnotationAttachment({
                        ...visualAttachmentInput!,
                        order: commentAttachments.length + current.length + 1,
                      }),
                    ]);
                  }
                }
              }
              if (result.failed.length > 0) {
                const detailText = result.error ? ` (${result.error})` : '';
                setUploadError(`Attachment upload failed for ${result.failed.length} file(s)${detailText}.`);
                if (uploaded.length === 0) {
                  ack({ ok: false, message: t('chat.annotationUploadFailed') });
                  return;
                }
              }
            }
            setUploading(false);

            if (detail.action === 'send') {
              if (streaming) {
                if (uploaded.length > 0) setStaged((s) => [...s, ...uploaded]);
                if (visualAttachmentInput) {
                  setStagedVisualComments((current) => [
                    ...current,
                    buildVisualAnnotationAttachment({
                      ...visualAttachmentInput!,
                      order: commentAttachments.length + current.length + 1,
                    }),
                  ]);
                }
                if (detail.note) updateDraft((d) => (d ? `${d}\n${detail.note}` : detail.note));
                setStreamingAnnotationSendPending(true);
                textareaRef.current?.focus();
                ack({ ok: true });
                return;
              }
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                  order: commentAttachments.length + stagedVisualComments.length + 1,
                });
              }
              const prompt = [draft.trim(), detail.note].filter(Boolean).join('\n');
              const attachments = [...staged, ...uploaded];
              const nextCommentAttachments = currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
              sendComposedTurn(prompt, attachments, nextCommentAttachments, currentRunContextMeta());
              ack({ ok: true });
              return;
            }

            if (detail.note) {
              updateDraft((d) => (d ? `${d}\n${detail.note}` : detail.note));
              textareaRef.current?.focus();
            }
            ack({ ok: true });
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
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      t,
    ]);

    useEffect(() => {
      if (!streamingAnnotationSendPending || !streamingAnnotationSendPendingRef.current) return;
      if (streaming || sendDisabled) return;
      const prompt = draft.trim();
      sendComposedTurn(prompt, staged, currentCommentAttachments(), currentRunContextMeta());
    }, [
      commentAttachments,
      draft,
      onSend,
      sendDisabled,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      streamingAnnotationSendPending,
    ]);

    function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void uploadFiles(files);
        return;
      }
      void uploadClipboardImagesFromAsyncClipboard();
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFiles(files);
    }

    async function handleLinkFolder() {
      if (!projectId) return;
      const selected = await openFolderDialog();
      if (!selected) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      if (existing.includes(selected)) return;
      const metadata: ProjectMetadata = { ...base, linkedDirs: [...existing, selected] };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    async function handleUnlinkFolder(dir: string) {
      if (!projectId) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      const metadata: ProjectMetadata = { ...base, linkedDirs: existing.filter((d) => d !== dir) };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const value = e.target.value;
      const cursor = e.target.selectionStart;
      // Goes through the `updateDraft` chokepoint so the
      // plugin-mention offset reconcile runs on every keystroke,
      // matching every other setDraft path for free.
      updateDraft(value);
      // Keep the staged-skill chips in sync with the draft. If the user
      // hand-deletes an `@<id>` token from the textarea, the chip must
      // disappear too — otherwise submit() would still forward that id in
      // skillIds and the daemon would compose a skill the prompt no
      // longer references. Mirror the removeStagedSkill() boundary
      // (whitespace or string edge) so partial matches don't keep a chip
      // alive accidentally. We do not run the same prune for `staged`
      // file attachments because users frequently attach files via the
      // upload button without leaving an `@<path>` token in the draft.
      setStagedSkills((prev) =>
        prev.filter((s) =>
          new RegExp(`(^|\\s)@${escapeRegExp(s.id)}(\\s|$)`).test(value),
        ),
      );
      // Skip mention and slash detection during IME composition (e.g.,
      // Chinese, Japanese, Korean input) to prevent cursor jumping.
      // Issue #2851.
      if (composingRef.current) return;
      // Detect a fresh @ at start or after whitespace; capture the typed
      // query up to the cursor.
      const before = value.slice(0, cursor);
      const m = /(^|\s)@([^\s@]*)$/.exec(before);
      if (m) setMention({ q: m[2] ?? "", cursor });
      else setMention(null);
      // Slash-command popover — open as soon as the draft starts with
      // `/` (and the cursor is still inside the bare command token, no
      // space yet). Closes once the user commits a space or moves past
      // the prefix.
      const slashMatch = /^\/([^\s/]*)$/.exec(before);
      if (slashMatch) {
        setSlash({ q: slashMatch[1] ?? '', cursor });
        setSlashIndex(0);
      } else {
        setSlash(null);
      }
    }

    function insertMention(filePath: string) {
      if (!mention) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const cursor = mention.cursor;
      const before = draft.slice(0, cursor);
      const after = draft.slice(cursor);
      const replaced = before.replace(/@([^\s@]*)$/, `@${filePath} `);
      const next = replaced + after;
      updateDraft(next);
      setMention(null);
      if (!staged.some((s) => s.path === filePath)) {
        setStaged((s) => [
          ...s,
          {
            path: filePath,
            name: filePath.split("/").pop() || filePath,
            kind: looksLikeImage(filePath) ? "image" : "file",
          },
        ]);
      }
      requestAnimationFrame(() => {
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
    }

    async function insertPluginMention(record: InstalledPluginRecord) {
      // Snapshot tracker AND draft state before any mutation so we
      // can roll back if `applyById` fails (#2929 round 7). Without
      // this, an `/apply` 5xx leaves the draft holding a freshly
      // inserted `@<token>` whose chip never mounted — a user
      // clearing the previously-active plugin's chip would then
      // strip the user-visible `@<token>` they just picked, even
      // though that text is the only signal they have that
      // anything happened.
      const prevDraftValue = draftRef.current;
      const prevEntries = pluginInsertedTokensRef.current;
      const prevActiveId = activePluginIdRef.current;

      const result = replaceMentionWithText(`${inlineMentionToken(record.title)} `);
      if (!result) return;
      // Capture the post-insert draft *snapshot* — the value the
      // composer is in immediately after our optimistic write.
      // Used as a sentinel during the rollback below: if the
      // textarea is still in this state when `applyById` fails
      // (no user keystrokes during the await), we can fully
      // restore `prevDraftValue`. If the user typed during the
      // await, the draft has moved past the snapshot and we MUST
      // NOT clobber those edits with the stale `prevDraftValue`
      // (#2929 round 8 — the textarea stays interactive while
      // `/apply` is in flight, so this is a real prompt-data-loss
      // path).
      const postInsertDraft = draftRef.current;
      // Track the precise start offset of the inserted `@` so the
      // post-clear strip can excise exactly this instance, leaving
      // any user-authored `@<sameLabel>` elsewhere in the draft
      // untouched (#2929 round 3). Entry carries `pluginId` so a
      // later replace-plugin flow can drop it cleanly (#2929 round 6),
      // and an `insertionId` so this handler's failure path can
      // locate the entry it pushed even after `reconcileInsertions`
      // shifted offsets or `onCleared` mutated the array
      // (#2929 round 10).
      //
      // Push the new entry but DO NOT yet drop entries from the
      // previously-active plugin — that filter is committed only
      // after `applyById` resolves successfully (#2929 round 9
      // codex review). During the await, the chip strip still
      // shows the previously-mounted plugin and the textarea is
      // interactive: a user click on that chip's × must strip its
      // tracked entries (not the optimistic `@<target>` we just
      // pushed). `onCleared` filters by
      // `pluginsSectionRef.current?.getActiveRecord()?.id` so a
      // pending-window clear scopes to the actually-mounted
      // plugin's tracked tokens.
      const ourInsertionId = `i${++insertionIdSeqRef.current}`;
      pluginInsertedTokensRef.current = [
        ...pluginInsertedTokensRef.current,
        {
          token: record.title,
          start: result.insertStart,
          pluginId: record.id,
          insertionId: ourInsertionId,
        },
      ];

      const applyResult = await pluginsSectionRef.current?.applyById(
        record.id,
        record,
      );
      if (!applyResult) {
        // Two failure modes to disambiguate (#2929 round 10):
        //
        //   (a) "no intervening clear" — the user neither cleared
        //       the previously-mounted chip nor anything else
        //       mutated the tracker beyond our push + reconciles
        //       from user keystrokes. `prevEntries` and
        //       `prevActiveId` are still the truth. We restore the
        //       tracker wholesale and restore the draft only if
        //       the user did not type during the await
        //       (round 7/8 path).
        //
        //   (b) "intervening clear" — `onCleared` ran during the
        //       await for the previously-mounted chip, stripped
        //       its tokens from the draft, and nulled
        //       `activePluginIdRef`. Restoring `prevEntries`
        //       wholesale here would resurrect already-stripped
        //       entries with stale offsets, AND leave our
        //       optimistic `@<target>` orphaned in the draft (the
        //       original #2881 symptom recurring inside the
        //       failure window). Instead we surgically remove ONLY
        //       our own optimistic entry by `insertionId`, strip
        //       its `@<target>` from the draft, and leave
        //       everything `onCleared` did intact.
        //
        // Detection: `onCleared` always nulls
        // `activePluginIdRef.current`; our deferred
        // `setActivePlugin` never ran (we are in the failure
        // branch). So `activePluginIdRef.current === null` while
        // `prevActiveId !== null` is the smoking gun for an
        // intervening clear. (If `prevActiveId` was already null,
        // there was no chip to clear — no race possible.)
        const intervenedClear =
          activePluginIdRef.current === null && prevActiveId !== null;
        if (intervenedClear) {
          const cur = pluginInsertedTokensRef.current;
          const idx = cur.findIndex(
            (e) => e.insertionId === ourInsertionId,
          );
          if (idx >= 0) {
            const ourEntry = cur[idx]!;
            // Splice our entry out first so `updateDraft`'s
            // internal `reconcileInsertions` operates on a tracker
            // that already excludes it (the strip range overlaps
            // the entry, which would drop it anyway, but splicing
            // first keeps the invariant explicit and avoids
            // depending on the reconcile drop edge case).
            pluginInsertedTokensRef.current = [
              ...cur.slice(0, idx),
              ...cur.slice(idx + 1),
            ];
            updateDraft((d) => stripPluginInsertedTokens(d, [ourEntry]));
          }
          // Don't touch `activePluginIdRef` — `onCleared` set it
          // to null and that is the truth (no chip is mounted).
          return;
        }
        // (a) round 7/8 path: no intervening clear.
        pluginInsertedTokensRef.current = prevEntries;
        activePluginIdRef.current = prevActiveId;
        // Restore the draft only if no user keystrokes arrived
        // during the await — overwriting newer edits with the
        // stale pre-pick snapshot would be a worse bug than the
        // leftover `@<token>` styled mention this branch leaves
        // behind. The orphan stays as a styled mention but no
        // future chip clear will touch it (tracker is empty for
        // it now), and the user can edit it manually
        // (#2929 round 8).
        if (draftRef.current === postInsertDraft) {
          setDraft(prevDraftValue);
          draftRef.current = prevDraftValue;
        }
        return;
      }
      // Apply succeeded. Now commit the active-plugin switch —
      // this drops any entries from the previously-active plugin
      // (a no-op for the entry we just pushed since it matches
      // `record.id`) and updates `activePluginIdRef`. Deferring
      // until after the await means an `onCleared` triggered
      // during the in-flight window saw the still-mounted plugin
      // as the active one and stripped only that plugin's tokens
      // (#2929 round 9).
      setActivePlugin(record.id);
    }

    function replaceMentionWithText(
      text: string,
    ): { insertStart: number } | null {
      if (!mention) return null;
      const ta = textareaRef.current;
      const cursor = mention.cursor;
      const before = draft.slice(0, cursor);
      const after = draft.slice(cursor);
      const replaced = before.replace(/(^|\s)@([^\s@]*)$/, `$1${text}`);
      const next = replaced + after;
      updateDraft(next);
      setMention(null);
      // The inserted text was appended onto `replaced`, so its first
      // char (the `@`) sits at `replaced.length - text.length`.
      const insertStart = replaced.length - text.length;
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
      return { insertStart };
    }

    function insertMcpMention(server: McpServerConfig) {
      setStagedMcpServers((current) => (
        current.some((item) => item.id === server.id) ? current : [...current, server]
      ));
      replaceMentionWithText(`${inlineMentionToken(server.label || server.id)} `);
    }

    function insertConnectorMention(connector: ConnectorDetail) {
      setStagedConnectors((current) => (
        current.some((item) => item.id === connector.id) ? current : [...current, connector]
      ));
      replaceMentionWithText(`${inlineMentionToken(connector.name)} `);
    }

    async function applyProjectSkill(skill: SkillSummary): Promise<boolean> {
      if (!projectId) return false;
      const result = await patchProject(projectId, { skillId: skill.id });
      if (!result) return false;
      onProjectSkillChange?.(result.skillId ?? skill.id);
      return true;
    }

    function removeStaged(p: string) {
      setStaged((s) => s.filter((a) => a.path !== p));
      setStagedVisualComments((current) => current.filter((attachment) => attachment.screenshotPath !== p));
      updateDraft((current) => stripInlineMentionToken(current, p));
    }

    function removeCommentAttachment(id: string) {
      setStagedVisualComments((current) => current.filter((attachment) => attachment.id !== id));
      if (!stagedVisualComments.some((attachment) => attachment.id === id)) {
        onRemoveCommentAttachment?.(id);
      }
    }

    async function submit() {
      const prompt = draft.trim();
      if (sendDisabled) return;
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
        onSend(hatched, staged, nextCommentAttachments, contextMeta);
        reset();
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        setStreamingAnnotationSendPending(false);
        onSend(search.prompt, staged, nextCommentAttachments, {
          ...contextMeta,
          research: { enabled: true, query: search.query },
        });
        reset();
        return;
      }
      if (!prompt && staged.length === 0 && nextCommentAttachments.length === 0) return;
      sendComposedTurn(prompt, staged, nextCommentAttachments, contextMeta);
    }

    // The @-picker offers a unified search across context surfaces:
    // project files, plugins, active MCP servers, and skills. Picked
    // entities keep an inline @ token for orientation while richer
    // context is still applied behind the scenes when available.
    const mentionQuery = mention ? mention.q.toLowerCase() : '';
    const filteredFiles = mention
      ? projectFiles
          .filter((f) => f.type === undefined || f.type === "file")
          .filter((f) => {
            const key = f.path ?? f.name;
            return key.toLowerCase().includes(mentionQuery);
          })
          .slice(0, 12)
      : [];
    const filteredPlugins = mention
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
      : [];
    const filteredMcpServers = mention
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
      : [];
    const filteredConnectors = mention
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
      : [];
    // Already-staged skills drop out of the suggestion list (carried over
    // from main) so the @-popover keeps moving forward as the user picks.
    const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
    const filteredSkills = mention
      ? skills
          .filter((s) => !stagedSkillIds.has(s.id))
          .filter((s) => skillMatchesQuery(s, mentionQuery))
          .sort((a, b) => skillMentionRank(a, mentionQuery) - skillMentionRank(b, mentionQuery))
      : [];
    const hasComposerPayload =
      draft.trim().length > 0 || staged.length > 0 || currentCommentAttachments().length > 0;
    const showStopButton = streaming && !hasComposerPayload;
    const showSendButton = !streaming || hasComposerPayload;

    return (
      <div
        className={`composer${dragActive ? " drag-active" : ""}`}
        data-testid="chat-composer"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="composer-shell">
          {stagedSkills.length > 0 ? (
            <StagedSkills
              skills={stagedSkills}
              onRemove={removeStagedSkill}
              t={t}
            />
          ) : null}
          {staged.length > 0 ? (
            <StagedAttachments
              attachments={staged}
              projectId={projectId}
              onRemove={removeStaged}
              t={t}
            />
          ) : null}
          {linkedDirs.length > 0 ? (
            <div className="linked-dirs-row" data-testid="linked-dirs">
              {linkedDirs.map((dir) => (
                <div key={dir} className="linked-dir-chip">
                  <Icon name="folder" size={13} />
                  <span className="linked-dir-name" title={dir}>
                    {dir.split('/').pop() || dir}
                  </span>
                  <button
                    className="staged-remove"
                    onClick={() => handleUnlinkFolder(dir)}
                    title={t('chat.linkedFolderRemoveAria', { path: dir })}
                    aria-label={t('chat.linkedFolderRemoveAria', { path: dir })}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {currentCommentAttachments().length > 0 ? (
            <StagedCommentAttachments
              attachments={currentCommentAttachments()}
              onRemove={removeCommentAttachment}
              t={t}
            />
          ) : null}
          {byokApiProtocol === 'senseaudio' && onChangeByokImageModel ? (
            <div
              className="composer-byok-image-model"
              data-testid="composer-byok-image-model"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text-muted, #888)',
              }}
            >
              <Icon name="image" size={13} />
              <label
                htmlFor="composer-byok-image-model-select"
                style={{ flexShrink: 0 }}
              >
                {t('settings.byokImageModel')}
              </label>
              <select
                id="composer-byok-image-model-select"
                value={byokImageModel ?? ''}
                onChange={(e) => onChangeByokImageModel(e.target.value)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border, #444)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  color: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="">
                  {(IMAGE_MODELS.find((m) => m.provider === 'senseaudio')?.label
                    ?? 'senseaudio-image-2.0') + ' (default)'}
                </option>
                {IMAGE_MODELS.filter((m) => m.provider === 'senseaudio').map(
                  (m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ),
                )}
              </select>
            </div>
          ) : null}
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
              onApplied={(brief) => {
                // Use functional setState so stale closures from the @-mention
                // flow (which awaits applyById after updateDraft) still see
                // the latest draft value before deciding whether to seed.
                if (typeof brief === 'string' && brief.length > 0) {
                  updateDraft((cur) => (cur.trim().length === 0 ? brief : cur));
                }
              }}
              onCleared={() => {
                // Removing the chip strip must drop the `@…` tokens
                // this surface authored, otherwise the textarea is
                // left holding orphaned mentions whose chips just
                // unmounted (#2881). We strip *only* the tracked
                // insertions (by precise start offset) so
                // user-authored text that happens to share a label
                // with a chip is preserved (#2929 round 3).
                //
                // The chip strip can clear while an `applyById` for
                // a *different* plugin is mid-await — the @-popover
                // optimistically writes `@<target>` and pushes a
                // tracked entry synchronously, then awaits the
                // apply (#2929 round 9 codex review). During that
                // window the ref carries entries for both the
                // still-mounted plugin (the chip the user is
                // removing) and the in-flight target. Trusting the
                // ref wholesale here would strip the optimistic
                // `@<target>` and leave the unmounting plugin's
                // `@<token>` orphaned — a recurrence of #2881 in a
                // pending-apply window.
                //
                // PluginsSection only flips `activeRecord` after
                // `applyPlugin` resolves successfully (see
                // `PluginsSection.tsx`), so `getActiveRecord()` at
                // the moment `onCleared` fires reports the plugin
                // whose chip is currently being unmounted — exactly
                // the one whose tracked entries we should strip.
                // Filter to that id; entries for any in-flight
                // replace target are left in place (the in-flight
                // handler's success path will commit
                // `setActivePlugin(target)` and drop them; its
                // failure path will roll the tracker back).
                const unmountingId =
                  pluginsSectionRef.current?.getActiveRecord()?.id ?? null;
                const entries = pluginInsertedTokensRef.current;
                if (entries.length > 0) {
                  const toStrip = unmountingId
                    ? entries.filter((e) => e.pluginId === unmountingId)
                    : entries;
                  if (toStrip.length > 0) {
                    // `updateDraft` runs `reconcileInsertions`
                    // against the prev → next diff inside the
                    // chokepoint, so any in-flight target's entries
                    // get their offsets shifted to track the
                    // post-strip draft. We must re-read the ref
                    // *after* `updateDraft` returns instead of
                    // filtering the pre-strip `entries` snapshot,
                    // otherwise we would clobber the reconciled
                    // offsets and a later clear of the in-flight
                    // chip would no-op via `isInsertionStillValid`.
                    updateDraft((d) => stripPluginInsertedTokens(d, toStrip));
                  }
                  pluginInsertedTokensRef.current = unmountingId
                    ? pluginInsertedTokensRef.current.filter(
                        (e) => e.pluginId !== unmountingId,
                      )
                    : [];
                }
                activePluginIdRef.current = null;
              }}
              onChipDetails={(item: ContextItem) => {
                if (item.kind !== 'plugin') return;
                const record = installedPlugins.find((p) => p.id === item.id);
                if (record) setDetailsRecord(record);
              }}
            />
          ) : null}
          <div
            className={`composer-input-wrap${
              composerMentionParts ? ' has-mention-overlay' : ''
            }`}
          >
            <div className="composer-textarea-layer">
              {composerMentionParts ? (
                <div
                  className="composer-input-overlay"
                  data-testid="chat-composer-mention-overlay"
                  aria-hidden="true"
                  style={{ ['--composer-input-scroll' as string]: `${composerScrollTop}px` }}
                >
                  <div className="composer-input-overlay-inner">
                    {composerMentionParts.map((part, index) =>
                      part.kind === 'mention' ? (
                        <span
                          key={`${part.entity.kind}-${part.entity.id}-${index}`}
                          className={`composer-inline-mention composer-inline-mention--${part.entity.kind}`}
                          title={part.entity.title ?? part.text}
                        >
                          {part.text}
                        </span>
                      ) : (
                        <span key={`text-${index}`}>{part.text}</span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                data-testid="chat-composer-input"
                // ph-no-capture: prompt content is the most sensitive
                // surface in the product. PostHog autocapture skips this
                // element + subtree entirely.
                className="ph-no-capture"
                value={draft}
                placeholder={t('chat.composerPlaceholder')}
                spellCheck={false}
                onChange={handleChange}
                onPaste={handlePaste}
                onScroll={(event) => {
                  setComposerScrollTop(event.currentTarget.scrollTop);
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onKeyDown={(e) => {
                  if (isImeComposing(e, composingRef.current)) return;
                  if (slash && filteredSlash.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSlashIndex((i) => (i + 1) % filteredSlash.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSlashIndex(
                        (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
                      );
                      return;
                    }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
                      e.preventDefault();
                      const safe = Math.min(slashIndex, filteredSlash.length - 1);
                      pickSlash(filteredSlash[safe]!);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setSlash(null);
                      return;
                    }
                  }
                  if (mention && e.key === "Escape") {
                    setMention(null);
                    return;
                  }
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.altKey &&
                    (e.metaKey || e.ctrlKey || !mention)
                  ) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
            </div>
            {mention ? (
              <MentionPopover
                files={filteredFiles}
                plugins={filteredPlugins}
                skills={filteredSkills}
                mcpServers={filteredMcpServers}
                connectors={filteredConnectors}
                query={mention.q}
                currentSkillId={currentSkillId}
                onPickFile={insertMention}
                onPickPlugin={(record) => void insertPluginMention(record)}
                onPickSkill={(skill) => void insertSkillMention(skill)}
                onPickMcp={insertMcpMention}
                onPickConnector={insertConnectorMention}
              />
            ) : null}
            {slash && filteredSlash.length > 0 ? (
              <SlashPopover
                commands={filteredSlash}
                activeIndex={Math.min(slashIndex, filteredSlash.length - 1)}
                onPick={pickSlash}
                onHover={(i) => setSlashIndex(i)}
                t={t}
              />
            ) : null}
          </div>
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
            <div className="composer-tools-wrap">
              <button
                ref={toolsTriggerRef}
                type="button"
                className={`icon-btn composer-tools-trigger${toolsOpen ? ' active' : ''}`}
                onClick={() => {
                  setToolsOpen((v) => {
                    const next = !v;
                    if (next) {
                      // P0 ui_click resources_popover_trigger — only emit on
                      // the open transition so accidental double-clicks
                      // don't pair an open + close into a "double tap" the
                      // dashboard can't interpret.
                      trackChatPanelClick(analytics.track, {
                        page_name: 'chat_panel',
                        area: 'chat_panel',
                        element: 'resources_popover_trigger',
                      });
                    }
                    return next;
                  });
                }}
                title={t('chat.cliSettingsTitle')}
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
                aria-label={t('chat.cliSettingsAria')}
              >
                <span className="composer-tools-at" aria-hidden>
                  @
                </span>
              </button>
              {toolsOpen ? (
                <div
                  ref={toolsMenuRef}
                  className="composer-tools-menu"
                  role="menu"
                >
                  <div className="composer-tools-tabs" role="tablist">
                    {availableTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={toolsTab === tab}
                        className={`composer-tools-tab${toolsTab === tab ? ' active' : ''}`}
                        onClick={() => setToolsTab(tab)}
                      >
                        {tab === 'plugins' ? (
                          <>
                            <Icon name="sparkles" size={12} />
                            <span>Plugins</span>
                          </>
                        ) : null}
                        {tab === 'skills' ? (
                          <>
                            <Icon name="file" size={12} />
                            <span>Skills</span>
                          </>
                        ) : null}
                        {tab === 'mcp' ? (
                          <>
                            <Icon name="link" size={12} />
                            <span>MCP</span>
                          </>
                        ) : null}
                        {tab === 'import' ? (
                          <>
                            <Icon name="import" size={12} />
                            <span>{t('chat.importLabel')}</span>
                          </>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="composer-tools-content">
                    {toolsTab === 'plugins' ? (
                      <ToolsPluginsPanel
                        plugins={pluginsForComposer}
                        activePluginId={pinnedPluginId}
                        onApply={async (record) => {
                          // Tools-menu apply: no draft write, so the
                          // tracked-insertion array gets no new
                          // entry. The active-plugin switch (which
                          // drops previously-tracked entries from a
                          // prior @-popover pick of a different
                          // plugin, #2929 round 6) is deferred until
                          // `applyById` resolves successfully so
                          // that an `onCleared` triggered during the
                          // in-flight window still sees the
                          // still-mounted plugin's entries and
                          // strips them correctly via the
                          // `getActiveRecord()` filter in
                          // `onCleared` (#2929 round 9).
                          //
                          // No synchronous mutation in this branch
                          // means no rollback snapshot is needed:
                          // the failure path is just an early return
                          // (#2929 round 7's snapshot was needed
                          // because `setActivePlugin` was eager).
                          const result = await pluginsSectionRef.current?.applyById(
                            record.id,
                            record,
                          );
                          if (!result) return;
                          setActivePlugin(record.id);
                          setToolsOpen(false);
                        }}
                        onShowDetails={(record) => {
                          setDetailsRecord(record);
                          setToolsOpen(false);
                        }}
                      />
                    ) : null}
                    {toolsTab === 'skills' ? (
                      <ToolsSkillsPanel
                        skills={skills}
                        currentSkillId={currentSkillId}
                        onPick={async (skill) => {
                          const applied = await applyProjectSkill(skill);
                          if (!applied) return;
                          const ta = textareaRef.current;
                          const insert = `${inlineMentionToken(skill.name)} `;
                          const currentDraft = ta?.value ?? draft;
                          const cursor = ta?.selectionStart ?? currentDraft.length;
                          const before = currentDraft.slice(0, cursor);
                          const after = currentDraft.slice(cursor);
                          const next = before + insert + after;
                          updateDraft(next);
                          setToolsOpen(false);
                          requestAnimationFrame(() => {
                            const el = textareaRef.current;
                            if (!el) return;
                            el.focus();
                            const pos = before.length + insert.length;
                            el.setSelectionRange(pos, pos);
                          });
                        }}
                      />
                    ) : null}
                    {toolsTab === 'mcp' && onOpenMcpSettings ? (
                      <ToolsMcpPanel
                        servers={enabledMcpServers}
                        templates={mcpTemplates}
                        onInsert={(serverId) => {
                          const ta = textareaRef.current;
                          const server = enabledMcpServers.find((item) => item.id === serverId);
                          const insert = `${inlineMentionToken(server?.label || serverId)} `;
                          const cursor = ta?.selectionStart ?? draft.length;
                          const before = draft.slice(0, cursor);
                          const after = draft.slice(cursor);
                          const next = before + insert + after;
                          updateDraft(next);
                          setToolsOpen(false);
                          requestAnimationFrame(() => {
                            const el = textareaRef.current;
                            if (!el) return;
                            el.focus();
                            const pos = before.length + insert.length;
                            el.setSelectionRange(pos, pos);
                          });
                        }}
                        onManage={() => {
                          setToolsOpen(false);
                          onOpenMcpSettings?.();
                        }}
                      />
                    ) : null}
                    {toolsTab === 'import' ? (
                      <ToolsImportPanel
                        t={t}
                        onLinkFolder={async () => {
                          setToolsOpen(false);
                          await handleLinkFolder();
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {petEnabled ? (
              <div className="composer-pet-wrap" ref={petWrapRef}>
                <button
                  type="button"
                  className={`composer-pet${petConfig?.adopted ? ' adopted' : ''}`}
                  onClick={() => {
                    if (petConfig?.adopted) {
                      if (!petConfig.enabled) setPetMenuOpen(true);
                      else setPetMenuOpen((v) => !v);
                    } else {
                      setPetMenuOpen((v) => !v);
                    }
                  }}
                  title={t('pet.composerTitle')}
                  aria-haspopup="menu"
                  aria-expanded={petMenuOpen}
                  aria-label={t('pet.composerTitle')}
                >
                  <span className="composer-pet-glyph">
                    {petConfig?.adopted ? (petConfig?.custom?.glyph || '🐾') : '🐾'}
                  </span>
                  <span className="composer-pet-label">
                    {petConfig?.adopted ? (petConfig?.custom?.name || 'Buddy') : t('pet.composerMenuTitle')}
                  </span>
                </button>
                {petMenuOpen ? (
                  <div
                    className="composer-pet-menu"
                    style={petMenuStyle}
                  >
                    <div className="composer-pet-menu-head">
                      <strong>{t('pet.composerMenuTitle')}</strong>
                      <span>{t('pet.composerMenuHint')}</span>
                    </div>
                    <button
                      type="button"
                      className="composer-pet-menu-row toggle"
                      onClick={() => {
                        if (petConfig?.adopted) {
                          onTogglePet?.();
                        } else {
                          onOpenPetSettings?.();
                        }
                        setPetMenuOpen(false);
                      }}
                    >
                      <Icon name={petConfig?.enabled ? 'eye-off' : 'eye'} size={12} />
                      <span>{petConfig?.enabled ? t('pet.tuck') : t('pet.wake')}</span>
                    </button>
                    <button
                      type="button"
                      className="composer-pet-menu-row settings"
                      onClick={() => {
                        onOpenPetSettings?.();
                        setPetMenuOpen(false);
                      }}
                    >
                      <Icon name="settings" size={12} />
                      <span>{t('pet.composerOpenSettings')}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              className="icon-btn"
              data-testid="chat-attach"
              onClick={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
              title={t('chat.attachTitle')}
              disabled={uploading}
              aria-label={t('chat.attachAria')}
            >
              {uploading ? (
                <Icon name="spinner" size={15} />
              ) : (
                <Icon name="attach" size={15} />
              )}
            </button>
            {footerAccessory}
            <span className="composer-spacer" />
            {showStopButton ? (
              <button
                type="button"
                className="composer-send stop"
                onClick={onStop}
              >
                <Icon name="stop" size={13} />
                <span>{t('chat.stop')}</span>
              </button>
            ) : null}
            {showSendButton ? (
              <button
                type="button"
                className="composer-send"
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
              >
                <Icon name="send" size={13} />
                <span>{t('chat.send')}</span>
              </button>
            ) : null}
          </div>
        </div>
        {uploadError ? <span className="composer-hint">{uploadError}</span> : null}
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={async (record) => {
              // Details-modal apply: same shape as tools-menu apply
              // (no draft write). The active-plugin switch is
              // deferred until `applyById` resolves successfully so
              // that an `onCleared` triggered during the in-flight
              // window still sees the still-mounted plugin's
              // entries and strips them correctly (#2929 round 9).
              //
              // Modal closes regardless of apply outcome so the
              // user is not stuck on the details view if `/apply`
              // 5xx'd. Failure is a no-op: no synchronous mutation
              // happened, so nothing to roll back (#2929 round 7's
              // snapshot was needed because `setActivePlugin` was
              // eager — round 9 made it lazy).
              const result = await pluginsSectionRef.current?.applyById(
                record.id,
                record,
              );
              if (result) setActivePlugin(record.id);
              setDetailsRecord(null);
            }}
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
}: {
  connectors: ConnectorDetail[];
  files: ProjectFile[];
  mcpServers: McpServerConfig[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  staged: ChatAttachment[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
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

function StagedAttachments({
  attachments,
  projectId,
  onRemove,
  t,
}: {
  attachments: ChatAttachment[];
  projectId: string | null;
  onRemove: (path: string) => void;
  t: TranslateFn;
}) {
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const previewUrl = preview && projectId ? projectRawUrl(projectId, preview.path) : null;

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  return (
    <>
      <div className="staged-row" data-testid="staged-attachments">
        {attachments.map((a) => {
          const canPreview = a.kind === "image" && Boolean(projectId);
          const imageUrl = canPreview ? projectRawUrl(projectId!, a.path) : null;
          return (
            <div key={a.path} className={`staged-chip staged-${a.kind}`}>
              {canPreview && imageUrl ? (
                <button
                  type="button"
                  className="staged-preview-trigger"
                  onClick={() => setPreview(a)}
                  title={a.path}
                  aria-label={`Preview ${a.name}`}
                >
                  <img src={imageUrl} alt="" aria-hidden />
                  <span className="staged-name">
                    {a.name}
                  </span>
                </button>
              ) : (
                <>
                  <span className="staged-icon" aria-hidden>
                    <Icon name="file" size={13} />
                  </span>
                  <span className="staged-name" title={a.path}>
                    {a.name}
                  </span>
                </>
              )}
              <button
                className="staged-remove"
                onClick={() => onRemove(a.path)}
                title={t('common.delete')}
                aria-label={t('chat.removeAria', { name: a.name })}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}
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
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={preview.path}>{preview.name}</span>
              <button
                type="button"
                className="icon-only"
                onClick={() => setPreview(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={previewUrl} alt={preview.name} />
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

function StagedSkills({
  skills,
  onRemove,
  t,
}: {
  skills: SkillSummary[];
  onRemove: (id: string) => void;
  t: TranslateFn;
}) {
  return (
    <div
      className="staged-row staged-skills-row"
      data-testid="staged-skills"
    >
      {skills.map((s) => (
        <div
          key={s.id}
          className={`staged-chip staged-skill staged-skill-${s.source ?? 'built-in'}`}
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="sparkles" size={12} />
          </span>
          <span className="staged-name" title={s.description || s.name}>
            @{s.id}
          </span>
          <button
            className="staged-remove"
            onClick={() => onRemove(s.id)}
            title={t('common.delete')}
            aria-label={`Remove skill ${s.id}`}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
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
          <span className="staged-name" title={`${a.screenshotPath ? `${a.screenshotPath}: ` : ''}${commentTargetDisplayName(a)}: ${a.comment}`}>
            <strong>{commentTargetDisplayName(a)}</strong>
            <span>{a.comment}</span>
          </span>
          <button
            className="staged-remove"
            onClick={() => onRemove(a.id)}
            title={t('chat.comments.removeAttachment')}
            aria-label={t('chat.comments.removeAttachmentAria', { name: a.elementId })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
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
        <div className="composer-tools-segments" role="tablist" aria-label="Plugin source">
          <button
            type="button"
            role="tab"
            aria-selected={source === 'community'}
            className={`composer-tools-segment${source === 'community' ? ' active' : ''}`}
            onClick={() => setSource('community')}
            title={`${communityPlugins.length} installed official plugins`}
          >
            Official
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'mine'}
            className={`composer-tools-segment${source === 'mine' ? ' active' : ''}`}
            onClick={() => setSource('mine')}
            title={`${userPlugins.length} installed user plugins`}
          >
            My plugins
          </button>
        </div>
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search plugins…"
          aria-label="Search plugins"
        />
      </div>
      {visiblePlugins.length === 0 ? (
        <div className="composer-tools-empty">
          {plugins.length === 0 ? (
            <>
              No plugins installed yet. Browse Official or add your own with{' '}
              <code>od plugin install &lt;source&gt;</code>.
            </>
          ) : query ? (
            <>No {source === 'community' ? 'Official' : 'My plugins'} results for “{query}”.</>
          ) : (
            <>No {source === 'community' ? 'Official' : 'My plugins'} plugins available.</>
          )}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visiblePlugins.map((p) => (
            <div
              key={p.id}
              className={`composer-tools-row composer-tools-row--plugin${
                p.id === activePluginId ? ' active' : ''
              }`}
            >
              <button
                type="button"
                className="composer-tools-row-main"
                // Match the @-mention popover: prevent the textarea from
                // losing focus before the click handler runs so
                // selectionStart isn't reset to 0 and the inserted token
                // lands at the user's actual cursor position (#3195).
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
                title={p.manifest?.description ?? p.title}
              >
                <Icon name="sparkles" size={12} />
                <span className="composer-tools-row-body">
                  <strong>{p.title}</strong>
                  {p.manifest?.description ? (
                    <span className="composer-tools-row-meta">
                      {p.manifest.description}
                    </span>
                  ) : (
                    <span className="composer-tools-row-meta">{p.id}</span>
                  )}
                </span>
                {pendingId === p.id ? (
                  <span className="composer-tools-row-pending">Applying…</span>
                ) : null}
              </button>
              <button
                type="button"
                className="composer-tools-row-side"
                onClick={() => onShowDetails(p)}
                title={`View details for ${p.title}`}
                aria-label={`View details for ${p.title}`}
              >
                <Icon name="eye" size={12} />
              </button>
            </div>
          ))}
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
          placeholder="Search MCP…"
          aria-label="Search MCP servers and templates"
        />
      </div>
      {visibleServers.length === 0 ? (
        <div className="composer-tools-empty">
          {servers.length === 0
            ? 'No enabled MCP servers configured yet.'
            : `No configured MCP results for “${query}”.`}
        </div>
      ) : (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">Configured</div>
          {visibleServers.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              // Match the @-mention popover: prevent the textarea from
              // losing focus before the click handler runs so
              // selectionStart isn't reset to 0 (#3195).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(s.id)}
              title={`Insert a hint that nudges the model to use ${s.label || s.id}`}
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
          <div className="composer-tools-section-label">Templates</div>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onClick={onManage}
              title={`Add ${tpl.label} from Settings`}
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
        onClick={onManage}
      >
        <Icon name="settings" size={12} />
        <span>Manage MCP servers…</span>
      </button>
    </>
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
  const { locale } = useI18n();
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
          placeholder="Search skills…"
          aria-label="Search skills"
        />
      </div>
      {visibleSkills.length === 0 ? (
        <div className="composer-tools-empty">
          {skills.length === 0 ? 'No skills available yet.' : `No skills found for “${query}”.`}
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
                // Match the @-mention popover: prevent the textarea from
                // losing focus before the click handler runs so
                // selectionStart isn't reset to 0 (#3195).
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
                  <span className="composer-tools-row-pending">Applying…</span>
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

function skillMatchesQuery(skill: SkillSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.mode,
    skill.surface ?? '',
    ...skill.triggers,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
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
}: {
  t: TranslateFn;
  onLinkFolder: () => Promise<void> | void;
}) {
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
      <ImportItem icon="sparkles" label={t('chat.importSkills')} t={t} />
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
}: {
  icon: "upload" | "link" | "grid" | "folder" | "sparkles" | "file";
  label: string;
  t: TranslateFn;
  enabled?: boolean;
  onClick?: () => void;
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
    <div
      className="slash-popover"
      data-testid="slash-popover"
      role="listbox"
      aria-label={t('pet.slashPopoverAria')}
    >
      <div className="slash-popover-head">
        <span>{t('pet.slashPopoverTitle')}</span>
        <span className="slash-popover-hint">{t('pet.slashPopoverHint')}</span>
      </div>
      {commands.map((cmd, idx) => {
        const active = idx === activeIndex;
        return (
          <button
            key={cmd.id}
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
  );
}

function MentionPopover({
  files,
  connectors,
  plugins,
  skills,
  mcpServers,
  query,
  currentSkillId,
  onPickFile,
  onPickPlugin,
  onPickSkill,
  onPickMcp,
  onPickConnector,
}: {
  files: ProjectFile[];
  connectors: ConnectorDetail[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  query: string;
  currentSkillId: string | null;
  onPickFile: (path: string) => void;
  onPickPlugin: (record: InstalledPluginRecord) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickMcp: (server: McpServerConfig) => void;
  onPickConnector: (connector: ConnectorDetail) => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<MentionTab>('all');
  const tabs: Array<{ id: MentionTab; label: string }> = [
    { id: 'all', label: t('chat.mentionTabAll') },
    { id: 'plugins', label: t('chat.mentionTabPlugins') },
    { id: 'skills', label: t('chat.mentionTabSkills') },
    { id: 'mcp', label: t('chat.mentionTabMcp') },
    { id: 'connectors', label: t('chat.mentionTabConnectors') },
    { id: 'files', label: t('chat.mentionTabFiles') },
  ];
  const showPlugins = tab === 'all' || tab === 'plugins';
  const showSkills = tab === 'all' || tab === 'skills';
  const showMcp = tab === 'all' || tab === 'mcp';
  const showConnectors = tab === 'all' || tab === 'connectors';
  const showFiles = tab === 'all' || tab === 'files';
  const hasVisibleResults =
    (showPlugins && plugins.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showMcp && mcpServers.length > 0) ||
    (showConnectors && connectors.length > 0) ||
    (showFiles && files.length > 0);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [connectors, files, plugins, skills, mcpServers, tab]);
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
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mention-results" ref={ref}>
        {!hasVisibleResults ? (
          <div className="mention-empty">
            {query ? (
              <>{t('chat.mentionNoResults', { query })}</>
            ) : (
              <>{t('chat.mentionSearchPrompt')}</>
            )}
          </div>
        ) : null}
        {showPlugins && plugins.length > 0 ? (
        <>
          <div className="mention-section-label">{t('chat.mentionSectionPlugins')}</div>
          {plugins.map((p) => (
            <button
              key={`plugin-${p.id}`}
              className="mention-item mention-item--plugin"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPickPlugin(p)}
              title={p.manifest?.description ?? p.title}
            >
              <Icon name="sparkles" size={12} />
              <span className="mention-item-body">
                <strong>{p.title}</strong>
                <span className="mention-meta mention-meta--desc">
                  {p.manifest?.description ?? p.id}
                </span>
              </span>
              <span className="mention-meta">{pluginSourceLabel(p, t)}</span>
            </button>
          ))}
        </>
      ) : null}
        {showSkills && skills.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionSkills')}</div>
            {skills.map((skill) => {
              const active = skill.id === currentSkillId;
              return (
                <button
                  key={`skill-${skill.id}`}
                  className="mention-item"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickSkill(skill)}
                  title={localizeSkillDescription(locale, skill)}
                >
                  <Icon name={active ? 'check' : 'file'} size={12} />
                  <span className="mention-item-body">
                    <strong>{localizeSkillName(locale, skill)}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {localizeSkillDescription(locale, skill) || skill.id}
                    </span>
                  </span>
                  <span className="mention-meta">{active ? t('chat.mentionActiveSkill') : skill.mode}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showMcp && mcpServers.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionMcp')}</div>
            {mcpServers.map((server) => (
              <button
                key={`mcp-${server.id}`}
                className="mention-item"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickMcp(server)}
                title={t('chat.mentionUseMcpTitle', { name: server.label || server.id })}
              >
                <Icon name="link" size={12} />
                <span className="mention-item-body">
                  <strong>{server.label || server.id}</strong>
                  <span className="mention-meta mention-meta--desc">
                    {server.url || server.command || server.id}
                  </span>
                </span>
                <span className="mention-meta">{server.transport}</span>
              </button>
            ))}
          </>
        ) : null}
        {showConnectors && connectors.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionConnectors')}</div>
            {connectors.map((connector) => (
              <button
                key={`connector-${connector.id}`}
                className="mention-item"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickConnector(connector)}
                title={t('chat.mentionUseConnectorTitle', { name: connector.name })}
              >
                <Icon name="link" size={12} />
                <span className="mention-item-body">
                  <strong>{connector.name}</strong>
                  <span className="mention-meta mention-meta--desc">
                    {connector.description || connector.provider || connector.id}
                  </span>
                </span>
                <span className="mention-meta">{connector.accountLabel ?? connector.provider}</span>
              </button>
            ))}
          </>
        ) : null}
        {showFiles && files.length > 0 ? (
        <>
          <div className="mention-section-label">{t('chat.mentionSectionFiles')}</div>
          {files.map((f) => {
            const key = f.path ?? f.name;
            return (
              <button
                key={`file-${key}`}
                className="mention-item"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickFile(key)}
              >
                <Icon name="file" size={12} />
                <code>{key}</code>
                {f.size != null ? (
                  <span className="mention-meta">{prettySize(f.size)}</span>
                ) : null}
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
