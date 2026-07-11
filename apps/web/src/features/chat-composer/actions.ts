// Orchestration functions for the chat-composer: real branching/side-effect
// logic (unlike rules.ts, which stays pure) extracted out of ChatComposer.tsx
// so the god-component shrinks without a redesign. Each function takes every
// piece of orchestrator state/setter/callback it needs as an explicit
// parameter (a `deps` bag) instead of closing over component scope — the
// orchestrator keeps a thin bound wrapper for anything it needs to reference
// elsewhere (an imperative-handle ref, a JSX callback). No React, no
// transport, no DOM globals — only injected callbacks touch those.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  AppliedPluginSnapshot,
  ChatAnalyticsEntryFrom,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  PluginDuplicateProjectResponse,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type { ComposerBarClickProps, DesignToolboxClickProps } from '@open-design/contracts/analytics';
import type {
  AppConfig,
  ChatAttachment,
  ChatCommentAttachment,
  Project,
  ProjectFile,
  ProjectMetadata,
  SkillSummary,
} from '../../types';
import { inlineMentionToken, mentionTokenPresent, type InlineMentionEntity } from '../../utils/inlineMentions';
import { findDesignToolboxSkill, type DesignToolboxAction } from '../../runtime/design-toolbox';
import { BUILT_IN_PETS, CUSTOM_PET_ID } from '../../components/pet/pets';
import { workspaceContextLinkedDir } from '../../components/workspace-context';
import type { ProjectReferenceSelection } from '../../components/ProjectReferenceModal';
import type { CaretRect } from '../../components/composer/LexicalComposerInput';
import type { PlaceholderScenario } from '../../components/home-hero/placeholderScenarios';
import { localizePluginTitle } from '../../components/plugins-home/localization';
import type { Locale } from '../../i18n/types';
import type { Route } from '../../router';
import {
  trackComposerBarClick,
  trackContextLinkResult,
  trackDesignToolboxClick,
} from '../../analytics/events';
import {
  currentRunContextMeta as currentRunContextMetaRule,
  designToolboxActionPrompt,
  designToolboxResourcePrompt,
  designToolboxSkillPrompt,
  dropWorkspaceLinkedDirAdds,
  expandHatchCommand,
  expandSearchCommand,
  linkedDirsWithWorkspaceContext,
  stripInlineMentionLabels,
  workspaceContextDirStillReferenced,
} from './rules';
import type {
  ChatSendMeta,
  DesignToolboxResource,
  DesignToolboxResourceIndex,
  MentionTab,
  SlashCommand,
  TrackedWorkspaceLinkedDir,
  TranslateFn,
} from './types';

/** Everything the composer bottom bar's/design-toolbox's click-tracking
 *  wrappers need: the analytics sink and the project id both fill into the
 *  fixed page/area/project context so call sites only pass event-specific
 *  fields. */
export interface ComposerTrackDeps {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  projectId: string | null;
}

/** Fills the fixed page/area/project context for the rest of the composer
 *  bottom bar (plus menu, design-system / working-dir switch, agent
 *  selector, context-chip removal). */
export function trackComposerBar(
  fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>,
  deps: ComposerTrackDeps,
) {
  trackComposerBarClick(deps.track, {
    page_name: 'chat_panel',
    area: 'chat_composer',
    ...(deps.projectId ? { project_id: deps.projectId } : {}),
    ...fields,
  });
}

/** Fills the fixed page/area/project context so toolbox call sites only
 *  pass the event-specific fields (element + ids). */
export function trackDesignToolbox(
  fields: Omit<DesignToolboxClickProps, 'page_name' | 'area' | 'project_id'>,
  deps: ComposerTrackDeps,
) {
  trackDesignToolboxClick(deps.track, {
    page_name: 'chat_panel',
    area: 'chat_composer',
    ...(deps.projectId ? { project_id: deps.projectId } : {}),
    ...fields,
  });
}

/** Everything the plugin-details modal's "duplicate as project" flow needs:
 *  the transport call (injected rather than imported directly, matching the
 *  WorkingDirActionDeps precedent), the modal setter it closes on success,
 *  navigation to the new project, and the failure-toast fallback. No single
 *  cluster owns this (modals + router + a one-off transport call), so it
 *  lives here rather than any one hook. */
export interface DuplicatePluginDeps {
  locale: Locale;
  t: TranslateFn;
  duplicatePluginAsProject: (
    pluginId: string,
    input: { name?: string },
  ) => Promise<PluginDuplicateProjectResponse>;
  navigate: (route: Route) => void;
  setDetailsRecord: (record: InstalledPluginRecord | null) => void;
  onShowToast?: (message: string) => void;
}

/** Duplicates `record` as a new project, closes the details modal, and
 *  navigates to the new project on success; shows a toast and leaves the
 *  modal open on failure. */
export async function duplicatePluginRecordAsProject(
  record: InstalledPluginRecord,
  deps: DuplicatePluginDeps,
) {
  try {
    const result = await deps.duplicatePluginAsProject(record.id, {
      name: localizePluginTitle(deps.locale, record),
    });
    deps.setDetailsRecord(null);
    deps.navigate({
      kind: 'project',
      projectId: result.projectId,
      conversationId: result.conversationId,
      fileName: result.relPath,
    });
  } catch {
    deps.onShowToast?.(deps.t('pluginCard.duplicateFailed'));
  }
}

/** Everything the design-toolbox "apply" flow needs from the outside world. */
export interface DesignToolboxApplyDeps {
  skills: SkillSummary[];
  visibleWorkspaceContext: WorkspaceContextItem | null;
  draft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>;
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>;
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>;
  replaceEditorDraft: (text: string) => void;
  focusEditor: () => void;
  appendContextAttachment: (path: string) => void;
  setInlineBackedPlugin: (value: { id: string; label: string } | null) => void;
  applyPluginById: (id: string, record: InstalledPluginRecord) => Promise<void>;
}

/** Adds `skill` to the staged list for this turn if it isn't already there
 *  (dedup by id). */
export function stageSkillForCurrentTurn(
  skill: SkillSummary,
  deps: Pick<DesignToolboxApplyDeps, 'setStagedSkills'>,
) {
  deps.setStagedSkills((prev) => (prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]));
}

/** Replaces the draft with `prompt` and refocuses the editor. */
export function applyDesignToolboxDraft(
  prompt: string,
  deps: Pick<DesignToolboxApplyDeps, 'replaceEditorDraft' | 'focusEditor'>,
) {
  deps.replaceEditorDraft(prompt);
  deps.focusEditor();
}

/** Builds the full draft (prefixed with an `@<skill>` mention token when a
 *  skill is given) and applies it, staging the skill first so its chip is
 *  already present when the prompt lands. */
export function applyDesignToolboxPrompt(
  prompt: string,
  skill: SkillSummary | null,
  deps: Pick<DesignToolboxApplyDeps, 'setStagedSkills' | 'replaceEditorDraft' | 'focusEditor'>,
) {
  const nextPrompt = skill ? `${inlineMentionToken(skill.name)}\n${prompt}` : prompt;
  if (skill) stageSkillForCurrentTurn(skill, deps);
  applyDesignToolboxDraft(nextPrompt, deps);
}

/** Resolves a design-toolbox quick action to its prompt text (looking up
 *  any skill it implies) and applies it. */
