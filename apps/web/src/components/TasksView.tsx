import { useMemo, useState } from 'react';
import type { AppConfig } from '../types';
import { useT } from '../i18n';
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

function taskFilterLabel(id: TaskFilter, t: ReturnType<typeof useT>): string {
  switch (id) {
    case 'all': return t('common.all');
    case 'scheduled': return t('tasks.filter.scheduled');
    case 'running': return t('tasks.filter.running');
    case 'done': return t('tasks.filter.done');
  }
}

function localizedTaskFields(id: string, t: ReturnType<typeof useT>): Partial<TaskCard> {
  switch (id) {
    case 'mcp-research':
      return {
        title: t('tasks.sample.mcp.title'),
        statusLabel: t('tasks.sample.mcp.status'),
        meta: t('tasks.sample.mcp.meta'),
        preview: t('tasks.sample.mcp.preview'),
        trigger: t('tasks.sample.mcp.trigger'),
        pattern: t('tasks.sample.mcp.pattern'),
        runtime: t('tasks.sample.mcp.runtime'),
        output: t('tasks.sample.mcp.output'),
        artifactMeta: t('tasks.sample.mcp.artifactMeta'),
        artifactBody: [
          t('tasks.sample.mcp.body1'),
          t('tasks.sample.mcp.body2'),
          t('tasks.sample.mcp.body3'),
          t('tasks.sample.mcp.body4'),
          t('tasks.sample.mcp.body5'),
        ],
      };
    case 'weekly-team':
      return {
        title: t('tasks.sample.weekly.title'),
        statusLabel: t('tasks.sample.weekly.status'),
        meta: t('tasks.sample.weekly.meta'),
        preview: t('tasks.sample.weekly.preview'),
        trigger: t('tasks.sample.weekly.trigger'),
        pattern: t('tasks.sample.weekly.pattern'),
        runtime: t('tasks.sample.weekly.runtime'),
        output: t('tasks.sample.weekly.output'),
        artifactMeta: t('tasks.sample.weekly.artifactMeta'),
        artifactBody: [
          t('tasks.sample.weekly.body1'),
          t('tasks.sample.weekly.body2'),
          t('tasks.sample.weekly.body3'),
          t('tasks.sample.weekly.body4'),
          t('tasks.sample.weekly.body5'),
        ],
      };
    case 'pr-review':
      return {
        title: t('tasks.sample.pr.title'),
        statusLabel: t('tasks.sample.pr.status'),
        meta: t('tasks.sample.pr.meta'),
        preview: t('tasks.sample.pr.preview'),
        trigger: t('tasks.sample.pr.trigger'),
        pattern: t('tasks.sample.pr.pattern'),
        runtime: t('tasks.sample.pr.runtime'),
        output: t('tasks.sample.pr.output'),
        artifactMeta: t('tasks.sample.pr.artifactMeta'),
        artifactBody: [
          t('tasks.sample.pr.body1'),
          t('tasks.sample.pr.body2'),
          t('tasks.sample.pr.body3'),
        ],
      };
    case 'pre-meeting':
      return {
        title: t('tasks.sample.meeting.title'),
        statusLabel: t('tasks.sample.meeting.status'),
        meta: t('tasks.sample.meeting.meta'),
        preview: t('tasks.sample.meeting.preview'),
        trigger: t('tasks.sample.meeting.trigger'),
        pattern: t('tasks.sample.meeting.pattern'),
        runtime: t('tasks.sample.meeting.runtime'),
        output: t('tasks.sample.meeting.output'),
        artifactMeta: t('tasks.sample.meeting.artifactMeta'),
        artifactBody: [
          t('tasks.sample.meeting.body1'),
          t('tasks.sample.meeting.body2'),
          t('tasks.sample.meeting.body3'),
        ],
      };
    case 'candidate-tracking':
      return {
        title: t('tasks.sample.candidate.title'),
        statusLabel: t('tasks.sample.candidate.status'),
        meta: t('tasks.sample.candidate.meta'),
        preview: t('tasks.sample.candidate.preview'),
        trigger: t('tasks.sample.candidate.trigger'),
        pattern: t('tasks.sample.candidate.pattern'),
        runtime: t('tasks.sample.candidate.runtime'),
        output: t('tasks.sample.candidate.output'),
        artifactMeta: t('tasks.sample.candidate.artifactMeta'),
        artifactBody: [
          t('tasks.sample.candidate.body1'),
          t('tasks.sample.candidate.body2'),
          t('tasks.sample.candidate.body3'),
        ],
      };
    default:
      return {};
  }
}

