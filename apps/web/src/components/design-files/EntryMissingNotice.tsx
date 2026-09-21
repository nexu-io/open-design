import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import styles from './EntryMissingNotice.module.css';

/** What the last round wrote when none of it opens as the project's entry. */
export interface EntryMissingNoticeState {
  /** Project-relative paths the round created or edited. */
  files: string[];
}

interface Props {
  notice: EntryMissingNoticeState;
  /** Sends the fixed follow-up message asking the agent to add an entry. */
  onRequestEntry?: () => void;
  /** True while a run is in flight, when a new request cannot be sent. */
  requestDisabled?: boolean;
  onDismiss: () => void;
}

const LISTED_FILES = 4;

/**
 * The entry is a project attribute, not a condition a round has to meet: a
 * round that wrote pages but no entry still completed, and this notice is
 * where the user learns why the preview has nothing to open. Two ways out,
 * both already elsewhere in the product — ask the agent for an entry in the
 * same conversation, or pick a file from its row menu.
 */
export function EntryMissingNotice({ notice, onRequestEntry, requestDisabled = false, onDismiss }: Props) {
  const t = useT();
  const listed = notice.files.slice(0, LISTED_FILES);
  const remaining = notice.files.length - listed.length;
  return (
    <div className={styles.notice} role="status" data-testid="design-files-entry-missing">
      <span className={styles.text}>
        <strong>{t('designFiles.entryMissingTitle')}</strong>{' '}
        {t('designFiles.entryMissingBody', { n: notice.files.length })}{' '}
        <span className={styles.files}>
          {listed.join(', ')}
          {remaining > 0 ? ` ${t('designFiles.entryMissingMore', { n: remaining })}` : ''}
        </span>
      </span>
      <span className={styles.actions}>
        {onRequestEntry ? (
          <Button
            size="sm"
            variant="primary"
            disabled={requestDisabled}
            data-testid="design-files-entry-request"
            onClick={onRequestEntry}
          >
            {t('designFiles.entryMissingAsk')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t('common.dismiss')}
        </Button>
      </span>
      <span className={styles.hint}>{t('designFiles.entryMissingHint')}</span>
    </div>
  );
}