export function applyDesignToolboxAction(action: DesignToolboxAction, deps: DesignToolboxApplyDeps) {
  const skill = findDesignToolboxSkill(action, deps.skills);
  applyDesignToolboxPrompt(
    designToolboxActionPrompt({
      action,
      skill,
      workspaceItem: deps.visibleWorkspaceContext,
      activeDraft: deps.draft,
      resourceIndex: deps.resourceIndex,
      t: deps.t,
    }),
    skill,
    deps,
  );
}

/** Builds and applies the prompt for picking a skill directly from the
 *  design toolbox. */
export function applyDesignToolboxSkill(skill: SkillSummary, deps: DesignToolboxApplyDeps) {
  applyDesignToolboxPrompt(
    designToolboxSkillPrompt({
      skill,
      workspaceItem: deps.visibleWorkspaceContext,
      activeDraft: deps.draft,
      resourceIndex: deps.resourceIndex,
      t: deps.t,
    }),
    skill,
    deps,
  );
}

/** Applies a design-toolbox resource pick. Skills delegate to
 *  `applyDesignToolboxSkill`; plugins bind the inline-mention bridge and
 *  apply the plugin before seeding the prompt; MCP servers/connectors/files
 *  each stage themselves before seeding an `@`-prefixed prompt; any other
 *  kind falls through to a plain prompt apply. */
export function applyDesignToolboxResource(resource: DesignToolboxResource, deps: DesignToolboxApplyDeps) {
  if (resource.kind === 'skill') {
    applyDesignToolboxSkill(resource.skill, deps);
    return;
  }

  const prompt = designToolboxResourcePrompt({
    resource,
    workspaceItem: deps.visibleWorkspaceContext,
    activeDraft: deps.draft,
    resourceIndex: deps.resourceIndex,
    t: deps.t,
  });

  if (resource.kind === 'plugin') {
    void (async () => {
      deps.setInlineBackedPlugin({ id: resource.plugin.id, label: resource.plugin.title });
      await deps.applyPluginById(resource.plugin.id, resource.plugin);
      applyDesignToolboxDraft(`${inlineMentionToken(resource.plugin.title)}\n${prompt}`, deps);
    })();
    return;
  }

  if (resource.kind === 'mcp') {
    const label = resource.server.label || resource.server.id;
    deps.setStagedMcpServers((current) =>
      current.some((item) => item.id === resource.server.id) ? current : [...current, resource.server],
    );
    applyDesignToolboxDraft(`${inlineMentionToken(label)}\n${prompt}`, deps);
    return;
  }

  if (resource.kind === 'connector') {
    deps.setStagedConnectors((current) =>
      current.some((item) => item.id === resource.connector.id) ? current : [...current, resource.connector],
    );
    applyDesignToolboxDraft(`${inlineMentionToken(resource.connector.name)}\n${prompt}`, deps);
    return;
  }

  if (resource.kind === 'file') {
    const path = resource.file.path ?? resource.file.name;
    deps.appendContextAttachment(path);
    applyDesignToolboxDraft(`${inlineMentionToken(path)}\n${prompt}`, deps);
    return;
  }

  applyDesignToolboxDraft(prompt, deps);
}

/** Everything the staged-context "remove" handlers need from the outside world. */
export interface StagedRemovalDeps {
  draft: string;
  replaceEditorDraft: (text: string) => void;
  trackComposerBar: (fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>) => void;
}

/** Removes a staged skill by id, tracks the removal via analytics, and
 *  strips its `@<name>`/`@<id>` mention token from the draft. */
export function removeStagedSkill(
  id: string,
  stagedSkills: SkillSummary[],
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>,
  deps: StagedRemovalDeps,
) {
  deps.trackComposerBar({ element: 'context_remove', resource_kind: 'skill', resource_id: id });
  const skill = stagedSkills.find((s) => s.id === id) ?? null;
  setStagedSkills((prev) => prev.filter((s) => s.id !== id));
  const labels = [id, skill?.name ?? ''];
  deps.replaceEditorDraft(stripInlineMentionLabels(deps.draft, labels));
}

/** Removes a staged MCP server by id, tracks the removal via analytics, and
 *  strips its `@<label>`/`@<id>` mention token from the draft. */
export function removeStagedMcpServer(
  id: string,
  stagedMcpServers: McpServerConfig[],
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>,
  deps: StagedRemovalDeps,
) {
  deps.trackComposerBar({ element: 'context_remove', resource_kind: 'mcp', resource_id: id });
  const server = stagedMcpServers.find((item) => item.id === id) ?? null;
  setStagedMcpServers((prev) => prev.filter((item) => item.id !== id));
  deps.replaceEditorDraft(stripInlineMentionLabels(deps.draft, [id, server?.label ?? '']));
}

/** Removes a staged connector by id, tracks the removal via analytics, and
 *  strips its `@<name>`/`@<id>` mention token from the draft. */
export function removeStagedConnector(
  id: string,
  stagedConnectors: ConnectorDetail[],
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>,
  deps: StagedRemovalDeps,
) {
  deps.trackComposerBar({ element: 'context_remove', resource_kind: 'connector', resource_id: id });
  const connector = stagedConnectors.find((item) => item.id === id) ?? null;
  setStagedConnectors((prev) => prev.filter((item) => item.id !== id));
  deps.replaceEditorDraft(stripInlineMentionLabels(deps.draft, [id, connector?.name ?? '']));
}

/** Everything the working-directory picker's set/clear/pick flow needs from
 *  the outside world — transport (patchProject, openFolderDialog), the
 *  cross-cluster workspace-context state a promoted dir must reconcile
 *  against, and the recent-dirs hook's own writer. */
export interface WorkingDirActionDeps {
  projectId: string | null;
  projectMetadata: ProjectMetadata | undefined;
  workspaceContextMetadataLinkedDirList: string[];
  selectedWorkspaceContextDirs: string[];
  patchProject: (id: string, patch: { metadata: ProjectMetadata }) => Promise<Project | null>;
  openFolderDialog: () => Promise<string | null>;
  onShowToast?: (message: string) => void;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  setPromotedWorkspaceContextDir: Dispatch<SetStateAction<string | null>>;
  setWorkspaceLinkedDirAdds: Dispatch<SetStateAction<Record<string, TrackedWorkspaceLinkedDir>>>;
  rememberRecentDir: (dir: string) => Promise<void>;
  t: TranslateFn;
}

/**
 * The WorkingDirPicker treats the project's working directory as a single
 * primary folder, so selecting one replaces the primary `linkedDirs` entry
 * while preserving staged workspace-context dirs. The folder is read-only
 * awareness for the agent (→ `--add-dir`), not a Design Files import, and
 * `baseDir` is never touched.
 */
export async function setWorkingDirFolder(
  dir: string,
  deps: Omit<WorkingDirActionDeps, 'openFolderDialog'>,
) {
  if (!deps.projectId) return;
  const base = deps.projectMetadata ?? { kind: 'prototype' as const };
  const metadata: ProjectMetadata = {
    ...base,
    linkedDirs: linkedDirsWithWorkspaceContext(dir, deps.workspaceContextMetadataLinkedDirList),
  };
  const result = await deps.patchProject(deps.projectId, { metadata });
  // The daemon rejects stale/inaccessible/system dirs with
  // INVALID_LINKED_DIR (patchProject → null). Only commit the selection and
  // promote it in recents when the project accepted it; otherwise surface
  // the failure and leave recents untouched so a rejected path isn't
  // re-promoted to the top of the menu.
  if (!result?.metadata) {
    deps.onShowToast?.(deps.t('homeWorkingDir.applyFailed'));
    return;
  }
  deps.onProjectMetadataChange?.(result.metadata);
  const promotedDir = dir.trim();
  deps.setPromotedWorkspaceContextDir(
    deps.selectedWorkspaceContextDirs.includes(promotedDir) ? promotedDir : null,
  );
  deps.setWorkspaceLinkedDirAdds((current) => dropWorkspaceLinkedDirAdds(current, promotedDir));
  void deps.rememberRecentDir(dir);
}

