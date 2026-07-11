import type { Routine } from '@open-design/contracts';

import { Icon } from '../../../components/Icon';
import { navigate } from '../../../router';
import { formatAutomationTimestamp } from '../formatters';
import { nextRunLabel, scheduleStatusLabel } from '../rules';
import type { TranslateFn } from '../types';
import type { AutomationAnalyticsController } from '../hooks/useAutomationAnalytics.hooks';
import { AutomationRunHistory } from './AutomationRunHistory';
import { StatusPill } from './StatusPill';

export function AutomationRow({
  routine,
  targetLabel,
  isBusy,
  isExpanded,
  isFocused,
  historyTick,
  crystallizingRunId,
  fireClick,
  onSetRowRef,
  onRun,
  onToggleHistory,
  onEdit,
  onTogglePaused,
  onDelete,
  onCrystallizeRun,
  t,
}: {
  routine: Routine;
  targetLabel: string;
  isBusy: boolean;
  isExpanded: boolean;
  isFocused: boolean;
  historyTick: number;
  crystallizingRunId: string | null;
  fireClick: AutomationAnalyticsController['fireClick'];
  onSetRowRef: (node: HTMLLIElement | null) => void;
  onRun: (id: string) => void;
  onToggleHistory: (id: string) => void;
  onEdit: (routine: Routine) => void;
  onTogglePaused: (routine: Routine) => void;
  onDelete: (id: string) => void;
  onCrystallizeRun: (routineId: string, runId: string) => void;
  t: TranslateFn;
}) {
  const r = routine;
  return (
    <li
      ref={onSetRowRef}
      data-testid={`automation-row-${r.id}`}
      className={`automation-row${r.enabled ? '' : ' is-paused'}${isFocused ? ' is-focused' : ''}`}
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
          {r.prompt ? <span className="automation-row__prompt">{r.prompt}</span> : null}
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
          onClick={() => onRun(r.id)}
          disabled={isBusy}
          title={t('automations.runNowTitle')}
        >
          <Icon name="play" size={12} />
          <span>{t('automations.run')}</span>
        </button>
        <button
          type="button"
          className="automation-row__btn"
          onClick={() => onToggleHistory(r.id)}
          aria-expanded={isExpanded}
        >
          <Icon name="history" size={12} />
          <span>{isExpanded ? t('automations.hideHistory') : t('automations.history')}</span>
        </button>
        <button type="button" className="automation-row__btn" onClick={() => onEdit(r)} disabled={isBusy}>
          <Icon name="edit" size={12} />
          <span>{t('automations.edit')}</span>
        </button>
        <button type="button" className="automation-row__btn" onClick={() => onTogglePaused(r)} disabled={isBusy}>
          {r.enabled ? t('automations.pause') : t('automations.resume')}
        </button>
        <button
          type="button"
          className="automation-row__btn automation-row__btn--danger"
          onClick={() => onDelete(r.id)}
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
          onCrystallizeRun={onCrystallizeRun}
          onFireClick={fireClick}
          t={t}
        />
      ) : null}
    </li>
  );
}
