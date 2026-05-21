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
  useScheduleSummary,
  type AutomationTemplate,
  type AutomationTemplateKind,
} from './NewAutomationModal';
import { useI18n } from '../i18n';
import type { Dict } from '../i18n/types';

type DictKey = keyof Dict;
type TFn = (key: DictKey, vars?: Record<string, string | number>) => string;

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

type StaticTemplateMeta = Omit<AutomationTemplate, 'title' | 'description' | 'defaultName'> & {
  titleKey: DictKey;
  descriptionKey: DictKey;
  defaultNameKey: DictKey;
};

const STATIC_TEMPLATE_META: ReadonlyArray<StaticTemplateMeta> = [
  {
    id: 'memory-refresh',
    category: 'memory',
    kind: 'routine',
    icon: 'sparkles',
    titleKey: 'automations.static.memoryRefresh.title',
    descriptionKey: 'automations.static.memoryRefresh.description',
    defaultNameKey: 'automations.static.memoryRefresh.defaultName',
    prompt:
      'Review recent chats, PR comments, design feedback, and project changes. Extract durable preferences, repeated decisions, and workflow lessons. Propose concise memory updates with source links and separate one-off notes from reusable guidance.',
  },
  {
    id: 'design-system-refresh',
    category: 'design-system',
    kind: 'routine',
    icon: 'sliders',
    titleKey: 'automations.static.designSystemRefresh.title',
    descriptionKey: 'automations.static.designSystemRefresh.description',
    defaultNameKey: 'automations.static.designSystemRefresh.defaultName',
    prompt:
      'Inspect recent generated artifacts, review feedback, and accepted revisions. Identify patterns that should become design-system tokens, component rules, examples, or anti-patterns. Draft precise updates to DESIGN.md and call out anything that needs human approval.',
  },
  {
    id: 'live-artifact-registry',
    category: 'live-artifact',
    kind: 'routine',
    icon: 'file-code',
    titleKey: 'automations.static.liveArtifactRegistry.title',
    descriptionKey: 'automations.static.liveArtifactRegistry.description',
    defaultNameKey: 'automations.static.liveArtifactRegistry.defaultName',
    prompt:
      'List live artifacts for this project, find stale or failed refreshes, and update the highest-value artifact in place. Preserve artifact ids, summarize what changed, and flag artifacts that need connector access or human review.',
  },
  {
    id: 'orbit-dashboard',
    category: 'orbit',
    kind: 'routine',
    icon: 'orbit',
    titleKey: 'automations.static.orbitDashboard.title',
    descriptionKey: 'automations.static.orbitDashboard.description',
    defaultNameKey: 'automations.static.orbitDashboard.defaultName',
    prompt:
      'Use the selected connectors to build or refresh a live dashboard of recent activity. Group by people, projects, decisions, risks, and follow-ups. Prefer connected read-only tools, cite sources, and keep the dashboard refreshable.',
  },
  {
    id: 'release-notes',
    category: 'release',
    kind: 'routine',
    icon: 'present',
    titleKey: 'automations.static.releaseNotes.title',
    descriptionKey: 'automations.static.releaseNotes.description',
    defaultNameKey: 'automations.static.releaseNotes.defaultName',
    prompt:
      "Draft user-facing release notes covering merged PRs, updated artifacts, and design-system changes from the last 7 days. Group by 'New', 'Improved', and 'Fixed'. Include links when available and keep the copy user-readable.",
  },
  {
    id: 'quality-regression-watch',
    category: 'quality',
    kind: 'routine',
    icon: 'bell',
    titleKey: 'automations.static.qualityRegressionWatch.title',
    descriptionKey: 'automations.static.qualityRegressionWatch.description',
    defaultNameKey: 'automations.static.qualityRegressionWatch.defaultName',
    prompt:
      'Compare recent project changes against accepted artifacts, design-system rules, benchmarks, and traces. Flag regressions in behavior, layout, accessibility, or product intent. Suggest the smallest fix and cite the evidence.',
  },
];

const FALLBACK_ORBIT_TEMPLATE_META: StaticTemplateMeta = {
  id: 'orbit-daily',
  category: 'orbit',
  kind: 'orbit',
  icon: 'orbit',
  titleKey: 'automations.fallback.orbitDaily.title',
  descriptionKey: 'automations.fallback.orbitDaily.description',
  defaultNameKey: 'automations.fallback.orbitDaily.defaultName',
  prompt:
    'Survey every connected integration and produce a daily digest of what changed in the last 24 hours. Group the result by people, projects, decisions, and follow-ups. Save the output as a live artifact named `daily_digest.md` and update it in place on each run.',
};

