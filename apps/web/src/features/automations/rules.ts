// Pure business logic for the automations slice: template catalog building,
// filtering, proposal/routine labeling and sorting, and the automation-modal
// form <-> wire-schedule mapping. No React, no transport, no DOM — these test
// with zero doubles.
import type {
  AutomationEvolutionProposal,
  AutomationTemplate as ContractAutomationTemplate,
  ConnectorDetail,
  CreateRoutineRequest,
  InstalledPluginRecord,
  McpServerConfig,
  Routine,
  RoutineRun,
  RoutineSchedule,
  RoutineProjectTarget,
  RunContextSelection,
  UpdateRoutineRequest,
} from '@open-design/contracts';

import type { IconName } from '../../components/Icon';
import type { SkillSummary } from '../../types';
import { localizePluginDescription, localizePluginTitle } from '../../components/plugins-home/localization';
import { describeRoutineSchedule, detectLocalTimezone } from './formatters';
import type {
  AutomationFormState,
  AutomationTemplateKind,
  AutomationTemplate,
  CapabilityKind,
  ContextMention,
  SelectedContextItem,
  TemplateFilter,
  TranslateFn,
} from './types';

// --- Templates ---

export function buildStaticTemplates(t: TranslateFn): ReadonlyArray<AutomationTemplate> {
  return [
    {
      id: 'memory-refresh',
      category: 'memory',
      kind: 'routine',
      icon: 'sparkles',
      title: t('automations.tpl.memoryRefresh.title'),
      description: t('automations.tpl.memoryRefresh.desc'),
      defaultName: 'Memory refresh',
      prompt:
        'Review recent chats, PR comments, design feedback, and project changes. Extract durable preferences, repeated decisions, and workflow lessons. Propose concise memory updates with source links and separate one-off notes from reusable guidance.',
    },
    {
      id: 'design-system-refresh',
      category: 'design-system',
      kind: 'routine',
      icon: 'sliders',
      title: t('automations.tpl.designSystemRefresh.title'),
      description: t('automations.tpl.designSystemRefresh.desc'),
      defaultName: 'Design system maintainer',
      prompt:
        'Inspect recent generated artifacts, review feedback, and accepted revisions. Identify patterns that should become design-system tokens, component rules, examples, or anti-patterns. Draft precise updates to DESIGN.md and call out anything that needs human approval.',
    },
    {
      id: 'live-artifact-registry',
      category: 'live-artifact',
      kind: 'routine',
      icon: 'file-code',
      title: t('automations.tpl.liveArtifactRegistry.title'),
      description: t('automations.tpl.liveArtifactRegistry.desc'),
      defaultName: 'Live artifact maintainer',
      prompt:
        'List live artifacts for this project, find stale or failed refreshes, and update the highest-value artifact in place. Preserve artifact ids, summarize what changed, and flag artifacts that need connector access or human review.',
    },
    {
      id: 'orbit-dashboard',
      category: 'orbit',
      kind: 'routine',
      icon: 'orbit',
      title: t('automations.tpl.orbitDashboard.title'),
      description: t('automations.tpl.orbitDashboard.desc'),
      defaultName: 'Connector activity dashboard',
      prompt:
        'Use the selected connectors to build or refresh a live dashboard of recent activity. Group by people, projects, decisions, risks, and follow-ups. Prefer connected read-only tools, cite sources, and keep the dashboard refreshable.',
    },
    {
      id: 'release-notes',
      category: 'release',
      kind: 'routine',
      icon: 'present',
      title: t('automations.tpl.releaseNotes.title'),
      description: t('automations.tpl.releaseNotes.desc'),
      defaultName: 'Weekly release notes',
      prompt:
        "Draft user-facing release notes covering merged PRs, updated artifacts, and design-system changes from the last 7 days. Group by 'New', 'Improved', and 'Fixed'. Include links when available and keep the copy user-readable.",
    },
    {
      id: 'quality-regression-watch',
      category: 'quality',
      kind: 'routine',
      icon: 'bell',
      title: t('automations.tpl.qualityRegressionWatch.title'),
      description: t('automations.tpl.qualityRegressionWatch.desc'),
      defaultName: 'Regression watch',
      prompt:
        'Compare recent project changes against accepted artifacts, design-system rules, benchmarks, and traces. Flag regressions in behavior, layout, accessibility, or product intent. Suggest the smallest fix and cite the evidence.',
    },
  ];
}

