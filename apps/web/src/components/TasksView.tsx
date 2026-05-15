import { useMemo, useState } from 'react';
import type { AppConfig } from '../types';
import { Icon } from './Icon';

type TaskFilter = 'all' | 'scheduled' | 'running' | 'done';
type TaskStatus = 'running' | 'scheduled' | 'idle' | 'done' | 'failed';

interface TaskCard {
  id: string;
  title: string;
  icon: 'bell' | 'file' | 'history' | 'orbit';
  status: TaskStatus;
  statusLabel: string;
  meta: string;
  preview: string;
  trigger: string;
  pattern: string;
  runtime: string;
  output: string;
  artifactTitle: string;
  artifactMeta: string;
  artifactBody: string[];
}

interface Props {
  config: AppConfig;
  onOpenOrbitSettings: () => void;
}

const FILTERS: ReadonlyArray<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'running', label: 'Running' },
  { id: 'done', label: 'Done' },
];

const BASE_TASKS: ReadonlyArray<TaskCard> = [
  {
    id: 'mcp-research',
    title: 'MCP alternatives research',
    icon: 'orbit',
    status: 'running',
    statusLabel: 'Running in orbit · 2h 14m',
    meta: '14 / 30 sources processed',
    preview: 'research_notes.md · live',
    trigger: 'Manual · one-shot',
    pattern: 'Deep research prompt',
    runtime: 'Remote · persistent',
    output: 'Live report · auto-updating',
    artifactTitle: 'research_notes.md',
    artifactMeta: 'Updated 12s ago',
    artifactBody: [
      '# MCP alternatives - interim findings',
      '14 sources reviewed · 3 contenders shortlisted',
      '## Shortlist',
      '- Tool-call schemas via JSON-RPC...',
      '- gRPC-based agent protocols...',
    ],
  },
  {
    id: 'weekly-team',
    title: 'Weekly team digest',
    icon: 'history',
    status: 'scheduled',
    statusLabel: 'Next: Mon 9:00 AM',
    meta: 'Updates Team weekly doc',
    preview: 'team_weekly.md · next artifact',
    trigger: 'Schedule · weekly',
    pattern: 'Routine · team digest',
    runtime: 'Remote · recurring',
    output: 'Live artifact · markdown',
    artifactTitle: 'team_weekly.md',
    artifactMeta: 'Last updated 4d ago',
    artifactBody: [
      '# Team weekly',
      '## In flight',
      '- Design-system integration pass',
      '- Connector quality sweep',
      '## Risks',
      '- Waiting on schedule branch merge',
    ],
  },
  {
    id: 'pr-review',
    title: 'PR review reminder',
    icon: 'bell',
    status: 'idle',
    statusLabel: 'On new PR · fired 23m ago',
    meta: 'Sends Slack DM',
    preview: 'Last delivery succeeded',
    trigger: 'Event · new PR',
    pattern: 'Routine · notification',
    runtime: 'Local · quick run',
    output: 'Message · Slack DM',
    artifactTitle: 'pr_review_reminder.log',
    artifactMeta: 'Last fired 23m ago',
    artifactBody: [
      'Opened PR #184 for review',
      'Matched reviewers: design-platform, web-runtime',
      'Delivery: Slack DM sent',
    ],
  },
  {
    id: 'pre-meeting',
    title: 'Pre-meeting prep',
    icon: 'file',
    status: 'scheduled',
    statusLabel: 'Tomorrow · 10:00 AM',
    meta: 'One-shot · sends summary',
    preview: 'meeting_brief.md · queued',
    trigger: 'Schedule · one-shot',
    pattern: 'Briefing prompt',
    runtime: 'Remote · bounded',
    output: 'Artifact + message',
    artifactTitle: 'meeting_brief.md',
    artifactMeta: 'Queued for generation',
    artifactBody: [
      '# Meeting brief',
      'Agenda source: calendar event + linked docs',
      'Output will include decisions, blockers, and questions.',
    ],
  },
  {
    id: 'candidate-tracking',
    title: 'Candidate tracking',
    icon: 'history',
    status: 'failed',
    statusLabel: 'Failed · needs attention',
    meta: 'Auth expired',
    preview: 'Reconnect Greenhouse to resume',
    trigger: 'Schedule · daily',
    pattern: 'Routine · applicant sync',
    runtime: 'Remote · recurring',
    output: 'Live artifact · table',
    artifactTitle: 'candidate_pipeline.md',
    artifactMeta: 'Paused until auth is restored',
    artifactBody: [
      '# Candidate pipeline',
      'Last successful sync: 2d ago',
      'Action required: reconnect source account.',
    ],
  },
];

