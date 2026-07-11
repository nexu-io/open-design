// Pure rules for the chat-composer slice: attachment-order normalization/sort,
// captured-element markup formatting, and workspace-context display/search
// helpers. No React, no transport, no DOM — they test against `contracts` +
// app types with zero doubles (ADR 0002).
import type {
  AppliedPluginSnapshot,
  ConnectorDetail,
  InstalledPluginRecord,
  LibraryAsset,
  LibraryElementMeta,
  McpServerConfig,
  McpTemplate,
  RunContextSelection,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment, ProjectFile, SkillSummary } from '../../types';
import type { PlaceholderScenario } from '../../components/home-hero/placeholderScenarios';
import type { DesignToolboxClickProps } from '@open-design/contracts/analytics';
import type { IconName } from '../../components/Icon';
import { assetTitle } from '../../components/LibraryAssetMeta';
import { inlineMentionToken, mentionTokenPresent, type InlineMentionEntity } from '../../utils/inlineMentions';
import { localizePluginDescription, localizePluginTitle } from '../../components/plugins-home/localization';
import { localizeSkillDescription, localizeSkillName } from '../../i18n/content';
import type { Locale } from '../../i18n/types';
import {
  findDesignToolboxSkill,
  skillMatchesQuery,
  type DesignToolboxAction,
} from '../../runtime/design-toolbox';
import { looksLikeImage } from './formatters';
import { workspaceContextLinkedDir } from '../../components/workspace-context';
import type {
  ChatSendMeta,
  DesignToolboxResource,
  DesignToolboxResourceIndex,
  DesignToolboxResourceKind,
  TrackedWorkspaceLinkedDir,
  TranslateFn,
} from './types';

/** True for a finite, non-negative attachment `order` value — anything else
 *  (missing, negative, `NaN`) needs a fallback order assigned. */
export function isFiniteAttachmentOrder(value: unknown): value is number {
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
export function formatElementHtmlBlock(
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

/** Assigns every attachment a finite integer `order`, preserving existing
 *  finite orders and back-filling the rest sequentially after the highest
 *  existing order — used to sanitize a restored/queued attachment list. */
export function normalizeChatAttachmentOrders(attachments: ChatAttachment[]): ChatAttachment[] {
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

/** Reassigns `attachments` sequential orders starting at `orderStart`, in
 *  their current array order. */
export function assignChatAttachmentOrders(
  attachments: ChatAttachment[],
  orderStart: number,
): ChatAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    order: orderStart + index,
  }));
}

/** The next free order after every existing (or index-fallback) order in
 *  `attachments` — the high-water mark a new attachment should start from. */
export function nextChatAttachmentOrder(attachments: ChatAttachment[]): number {
  return attachments.reduce(
    (max, attachment, index) =>
      Math.max(max, isFiniteAttachmentOrder(attachment.order) ? Math.floor(attachment.order) + 1 : index + 1),
    0,
  );
}

/** Sorts by `order` (falling back to array index for attachments with no
 *  finite order), stable on ties. */
export function sortChatAttachmentsByOrder(attachments: ChatAttachment[]): ChatAttachment[] {
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

/** Same ordering rule as `sortChatAttachmentsByOrder`, for comment
 *  attachments (visual/screenshot annotations rather than uploaded files). */
export function sortChatCommentAttachmentsByOrder(attachments: ChatCommentAttachment[]): ChatCommentAttachment[] {
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

/** The chip/row icon for a workspace-context item, by kind. */
export function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'project') return 'folder';
  if (item.kind === 'local-code') return 'terminal';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

/** A tooltip-style title stringing together the item's kind label plus
 *  whichever path/url/title fields it has — pipe-joined so every present
 *  field is visible at once. */
export function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

/** The one-line subtitle shown under a workspace-context chip/row: the most
 *  identifying field for its kind (path for design files, absolute path for
 *  local code/project, etc.), falling back through the rest. */
export function workspaceContextDescription(item: WorkspaceContextItem): string {
  if (item.kind === 'design-files') return item.path || 'Project files';
  if (item.kind === 'project') return item.absolutePath || item.path || item.title || item.id;
  if (item.kind === 'local-code') return item.absolutePath || item.path || item.title || item.id;
  if (item.kind === 'terminal') return item.title || 'Terminal session';
  return item.url || item.path || item.absolutePath || item.title || item.tabId || item.id;
}

/** The final path segment (filename or folder name), normalizing Windows
 *  backslashes and trailing slashes first; falls back to the whole path if
 *  it has no separators. */
export function lastPathSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || path;
}

