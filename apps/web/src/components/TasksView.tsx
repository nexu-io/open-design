// Automations tab: one surface for scheduled routines, Orbit-style digests,
// and live artifact refreshers. The daemon still stores these as routines;
// the UI presents them as scheduled agent conversations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type TranslateFn = ReturnType<typeof useT>;
import { useAnalytics } from '../analytics/provider';
import { trackAutomationsClick, trackPageView } from '../analytics/events';
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

type Modal =
  | { kind: 'create'; template?: AutomationTemplate }
  | { kind: 'edit'; routine: Routine }
  | null;

interface Props {
  projects?: ProjectSummary[];
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

export function TasksView({ skills = [], designTemplates = [], connectors = [] }: Props) {
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [automationCatalog, setAutomationCatalog] = useState<ContractAutomationTemplate[]>([]);
  const [proposals, setProposals] = useState<AutomationEvolutionProposal[]>([]);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [crystallizingRunId, setCrystallizingRunId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusRoutineId, setFocusRoutineId] = useState<string | null>(null);
  const routineRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [historyTick, setHistoryTick] = useState(0);

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
      const [rRes, pRes, tJson, proposalJson] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
        templateRequest,
        proposalRequest,
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProjects(
          (pJson.projects ?? []).map((p: ProjectSummary) => ({
            id: p.id,
            name: p.name,
          })),
        );
      }
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

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

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

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
        projects={projects}
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