export function fallbackOrbitTemplate(t: TranslateFn): AutomationTemplate {
  return {
    id: 'orbit-daily',
    category: 'orbit',
    kind: 'orbit',
    icon: 'orbit',
    title: t('automations.tpl.orbitDaily.title'),
    description: t('automations.tpl.orbitDaily.desc'),
    defaultName: 'Daily connector digest',
    prompt:
      'Survey every connected integration and produce a daily digest of what changed in the last 24 hours. Group the result by people, projects, decisions, and follow-ups. Save the output as a live artifact named `daily_digest.md` and update it in place on each run.',
  };
}

export function fallbackLiveTemplate(t: TranslateFn): AutomationTemplate {
  return {
    id: 'live-status-board',
    category: 'live-artifact',
    kind: 'live-artifact',
    icon: 'file-code',
    title: t('automations.tpl.liveStatusBoard.title'),
    description: t('automations.tpl.liveStatusBoard.desc'),
    defaultName: 'Live status board',
    prompt:
      "Maintain a single live artifact named `status_board.md`. On each run, update the sections for 'In flight', 'Shipped this week', 'Risks', and 'Decisions made'. Edit in place so the artifact stays stable.",
  };
}

export function templateFilters(t: TranslateFn): ReadonlyArray<{ id: TemplateFilter; label: string }> {
  return [
    { id: 'all', label: t('automations.filterAll') },
    { id: 'orbit', label: t('automations.filterOrbit') },
    { id: 'live-artifact', label: t('automations.filterLiveArtifacts') },
    { id: 'memory', label: t('automations.filterMemory') },
    { id: 'design-system', label: t('automations.filterDesignSystems') },
    { id: 'skills', label: t('automations.filterSkills') },
    { id: 'connectors', label: t('automations.filterConnectors') },
    { id: 'compression', label: t('automations.filterCompression') },
    { id: 'release', label: t('automations.filterRelease') },
    { id: 'quality', label: t('automations.filterQuality') },
  ];
}

export function templateFromSkill(skill: SkillSummary, kind: AutomationTemplateKind): AutomationTemplate {
  const category = kind === 'orbit' ? 'orbit' : 'live-artifact';
  return {
    id: `skill-${skill.id}`,
    category,
    kind,
    icon: kind === 'orbit' ? 'orbit' : 'file-code',
    title: skill.name,
    description: skill.description || skill.id,
    defaultName: skill.name,
    prompt: skill.examplePrompt || skill.description || `Run ${skill.name}.`,
    skillId: skill.id,
  };
}

export function automationTemplateCategory(template: ContractAutomationTemplate): string {
  const tags = new Set(template.tags ?? []);
  if (template.outputSinks.includes('design-system') || tags.has('design-system')) {
    return 'design-system';
  }
  if (template.outputSinks.includes('skill') || tags.has('skills')) {
    return 'skills';
  }
  if (
    tags.has('connectors') ||
    (template.sourceKinds.length > 0 && template.sourceKinds.every((kind) => kind === 'connector'))
  ) {
    return 'connectors';
  }
  if (
    template.tokenCompression === 'aggressive' ||
    tags.has('compression') ||
    tags.has('tokens')
  ) {
    return 'compression';
  }
  if (template.outputSinks.includes('memory') || tags.has('memory')) {
    return 'memory';
  }
  return 'routine';
}

