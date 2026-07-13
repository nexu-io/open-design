import type { AutomationsClickProps } from '@open-design/contracts';

import { Icon } from '../../../components/Icon';
import { navigate } from '../../../router';
import { formatAutomationTimestamp, formatRunDuration } from '../formatters';
import { useWiredAutomationHistory, type AutomationHistoryController } from '../hooks/useAutomationHistory.hooks';
import type { TranslateFn } from '../types';
import { StatusPill } from './StatusPill';

interface AutomationRunHistoryHooks {
  useHistory?: (routineId: string, refreshKey: number) => AutomationHistoryController;
}

export function AutomationRunHistory({
  routineId,
  refreshKey,
  crystallizingRunId,
  onCrystallizeRun,
  onFireClick,
  t,
  useHistory = useWiredAutomationHistory,
}: {
  routineId: string;
  refreshKey: number;
  crystallizingRunId: string | null;
  onCrystallizeRun: (routineId: string, runId: string) => void;
  onFireClick: (element: AutomationsClickProps['element']) => void;
  t: TranslateFn;
} & AutomationRunHistoryHooks) {
  const { runs } = useHistory(routineId, refreshKey);

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
