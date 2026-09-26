import { useT } from '../../i18n';
import { Toast } from '../Toast';
import type { useDeletedShareNotices } from './useDeletedShareNotices';

/** Show one global Toast at a time; a dismissal must not hide other failed files. */
export function DeletedShareNotices({ state }: { state: ReturnType<typeof useDeletedShareNotices> }) {
  const t = useT();
  const rows = state.notices.flatMap(notice => notice.rows.map(row => ({ notice, row })));
  const current = rows.find(({ row }) => !row.retrying) ?? rows[0];
  if (!current) return null;
  const { notice, row } = current;
  const loading = Boolean(row.retrying || row.busy);
  return <Toast
    key={JSON.stringify([notice.id, row.filePath, row.slug])}
    className="od-toast-share-feedback"
    message={t(row.retrying ? 'designs.deletedShareRetrying' : 'designs.deletedShareFailed', { filePath: row.filePath })}
    details={row.failed ? t('ds.actionFailed') : undefined}
    tone={loading ? 'loading' : 'error'}
    role={loading ? 'status' : 'alert'}
    placement="top"
    portalToBody
    ttlMs={0}
    actionLabel={loading ? undefined : t('designs.deletedShareRetry')}
    onAction={loading ? undefined : () => { void state.retry(notice, row); }}
    onDismiss={() => state.dismissRow(notice.id, row)}
  />;
}
