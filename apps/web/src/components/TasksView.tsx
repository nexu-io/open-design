// Automations tab: one surface for scheduled routines, Orbit-style digests,
// and live artifact refreshers. The daemon still stores these as routines;
// the UI presents them as scheduled agent conversations.

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type {
  AutomationEvolutionProposal,
  AutomationEvolutionProposalListResponse,
  AutomationsClickProps,
  AutomationTemplate as ContractAutomationTemplate,
  AutomationTemplateListResponse,
  ConnectorDetail,
  Routine,
  RoutineRun,
  RoutineRunCrystallizeResponse,
} from '@open-design/contracts';

import { Icon, type IconName } from './Icon';
import { navigate } from '../router';
import { useT } from '../i18n';
import type { SkillSummary } from '../types';
import {
  buildCreatorDashboardDataFromOpenDesign,
  resolveCreatorFocusActionPolicy,
} from '../creator-adapters';
import type {
  ChatRunStatusResponse,
  CreatorTaskPriority,
  CreatorTaskStage,
  CreatorTaskStatus,
  CreatorContentProject,
  CreatorContentProjectData,
  CreatorContentStatus,
  CreatorMediaProjectData,
  CreatorWorkbenchProjectData,
  CreatorReleaseChecklist,
  CreatorReleasePackage,
  CreatorReleasePackageData,
  CreatorReleasePlatform,
  CreatorReleaseStatus,
  Project,
} from '@open-design/contracts';

type TranslateFn = ReturnType<typeof useT>;
import { useAnalytics } from '../analytics/provider';
import { trackAutomationsClick, trackPageView } from '../analytics/events';
import { RUNS_CHANGED_EVENT } from '../providers/daemon';
import {
  NewAutomationModal,
  describeScheduleSummary,
  type AutomationTemplate,
  type AutomationTemplateKind,
} from './NewAutomationModal';

type ProjectSummary = { id: string; name: string };
type TemplateFilter =
  | 'all'
  | AutomationTemplateKind
  | 'memory'
  | 'design-system'
  | 'skills'
  | 'connectors'
  | 'compression'
  | 'release'
  | 'quality';

type TasksSurface = 'automations' | 'creator';
type CreatorTaskFilter = 'active' | 'completed' | 'all';
type CreatorMediaProjectState = {
  projectId: string;
  data: CreatorMediaProjectData;
  failed: boolean;
};
type CreatorContentProjectState = {
  projectId: string;
  data: CreatorContentProjectData;
  failed: boolean;
};
type CreatorReleaseProjectState = {
  projectId: string;
  data: CreatorReleasePackageData;
  failed: boolean;
};

// Release 素材选择：始终提供「未关联」选项；当前关联素材即便已 missing 或库中没有也保留；
// 仅把当前项目中 availability === 'available' 的素材作为新增候选。
function releaseAssetOptions(currentId: string | undefined, media: CreatorMediaProjectState | undefined): ReactElement[] {
  const available = media && !media.failed ? media.data.assets.filter((asset) => asset.availability === 'available') : [];
  const options: ReactElement[] = [<option key="__none" value="">未关联</option>];
  if (currentId && !available.some((asset) => asset.id === currentId)) {
    const current = media?.data.assets.find((asset) => asset.id === currentId);
    options.push(
      <option key={currentId} value={currentId}>
        {current ? `${current.fileName} (${current.availability === 'missing' ? 'Missing' : 'Unavailable'})` : currentId}
      </option>,
    );
  }
  for (const asset of available) {
    options.push(<option key={asset.id} value={asset.id}>{asset.fileName}</option>);
  }
  return options;
}

// 当前关联素材的展示信息；库中没有时标记为 unavailable（不误计为 missing）。
function currentReleaseAsset(assetId: string | undefined, media: CreatorMediaProjectState | undefined) {
  if (!assetId) return undefined;
  const found = media && !media.failed ? media.data.assets.find((asset) => asset.id === assetId) : undefined;
  if (found) return found;
  return { id: assetId, fileName: assetId, relativePath: '', availability: 'unavailable' as const };
}
const CREATOR_STAGES: CreatorTaskStage[] = ['topic', 'material', 'editing', 'release', 'review'];
const CREATOR_STATUSES: CreatorTaskStatus[] = ['todo', 'ready', 'blocked', 'done'];
const CREATOR_PRIORITIES: CreatorTaskPriority[] = ['low', 'medium', 'high'];

type Modal =
  | { kind: 'create'; template?: AutomationTemplate }
  | { kind: 'edit'; routine: Routine }
  | null;

interface Props {
  projects?: Project[];
  skills?: SkillSummary[];
  designTemplates?: SkillSummary[];
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
}