/** Opens the folder-picker dialog and, if the user picked a folder, applies
 *  it via `setWorkingDirFolder`. */
export async function handlePickWorkingDir(deps: WorkingDirActionDeps) {
  const selected = await deps.openFolderDialog();
  if (selected) await setWorkingDirFolder(selected, deps);
}

/** Clears the project's working-directory selection back to no primary
 *  linked dir. */
export async function clearWorkingDir(
  deps: Pick<
    WorkingDirActionDeps,
    | 'projectId'
    | 'projectMetadata'
    | 'workspaceContextMetadataLinkedDirList'
    | 'patchProject'
    | 'onProjectMetadataChange'
    | 'setPromotedWorkspaceContextDir'
  >,
) {
  if (!deps.projectId) return;
  const base = deps.projectMetadata ?? { kind: 'prototype' as const };
  const metadata: ProjectMetadata = {
    ...base,
    linkedDirs: linkedDirsWithWorkspaceContext(null, deps.workspaceContextMetadataLinkedDirList),
  };
  const result = await deps.patchProject(deps.projectId, { metadata });
  if (result?.metadata) {
    deps.setPromotedWorkspaceContextDir(null);
    deps.onProjectMetadataChange?.(result.metadata);
  }
}

/** Everything `appendWorkspacePrompt` needs to stage a workspace-context item
 *  and insert its `@`-mention pill into the draft. */
export interface AppendWorkspacePromptDeps {
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  insertInlineMentionSeparator: () => void;
  insertMention: (insert: { token: string; entity: InlineMentionEntity }) => void;
  setMention: (value: { q: string } | null) => void;
  setSlash: (value: { q: string } | null) => void;
  markComposerEngaged: () => void;
}

/** Stages `item` as a workspace context (if not already staged), inserts
 *  its `@`-mention pill into the draft, and closes the mention/slash
 *  popovers. */
export function appendWorkspacePrompt(item: WorkspaceContextItem, deps: AppendWorkspacePromptDeps) {
  deps.setStagedWorkspaceContexts((current) =>
    current.some((candidate) => candidate.id === item.id) ? current : [...current, item],
  );
  deps.insertInlineMentionSeparator();
  deps.insertMention({
    token: inlineMentionToken(item.label),
    entity: { id: item.id, kind: 'workspace', label: item.label },
  });
  deps.setMention(null);
  deps.setSlash(null);
  deps.markComposerEngaged();
}

/** Everything `addLinkedDirs`/`addLinkedDir` need to persist new `linkedDirs`
 *  entries onto the project and remember them in the recents list. */
export interface LinkedDirActionDeps {
  projectId: string | null;
  projectMetadata: ProjectMetadata | undefined;
  workspaceLinkedDirAdds: Record<string, TrackedWorkspaceLinkedDir>;
  patchProject: (id: string, patch: { metadata: ProjectMetadata }) => Promise<Project | null>;
  onShowToast?: (message: string) => void;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  rememberRecentDir: (dir: string) => Promise<void>;
  t: TranslateFn;
}

/**
 * Links every (trimmed, deduped) dir in `dirs` onto the project's
 * `linkedDirs`, skipping any already present. Returns a map from dir to its
 * `TrackedWorkspaceLinkedDir` bookkeeping entry (or `null` when the dir was
 * already linked by something other than a workspace-context add), or
 * `false` if the project patch failed.
 */