export function TasksView({ config, onOpenOrbitSettings }: Props) {
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');
  const [selectedId, setSelectedId] = useState('mcp-research');
  const orbitEnabled = config.orbit?.enabled ?? false;
  const orbitTime = config.orbit?.time ?? '08:00';

  const tasks = useMemo<ReadonlyArray<TaskCard>>(() => {
    const orbitTask: TaskCard = {
      id: 'orbit-daily',
      title: 'Orbit Daily connector summary',
      icon: 'orbit',
      status: orbitEnabled ? 'scheduled' : 'idle',
      statusLabel: orbitEnabled ? `Daily · ${orbitTime}` : 'Paused · manual only',
      meta: orbitEnabled ? 'Connector digest is scheduled' : 'Open Orbit settings to enable',
      preview: orbitEnabled ? 'orbit_daily.html · live artifact' : 'No run scheduled',
      trigger: orbitEnabled ? `Schedule · daily at ${orbitTime}` : 'Manual · run on demand',
      pattern: 'Routine · connector digest',
      runtime: 'Orbit · daemon scheduled',
      output: 'Live artifact · refreshable report',
      artifactTitle: 'orbit_daily.html',
      artifactMeta: orbitEnabled ? 'Refreshes after each run' : 'Waiting for schedule',
      artifactBody: [
        '# Orbit Daily activity summary',
        'Connectors checked · successes, skips, and failures',
        'Highlights become a refreshable live artifact.',
      ],
    };
    return [orbitTask, ...BASE_TASKS];
  }, [orbitEnabled, orbitTime]);

  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'running') return task.status === 'running';
    if (activeFilter === 'scheduled') return task.status === 'scheduled';
    return task.status === 'done';
  });
  const selectedTask =
    tasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? tasks[0];
  if (!selectedTask) return null;

  return (
    <section className="tasks-view" aria-labelledby="tasks-title" data-testid="tasks-view">
      <header className="tasks-view__hero">
        <div>
          <p className="tasks-view__kicker">Automation workspace</p>
          <div className="tasks-view__title-row">
            <h1 id="tasks-title" className="entry-section__title">
              Automations
            </h1>
            <span className="tasks-view__coming-soon">Coming soon</span>
          </div>
          <p className="tasks-view__lede">
            Automations turn prompts into durable work: Orbit runs them,
            routines keep them around, schedules decide when they fire, and live
            artifacts show what changed.
          </p>
        </div>
        <button
          type="button"
          className="tasks-view__new"
          onClick={onOpenOrbitSettings}
        >
          <Icon name="plus" size={14} />
          <span>New automation</span>
        </button>
      </header>

      <div className="tasks-view__preview-note" role="note">
        <Icon name="orbit" size={14} />
        <span>
          Preview surface only. Orbit settings are available today; routines,
          schedules, and live artifact wiring will land as the backend branches merge.
        </span>
      </div>

      <div className="tasks-primitives" aria-label="Automation primitives">
        <PrimitiveCard
          icon="orbit"
          title="Orbit"
          body="A persistent runtime for long-running or recurring agent work."
          meta={orbitEnabled ? 'Daily summary enabled' : 'Manual only'}
          tone="green"
        />
        <PrimitiveCard
          icon="history"
          title="Routines"
          body="Durable task definitions that survive after a single chat ends."
          meta="Product shell ready"
          tone="blue"
        />
        <PrimitiveCard
          icon="bell"
          title="Schedules"
          body="Time or event triggers that decide when a routine should run."
          meta="Branch pending"
          tone="amber"
        />
        <PrimitiveCard
          icon="file"
          title="Live artifacts"
          body="Reports and notes that keep updating while an agent works."
          meta="Preview model"
          tone="purple"
        />
      </div>

      <div className="tasks-board">
        <aside className="tasks-list" aria-label="Automations list">
          <div className="tasks-list__head">
            <div>
              <h2>Automations</h2>
              <p>{tasks.length} routines and runs</p>
            </div>
            <button type="button" onClick={onOpenOrbitSettings}>
              <Icon name="plus" size={13} />
              <span>New</span>
            </button>
          </div>
          <div className="tasks-filter" role="tablist" aria-label="Automation filters">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.id}
                className={activeFilter === filter.id ? 'is-active' : ''}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="tasks-list__items">
            {filteredTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`task-card task-card--${task.status}${
                  selectedTask.id === task.id ? ' is-active' : ''
                }`}
                aria-current={selectedTask.id === task.id ? 'true' : undefined}
                onClick={() => setSelectedId(task.id)}
              >
                <span className="task-card__status">
                  <span className="task-status-dot" aria-hidden="true" />
                  {task.statusLabel}
                </span>
                <span className="task-card__title">
                  <Icon name={task.icon} size={14} />
                  {task.title}
                </span>
                <span className="task-card__meta">{task.meta}</span>
                <span className="task-card__preview">{task.preview}</span>
              </button>
            ))}
          </div>
        </aside>

        <article className="task-detail" aria-labelledby="task-detail-title">
          <div className="task-detail__top">
            <span className={`task-detail__state task-detail__state--${selectedTask.status}`}>
              <span className="task-status-dot" aria-hidden="true" />
              {selectedTask.statusLabel}
            </span>
            <h2 id="task-detail-title">{selectedTask.title}</h2>
            <p>{selectedTask.meta}</p>
          </div>

          <div className="task-slots" aria-label="Automation configuration">
            <Slot icon="bell" label="Trigger" value={selectedTask.trigger} />
            <Slot icon="sparkles" label="Pattern" value={selectedTask.pattern} />
            <Slot icon="orbit" label="Runtime" value={selectedTask.runtime} />
            <Slot icon="file" label="Output" value={selectedTask.output} />
          </div>

          <section className="task-artifact" aria-labelledby="task-artifact-title">
            <header className="task-artifact__head">
              <div>
                <span className="task-artifact__kicker">
                  <Icon name="file" size={12} />
                  Live artifact
                </span>
                <h3 id="task-artifact-title">{selectedTask.artifactTitle}</h3>
              </div>
              <span>{selectedTask.artifactMeta}</span>
            </header>
            <pre>{selectedTask.artifactBody.join('\n')}</pre>
          </section>

          <div className="task-detail__actions">
            <button type="button" className="task-detail__secondary">
              View progress
              <Icon name="external-link" size={13} />
            </button>
            <button type="button" className="task-detail__secondary">
              {selectedTask.status === 'running' ? 'Pause' : 'Run now'}
            </button>
            <button type="button" className="task-detail__primary">
              Open artifact
              <Icon name="external-link" size={13} />
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

function PrimitiveCard({
  icon,
  title,
  body,
  meta,
  tone,
}: {
  icon: 'bell' | 'file' | 'history' | 'orbit';
  title: string;
  body: string;
  meta: string;
  tone: 'amber' | 'blue' | 'green' | 'purple';
}) {
  return (
    <article className={`tasks-primitive tasks-primitive--${tone}`}>
      <span className="tasks-primitive__icon" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
        <span>{meta}</span>
      </div>
    </article>
  );
}

function Slot({
  icon,
  label,
  value,
}: {
  icon: 'bell' | 'file' | 'orbit' | 'sparkles';
  label: string;
  value: string;
}) {
  return (
    <div className="task-slot">
      <span className="task-slot__label">
        <Icon name={icon} size={12} />
        {label}
      </span>
      <span className="task-slot__value">{value}</span>
    </div>
  );
}