/** The display title for a project-file mention: the file's own `name` if
 *  known, otherwise the last segment of `fallback` (the raw path string). */
export function projectFileMentionTitle(file: ProjectFile, fallback: string): string {
  return file.name || lastPathSegment(fallback);
}

/** The subtitle for a project-file mention: the fallback path itself when it
 *  differs from the title (so the full path stays visible), otherwise the
 *  file's kind/mime. */
export function projectFileMentionDescription(file: ProjectFile, fallback: string): string {
  const label = projectFileMentionTitle(file, fallback);
  if (fallback && fallback !== label) return fallback;
  return [file.kind, file.mime].filter(Boolean).join(' · ');
}

/** Every searchable field on a workspace-context item, space-joined, for the
 *  mention popover's plain-text filter. */
export function workspaceContextSearchText(item: WorkspaceContextItem): string {
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

/** The human-readable label for a workspace-context kind. */
export function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'project':
      return 'Project';
    case 'local-code':
      return 'Local code';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
}

/** Escapes every regex-special character in `value` so it can be embedded
 *  literally in a `RegExp`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes the `@<label>` inline-mention token for `label` from `text`
 *  (plus one trailing space, if any), so deleting a chip's mention pill
 *  cleanly drops its token from the draft too. */
export function stripInlineMentionToken(text: string, label: string): string {
  const token = inlineMentionToken(label);
  return text.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

/** Strips every (deduped, trimmed) label's mention token from `text` in
 *  turn — used when a removed chip could be referenced by more than one
 *  label (e.g. a skill's name AND its id). */
export function stripInlineMentionLabels(text: string, labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  return uniqueLabels.reduce(
    (current, label) => stripInlineMentionToken(current, label),
    text,
  );
}

/** True when `query` (case-insensitive, empty always matches) is found in
 *  the plugin's title, id, source, description, or manifest tags. */
export function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
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

/** Projects every mentionable source (skills, plugins, MCP servers/
 *  templates, connectors, project files) into one flat, uniformly-shaped
 *  `DesignToolboxResource[]` list — each entry carries its own search text,
 *  badge, and icon so the toolbox panel and the mention popover can render
 *  and filter them identically regardless of source kind. */
export function buildDesignToolboxResources({
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

/** True when `query` (case-insensitive, empty always matches) is found in
 *  the resource's precomputed `searchText`. */
export function designToolboxResourceMatchesQuery(
  resource: DesignToolboxResource,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return resource.searchText.toLowerCase().includes(q);
}

/** The design toolbox's default (no-query) resource list: the
 *  "creative-director" skill first, then each quick action's preferred
 *  skill, then up to 8 total resources matching a curated set of design-
 *  flavored search terms (skills excluded from this second pass since
 *  they're already covered above). Deduped by resource key throughout. */
export function designToolboxDefaultResources(
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

/** The human-readable label for a design-toolbox resource kind. */
export function designToolboxResourceKindLabel(
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

/** True when `resource` matches one of the caller's already-active
 *  skill/plugin/mcp/connector/file selections — drives the toolbox's active
 *  checkmark. `mcp-template` resources are never "active" (a template isn't
 *  itself a staged server). */
export function designToolboxResourceIsActive(
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

/** True for a skill the design toolbox should surface: either its category
 *  is on the curated design-flavored allowlist, or it matches one of a
 *  curated set of design/motion/asset-related search terms. */
export function isDesignToolboxSkill(skill: SkillSummary): boolean {
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

/** The design toolbox's default skill list: each quick action's own
 *  matched skill first, then each action's `preferredSkillIds` (matched by
 *  id or name), deduped by skill id throughout. */
export function designToolboxDefaultSkills(
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

/** The chip badge label for a skill in the design toolbox, by its
 *  mode/category (video, image, motion, polish, or the raw mode string). */
export function designToolboxSkillBadge(skill: SkillSummary, t: TranslateFn): string {
  if (skill.mode === 'video' || skill.category === 'video-generation') return t('chat.designToolbox.badge.video');
  if (skill.mode === 'image' || skill.category === 'image-generation') return t('chat.designToolbox.badge.image');
  if (skill.category === 'animation-motion') return t('chat.designToolbox.badge.motion');
  if (skill.category === 'creative-direction') return t('chat.designToolbox.badge.polish');
  return skill.mode;
}

/** The chip icon for a skill in the design toolbox, mirroring
 *  `designToolboxSkillBadge`'s mode/category branching. */
export function designToolboxSkillIcon(skill: SkillSummary): IconName {
  if (skill.mode === 'video' || skill.category === 'video-generation') return 'play';
  if (skill.mode === 'image' || skill.category === 'image-generation') return 'image';
  if (skill.category === 'animation-motion') return 'sliders';
  if (skill.category === 'creative-direction') return 'sparkles';
  return 'file';
}

/** The prompt line naming the active workspace context ("Using <kind>:
 *  <label>"), or a generic fallback line when no context is active. */
export function designToolboxContextLine(
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

/** The prompt line preserving the user's existing draft text, or an empty
 *  string when there's nothing to preserve. */
export function designToolboxDraftLine(activeDraft: string, t: TranslateFn): string {
  const trimmed = activeDraft.trim();
  if (!trimmed) return '';
  return t('chat.designToolbox.prompt.preserveDraft', { draft: trimmed });
}

/** The human-readable workspace-kind label used inside design-toolbox
 *  prompt text (distinct wording from `workspaceContextKindLabel`, which
 *  labels UI chips). */
export function designToolboxWorkspaceKindLabel(
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

/** Builds the full agent-facing prompt for a design-toolbox quick action:
 *  the shared context/skill/resource-index/draft-preservation lines, plus
 *  an action-specific instruction block keyed by `action.id` (falls back to
 *  the auto-match intro for any action id without its own case). */
export function designToolboxActionPrompt({
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

/** Builds the agent-facing prompt for picking a skill directly from the
 *  design toolbox (rather than via a quick action). */
export function designToolboxSkillPrompt({
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

/** Builds the agent-facing prompt for picking a non-skill design-toolbox
 *  resource (plugin/mcp/mcp-template/connector/file), with a
 *  resource-kind-specific instruction block. */
export function designToolboxResourcePrompt({
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

/** The prompt lines summarizing everything available to the agent (counts
 *  plus a compact, truncated list per source), so a design-toolbox prompt
 *  tells the agent what else it could reach for beyond the one resource the
 *  user picked. */
export function designToolboxResourceIndexLines(
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

/** Formats a labeled, comma-joined, deduped list capped at `limit` entries,
 *  with a "+N more" suffix for anything past the cap. Returns an empty
 *  string when `values` has nothing usable, so callers can `.filter(Boolean)`
 *  it out of a line list. */
export function designToolboxCompactLine(
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

/** 0 when the skill's id or name starts with `query` (a prefix match sorts
 *  first in the mention popover), 1 otherwise; an empty query ranks every
 *  skill 1 (no preferred ordering). */
export function skillMentionRank(skill: SkillSummary, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  if (id.startsWith(q) || name.startsWith(q)) return 0;
  return 1;
}

/**
 * Builds the flat entity list the Lexical editor uses to detect existing
 * `@token`s already present in the draft (MentionNodes plus plain `@token`
 * text), across every mentionable source: workspace-context tabs, plugins,
 * skills (indexed under both name and id, since either can appear in the
 * token), MCP servers (name and id), connectors (name and id), project files,
 * and staged file attachments.
 */
export function buildComposerMentionEntities({
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

/** True when `query` (case-insensitive, empty always matches) is found in
 *  the server's id, label, transport, url, or command. */
export function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
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

/** True when `query` (case-insensitive, empty always matches) is found in
 *  the template's id, label, description, transport, category, homepage, or
 *  example. */
export function mcpTemplateMatchesQuery(tpl: McpTemplate, query: string): boolean {
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

/** "Official" for a bundled plugin, "Mine" for anything user-installed. */
export function pluginSourceLabel(plugin: InstalledPluginRecord, t: TranslateFn): string {
  return plugin.sourceKind === 'bundled' ? t('chat.mentionPluginOfficial') : t('chat.mentionPluginMine');
}

// The composer-side plugin list hides bundled atoms (pipeline-only, not
// meant to be applied directly from chat) while keeping the full installed
// list available even when the project was created from a pinned plugin, so
// users can switch or layer different plugin context from the tools menu
// and @ picker. A plugin with no `od.kind` at all predates the manifest
// field and is treated as allowed.
const COMPOSER_ALLOWED_PLUGIN_KINDS = new Set(['skill', 'scenario', 'bundle']);

/** Filters `installedPlugins` down to the kinds the composer's plugin list
 *  may show — see `COMPOSER_ALLOWED_PLUGIN_KINDS` above for the why. */
export function pluginsAllowedForComposer(
  installedPlugins: InstalledPluginRecord[],
): InstalledPluginRecord[] {
  return installedPlugins.filter((p) => {
    const kind = p.manifest?.od?.kind;
    return !kind || COMPOSER_ALLOWED_PLUGIN_KINDS.has(kind);
  });
}

// Every toolbox resource carries a common `kind` + `id`, and the tracking
// enum mirrors `DesignToolboxResourceKind` exactly, so this is a direct
// projection.
export function designToolboxResourceTracking(resource: DesignToolboxResource): {
  resource_kind: NonNullable<DesignToolboxClickProps['resource_kind']>;
  resource_id: string;
} {
  return { resource_kind: resource.kind, resource_id: resource.id };
}

// Pure positioning for the design-toolbox hover-detail / preview panel.
//
// The panel is `position: fixed`, so its left/top are viewport coordinates.
// Extracted from ChatComposer's showToolboxDetail closure so the narrow-pane
// clamp is unit-testable without a DOM: a row near the left edge (or a
// viewport narrower than detailWidth + gap*2) must NOT produce a negative
// left that pushes the panel off-screen — it must clamp back into view.

/** The hovered row's bounding box (viewport coordinates), the anchor the
 *  detail panel positions itself against. */
export interface DetailAnchorRect {
  left: number;
  right: number;
  top: number;
}

/** The current viewport size, for clamping the detail panel on-screen. */
export interface DetailViewport {
  width: number;
  height: number;
}

/** Sizing constants for `computeToolboxDetailPosition`. */
export interface DetailPositionOptions {
  /** Panel width (px). */
  detailWidth: number;
  /** Gap between the row and the panel (px). */
  gap: number;
  /** Min distance kept from every viewport edge (px). */
  margin: number;
  /** Assumed panel height for the vertical clamp (px). */
  estimatedHeight: number;
}

/**
 * Place the detail panel beside the hovered row: to the right when it fits,
 * otherwise to the left — then clamp both axes into the viewport so the
 * fixed-positioned panel always stays reachable.
 */
export function computeToolboxDetailPosition(
  rect: DetailAnchorRect,
  viewport: DetailViewport,
  { detailWidth, gap, margin, estimatedHeight }: DetailPositionOptions,
): { left: number; top: number } {
  const toRight = rect.right + gap;
  const preferredLeft =
    toRight + detailWidth > viewport.width - margin
      ? rect.left - gap - detailWidth
      : toRight;
  const left = Math.max(
    margin,
    Math.min(preferredLeft, viewport.width - margin - detailWidth),
  );
  const top = Math.max(
    margin,
    Math.min(rect.top, viewport.height - margin - estimatedHeight),
  );
  return { left, top };
}

/**
 * The WorkingDirPicker treats the project's working directory as a single
 * primary folder, so setting or clearing it recomputes the full `linkedDirs`
 * list to persist: the primary dir (if any) first, followed by every staged/
 * linked workspace-context dir (deduped against a primary-dir collision).
 */
export function linkedDirsWithWorkspaceContext(
  primaryDir: string | null,
  workspaceContextMetadataLinkedDirList: string[],
): string[] {
  const primary = primaryDir?.trim();
  const contextDirs = primary
    ? workspaceContextMetadataLinkedDirList.filter((dir) => dir !== primary)
    : workspaceContextMetadataLinkedDirList;
  return Array.from(new Set([
    ...(primary ? [primary] : []),
    ...contextDirs,
  ]));
}

/**
 * Drop any `workspaceLinkedDirAdds` tracking entry pointing at `dir` — its
 * promotion to the project's primary working dir is complete, so the
 * context-linked-dir bookkeeping for it is no longer needed.
 */
export function dropWorkspaceLinkedDirAdds(
  current: Record<string, TrackedWorkspaceLinkedDir>,
  dir: string,
): Record<string, TrackedWorkspaceLinkedDir> {
  const nextEntries = Object.entries(current).filter(([, tracked]) => tracked.dir !== dir);
  return nextEntries.length === Object.keys(current).length
    ? current
    : Object.fromEntries(nextEntries);
}

/**
 * Dedupe a workspace-context item list on `kind:id`, keeping the first
 * occurrence. Used to sanitize the `initialWorkspaceContexts` prop once on
 * mount (a parent-supplied list is not guaranteed unique).
 */
export function dedupeWorkspaceContextItems(items: WorkspaceContextItem[]): WorkspaceContextItem[] {
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

/**
 * Seeds the "dirs this workspace-context item is responsible for linking"
 * tracking map from a parent-supplied initial context list: only items whose
 * linked dir is already present in `linkedDirs` count as tracked (anything
 * else was linked by some other means and this item shouldn't claim credit
 * for un-linking it later).
 */
export function trackedWorkspaceLinkedDirsForContexts(
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

/**
 * True when some OTHER workspace-context item (or the project's own primary
 * working dir) still needs `dir` linked, so removing `id`'s claim on it must
 * not unlink the directory itself — only drop `id`'s own tracking entry.
 */
export function workspaceContextDirStillReferenced(
  id: string,
  dir: string,
  workspaceLinkedDirAdds: Record<string, TrackedWorkspaceLinkedDir>,
  selectedWorkspaceContexts: WorkspaceContextItem[],
  workingDir: string | null,
): boolean {
  return Object.entries(workspaceLinkedDirAdds).some(
    ([candidateId, candidate]) => candidateId !== id && candidate.dir === dir,
  ) || selectedWorkspaceContexts.some((item) => (
    item.id !== id && workspaceContextLinkedDir(item) === dir
  )) || workingDir === dir;
}

/**
 * Expand a `/hatch <concept>` draft into the canonical hatch-pet skill
 * prompt before sending. Returns null when the draft is not a hatch command
 * so the caller can fall through to the regular submit path.
 */
export function expandHatchCommand(input: string): string | null {
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

/**
 * Expand a `/search <query>` draft into the canonical research-tool prompt.
 * Returns null when the draft is not a search command (or has no query).
 */
export function expandSearchCommand(input: string): { prompt: string; query: string } | null {
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

/**
 * Resolves the inline-backed-plugin ref value a restored/queued draft should
 * seed: the plugin snapshot was "inline-backed" only if the restored meta's
 * `inlineAppliedPlugin` still matches the applied plugin AND its label
 * token is still present in the restored text (the user may have deleted the
 * `@<plugin>` pill before the draft was queued).
 */
export function inlineBackedPluginFromRestoredDraft(
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

/** Marks a send meta as queue-only (staged for later rather than sent now). */
export function queueMeta(meta?: ChatSendMeta): ChatSendMeta {
  return { ...(meta ?? {}), queueOnly: true };
}

/**
 * Builds the run-context selection + send meta for the turn about to be
 * composed, from every staged/applied context source: staged skills, the
 * applied plugin snapshot (and whether it's still inline-backed by an
 * `@<plugin>` pill in the draft), staged MCP servers, staged connectors, and
 * the visible + staged workspace contexts. Returns `undefined` when nothing
 * is staged, so callers can spread it into `onSend`/`sendComposedTurn`
 * without special-casing the empty case.
 */
export function currentRunContextMeta({
  stagedSkills,
  activeAppliedPlugin,
  stagedMcpServers,
  stagedConnectors,
  selectedWorkspaceContexts,
  inlineBackedPlugin,
}: {
  stagedSkills: SkillSummary[];
  activeAppliedPlugin: AppliedPluginSnapshot | null;
  stagedMcpServers: McpServerConfig[];
  stagedConnectors: ConnectorDetail[];
  selectedWorkspaceContexts: WorkspaceContextItem[];
  inlineBackedPlugin: { id: string; label: string } | null;
}): ChatSendMeta | undefined {
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
          ...(inlineBackedPlugin?.id === activeAppliedPlugin.pluginId
            ? {
                inlineAppliedPlugin: {
                  pluginId: activeAppliedPlugin.pluginId,
                  label: inlineBackedPlugin.label,
                },
              }
            : {}),
        }
      : {}),
    ...(Object.keys(context).length > 0 ? { context } : {}),
  };
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** The composer's send/stop-button and placeholder-carousel gating. Pure
 *  derivation from the composer's current input state — no transport, no
 *  DOM — so it's directly unit-testable without rendering the component. */
export interface ComposerSendGateInput {
  streaming: boolean;
  sendDisabled: boolean;
  activeFileContext: string | null;
  placeholderScenarios: ReadonlyArray<PlaceholderScenario>;
  draft: string;
  staged: ChatAttachment[];
  commentAttachmentCount: number;
  mention: { q: string } | null;
  slash: { q: string } | null;
  placeholderScenario: PlaceholderScenario | null;
}

/** Output of `composerSendGate` — see each field's own doc below. */
export interface ComposerSendGate {
  /** True when the placeholder carousel should be shown instead of the
   *  empty-composer state (no active file, no draft/attachments/popovers, at
   *  least one scenario available). */
  placeholderCarouselActive: boolean;
  /** True when the carousel is active AND its current scenario has real text
   *  to submit — the fallback prompt `submit()` uses when the composer is
   *  otherwise empty. */
  placeholderSubmittable: boolean;
  /** True when there's anything a send would actually transmit: typed text,
   *  staged attachments/comments, or a submittable placeholder. */
  hasComposerPayload: boolean;
  showStopButton: boolean;
  showSendButton: boolean;
}

/** Computes the composer's send/stop-button visibility and the placeholder
 *  carousel's active/submittable state, per the field docs on
 *  `ComposerSendGate`. */
export function composerSendGate({
  streaming,
  sendDisabled,
  activeFileContext,
  placeholderScenarios,
  draft,
  staged,
  commentAttachmentCount,
  mention,
  slash,
  placeholderScenario,
}: ComposerSendGateInput): ComposerSendGate {
  const placeholderCarouselActive =
    !streaming
    && !sendDisabled
    && !activeFileContext
    && placeholderScenarios.length > 0
    && draft.trim().length === 0
    && staged.length === 0
    && commentAttachmentCount === 0
    && !mention
    && !slash;
  const placeholderSubmittable =
    placeholderCarouselActive && Boolean(placeholderScenario?.text.trim());
  const hasComposerPayload =
    draft.trim().length > 0
    || staged.length > 0
    || commentAttachmentCount > 0
    || placeholderSubmittable;
  return {
    placeholderCarouselActive,
    placeholderSubmittable,
    hasComposerPayload,
    showStopButton: streaming && !hasComposerPayload,
    showSendButton: !streaming || hasComposerPayload,
  };
}
