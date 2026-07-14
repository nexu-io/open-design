// Feature-local hook for the `@`-mention popover: the open/query/tab state,
// the caret box the popover anchors against, the per-source filtered
// candidate lists (files, workspace tabs, plugins, skills, MCP servers,
// connectors), the "known entities" list the Lexical editor uses to detect
// existing `@token`s in the draft, and the bound trigger-detection/keyboard-
// nav/pick action functions (via `actions.ts`, deps-bag internally).
//
// Picking a result needs pieces several OTHER clusters own (the slash-
// popover's state/pick callback, the Lexical editor's mention-insert
// primitive, every staging setter a pick can touch, project skill patching)
// — this hook takes those as params (mirroring `MemorySection.tsx`'s
// `useEntries({ fireFlash, hydrateConfig, openEditor, closeEditor })`, which
// takes other hooks' outputs as params rather than pushing the composition
// back onto the orchestrator) and returns the already-bound callbacks, so
// the orchestrator itself never builds a deps bag or wraps a `useCallback`.
import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type { ChatAttachment, Project, ProjectFile, SkillSummary } from '../../../types';
import type { CaretRect } from '../../../components/composer/LexicalComposerInput';
import { workspaceContextSearchText, skillMentionRank, buildComposerMentionEntities } from '../rules';
import { skillMatchesQuery } from '../../../runtime/design-toolbox';
import type { InlineMentionEntity } from '../../../utils/inlineMentions';
import type { MentionTab, SlashCommand } from '../types';
import {
  handleEditorTrigger as handleEditorTriggerAction,
  handlePopoverKey as handlePopoverKeyAction,
  insertMention as insertMentionAction,
  insertPluginMention as insertPluginMentionAction,
  insertMcpMention as insertMcpMentionAction,
  insertConnectorMention as insertConnectorMentionAction,
  insertWorkspaceMention as insertWorkspaceMentionAction,
  insertSkillMention as insertSkillMentionAction,
  type MentionActionDeps,
} from '../actions';

export interface MentionPopoverParams {
  projectFiles: ProjectFile[];
  /** The full set of workspace-context "tabs" the @-picker can offer (a
   *  prop), distinct from the staged/selected subset another cluster owns. */
  workspaceContexts: WorkspaceContextItem[];
  pluginsForComposer: InstalledPluginRecord[];
  enabledMcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
  skills: SkillSummary[];
  stagedSkills: SkillSummary[];
  staged: ChatAttachment[];
  /** The visible + staged workspace contexts (from the workspace-context
   *  linking cluster) that feed the editor's known-mention-entities list. */
  selectedWorkspaceContexts: WorkspaceContextItem[];
  // The slash-popover cluster's state + pick callback — `handlePopoverKey`
  // drives both popovers' keyboard nav from one Lexical callback.
  slash: { q: string } | null;
  setSlash: (value: { q: string } | null) => void;
  slashIndex: number;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  filteredSlash: SlashCommand[];
  pickSlash: (cmd: SlashCommand) => void;
  // The Lexical editor's mention-insert primitive (shared across every
  // popover/cluster, orchestrator-owned) and the upload cluster's
  // context-attachment appender a file pick also needs.
  insertEditorMention: (insert: { token: string; entity: InlineMentionEntity }) => void;
  appendContextAttachment: (path: string) => void;
  // Staging setters a pick can touch (each cluster's own).
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>;
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>;
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>;
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  // The inline-backed-plugin ref bridge + plugins-section apply, shared with
  // the design-toolbox cluster's own binding of the same primitives.
  setInlineBackedPlugin: (value: { id: string; label: string } | null) => void;
  applyPluginById: (id: string, record: InstalledPluginRecord) => Promise<void>;
  projectId: string | null;
  patchProject: (id: string, patch: { skillId: string }) => Promise<Project | null>;
  onProjectSkillChange?: (skillId: string | null) => void;
}

export interface MentionPopoverController {
  mention: { q: string } | null;
  setMention: Dispatch<SetStateAction<{ q: string } | null>>;
  mentionIndex: number;
  setMentionIndex: Dispatch<SetStateAction<number>>;
  mentionTab: MentionTab;
  setMentionTab: Dispatch<SetStateAction<MentionTab>>;
  caretRect: CaretRect | null;
  setCaretRect: Dispatch<SetStateAction<CaretRect | null>>;
  mentionQuery: string;
  composerMentionEntities: InlineMentionEntity[];
  filteredFiles: ProjectFile[];
  filteredWorkspaceContexts: WorkspaceContextItem[];
  filteredPlugins: InstalledPluginRecord[];
  filteredMcpServers: McpServerConfig[];
  filteredConnectors: ConnectorDetail[];
  filteredSkills: SkillSummary[];
  handleEditorTrigger: (params: {
    mention: { q: string } | null;
    slash: { q: string } | null;
    anchorRect: CaretRect | null;
  }) => void;
  handlePopoverKey: (key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape') => boolean;
  insertMention: (filePath: string) => void;
  insertPluginMention: (record: InstalledPluginRecord) => Promise<void>;
  insertMcpMention: (server: McpServerConfig) => void;
  insertConnectorMention: (connector: ConnectorDetail) => void;
  insertWorkspaceMention: (item: WorkspaceContextItem) => void;
  insertSkillMention: (skill: SkillSummary) => Promise<void>;
  handleMentionTabChange: (nextTab: MentionTab) => void;
}

export function useMentionPopover({
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
  pickSlash,
  insertEditorMention,
  appendContextAttachment,
  setStagedSkills,
  setStagedMcpServers,
  setStagedConnectors,
  setStagedWorkspaceContexts,
  setInlineBackedPlugin,
  applyPluginById,
  projectId,
  patchProject,
  onProjectSkillChange,
}: MentionPopoverParams): MentionPopoverController {
  // Lexical owns the caret, so the mention trigger state only carries the
  // typed query — no cursor offset.
  const [mention, setMention] = useState<{ q: string } | null>(null);
  // Active-row index for the @-popover's visible union (files → tabs →
  // plugins → skills → mcp → connectors). Resets to 0 whenever the query
  // identity or tab changes; drives the visual highlight + Enter/Tab target.
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<MentionTab>('all');
  // Viewport caret box the floating popover anchors against. Sampled by the
  // editor at trigger-detection time; null when no trigger is live.
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);

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

