import type {
  Approval,
  AutonomyLevel,
  BuilderRun,
  BuilderRunEvent,
  BuilderSkillSummary,
  CanvasEntity,
  HarnessProcess,
} from '@open-design/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  getProjectBuilderApprovals,
  getProjectBuilderProcesses,
  getProjectBuilderRunEvents,
  getProjectBuilderRuns,
} from '../state/projects';
import type { SkillSummary } from '../types';
import styles from './CanvasRunPanel.module.css';

interface CanvasRunPanelProps {
  projectId: string;
  skills: SkillSummary[];
}

type CanvasRunCardKind = 'skill' | 'process' | 'run';

interface CanvasRunLedgerState {
  loading: boolean;
  apiAvailable: boolean;
  processes: HarnessProcess[];
  runs: BuilderRun[];
  events: BuilderRunEvent[];
  approvals: Approval[];
}

interface CanvasRunCardView {
  kind: CanvasRunCardKind;
  eyebrow: string;
  title: string;
  description: string;
  sourceLabel: string;
  status: string;
  autonomy: AutonomyLevel;
  lastRun: string;
  nextRun: string;
  approval: string;
  metrics: Array<{ label: string; value: string }>;
  chips: string[];
}

const DEMO_SKILL_ID = 'gsc-keyword-optimization';
const DEMO_PROCESS_ID = 'process-weekly-gsc-keyword-scan';
const DEMO_RUN_ID = 'run-demo-keyword-gap-pass';
const DEMO_APPROVAL_ID = 'approval-demo-apply-page-edits';
const DEMO_STARTED_AT = '2026-06-19T09:12:00.000Z';
const DEMO_UPDATED_AT = '2026-06-19T09:17:00.000Z';
const DEMO_NEXT_RUN_AT = '2026-06-22T09:00:00.000Z';