export function automationTemplateIcon(category: string): IconName {
  if (category === 'design-system') return 'sliders';
  if (category === 'skills') return 'sparkles';
  if (category === 'connectors') return 'link';
  if (category === 'compression') return 'reload';
  if (category === 'memory') return 'history';
  return 'history';
}

export function automationTemplatePrompt(template: ContractAutomationTemplate): string {
  const stages = template.stages.map((stage) => stage.title).join(' -> ');
  return [
    `Use Automation template "${template.id}".`,
    `Purpose: ${template.purpose}`,
    `Sources: ${template.sourceKinds.join(', ')}.`,
    `Trigger modes: ${template.triggerKinds.join(', ')}.`,
    `Pipeline: ${stages}.`,
    `Outputs: ${template.outputSinks.join(', ')}.`,
    `Review policy: ${template.reviewPolicy}. Token compression: ${template.tokenCompression}.`,
    'Produce reviewable proposals with provenance before applying durable memory, skill, automation, or design-system changes.',
  ].join('\n');
}

export function templateFromAutomationCatalog(template: ContractAutomationTemplate): AutomationTemplate {
  const category = automationTemplateCategory(template);
  return {
    id: template.id,
    category,
    kind: 'routine',
    icon: automationTemplateIcon(category),
    title: template.title,
    description: template.description,
    defaultName: template.title,
    prompt: automationTemplatePrompt(template),
  };
}

