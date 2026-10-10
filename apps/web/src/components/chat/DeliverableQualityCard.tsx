import type { ChatMessage } from '../../types';
import { useT } from '../../i18n';
import { deliverableQualityPresentation } from '../../runtime/deliverable-quality';
import styles from './DeliverableQualityCard.module.css';

export function DeliverableQualityCard({ quality, runStatus }: {
  quality: ChatMessage['deliverableQuality'];
  runStatus: ChatMessage['runStatus'];
}) {
  const t = useT();
  const state = deliverableQualityPresentation(quality, runStatus);
  const issues = state === 'unknown' || state === 'checking' ? [] : quality?.checks.filter((check) => check.status === 'fail' || check.status === 'incomplete') ?? [];
  return (
    <section className={styles.card} aria-live="polite" data-testid="deliverable-quality" data-quality-status={state}>
      <strong>{t(`chat.quality.${state}`)}</strong>
      {quality && state !== 'unknown' && state !== 'checking' && state !== 'not_applicable' ? (
        <p>{t('chat.quality.coverage', { checked: quality.coverage.checked, expected: quality.coverage.expected })}</p>
      ) : null}
      {state === 'pass' ? <p>{t('chat.quality.scope')}</p> : null}
      {state !== 'checking' && issues.length > 0 ? (
        <ul>{issues.map((check, index) => (
          <li key={`${check.id}-${index}`}>
            {check.control || check.file || check.id}{check.line ? `:${check.line}` : ''}
            {check.reason ? ` · ${check.reason}` : ''}
          </li>
        ))}</ul>
      ) : null}
    </section>
  );
}