export function CanvasRunPanel({ projectId, skills }: CanvasRunPanelProps) {
  const [ledger, setLedger] = useState<CanvasRunLedgerState>({
    loading: true,
    apiAvailable: false,
    processes: [],
    runs: [],
    events: [],
    approvals: [],
  });

  useEffect(() => {
    let canceled = false;
    async function loadLedger() {
      setLedger((current) => ({ ...current, loading: true }));
      const [processesResponse, runsResponse, approvalsResponse] = await Promise.all([
        getProjectBuilderProcesses(projectId),
        getProjectBuilderRuns(projectId),
        getProjectBuilderApprovals(projectId),
      ]);
      const runs = runsResponse?.runs ?? [];
      const eventsResponse = runs[0]
        ? await getProjectBuilderRunEvents(projectId, runs[0].id)
        : null;
      if (canceled) return;
      setLedger({
        loading: false,
        apiAvailable: Boolean(processesResponse || runsResponse || approvalsResponse || eventsResponse),
        processes: processesResponse?.processes ?? [],
        runs,
        events: eventsResponse?.events ?? [],
        approvals: approvalsResponse?.approvals ?? [],
      });
    }
    void loadLedger();
    return () => {
      canceled = true;
    };
  }, [projectId]);

  const registrySkill = findCanvasDemoSkill(skills);
  const skill = builderSkillSummaryFromRegistry(registrySkill);
  const process = ledger.processes[0] ?? demoHarnessProcess(projectId, skill);
  const run = ledger.runs[0] ?? demoBuilderRun(projectId, skill, process);
  const approval = ledger.approvals[0] ?? (ledger.runs.length > 0 ? null : demoApproval(projectId, run, process));
  const events = ledger.events.length > 0
    ? ledger.events
    : demoRunEvents(projectId, run, process, skill, approval);
  const entities = useMemo(
    () => demoCanvasEntities(projectId, skill, process, run, approval),
    [approval, process, projectId, run, skill],
  );
  const sourceMode = ledger.runs.length > 0 || ledger.processes.length > 0
    ? 'Run Ledger API'
    : (registrySkill ? 'Skill API + demo run ledger' : 'Placeholder data');
  const cards = [
    skillCardView(skill, registrySkill),
    processCardView(process, ledger.processes.length > 0),
    runCardView(run, approval, ledger.runs.length > 0),
  ];

  return (
    <section className={styles.panel} aria-label="Canvas Run panel">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Builder Canvas Run</p>
          <h2>Skill-backed automations</h2>
        </div>
        <div className={styles.headerMeta} aria-label="Canvas run data source">
          <span>{ledger.loading ? 'Loading' : ledger.apiAvailable ? 'API-backed' : 'Demo-gated'}</span>
          <strong>{sourceMode}</strong>
        </div>
      </div>

      <div className={styles.canvas} data-testid="canvas-run-ui-panel">
        <div className={styles.cards} aria-label="Canvas automation cards">
          {cards.map((card) => (
            <CanvasRunCard key={card.kind} card={card} />
          ))}
        </div>

        <div className={styles.timelineCard} data-testid="canvas-run-timeline">
          <div className={styles.timelineHead}>
            <div>
              <p className={styles.kicker}>Run replay</p>
              <h3>{run.id}</h3>
            </div>
            <span>{events.length} normalized events</span>
          </div>
          <ol className={styles.timeline}>
            {events.map((event) => (
              <li key={event.id} data-event-type={event.type}>
                <span className={styles.timelineIndex}>{event.sequence}</span>
                <div>
                  <strong>{event.type}</strong>
                  <small>{runEventDetail(event)}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.legend} aria-label="Canvas entities">
          <span>{entities.length} canvas entities</span>
          <span>no daemon private imports</span>
          <span>{ledger.runs.length > 0 ? 'run state from API' : 'run state demo-only'}</span>
        </div>
      </div>
    </section>
  );
}

function CanvasRunCard({ card }: { card: CanvasRunCardView }) {
  return (
    <article className={styles.card} data-card-kind={card.kind} data-testid={`canvas-run-${card.kind}-card`}>
      <div className={styles.cardHead}>
        <span>{card.eyebrow}</span>
        <small>{card.sourceLabel}</small>
      </div>
      <h3>{card.title}</h3>
      <p>{card.description}</p>
      <dl className={styles.metrics}>
        <div>
          <dt>Status</dt>
          <dd>{card.status}</dd>
        </div>
        <div>
          <dt>Autonomy</dt>
          <dd>{card.autonomy}</dd>
        </div>
        <div>
          <dt>Last run</dt>
          <dd>{card.lastRun}</dd>
        </div>
        <div>
          <dt>Next run</dt>
          <dd>{card.nextRun}</dd>
        </div>
        <div className={styles.approvalMetric}>
          <dt>Approval</dt>
          <dd>{card.approval}</dd>
        </div>
      </dl>
      <div className={styles.chips}>
        {card.chips.slice(0, 6).map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    </article>
  );
}

function findCanvasDemoSkill(skills: SkillSummary[]): SkillSummary | null {
  return (
    skills.find((skill) => skill.id === DEMO_SKILL_ID) ??
    skills.find((skill) => skill.tags?.includes('builder-harness') || skill.scenario === 'builder-harness') ??
    null
  );
}

function builderSkillSummaryFromRegistry(skill: SkillSummary | null): BuilderSkillSummary {
  return {
    id: skill?.id ?? DEMO_SKILL_ID,
    name: skill?.name ?? 'GSC Keyword Optimization',
    version: '1.0.0',
    category: skill?.category || 'SEO & AEO',
    description: skill?.description || 'Markdown skill loaded by growth-agent and site-builder-agent.',
    agents: ['growth-agent', 'site-builder-agent'],
    autonomy: 'stage',
    tools: ['gsc', 'filesystem', 'documents', 'preview'],
    outputs: ['seo_audit', 'file_diff', 'preview_check'],
    tags: skill?.tags ?? ['builder-harness', 'seo', 'automation'],
    importedFrom: skill?.source ?? 'demo-placeholder',
    triggerKinds: ['manual', 'scheduled', 'watchdog'],
    approvalKinds: ['credential_connection', 'apply_file_changes', 'publish'],
    metadata: {
      registryBacked: Boolean(skill),
      demoOnly: true,
    },
  };
}

function demoHarnessProcess(projectId: string, skill: BuilderSkillSummary): HarnessProcess {
  return {
    id: DEMO_PROCESS_ID,
    projectId,
    skillIds: [skill.id],
    agentId: 'growth-agent',
    status: 'sleeping',
    trigger: {
      kind: 'scheduled',
      source: 'routine',
      metadata: { demoOnly: true },
    },
    autonomy: 'stage',
    schedule: {
      kind: 'cron',
      expression: '0 9 * * 1',
      timezone: 'America/Los_Angeles',
      nextRunAt: DEMO_NEXT_RUN_AT,
    },
    startedAt: DEMO_STARTED_AT,
    lastHeartbeatAt: DEMO_UPDATED_AT,
    nextRunAt: DEMO_NEXT_RUN_AT,
    runId: DEMO_RUN_ID,
    enabled: true,
    failureCount: 0,
    metadata: { demoOnly: true },
  };
}

function demoBuilderRun(
  projectId: string,
  skill: BuilderSkillSummary,
  process: HarnessProcess,
): BuilderRun {
  return {
    id: DEMO_RUN_ID,
    projectId,
    processId: process.id,
    skillIds: [skill.id],
    agentId: process.agentId,
    status: 'waiting_for_approval',
    origin: 'scheduled',
    autonomy: 'stage',
    startedAt: DEMO_STARTED_AT,
    completedAt: null,
    approvalIds: [DEMO_APPROVAL_ID],
    outputEntityIds: ['canvas-output-demo-keyword-gap'],
    metadata: { demoOnly: true },
  };
}

function demoApproval(projectId: string, run: BuilderRun, process: HarnessProcess): Approval {
  return {
    id: DEMO_APPROVAL_ID,
    projectId,
    runId: run.id,
    processId: process.id,
    kind: 'apply_file_changes',
    title: 'Review staged page edits',
    description: 'Placeholder approval gate for applying keyword gap recommendations.',
    status: 'requested',
    requestedBy: 'agent',
    requestedAt: DEMO_UPDATED_AT,
    resolvedAt: null,
    subject: {
      entityId: 'canvas-output-demo-keyword-gap',
      path: 'src/pages/index.astro',
    },
    metadata: { demoOnly: true },
  };
}

function demoRunEvents(
  projectId: string,
  run: BuilderRun,
  process: HarnessProcess,
  skill: BuilderSkillSummary,
  approval: Approval | null,
): BuilderRunEvent[] {
  const base = {
    runId: run.id,
    projectId,
    timestamp: DEMO_STARTED_AT,
  };
  const events: BuilderRunEvent[] = [
    {
      ...base,
      id: 'event-1-process-started',
      type: 'process.started',
      sequence: 1,
      source: 'builder',
      processId: process.id,
      skillIds: [skill.id],
      autonomy: process.autonomy,
    },
    {
      ...base,
      id: 'event-2-skill-loaded',
      type: 'skill.loaded',
      sequence: 2,
      source: 'harness',
      skillId: skill.id,
      version: skill.version,
      sourcePath: 'docs/product/harness-skills/skills/gsc-keyword-optimization.md',
    },
    {
      ...base,
      id: 'event-3-workflow-started',
      type: 'workflow.started',
      sequence: 3,
      source: 'harness',
      workflowId: 'weekly-gsc-keyword-scan',
    },
    {
      ...base,
      id: 'event-4-tool-completed',
      type: 'tool.completed',
      sequence: 4,
      source: 'tool',
      toolId: 'preview.smoke',
      toolFamily: 'preview',
      status: 'succeeded',
      outputSummary: 'Preview smoke check passed.',
    },
  ];
  if (approval) {
    events.push({
      ...base,
      id: 'event-5-approval-requested',
      type: 'approval.requested',
      sequence: 5,
      source: 'builder',
      timestamp: DEMO_UPDATED_AT,
      approvalId: approval.id,
      approvalKind: approval.kind,
      title: approval.title,
    });
  }
  events.push(
    {
      ...base,
      id: 'event-6-canvas-output-pinned',
      type: 'canvas.output_pinned',
      sequence: approval ? 6 : 5,
      source: 'builder',
      timestamp: DEMO_UPDATED_AT,
      entityId: 'canvas-output-demo-keyword-gap',
      outputKind: 'recommendation_card',
    },
  );
  return events;
}

function demoCanvasEntities(
  projectId: string,
  skill: BuilderSkillSummary,
  process: HarnessProcess,
  run: BuilderRun,
  approval: Approval | null,
): CanvasEntity[] {
  const entities: CanvasEntity[] = [
    {
      id: `skill:${skill.id}`,
      kind: 'skill',
      title: skill.name,
      body: skill.description,
      status: 'enabled',
      source: 'skill-registry',
      binding: { projectId, skillId: skill.id },
      autonomy: skill.autonomy,
      createdAt: DEMO_STARTED_AT,
      updatedAt: DEMO_UPDATED_AT,
      metadata: { demoOnly: true },
    },
    {
      id: `process:${process.id}`,
      kind: 'process',
      title: 'Weekly GSC keyword scan',
      body: 'Scheduled harness process placeholder.',
      status: process.status,
      source: 'automation',
      binding: { projectId, processId: process.id, skillId: skill.id, runId: run.id },
      autonomy: process.autonomy,
      createdAt: DEMO_STARTED_AT,
      updatedAt: DEMO_UPDATED_AT,
      metadata: { demoOnly: true },
    },
    {
      id: `run:${run.id}`,
      kind: 'run',
      title: run.id,
      body: 'Run ledger placeholder with normalized event replay.',
      status: run.status,
      source: 'run',
      binding: { projectId, processId: process.id, runId: run.id },
      autonomy: run.autonomy,
      createdAt: run.startedAt,
      updatedAt: DEMO_UPDATED_AT,
      metadata: { demoOnly: true },
    },
  ];
  if (approval) {
    entities.push({
      id: `approval:${approval.id}`,
      kind: 'approval',
      title: approval.title,
      body: approval.description,
      status: approval.status,
      source: 'run',
      binding: { projectId, processId: process.id, runId: run.id, approvalId: approval.id },
      createdAt: approval.requestedAt,
      updatedAt: approval.requestedAt,
      metadata: { demoOnly: true },
    });
  }
  return entities;
}

function skillCardView(skill: BuilderSkillSummary, registrySkill: SkillSummary | null): CanvasRunCardView {
  return {
    kind: 'skill',
    eyebrow: 'Skill Card',
    title: skill.name,
    description: skill.description ?? 'Reusable agent expertise from the Builder skill registry.',
    sourceLabel: registrySkill ? 'Skill API' : 'Demo',
    status: 'enabled',
    autonomy: skill.autonomy,
    lastRun: 'Jun 19, 09:12',
    nextRun: 'Mon, 09:00',
    approval: skill.approvalKinds.includes('publish') ? 'publish approval' : 'policy placeholder',
    metrics: [
      { label: 'Agents', value: skill.agents.join(', ') },
      { label: 'Triggers', value: skill.triggerKinds.join(', ') },
    ],
    chips: [...skill.tools, ...skill.outputs],
  };
}

function processCardView(process: HarnessProcess, apiBacked: boolean): CanvasRunCardView {
  return {
    kind: 'process',
    eyebrow: 'Process Card',
    title: 'Weekly GSC keyword scan',
    description: 'Scheduled harness process that references skill markdown by id.',
    sourceLabel: apiBacked ? 'Run Ledger API' : 'Demo',
    status: process.status,
    autonomy: process.autonomy,
    lastRun: 'Jun 19, 09:12',
    nextRun: 'Mon, 09:00',
    approval: 'edits staged; publish blocked',
    metrics: [
      { label: 'Trigger', value: process.trigger.kind },
      { label: 'Failures', value: String(process.failureCount ?? 0) },
    ],
    chips: process.skillIds,
  };
}

function runCardView(run: BuilderRun, approval: Approval | null, apiBacked: boolean): CanvasRunCardView {
  return {
    kind: 'run',
    eyebrow: 'Run Card',
    title: run.id,
    description: 'Run ledger placeholder with replayable normalized Builder events.',
    sourceLabel: apiBacked ? 'Run Ledger API' : 'Demo',
    status: run.status,
    autonomy: run.autonomy,
    lastRun: '5 min ago',
    nextRun: 'from process schedule',
    approval: approval ? (approval.status === 'requested' ? '1 pending' : approval.status) : 'none',
    metrics: [
      { label: 'Agent', value: run.agentId },
      { label: 'Origin', value: run.origin },
    ],
    chips: [...run.skillIds, ...(run.outputEntityIds ?? [])],
  };
}

function runEventDetail(event: BuilderRunEvent): string {
  switch (event.type) {
    case 'process.started':
      return `${event.autonomy} autonomy; ${event.skillIds.length} skill loaded`;
    case 'skill.loaded':
      return `${event.skillId} v${event.version}`;
    case 'workflow.started':
      return event.workflowId;
    case 'tool.completed':
      return event.outputSummary ?? `${event.toolId} ${event.status}`;
    case 'approval.requested':
      return `${event.approvalKind}: ${event.title}`;
    case 'canvas.output_pinned':
      return `${event.outputKind} -> ${event.entityId}`;
    default:
      return event.source;
  }
}