export async function addLinkedDirs(
  dirs: string[],
  deps: LinkedDirActionDeps,
): Promise<Map<string, TrackedWorkspaceLinkedDir | null> | false> {
  if (!deps.projectId) return false;
  const trimmedDirs = Array.from(new Set(dirs.map((dir) => dir.trim()).filter(Boolean)));
  if (trimmedDirs.length === 0) return new Map();
  const base = deps.projectMetadata ?? { kind: 'prototype' as const };
  const existing = base.linkedDirs ?? [];
  const nextLinkedDirs = [...existing];
  const trackedByDir = new Map<string, TrackedWorkspaceLinkedDir | null>();
  let changed = false;
  for (const trimmed of trimmedDirs) {
    if (nextLinkedDirs.includes(trimmed)) {
      const ownedByWorkspaceContext = Object.values(deps.workspaceLinkedDirAdds).some(
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
    const result = await deps.patchProject(deps.projectId, { metadata });
    if (!result?.metadata) {
      deps.onShowToast?.(deps.t('homeWorkingDir.applyFailed'));
      return false;
    }
    deps.onProjectMetadataChange?.(result.metadata);
    for (const trimmed of trimmedDirs) void deps.rememberRecentDir(trimmed);
  }
  return trackedByDir;
}

/** Single-dir convenience wrapper over `addLinkedDirs`. */
export async function addLinkedDir(
  dir: string,
  deps: LinkedDirActionDeps,
): Promise<TrackedWorkspaceLinkedDir | null | false> {
  const trackedByDir = await addLinkedDirs([dir], deps);
  if (trackedByDir === false) return false;
  return trackedByDir.get(dir.trim()) ?? null;
}

/** Everything `handleReferenceProjects` needs: linking transport, staging the
 *  picked projects as workspace-context prompts, and analytics. */
export interface ReferenceProjectsDeps extends LinkedDirActionDeps, AppendWorkspacePromptDeps {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  setProjectReferenceOpen: (open: boolean) => void;
  setWorkspaceLinkedDirAdds: Dispatch<SetStateAction<Record<string, TrackedWorkspaceLinkedDir>>>;
}

/** Links every selected project's resolved dir, stages each as a
 *  workspace-context prompt, closes the reference-project modal on success,
 *  and reports the linking result via analytics. */
export async function handleReferenceProjects(
  selections: ProjectReferenceSelection[],
  deps: ReferenceProjectsDeps,
) {
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
  const trackedByDir = await addLinkedDirs(items.map((item) => workspaceContextLinkedDir(item) ?? ''), deps);
  if (trackedByDir === false) {
    trackContextLinkResult(deps.track, {
      page_name: 'chat_panel',
      area: 'chat_composer',
      context_kind: 'project',
      result: 'failed',
      count: items.length,
      ...(deps.projectId ? { project_id: deps.projectId } : {}),
    });
    return;
  }
  for (const item of items) {
    appendWorkspacePrompt(item, deps);
  }
  deps.setProjectReferenceOpen(false);
  trackContextLinkResult(deps.track, {
    page_name: 'chat_panel',
    area: 'chat_composer',
    context_kind: 'project',
    result: 'success',
    count: items.length,
    ...(deps.projectId ? { project_id: deps.projectId } : {}),
  });
  const trackedAdds: Record<string, TrackedWorkspaceLinkedDir> = {};
  for (const item of items) {
    const path = workspaceContextLinkedDir(item);
    const trackedLinkedDir = path ? trackedByDir.get(path) ?? null : null;
    if (trackedLinkedDir) trackedAdds[item.id] = trackedLinkedDir;
  }
  if (Object.keys(trackedAdds).length > 0) {
    deps.setWorkspaceLinkedDirAdds((current) => ({ ...current, ...trackedAdds }));
  }
}

/** Everything `handleLinkLocalCodeContext` needs: the folder-picker dialog,
 *  linking transport, staging the picked folder, and analytics. */
export interface LinkLocalCodeContextDeps extends LinkedDirActionDeps, AppendWorkspacePromptDeps {
  openFolderDialog: () => Promise<string | null>;
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  setWorkspaceLinkedDirAdds: Dispatch<SetStateAction<Record<string, TrackedWorkspaceLinkedDir>>>;
}

/** Opens the folder picker, links the selected folder, stages it as a
 *  workspace-context prompt, and reports the result via analytics. */
export async function handleLinkLocalCodeContext(deps: LinkLocalCodeContextDeps) {
  const selected = await deps.openFolderDialog();
  if (!selected) {
    trackContextLinkResult(deps.track, {
      page_name: 'chat_panel',
      area: 'chat_composer',
      context_kind: 'local_code',
      result: 'cancelled',
      ...(deps.projectId ? { project_id: deps.projectId } : {}),
    });
    return;
  }
  const trackedLinkedDir = await addLinkedDir(selected, deps);
  if (trackedLinkedDir === false) {
    trackContextLinkResult(deps.track, {
      page_name: 'chat_panel',
      area: 'chat_composer',
      context_kind: 'local_code',
      result: 'failed',
      ...(deps.projectId ? { project_id: deps.projectId } : {}),
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
  appendWorkspacePrompt(item, deps);
  if (trackedLinkedDir) {
    deps.setWorkspaceLinkedDirAdds((current) => ({ ...current, [item.id]: trackedLinkedDir }));
  }
  trackContextLinkResult(deps.track, {
    page_name: 'chat_panel',
    area: 'chat_composer',
    context_kind: 'local_code',
    result: 'success',
    count: 1,
    ...(deps.projectId ? { project_id: deps.projectId } : {}),
  });
}

/**
 * Currently unreferenced from the orchestrator's JSX (the WorkingDirPicker's
 * own pick/recent flows cover folder-linking today) but preserved verbatim
 * from the pre-extraction component rather than dropped, since removing dead
 * code is a cleanup out of scope for this behavior-preserving move.
 */
export async function handleLinkFolder(
  deps: LinkedDirActionDeps & { openFolderDialog: () => Promise<string | null> },
) {
  if (!deps.projectId) return;
  const selected = await deps.openFolderDialog();
  if (!selected) return;
  await addLinkedDir(selected, deps);
}

/** Everything the staged workspace-context "remove" flow needs: transport to
 *  unlink a promoted dir, the cross-cluster staged/dismissed state it
 *  reconciles, and the editor-draft mention cleanup. */
export interface RemoveWorkspaceContextDeps {
  projectId: string | null;
  projectMetadata: ProjectMetadata | undefined;
  patchProject: (id: string, patch: { metadata: ProjectMetadata }) => Promise<Project | null>;
  onShowToast?: (message: string) => void;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  t: TranslateFn;
  workspaceLinkedDirAdds: Record<string, TrackedWorkspaceLinkedDir>;
  setWorkspaceLinkedDirAdds: Dispatch<SetStateAction<Record<string, TrackedWorkspaceLinkedDir>>>;
  selectedWorkspaceContexts: WorkspaceContextItem[];
  workingDir: string | null;
  visibleWorkspaceContext: WorkspaceContextItem | null;
  setDismissedWorkspaceContextId: Dispatch<SetStateAction<string | null>>;
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  draftRef: MutableRefObject<string>;
  replaceEditorDraft: (text: string) => void;
  trackComposerBar: (fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>) => void;
}

/** Unlinks a workspace-context-added dir from the project, unless something
 *  else (another staged workspace context, or the active working dir) still
 *  references it — in which case only the local tracking entry is dropped
 *  and the project's `linkedDirs` is left untouched. Returns false only when
 *  the project patch itself failed. */
export async function removeTrackedWorkspaceLinkedDir(
  id: string,
  tracked: TrackedWorkspaceLinkedDir,
  deps: Pick<
    RemoveWorkspaceContextDeps,
    | 'projectId'
    | 'projectMetadata'
    | 'patchProject'
    | 'onShowToast'
    | 'onProjectMetadataChange'
    | 't'
    | 'workspaceLinkedDirAdds'
    | 'setWorkspaceLinkedDirAdds'
    | 'selectedWorkspaceContexts'
    | 'workingDir'
  >,
): Promise<boolean> {
  if (!deps.projectId) return true;
  if (
    workspaceContextDirStillReferenced(
      id,
      tracked.dir,
      deps.workspaceLinkedDirAdds,
      deps.selectedWorkspaceContexts,
      deps.workingDir,
    )
  ) {
    deps.setWorkspaceLinkedDirAdds((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
    return true;
  }
  const base = deps.projectMetadata ?? { kind: 'prototype' as const };
  const currentLinkedDirs = base.linkedDirs ?? [...tracked.previousLinkedDirs, tracked.dir];
  const nextLinkedDirs = currentLinkedDirs.filter((dir) => dir !== tracked.dir);
  const metadata: ProjectMetadata = { ...base, linkedDirs: nextLinkedDirs };
  const result = await deps.patchProject(deps.projectId, { metadata });
  if (!result?.metadata) {
    deps.onShowToast?.(deps.t('homeWorkingDir.applyFailed'));
    return false;
  }
  deps.onProjectMetadataChange?.(result.metadata);
  deps.setWorkspaceLinkedDirAdds((current) => {
    const { [id]: _removed, ...rest } = current;
    return rest;
  });
  return true;
}

/** Removes a staged/selected workspace context: unlinks its tracked dir (if
 *  any, subject to the still-referenced check in
 *  `removeTrackedWorkspaceLinkedDir`), clears it from the dismissed/staged
 *  lists, and strips its mention labels from the draft. */
export async function removeWorkspaceContext(id: string, deps: RemoveWorkspaceContextDeps) {
  deps.trackComposerBar({ element: 'context_remove', resource_kind: 'workspace', resource_id: id });
  const workspaceItem = deps.selectedWorkspaceContexts.find((item) => item.id === id) ?? null;
  const trackedLinkedDir = deps.workspaceLinkedDirAdds[id] ?? null;
  if (trackedLinkedDir && !(await removeTrackedWorkspaceLinkedDir(id, trackedLinkedDir, deps))) {
    return;
  }
  if (deps.visibleWorkspaceContext?.id === id) deps.setDismissedWorkspaceContextId(id);
  deps.setStagedWorkspaceContexts((prev) => prev.filter((item) => item.id !== id));
  if (!trackedLinkedDir) {
    deps.setWorkspaceLinkedDirAdds((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }
  if (workspaceItem) {
    deps.replaceEditorDraft(stripInlineMentionLabels(deps.draftRef.current, [
      workspaceItem.label,
      workspaceItem.id,
      workspaceItem.title ?? '',
      workspaceItem.path ?? '',
      workspaceItem.absolutePath ?? '',
      workspaceItem.url ?? '',
    ]));
  }
}

/** Everything `pickSlash` needs from the outside world: the popover state it
 *  clears and the Lexical editor operations (shared across every cluster, so
 *  they stay orchestrator-owned) it drives. */
export interface PickSlashDeps {
  slash: { q: string } | null;
  setSlash: (value: { q: string } | null) => void;
  replaceActiveTrigger: (text: string) => void;
  focusEditor: () => void;
}

/** Replaces the in-flight `/<query>` trigger with the picked command's
 *  canonical insertion text and closes the slash popover. */
export function pickSlash(cmd: SlashCommand, deps: PickSlashDeps) {
  if (!deps.slash) return;
  // Replace the in-flight `/<query>` trigger with the picked command's
  // canonical insertion text. Lexical owns the caret afterwards.
  deps.replaceActiveTrigger(cmd.insert);
  deps.focusEditor();
  deps.setSlash(null);
}

/** Everything `tryHandleMcpSlash` needs: the draft it inspects and clears,
 *  and the settings-open callback it defers to. */
export interface McpSlashDeps {
  draft: string;
  onOpenMcpSettings?: () => void;
  clearDraft: () => void;
}

/**
 * `/mcp` (no arg) opens settings on the External MCP tab — pure UX hook,
 * never sent to the agent. `/mcp <id>` is intentionally NOT intercepted
 * here: the slash palette already replaces it with a natural-language hint
 * sentence ("Use the `<id>` MCP server tools."), and the user is expected to
 * keep typing the rest of the prompt before sending.
 */
export function tryHandleMcpSlash(deps: McpSlashDeps): boolean {
  if (!deps.onOpenMcpSettings) return false;
  const trimmed = deps.draft.trim();
  if (!/^\/mcp\s*$/i.test(trimmed)) return false;
  deps.onOpenMcpSettings();
  deps.clearDraft();
  return true;
}

/** Everything `tryHandlePetSlash` needs: the draft it inspects and clears,
 *  pet state/config, and the pet action callbacks it defers to. */
export interface PetSlashDeps {
  petEnabled: boolean;
  draft: string;
  petConfig?: AppConfig['pet'];
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  onAdoptPet?: (petId: string) => void;
  clearDraft: () => void;
}

/**
 * Parse a `/pet [arg]` slash command out of the draft. Recognized forms:
 * `/pet` (toggle wake/tuck), `/pet wake`, `/pet tuck`, `/pet adopt` (open
 * settings), or `/pet <id>` to adopt a built-in by id. The slash is stripped
 * from the draft on a successful match so the user does not accidentally
 * send the command to the agent.
 */
export function tryHandlePetSlash(deps: PetSlashDeps): boolean {
  if (!deps.petEnabled) return false;
  const trimmed = deps.draft.trim();
  const match = /^\/pet(?:\s+(\S+))?$/i.exec(trimmed);
  if (!match) return false;
  const arg = match[1]?.toLowerCase();
  if (!arg || arg === 'toggle') {
    deps.onTogglePet?.();
  } else if (arg === 'wake' || arg === 'show') {
    if (deps.petConfig?.adopted) {
      if (!deps.petConfig.enabled) deps.onTogglePet?.();
    } else {
      deps.onOpenPetSettings?.();
    }
  } else if (arg === 'tuck' || arg === 'hide') {
    if (deps.petConfig?.enabled) deps.onTogglePet?.();
  } else if (arg === 'adopt' || arg === 'settings' || arg === 'change') {
    deps.onOpenPetSettings?.();
  } else if (arg === CUSTOM_PET_ID) {
    deps.onAdoptPet?.(CUSTOM_PET_ID);
  } else {
    const pet = BUILT_IN_PETS.find((p) => p.id === arg);
    if (pet) {
      deps.onAdoptPet?.(pet.id);
    } else {
      return false;
    }
  }
  deps.clearDraft();
  return true;
}

/** Everything the `@`-mention popover's trigger-detection, keyboard-nav, and
 *  pick handlers need from the outside world: the mention/slash popover
 *  state (slash is another cluster's, read/written here since a single
 *  Lexical callback drives both popovers' keyboard nav), the filtered
 *  candidate lists, the Lexical editor's mention-insert primitive, and every
 *  staging setter a pick can touch. */
export interface MentionActionDeps {
  setCaretRect: Dispatch<SetStateAction<CaretRect | null>>;
  mention: { q: string } | null;
  setMention: Dispatch<SetStateAction<{ q: string } | null>>;
  mentionIndex: number;
  setMentionIndex: Dispatch<SetStateAction<number>>;
  mentionTab: MentionTab;
  setMentionTab: Dispatch<SetStateAction<MentionTab>>;
  slash: { q: string } | null;
  setSlash: (value: { q: string } | null) => void;
  slashIndex: number;
  setSlashIndex: Dispatch<SetStateAction<number>>;
  filteredSlash: SlashCommand[];
  pickSlash: (cmd: SlashCommand) => void;
  filteredFiles: ProjectFile[];
  filteredWorkspaceContexts: WorkspaceContextItem[];
  filteredPlugins: InstalledPluginRecord[];
  filteredSkills: SkillSummary[];
  filteredMcpServers: McpServerConfig[];
  filteredConnectors: ConnectorDetail[];
  insertEditorMention: (insert: { token: string; entity: InlineMentionEntity }) => void;
  staged: ChatAttachment[];
  appendContextAttachment: (path: string) => void;
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>;
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>;
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>;
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  setInlineBackedPlugin: (value: { id: string; label: string } | null) => void;
  applyPluginById: (id: string, record: InstalledPluginRecord) => Promise<void>;
  projectId: string | null;
  patchProject: (id: string, patch: { skillId: string }) => Promise<Project | null>;
  onProjectSkillChange?: (skillId: string | null) => void;
}

/**
 * Lexical reports the active @/slash trigger derived from the caret. The
 * mention popover state collapses to `{ q }`; the slash state replicates the
 * old detection effect (reset the keyboard index on open).
 */
export function handleEditorTrigger(
  {
    mention: nextMention,
    slash: nextSlash,
    anchorRect,
  }: {
    mention: { q: string } | null;
    slash: { q: string } | null;
    anchorRect: CaretRect | null;
  },
  deps: Pick<
    MentionActionDeps,
    'setCaretRect' | 'mention' | 'setMentionTab' | 'setMention' | 'setMentionIndex' | 'setSlash' | 'setSlashIndex'
  >,
) {
  deps.setCaretRect(anchorRect);
  if (nextMention && !deps.mention) {
    deps.setMentionTab('all');
  } else if (!nextMention) {
    deps.setMentionTab('all');
  }
  deps.setMention((prev) => {
    // Reset the active row only when the query identity changes (mirror of
    // the slash reset) so re-renders from unrelated state don't snap it.
    if (nextMention && (!prev || prev.q !== nextMention.q)) deps.setMentionIndex(0);
    return nextMention;
  });
  if (nextSlash) {
    deps.setSlash(nextSlash);
    deps.setSlashIndex(0);
  } else {
    deps.setSlash(null);
  }
}

/**
 * Routes popover navigation keys lifted verbatim from the old textarea
 * onKeyDown. Returns true when the key was consumed so the editor can
 * preventDefault; false lets the editor handle it normally (e.g. plain arrow
 * keys when no popover is open).
 */
export function handlePopoverKey(
  key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
  deps: MentionActionDeps,
): boolean {
  if (deps.slash && deps.filteredSlash.length > 0) {
    if (key === 'ArrowDown') {
      deps.setSlashIndex((i) => (i + 1) % deps.filteredSlash.length);
      return true;
    }
    if (key === 'ArrowUp') {
      deps.setSlashIndex((i) => (i - 1 + deps.filteredSlash.length) % deps.filteredSlash.length);
      return true;
    }
    if (key === 'Tab' || key === 'Enter') {
      const safe = Math.min(deps.slashIndex, deps.filteredSlash.length - 1);
      deps.pickSlash(deps.filteredSlash[safe]!);
      return true;
    }
    if (key === 'Escape') {
      deps.setSlash(null);
      return true;
    }
  }
  if (deps.mention && key === 'Escape') {
    deps.setMention(null);
    return true;
  }
  if (deps.mention) {
    // Drive a single index over the visible section union. MentionPopover
    // renders the same files-first section order and highlights the
    // matching row from activeIndex.
    const showFiles = deps.mentionTab === 'all' || deps.mentionTab === 'files';
    const showTabs = deps.mentionTab === 'all' || deps.mentionTab === 'tabs';
    const showPlugins = deps.mentionTab === 'all' || deps.mentionTab === 'plugins';
    const showSkills = deps.mentionTab === 'all' || deps.mentionTab === 'skills';
    const showMcp = deps.mentionTab === 'all' || deps.mentionTab === 'mcp';
    const showConnectors = deps.mentionTab === 'all' || deps.mentionTab === 'connectors';
    const total =
      (showFiles ? deps.filteredFiles.length : 0) +
      (showTabs ? deps.filteredWorkspaceContexts.length : 0) +
      (showPlugins ? deps.filteredPlugins.length : 0) +
      (showSkills ? deps.filteredSkills.length : 0) +
      (showMcp ? deps.filteredMcpServers.length : 0) +
      (showConnectors ? deps.filteredConnectors.length : 0);
    if (total > 0) {
      if (key === 'ArrowDown') {
        deps.setMentionIndex((i) => (i + 1) % total);
        return true;
      }
      if (key === 'ArrowUp') {
        deps.setMentionIndex((i) => (i - 1 + total) % total);
        return true;
      }
      if (key === 'Tab' || key === 'Enter') {
        pickMentionByFlatIndex(Math.min(deps.mentionIndex, total - 1), deps);
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves a flat visible-section index to the right insert call. Section
 * order MUST match MentionPopover's render order (files→tabs→plugins→skills
 * →mcp→connectors); the activeIndex highlight and Enter target stay in
 * lockstep across "All" and individual tabs.
 */
export function pickMentionByFlatIndex(flat: number, deps: MentionActionDeps) {
  let i = flat;
  if (deps.mentionTab === 'all' || deps.mentionTab === 'files') {
    if (i < deps.filteredFiles.length) {
      insertMention(deps.filteredFiles[i]!.path ?? deps.filteredFiles[i]!.name, deps);
      return;
    }
    i -= deps.filteredFiles.length;
  }
  if (deps.mentionTab === 'all' || deps.mentionTab === 'tabs') {
    if (i < deps.filteredWorkspaceContexts.length) {
      insertWorkspaceMention(deps.filteredWorkspaceContexts[i]!, deps);
      return;
    }
    i -= deps.filteredWorkspaceContexts.length;
  }
  if (deps.mentionTab === 'all' || deps.mentionTab === 'plugins') {
    if (i < deps.filteredPlugins.length) {
      void insertPluginMention(deps.filteredPlugins[i]!, deps);
      return;
    }
    i -= deps.filteredPlugins.length;
  }
  if (deps.mentionTab === 'all' || deps.mentionTab === 'skills') {
    if (i < deps.filteredSkills.length) {
      void insertSkillMention(deps.filteredSkills[i]!, deps);
      return;
    }
    i -= deps.filteredSkills.length;
  }
  if (deps.mentionTab === 'all' || deps.mentionTab === 'mcp') {
    if (i < deps.filteredMcpServers.length) {
      insertMcpMention(deps.filteredMcpServers[i]!, deps);
      return;
    }
    i -= deps.filteredMcpServers.length;
  }
  if (deps.mentionTab === 'all' || deps.mentionTab === 'connectors') {
    if (i < deps.filteredConnectors.length) {
      insertConnectorMention(deps.filteredConnectors[i]!, deps);
      return;
    }
  }
}

/** Inserts a file's `@<path>` mention pill and stages the file as an
 *  attachment if it isn't already staged. */
export function insertMention(
  filePath: string,
  deps: Pick<MentionActionDeps, 'insertEditorMention' | 'staged' | 'appendContextAttachment' | 'setMention'>,
) {
  deps.insertEditorMention({
    token: inlineMentionToken(filePath),
    entity: { id: filePath, kind: 'file', label: filePath },
  });
  if (!deps.staged.some((s) => s.path === filePath)) {
    deps.appendContextAttachment(filePath);
  }
  deps.setMention(null);
}

/** Inserts a plugin's `@<title>` mention pill, binds the inline-mention
 *  bridge to it, and applies the plugin. */
export async function insertPluginMention(
  record: InstalledPluginRecord,
  deps: Pick<MentionActionDeps, 'insertEditorMention' | 'setMention' | 'setInlineBackedPlugin' | 'applyPluginById'>,
) {
  deps.insertEditorMention({
    token: inlineMentionToken(record.title),
    entity: { id: record.id, kind: 'plugin', label: record.title },
  });
  deps.setMention(null);
  deps.setInlineBackedPlugin({ id: record.id, label: record.title });
  await deps.applyPluginById(record.id, record);
}

/** Stages an MCP server (if not already staged) and inserts its `@<label>`
 *  mention pill. */
export function insertMcpMention(
  server: McpServerConfig,
  deps: Pick<MentionActionDeps, 'setStagedMcpServers' | 'insertEditorMention' | 'setMention'>,
) {
  deps.setStagedMcpServers((current) => (
    current.some((item) => item.id === server.id) ? current : [...current, server]
  ));
  deps.insertEditorMention({
    token: inlineMentionToken(server.label || server.id),
    entity: { id: server.id, kind: 'mcp', label: server.label || server.id },
  });
  deps.setMention(null);
}

/** Stages a connector (if not already staged) and inserts its `@<name>`
 *  mention pill. */
export function insertConnectorMention(
  connector: ConnectorDetail,
  deps: Pick<MentionActionDeps, 'setStagedConnectors' | 'insertEditorMention' | 'setMention'>,
) {
  deps.setStagedConnectors((current) => (
    current.some((item) => item.id === connector.id) ? current : [...current, connector]
  ));
  deps.insertEditorMention({
    token: inlineMentionToken(connector.name),
    entity: { id: connector.id, kind: 'connector', label: connector.name },
  });
  deps.setMention(null);
}

/** Stages a workspace context (if not already staged) and inserts its
 *  `@<label>` mention pill. */
export function insertWorkspaceMention(
  item: WorkspaceContextItem,
  deps: Pick<MentionActionDeps, 'setStagedWorkspaceContexts' | 'insertEditorMention' | 'setMention'>,
) {
  deps.setStagedWorkspaceContexts((current) =>
    current.some((candidate) => candidate.id === item.id)
      ? current
      : [...current, item],
  );
  deps.insertEditorMention({
    token: inlineMentionToken(item.label),
    entity: { id: item.id, kind: 'workspace', label: item.label },
  });
  deps.setMention(null);
}

/** Patches the project's `skillId` to `skill.id` and reports the change
 *  upstream. Returns false when there's no active project or the patch
 *  fails. */
export async function applyProjectSkill(
  skill: SkillSummary,
  deps: Pick<MentionActionDeps, 'projectId' | 'patchProject' | 'onProjectSkillChange'>,
): Promise<boolean> {
  if (!deps.projectId) return false;
  const result = await deps.patchProject(deps.projectId, { skillId: skill.id });
  if (!result) return false;
  deps.onProjectSkillChange?.(result.skillId ?? skill.id);
  return true;
}

/** Applies the skill as the project's active skill, then (if that
 *  succeeded) stages it and inserts its `@<name>` mention pill. */
export async function insertSkillMention(
  skill: SkillSummary,
  deps: Pick<
    MentionActionDeps,
    'projectId' | 'patchProject' | 'onProjectSkillChange' | 'setStagedSkills' | 'insertEditorMention' | 'setMention'
  >,
) {
  const applied = await applyProjectSkill(skill, deps);
  if (!applied) return;
  // Stage the skill so it rides this turn's skillIds, then insert an atomic
  // `@<name>` pill carrying the skill's real id. The onChange prune keys on
  // `skill:<id>` being present in the editor text, so the chip survives
  // until the user deletes the pill.
  deps.setStagedSkills((prev) =>
    prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
  );
  deps.insertEditorMention({
    token: inlineMentionToken(skill.name),
    entity: { id: skill.id, kind: 'skill', label: skill.name },
  });
  deps.setMention(null);
}

/** Everything the Lexical editor's onChange needs. `present` is the entity
 *  list the editor's text currently references (MentionNodes plus plain
 *  `@token`s matched against composerMentionEntities, deduped by kind:id).
 *  Spans four clusters (draft, applied-plugin, staged run-context,
 *  workspace-context) with no single owning hook, so per the escalation
 *  order this stays a deps-bag action rather than moving into any one of
 *  them. */
export interface EditorChangeDeps {
  draftRef: MutableRefObject<string>;
  setDraft: Dispatch<SetStateAction<string>>;
  activeAppliedPlugin: AppliedPluginSnapshot | null;
  inlineBackedPluginRef: MutableRefObject<{ id: string; label: string } | null>;
  clearPluginsSection: () => void;
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>;
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>;
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>;
  stagedWorkspaceContexts: WorkspaceContextItem[];
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  workspaceLinkedDirAdds: Record<string, TrackedWorkspaceLinkedDir>;
}

/** Syncs the draft off the editor's onChange, then prunes every staged
 *  skill/mcp/connector/workspace-context chip to whatever `present` still
 *  references, dropping the applied-plugin inline-mention bridge if its own
 *  token was hand-deleted. */
export function handleEditorChange(
  text: string,
  present: InlineMentionEntity[],
  deps: EditorChangeDeps,
) {
  deps.draftRef.current = text;
  deps.setDraft(text);
  const set = new Set(present.map((e) => `${e.kind}:${e.id}`));
  // We prune the staged skill/mcp/connector chips to whatever the text still
  // references — generalizing the old skill-only regex prune so a
  // hand-deleted token also drops its chip and never leaks into the run
  // context. Workspace contexts that added linked dirs are kept visible
  // until the chip remove button clears the matching metadata access.
  // `staged` (files) is intentionally NOT pruned: users attach files via the
  // upload button without leaving an `@<path>` token.
  if (
    deps.activeAppliedPlugin
    && deps.inlineBackedPluginRef.current?.id === deps.activeAppliedPlugin.pluginId
    && !set.has(`plugin:${deps.activeAppliedPlugin.pluginId}`)
    && !mentionTokenPresent(text, deps.inlineBackedPluginRef.current.label)
  ) {
    deps.inlineBackedPluginRef.current = null;
    deps.clearPluginsSection();
  }
  deps.setStagedSkills((prev) => prev.filter((s) => set.has(`skill:${s.id}`)));
  deps.setStagedMcpServers((prev) => prev.filter((m) => set.has(`mcp:${m.id}`)));
  deps.setStagedConnectors((prev) => prev.filter((c) => set.has(`connector:${c.id}`)));
  deps.setStagedWorkspaceContexts((prev) =>
    prev.filter((item) => set.has(`workspace:${item.id}`) || Boolean(deps.workspaceLinkedDirAdds[item.id])),
  );
}

/** Everything `reset`/`sendComposedTurn`/`submit` need from the outside
 *  world: every staging setter reset() clears, the Next-step pending refs
 *  both reset() and sendComposedTurn() consume, the Lexical editor/plugins-
 *  section primitives, `onSend` itself, and everything `currentRunContextMeta`
 *  needs to build the run-context selection for the turn about to send. */
export interface SendActionDeps {
  pendingEntryFromRef: MutableRefObject<ChatAnalyticsEntryFrom | null>;
  pendingSessionModeRef: MutableRefObject<ChatSessionMode | null>;
  nextAttachmentOrderRef: MutableRefObject<number>;
  stagedWorkspaceContexts: WorkspaceContextItem[];
  workspaceLinkedDirAdds: Record<string, TrackedWorkspaceLinkedDir>;
  setWorkspaceLinkedDirAdds: Dispatch<SetStateAction<Record<string, TrackedWorkspaceLinkedDir>>>;
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  promotedWorkspaceContextDir: string | null;
  setPromotedWorkspaceContextDir: Dispatch<SetStateAction<string | null>>;
  setDraft: (text: string) => void;
  setStaged: Dispatch<SetStateAction<ChatAttachment[]>>;
  setStagedVisualComments: Dispatch<SetStateAction<ChatCommentAttachment[]>>;
  setStagedSkills: Dispatch<SetStateAction<SkillSummary[]>>;
  setStagedMcpServers: Dispatch<SetStateAction<McpServerConfig[]>>;
  setStagedConnectors: Dispatch<SetStateAction<ConnectorDetail[]>>;
  clearPluginsSection: () => void;
  setInlineBackedPlugin: (value: { id: string; label: string } | null) => void;
  inlineBackedPluginRef: MutableRefObject<{ id: string; label: string } | null>;
  setActiveAppliedPlugin: Dispatch<SetStateAction<AppliedPluginSnapshot | null>>;
  activeAppliedPlugin: AppliedPluginSnapshot | null;
  setUploadError: (value: string | null) => void;
  setMention: (value: { q: string } | null) => void;
  setMentionTab: Dispatch<SetStateAction<MentionTab>>;
  setSlash: (value: { q: string } | null) => void;
  clearEditor: () => void;
  setStreamingAnnotationSendPending: (value: boolean) => void;
  activeFileContext: string | null;
  activeFileDisplayName: string | null;
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  draft: string;
  sendDisabled: boolean;
  petEnabled: boolean;
  petConfig?: AppConfig['pet'];
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  onAdoptPet?: (petId: string) => void;
  onOpenMcpSettings?: () => void;
  clearDraft: () => void;
  streaming: boolean;
  staged: ChatAttachment[];
  currentCommentAttachments: (extra?: ChatCommentAttachment[]) => ChatCommentAttachment[];
  researchAvailable: boolean;
  placeholderSubmittable: boolean;
  placeholderScenario: PlaceholderScenario | null;
  stagedSkills: SkillSummary[];
  stagedMcpServers: McpServerConfig[];
  stagedConnectors: ConnectorDetail[];
  selectedWorkspaceContexts: WorkspaceContextItem[];
}

/** Reads the current run's staged context (skills/plugin/mcp/connectors/
 *  workspace items) into a `ChatSendMeta`, via the pure `currentRunContextMeta`
 *  rule — this wrapper only unwraps the inline-backed-plugin ref so the rule
 *  itself stays pure. */
export function currentRunContextMeta(
  deps: Pick<
    SendActionDeps,
    | 'stagedSkills'
    | 'activeAppliedPlugin'
    | 'stagedMcpServers'
    | 'stagedConnectors'
    | 'selectedWorkspaceContexts'
    | 'inlineBackedPluginRef'
  >,
): ChatSendMeta | undefined {
  return currentRunContextMetaRule({
    stagedSkills: deps.stagedSkills,
    activeAppliedPlugin: deps.activeAppliedPlugin,
    stagedMcpServers: deps.stagedMcpServers,
    stagedConnectors: deps.stagedConnectors,
    selectedWorkspaceContexts: deps.selectedWorkspaceContexts,
    inlineBackedPlugin: deps.inlineBackedPluginRef.current,
  });
}

/**
 * Clears the composer back to its empty state after a send: draft,
 * attachments (files + visual comments + skill/mcp/connector chips), the
 * applied-plugin snapshot, and the mention/slash popovers. Workspace
 * contexts that are still linked-dir-tracked survive the reset (they
 * represent a durable project link, not per-turn staging) — only contexts
 * whose linked dir was never tracked (or has since been dropped) are
 * cleared alongside everything else.
 */
export function reset(deps: SendActionDeps) {
  deps.pendingEntryFromRef.current = null;
  deps.pendingSessionModeRef.current = null;
  const linkedWorkspaceContexts = deps.stagedWorkspaceContexts.filter((item) => (
    Boolean(item.absolutePath?.trim()) && Boolean(deps.workspaceLinkedDirAdds[item.id])
  ));
  const linkedWorkspaceContextIds = new Set(linkedWorkspaceContexts.map((item) => item.id));
  const nextWorkspaceLinkedDirAdds = Object.fromEntries(
    Object.entries(deps.workspaceLinkedDirAdds).filter(([id]) => linkedWorkspaceContextIds.has(id)),
  );
  deps.setDraft("");
  deps.setStaged([]);
  deps.nextAttachmentOrderRef.current = 0;
  deps.setStagedVisualComments([]);
  deps.setStagedSkills([]);
  deps.setStagedMcpServers([]);
  deps.setStagedConnectors([]);
  deps.setStagedWorkspaceContexts(linkedWorkspaceContexts);
  deps.setWorkspaceLinkedDirAdds(nextWorkspaceLinkedDirAdds);
  if (
    deps.promotedWorkspaceContextDir &&
    !linkedWorkspaceContexts.some((item) => item.absolutePath?.trim() === deps.promotedWorkspaceContextDir)
  ) {
    deps.setPromotedWorkspaceContextDir(null);
  }
  deps.clearPluginsSection();
  deps.setInlineBackedPlugin(null);
  deps.setActiveAppliedPlugin(null);
  deps.setUploadError(null);
  deps.setMention(null);
  deps.setMentionTab('all');
  deps.setSlash(null);
  deps.clearEditor();
}

/** Sends a composed turn: seeds in the active-file attachment if it isn't
 *  already included, folds in any pending Next-step `entryFrom`/
 *  `sessionMode` tags (then clears them so they only color the immediate
 *  send), calls `onSend`, and resets the composer. Returns false (a no-op)
 *  when there is nothing to send. */
export function sendComposedTurn(
  prompt: string,
  attachments: ChatAttachment[],
  nextCommentAttachments: ChatCommentAttachment[],
  meta: ChatSendMeta | undefined,
  deps: SendActionDeps,
): boolean {
  deps.setStreamingAnnotationSendPending(false);
  if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return false;
  const nextAttachments =
    deps.activeFileContext && !attachments.some((attachment) => attachment.path === deps.activeFileContext)
      ? [
          {
            path: deps.activeFileContext,
            name: deps.activeFileDisplayName ?? deps.activeFileContext,
            kind: 'file' as const,
          },
          ...attachments,
        ]
      : attachments;
  // Apply pending Next-step metadata if the caller didn't set its own
  // fields, then clear it so it only colors the immediate next send.
  const pendingEntryFrom = deps.pendingEntryFromRef.current;
  const pendingSessionMode = deps.pendingSessionModeRef.current;
  deps.pendingEntryFromRef.current = null;
  deps.pendingSessionModeRef.current = null;
  const effectiveMetaShape: ChatSendMeta = {
    ...(meta ?? {}),
    ...(pendingEntryFrom && !meta?.entryFrom ? { entryFrom: pendingEntryFrom } : {}),
    ...(pendingSessionMode && !meta?.sessionMode ? { sessionMode: pendingSessionMode } : {}),
  };
  const effectiveMeta =
    Object.keys(effectiveMetaShape).length > 0 ? effectiveMetaShape : undefined;
  deps.onSend(prompt, nextAttachments, nextCommentAttachments, effectiveMeta);
  reset(deps);
  return true;
}

/** The composer's Send-button/Enter handler. Intercepts `/pet`/`/mcp` slash
 *  commands before they'd reach the agent, expands `/hatch`/search shorthand
 *  into their canonical prompts, falls back to a placeholder-carousel prompt
 *  when the draft and every attachment list are empty, and otherwise sends
 *  the typed prompt via `sendComposedTurn`. */
export async function submit(deps: SendActionDeps) {
  const prompt = deps.draft.trim();
  if (deps.sendDisabled) return;
  // Intercept `/pet …` and `/mcp` before sending so the slash command
  // never hits the agent — these are local UX hooks, not model prompts.
  if (tryHandlePetSlash(deps)) return;
  if (tryHandleMcpSlash(deps)) return;
  // `/hatch <concept>` expands into the canonical hatch-pet skill prompt and
  // *is* sent to the agent — the agent runs the skill, packages a Codex pet
  // under `~/.codex/pets/`, and the user adopts it from "Recently hatched"
  // in pet settings afterwards.
  const contextMeta = currentRunContextMeta(deps);
  const hatched = expandHatchCommand(prompt);
  const nextCommentAttachments = deps.currentCommentAttachments();
  if (hatched) {
    if (deps.streaming) return;
    deps.setStreamingAnnotationSendPending(false);
    deps.onSend(hatched, deps.staged, nextCommentAttachments, contextMeta);
    reset(deps);
    return;
  }
  const search = deps.researchAvailable ? expandSearchCommand(prompt) : null;
  if (search) {
    if (deps.streaming) return;
    deps.setStreamingAnnotationSendPending(false);
    deps.onSend(search.prompt, deps.staged, nextCommentAttachments, {
      ...contextMeta,
      research: { enabled: true, query: search.query },
    });
    reset(deps);
    return;
  }
  if (!prompt && deps.staged.length === 0 && nextCommentAttachments.length === 0) {
    const placeholderPrompt = deps.placeholderSubmittable && deps.placeholderScenario
      ? deps.placeholderScenario.text.trim()
      : '';
    if (!placeholderPrompt) return;
    const placeholderMeta: ChatSendMeta | undefined = deps.placeholderScenario?.sessionMode
      ? {
          ...(contextMeta ?? {}),
          sessionMode: deps.placeholderScenario.sessionMode,
          entryFrom: contextMeta?.entryFrom ?? 'next_step',
        }
      : contextMeta;
    sendComposedTurn(placeholderPrompt, [], [], placeholderMeta, deps);
    return;
  }
  sendComposedTurn(prompt, deps.staged, nextCommentAttachments, contextMeta, deps);
}
