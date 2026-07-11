import type { Routine } from '@open-design/contracts';
import type { MutableRefObject } from 'react';

import { Icon } from '../../../components/Icon';
import type { AutomationAnalyticsController } from '../hooks/useAutomationAnalytics.hooks';
import { routineTargetLabel } from '../rules';
import type { TranslateFn } from '../types';
import { AutomationRow } from './AutomationRow';

export function AutomationsSavedSection({
  loading,
  routines,
  projectsById,
  expandedId,
  focusRoutineId,
  historyTick,
  busyId,
  crystallizingRunId,
  fireClick,
  routineRowRefs,
  onNewAutomation,
  onRun,
  onToggleHistory,
  onEdit,
  onTogglePaused,
  onDelete,
  onCrystallizeRun,
  t,
}: {
  loading: boolean;
  routines: Routine[];
  projectsById: Map<string, string>;
  expandedId: string | null;
  focusRoutineId: string | null;
  historyTick: number;
  busyId: string | null;
  crystallizingRunId: string | null;
  fireClick: AutomationAnalyticsController['fireClick'];
  routineRowRefs: MutableRefObject<Record<string, HTMLLIElement | null>>;
  onNewAutomation: () => void;
  onRun: (id: string) => void;
  onToggleHistory: (id: string) => void;
  onEdit: (routine: Routine) => void;
  onTogglePaused: (routine: Routine) => void;
  onDelete: (id: string) => void;
  onCrystallizeRun: (routineId: string, runId: string) => void;
  t: TranslateFn;
}) {
  return (
    <section className="automations-saved" aria-label={t('automations.yourAutomations')}>
      <div className="automations-section-head">
        <h2 className="automations-section__label">{t('automations.yourAutomations')}</h2>
        {loading ? <span className="automations-section__meta">{t('automations.loading')}</span> : null}
      </div>
      {!loading && routines.length === 0 ? (
        <button type="button" className="automation-empty" onClick={onNewAutomation}>
          <span className="automation-empty__icon">
            <Icon name="plus" size={16} />
          </span>
          <span className="automation-empty__body">
            <strong>{t('automations.emptyTitle')}</strong>
            <span>{t('automations.emptyBody')}</span>
          </span>
        </button>
      ) : null}
      {routines.length > 0 ? (
        <ul className="automations-saved__list">
          {routines.map((r) => {
            return (
              <AutomationRow
                key={r.id}
                routine={r}
                targetLabel={routineTargetLabel(r, projectsById, t)}
                isBusy={busyId === r.id}
                isExpanded={expandedId === r.id}
                isFocused={focusRoutineId === r.id}
                historyTick={historyTick}
                crystallizingRunId={crystallizingRunId}
                fireClick={fireClick}
                onSetRowRef={(node) => {
                  routineRowRefs.current[r.id] = node;
                }}
                onRun={onRun}
                onToggleHistory={onToggleHistory}
                onEdit={onEdit}
                onTogglePaused={onTogglePaused}
                onDelete={onDelete}
                onCrystallizeRun={onCrystallizeRun}
                t={t}
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
