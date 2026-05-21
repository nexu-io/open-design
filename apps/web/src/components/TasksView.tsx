// Automations tab: one surface for scheduled routines, Orbit-style digests,
// and live artifact refreshers. The daemon still stores these as routines;
// the UI presents them as scheduled agent conversations.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AutomationContentPacket,
  AutomationEvolutionProposal,
  AutomationEvolutionProposalListResponse,
  AutomationSourceIngestionResponse,
  AutomationSourceKind,
  AutomationSourcePacketListResponse,
  AutomationTemplate as ContractAutomationTemplate,
  AutomationTemplateListResponse,
  AutomationTokenCompressionMode,
  ConnectorDetail,
  Routine,
  RoutineRun,
  RoutineRunCrystallizeResponse,
} from '@open-design/contracts';

import { Icon, type IconName } from './Icon';
import { navigate } from '../router';
import type { SkillSummary } from '../types';
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

const STATIC_TEMPLATES: ReadonlyArray<AutomationTemplate> = [
  {
    id: 'memory-refresh',
    category: 'memory',
    kind: 'routine',
    icon: 'sparkles',
    title: 'Refresh project memory from recent work.',
    description: 'Turns repeated decisions, preferences, and feedback into reusable memory updates.',
    defaultName: 'Memory refresh',
    prompt:
      'Review recent chats, PR comments, design feedback, and project changes. Extract durable preferences, repeated decisions, and workflow lessons. Propose concise memory updates with source links and separate one-off notes from reusable guidance.',
  },
  {
    id: 'design-system-refresh',
    category: 'design-system',
    kind: 'routine',
    icon: 'sliders',
    title: 'Update design systems from shipped artifacts.',
    description: 'Finds reusable tokens, components, and rules across recent design work.',
    defaultName: 'Design system maintainer',
    prompt:
      'Inspect recent generated artifacts, review feedback, and accepted revisions. Identify patterns that should become design-system tokens, component rules, examples, or anti-patterns. Draft precise updates to DESIGN.md and call out anything that needs human approval.',
  },
  {
    id: 'live-artifact-registry',
    category: 'live-artifact',
    kind: 'routine',
    icon: 'file-code',
    title: 'Audit live artifacts and refresh stale versions.',
    description: 'Keeps persistent dashboards, reports, and previews current instead of duplicating them.',
    defaultName: 'Live artifact maintainer',
    prompt:
      'List live artifacts for this project, find stale or failed refreshes, and update the highest-value artifact in place. Preserve artifact ids, summarize what changed, and flag artifacts that need connector access or human review.',
  },
  {
    id: 'orbit-dashboard',
    category: 'orbit',
    kind: 'routine',
    icon: 'orbit',
    title: 'Build a connector activity dashboard.',
    description: 'Aggregates selected connectors into an Orbit-style live dashboard.',
    defaultName: 'Connector activity dashboard',
    prompt:
      'Use the selected connectors to build or refresh a live dashboard of recent activity. Group by people, projects, decisions, risks, and follow-ups. Prefer connected read-only tools, cite sources, and keep the dashboard refreshable.',
  },
  {
    id: 'release-notes',
    category: 'release',
    kind: 'routine',
    icon: 'present',
    title: 'Draft release notes from shipped design work.',
    description: 'Connects merged PRs, artifacts, and product-facing changes into release notes.',
    defaultName: 'Weekly release notes',
    prompt:
      "Draft user-facing release notes covering merged PRs, updated artifacts, and design-system changes from the last 7 days. Group by 'New', 'Improved', and 'Fixed'. Include links when available and keep the copy user-readable.",
  },
  {
    id: 'quality-regression-watch',
    category: 'quality',
    kind: 'routine',
    icon: 'bell',
    title: 'Watch for design and implementation regressions.',
    description: 'Compares recent changes against benchmarks, traces, and accepted references.',
    defaultName: 'Regression watch',
    prompt:
      'Compare recent project changes against accepted artifacts, design-system rules, benchmarks, and traces. Flag regressions in behavior, layout, accessibility, or product intent. Suggest the smallest fix and cite the evidence.',
  },
];

