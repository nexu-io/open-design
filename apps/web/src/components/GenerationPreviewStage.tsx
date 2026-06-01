import { useT } from '../i18n';
import type { GenerationPreviewModel } from '../runtime/generation-preview';
import { Icon } from './Icon';
import styles from './GenerationPreviewStage.module.css';

type Props = {
  model: GenerationPreviewModel;
  onRetry?: (() => void) | undefined;
};

export function GenerationPreviewStage({ model, onRetry }: Props) {
  const t = useT();

  const generating = model.phase === 'generating';

  const stepLabels: Record<GenerationPreviewModel['steps'][number]['id'], string> = {
    understand: t('generationPreview.stepUnderstand'),
    generate: t('generationPreview.stepGenerate'),
    prepare: t('generationPreview.stepPrepare'),
  };

  const title =
    model.phase === 'failed'
      ? t('generationPreview.failedTitle')
      : model.phase === 'stopped'
        ? t('generationPreview.stoppedTitle')
        : model.phase === 'awaiting-input'
          ? t('generationPreview.awaitingTitle')
          : t('generationPreview.title');

  const lead =
    model.phase === 'failed'
      ? model.errorMessage || t('generationPreview.failedFallback')
      : model.phase === 'stopped'
        ? t('generationPreview.stoppedLead')
        : model.phase === 'awaiting-input'
          ? t('generationPreview.awaitingLead')
          : model.activityLabel;

  const markIcon =
    model.phase === 'failed' ? 'close' : model.phase === 'stopped' ? 'stop' : 'sparkles';

  // Once concrete sub-status (current task + count) is available we let it
  // carry the live signal and drop the higher-level narration line, so only
  // one dynamic line shows at a time.
  const showSubstatus = generating && Boolean(model.detailLabel || model.todoProgress);

  return (
    <section
      className={styles.stage}
      data-testid="generation-preview-stage"
      data-phase={model.phase}
      aria-live="polite"
      aria-busy={generating}
    >
      <div className={styles.mark} data-active={generating} aria-hidden>
        <Icon name={markIcon} size={24} />
      </div>
      <h1 className={styles.title}>{title}</h1>
      {!showSubstatus && lead ? (
        <p className={styles.lead} data-live={generating && Boolean(model.activityLabel)}>
          {lead}
        </p>
      ) : null}
      <div
        className={styles.progress}
        data-active={generating}
        role="progressbar"
        aria-label={t('generationPreview.progressAria', { percent: model.progressPercent })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={model.progressPercent}
      >
        <span style={{ width: `${model.progressPercent}%` }} />
      </div>
      <ol className={styles.steps}>
        {model.steps
          .filter((step) => step.status !== 'pending')
          .map((step) => (
          <li key={step.id} className={styles.step} data-status={step.status}>
            <span className={styles.stepIcon} aria-hidden>
              {step.status === 'succeeded' ? (
                <Icon name="check" size={12} />
              ) : step.status === 'failed' ? (
                <Icon name="close" size={12} />
              ) : (
                <span className={styles.stepDot} data-running={step.status === 'running' && generating} />
              )}
            </span>
            <span className={styles.stepLabel}>{stepLabels[step.id]}</span>
          </li>
        ))}
      </ol>
      {generating && (model.detailLabel || model.todoProgress) ? (
        <div
          key={`${model.detailLabel ?? ''}-${model.todoProgress?.done ?? ''}`}
          className={styles.substatus}
        >
          {model.detailLabel ? (
            <span className={styles.substatusLabel}>{model.detailLabel}</span>
          ) : null}
          {model.todoProgress ? (
            <span className={styles.substatusCount}>
              {model.todoProgress.done}/{model.todoProgress.total}
            </span>
          ) : null}
        </div>
      ) : null}
      {model.phase === 'failed' && onRetry ? (
        <button
          type="button"
          className={styles.retry}
          data-testid="generation-preview-retry"
          onClick={onRetry}
        >
          {t('generationPreview.retry')}
        </button>
      ) : null}
    </section>
  );
}
