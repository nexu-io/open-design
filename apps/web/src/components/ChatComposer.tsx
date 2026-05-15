import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { useAnalytics } from '../analytics/provider';
import {
  trackStudioClickChatComposer,
  trackStudioViewChatPanel,
} from '../analytics/events';
import { projectRawUrl, uploadProjectFiles, openFolderDialog } from "../providers/registry";
import { patchProject } from "../state/projects";
import { fetchMcpServers } from "../state/mcp";
import type { McpServerConfig, McpTemplate } from "../state/mcp";
import { listPlugins } from "../state/projects";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ProjectFile, ProjectMetadata, SkillSummary } from "../types";
import type {
  ContextItem,
  InstalledPluginRecord,
  PluginSourceKind,
  ResearchOptions,
} from '@open-design/contracts';
import { buildVisualAnnotationAttachment } from '../comments';
import { Icon } from "./Icon";
import { PluginDetailsModal } from "./PluginDetailsModal";
import { PluginsSection, type PluginsSectionHandle } from "./PluginsSection";
import { BUILT_IN_PETS, CUSTOM_PET_ID, resolveActivePet } from "./pet/pets";
import {
  buildInlineMentionParts,
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from "./PreviewDrawOverlay";

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import' | 'pet';

type MentionTab = 'all' | 'plugins' | 'skills' | 'mcp' | 'files';

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

interface Props {
  projectId: string | null;
  projectFiles: ProjectFile[];
  streaming: boolean;
  sendDisabled?: boolean;
  initialDraft?: string;
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
}

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

export interface ChatSendMeta {
  research?: ResearchOptions;
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
      onEnsureProject,
      commentAttachments = [],
      onRemoveCommentAttachment,
      skills = [],
      onSend,
      onStop,
      onOpenSettings,
      onOpenMcpSettings,
      petConfig,
      onAdoptPet,
      onTogglePet,
      onOpenPetSettings,
      researchAvailable = false,
      projectMetadata,
      onProjectMetadataChange,
      currentSkillId = null,
      onProjectSkillChange,
      pinnedPluginId = null,
    },
    ref
  ) {
    const t = useT();
    const analytics = useAnalytics();
    const [draft, setDraft] = useState(initialDraft ?? "");

    // studio_view chat_panel — fire once per ChatComposer mount per project.
    // The composer is the dominant chat surface; firing here keeps the
    // event close to where the user actually sees the panel rather than at
    // the higher-level ProjectView layer which mounts before the composer.
    const studioViewFiredRef = useRef<string | null>(null);
    useEffect(() => {
      if (studioViewFiredRef.current === projectId) return;
      studioViewFiredRef.current = projectId;
      trackStudioViewChatPanel(analytics.track, {
        page: 'studio',
        area: 'chat_panel',
        element: 'chat_tab',
        view_type: 'panel',
        source: 'open_project',
        conversation_id: null,
      });
    }, [projectId, analytics.track]);
    const [staged, setStaged] = useState<ChatAttachment[]>([]);
    const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>([]);
    // Skills the user has @-mentioned for this turn. We dedupe on id and
    // strip the chip when the user removes the corresponding `@<skill>`
    // token from the draft, keeping draft and chips in sync.
    const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
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
    // Installed plugins, fetched lazily for the tools-menu Plugins tab and
    // the @-mention picker. Both surfaces share the same list so applying
    // a plugin from either path lands on the same project context.
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
    // Detail modal — opened from a context chip click (kind === 'plugin')
    // or from the tools-menu "Details" affordance.
    const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts MCP / Import / Pet quick actions and
    // a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    const [toolsOpen, setToolsOpen] = useState(false);
    const [toolsTab, setToolsTab] = useState<ToolsTab>('plugins');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const toolsMenuRef = useRef<HTMLDivElement | null>(null);
    const toolsTriggerRef = useRef<HTMLButtonElement | null>(null);
    const petEnabled = Boolean(onAdoptPet && onTogglePet);
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
        setDraft(initialDraft);
        seededRef.current = true;
      } else if (initialDraft === undefined) {
        seededRef.current = true;
      }
    }, [initialDraft, draft]);

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
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills,
          staged,
        }),
      [enabledMcpServers, pluginsForComposer, projectFiles, skills, staged],
    );
    const composerMentionParts = useMemo(
      () => buildInlineMentionParts(draft, composerMentionEntities),
      [composerMentionEntities, draft],
    );
    useEffect(() => {
      setComposerScrollTop(textareaRef.current?.scrollTop ?? 0);
    }, [composerMentionParts, draft]);

    // Resolve which tabs to surface in the consolidated tools popover.
    // Plugins is always visible while a project is active so users can
    // apply context without leaving the composer. MCP and Pet tabs only
    // show when their respective wiring was provided by the parent (App);
    // Import is always available (folder linking is unconditional).
    const availableTabs = useMemo<ToolsTab[]>(() => {
      const tabs: ToolsTab[] = [];
      if (projectId) {
        tabs.push('plugins');
        tabs.push('skills');
      }
      if (onOpenMcpSettings) tabs.push('mcp');
      tabs.push('import');
      if (petEnabled) tabs.push('pet');
      return tabs;
    }, [projectId, onOpenMcpSettings, petEnabled]);

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
      setDraft(next);
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
      setDraft('');
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
      setDraft('');
      return true;
    }

    useImperativeHandle(
      ref,
      () => ({
        setDraft: (text: string) => {
          setDraft(text);
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

    function reset() {
      setDraft("");
      setStaged([]);
      setStagedVisualComments([]);
      setStagedSkills([]);
      setUploadError(null);
      setMention(null);
      setSlash(null);
    }

    function currentCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return [...commentAttachments, ...stagedVisualComments, ...extra];
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
      setDraft((d) =>
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
      try {
        const result = await uploadProjectFiles(id, files);
        if (result.uploaded.length > 0) {
          setStaged((s) => [...s, ...result.uploaded]);
        }
        if (result.failed.length > 0) {
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
      } finally {
        setUploading(false);
      }
    }

    useEffect(() => {
      function onAnnotation(e: Event) {
        const detail = (e as CustomEvent<AnnotationEventDetail>).detail;
        if (!detail) return;
        void (async () => {
          let uploaded: ChatAttachment[] = [];
          let visualAttachmentInput: Parameters<typeof buildVisualAnnotationAttachment>[0] | null = null;
          let visualAttachment: ChatCommentAttachment | null = null;
          if (detail.file) {
            const id = await ensureProject();
            if (!id) return;
            setUploading(true);
            try {
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
              }
            } finally {
              setUploading(false);
            }
          }

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
              if (detail.note) setDraft((d) => (d ? `${d}\n${detail.note}` : detail.note));
              textareaRef.current?.focus();
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
            if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return;
            const skillIds = stagedSkills.map((s) => s.id);
            const skillMeta = skillIds.length > 0 ? { skillIds } : undefined;
            onSend(prompt, attachments, nextCommentAttachments, skillMeta);
            reset();
            return;
          }

          if (detail.note) {
            setDraft((d) => (d ? `${d}\n${detail.note}` : detail.note));
            textareaRef.current?.focus();
          }
        })();
      }
      window.addEventListener(ANNOTATION_EVENT, onAnnotation);
      return () => window.removeEventListener(ANNOTATION_EVENT, onAnnotation);
    }, [commentAttachments, draft, onSend, projectId, staged, stagedSkills, stagedVisualComments, streaming]);

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
      }
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
      setDraft(value);
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
      setDraft(next);
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
      const inserted = replaceMentionWithText(`${inlineMentionToken(record.title)} `);
      if (!inserted) return;
      await pluginsSectionRef.current?.applyById(record.id, record);
    }

    function replaceMentionWithText(text: string): boolean {
      if (!mention) return false;
      const ta = textareaRef.current;
      const cursor = mention.cursor;
      const before = draft.slice(0, cursor);
      const after = draft.slice(cursor);
      const replaced = before.replace(/(^|\s)@([^\s@]*)$/, `$1${text}`);
      const next = replaced + after;
      setDraft(next);
      setMention(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
      return true;
    }

    function insertMcpMention(server: McpServerConfig) {
      replaceMentionWithText(`${inlineMentionToken(server.label || server.id)} `);
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
      const skillIds = stagedSkills.map((s) => s.id);
      const skillMeta = skillIds.length > 0 ? { skillIds } : undefined;
      const hatched = expandHatchCommand(prompt);
      const nextCommentAttachments = currentCommentAttachments();
      if (hatched) {
        if (streaming) return;
        onSend(hatched, staged, nextCommentAttachments, skillMeta);
        reset();
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        onSend(search.prompt, staged, nextCommentAttachments, {
          ...skillMeta,
          research: { enabled: true, query: search.query },
        });
        reset();
        return;
      }
      if ((!prompt && staged.length === 0 && nextCommentAttachments.length === 0) || streaming) return;
      onSend(prompt, staged, nextCommentAttachments, skillMeta);
      reset();
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
    // Already-staged skills drop out of the suggestion list (carried over
    // from main) so the @-popover keeps moving forward as the user picks.
    const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
    const filteredSkills = mention
      ? skills
          .filter((s) => !stagedSkillIds.has(s.id))
          .filter((s) => {
            if (!mentionQuery) return true;
            return [
              s.id,
              s.name,
              s.description,
              s.mode,
              s.surface ?? '',
              ...s.triggers,
            ]
              .join(' ')
              .toLowerCase()
              .includes(mentionQuery);
          })
          .slice(0, 8)
      : [];

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
                // flow (which awaits applyById after setDraft) still see the
                // latest draft value before deciding whether to seed.
                if (typeof brief === 'string' && brief.length > 0) {
                  setDraft((cur) => (cur.trim().length === 0 ? brief : cur));
                }
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
                onKeyDown={(e) => {
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
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
                query={mention.q}
                currentSkillId={currentSkillId}
                onPickFile={insertMention}
                onPickPlugin={(record) => void insertPluginMention(record)}
                onPickSkill={(skill) => void insertSkillMention(skill)}
                onPickMcp={insertMcpMention}
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
                onClick={() => setToolsOpen((v) => !v)}
                title={t('chat.cliSettingsTitle')}
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
                aria-label={t('chat.cliSettingsAria')}
              >
                <Icon name="sliders" size={15} />
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
                        {tab === 'pet' ? (
                          <>
                            <span className="composer-tools-tab-glyph" aria-hidden>
                              {resolveActivePet(petConfig)?.glyph ?? '🐾'}
                            </span>
                            <span>{t('pet.composerMenuTitle')}</span>
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
                          const result = await pluginsSectionRef.current?.applyById(
                            record.id,
                            record,
                          );
                          if (result) setToolsOpen(false);
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
                          if (applied) setToolsOpen(false);
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
                          setDraft(next);
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
                    {toolsTab === 'pet' && petEnabled ? (
                      <ToolsPetPanel
                        t={t}
                        petConfig={petConfig}
                        onTogglePet={() => {
                          onTogglePet?.();
                          setToolsOpen(false);
                        }}
                        onAdoptPet={(id) => {
                          onAdoptPet?.(id);
                          setToolsOpen(false);
                        }}
                        onOpenPetSettings={() => {
                          onOpenPetSettings?.();
                          setToolsOpen(false);
                        }}
                      />
                    ) : null}
                  </div>

                  {onOpenSettings ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="composer-tools-settings"
                      onClick={() => {
                        setToolsOpen(false);
                        onOpenSettings?.();
                      }}
                    >
                      <Icon name="settings" size={13} />
                      <span>{t('pet.composerOpenSettings')}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              className="icon-btn"
              data-testid="chat-attach"
              onClick={() => {
                trackStudioClickChatComposer(analytics.track, {
                  page: 'studio',
                  area: 'chat_composer',
                  element: 'attachment_button',
                  action: 'click_composer_control',
                  user_query_tokens: Math.ceil(draft.length / 4),
                  has_attachment: staged.length > 0 || commentAttachments.length > 0,
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
            <span className="composer-spacer" />
            {streaming ? (
              <button
                type="button"
                className="composer-send stop"
                onClick={onStop}
              >
                <Icon name="stop" size={13} />
                <span>{t('chat.stop')}</span>
              </button>
            ) : (
              <button
                type="button"
                className="composer-send"
                data-testid="chat-send"
                onClick={() => {
                  trackStudioClickChatComposer(analytics.track, {
                    page: 'studio',
                    area: 'chat_composer',
                    element: 'send_button',
                    action: 'click_composer_control',
                    user_query_tokens: Math.ceil(draft.length / 4),
                    has_attachment:
                      staged.length > 0 || currentCommentAttachments().length > 0,
                  });
                  void submit();
                }}
                disabled={
                  sendDisabled ||
                  (!draft.trim() && staged.length === 0 && currentCommentAttachments().length === 0)
                }
              >
                <Icon name="send" size={13} />
                <span>{t('chat.send')}</span>
              </button>
            )}
          </div>
        </div>
        {uploadError ? <span className="composer-hint">{uploadError}</span> : null}
        <span className="composer-hint">{t('chat.composerHint')}</span>
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={async (record) => {
              await pluginsSectionRef.current?.applyById(record.id, record);
              setDetailsRecord(null);
            }}
          />
        ) : null}
      </div>
    );
  }
);

function buildComposerMentionEntities({
  files,
  mcpServers,
  plugins,
  skills,
  staged,
}: {
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
      {preview && previewUrl ? (
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
        </div>
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
          <span className="staged-name" title={`${a.screenshotPath ? `${a.screenshotPath}: ` : ''}${a.elementId}: ${a.comment}`}>
            <strong>{a.selectionKind === 'visual' ? 'Visual mark' : a.elementId}</strong>
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
                onClick={async () => {
                  setPendingId(skill.id);
                  try {
                    await onPick(skill);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                title={skill.description}
              >
                <Icon name={active ? 'check' : 'file'} size={12} />
                <span className="composer-tools-row-body">
                  <strong>{skill.name}</strong>
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

function pluginSourceLabel(plugin: InstalledPluginRecord): string {
  return plugin.sourceKind === 'bundled' ? 'Official' : 'My plugin';
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

function ToolsPetPanel({
  t,
  petConfig,
  onTogglePet,
  onAdoptPet,
  onOpenPetSettings,
}: {
  t: TranslateFn;
  petConfig: AppConfig['pet'] | undefined;
  onTogglePet: () => void;
  onAdoptPet: (id: string) => void;
  onOpenPetSettings: () => void;
}) {
  return (
    <div className="composer-tools-pet">
      <div className="composer-tools-pet-head">
        <span className="hint">{t('pet.composerMenuHint')}</span>
      </div>
      {petConfig?.adopted ? (
        <button
          type="button"
          role="menuitem"
          className="composer-tools-row composer-tools-row-toggle"
          onClick={onTogglePet}
        >
          <Icon name={petConfig.enabled ? 'eye' : 'sparkles'} size={12} />
          <span>{petConfig.enabled ? t('pet.tuck') : t('pet.wake')}</span>
        </button>
      ) : null}
      <div className="composer-tools-pet-grid">
        {BUILT_IN_PETS.map((p) => {
          const active = petConfig?.adopted && petConfig.petId === p.id;
          return (
            <button
              type="button"
              role="menuitem"
              key={p.id}
              className={`composer-tools-pet-item${active ? ' active' : ''}`}
              onClick={() => onAdoptPet(p.id)}
              style={{ ['--pet-accent' as string]: p.accent }}
              title={p.flavor}
            >
              <span aria-hidden>{p.glyph}</span>
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        role="menuitem"
        className="composer-tools-row composer-tools-row-action"
        onClick={onOpenPetSettings}
      >
        <Icon name="settings" size={12} />
        <span>{t('pet.composerOpenSettings')}</span>
      </button>
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
  plugins,
  skills,
  mcpServers,
  query,
  currentSkillId,
  onPickFile,
  onPickPlugin,
  onPickSkill,
  onPickMcp,
}: {
  files: ProjectFile[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  query: string;
  currentSkillId: string | null;
  onPickFile: (path: string) => void;
  onPickPlugin: (record: InstalledPluginRecord) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickMcp: (server: McpServerConfig) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<MentionTab>('all');
  const tabs: Array<{ id: MentionTab; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'skills', label: 'Skills' },
    { id: 'mcp', label: 'MCP' },
    { id: 'files', label: 'Design files' },
  ];
  const showPlugins = tab === 'all' || tab === 'plugins';
  const showSkills = tab === 'all' || tab === 'skills';
  const showMcp = tab === 'all' || tab === 'mcp';
  const showFiles = tab === 'all' || tab === 'files';
  const hasVisibleResults =
    (showPlugins && plugins.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showMcp && mcpServers.length > 0) ||
    (showFiles && files.length > 0);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [files, plugins, skills, mcpServers, tab]);
  return (
    <div className="mention-popover" data-testid="mention-popover">
      <div className="mention-tabs" role="tablist" aria-label="Mention surfaces">
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
              <>No results for “{query}”.</>
            ) : (
              <>Search plugins, skills, MCP servers, and Design Files.</>
            )}
          </div>
        ) : null}
        {showPlugins && plugins.length > 0 ? (
        <>
          <div className="mention-section-label">Plugins</div>
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
              <span className="mention-meta">{pluginSourceLabel(p)}</span>
            </button>
          ))}
        </>
      ) : null}
        {showSkills && skills.length > 0 ? (
          <>
            <div className="mention-section-label">Skills</div>
            {skills.map((skill) => {
              const active = skill.id === currentSkillId;
              return (
                <button
                  key={`skill-${skill.id}`}
                  className="mention-item"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickSkill(skill)}
                  title={skill.description}
                >
                  <Icon name={active ? 'check' : 'file'} size={12} />
                  <span className="mention-item-body">
                    <strong>{skill.name}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {skill.description || skill.id}
                    </span>
                  </span>
                  <span className="mention-meta">{active ? 'Active' : skill.mode}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showMcp && mcpServers.length > 0 ? (
          <>
            <div className="mention-section-label">MCP</div>
            {mcpServers.map((server) => (
              <button
                key={`mcp-${server.id}`}
                className="mention-item"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickMcp(server)}
                title={`Use ${server.label || server.id}`}
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
        {showFiles && files.length > 0 ? (
        <>
          <div className="mention-section-label">Design files</div>
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

function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
