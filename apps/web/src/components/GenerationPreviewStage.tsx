import type { ReactNode } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { AMR_RECHARGE_URL } from '../runtime/amr-guidance';
import type { GenerationPreviewModel } from '../runtime/generation-preview';
import { Icon } from './Icon';
import styles from './GenerationPreviewStage.module.css';

type Props = {
  model: GenerationPreviewModel;
  onRetry?: (() => void) | undefined;
  // AMR/Antigravity contextual recovery, mirrored from the chat error card.
  // Each is pre-bound to the failed run in the parent so the stage stays dumb.
  onAuthorizeAndRetry?: (() => void) | undefined;
  onLaunchTerminalAuth?: (() => void) | undefined;
  // "Switch to AMR" promotion card, pre-built by the parent and rendered under
  // the actions for the non-AMR auth/quota cases (see model.promoteAmrSwitch).
  amrGuidance?: ReactNode;
};

// Map a structured run error code to a recognizable, localized reason headline
// so the failed surface names the cause ("Rate limited") instead of only
// echoing the raw upstream string. Unknown codes fall back to the generic
// "generation failed" title.
function reasonTitleKey(code: string | null): keyof Dict | null {
  switch (code) {
    case 'AGENT_AUTH_REQUIRED':
    case 'AMR_AUTH_REQUIRED':
    case 'UNAUTHORIZED':
      return 'generationPreview.reasonAuth';
    case 'RATE_LIMITED':
      return 'generationPreview.reasonRateLimited';
    case 'UPSTREAM_UNAVAILABLE':
      return 'generationPreview.reasonService';
    case 'AMR_INSUFFICIENT_BALANCE':
      return 'generationPreview.reasonBalance';
    default:
      return null;
  }
}

export function GenerationPreviewStage({
  model,
  onRetry,
  onAuthorizeAndRetry,
  onLaunchTerminalAuth,
  amrGuidance,
}: Props) {
  const t = useT();

  const generating = model.phase === 'generating';

  const stepLabels: Record<GenerationPreviewModel['steps'][number]['id'], string> = {
    understand: t('generationPreview.stepUnderstand'),
    generate: t('generationPreview.stepGenerate'),
    prepare: t('generationPreview.stepPrepare'),
  };

  const failedReasonKey = model.phase === 'failed' ? reasonTitleKey(model.errorCode) : null;

  const title =
    model.phase === 'failed'
      ? failedReasonKey
        ? t(failedReasonKey)
        : t('generationPreview.failedTitle')
      : model.phase === 'stopped'
        ? t('generationPreview.stoppedTitle')
        : model.phase === 'awaiting-input'
          ? t('generationPreview.awaitingTitle')
          : t('generationPreview.title');

  // For failures prefer the case-specific copy (AMR auth / balance) over the
  // raw upstream string, mirroring the chat error card's `displayError`.
  const lead =
    model.phase === 'failed'
      ? model.failureUi?.messageKey
        ? t(model.failureUi.messageKey)
        : model.errorMessage || t('generationPreview.failedFallback')
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
      {model.phase === 'failed' && model.failureUi ? (
        <div className={styles.actions}>
          {model.failureUi.primaryAction === 'authorize' && onAuthorizeAndRetry ? (
            <button
              type="button"
              className={styles.action}
              data-testid="generation-preview-authorize"
              onClick={onAuthorizeAndRetry}
            >
              {t('chat.amrError.authorizeCta')}
            </button>
          ) : (model.failureUi.primaryAction === 'launch-terminal-auth'
              || model.failureUi.primaryAction === 'launch-terminal-switch-model')
            && onLaunchTerminalAuth ? (
            <button
              type="button"
              className={styles.action}
              data-testid="generation-preview-launch-terminal"
              onClick={onLaunchTerminalAuth}
            >
              {t(
                model.failureUi.primaryAction === 'launch-terminal-switch-model'
                  ? 'chat.antigravityError.launchSwitchModelCta'
                  : 'chat.antigravityError.launchTerminalCta',
              )}
            </button>
          ) : model.failureUi.primaryAction === 'recharge' ? (
            <button
              type="button"
              className={styles.action}
              data-testid="generation-preview-recharge"
              onClick={() => window.open(AMR_RECHARGE_URL, '_blank', 'noopener,noreferrer')}
            >
              {t('chat.amrError.rechargeCta')}
            </button>
          ) : null}
          {(model.failureUi.primaryAction === 'retry' || model.failureUi.secondaryRetry) && onRetry ? (
            <button
              type="button"
              className={styles.retry}
              data-testid="generation-preview-retry"
              onClick={onRetry}
            >
              {t('generationPreview.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      {model.phase === 'failed' && model.promoteAmrSwitch && amrGuidance ? (
        <div className={styles.guidance}>{amrGuidance}</div>
      ) : null}
    </section>
  );
}