function buildStaticTemplates(t: TranslateFn): ReadonlyArray<AutomationTemplate> {
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

function fallbackOrbitTemplate(t: TranslateFn): AutomationTemplate {
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

function fallbackLiveTemplate(t: TranslateFn): AutomationTemplate {
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

function templateFilters(t: TranslateFn): ReadonlyArray<{ id: TemplateFilter; label: string }> {
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

function scheduleStatusLabel(routine: Routine, t: TranslateFn): string {
  if (!routine.enabled) return t('automations.scheduleStatusPaused');
  return describeScheduleSummary(routine.schedule);
}

function nextRunLabel(routine: Routine, t: TranslateFn): string {
  if (!routine.enabled) return t('automations.nextRunManualOnly');
  if (!routine.nextRunAt) return t('automations.nextRunScheduled');
  const date = new Date(routine.nextRunAt);
  return t('automations.nextRunAt', {
    time: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

function formatAutomationTimestamp(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRunDuration(run: RoutineRun, t: TranslateFn): string {
  if (!run.completedAt) return t('automations.runInProgress');
  const seconds = Math.max(1, Math.round((run.completedAt - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function statusLabel(status: RoutineRun['status'], t: TranslateFn): string {
  if (status === 'succeeded') return t('automations.statusSucceeded');
  if (status === 'failed') return t('automations.statusFailed');
  if (status === 'running') return t('automations.statusRunning');
  if (status === 'queued') return t('automations.statusQueued');
  return t('automations.statusCanceled');
}

function StatusPill({ status, t }: { status: RoutineRun['status']; t: TranslateFn }) {
  return <span className={`automation-status is-${status}`}>{statusLabel(status, t)}</span>;
}

function templateFromSkill(skill: SkillSummary, kind: AutomationTemplateKind): AutomationTemplate {
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

function automationTemplateCategory(template: ContractAutomationTemplate): string {
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

function automationTemplateIcon(category: string): IconName {
  if (category === 'design-system') return 'sliders';
  if (category === 'skills') return 'sparkles';
  if (category === 'connectors') return 'link';
  if (category === 'compression') return 'reload';
  if (category === 'memory') return 'history';
  return 'history';
}

function automationTemplatePrompt(template: ContractAutomationTemplate): string {
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

function templateFromAutomationCatalog(
  template: ContractAutomationTemplate,
): AutomationTemplate {
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

function dedupeTemplates(templates: AutomationTemplate[]): AutomationTemplate[] {
  const seen = new Set<string>();
  return templates.filter((template) => {
    if (seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  });
}

function buildAutomationTemplates(
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

function filterTemplates(templates: AutomationTemplate[], filter: TemplateFilter) {
  if (filter === 'all') return templates;
  if (filter === 'orbit' || filter === 'live-artifact') {
    return templates.filter((template) => template.kind === filter);
  }
  return templates.filter((template) => template.category === filter);
}

function kindLabel(kind: AutomationTemplateKind, t: TranslateFn): string {
  if (kind === 'orbit') return t('automations.kindOrbit');
  if (kind === 'live-artifact') return t('automations.kindLiveArtifact');
  return t('automations.kindAutomation');
}

function kindIcon(kind: AutomationTemplateKind): IconName {
  if (kind === 'orbit') return 'orbit';
  if (kind === 'live-artifact') return 'file-code';
  return 'history';
}

function proposalTargetLabel(target: AutomationEvolutionProposal['targetKind'], t: TranslateFn): string {
  if (target === 'memory-node') return t('automations.proposalTargetMemory');
  if (target === 'design-system') return t('automations.proposalTargetDesignSystem');
  if (target === 'skill') return t('automations.proposalTargetSkill');
  return t('automations.proposalTargetTemplate');
}

function proposalActionLabel(action: AutomationEvolutionProposal['action'], t: TranslateFn): string {
  if (action === 'create') return t('automations.proposalActionCreate');
  if (action === 'update') return t('automations.proposalActionUpdate');
  if (action === 'merge') return t('automations.proposalActionMerge');
  if (action === 'move') return t('automations.proposalActionMove');
  if (action === 'delete') return t('automations.proposalActionDelete');
  return t('automations.proposalActionPromote');
}

function mergeAutomationProposals(
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function creatorRetryAssistantMessageKey(projectId: string): string {
  return `od:creator-retry-assistant:${projectId}`;
}

export function TasksView({ projects: entryProjects = [], skills = [], designTemplates = [], connectors = [] }: Props) {
  const t = useT();
  const analytics = useAnalytics();
  // P2 page_view page_name=automations. Ref-keyed so re-renders don't
  // double-fire while the user is on the page.
  const pageViewFiredRef = useState<{ fired: boolean }>(() => ({ fired: false }))[0];
  useEffect(() => {
    if (pageViewFiredRef.fired) return;
    pageViewFiredRef.fired = true;
    trackPageView(analytics.track, { page_name: 'automations' });
  }, [analytics.track, pageViewFiredRef]);
  // P2 ui_click page_name=automations. Fire on every actionable click inside
  // the tab before running the handler, so navigations that unmount the view
  // still report.
  const fireClick = useCallback(
    (
      element: AutomationsClickProps['element'],
      extra?: Pick<AutomationsClickProps, 'type_id' | 'filter_id' | 'template_kind'>,
    ) => {
      trackAutomationsClick(analytics.track, {
        page_name: 'automations',
        area: 'automations',
        element,
        ...extra,
      });
    },
    [analytics.track],
  );
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [creatorRuns, setCreatorRuns] = useState<ChatRunStatusResponse[]>([]);
  const [creatorProjectData, setCreatorProjectData] = useState<Array<{
    projectId: string;
    data: CreatorWorkbenchProjectData;
  }>>([]);
  const [creatorMediaProjectData, setCreatorMediaProjectData] = useState<CreatorMediaProjectState[]>([]);
  const [creatorContentProjectData, setCreatorContentProjectData] = useState<CreatorContentProjectState[]>([]);
  const [creatorTaskProjectId, setCreatorTaskProjectId] = useState('');
  const [creatorTaskTitle, setCreatorTaskTitle] = useState('');
  const [creatorTaskStage, setCreatorTaskStage] = useState<CreatorTaskStage>('topic');
  const [creatorTaskSaving, setCreatorTaskSaving] = useState(false);
  const [creatorTaskFilter, setCreatorTaskFilter] = useState<CreatorTaskFilter>('active');
  const [creatorTaskEdit, setCreatorTaskEdit] = useState<{
    id: string; projectId: string; originalStatus: string; title: string; description: string;
    stage: CreatorTaskStage; status: CreatorTaskStatus; priority: CreatorTaskPriority; blockerNote: string;
  } | null>(null);
  const [creatorTaskMediaAssetId, setCreatorTaskMediaAssetId] = useState('');
  const [creatorTaskMediaSaving, setCreatorTaskMediaSaving] = useState(false);
  const [creatorContentProjectId, setCreatorContentProjectId] = useState('');
  const [creatorContentTitle, setCreatorContentTitle] = useState('');
  const [creatorContentEdit, setCreatorContentEdit] = useState<CreatorContentProject | null>(null);
  const [creatorContentSaving, setCreatorContentSaving] = useState(false);
  const [creatorReleaseProjectData, setCreatorReleaseProjectData] = useState<CreatorReleaseProjectState[]>([]);
  const [creatorReleaseProjectId, setCreatorReleaseProjectId] = useState('');
  const [creatorReleaseContentId, setCreatorReleaseContentId] = useState('');
  const [creatorReleasePlatform, setCreatorReleasePlatform] = useState<CreatorReleasePlatform>('bilibili');
  const [creatorReleaseTitle, setCreatorReleaseTitle] = useState('');
  const [creatorReleaseEdit, setCreatorReleaseEdit] = useState<CreatorReleasePackage | null>(null);
  const [creatorReleaseTagsInput, setCreatorReleaseTagsInput] = useState('');
  const [creatorReleaseSaving, setCreatorReleaseSaving] = useState(false);
  const [creatorContentTaskId, setCreatorContentTaskId] = useState('');
  const [creatorStoryboardMediaAssetId, setCreatorStoryboardMediaAssetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [surface, setSurface] = useState<TasksSurface>('automations');
  const [automationCatalog, setAutomationCatalog] = useState<ContractAutomationTemplate[]>([]);
  const [proposals, setProposals] = useState<AutomationEvolutionProposal[]>([]);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [crystallizingRunId, setCrystallizingRunId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusRoutineId, setFocusRoutineId] = useState<string | null>(null);
  const routineRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [historyTick, setHistoryTick] = useState(0);
  const creatorDashboard = useMemo(
    () =>
      buildCreatorDashboardDataFromOpenDesign({
        projects: entryProjects,
        runs: creatorRuns,
        creatorProjectData,
      }),
    [creatorProjectData, creatorRuns, entryProjects],
  );
  const projectSummaries = useMemo<ProjectSummary[]>(
    () =>
      entryProjects.map((project) => ({
        id: project.id,
        name: project.name,
      })),
    [entryProjects],
  );
  const visibleCreatorTasks = useMemo(() => creatorDashboard.tasks.filter((task) => {
    if (creatorTaskFilter === 'active') return task.status !== 'done';
    if (creatorTaskFilter === 'completed') return task.status === 'done';
    return true;
  }), [creatorDashboard.tasks, creatorTaskFilter]);
  const selectedCreatorMedia = useMemo(
    () => creatorMediaProjectData.find((value) => value.projectId === creatorTaskProjectId),
    [creatorMediaProjectData, creatorTaskProjectId],
  );
  const editingCreatorMedia = useMemo(
    () => creatorTaskEdit
      ? creatorMediaProjectData.find((value) => value.projectId === creatorTaskEdit.projectId)
      : undefined,
    [creatorMediaProjectData, creatorTaskEdit],
  );
  const linkedCreatorMediaAssets = useMemo(() => {
    if (!creatorTaskEdit || !editingCreatorMedia) return [];
    const linkedAssetIds = new Set(
      editingCreatorMedia.data.taskLinks
        .filter((link) => link.taskId === creatorTaskEdit.id)
        .map((link) => link.assetId),
    );
    return editingCreatorMedia.data.assets.filter((asset) => linkedAssetIds.has(asset.id));
  }, [creatorTaskEdit, editingCreatorMedia]);
  const availableCreatorMediaAssets = useMemo(() => {
    if (!editingCreatorMedia) return [];
    const linkedAssetIds = new Set(linkedCreatorMediaAssets.map((asset) => asset.id));
    return editingCreatorMedia.data.assets.filter(
      (asset) => asset.availability === 'available' && !linkedAssetIds.has(asset.id),
    );
  }, [editingCreatorMedia, linkedCreatorMediaAssets]);
  const selectedCreatorContent = useMemo(
    () => creatorContentProjectData.find((value) => value.projectId === creatorContentProjectId),
    [creatorContentProjectData, creatorContentProjectId],
  );
  const editingCreatorContentMedia = useMemo(
    () => creatorContentEdit
      ? creatorMediaProjectData.find((value) => value.projectId === creatorContentEdit.projectId)
      : undefined,
    [creatorContentEdit, creatorMediaProjectData],
  );
  const editingCreatorContentTasks = useMemo(
    () => creatorContentEdit
      ? creatorProjectData.find((value) => value.projectId === creatorContentEdit.projectId)?.data.tasks ?? []
      : [],
    [creatorContentEdit, creatorProjectData],
  );

  const selectedCreatorRelease = useMemo(
    () => creatorReleaseProjectData.find((value) => value.projectId === creatorReleaseProjectId),
    [creatorReleaseProjectData, creatorReleaseProjectId],
  );
  const selectedReleaseContent = useMemo(
    () => creatorContentProjectData.find((value) => value.projectId === creatorReleaseProjectId),
    [creatorContentProjectData, creatorReleaseProjectId],
  );
  const selectedReleaseMedia = useMemo(
    () => creatorMediaProjectData.find((value) => value.projectId === creatorReleaseProjectId),
    [creatorMediaProjectData, creatorReleaseProjectId],
  );

  const templates = useMemo(
    () => buildAutomationTemplates(designTemplates, automationCatalog, t),
    [automationCatalog, designTemplates, t],
  );
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, templateFilter),
    [templates, templateFilter],
  );

  const refresh = useCallback(async (): Promise<{ proposalRefreshFailed: boolean }> => {
    let proposalRefreshFailed = false;
    try {
      const templateRequest = fetch('/api/automation-templates')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationTemplateListResponse;
        })
        .catch(() => null);
      const proposalRequest = fetch('/api/automation-proposals?status=pending-review')
        .then(async (res) => {
          if (!res.ok) {
            proposalRefreshFailed = true;
            return null;
          }
          return (await res.json()) as AutomationEvolutionProposalListResponse;
        })
        .catch(() => {
          proposalRefreshFailed = true;
          return null;
        });
      const [rRes, runsRes, tJson, proposalJson] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/runs').catch(() => null),
        templateRequest,
        proposalRequest,
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (runsRes?.ok) {
        const runsJson = (await runsRes.json()) as { runs?: ChatRunStatusResponse[] };
        setCreatorRuns(Array.isArray(runsJson.runs) ? runsJson.runs : []);
      } else {
        setCreatorRuns([]);
      }
      const creatorData = await Promise.all(entryProjects.map(async (project) => {
        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/creator-workbench`);
          if (!response.ok) return null;
          const data = await response.json() as CreatorWorkbenchProjectData;
          return { projectId: project.id, data };
        } catch {
          return null;
        }
      }));
      setCreatorProjectData(creatorData.filter((value): value is {
        projectId: string;
        data: CreatorWorkbenchProjectData;
      } => value !== null));
      const creatorMediaData = await Promise.all(entryProjects.map(async (project): Promise<CreatorMediaProjectState> => {
        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/creator-media-assets`);
          if (!response.ok) return { projectId: project.id, data: { roots: [], assets: [], taskLinks: [] }, failed: true };
          const data = await response.json() as Partial<CreatorMediaProjectData>;
          return {
            projectId: project.id,
            data: {
              assets: Array.isArray(data.assets) ? data.assets : [],
              taskLinks: Array.isArray(data.taskLinks) ? data.taskLinks : [],
            } as CreatorMediaProjectData,
            failed: false,
          };
        } catch {
          return { projectId: project.id, data: { roots: [], assets: [], taskLinks: [] }, failed: true };
        }
      }));
      setCreatorMediaProjectData(creatorMediaData);
      const creatorContentData = await Promise.all(entryProjects.map(async (project): Promise<CreatorContentProjectState> => {
        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/creator-content`);
          if (!response.ok) return { projectId: project.id, data: { contentProjects: [] }, failed: true };
          const data = await response.json() as Partial<CreatorContentProjectData>;
          return {
            projectId: project.id,
            data: { contentProjects: Array.isArray(data.contentProjects) ? data.contentProjects : [] },
            failed: false,
          };
        } catch {
          return { projectId: project.id, data: { contentProjects: [] }, failed: true };
        }
      }));
      setCreatorContentProjectData(creatorContentData);
      const creatorReleaseData = await Promise.all(entryProjects.map(async (project): Promise<CreatorReleaseProjectState> => {
        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/creator-release-packages`);
          if (!response.ok) return { projectId: project.id, data: { releasePackages: [] }, failed: true };
          const data = await response.json() as Partial<CreatorReleasePackageData>;
          return {
            projectId: project.id,
            data: { releasePackages: Array.isArray(data.releasePackages) ? data.releasePackages : [] },
            failed: false,
          };
        } catch {
          return { projectId: project.id, data: { releasePackages: [] }, failed: true };
        }
      }));
      setCreatorReleaseProjectData(creatorReleaseData);
      if (tJson) {
        setAutomationCatalog(Array.isArray(tJson.templates) ? tJson.templates : []);
      }
      if (proposalJson) {
        setProposals(Array.isArray(proposalJson.proposals) ? proposalJson.proposals : []);
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
    return { proposalRefreshFailed };
  }, [entryProjects]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleRunsChanged = () => {
      void refresh();
    };
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    return () => {
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    };
  }, [refresh]);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectSummaries) map.set(p.id, p.name);
    return map;
  }, [projectSummaries]);

  const openCreatorProject = useCallback((projectId: string | undefined) => {
    if (!projectId) return;
    navigate({
      kind: 'project',
      projectId,
      conversationId: null,
      fileName: null,
    });
  }, []);

  useEffect(() => {
    if (!creatorTaskProjectId && entryProjects[0]?.id) {
      setCreatorTaskProjectId(entryProjects[0].id);
    }
  }, [creatorTaskProjectId, entryProjects]);

  useEffect(() => {
    if (!creatorContentProjectId && entryProjects[0]?.id) {
      setCreatorContentProjectId(entryProjects[0].id);
    }
  }, [creatorContentProjectId, entryProjects]);

  useEffect(() => {
    if (!creatorReleaseProjectId && entryProjects[0]?.id) {
      setCreatorReleaseProjectId(entryProjects[0].id);
    }
  }, [creatorReleaseProjectId, entryProjects]);

  const replaceCreatorContent = useCallback((content: CreatorContentProject) => {
    setCreatorContentProjectData((current) => current.map((entry) => entry.projectId !== content.projectId
      ? entry
      : {
        ...entry,
        data: {
          contentProjects: entry.data.contentProjects.some((candidate) => candidate.id === content.id)
            ? entry.data.contentProjects.map((candidate) => candidate.id === content.id ? content : candidate)
            : [...entry.data.contentProjects, content],
        },
      }));
  }, []);

  const createCreatorContent = useCallback(async () => {
    const title = creatorContentTitle.trim();
    if (!creatorContentProjectId || !title) return;
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(creatorContentProjectId)}/creator-content`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, status: 'idea' }),
      });
      if (!response.ok) throw new Error(`creator content: ${response.status}`);
      const result = await response.json() as { content: CreatorContentProject };
      replaceCreatorContent(result.content);
      setCreatorContentEdit(result.content);
      setCreatorContentTitle('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentProjectId, creatorContentTitle, replaceCreatorContent]);

  const saveCreatorContent = useCallback(async () => {
    if (!creatorContentEdit) return;
    const content = creatorContentEdit;
    const storyboardItems = content.storyboardItems
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        position: item.position,
        purpose: item.purpose.trim(),
        ...(item.visualDescription ? { visualDescription: item.visualDescription } : {}),
        ...(item.audioNotes ? { audioNotes: item.audioNotes } : {}),
        mediaAssetIds: item.mediaAssetIds,
      }));
    if (storyboardItems.some((item) => !item.purpose)) {
      setError('Storyboard purpose is required');
      return;
    }
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(content.projectId)}/creator-content/${encodeURIComponent(content.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          title: content.title.trim(), status: content.status, brief: content.brief, outline: content.outline, storyboardItems, retrospective: content.retrospective,
        }),
      });
      if (!response.ok) throw new Error(`creator content update: ${response.status}`);
      const result = await response.json().catch(() => null) as { content?: CreatorContentProject } | null;
      const saved = result?.content ?? content;
      replaceCreatorContent(saved);
      setCreatorContentEdit(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentEdit, replaceCreatorContent]);

  const deleteCreatorContent = useCallback(async (content: CreatorContentProject) => {
    if (!window.confirm('Delete this content project?')) return;
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(content.projectId)}/creator-content/${encodeURIComponent(content.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`creator content delete: ${response.status}`);
      setCreatorContentProjectData((current) => current.map((entry) => entry.projectId !== content.projectId ? entry : {
        ...entry, data: { contentProjects: entry.data.contentProjects.filter((candidate) => candidate.id !== content.id) },
      }));
      if (creatorContentEdit?.id === content.id) setCreatorContentEdit(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentEdit]);

  // Release 面板：本地 helper、CRUD、导出下载。

  function isoToLocalInput(iso?: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function localInputToIso(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('invalid local date');
    return date.toISOString();
  }

  const triggerReleaseDownload = useCallback((filename: string, content: string, mime: string) => {
    try {
      const blob = new Blob([content], { type: mime });
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
      const anchor = document.createElement('a');
      anchor.href = url || '#';
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    } catch {
      // 浏览器不支持下载时静默忽略（例如测试环境）。
    }
  }, []);

  const replaceCreatorRelease = useCallback((release: CreatorReleasePackage) => {
    setCreatorReleaseProjectData((current) => current.map((entry) => entry.projectId !== release.projectId
      ? entry
      : {
        ...entry,
        data: {
          releasePackages: entry.data.releasePackages.some((candidate) => candidate.id === release.id)
            ? entry.data.releasePackages.map((candidate) => candidate.id === release.id ? release : candidate)
            : [...entry.data.releasePackages, release],
        },
      }));
  }, []);

  const createCreatorRelease = useCallback(async () => {
    const title = creatorReleaseTitle.trim();
    const contentId = creatorReleaseContentId;
    if (!creatorReleaseProjectId || !contentId || !title) return;
    setCreatorReleaseSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(creatorReleaseProjectId)}/creator-release-packages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentId, platform: creatorReleasePlatform, title }),
      });
      if (!response.ok) throw new Error(`creator release create: ${response.status}`);
      const result = await response.json() as { releasePackage: CreatorReleasePackage };
      replaceCreatorRelease(result.releasePackage);
      setCreatorReleaseEdit(result.releasePackage);
      setCreatorReleaseTagsInput(result.releasePackage.tags.join(', '));
      setCreatorReleaseTitle('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorReleaseSaving(false);
    }
  }, [creatorReleaseProjectId, creatorReleaseContentId, creatorReleasePlatform, creatorReleaseTitle, replaceCreatorRelease]);

  const updateCreatorReleaseEdit = useCallback((update: (release: CreatorReleasePackage) => CreatorReleasePackage) => {
    setCreatorReleaseEdit((current) => current ? update(current) : current);
  }, []);

  const saveCreatorRelease = useCallback(async () => {
    if (!creatorReleaseEdit) return;
    const release = creatorReleaseEdit;
    const title = release.title.trim();
    if (!title) {
      setError('Release title is required');
      return;
    }
    const tags = Array.from(new Set(creatorReleaseTagsInput.split(',').map((item) => item.trim()).filter(Boolean)));
    // 可选字段：空值 -> null 显式清空；非空值 -> 原样发送（ISO 或 URL）。
    const toNullable = (value: string | undefined): string | null => (value && value.trim() ? value : null);
    const body: Record<string, unknown> = {
      contentId: release.contentId,
      platform: release.platform,
      status: release.status,
      title,
      description: release.description,
      tags,
      coverAssetId: toNullable(release.coverAssetId),
      exportAssetId: toNullable(release.exportAssetId),
      scheduledAt: toNullable(release.scheduledAt),
      publishedAt: toNullable(release.publishedAt),
      publishedUrl: toNullable(release.publishedUrl),
      checklist: release.checklist,
    };
    setCreatorReleaseSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(release.projectId)}/creator-release-packages/${encodeURIComponent(release.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`creator release update: ${response.status}`);
      const result = await response.json().catch(() => null) as { releasePackage?: CreatorReleasePackage } | null;
      const saved = result?.releasePackage ?? release;
      replaceCreatorRelease(saved);
      setCreatorReleaseEdit(saved);
      setCreatorReleaseTagsInput(saved.tags.join(', '));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorReleaseSaving(false);
    }
  }, [creatorReleaseEdit, creatorReleaseTagsInput, replaceCreatorRelease]);

  const deleteCreatorRelease = useCallback(async (release: CreatorReleasePackage) => {
    if (!window.confirm('Delete this release package?')) return;
    setCreatorReleaseSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(release.projectId)}/creator-release-packages/${encodeURIComponent(release.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`creator release delete: ${response.status}`);
      setCreatorReleaseProjectData((current) => current.map((entry) => entry.projectId !== release.projectId ? entry : {
        ...entry, data: { releasePackages: entry.data.releasePackages.filter((candidate) => candidate.id !== release.id) },
      }));
      if (creatorReleaseEdit?.id === release.id) setCreatorReleaseEdit(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorReleaseSaving(false);
    }
  }, [creatorReleaseEdit]);

  const downloadReleaseJson = useCallback(async (release: CreatorReleasePackage) => {
    if (!release) return;
    setCreatorReleaseSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(release.projectId)}/creator-release-packages/${encodeURIComponent(release.id)}/export`);
      if (!response.ok) throw new Error(`creator release export: ${response.status}`);
      const data = await response.json();
      triggerReleaseDownload(`release-${release.id}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorReleaseSaving(false);
    }
  }, [triggerReleaseDownload]);

  const downloadReleaseMarkdown = useCallback(async (release: CreatorReleasePackage) => {
    if (!release) return;
    setCreatorReleaseSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(release.projectId)}/creator-release-packages/${encodeURIComponent(release.id)}/export`);
      if (!response.ok) throw new Error(`creator release export: ${response.status}`);
      const data = await response.json() as {
        id: string; projectId: string; contentId: string; platform: string; status: string; title: string;
        description: string; tags: string[]; scheduledAt?: string; publishedAt?: string; publishedUrl?: string;
        checklist: CreatorReleaseChecklist; content: { id: string; title: string };
        coverAsset: { id: string; availability: string } | null; exportAsset: { id: string; availability: string } | null;
      };
      const lines = [
        `# ${data.title}`,
        '',
        `- Platform: ${data.platform}`,
        `- Status: ${data.status}`,
        `- Content: ${data.content.title} (${data.content.id})`,
        `- Description: ${data.description || '-'}`,
        `- Tags: ${data.tags.join(', ') || '-'}`,
        `- Scheduled: ${data.scheduledAt ?? '-'}`,
        `- Published: ${data.publishedAt ?? '-'}`,
        `- URL: ${data.publishedUrl ?? '-'}`,
        '',
        '## Checklist',
        `- contentComplete: ${data.checklist.contentComplete}`,
        `- exportConfirmed: ${data.checklist.exportConfirmed}`,
        `- coverConfirmed: ${data.checklist.coverConfirmed}`,
        `- metadataConfirmed: ${data.checklist.metadataConfirmed}`,
        `- platformConfirmed: ${data.checklist.platformConfirmed}`,
        '',
        '## Assets',
        `- cover: ${data.coverAsset?.id ?? '-'} (${data.coverAsset?.availability ?? 'none'})`,
        `- export: ${data.exportAsset?.id ?? '-'} (${data.exportAsset?.availability ?? 'none'})`,
        '',
      ];
      triggerReleaseDownload(`release-${release.id}.md`, lines.join('\n'), 'text/markdown');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorReleaseSaving(false);
    }
  }, [triggerReleaseDownload]);

  const onReleaseProjectChange = useCallback((value: string) => {
    setCreatorReleaseProjectId(value);
    setCreatorReleaseContentId('');
  }, []);

  const updateCreatorContentEdit = useCallback((update: (content: CreatorContentProject) => CreatorContentProject) => {
    setCreatorContentEdit((current) => current ? update(current) : current);
  }, []);

  const updateStoryboardItem = useCallback((itemId: string, update: (item: CreatorContentProject['storyboardItems'][number]) => CreatorContentProject['storyboardItems'][number]) => {
    updateCreatorContentEdit((content) => ({
      ...content,
      storyboardItems: content.storyboardItems.map((item) => item.id === itemId ? update(item) : item),
    }));
  }, [updateCreatorContentEdit]);

  const linkCreatorContentTask = useCallback(async () => {
    if (!creatorContentEdit || !creatorContentTaskId) return;
    const content = creatorContentEdit;
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(content.projectId)}/creator-content/${encodeURIComponent(content.id)}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: creatorContentTaskId }),
      });
      if (!response.ok) throw new Error(`creator content task: ${response.status}`);
      const result = await response.json() as { content: CreatorContentProject };
      replaceCreatorContent(result.content);
      setCreatorContentEdit(result.content);
      setCreatorContentTaskId('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentEdit, creatorContentTaskId, refresh, replaceCreatorContent]);

  const unlinkCreatorContentTask = useCallback(async (taskId: string) => {
    if (!creatorContentEdit) return;
    const content = creatorContentEdit;
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(content.projectId)}/creator-content/${encodeURIComponent(content.id)}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`creator content task: ${response.status}`);
      const updated = { ...content, taskIds: content.taskIds.filter((id) => id !== taskId) };
      replaceCreatorContent(updated);
      setCreatorContentEdit(updated);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentEdit, refresh, replaceCreatorContent]);

  const linkCreatorStoryboardMedia = useCallback(async (itemId: string) => {
    if (!creatorContentEdit || !creatorStoryboardMediaAssetId || itemId.startsWith('temporary-storyboard:')) return;
    const content = creatorContentEdit;
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(content.projectId)}/creator-content/${encodeURIComponent(content.id)}/storyboard/${encodeURIComponent(itemId)}/media-assets`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: creatorStoryboardMediaAssetId }),
      });
      if (!response.ok) throw new Error(`creator storyboard media: ${response.status}`);
      const result = await response.json() as { content: CreatorContentProject };
      replaceCreatorContent(result.content);
      setCreatorContentEdit(result.content);
      setCreatorStoryboardMediaAssetId('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentEdit, creatorStoryboardMediaAssetId, refresh, replaceCreatorContent]);

  const unlinkCreatorStoryboardMedia = useCallback(async (itemId: string, assetId: string) => {
    if (!creatorContentEdit || itemId.startsWith('temporary-storyboard:')) return;
    const content = creatorContentEdit;
    setCreatorContentSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(content.projectId)}/creator-content/${encodeURIComponent(content.id)}/storyboard/${encodeURIComponent(itemId)}/media-assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`creator storyboard media: ${response.status}`);
      const updated = {
        ...content,
        storyboardItems: content.storyboardItems.map((item) => item.id === itemId ? { ...item, mediaAssetIds: item.mediaAssetIds.filter((id) => id !== assetId) } : item),
      };
      replaceCreatorContent(updated);
      setCreatorContentEdit(updated);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorContentSaving(false);
    }
  }, [creatorContentEdit, refresh, replaceCreatorContent]);

  const createCreatorTask = useCallback(async () => {
    const title = creatorTaskTitle.trim();
    if (!creatorTaskProjectId || !title) return;
    setCreatorTaskSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(creatorTaskProjectId)}/creator-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, stage: creatorTaskStage, status: 'todo', priority: 'medium', sourceType: 'manual' }),
      });
      if (!response.ok) throw new Error(`creator task: ${response.status}`);
      setCreatorTaskTitle('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorTaskSaving(false);
    }
  }, [creatorTaskProjectId, creatorTaskStage, creatorTaskTitle, refresh]);

  const advanceCreatorTask = useCallback(async (task: { id: string; projectId: string; stage: string; title: string }) => {
    const stageIndex = CREATOR_STAGES.indexOf(task.stage as CreatorTaskStage);
    const nextStage = CREATOR_STAGES[Math.max(0, stageIndex + 1)];
    const isComplete = stageIndex >= CREATOR_STAGES.length - 1;
    if (!nextStage) return;
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(task.projectId)}/creator-tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: nextStage, status: isComplete ? 'done' : 'ready', blockerNote: '' }),
      });
      if (!response.ok) throw new Error(`creator task update: ${response.status}`);
      const activity = await fetch(`/api/projects/${encodeURIComponent(task.projectId)}/creator-activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, category: nextStage, title: isComplete ? `${task.title} 已完成` : `${task.title} 推进到下一阶段` }),
      });
      if (!activity.ok) throw new Error(`creator activity: ${activity.status}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [refresh]);

  const saveCreatorTaskEdit = useCallback(async () => {
    if (!creatorTaskEdit) return;
    const edit = creatorTaskEdit;
    const blockerNote = edit.blockerNote.trim();
    if (edit.status === 'blocked' && !blockerNote) {
      setError('Blocker reason is required');
      return;
    }
    setCreatorTaskSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(edit.projectId)}/creator-tasks/${encodeURIComponent(edit.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: edit.title.trim(), description: edit.description, stage: edit.stage, status: edit.status, priority: edit.priority, blockerNote }),
      });
      if (!response.ok) throw new Error(`creator task update: ${response.status}`);
      const isBlocked = edit.status === 'blocked';
      const activityTitle = isBlocked ? `${edit.title.trim()} 已阻塞` : edit.originalStatus === 'blocked' ? `${edit.title.trim()} 已解除阻塞` : `${edit.title.trim()} 已更新`;
      const activity = await fetch(`/api/projects/${encodeURIComponent(edit.projectId)}/creator-activities`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: edit.id, category: edit.stage, title: activityTitle, ...(isBlocked ? { summary: blockerNote } : {}) }),
      });
      if (!activity.ok) throw new Error(`creator activity: ${activity.status}`);
      setCreatorTaskEdit(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      await refresh();
    } finally {
      setCreatorTaskSaving(false);
    }
  }, [creatorTaskEdit, refresh]);

  const linkCreatorTaskMedia = useCallback(async () => {
    if (!creatorTaskEdit || !creatorTaskMediaAssetId) return;
    const edit = creatorTaskEdit;
    setCreatorTaskMediaSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(edit.projectId)}/creator-tasks/${encodeURIComponent(edit.id)}/media-assets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: creatorTaskMediaAssetId }),
      });
      if (!response.ok) throw new Error(`creator task media: ${response.status}`);
      setCreatorTaskMediaAssetId('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorTaskMediaSaving(false);
    }
  }, [creatorTaskEdit, creatorTaskMediaAssetId, refresh]);

  const unlinkCreatorTaskMedia = useCallback(async (assetId: string) => {
    if (!creatorTaskEdit) return;
    const edit = creatorTaskEdit;
    setCreatorTaskMediaSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(edit.projectId)}/creator-tasks/${encodeURIComponent(edit.id)}/media-assets/${encodeURIComponent(assetId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`creator task media: ${response.status}`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatorTaskMediaSaving(false);
    }
  }, [creatorTaskEdit, refresh]);

  const restoreCreatorTask = useCallback(async (task: { id: string; projectId: string; stage: string; title: string }) => {
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(task.projectId)}/creator-tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ready', blockerNote: '' }),
      });
      if (!response.ok) throw new Error(`creator task restore: ${response.status}`);
      const activity = await fetch(`/api/projects/${encodeURIComponent(task.projectId)}/creator-activities`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: task.id, category: task.stage, title: `${task.title} 已恢复进行中` }),
      });
      if (!activity.ok) throw new Error(`creator activity: ${activity.status}`);
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
  }, [refresh]);

  const triggerCreatorFocusAction = useCallback(async () => {
    const focus = creatorDashboard.focus;
    if (!focus?.projectId) return;
    const policy = resolveCreatorFocusActionPolicy(focus.recommendedActionKey);

    if (policy.kind === 'open-project') {
      navigate({
        kind: 'project',
        projectId: focus.projectId,
        conversationId: policy.conversation === 'focus'
          ? focus.conversationId ?? null
          : null,
        fileName: null,
      });
      return;
    }

    if (policy.kind === 'retry') {
      if (focus.assistantMessageId) {
        try {
          window.sessionStorage.setItem(
            creatorRetryAssistantMessageKey(focus.projectId),
            focus.assistantMessageId,
          );
        } catch {
          // sessionStorage can be unavailable; fall back to opening the conversation.
        }
      }
      navigate({
        kind: 'project',
        projectId: focus.projectId,
        conversationId: focus.conversationId ?? null,
        fileName: null,
      });
      return;
    }

    if (policy.kind === 'start-first-run') {
      const project = entryProjects.find((candidate) => candidate.id === focus.projectId);
      const pendingPrompt = project?.pendingPrompt?.trim();
      if (pendingPrompt) {
        try {
          window.sessionStorage.setItem(`od:auto-send-first:${focus.projectId}`, '1');
        } catch {
          // sessionStorage can be unavailable; project view will still open
          // with the pending prompt prefilled.
        }
      }
      navigate({
        kind: 'project',
        projectId: focus.projectId,
        conversationId: null,
        fileName: null,
      });
      return;
    }
  }, [creatorDashboard.focus, entryProjects]);

  // Sort routines by creation time, newest first
  const sortedRoutines = useMemo(
    () => sortRoutinesNewestFirst(routines),
    [routines],
  );

  useEffect(() => {
    if (!focusRoutineId) return;
    const node = routineRowRefs.current[focusRoutineId];
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = window.setTimeout(() => setFocusRoutineId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusRoutineId, sortedRoutines]);

  const activeCount = sortedRoutines.filter((routine) => routine.enabled).length;
  const pausedCount = sortedRoutines.length - activeCount;

  const reviewProposal = async (id: string, action: 'apply' | 'reject') => {
    setProposalBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/automation-proposals/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ reason: t('automations.proposalsDismissReason') }) : '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${action} failed: ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProposalBusyId(null);
    }
  };

  const runNow = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
      if (!res.ok && res.status !== 202) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `run failed: ${res.status}`);
      }
      const j = await res.json().catch(() => null);
      if (j?.projectId) {
        navigate({
          kind: 'project',
          projectId: j.projectId,
          conversationId: j.conversationId ?? null,
          fileName: null,
        });
        return;
      }
      void refresh();
      setExpandedId(id);
      setHistoryTick((tick) => tick + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const crystallizeRun = async (routineId: string, runId: string) => {
    setCrystallizingRunId(runId);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${routineId}/runs/${runId}/crystallize`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `crystallize failed: ${res.status}`);
      }
      const json = (await res.json()) as RoutineRunCrystallizeResponse;
      const createdProposals = Array.isArray(json.proposals) ? json.proposals : [];
      if (createdProposals.length > 0) {
        setProposals((current) => mergeAutomationProposals(current, createdProposals));
      }
      const { proposalRefreshFailed } = await refresh();
      if (proposalRefreshFailed) {
        setError(
          createdProposals.length > 0
            ? t('automations.crystallizePartialSuccess')
            : t('automations.crystallizeRefreshFailed'),
        );
      } else if (createdProposals.length === 0) {
        setError(t('automations.crystallizeNoProposals'));
      }
    } catch (err) {
      setError(t('automations.crystallizeFailed', { error: errorMessage(err) }));
    } finally {
      setCrystallizingRunId(null);
    }
  };

  const togglePaused = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `update failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('automations.deleteConfirm')))
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `delete failed: ${res.status}`);
      }
      if (expandedId === id) setExpandedId(null);
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="automations-view" aria-labelledby="automations-title" data-testid="tasks-view">
      <header className="automations-hero">
        <div className="automations-hero__copy">
          <span className="automations-hero__eyebrow">{t('automations.eyebrow')}</span>
          <h1 id="automations-title" className="automations-hero__title">
            {t('automations.title')}
          </h1>
          <p className="automations-hero__lede">
            {t('automations.lede')}
          </p>
        </div>
        <div className="automations-hero__actions">
          <div className="automations-metrics" aria-label={t('automations.summaryAria')}>
            <Metric label={t('automations.metricActive')} value={activeCount} />
            <Metric label={t('automations.metricPaused')} value={pausedCount} />
            <Metric label={t('automations.metricTemplates')} value={templates.length} />
          </div>
          <button
            type="button"
            className="automations-view__new"
            onClick={() => {
              fireClick('new_automation');
              setModal({ kind: 'create' });
            }}
            data-testid="automations-new"
          >
            <Icon name="plus" size={14} />
            <span>{t('automations.newAutomation')}</span>
          </button>
        </div>
      </header>

      <div
        className="tasks-surface-switch"
        role="tablist"
        aria-label="Tasks workspace views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'automations'}
          className={`tasks-surface-switch__tab${surface === 'automations' ? ' is-active' : ''}`}
          onClick={() => setSurface('automations')}
        >
          <span className="tasks-surface-switch__label">Automations</span>
          <span className="tasks-surface-switch__count">{sortedRoutines.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'creator'}
          className={`tasks-surface-switch__tab${surface === 'creator' ? ' is-active' : ''}`}
          onClick={() => setSurface('creator')}
        >
          <span className="tasks-surface-switch__label">Creator workbench</span>
          <span className="tasks-surface-switch__count">{creatorDashboard.tasks.length}</span>
        </button>
      </div>

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

      {surface === 'creator' ? (
        <section className="creator-dashboard" aria-label="Creator workbench" data-testid="creator-dashboard">
          <div className="automations-section-head">
            <div>
              <h2 className="automations-section__label">Creator workbench</h2>
              <p className="automations-section__sub">
                Topic, material, editing, and release context stitched into one working surface.
              </p>
            </div>
            <span className="automations-section__meta">
              {creatorDashboard.tasks.length} tasks · {creatorDashboard.activities.length} activities · {creatorDashboard.workflows.length} workflows
            </span>
          </div>

          <div className="creator-dashboard__hero">
            <div className="creator-dashboard__hero-card">
              <span className="creator-dashboard__hero-label">Focus now</span>
              <strong className="creator-dashboard__hero-title">
                {creatorDashboard.focus?.title ?? 'No active task'}
              </strong>
              <p className="creator-dashboard__hero-copy">
                {creatorDashboard.focus?.description ?? 'Queue a topic, material, or editing task to start the chain.'}
              </p>
              <div className="creator-list__chips">
                {creatorDashboard.focus?.reasonLabel ? <span className="creator-chip">{creatorDashboard.focus.reasonLabel}</span> : null}
                {creatorDashboard.focus?.recommendedActionLabel ? <span className="creator-chip">{creatorDashboard.focus.recommendedActionLabel}</span> : null}
                {creatorDashboard.focus?.stageLabel ? <span className="creator-chip">{creatorDashboard.focus.stageLabel}</span> : null}
                {creatorDashboard.focus?.statusLabel ? <span className="creator-chip">{creatorDashboard.focus.statusLabel}</span> : null}
                {creatorDashboard.focus?.sourceLabel ? <span className="creator-chip">{creatorDashboard.focus.sourceLabel}</span> : null}
              </div>
              {creatorDashboard.focus?.projectId ? (
                <div className="creator-dashboard__hero-actions">
                  <Button
                    variant="primary"
                    className="creator-dashboard__hero-action"
                    onClick={() => {
                      void triggerCreatorFocusAction();
                    }}
                  >
                    {creatorDashboard.focus.recommendedActionLabel}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="creator-dashboard__hero-stats" aria-label="Creator summary metrics">
              <Metric label="Tasks" value={creatorDashboard.tasks.length} />
              <Metric label="Activity" value={creatorDashboard.activities.length} />
              <Metric label="Flows" value={creatorDashboard.workflows.length} />
            </div>
          </div>

          <div className="creator-dashboard__grid">
            <section className="creator-panel" aria-labelledby="creator-tasks-title">
              <div className="creator-panel__head">
                <h3 id="creator-tasks-title" className="creator-panel__title">Tasks</h3>
                <span className="creator-panel__meta">Current queue</span>
              </div>
              {entryProjects.length > 0 ? (
                <form
                  className="creator-task-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createCreatorTask();
                  }}
                >
                  <select aria-label="Task project" value={creatorTaskProjectId} onChange={(event) => setCreatorTaskProjectId(event.target.value)}>
                    {entryProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <input aria-label="Task title" value={creatorTaskTitle} onChange={(event) => setCreatorTaskTitle(event.target.value)} placeholder="Add a task" />
                  <select aria-label="Task stage" value={creatorTaskStage} onChange={(event) => setCreatorTaskStage(event.target.value as CreatorTaskStage)}>
                    {CREATOR_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                  <button type="submit" className="creator-task-form__submit" disabled={creatorTaskSaving || !creatorTaskTitle.trim()} title="Create task" aria-label="Create task">
                    <Icon name="plus" size={14} />
                  </button>
                </form>
              ) : null}
              <div className="creator-task-filter" role="tablist" aria-label="Task filters">
                {([['active', '进行中'], ['completed', '已完成'], ['all', '全部']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={creatorTaskFilter === value} onClick={() => setCreatorTaskFilter(value)}>{label}</button>
                ))}
              </div>
              <ul className="creator-list">
                {visibleCreatorTasks.map((task) => {
                  const isEditable = task.id.startsWith('creator-task:');
                  const isEditing = creatorTaskEdit?.id === task.id;
                  const linkedContentCount = creatorContentProjectData.reduce(
                    (count, entry) => count + entry.data.contentProjects.filter((content) => content.taskIds.includes(task.id)).length,
                    0,
                  );
                  return (
                    <li key={task.id} className="creator-list__item">
                      <div className="creator-list__main">
                        <strong className="creator-list__title">{task.title}</strong>
                        {task.description ? (
                          <p className="creator-list__desc">{task.description}</p>
                        ) : null}
                        <div className="creator-list__chips">
                          <span className="creator-chip">{task.stageLabel}</span>
                          <span className="creator-chip">{task.statusLabel}</span>
                          <span className="creator-chip">{task.priorityLabel}</span>
                          {task.sourceLabel ? <span className="creator-chip">{task.sourceLabel}</span> : null}
                          {linkedContentCount > 0 ? <span className="creator-chip">{linkedContentCount} content</span> : null}
                      </div>
                      {task.status === 'blocked' && task.blockerNote ? (
                        <p className="creator-list__blocker">阻塞：{task.blockerNote}</p>
                      ) : null}
                      {isEditing ? (
                        <div className="creator-task-edit">
                          <input aria-label="Edit task title" value={creatorTaskEdit.title} onChange={(event) => setCreatorTaskEdit({ ...creatorTaskEdit, title: event.target.value })} />
                          <input aria-label="Edit task description" value={creatorTaskEdit.description} onChange={(event) => setCreatorTaskEdit({ ...creatorTaskEdit, description: event.target.value })} />
                          <select aria-label="Edit task stage" value={creatorTaskEdit.stage} onChange={(event) => setCreatorTaskEdit({ ...creatorTaskEdit, stage: event.target.value as CreatorTaskStage })}>{CREATOR_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
                          <select aria-label="Edit task status" value={creatorTaskEdit.status} onChange={(event) => setCreatorTaskEdit({ ...creatorTaskEdit, status: event.target.value as CreatorTaskStatus })}>{CREATOR_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                          <select aria-label="Edit task priority" value={creatorTaskEdit.priority} onChange={(event) => setCreatorTaskEdit({ ...creatorTaskEdit, priority: event.target.value as CreatorTaskPriority })}>{CREATOR_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                          {creatorTaskEdit.status === 'blocked' ? <input aria-label="Blocker reason" value={creatorTaskEdit.blockerNote} onChange={(event) => setCreatorTaskEdit({ ...creatorTaskEdit, blockerNote: event.target.value })} /> : null}
                          <div className="creator-task-media" role="group" aria-label="关联素材">
                            <strong className="creator-list__title">关联素材</strong>
                            {editingCreatorMedia?.failed ? (
                              <p className="creator-list__desc">素材索引暂不可用。</p>
                            ) : (
                              <>
                                {linkedCreatorMediaAssets.length > 0 ? (
                                  <ul className="creator-list">
                                    {linkedCreatorMediaAssets.map((asset) => (
                                      <li key={asset.id} className="creator-list__item">
                                        <div className="creator-list__main">
                                          <strong className="creator-list__title">{asset.fileName}</strong>
                                          <p className="creator-list__desc">{asset.relativePath}</p>
                                          <div className="creator-list__chips">
                                            <span className="creator-chip">{asset.kind}</span>
                                            <span className="creator-chip">{asset.availability === 'missing' ? 'Missing' : 'Available'}</span>
                                          </div>
                                        </div>
                                        <Button variant="ghost" className="creator-list__action" disabled={creatorTaskMediaSaving} aria-label={`移除素材 ${asset.fileName}`} onClick={() => void unlinkCreatorTaskMedia(asset.id)}>移除</Button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : <p className="creator-list__desc">暂无已关联素材。</p>}
                                {availableCreatorMediaAssets.length > 0 ? (
                                  <div className="creator-list__actions">
                                    <select aria-label="可关联素材" value={creatorTaskMediaAssetId} onChange={(event) => setCreatorTaskMediaAssetId(event.target.value)}>
                                      <option value="">选择可关联素材</option>
                                      {availableCreatorMediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}
                                    </select>
                                    <Button variant="ghost" className="creator-list__action" disabled={creatorTaskMediaSaving || !creatorTaskMediaAssetId} onClick={() => void linkCreatorTaskMedia()}>添加关联素材</Button>
                                  </div>
                                ) : <p className="creator-list__desc">暂无可关联素材。</p>}
                              </>
                            )}
                          </div>
                          <div className="creator-list__actions"><Button variant="ghost" className="creator-list__action" disabled={creatorTaskSaving} onClick={() => void saveCreatorTaskEdit()}>Save task</Button><Button variant="ghost" className="creator-list__action" disabled={creatorTaskSaving} onClick={() => { setCreatorTaskMediaAssetId(''); setCreatorTaskEdit(null); }}>Cancel task edit</Button></div>
                        </div>
                      ) : null}
                    </div>
                    <div className="creator-list__side">
                      <time className="creator-list__time" dateTime={task.updatedAt}>
                        {formatCreatorTimestamp(task.updatedAt)}
                      </time>
                      {task.projectId ? (
                        <div className="creator-list__actions">
                          {task.id.startsWith('creator-task:') && task.status !== 'done' ? (
                            <Button variant="ghost" className="creator-list__action" onClick={() => void advanceCreatorTask(task)}>
                              Advance
                            </Button>
                          ) : null}
                          {isEditable && task.status === 'done' ? <Button variant="ghost" className="creator-list__action" onClick={() => void restoreCreatorTask(task)}>恢复</Button> : null}
                          {isEditable ? <Button variant="ghost" className="creator-list__action" onClick={() => { setCreatorTaskMediaAssetId(''); setCreatorTaskEdit({ id: task.id, projectId: task.projectId, originalStatus: task.status, title: task.title, description: task.description ?? '', stage: task.stage as CreatorTaskStage, status: task.status as CreatorTaskStatus, priority: task.priority as CreatorTaskPriority, blockerNote: task.blockerNote ?? '' }); }}>Edit</Button> : null}
                          <Button variant="ghost" className="creator-list__action" onClick={() => openCreatorProject(task.projectId)}>
                            Open
                          </Button>
                        </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="creator-panel" aria-labelledby="creator-activity-title">
              <div className="creator-panel__head">
                <h3 id="creator-activity-title" className="creator-panel__title">Activity</h3>
                <span className="creator-panel__meta">Recent chain</span>
              </div>
              <ul className="creator-list">
                {creatorDashboard.activities.map((activity) => (
                  <li key={activity.id} className="creator-list__item">
                    <div className="creator-list__main">
                      <strong className="creator-list__title">{activity.title}</strong>
                      <p className="creator-list__desc">
                        {activity.summary || activity.categoryLabel}
                      </p>
                      <div className="creator-list__chips">
                        <span className="creator-chip">{activity.categoryLabel}</span>
                        {activity.triggerSourceLabel ? (
                          <span className="creator-chip">{activity.triggerSourceLabel}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="creator-list__side">
                      <time className="creator-list__time" dateTime={activity.occurredAt}>
                        {formatCreatorTimestamp(activity.occurredAt)}
                      </time>
                      {activity.projectId ? (
                        <Button
                          variant="ghost"
                          className="creator-list__action"
                          onClick={() => openCreatorProject(activity.projectId)}
                        >
                          Open
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="creator-panel" aria-labelledby="creator-workflows-title">
              <div className="creator-panel__head">
                <h3 id="creator-workflows-title" className="creator-panel__title">Workflows</h3>
                <span className="creator-panel__meta">Execution lanes</span>
              </div>
              <ul className="creator-list">
                {creatorDashboard.workflows.map((workflow) => (
                  <li key={workflow.id} className="creator-list__item">
                    <div className="creator-list__main">
                      <strong className="creator-list__title">{workflow.name}</strong>
                      {workflow.description ? (
                        <p className="creator-list__desc">{workflow.description}</p>
                      ) : null}
                      <div className="creator-list__chips">
                        <span className="creator-chip">{workflow.activeLabel}</span>
                        <span className="creator-chip">{workflow.stageCount} stages</span>
                        <span className="creator-chip">Default: {workflow.defaultStageLabel}</span>
                      </div>
                      <p className="creator-list__stages">{workflow.stageLabels.join(' / ')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="creator-panel" aria-labelledby="creator-media-title">
              <div className="creator-panel__head">
                <h3 id="creator-media-title" className="creator-panel__title">Creator Media</h3>
                <span className="creator-panel__meta">Read-only index</span>
              </div>
              {selectedCreatorMedia?.failed ? (
                <p className="creator-list__desc">Media unavailable for this project.</p>
              ) : selectedCreatorMedia && selectedCreatorMedia.data.assets.length > 0 ? (
                <ul className="creator-list">
                  {selectedCreatorMedia.data.assets.map((asset) => (
                    <li key={asset.id} className="creator-list__item">
                      <div className="creator-list__main">
                        <strong className="creator-list__title">{asset.fileName}</strong>
                        <p className="creator-list__desc">{asset.relativePath}</p>
                        <div className="creator-list__chips">
                          <span className="creator-chip">{asset.kind}</span>
                          <span className="creator-chip">{asset.availability === 'missing' ? 'Missing' : 'Available'}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="creator-list__desc">No indexed media for this project.</p>
              )}
            </section>
          </div>

          <section className="creator-panel creator-content-panel" aria-labelledby="creator-content-title">
            <div className="creator-panel__head">
              <div>
                <h3 id="creator-content-title" className="creator-panel__title">Content</h3>
                <span className="creator-panel__meta">Brief, outline, storyboard, and retrospective</span>
              </div>
            </div>
            {entryProjects.length === 0 ? <p className="creator-list__desc">Create a project before adding content.</p> : (
              <div className="creator-content-layout">
                <div className="creator-content-sidebar">
                  <div className="creator-content-create">
                    <select aria-label="Content project" value={creatorContentProjectId} onChange={(event) => setCreatorContentProjectId(event.target.value)}>
                      {entryProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    <input aria-label="Content title" value={creatorContentTitle} onChange={(event) => setCreatorContentTitle(event.target.value)} placeholder="New content title" />
                    <Button variant="ghost" className="creator-list__action" disabled={creatorContentSaving || !creatorContentTitle.trim()} onClick={() => void createCreatorContent()}>Create content</Button>
                  </div>
                  {selectedCreatorContent?.failed ? <p className="creator-list__desc">Content unavailable for this project.</p> : (
                    <ul className="creator-list">
                      {selectedCreatorContent?.data.contentProjects.map((content) => {
                        const contentMediaEntry = creatorMediaProjectData.find((entry) => entry.projectId === content.projectId);
                        const missingMediaCount = contentMediaEntry && !contentMediaEntry.failed
                          ? content.storyboardItems.reduce(
                            (count, item) => count + item.mediaAssetIds.filter((id) => {
                              const asset = contentMediaEntry.data.assets.find((candidate) => candidate.id === id);
                              return asset !== undefined && asset.availability === 'missing';
                            }).length,
                            0,
                          )
                          : 0;
                        return (
                        <li key={content.id} className="creator-list__item">
                          <div className="creator-list__main">
                            <strong className="creator-list__title">{content.title}</strong>
                            <div className="creator-list__chips"><span className="creator-chip">{content.status}</span><span className="creator-chip">{content.storyboardItems.length} shots</span><span className="creator-chip">{content.taskIds.length} tasks</span>{missingMediaCount > 0 ? <span className="creator-chip">{missingMediaCount} missing asset{missingMediaCount === 1 ? '' : 's'}</span> : null}</div>
                          </div>
                          <div className="creator-list__actions">
                            <Button variant="ghost" className="creator-list__action" aria-label={`Edit content ${content.title}`} onClick={() => setCreatorContentEdit(content)}>Edit</Button>
                            <Button variant="ghost" className="creator-list__action" aria-label={`Delete content ${content.title}`} disabled={creatorContentSaving} onClick={() => void deleteCreatorContent(content)}>Delete</Button>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {creatorContentEdit ? (
                  <div className="creator-content-editor">
                    <div className="creator-content-fields creator-content-fields--top">
                      <label>Title<input aria-label="Edit content title" value={creatorContentEdit.title} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, title: event.target.value }))} /></label>
                      <label>Status<select aria-label="Content status" value={creatorContentEdit.status} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, status: event.target.value as CreatorContentStatus }))}>{(['idea', 'drafting', 'production', 'published', 'archived'] as CreatorContentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                    </div>
                    <div className="creator-content-fields">
                      <fieldset><legend>Brief</legend><label>Topic<input aria-label="Brief topic" value={creatorContentEdit.brief.topic ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, brief: { ...content.brief, topic: event.target.value } }))} /></label><label>Audience<input aria-label="Brief audience" value={creatorContentEdit.brief.audience ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, brief: { ...content.brief, audience: event.target.value } }))} /></label><label>Core message<textarea aria-label="Brief core message" value={creatorContentEdit.brief.coreMessage ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, brief: { ...content.brief, coreMessage: event.target.value } }))} /></label><label>Platform<input aria-label="Brief target platform" value={creatorContentEdit.brief.targetPlatform ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, brief: { ...content.brief, targetPlatform: event.target.value } }))} /></label></fieldset>
                      <fieldset><legend>Outline</legend><label>Opening<textarea aria-label="Outline opening" value={creatorContentEdit.outline.opening ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, outline: { ...content.outline, opening: event.target.value } }))} /></label><label>Sections<textarea aria-label="Outline sections" value={creatorContentEdit.outline.sections ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, outline: { ...content.outline, sections: event.target.value } }))} /></label><label>Ending<textarea aria-label="Outline ending" value={creatorContentEdit.outline.ending ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, outline: { ...content.outline, ending: event.target.value } }))} /></label><label>Editing intent<textarea aria-label="Outline editing intent" value={creatorContentEdit.outline.editingIntent ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, outline: { ...content.outline, editingIntent: event.target.value } }))} /></label></fieldset>
                    </div>
                    <fieldset className="creator-content-storyboard"><legend>Storyboard</legend><Button variant="ghost" className="creator-list__action" onClick={() => updateCreatorContentEdit((content) => ({ ...content, storyboardItems: [...content.storyboardItems, { id: `temporary-storyboard:${Date.now()}-${content.storyboardItems.length}`, position: Math.max(0, ...content.storyboardItems.map((item) => item.position)) + 1, purpose: '', mediaAssetIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }))}>Add storyboard item</Button><ul className="creator-list">{creatorContentEdit.storyboardItems.slice().sort((left, right) => left.position - right.position).map((item) => { const linkedAssets = editingCreatorContentMedia?.data.assets.filter((asset) => item.mediaAssetIds.includes(asset.id)) ?? []; const candidates = editingCreatorContentMedia?.data.assets.filter((asset) => asset.availability === 'available' && !item.mediaAssetIds.includes(asset.id)) ?? []; return <li key={item.id} className="creator-list__item"><div className="creator-list__main"><label>Purpose<input aria-label="Storyboard purpose" value={item.purpose} onChange={(event) => updateStoryboardItem(item.id, (current) => ({ ...current, purpose: event.target.value }))} /></label><label>Visual<textarea aria-label="Storyboard visual description" value={item.visualDescription ?? ''} onChange={(event) => updateStoryboardItem(item.id, (current) => ({ ...current, visualDescription: event.target.value }))} /></label><label>Audio<textarea aria-label="Storyboard audio notes" value={item.audioNotes ?? ''} onChange={(event) => updateStoryboardItem(item.id, (current) => ({ ...current, audioNotes: event.target.value }))} /></label>{linkedAssets.map((asset) => <div key={asset.id} className="creator-list__chips"><span className="creator-chip">{asset.fileName}</span><span className="creator-chip">{asset.relativePath}</span><span className="creator-chip">{asset.availability === 'missing' ? 'Missing' : 'Available'}</span><Button variant="ghost" className="creator-list__action" aria-label={`Remove storyboard media ${asset.fileName}`} disabled={creatorContentSaving || item.id.startsWith('temporary-storyboard:')} onClick={() => void unlinkCreatorStoryboardMedia(item.id, asset.id)}>Remove</Button></div>)}</div>{editingCreatorContentMedia?.failed ? <p className="creator-list__desc">Media unavailable for this project.</p> : candidates.length > 0 ? <div className="creator-list__actions"><select aria-label="Storyboard media candidate" value={creatorStoryboardMediaAssetId} onChange={(event) => setCreatorStoryboardMediaAssetId(event.target.value)}><option value="">Select media</option>{candidates.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}</select><Button variant="ghost" className="creator-list__action" disabled={creatorContentSaving || !creatorStoryboardMediaAssetId || item.id.startsWith('temporary-storyboard:')} onClick={() => void linkCreatorStoryboardMedia(item.id)}>Add media</Button></div> : null}</li>; })}</ul></fieldset>
                    <div className="creator-content-fields"><fieldset><legend>Retrospective</legend><label>Published at<input aria-label="Retrospective published at" value={creatorContentEdit.retrospective.publishedAt ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, retrospective: { ...content.retrospective, publishedAt: event.target.value } }))} /></label><label>Performance<textarea aria-label="Retrospective performance summary" value={creatorContentEdit.retrospective.performanceSummary ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, retrospective: { ...content.retrospective, performanceSummary: event.target.value } }))} /></label><label>Learnings<textarea aria-label="Retrospective learnings" value={creatorContentEdit.retrospective.learnings ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, retrospective: { ...content.retrospective, learnings: event.target.value } }))} /></label><label>Next action<textarea aria-label="Retrospective next action" value={creatorContentEdit.retrospective.nextAction ?? ''} onChange={(event) => updateCreatorContentEdit((content) => ({ ...content, retrospective: { ...content.retrospective, nextAction: event.target.value } }))} /></label></fieldset><fieldset><legend>Tasks</legend>{creatorContentEdit.taskIds.map((taskId) => { const task = editingCreatorContentTasks.find((candidate) => candidate.id === taskId); return <div key={taskId} className="creator-list__chips"><span className="creator-chip">{task?.title ?? taskId}</span><Button variant="ghost" className="creator-list__action" disabled={creatorContentSaving} onClick={() => void unlinkCreatorContentTask(taskId)}>Remove</Button></div>; })}{editingCreatorContentTasks.filter((task) => !creatorContentEdit.taskIds.includes(task.id)).length > 0 ? <div className="creator-list__actions"><select aria-label="Content task candidate" value={creatorContentTaskId} onChange={(event) => setCreatorContentTaskId(event.target.value)}><option value="">Select task</option>{editingCreatorContentTasks.filter((task) => !creatorContentEdit.taskIds.includes(task.id)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><Button variant="ghost" className="creator-list__action" disabled={creatorContentSaving || !creatorContentTaskId} onClick={() => void linkCreatorContentTask()}>Add task</Button></div> : <p className="creator-list__desc">No tasks available to link.</p>}</fieldset></div>
                    <div className="creator-list__actions"><Button variant="primary" className="creator-list__action" disabled={creatorContentSaving || !creatorContentEdit.title.trim()} onClick={() => void saveCreatorContent()}>Save content</Button><Button variant="ghost" className="creator-list__action" disabled={creatorContentSaving} onClick={() => { setCreatorContentTaskId(''); setCreatorStoryboardMediaAssetId(''); setCreatorContentEdit(null); }}>Cancel content edit</Button></div>
                  </div>
                ) : <p className="creator-list__desc">Select content to edit its chain.</p>}
              </div>
            )}
          </section>

          <section className="creator-panel creator-release-panel" aria-labelledby="creator-release-title">
            <div className="creator-panel__head">
              <div>
                <h3 id="creator-release-title" className="creator-panel__title">Release</h3>
                <span className="creator-panel__meta">Manual publish packages</span>
              </div>
            </div>
            {entryProjects.length === 0 ? <p className="creator-list__desc">Create a project before adding releases.</p> : (
              <div className="creator-release-layout">
                <div className="creator-release-sidebar">
                  <div className="creator-release-create">
                    <select aria-label="Release project" value={creatorReleaseProjectId} onChange={(event) => onReleaseProjectChange(event.target.value)}>
                      {entryProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    <select aria-label="Release content" value={creatorReleaseContentId} onChange={(event) => setCreatorReleaseContentId(event.target.value)}>
                      <option value="">Select content…</option>
                      {selectedReleaseContent && !selectedReleaseContent.failed ? selectedReleaseContent.data.contentProjects.map((content) => <option key={content.id} value={content.id}>{content.title}</option>) : null}
                    </select>
                    <select aria-label="Release platform" value={creatorReleasePlatform} onChange={(event) => setCreatorReleasePlatform(event.target.value as CreatorReleasePlatform)}>
                      {(['bilibili', 'youtube', 'xiaohongshu', 'other'] as CreatorReleasePlatform[]).map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                    </select>
                    <input aria-label="Release title" value={creatorReleaseTitle} onChange={(event) => setCreatorReleaseTitle(event.target.value)} placeholder="New release title" />
                    <Button variant="ghost" className="creator-list__action" disabled={creatorReleaseSaving || !creatorReleaseContentId || !creatorReleaseTitle.trim()} onClick={() => void createCreatorRelease()}>Create release</Button>
                  </div>
                  {selectedReleaseContent?.failed ? <p className="creator-list__desc">Content unavailable for this project.</p> : selectedReleaseContent && selectedReleaseContent.data.contentProjects.length === 0 ? <p className="creator-list__desc">Add content before creating a release.</p> : null}
                  {selectedCreatorRelease?.failed ? <p className="creator-list__desc">Release unavailable for this project.</p> : (
                    <ul className="creator-list">
                      {selectedCreatorRelease?.data.releasePackages.map((release) => {
                        const missingReleaseAssets = selectedReleaseMedia && !selectedReleaseMedia.failed
                          ? [release.coverAssetId, release.exportAssetId].filter((assetId) => {
                            if (!assetId) return false;
                            const asset = selectedReleaseMedia.data.assets.find((candidate) => candidate.id === assetId);
                            return asset !== undefined && asset.availability === 'missing';
                          }).length
                          : 0;
                        const contentEntry = selectedReleaseContent?.data.contentProjects.find((candidate) => candidate.id === release.contentId);
                        const checkedCount = Object.values(release.checklist).filter(Boolean).length;
                        return (
                          <li key={release.id} className="creator-list__item">
                            <div className="creator-list__main">
                              <strong className="creator-list__title">{release.title}</strong>
                              <div className="creator-list__chips">
                                <span className="creator-chip">{release.platform}</span>
                                <span className="creator-chip">{release.status}</span>
                                <span className="creator-chip">{contentEntry ? contentEntry.title : release.contentId}</span>
                                <span className="creator-chip">{checkedCount}/5 checked</span>
                                {release.scheduledAt ? <span className="creator-chip">{release.scheduledAt}</span> : null}
                                {missingReleaseAssets > 0 ? <span className="creator-chip">{missingReleaseAssets} missing asset{missingReleaseAssets === 1 ? '' : 's'}</span> : null}
                              </div>
                            </div>
                            <div className="creator-list__actions">
                              <Button variant="ghost" className="creator-list__action" aria-label={`Edit release ${release.title}`} onClick={() => { setCreatorReleaseEdit(release); setCreatorReleaseTagsInput(release.tags.join(', ')); }}>Edit</Button>
                              <Button variant="ghost" className="creator-list__action" aria-label={`Delete release ${release.title}`} disabled={creatorReleaseSaving} onClick={() => void deleteCreatorRelease(release)}>Delete</Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {creatorReleaseEdit ? (() => {
                  const currentCover = currentReleaseAsset(creatorReleaseEdit.coverAssetId, selectedReleaseMedia);
                  const currentExport = currentReleaseAsset(creatorReleaseEdit.exportAssetId, selectedReleaseMedia);
                  return (
                  <div className="creator-release-editor">
                    <div className="creator-content-fields creator-content-fields--top">
                      <label>Title<input aria-label="Edit release title" value={creatorReleaseEdit.title} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, title: event.target.value }))} /></label>
                      <label>Platform<select aria-label="Edit release platform" value={creatorReleaseEdit.platform} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, platform: event.target.value as CreatorReleasePlatform }))}>{(['bilibili', 'youtube', 'xiaohongshu', 'other'] as CreatorReleasePlatform[]).map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
                      <label>Status<select aria-label="Edit release status" value={creatorReleaseEdit.status} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, status: event.target.value as CreatorReleaseStatus }))}>{(['draft', 'ready', 'published', 'archived'] as CreatorReleaseStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                    </div>
                    <div className="creator-content-fields">
                      <label>Description<textarea aria-label="Edit release description" value={creatorReleaseEdit.description} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, description: event.target.value }))} /></label>
                      <label>Tags (comma separated)<input aria-label="Edit release tags" value={creatorReleaseTagsInput} onChange={(event) => setCreatorReleaseTagsInput(event.target.value)} /></label>
                      <label>Cover asset<select aria-label="Edit release cover asset" value={creatorReleaseEdit.coverAssetId ?? ''} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, coverAssetId: event.target.value || '' }))}>{releaseAssetOptions(creatorReleaseEdit.coverAssetId, selectedReleaseMedia)}</select></label>
                      {currentCover ? (
                        <div className="creator-list__chips">
                          <span className="creator-chip">{currentCover.fileName}</span>
                          {currentCover.relativePath ? <span className="creator-chip">{currentCover.relativePath}</span> : null}
                          <span className="creator-chip">{currentCover.availability === 'missing' ? 'Missing' : currentCover.availability === 'available' ? 'Available' : 'Unavailable'}</span>
                        </div>
                      ) : null}
                      <label>Export asset<select aria-label="Edit release export asset" value={creatorReleaseEdit.exportAssetId ?? ''} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, exportAssetId: event.target.value || '' }))}>{releaseAssetOptions(creatorReleaseEdit.exportAssetId, selectedReleaseMedia)}</select></label>
                      {currentExport ? (
                        <div className="creator-list__chips">
                          <span className="creator-chip">{currentExport.fileName}</span>
                          {currentExport.relativePath ? <span className="creator-chip">{currentExport.relativePath}</span> : null}
                          <span className="creator-chip">{currentExport.availability === 'missing' ? 'Missing' : currentExport.availability === 'available' ? 'Available' : 'Unavailable'}</span>
                        </div>
                      ) : null}
                      <label>Scheduled at<input aria-label="Edit release scheduled at" type="datetime-local" value={isoToLocalInput(creatorReleaseEdit.scheduledAt)} onChange={(event) => { try { updateCreatorReleaseEdit((release) => ({ ...release, scheduledAt: localInputToIso(event.target.value) })); } catch { /* 保留输入 */ } }} /></label>
                      <label>Published at<input aria-label="Edit release published at" type="datetime-local" value={isoToLocalInput(creatorReleaseEdit.publishedAt)} onChange={(event) => { try { updateCreatorReleaseEdit((release) => ({ ...release, publishedAt: localInputToIso(event.target.value) })); } catch { /* 保留输入 */ } }} /></label>
                      <label>Published URL<input aria-label="Edit release published url" value={creatorReleaseEdit.publishedUrl ?? ''} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, publishedUrl: event.target.value }))} /></label>
                    </div>
                    <fieldset className="creator-content-storyboard"><legend>Checklist</legend>
                      {(['contentComplete', 'exportConfirmed', 'coverConfirmed', 'metadataConfirmed', 'platformConfirmed'] as (keyof CreatorReleaseChecklist)[]).map((key) => (
                        <label key={key} className="creator-check">
                          <input type="checkbox" aria-label={`Release checklist ${key}`} checked={creatorReleaseEdit.checklist[key]} onChange={(event) => updateCreatorReleaseEdit((release) => ({ ...release, checklist: { ...release.checklist, [key]: event.target.checked } }))} />
                          {key}
                        </label>
                      ))}
                    </fieldset>
                    <div className="creator-list__actions">
                      <Button variant="primary" className="creator-list__action" disabled={creatorReleaseSaving || !creatorReleaseEdit.title.trim()} onClick={() => void saveCreatorRelease()}>Save release</Button>
                      <Button variant="ghost" className="creator-list__action" disabled={creatorReleaseSaving} onClick={() => setCreatorReleaseEdit(null)}>Cancel release edit</Button>
                      <Button variant="ghost" className="creator-list__action" disabled={creatorReleaseSaving} onClick={() => void downloadReleaseJson(creatorReleaseEdit)}>Download JSON</Button>
                      <Button variant="ghost" className="creator-list__action" disabled={creatorReleaseSaving} onClick={() => void downloadReleaseMarkdown(creatorReleaseEdit)}>Download Markdown</Button>
                    </div>
                  </div>
                  );
                })() : <p className="creator-list__desc">Select a release to edit its package.</p>}
              </div>
            )}
          </section>
        </section>
      ) : null}
      {surface === 'automations' ? (
        <>
      <section className="automations-saved" aria-label={t('automations.yourAutomations')}>
        <div className="automations-section-head">
          <h2 className="automations-section__label">{t('automations.yourAutomations')}</h2>
          {loading ? <span className="automations-section__meta">{t('automations.loading')}</span> : null}
        </div>
        {!loading && sortedRoutines.length === 0 ? (
          <button
            type="button"
            className="automation-empty"
            onClick={() => {
              fireClick('new_automation');
              setModal({ kind: 'create' });
            }}
          >
            <span className="automation-empty__icon">
              <Icon name="plus" size={16} />
            </span>
            <span className="automation-empty__body">
              <strong>{t('automations.emptyTitle')}</strong>
              <span>{t('automations.emptyBody')}</span>
            </span>
          </button>
        ) : null}
        {sortedRoutines.length > 0 ? (
          <ul className="automations-saved__list">
            {sortedRoutines.map((r) => {
              const isBusy = busyId === r.id;
              const targetLabel =
                r.target.mode === 'reuse'
                  ? projectsById.get(r.target.projectId) ?? r.target.projectId
                  : t('automations.targetNewEachRun');
              const isExpanded = expandedId === r.id;
              return (
                <li
                  key={r.id}
                  ref={(node) => {
                    routineRowRefs.current[r.id] = node;
                  }}
                  data-testid={`automation-row-${r.id}`}
                  className={`automation-row${r.enabled ? '' : ' is-paused'}${focusRoutineId === r.id ? ' is-focused' : ''}`}
                >
                  <div className="automation-row__main">
                    <span className="automation-row__icon">
                      <Icon name={r.skillId ? 'sparkles' : 'history'} size={15} />
                    </span>
                    <span className="automation-row__content">
                      <span className="automation-row__title">{r.name}</span>
                      <span className="automation-row__meta">
                        <span>{scheduleStatusLabel(r, t)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{targetLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{nextRunLabel(r, t)}</span>
                      </span>
                      {r.prompt ? (
                        <span className="automation-row__prompt">{r.prompt}</span>
                      ) : null}
                      {r.lastRun ? (
                        <span className="automation-row__last-run">
                          <StatusPill status={r.lastRun.status} t={t} />
                          <span>{t('automations.lastRun', { time: formatAutomationTimestamp(r.lastRun.startedAt) })}</span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            className="automation-inline-link"
                            onClick={() => {
                              fireClick('open_artifact');
                              navigate({
                                kind: 'project',
                                projectId: r.lastRun!.projectId,
                                conversationId: r.lastRun!.conversationId,
                                fileName: null,
                              });
                            }}
                          >
                            {t('automations.openResult')}
                          </button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        fireClick('run_now');
                        runNow(r.id);
                      }}
                      disabled={isBusy}
                      title={t('automations.runNowTitle')}
                    >
                      <Icon name="play" size={12} />
                      <span>{t('automations.run')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        fireClick('history');
                        setExpandedId(isExpanded ? null : r.id);
                        if (!isExpanded) setHistoryTick((tick) => tick + 1);
                      }}
                      aria-expanded={isExpanded}
                    >
                      <Icon name="history" size={12} />
                      <span>{isExpanded ? t('automations.hideHistory') : t('automations.history')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        fireClick('edit');
                        setModal({ kind: 'edit', routine: r });
                      }}
                      disabled={isBusy}
                    >
                      <Icon name="edit" size={12} />
                      <span>{t('automations.edit')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        fireClick(r.enabled ? 'pause' : 'resume');
                        togglePaused(r);
                      }}
                      disabled={isBusy}
                    >
                      {r.enabled ? t('automations.pause') : t('automations.resume')}
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => {
                        fireClick('delete');
                        remove(r.id);
                      }}
                      disabled={isBusy}
                      aria-label={t('automations.deleteAria')}
                      title={t('automations.deleteTitle')}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  {isExpanded ? (
                    <AutomationRunHistory
                      routineId={r.id}
                      refreshKey={historyTick}
                      crystallizingRunId={crystallizingRunId}
                      onCrystallizeRun={crystallizeRun}
                      onFireClick={fireClick}
                      t={t}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {proposals.length > 0 ? (
        <section className="automations-saved" aria-label={t('automations.proposalsAria')}>
          <div className="automations-section-head">
            <div>
              <h2 className="automations-section__label">{t('automations.proposalsTitle')}</h2>
              <p className="automations-section__sub">
                {t('automations.proposalsSub')}
              </p>
            </div>
            <span className="automations-section__meta">{t('automations.proposalsPending', { n: proposals.length })}</span>
          </div>
          <ul className="automations-saved__list">
            {proposals.map((proposal) => {
              const isBusy = proposalBusyId === proposal.id;
              return (
                <li key={proposal.id} className="automation-row">
                  <div className="automation-row__main">
                    <span className="automation-row__icon">
                      <Icon
                        name={proposal.targetKind === 'design-system' ? 'sliders' : 'sparkles'}
                        size={15}
                      />
                    </span>
                    <span className="automation-row__content">
                      <span className="automation-row__title">{proposal.title}</span>
                      <span className="automation-row__meta">
                        <span>{proposalTargetLabel(proposal.targetKind, t)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proposalActionLabel(proposal.action, t)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proposal.reviewPolicy}</span>
                      </span>
                      <span className="automation-row__prompt">{proposal.summary}</span>
                      {proposal.patch.diffSummary ? (
                        <span className="automation-row__last-run">
                          {proposal.patch.diffSummary}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        fireClick('proposal_apply');
                        reviewProposal(proposal.id, 'apply');
                      }}
                      disabled={isBusy}
                    >
                      <Icon name="check" size={12} />
                      <span>{t('automations.apply')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => {
                        fireClick('proposal_reject');
                        reviewProposal(proposal.id, 'reject');
                      }}
                      disabled={isBusy}
                    >
                      {t('automations.reject')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="automations-templates" aria-label={t('automations.templatesAria')}>
        <div className="automations-templates__head">
          <div className="automations-templates__head-copy">
            <h2 className="automations-section__label">{t('automations.templatesTitle')}</h2>
            <p className="automations-section__sub">
              {t('automations.templatesSub')}
            </p>
          </div>
          <span className="automations-section__meta">
            {t('automations.templatesCount', { filtered: filteredTemplates.length, total: templates.length })}
          </span>
        </div>
        <div
          className="automations-template-tabs"
          role="tablist"
          aria-label={t('automations.templateFiltersAria')}
        >
          {templateFilters(t).map((filter) => {
            const count = filterTemplates(templates, filter.id).length;
            const isActive = templateFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`automations-template-tab${isActive ? ' is-active' : ''}`}
                onClick={() => {
                  fireClick('filter_tab', { filter_id: filter.id });
                  setTemplateFilter(filter.id);
                }}
              >
                <span className="automations-template-tab__label">{filter.label}</span>
                <span className="automations-template-tab__count">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="automations-templates__empty" role="status">
            <span className="automations-templates__empty-icon" aria-hidden="true">
              <Icon name="sparkles" size={16} />
            </span>
            <div>
              <strong>{t('automations.templatesEmptyTitle')}</strong>
              <p>{t('automations.templatesEmptyBody')}</p>
            </div>
          </div>
        ) : null}
        <div className="automations-templates__grid" key={templateFilter}>
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`automation-template-card is-${template.kind}`}
              onClick={() => {
                fireClick('type_card', { template_kind: template.kind });
                setModal({ kind: 'create', template });
              }}
            >
              <span className="automation-template-card__icon" aria-hidden="true">
                <Icon name={template.icon} size={16} />
              </span>
              <span className="automation-template-card__body">
                <span className="automation-template-card__kicker">
                  <Icon name={kindIcon(template.kind)} size={11} />
                  {kindLabel(template.kind, t)}
                </span>
                <span className="automation-template-card__title">{template.title}</span>
                <span className="automation-template-card__desc">{template.description}</span>
                <span className="automation-template-card__cta">
                  {t('automations.useTemplate')}
                  <Icon name="chevron-right" size={12} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <NewAutomationModal
        open={modal !== null}
        initial={
          modal?.kind === 'edit'
            ? { routine: modal.routine }
            : modal?.kind === 'create' && modal.template
              ? { template: modal.template }
              : null
        }
        templates={templates}
        projects={projectSummaries}
        skills={skills}
        connectors={connectors}
        onClose={() => setModal(null)}
        onSaved={(routine) => {
          void (async () => {
            await refresh();
            setExpandedId(routine.id);
            setFocusRoutineId(routine.id);
          })();
        }}
      />
        </>
      ) : null}
    </section>
  );
}

export function sortRoutinesNewestFirst(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="automations-metric">
      <span className="automations-metric__value">{value}</span>
      <span className="automations-metric__label">{label}</span>
    </div>
  );
}

function formatCreatorTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function AutomationRunHistory({
  routineId,
  refreshKey,
  crystallizingRunId,
  onCrystallizeRun,
  onFireClick,
  t,
}: {
  routineId: string;
  refreshKey: number;
  crystallizingRunId: string | null;
  onCrystallizeRun: (routineId: string, runId: string) => void;
  onFireClick: (element: AutomationsClickProps['element']) => void;
  t: TranslateFn;
}) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    void (async () => {
      try {
        const res = await fetch(`/api/routines/${routineId}/runs?limit=10`);
        if (!res.ok) throw new Error(`runs: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setRuns(json.runs ?? []);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, routineId]);

  if (runs === null) {
    return <div className="automation-history automation-history--empty">{t('automations.runHistoryLoading')}</div>;
  }

  if (runs.length === 0) {
    return <div className="automation-history automation-history--empty">{t('automations.runHistoryEmpty')}</div>;
  }

  return (
    <div className="automation-history" aria-label={t('automations.runHistoryAria')}>
      <div className="automation-history__head">
        <span>{t('automations.runHistoryTitle')}</span>
        <span>{t('automations.runHistoryLatest')}</span>
      </div>
      <ul className="automation-history__list">
        {runs.map((run) => (
          <li key={run.id} className="automation-history__row">
            <div className="automation-history__status">
              <StatusPill status={run.status} t={t} />
              <span>{run.trigger}</span>
            </div>
            <div className="automation-history__meta">
              <span>{formatAutomationTimestamp(run.startedAt)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRunDuration(run, t)}</span>
              <span aria-hidden="true">·</span>
              <span>{run.agentRunId}</span>
            </div>
            {run.summary || run.error ? (
              <div className={`automation-history__message${run.error ? ' is-error' : ''}`}>
                {run.error ?? run.summary}
              </div>
            ) : null}
            <div className="automation-history__actions">
              {run.status === 'succeeded' ? (
                <button
                  type="button"
                  className="automation-history__open"
                  onClick={() => {
                    onFireClick('crystallize');
                    onCrystallizeRun(routineId, run.id);
                  }}
                  disabled={crystallizingRunId === run.id}
                  title={t('automations.crystallizeTitle')}
                >
                  <Icon name="sparkles" size={12} />
                  <span>{crystallizingRunId === run.id ? t('automations.crystallizing') : t('automations.crystallize')}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="automation-history__open"
                onClick={() => {
                  onFireClick('view_progress');
                  navigate({
                    kind: 'project',
                    projectId: run.projectId,
                    conversationId: run.conversationId,
                    fileName: null,
                  });
                }}
              >
                {t('automations.openConversation')}
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