const FALLBACK_LIVE_TEMPLATE_META: StaticTemplateMeta = {
  id: 'live-status-board',
  category: 'live-artifact',
  kind: 'live-artifact',
  icon: 'file-code',
  titleKey: 'automations.fallback.liveStatusBoard.title',
  descriptionKey: 'automations.fallback.liveStatusBoard.description',
  defaultNameKey: 'automations.fallback.liveStatusBoard.defaultName',
  prompt:
    "Maintain a single live artifact named `status_board.md`. On each run, update the sections for 'In flight', 'Shipped this week', 'Risks', and 'Decisions made'. Edit in place so the artifact stays stable.",
};

function materializeStaticTemplate(meta: StaticTemplateMeta, t: TFn): AutomationTemplate {
  return {
    id: meta.id,
    category: meta.category,
    kind: meta.kind,
    icon: meta.icon,
    title: t(meta.titleKey),
    description: t(meta.descriptionKey),
    defaultName: t(meta.defaultNameKey),
    prompt: meta.prompt,
    skillId: meta.skillId ?? null,
  };
}

const TEMPLATE_FILTERS: ReadonlyArray<{ id: TemplateFilter; labelKey: DictKey }> = [
  { id: 'all', labelKey: 'automations.templates.filter.all' },
  { id: 'orbit', labelKey: 'automations.templates.filter.orbit' },
  { id: 'live-artifact', labelKey: 'automations.templates.filter.liveArtifact' },
  { id: 'memory', labelKey: 'automations.templates.filter.memory' },
  { id: 'design-system', labelKey: 'automations.templates.filter.designSystem' },
  { id: 'skills', labelKey: 'automations.templates.filter.skills' },
  { id: 'connectors', labelKey: 'automations.templates.filter.connectors' },
  { id: 'compression', labelKey: 'automations.templates.filter.compression' },
  { id: 'release', labelKey: 'automations.templates.filter.release' },
  { id: 'quality', labelKey: 'automations.templates.filter.quality' },
];

const SOURCE_KIND_OPTIONS: ReadonlyArray<{ id: AutomationSourceKind; labelKey: DictKey }> = [
  { id: 'connector', labelKey: 'automations.source.connector' },
  { id: 'url', labelKey: 'automations.source.url' },
  { id: 'repo', labelKey: 'automations.source.repo' },
  { id: 'artifact', labelKey: 'automations.source.artifact' },
  { id: 'chat', labelKey: 'automations.source.chat' },
  { id: 'upload', labelKey: 'automations.source.upload' },
];

