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
import { projectRawUrl, uploadProjectFiles, openFolderDialog } from "../providers/registry";
import { patchProject } from "../state/projects";
import { fetchMcpServers } from "../state/mcp";
import type { McpServerConfig } from "../state/mcp";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ProjectFile, ProjectMetadata } from "../types";
import type { ResearchOptions } from '@open-design/contracts';
import { Icon } from "./Icon";
import { BUILT_IN_PETS, CUSTOM_PET_ID, resolveActivePet } from "./pet/pets";

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

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
  initialDraft?: string;
  // Lazy ensure — the composer calls this before its first upload, so the
  // project folder exists on disk before files land in it. Returns the
  // project id when ready.
  onEnsureProject: () => Promise<string | null>;
  commentAttachments?: ChatCommentAttachment[];
  onRemoveCommentAttachment?: (id: string) => void;
  onSend: (prompt: string, attachments: ChatAttachment[], commentAttachments: ChatCommentAttachment[], meta?: ChatSendMeta) => void;
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
}

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

export interface ChatSendMeta {
  research?: ResearchOptions;
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
      initialDraft,
      onEnsureProject,
      commentAttachments = [],
      onRemoveCommentAttachment,
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
    },
    ref
  ) {
    const t = useT();
    const [draft, setDraft] = useState(initialDraft ?? "");
    const [staged, setStaged] = useState<ChatAttachment[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [mention, setMention] = useState<{
      q: string;
      cursor: number;
    } | null>(null);
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
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts MCP / Import / Pet quick actions and
    // a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    const [toolsOpen, setToolsOpen] = useState(false);
    type ToolsTab = 'mcp' | 'import' | 'pet';
    const [toolsTab, setToolsTab] = useState<ToolsTab>('mcp');
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
        setMcpServers(data.servers.filter((s) => s.enabled));
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    // Resolve which tabs to surface in the consolidated tools popover.
    // We intentionally always render at least the Import tab, since it has
    // unconditional folder linking. MCP and Pet tabs only show when their
    // respective wiring was provided by the parent (App).
    const availableTabs = useMemo<ToolsTab[]>(() => {
      const tabs: ToolsTab[] = [];
      if (onOpenMcpSettings) tabs.push('mcp');
      tabs.push('import');
      if (petEnabled) tabs.push('pet');
      return tabs;
    }, [onOpenMcpSettings, petEnabled]);

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
      for (const s of mcpServers) {
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
    }, [petEnabled, researchAvailable, t, mcpServers, onOpenMcpSettings]);

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
      setUploadError(null);
      setMention(null);
      setSlash(null);
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

    function removeStaged(p: string) {
      setStaged((s) => s.filter((a) => a.path !== p));
    }

    async function submit() {
      const prompt = draft.trim();
      // Intercept `/pet …` and `/mcp` before sending so the slash command
      // never hits the agent — these are local UX hooks, not model prompts.
      if (tryHandlePetSlash()) return;
      if (tryHandleMcpSlash()) return;
      // `/hatch <concept>` expands into the canonical hatch-pet skill
      // prompt and *is* sent to the agent — the agent runs the skill,
      // packages a Codex pet under `~/.codex/pets/`, and the user
      // adopts it from "Recently hatched" in pet settings afterwards.
      const hatched = expandHatchCommand(prompt);
      if (hatched) {
        if (streaming) return;
        onSend(hatched, staged, commentAttachments);
        reset();
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        onSend(search.prompt, staged, commentAttachments, {
          research: { enabled: true, query: search.query },
        });
        reset();
        return;
      }
      if ((!prompt && commentAttachments.length === 0) || streaming) return;
      onSend(prompt, staged, commentAttachments);
      reset();
    }

    // The @-picker treats the project listing as path-shaped (path + size).
    // ProjectFile.path is optional, so fall back to .name for the legacy
    // flat shape — both ChatComposer and the old code paths see the same
    // entries.
    const filteredFiles = mention
      ? projectFiles
          .filter((f) => f.type === undefined || f.type === "file")
          .filter((f) => {
            const key = f.path ?? f.name;
            return key.toLowerCase().includes(mention.q.toLowerCase());
          })
          .slice(0, 12)
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
          {commentAttachments.length > 0 ? (
            <StagedCommentAttachments
              attachments={commentAttachments}
              onRemove={(id) => onRemoveCommentAttachment?.(id)}
              t={t}
            />
          ) : null}
          <div className="composer-input-wrap">
            <textarea
              ref={textareaRef}
              data-testid="chat-composer-input"
              value={draft}
              placeholder={t('chat.composerPlaceholder')}
              onChange={handleChange}
              onPaste={handlePaste}
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
            {mention && filteredFiles.length > 0 ? (
              <MentionPopover files={filteredFiles} onPick={insertMention} />
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
                {mcpServers.length > 0 ? (
                  <span className="composer-tools-badge">{mcpServers.length}</span>
                ) : null}
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
                        {tab === 'mcp' ? (
                          <>
                            <Icon name="link" size={12} />
                            <span>MCP</span>
                            {mcpServers.length > 0 ? (
                              <span className="composer-tools-tab-count">
                                {mcpServers.length}
                              </span>
                            ) : null}
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
                    {toolsTab === 'mcp' && onOpenMcpSettings ? (
                      <ToolsMcpPanel
                        servers={mcpServers}
                        onInsert={(serverId) => {
                          const ta = textareaRef.current;
                          const insert = `Use the \`${serverId}\` MCP server tools. `;
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
              onClick={() => fileInputRef.current?.click()}
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
                onClick={() => void submit()}
                disabled={!draft.trim() && commentAttachments.length === 0}
              >
                <Icon name="send" size={13} />
                <span>{t('chat.send')}</span>
              </button>
            )}
          </div>
        </div>
        {uploadError ? <span className="composer-hint">{uploadError}</span> : null}
        <span className="composer-hint">{t('chat.composerHint')}</span>
      </div>
    );
  }
);

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
  return (
    <div className="staged-row" data-testid="staged-attachments">
      {attachments.map((a) => (
        <div key={a.path} className={`staged-chip staged-${a.kind}`}>
          {a.kind === "image" && projectId ? (
            <img src={projectRawUrl(projectId, a.path)} alt={a.name} />
          ) : (
            <span className="staged-icon" aria-hidden>
              <Icon name="file" size={13} />
            </span>
          )}
          <span className="staged-name" title={a.path}>
            {a.name}
          </span>
          <button
            className="staged-remove"
            onClick={() => onRemove(a.path)}
            title={t('common.delete')}
            aria-label={t('chat.removeAria', { name: a.name })}
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
  return (
    <div className="staged-row comment-staged-row" data-testid="staged-comment-attachments">
      {attachments.map((a) => (
        <div key={a.id} className="staged-chip staged-comment">
          <span className="staged-name" title={`${a.elementId}: ${a.comment}`}>
            <strong>{a.elementId}</strong>
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

function ToolsMcpPanel({
  servers,
  onInsert,
  onManage,
}: {
  servers: McpServerConfig[];
  onInsert: (serverId: string) => void;
  onManage: () => void;
}) {
  return (
    <>
      {servers.length === 0 ? (
        <div className="composer-tools-empty">
          No MCP servers configured yet. Open Settings to add Higgsfield,
          GitHub, Filesystem, or a custom server.
        </div>
      ) : (
        <div className="composer-tools-list">
          {servers.map((s) => (
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
  onPick,
}: {
  files: ProjectFile[];
  onPick: (path: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [files]);
  return (
    <div className="mention-popover" data-testid="mention-popover" ref={ref}>
      {files.map((f) => {
        const key = f.path ?? f.name;
        return (
          <button
            key={key}
            className="mention-item"
            onClick={() => onPick(key)}
          >
            <code>{key}</code>
            {f.size != null ? (
              <span className="mention-meta">{prettySize(f.size)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