const FALLBACK_ORBIT_TEMPLATE: AutomationTemplate = {
  id: 'orbit-daily',
  category: 'orbit',
  kind: 'orbit',
  icon: 'orbit',
  title: 'Daily connector digest.',
  description: 'Refreshes a connector activity digest on a schedule.',
  defaultName: 'Daily connector digest',
  prompt:
    'Survey every connected integration and produce a daily digest of what changed in the last 24 hours. Group the result by people, projects, decisions, and follow-ups. Save the output as a live artifact named `daily_digest.md` and update it in place on each run.',
};

const FALLBACK_LIVE_TEMPLATE: AutomationTemplate = {
  id: 'live-status-board',
  category: 'live-artifact',
  kind: 'live-artifact',
  icon: 'file-code',
  title: 'Keep a live status artifact fresh.',
  description: 'Updates one persistent artifact instead of creating a new report each run.',
  defaultName: 'Live status board',
  prompt:
    "Maintain a single live artifact named `status_board.md`. On each run, update the sections for 'In flight', 'Shipped this week', 'Risks', and 'Decisions made'. Edit in place so the artifact stays stable.",
};

const TEMPLATE_FILTERS: ReadonlyArray<{ id: TemplateFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'live-artifact', label: 'Live artifacts' },
  { id: 'memory', label: 'Memory' },
  { id: 'design-system', label: 'Design systems' },
  { id: 'skills', label: 'Skills' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'compression', label: 'Compression' },
  { id: 'release', label: 'Release' },
  { id: 'quality', label: 'Quality' },
];

const SOURCE_KIND_OPTIONS: ReadonlyArray<{ id: AutomationSourceKind; label: string }> = [
  { id: 'connector', label: 'Connector' },
  { id: 'url', label: 'URL' },
  { id: 'repo', label: 'Repo' },
  { id: 'artifact', label: 'Artifact' },
  { id: 'chat', label: 'Chat' },
  { id: 'upload', label: 'Upload' },
];

const COMPRESSION_OPTIONS: ReadonlyArray<{ id: AutomationTokenCompressionMode; label: string }> = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'off', label: 'Off' },
];

type SourceIngestionForm = {
  templateId: string;
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  title: string;
  bodyMarkdown: string;
  connectorId: string;
  tokenCompression: AutomationTokenCompressionMode;
};

const DEFAULT_SOURCE_FORM: SourceIngestionForm = {
  templateId: 'ingest-source-memory-tree',
  sourceKind: 'connector',
  sourceRef: '',
  title: '',
  bodyMarkdown: '',
  connectorId: '',
  tokenCompression: 'balanced',
};

function scheduleStatusLabel(routine: Routine): string {
  if (!routine.enabled) return 'Paused';
  return describeScheduleSummary(routine.schedule);
}