export function TasksView({ config, onOpenOrbitSettings }: Props) {
  const t = useT();
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');
  const [selectedId, setSelectedId] = useState('mcp-research');
  const orbitEnabled = config.orbit?.enabled ?? false;
  const orbitTime = config.orbit?.time ?? '08:00';

  const tasks = useMemo<ReadonlyArray<TaskCard>>(() => {
    const orbitTask: TaskCard = {
      id: 'orbit-daily',
      title: t('tasks.sample.orbit.title'),
      icon: 'orbit',
      status: orbitEnabled ? 'scheduled' : 'idle',
      statusLabel: orbitEnabled ? t('tasks.status.dailyAt', { time: orbitTime }) : t('tasks.status.pausedManual'),
      meta: orbitEnabled ? t('tasks.sample.orbit.metaEnabled') : t('tasks.sample.orbit.metaDisabled'),
      preview: orbitEnabled ? t('tasks.sample.orbit.previewEnabled') : t('tasks.sample.orbit.previewDisabled'),
      trigger: orbitEnabled ? t('tasks.sample.orbit.triggerEnabled', { time: orbitTime }) : t('tasks.sample.orbit.triggerDisabled'),
      pattern: t('tasks.sample.orbit.pattern'),
      runtime: t('tasks.sample.orbit.runtime'),
      output: t('tasks.sample.orbit.output'),
      artifactTitle: 'orbit_daily.html',
      artifactMeta: orbitEnabled ? t('tasks.sample.orbit.artifactMetaEnabled') : t('tasks.sample.orbit.artifactMetaDisabled'),
      artifactBody: [
        t('tasks.sample.orbit.body1'),
        t('tasks.sample.orbit.body2'),
        t('tasks.sample.orbit.body3'),
      ],
    };
    return [orbitTask, ...BASE_TASKS.map((task) => ({ ...task, ...localizedTaskFields(task.id, t) }))];
  }, [orbitEnabled, orbitTime, t]);

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
          <p className="tasks-view__kicker">{t('tasks.kicker')}</p>
          <div className="tasks-view__title-row">
            <h1 id="tasks-title" className="entry-section__title">
              {t('entry.navTasks')}
            </h1>
            <span className="tasks-view__coming-soon">{t('tasks.comingSoon')}</span>
          </div>
          <p className="tasks-view__lede">
            {t('tasks.lede')}
          </p>
        </div>
        <button
          type="button"
          className="tasks-view__new"
          onClick={onOpenOrbitSettings}
        >
          <Icon name="plus" size={14} />
          <span>{t('tasks.newAutomation')}</span>
        </button>
      </header>

      <div className="tasks-view__preview-note" role="note">
        <Icon name="orbit" size={14} />
        <span>
          {t('tasks.previewNote')}
        </span>
      </div>

      <div className="tasks-primitives" aria-label={t('tasks.primitivesAria')}>
        <PrimitiveCard
          icon="orbit"
          title={t('tasks.primitive.orbit.title')}
          body={t('tasks.primitive.orbit.body')}
          meta={orbitEnabled ? t('tasks.primitive.orbit.enabled') : t('tasks.primitive.orbit.manualOnly')}
          tone="green"
        />
        <PrimitiveCard
          icon="history"
          title={t('tasks.primitive.routines.title')}
          body={t('tasks.primitive.routines.body')}
          meta={t('tasks.primitive.routines.meta')}
          tone="blue"
        />
        <PrimitiveCard
          icon="bell"
          title={t('tasks.primitive.schedules.title')}
          body={t('tasks.primitive.schedules.body')}
          meta={t('tasks.primitive.schedules.meta')}
          tone="amber"
        />
        <PrimitiveCard
          icon="file"
          title={t('tasks.primitive.liveArtifacts.title')}
          body={t('tasks.primitive.liveArtifacts.body')}
          meta={t('tasks.primitive.liveArtifacts.meta')}
          tone="purple"
        />
      </div>

      <div className="tasks-board">
        <aside className="tasks-list" aria-label={t('tasks.listAria')}>
          <div className="tasks-list__head">
            <div>
              <h2>{t('entry.navTasks')}</h2>
              <p>{t('tasks.routinesAndRuns', { n: tasks.length })}</p>
            </div>
            <button type="button" onClick={onOpenOrbitSettings}>
              <Icon name="plus" size={13} />
              <span>{t('chat.new')}</span>
            </button>
          </div>
          <div className="tasks-filter" role="tablist" aria-label={t('tasks.filtersAria')}>
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.id}
                className={activeFilter === filter.id ? 'is-active' : ''}
                onClick={() => setActiveFilter(filter.id)}
              >
                {taskFilterLabel(filter.id, t)}
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

          <div className="task-slots" aria-label={t('tasks.configurationAria')}>
            <Slot icon="bell" label={t('tasks.slot.trigger')} value={selectedTask.trigger} />
            <Slot icon="sparkles" label={t('tasks.slot.pattern')} value={selectedTask.pattern} />
            <Slot icon="orbit" label={t('tasks.slot.runtime')} value={selectedTask.runtime} />
            <Slot icon="file" label={t('tasks.slot.output')} value={selectedTask.output} />
          </div>

          <section className="task-artifact" aria-labelledby="task-artifact-title">
            <header className="task-artifact__head">
              <div>
                <span className="task-artifact__kicker">
                  <Icon name="file" size={12} />
                  {t('tasks.liveArtifact')}
                </span>
                <h3 id="task-artifact-title">{selectedTask.artifactTitle}</h3>
              </div>
              <span>{selectedTask.artifactMeta}</span>
            </header>
            <pre>{selectedTask.artifactBody.join('\n')}</pre>
          </section>

          <div className="task-detail__actions">
            <button type="button" className="task-detail__secondary">
              {t('tasks.viewProgress')}
              <Icon name="external-link" size={13} />
            </button>
            <button type="button" className="task-detail__secondary">
              {selectedTask.status === 'running' ? t('tasks.pause') : t('tasks.runNow')}
            </button>
            <button type="button" className="task-detail__primary">
              {t('tasks.openArtifact')}
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