const COMPRESSION_OPTIONS: ReadonlyArray<{ id: AutomationTokenCompressionMode; labelKey: DictKey }> = [
  { id: 'balanced', labelKey: 'automations.compression.balanced' },
  { id: 'aggressive', labelKey: 'automations.compression.aggressive' },
  { id: 'off', labelKey: 'automations.compression.off' },
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

function useScheduleStatusLabel(): (routine: Routine) => string {
  const t = useI18n().t;
  const describe = useScheduleSummary();
  return useCallback(
    (routine: Routine) => {
      if (!routine.enabled) return t('automations.schedule.paused');
      return describe(routine.schedule);
    },
    [describe, t],
  );
}

function useNextRunLabel(): (routine: Routine) => string {
  const { t, locale } = useI18n();
  return useCallback(
    (routine: Routine) => {
      if (!routine.enabled) return t('automations.schedule.manualOnly');
      if (!routine.nextRunAt) return t('automations.schedule.scheduled');
      const time = new Date(routine.nextRunAt).toLocaleString(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      return t('automations.schedule.next', { time });
    },
    [locale, t],
  );
}

function useFormatAutomationTimestamp(): (ts: number | null | undefined) => string {
  const { locale } = useI18n();
  return useCallback(
    (ts: number | null | undefined) => {
      if (!ts) return '—';
      return new Date(ts).toLocaleString(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    },
    [locale],
  );
}

function useFormatRunDuration(): (run: RoutineRun) => string {
  const t = useI18n().t;
  return useCallback(
    (run: RoutineRun) => {
      if (!run.completedAt) return t('automations.history.durationInProgress');
      const seconds = Math.max(1, Math.round((run.completedAt - run.startedAt) / 1000));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
    },
    [t],
  );
}

function statusLabel(status: RoutineRun['status'], t: TFn): string {
  if (status === 'succeeded') return t('automations.status.succeeded');
  if (status === 'failed') return t('automations.status.failed');
  if (status === 'running') return t('automations.status.running');
  if (status === 'queued') return t('automations.status.queued');
  return t('automations.status.canceled');
}

function StatusPill({ status, t }: { status: RoutineRun['status']; t: TFn }) {
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

function buildAutomationTemplates(
  designTemplates: SkillSummary[],
  automationCatalog: ContractAutomationTemplate[],
  t: TFn,
): AutomationTemplate[] {
  const orbit = designTemplates
    .filter((skill) => skill.scenario === 'orbit')
    .map((skill) => templateFromSkill(skill, 'orbit'));
  const live = designTemplates
    .filter((skill) => skill.scenario === 'live')
    .map((skill) => templateFromSkill(skill, 'live-artifact'));

  return dedupeTemplates([
    ...automationCatalog.map(templateFromAutomationCatalog),
    ...(orbit.length > 0 ? orbit : [materializeStaticTemplate(FALLBACK_ORBIT_TEMPLATE_META, t)]),
    ...(live.length > 0 ? live : [materializeStaticTemplate(FALLBACK_LIVE_TEMPLATE_META, t)]),
    ...STATIC_TEMPLATE_META.map((meta) => materializeStaticTemplate(meta, t)),
  ]);
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

function filterTemplates(templates: AutomationTemplate[], filter: TemplateFilter) {
  if (filter === 'all') return templates;
  if (filter === 'orbit' || filter === 'live-artifact') {
    return templates.filter((template) => template.kind === filter);
  }
  return templates.filter((template) => template.category === filter);
}

function kindLabel(kind: AutomationTemplateKind, t: TFn): string {
  if (kind === 'orbit') return t('automations.templates.kind.orbit');
  if (kind === 'live-artifact') return t('automations.templates.kind.liveArtifact');
  return t('automations.templates.kind.automation');
}

function kindIcon(kind: AutomationTemplateKind): IconName {
  if (kind === 'orbit') return 'orbit';
  if (kind === 'live-artifact') return 'file-code';
  return 'history';
}

function proposalTargetLabel(target: AutomationEvolutionProposal['targetKind'], t: TFn): string {
  if (target === 'memory-node') return t('automations.proposals.target.memory');
  if (target === 'design-system') return t('automations.proposals.target.designSystem');
  if (target === 'skill') return t('automations.proposals.target.skill');
  return t('automations.proposals.target.template');
}

function proposalActionLabel(action: AutomationEvolutionProposal['action'], t: TFn): string {
  if (action === 'create') return t('automations.proposals.action.create');
  if (action === 'update') return t('automations.proposals.action.update');
  if (action === 'merge') return t('automations.proposals.action.merge');
  if (action === 'move') return t('automations.proposals.action.move');
  if (action === 'delete') return t('automations.proposals.action.delete');
  return t('automations.proposals.action.promote');
}

export function TasksView({ skills = [], designTemplates = [], connectors = [] }: Props) {
  const { t } = useI18n();
  const scheduleStatusLabel = useScheduleStatusLabel();
  const nextRunLabel = useNextRunLabel();
  const formatAutomationTimestamp = useFormatAutomationTimestamp();
  const formatRunDuration = useFormatRunDuration();
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
    () => buildAutomationTemplates(designTemplates, automationCatalog, t),
    [automationCatalog, designTemplates, t],
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

  const activeCount = routines.filter((routine) => routine.enabled).length;
  const pausedCount = routines.length - activeCount;
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
      setError(t('automations.ingest.error.empty'));
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
        body: action === 'reject' ? JSON.stringify({ reason: t('automations.proposals.rejectReason') }) : '{}',
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
    if (!window.confirm(t('automations.row.deleteConfirm')))
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
          <span className="automations-hero__eyebrow">{t('automations.eyebrow')}</span>
          <h1 id="automations-title" className="automations-hero__title">
            {t('automations.title')}
          </h1>
          <p className="automations-hero__lede">
            {t('automations.lede')}
          </p>
        </div>
        <div className="automations-hero__actions">
          <div className="automations-metrics" aria-label={t('automations.metricsAria')}>
            <Metric label={t('automations.metric.active')} value={activeCount} />
            <Metric label={t('automations.metric.paused')} value={pausedCount} />
            <Metric label={t('automations.metric.templates')} value={templates.length} />
          </div>
          <button
            type="button"
            className="automations-view__new"
            onClick={() => setModal({ kind: 'create' })}
            data-testid="automations-new"
          >
            <Icon name="plus" size={14} />
            <span>{t('automations.new')}</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="automations-saved" aria-label={t('automations.yours.aria')}>
        <div className="automations-section-head">
          <h2 className="automations-section__label">{t('automations.yours.title')}</h2>
          {loading ? <span className="automations-section__meta">{t('automations.yours.loading')}</span> : null}
        </div>
        {!loading && routines.length === 0 ? (
          <button
            type="button"
            className="automation-empty"
            onClick={() => setModal({ kind: 'create' })}
          >
            <span className="automation-empty__icon">
              <Icon name="plus" size={16} />
            </span>
            <span className="automation-empty__body">
              <strong>{t('automations.empty.title')}</strong>
              <span>{t('automations.empty.body')}</span>
            </span>
          </button>
        ) : null}
        {routines.length > 0 ? (
          <ul className="automations-saved__list">
            {routines.map((r) => {
              const isBusy = busyId === r.id;
              const targetLabel =
                r.target.mode === 'reuse'
                  ? projectsById.get(r.target.projectId) ?? r.target.projectId
                  : t('automations.row.targetNew');
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
                          <StatusPill status={r.lastRun.status} t={t} />
                          <span>{t('automations.row.lastRun', { time: formatAutomationTimestamp(r.lastRun.startedAt) })}</span>
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
                            {t('automations.row.openResult')}
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
                      title={t('automations.row.runTitle')}
                    >
                      <Icon name="play" size={12} />
                      <span>{t('automations.row.run')}</span>
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
                      <span>{isExpanded ? t('automations.row.hideHistory') : t('automations.row.history')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => setModal({ kind: 'edit', routine: r })}
                      disabled={isBusy}
                    >
                      <Icon name="edit" size={12} />
                      <span>{t('automations.row.edit')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => togglePaused(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? t('automations.row.pause') : t('automations.row.resume')}
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      aria-label={t('automations.row.delete')}
                      title={t('automations.row.deleteTitle')}
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
                      t={t}
                      formatAutomationTimestamp={formatAutomationTimestamp}
                      formatRunDuration={formatRunDuration}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {proposals.length > 0 ? (
        <section className="automations-saved" aria-label={t('automations.proposals.aria')}>
          <div className="automations-section-head">
            <div>
              <h2 className="automations-section__label">{t('automations.proposals.title')}</h2>
              <p className="automations-section__sub">
                {t('automations.proposals.sub')}
              </p>
            </div>
            <span className="automations-section__meta">{t('automations.proposals.pending', { n: proposals.length })}</span>
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
                      onClick={() => reviewProposal(proposal.id, 'apply')}
                      disabled={isBusy}
                    >
                      <Icon name="check" size={12} />
                      <span>{t('automations.proposals.apply')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => reviewProposal(proposal.id, 'reject')}
                      disabled={isBusy}
                    >
                      {t('automations.proposals.reject')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="automations-ingest" aria-label={t('automations.ingest.aria')}>
        <div className="automations-section-head">
          <div>
            <h2 className="automations-section__label">{t('automations.ingest.title')}</h2>
            <p className="automations-section__sub">
              {t('automations.ingest.sub')}
            </p>
          </div>
          <span className="automations-section__meta">{t('automations.ingest.recent', { n: sourcePackets.length })}</span>
        </div>
        <div className="automation-ingest-panel">
          <div className="automation-ingest-controls">
            <label className="automation-ingest-field">
              <span>{t('automations.ingest.field.template')}</span>
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
              <span>{t('automations.ingest.field.source')}</span>
              <select
                value={sourceForm.sourceKind}
                onChange={(event) =>
                  patchSourceForm({ sourceKind: event.currentTarget.value as AutomationSourceKind })
                }
              >
                {SOURCE_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="automation-ingest-field">
              <span>{t('automations.ingest.field.compression')}</span>
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
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {sourceForm.sourceKind === 'connector' ? (
              <label className="automation-ingest-field">
                <span>{t('automations.ingest.field.connector')}</span>
                <select
                  value={sourceForm.connectorId}
                  onChange={(event) => patchSourceForm({ connectorId: event.currentTarget.value })}
                >
                  <option value="">{t('automations.ingest.anyConnector')}</option>
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
              <span>{t('automations.ingest.field.title')}</span>
              <input
                value={sourceForm.title}
                onChange={(event) => patchSourceForm({ title: event.currentTarget.value })}
                placeholder={t('automations.ingest.placeholderTitle')}
              />
            </label>
            <label className="automation-ingest-field">
              <span>{t('automations.ingest.field.sourceRef')}</span>
              <input
                value={sourceForm.sourceRef}
                onChange={(event) => patchSourceForm({ sourceRef: event.currentTarget.value })}
                placeholder={t('automations.ingest.placeholderSourceRef')}
              />
            </label>
          </div>
          <label className="automation-ingest-field automation-ingest-field--body">
            <span>{t('automations.ingest.field.content')}</span>
            <textarea
              value={sourceForm.bodyMarkdown}
              onChange={(event) => patchSourceForm({ bodyMarkdown: event.currentTarget.value })}
              placeholder={t('automations.ingest.placeholderContent')}
            />
          </label>
          <div className="automation-ingest-footer">
            {sourcePackets.length > 0 ? (
              <ul className="automation-ingest-recent" aria-label={t('automations.ingest.recentAria')}>
                {sourcePackets.map((packet) => (
                  <li key={packet.id}>
                    <span>{packet.title}</span>
                    <small>
                      {t('automations.ingest.recentMeta', { kind: packet.sourceKind, tokens: packet.tokenStats.originalTokens })}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="automation-ingest-empty">{t('automations.ingest.empty')}</span>
            )}
            <button
              type="button"
              className="automations-view__new"
              onClick={submitSourceIngestion}
              disabled={ingestingSource}
            >
              <Icon name="sparkles" size={14} />
              <span>{ingestingSource ? t('automations.ingest.action.ingesting') : t('automations.ingest.action.ingest')}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="automations-templates" aria-label={t('automations.templates.aria')}>
        <div className="automations-templates__head">
          <div className="automations-templates__head-copy">
            <h2 className="automations-section__label">{t('automations.templates.title')}</h2>
            <p className="automations-section__sub">
              {t('automations.templates.sub')}
            </p>
          </div>
          <span className="automations-section__meta">
            {t('automations.templates.countMeta', { shown: filteredTemplates.length, total: templates.length })}
          </span>
        </div>
        <div
          className="automations-template-tabs"
          role="tablist"
          aria-label={t('automations.templates.filtersAria')}
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
                <span className="automations-template-tab__label">{t(filter.labelKey)}</span>
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
              <strong>{t('automations.templates.emptyTitle')}</strong>
              <p>{t('automations.templates.emptyHint')}</p>
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
                  {kindLabel(template.kind, t)}
                </span>
                <span className="automation-template-card__title">{template.title}</span>
                <span className="automation-template-card__desc">{template.description}</span>
                <span className="automation-template-card__cta">
                  {t('automations.templates.useTemplate')}
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
  t,
  formatAutomationTimestamp,
  formatRunDuration,
}: {
  routineId: string;
  refreshKey: number;
  crystallizingRunId: string | null;
  onCrystallizeRun: (routineId: string, runId: string) => void;
  t: TFn;
  formatAutomationTimestamp: (ts: number | null | undefined) => string;
  formatRunDuration: (run: RoutineRun) => string;
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
    return <div className="automation-history automation-history--empty">{t('automations.history.loading')}</div>;
  }

  if (runs.length === 0) {
    return <div className="automation-history automation-history--empty">{t('automations.history.empty')}</div>;
  }

  return (
    <div className="automation-history" aria-label={t('automations.history.aria')}>
      <div className="automation-history__head">
        <span>{t('automations.history.head')}</span>
        <span>{t('automations.history.latest')}</span>
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
                  title={t('automations.history.crystallizeTitle')}
                >
                  <Icon name="sparkles" size={12} />
                  <span>{crystallizingRunId === run.id ? t('automations.history.crystallizing') : t('automations.history.crystallize')}</span>
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
                {t('automations.history.openConversation')}
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