  // The @-picker offers a unified search across context surfaces: workspace
  // tabs first, then project files, plugins, skills, active MCP servers, and
  // connectors. The suggestion lists below only matter while the @-popover is
  // open (each is `[]` otherwise). Memoize them on `[mention, mentionQuery,
  // <source>]` so the filter/sort passes run only when the query or the
  // backing list actually changes — not on every unrelated composer render
  // (streaming flips, draft typing routed through Lexical, staged-chip
  // churn). `mention` is in the deps (not just `mentionQuery`) so the
  // open/close gate re-evaluates: a null→{q:''} transition keeps the query ''
  // but must flip the list from `[]` to live results.
  const mentionQuery = mention ? mention.q.toLowerCase() : '';

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
  // Already-staged skills drop out of the suggestion list (carried over from
  // main) so the @-popover keeps moving forward as the user picks.
  const filteredSkills = useMemo(() => {
    if (!mention) return [];
    const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
    return skills
      .filter((s) => !stagedSkillIds.has(s.id))
      .filter((s) => skillMatchesQuery(s, mentionQuery))
      .sort((a, b) => skillMentionRank(a, mentionQuery) - skillMentionRank(b, mentionQuery));
  }, [mention, mentionQuery, skills, stagedSkills]);

  // Recreated each render (every field below either comes straight from a
  // prop/other-hook value or is itself recreated each render), so the
  // callbacks below always close over the latest state — matching the
  // pre-hook-extraction orchestrator's "recreated each render" deps-bag
  // convention exactly, just assembled here instead of in the orchestrator.
  const mentionActionDeps: MentionActionDeps = {
    setCaretRect,
    mention,
    setMention,
    mentionIndex,
    setMentionIndex,
    mentionTab,
    setMentionTab,
    slash,
    setSlash,
    slashIndex,
    setSlashIndex,
    filteredSlash,
    pickSlash,
    filteredFiles,
    filteredWorkspaceContexts,
    filteredPlugins,
    filteredSkills,
    filteredMcpServers,
    filteredConnectors,
    insertEditorMention,
    staged,
    appendContextAttachment,
    setStagedSkills,
    setStagedMcpServers,
    setStagedConnectors,
    setStagedWorkspaceContexts,
    setInlineBackedPlugin,
    applyPluginById,
    projectId,
    patchProject,
    onProjectSkillChange,
  };

  const handleEditorTrigger = useCallback((params: {
    mention: { q: string } | null;
    slash: { q: string } | null;
    anchorRect: CaretRect | null;
  }) => {
    handleEditorTriggerAction(params, mentionActionDeps);
  }, [mentionActionDeps]);

  const handlePopoverKey = useCallback(
    (key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape'): boolean =>
      handlePopoverKeyAction(key, mentionActionDeps),
    [mentionActionDeps],
  );

  const insertMention = useCallback((filePath: string) => {
    insertMentionAction(filePath, mentionActionDeps);
  }, [mentionActionDeps]);

  const insertPluginMention = useCallback(async (record: InstalledPluginRecord) => {
    await insertPluginMentionAction(record, mentionActionDeps);
  }, [mentionActionDeps]);

  const insertMcpMention = useCallback((server: McpServerConfig) => {
    insertMcpMentionAction(server, mentionActionDeps);
  }, [mentionActionDeps]);

  const insertConnectorMention = useCallback((connector: ConnectorDetail) => {
    insertConnectorMentionAction(connector, mentionActionDeps);
  }, [mentionActionDeps]);

  const insertWorkspaceMention = useCallback((item: WorkspaceContextItem) => {
    insertWorkspaceMentionAction(item, mentionActionDeps);
  }, [mentionActionDeps]);

  const insertSkillMention = useCallback(async (skill: SkillSummary) => {
    await insertSkillMentionAction(skill, mentionActionDeps);
  }, [mentionActionDeps]);

  // Both mentionTab and mentionIndex are this hook's own state — switching
  // tabs also resets the active index so the previous tab's selection
  // doesn't carry over as an out-of-range highlight on the new list.
  const handleMentionTabChange = useCallback((nextTab: MentionTab) => {
    setMentionTab(nextTab);
    setMentionIndex(0);
  }, []);

  return {
    mention,
    setMention,
    mentionIndex,
    setMentionIndex,
    mentionTab,
    setMentionTab,
    caretRect,
    setCaretRect,
    mentionQuery,
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
  };
}
