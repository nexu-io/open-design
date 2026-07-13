import { Icon } from '../../../components/Icon';
import type { TranslateFn } from '../types';
import { Metric } from './Metric';

export function AutomationsHero({
  activeCount,
  pausedCount,
  templateCount,
  onNewAutomation,
  t,
}: {
  activeCount: number;
  pausedCount: number;
  templateCount: number;
  onNewAutomation: () => void;
  t: TranslateFn;
}) {
  return (
    <header className="automations-hero">
      <div className="automations-hero__copy">
        <span className="automations-hero__eyebrow">{t('automations.eyebrow')}</span>
        <h1 id="automations-title" className="automations-hero__title">
          {t('automations.title')}
        </h1>
        <p className="automations-hero__lede">{t('automations.lede')}</p>
      </div>
      <div className="automations-hero__actions">
        <div className="automations-metrics" aria-label={t('automations.summaryAria')}>
          <Metric label={t('automations.metricActive')} value={activeCount} />
          <Metric label={t('automations.metricPaused')} value={pausedCount} />
          <Metric label={t('automations.metricTemplates')} value={templateCount} />
        </div>
        <button type="button" className="automations-view__new" onClick={onNewAutomation} data-testid="automations-new">
          <Icon name="plus" size={14} />
          <span>{t('automations.newAutomation')}</span>
        </button>
      </div>
    </header>
  );
}