function nextRunLabel(routine: Routine): string {
  if (!routine.enabled) return 'Manual only';
  if (!routine.nextRunAt) return 'Scheduled';
  const date = new Date(routine.nextRunAt);
  return `Next ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function formatAutomationTimestamp(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRunDuration(run: RoutineRun): string {
  if (!run.completedAt) return 'In progress';
  const seconds = Math.max(1, Math.round((run.completedAt - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function statusLabel(status: RoutineRun['status']): string {
  if (status === 'succeeded') return 'Succeeded';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Running';
  if (status === 'queued') return 'Queued';
  return 'Canceled';
}

function StatusPill({ status }: { status: RoutineRun['status'] }) {
  return <span className={`automation-status is-${status}`}>{statusLabel(status)}</span>;
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
): AutomationTemplate[] {
  const orbit = designTemplates
    .filter((skill) => skill.scenario === 'orbit')
    .map((skill) => templateFromSkill(skill, 'orbit'));
  const live = designTemplates
    .filter((skill) => skill.scenario === 'live')
    .map((skill) => templateFromSkill(skill, 'live-artifact'));

  return dedupeTemplates([
    ...automationCatalog.map(templateFromAutomationCatalog),
    ...(orbit.length > 0 ? orbit : [FALLBACK_ORBIT_TEMPLATE]),
    ...(live.length > 0 ? live : [FALLBACK_LIVE_TEMPLATE]),
    ...STATIC_TEMPLATES,
  ]);
}

function filterTemplates(templates: AutomationTemplate[], filter: TemplateFilter) {
  if (filter === 'all') return templates;
  if (filter === 'orbit' || filter === 'live-artifact') {
    return templates.filter((template) => template.kind === filter);
  }
  return templates.filter((template) => template.category === filter);
}

function kindLabel(kind: AutomationTemplateKind): string {
  if (kind === 'orbit') return 'Orbit';
  if (kind === 'live-artifact') return 'Live artifact';
  return 'Automation';
}

function kindIcon(kind: AutomationTemplateKind): IconName {
  if (kind === 'orbit') return 'orbit';
  if (kind === 'live-artifact') return 'file-code';
  return 'history';
}

function proposalTargetLabel(target: AutomationEvolutionProposal['targetKind']): string {
  if (target === 'memory-node') return 'Memory';
  if (target === 'design-system') return 'Design system';
  if (target === 'skill') return 'Skill';
  return 'Automation template';
}

function proposalActionLabel(action: AutomationEvolutionProposal['action']): string {
  if (action === 'create') return 'Create';
  if (action === 'update') return 'Update';
  if (action === 'merge') return 'Merge';
  if (action === 'move') return 'Move';
  if (action === 'delete') return 'Delete';
  return 'Promote';
}

export function TasksView({ skills = [], designTemplates = [], connectors = [] }: Props) {
  const analytics = useAnalytics();
  // P2 page_view page_name=automations. Ref-keyed so re-renders don't
  // double-fire while the user is on the page.
  const pageViewFiredRef = useState<{ fired: boolean }>(() => ({ fired: false }))[0];
  useEffect(() => {
    if (pageViewFiredRef.fired) return;
    pageViewFiredRef.fired = true;
    trackPageView(analytics.track, { page_name: 'automations' });
  }, [analytics.track, pageViewFiredRef]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [automationCatalog, setAutomationCatalog] = useState<ContractAutomationTemplate[]>([]);
  const [proposals, setProposals] = useState<AutomationEvolutionProposal[]>([]);
  const [sourcePackets, setSourcePackets] = useState<AutomationContentPacket[]>([]);
  const [sourceForm, setSourceForm] = useState<SourceIngestionForm>(DEFAULT_SOURCE_FORM);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [ingestingSource, setIngestingSource] = useState(false);
  const [crystallizingRunId, setCrystallizingRunId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const templates = useMemo(
    () => buildAutomationTemplates(designTemplates, automationCatalog),
    [automationCatalog, designTemplates],
  );
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, templateFilter),
    [templates, templateFilter],
  );

  const refresh = useCallback(async () => {
    try {
      const templateRequest = fetch('/api/automation-templates')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationTemplateListResponse;
        })
        .catch(() => null);
      const proposalRequest = fetch('/api/automation-proposals?status=pending-review')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationEvolutionProposalListResponse;
        })
        .catch(() => null);
      const sourcePacketRequest = fetch('/api/automation-source-packets?limit=3')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationSourcePacketListResponse;
        })
        .catch(() => null);
      const [rRes, pRes, tJson, proposalJson, sourcePacketJson] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
        templateRequest,
        proposalRequest,
        sourcePacketRequest,
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
      if (sourcePacketJson) {
        setSourcePackets(Array.isArray(sourcePacketJson.packets) ? sourcePacketJson.packets : []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
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
    () => [...routines].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [routines],
  );

  const activeCount = sortedRoutines.filter((routine) => routine.enabled).length;
  const pausedCount = sortedRoutines.length - activeCount;
  const sourceIngestionTemplates = useMemo(
    () =>
      automationCatalog.filter((template) =>
        template.stages.some((stage) => stage.kind === 'ingest' || stage.kind === 'propose'),
      ),
    [automationCatalog],
  );

  const patchSourceForm = (patch: Partial<SourceIngestionForm>) => {
    setSourceForm((current) => ({ ...current, ...patch }));
  };

  const submitSourceIngestion = async () => {
    if (!sourceForm.bodyMarkdown.trim()) {
      setError('Paste source content before ingesting it.');
      return;
    }
    setIngestingSource(true);
    setError(null);
    try {
      const res = await fetch('/api/automation-ingestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId: sourceForm.templateId || undefined,
          sourceKind: sourceForm.sourceKind,
          sourceRef: sourceForm.sourceRef || undefined,
          title: sourceForm.title || undefined,
          bodyMarkdown: sourceForm.bodyMarkdown,
          connectorId:
            sourceForm.sourceKind === 'connector' && sourceForm.connectorId
              ? sourceForm.connectorId
              : undefined,
          tokenCompression: sourceForm.tokenCompression,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `ingestion failed: ${res.status}`);
      }
      const json = (await res.json()) as AutomationSourceIngestionResponse;
      setSourcePackets((current) => [json.packet, ...current].slice(0, 3));
      setSourceForm((current) => ({
        ...current,
        title: '',
        sourceRef: '',
        bodyMarkdown: '',
      }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIngestingSource(false);
    }
  };

  const reviewProposal = async (id: string, action: 'apply' | 'reject') => {
    setProposalBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/automation-proposals/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ reason: 'Dismissed in Automations' }) : '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${action} failed: ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
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
      setSourcePackets((current) => [json.packet, ...current].slice(0, 3));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this automation? Past runs and their projects are kept.'))
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="automations-view" aria-labelledby="automations-title" data-testid="tasks-view">
      <header className="automations-hero">
        <div className="automations-hero__copy">
          <span className="automations-hero__eyebrow">Scheduled agent sessions</span>
          <h1 id="automations-title" className="automations-hero__title">
            Automations
          </h1>
          <p className="automations-hero__lede">
            Plan recurring conversations for project work, Orbit digests, and live artifacts.
          </p>
        </div>
        <div className="automations-hero__actions">
          <div className="automations-metrics" aria-label="Automation summary">
            <Metric label="Active" value={activeCount} />
            <Metric label="Paused" value={pausedCount} />
            <Metric label="Templates" value={templates.length} />
          </div>
          <button
            type="button"
            className="automations-view__new"
            onClick={() => setModal({ kind: 'create' })}
            data-testid="automations-new"
          >
            <Icon name="plus" size={14} />
            <span>New automation</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="automations-saved" aria-label="Your automations">
        <div className="automations-section-head">
          <h2 className="automations-section__label">Your automations</h2>
          {loading ? <span className="automations-section__meta">Loading</span> : null}
        </div>
        {!loading && sortedRoutines.length === 0 ? (
          <button
            type="button"
            className="automation-empty"
            onClick={() => setModal({ kind: 'create' })}
          >
            <span className="automation-empty__icon">
              <Icon name="plus" size={16} />
            </span>
            <span className="automation-empty__body">
              <strong>No automations yet</strong>
              <span>Create one from a template or start with a blank schedule.</span>
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
                  : 'New project each run';
              const isExpanded = expandedId === r.id;
              return (
                <li
                  key={r.id}
                  className={`automation-row${r.enabled ? '' : ' is-paused'}`}
                >
                  <div className="automation-row__main">
                    <span className="automation-row__icon">
                      <Icon name={r.skillId ? 'sparkles' : 'history'} size={15} />
                    </span>
                    <span className="automation-row__content">
                      <span className="automation-row__title">{r.name}</span>
                      <span className="automation-row__meta">
                        <span>{scheduleStatusLabel(r)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{targetLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{nextRunLabel(r)}</span>
                      </span>
                      {r.prompt ? (
                        <span className="automation-row__prompt">{r.prompt}</span>
                      ) : null}
                      {r.lastRun ? (
                        <span className="automation-row__last-run">
                          <StatusPill status={r.lastRun.status} />
                          <span>Last run {formatAutomationTimestamp(r.lastRun.startedAt)}</span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            className="automation-inline-link"
                            onClick={() =>
                              navigate({
                                kind: 'project',
                                projectId: r.lastRun!.projectId,
                                conversationId: r.lastRun!.conversationId,
                                fileName: null,
                              })
                            }
                          >
                            Open result
                          </button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => runNow(r.id)}
                      disabled={isBusy}
                      title="Run now and open the conversation"
                    >
                      <Icon name="play" size={12} />
                      <span>Run</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        setExpandedId(isExpanded ? null : r.id);
                        if (!isExpanded) setHistoryTick((tick) => tick + 1);
                      }}
                      aria-expanded={isExpanded}
                    >
                      <Icon name="history" size={12} />
                      <span>{isExpanded ? 'Hide history' : 'History'}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => setModal({ kind: 'edit', routine: r })}
                      disabled={isBusy}
                    >
                      <Icon name="edit" size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => togglePaused(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      aria-label="Delete automation"
                      title="Delete this automation"
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
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {proposals.length > 0 ? (
        <section className="automations-saved" aria-label="Automation evolution proposals">
          <div className="automations-section-head">
            <div>
              <h2 className="automations-section__label">Evolution proposals</h2>
              <p className="automations-section__sub">
                Review automation output before it changes memory, skills, or design systems.
              </p>
            </div>
            <span className="automations-section__meta">{proposals.length} pending</span>
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
                        <span>{proposalTargetLabel(proposal.targetKind)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proposalActionLabel(proposal.action)}</span>
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
                      onClick={() => reviewProposal(proposal.id, 'apply')}
                      disabled={isBusy}
                    >
                      <Icon name="check" size={12} />
                      <span>Apply</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => reviewProposal(proposal.id, 'reject')}
                      disabled={isBusy}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="automations-ingest" aria-label="Source ingestion">
        <div className="automations-section-head">
          <div>
            <h2 className="automations-section__label">Ingest source</h2>
            <p className="automations-section__sub">
              Turn connector, repo, artifact, or chat context into reviewable evolution proposals.
            </p>
          </div>
          <span className="automations-section__meta">{sourcePackets.length} recent</span>
        </div>
        <div className="automation-ingest-panel">
          <div className="automation-ingest-controls">
            <label className="automation-ingest-field">
              <span>Template</span>
              <select
                value={sourceForm.templateId}
                onChange={(event) => patchSourceForm({ templateId: event.currentTarget.value })}
              >
                {sourceIngestionTemplates.length === 0 ? (
                  <option value={sourceForm.templateId}>{sourceForm.templateId}</option>
                ) : null}
                {sourceIngestionTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="automation-ingest-field">
              <span>Source</span>
              <select
                value={sourceForm.sourceKind}
                onChange={(event) =>
                  patchSourceForm({ sourceKind: event.currentTarget.value as AutomationSourceKind })
                }
              >
                {SOURCE_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="automation-ingest-field">
              <span>Compression</span>
              <select
                value={sourceForm.tokenCompression}
                onChange={(event) =>
                  patchSourceForm({
                    tokenCompression: event.currentTarget.value as AutomationTokenCompressionMode,
                  })
                }
              >
                {COMPRESSION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {sourceForm.sourceKind === 'connector' ? (
              <label className="automation-ingest-field">
                <span>Connector</span>
                <select
                  value={sourceForm.connectorId}
                  onChange={(event) => patchSourceForm({ connectorId: event.currentTarget.value })}
                >
                  <option value="">Any connected source</option>
                  {connectors.map((connector) => (
                    <option key={connector.id} value={connector.id}>
                      {connector.name}
                      {connector.accountLabel ? ` · ${connector.accountLabel}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="automation-ingest-fields">
            <label className="automation-ingest-field">
              <span>Title</span>
              <input
                value={sourceForm.title}
                onChange={(event) => patchSourceForm({ title: event.currentTarget.value })}
                placeholder="Decision, brand notes, workflow pattern..."
              />
            </label>
            <label className="automation-ingest-field">
              <span>Source ref</span>
              <input
                value={sourceForm.sourceRef}
                onChange={(event) => patchSourceForm({ sourceRef: event.currentTarget.value })}
                placeholder="URL, repo path, connector event id, artifact id..."
              />
            </label>
          </div>
          <label className="automation-ingest-field automation-ingest-field--body">
            <span>Content</span>
            <textarea
              value={sourceForm.bodyMarkdown}
              onChange={(event) => patchSourceForm({ bodyMarkdown: event.currentTarget.value })}
              placeholder="Paste the content to canonicalize into a source packet and proposals."
            />
          </label>
          <div className="automation-ingest-footer">
            {sourcePackets.length > 0 ? (
              <ul className="automation-ingest-recent" aria-label="Recent source packets">
                {sourcePackets.map((packet) => (
                  <li key={packet.id}>
                    <span>{packet.title}</span>
                    <small>
                      {packet.sourceKind} · {packet.tokenStats.originalTokens} tokens
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="automation-ingest-empty">No source packets yet.</span>
            )}
            <button
              type="button"
              className="automations-view__new"
              onClick={submitSourceIngestion}
              disabled={ingestingSource}
            >
              <Icon name="sparkles" size={14} />
              <span>{ingestingSource ? 'Ingesting' : 'Ingest'}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="automations-templates" aria-label="Automation templates">
        <div className="automations-templates__head">
          <div className="automations-templates__head-copy">
            <h2 className="automations-section__label">Templates</h2>
            <p className="automations-section__sub">
              Orbit and live artifacts are templates inside the same automation flow.
            </p>
          </div>
          <span className="automations-section__meta">
            {filteredTemplates.length} of {templates.length}
          </span>
        </div>
        <div
          className="automations-template-tabs"
          role="tablist"
          aria-label="Template filters"
        >
          {TEMPLATE_FILTERS.map((filter) => {
            const count = filterTemplates(templates, filter.id).length;
            const isActive = templateFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`automations-template-tab${isActive ? ' is-active' : ''}`}
                onClick={() => setTemplateFilter(filter.id)}
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
              <strong>No templates in this category yet.</strong>
              <p>Try a different filter, or start from a blank automation.</p>
            </div>
          </div>
        ) : null}
        <div className="automations-templates__grid">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`automation-template-card is-${template.kind}`}
              onClick={() => setModal({ kind: 'create', template })}
            >
              <span className="automation-template-card__icon" aria-hidden="true">
                <Icon name={template.icon} size={16} />
              </span>
              <span className="automation-template-card__body">
                <span className="automation-template-card__kicker">
                  <Icon name={kindIcon(template.kind)} size={11} />
                  {kindLabel(template.kind)}
                </span>
                <span className="automation-template-card__title">{template.title}</span>
                <span className="automation-template-card__desc">{template.description}</span>
                <span className="automation-template-card__cta">
                  Use template
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
        onSaved={() => {
          void refresh();
        }}
      />
    </section>
  );
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
}: {
  routineId: string;
  refreshKey: number;
  crystallizingRunId: string | null;
  onCrystallizeRun: (routineId: string, runId: string) => void;
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
    return <div className="automation-history automation-history--empty">Loading run history...</div>;
  }

  if (runs.length === 0) {
    return <div className="automation-history automation-history--empty">No runs yet.</div>;
  }

  return (
    <div className="automation-history" aria-label="Automation run history">
      <div className="automation-history__head">
        <span>Run history</span>
        <span>Latest 10</span>
      </div>
      <ul className="automation-history__list">
        {runs.map((run) => (
          <li key={run.id} className="automation-history__row">
            <div className="automation-history__status">
              <StatusPill status={run.status} />
              <span>{run.trigger}</span>
            </div>
            <div className="automation-history__meta">
              <span>{formatAutomationTimestamp(run.startedAt)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRunDuration(run)}</span>
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
                  onClick={() => onCrystallizeRun(routineId, run.id)}
                  disabled={crystallizingRunId === run.id}
                  title="Draft skill and memory proposals from this run"
                >
                  <Icon name="sparkles" size={12} />
                  <span>{crystallizingRunId === run.id ? 'Crystallizing' : 'Crystallize'}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="automation-history__open"
                onClick={() =>
                  navigate({
                    kind: 'project',
                    projectId: run.projectId,
                    conversationId: run.conversationId,
                    fileName: null,
                  })
                }
              >
                Open conversation
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