export function dedupeTemplates(templates: AutomationTemplate[]): AutomationTemplate[] {
  const seen = new Set<string>();
  return templates.filter((template) => {
    if (seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  });
}

export function buildAutomationTemplates(
  designTemplates: SkillSummary[],
  automationCatalog: ContractAutomationTemplate[],
  t: TranslateFn,
): AutomationTemplate[] {
  const orbit = designTemplates
    .filter((skill) => skill.scenario === 'orbit')
    .map((skill) => templateFromSkill(skill, 'orbit'));
  const live = designTemplates
    .filter((skill) => skill.scenario === 'live')
    .map((skill) => templateFromSkill(skill, 'live-artifact'));

  return dedupeTemplates([
    ...automationCatalog.map(templateFromAutomationCatalog),
    ...(orbit.length > 0 ? orbit : [fallbackOrbitTemplate(t)]),
    ...(live.length > 0 ? live : [fallbackLiveTemplate(t)]),
    ...buildStaticTemplates(t),
  ]);
}

export function filterTemplates(templates: AutomationTemplate[], filter: TemplateFilter) {
  if (filter === 'all') return templates;
  if (filter === 'orbit' || filter === 'live-artifact') {
    return templates.filter((template) => template.kind === filter);
  }
  return templates.filter((template) => template.category === filter);
}

export function kindLabel(kind: AutomationTemplateKind, t: TranslateFn): string {
  if (kind === 'orbit') return t('automations.kindOrbit');
  if (kind === 'live-artifact') return t('automations.kindLiveArtifact');
  return t('automations.kindAutomation');
}

export function kindIcon(kind: AutomationTemplateKind): IconName {
  if (kind === 'orbit') return 'orbit';
  if (kind === 'live-artifact') return 'file-code';
  return 'history';
}

// --- Routines ---

export function sortRoutinesNewestFirst(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function scheduleStatusLabel(routine: Routine, t: TranslateFn): string {
  if (!routine.enabled) return t('automations.scheduleStatusPaused');
  return describeRoutineSchedule(routine.schedule, t, routine.nextRunAt);
}

export function nextRunLabel(routine: Routine, t: TranslateFn): string {
  if (!routine.enabled) return t('automations.nextRunManualOnly');
  if (!routine.nextRunAt) return t('automations.nextRunScheduled');
  const date = new Date(routine.nextRunAt);
  return t('automations.nextRunAt', {
    time: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

export function statusLabel(status: RoutineRun['status'], t: TranslateFn): string {
  if (status === 'succeeded') return t('automations.statusSucceeded');
  if (status === 'failed') return t('automations.statusFailed');
  if (status === 'running') return t('automations.statusRunning');
  if (status === 'queued') return t('automations.statusQueued');
  return t('automations.statusCanceled');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- Evolution proposals ---

export function proposalTargetLabel(target: AutomationEvolutionProposal['targetKind'], t: TranslateFn): string {
  if (target === 'memory-node') return t('automations.proposalTargetMemory');
  if (target === 'design-system') return t('automations.proposalTargetDesignSystem');
  if (target === 'skill') return t('automations.proposalTargetSkill');
  return t('automations.proposalTargetTemplate');
}

export function proposalActionLabel(action: AutomationEvolutionProposal['action'], t: TranslateFn): string {
  if (action === 'create') return t('automations.proposalActionCreate');
  if (action === 'update') return t('automations.proposalActionUpdate');
  if (action === 'merge') return t('automations.proposalActionMerge');
  if (action === 'move') return t('automations.proposalActionMove');
  if (action === 'delete') return t('automations.proposalActionDelete');
  return t('automations.proposalActionPromote');
}

export function mergeAutomationProposals(
  current: AutomationEvolutionProposal[],
  incoming: AutomationEvolutionProposal[],
): AutomationEvolutionProposal[] {
  const merged = new Map(current.map((proposal) => [proposal.id, proposal]));
  for (const proposal of incoming) {
    merged.set(proposal.id, proposal);
  }
  return Array.from(merged.values()).sort((a, b) => {
    const bTime = Date.parse(b.createdAt);
    const aTime = Date.parse(a.createdAt);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

// --- Automation modal form <-> wire schedule ---

export function emptyForm(): AutomationFormState {
  return {
    name: '',
    prompt: '',
    kind: 'daily',
    minute: 0,
    time: '09:00',
    weekday: 1,
    timezone: detectLocalTimezone(),
    mode: 'create_each_run',
    projectId: '',
  };
}

export function formFromRoutine(routine: Routine): AutomationFormState {
  const base = emptyForm();
  base.name = routine.name;
  base.prompt = routine.prompt;
  const schedule = routine.schedule;
  if (schedule.kind === 'hourly') {
    base.kind = 'hourly';
    base.minute = schedule.minute;
  } else if (schedule.kind === 'weekly') {
    base.kind = 'weekly';
    base.weekday = schedule.weekday;
    base.time = schedule.time;
    base.timezone = schedule.timezone;
  } else {
    base.kind = schedule.kind;
    base.time = schedule.time;
    base.timezone = schedule.timezone;
  }
  if (routine.target.mode === 'reuse') {
    base.mode = 'reuse';
    base.projectId = routine.target.projectId;
  }
  return base;
}

export function buildSchedule(form: AutomationFormState): RoutineSchedule {
  if (form.kind === 'hourly') return { kind: 'hourly', minute: form.minute };
  if (form.kind === 'weekly') {
    return { kind: 'weekly', weekday: form.weekday, time: form.time, timezone: form.timezone };
  }
  return { kind: form.kind, time: form.time, timezone: form.timezone };
}

export function buildRoutineTarget(form: AutomationFormState): RoutineProjectTarget {
  return form.mode === 'reuse' && form.projectId
    ? { mode: 'reuse', projectId: form.projectId }
    : { mode: 'create_each_run' };
}

export function filterCapabilities<T>(values: T[], query: string, index: (value: T) => string): T[] {
  if (!query) return values;
  return values.filter((value) => index(value).toLowerCase().includes(query));
}

export function readContextMention(value: string, cursor: number): ContextMention | null {
  const beforeCursor = value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCursor);
  if (!match) return null;
  const prefix = match[1] ?? '';
  return {
    start: match.index + prefix.length,
    end: cursor,
    query: match[2] ?? '',
  };
}

export function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(59, Math.round(value)));
}

export interface SelectedContextSources {
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
}

export interface SelectedContextIds {
  skillIds: string[];
  pluginIds: string[];
  mcpIds: string[];
  connectorIds: string[];
}

/** Maps every selected capability id to its display chip, in the fixed
 * skills -> plugins -> mcp -> connectors order the picker renders. */
export function buildSelectedContextItems(
  sources: SelectedContextSources,
  selected: SelectedContextIds,
  locale: string,
  t: TranslateFn,
): SelectedContextItem[] {
  const items: SelectedContextItem[] = [];
  for (const id of selected.skillIds) {
    const skill = sources.skills.find((item) => item.id === id);
    items.push({
      kind: 'skills',
      id,
      label: skill?.name ?? id,
      meta: t('chat.designToolbox.kind.skill'),
      icon: 'file',
    });
  }
  for (const id of selected.pluginIds) {
    const plugin = sources.plugins.find((item) => item.id === id);
    const pluginTitle = plugin ? localizePluginTitle(locale, plugin) : null;
    const pluginDescription = plugin ? localizePluginDescription(locale, plugin) : null;
    items.push({
      kind: 'plugins',
      id,
      label: pluginTitle ?? id,
      meta: pluginDescription || plugin?.id || id,
      icon: 'sparkles',
    });
  }
  for (const id of selected.mcpIds) {
    const server = sources.mcpServers.find((item) => item.id === id);
    items.push({
      kind: 'mcp',
      id,
      label: server?.label || id,
      meta: t('chat.designToolbox.kind.mcp'),
      icon: 'link',
    });
  }
  for (const id of selected.connectorIds) {
    const connector = sources.connectors.find((item) => item.id === id);
    items.push({
      kind: 'connectors',
      id,
      label: connector?.name ?? id,
      meta: connector?.accountLabel
        ? `${t('chat.designToolbox.kind.connector')} · ${connector.accountLabel}`
        : t('chat.designToolbox.kind.connector'),
      icon: 'link',
    });
  }
  return items;
}

export function removeSelectedContextId(
  selected: SelectedContextIds,
  kind: CapabilityKind,
  id: string,
): SelectedContextIds {
  if (kind === 'skills') return { ...selected, skillIds: selected.skillIds.filter((item) => item !== id) };
  if (kind === 'plugins') return { ...selected, pluginIds: selected.pluginIds.filter((item) => item !== id) };
  if (kind === 'mcp') return { ...selected, mcpIds: selected.mcpIds.filter((item) => item !== id) };
  return { ...selected, connectorIds: selected.connectorIds.filter((item) => item !== id) };
}

export function buildRunContextSelection(selected: SelectedContextIds): RunContextSelection {
  return {
    ...(selected.skillIds.length > 0 ? { skillIds: selected.skillIds } : {}),
    ...(selected.pluginIds.length > 0 ? { pluginIds: selected.pluginIds } : {}),
    ...(selected.mcpIds.length > 0 ? { mcpServerIds: selected.mcpIds } : {}),
    ...(selected.connectorIds.length > 0 ? { connectorIds: selected.connectorIds } : {}),
  };
}

/** Builds the create-routine wire body from the modal's form + selection state. */
export function buildCreateRoutineRequest(
  form: AutomationFormState,
  selected: SelectedContextIds,
): CreateRoutineRequest {
  return {
    name: form.name.trim(),
    prompt: form.prompt.trim(),
    schedule: buildSchedule(form),
    target: buildRoutineTarget(form),
    skillId: selected.skillIds[0] ?? null,
    context: buildRunContextSelection(selected),
    enabled: true,
  };
}

/** Builds the update-routine wire body (a subset of the create body, no
 * `enabled` toggle — the dashboard's pause/resume action owns that field). */
export function buildUpdateRoutineRequest(
  form: AutomationFormState,
  selected: SelectedContextIds,
): UpdateRoutineRequest {
  const created = buildCreateRoutineRequest(form, selected);
  return {
    name: created.name,
    prompt: created.prompt,
    schedule: created.schedule,
    target: created.target,
    skillId: created.skillId,
    context: created.context,
  };
}
