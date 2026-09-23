import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import type { useDeletedShareNotices } from './useDeletedShareNotices';
import styles from './DeletedShareNotices.module.css';

/** Persistent per-deletion groups; each file retains its own fate and action. */
export function DeletedShareNotices({ state }: { state: ReturnType<typeof useDeletedShareNotices> }) {
  const t = useT();
  if (!state.notices.length) return null;
  return <aside className={styles.stack} aria-label={t('designs.deletedShareTitle')}>
    {state.notices.map(notice => <section key={notice.id} className={styles.notice}>
      <header className={styles.heading}>
        <strong>{t('designs.deletedShareTitle')}</strong>
        <Button onClick={() => state.dismiss(notice.id)} aria-label={t('common.dismiss')}>{t('common.dismiss')}</Button>
      </header>
      <ul className={styles.list}>{notice.rows.map(row => <li key={JSON.stringify([row.filePath, row.slug])} className={row.retrying ? styles.recovering : styles.failed}>
        <div role={row.retrying ? 'status' : 'alert'}>
          <strong className={styles.file}>{row.filePath}</strong>
          <code className={styles.file}>{row.slug}</code>
          <p>{t(row.retrying ? 'designs.deletedShareRetrying' : 'designs.deletedShareFailed')}</p>
          {row.failed ? <p>{t('ds.actionFailed')}</p> : null}
        </div>
        {!row.retrying ? <Button disabled={row.busy} aria-busy={row.busy || undefined} onClick={() => void state.retry(notice, row)}>{t('designs.deletedShareRetry')}</Button> : null}
      </li>)}</ul>
    </section>)}
  </aside>;
}
