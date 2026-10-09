import { useT } from '../../i18n';
import { ShareFeedbackToast } from '../share/ShareFeedbackToast';
import type { useDeletedShareNotices } from './useDeletedShareNotices';

/** Show one global Toast at a time; a dismissal must not hide other failed files. */
export function DeletedShareNotices({ state }: { state: ReturnType<typeof useDeletedShareNotices> }) {
  const t = useT();
  const rows = state.notices.flatMap(notice => notice.rows.map(row => ({ notice, row })));
  const current = rows.find(({ row }) => !row.retrying) ?? rows[0];
  if (!current) return null;
  const { notice, row } = current;
  const loading = Boolean(row.retrying || row.busy);
  return <ShareFeedbackToast
    key={JSON.stringify([notice.id, row.filePath, row.slug])}
    message={t(row.retrying ? 'designs.deletedShareRetrying' : 'designs.deletedShareFailed', { filePath: row.filePath })}
    details={row.failed ? t('ds.actionFailed') : undefined}
    tone={loading ? 'loading' : 'error'}
    actionLabel={loading ? undefined : t('designs.deletedShareRetry')}
    onAction={loading ? undefined : () => { void state.retry(notice, row); }}
    onDismiss={() => state.dismissRow(notice.id, row)}
  />;
}
