import { useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AmrLoginPill } from '../AmrLoginPill';
import { useCommentSyncState } from './useCommentSyncState';
import styles from './CommentSyncBanner.module.css';

/**
 * Owner-side comment sync banner. Picks AT MOST ONE state to show, in this
 * priority order:
 *
 * 1. K8 `sessionMissing` — nothing can sync at all right now, so it outranks
 *    every other explanation.
 * 2. `shareStopped === true` — the link itself is off; backfill/align status
 *    about a dead link would be noise. `null` (could not be read) and `false`
 *    both render nothing here, per {@link CommentSyncState.shareStopped}: a
 *    failed read is not "not stopped", and it must not be guessed either way.
 * 3. Backfill `state === 'failed'` for the CURRENT publication — an absent or
 *    stale-revision backfill is silence, never a warning (the server already
 *    filters by current revision; see `readPublishedCommentBackfill`). The
 *    publish itself still succeeded and the link still works — this banner
 *    must never say otherwise or gate copy/share actions.
 * 4. Align `state === 'diverged'` — `unknown` and absent are NOT rendered as
 *    a problem (we did not check, which is not the same as finding a
 *    mismatch) and are NOT rendered as healthy either. They are silent.
 */
export function CommentSyncBanner({ projectId, workspaceContext, filePath }: {
  projectId?: string;
  workspaceContext?: WorkspaceCollabContext | null;
  filePath?: string;
}) {
  const { t } = useI18n();
  const [refreshToken, setRefreshToken] = useState(0);
  const [retrying, setRetrying] = useState<'backfill' | 'align' | null>(null);
  const state = useCommentSyncState(projectId, workspaceContext, { filePath, refreshToken });

  if (!state) return null;

  const retryHeaders = workspaceContext ? workspaceProjectHeaders(workspaceContext) : undefined;

  async function retryBackfill() {
    if (!projectId || retrying) return;
    setRetrying('backfill');
    try {
      const query = filePath ? `?filePath=${encodeURIComponent(filePath)}` : '';
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/comment-sync-state${query}`, {
        method: 'POST', cache: 'no-store', headers: retryHeaders,
      });
    } catch {
      // A failed retry attempt leaves the banner exactly as it was; the next
      // read (below) reports whatever the server actually has, never a
      // guess derived from this request's own outcome.
    } finally {
      setRetrying(null);
      setRefreshToken((token) => token + 1);
    }
  }

  async function retryAlign() {
    if (!projectId || retrying) return;
    setRetrying('align');
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/comments/align`, {
        method: 'POST', cache: 'no-store', headers: retryHeaders,
      });
    } catch {
      // Same rule as retryBackfill: no local guessing, just re-read.
    } finally {
      setRetrying(null);
      setRefreshToken((token) => token + 1);
    }
  }

  if (state.sessionMissing === true) {
    return (
      <div className={styles.banner} role="status">
        <p>{t('fileViewer.commentSync.sessionMissing')}</p>
        <AmrLoginPill className={styles.login} hideSignedOutStatus hideSignedInStatus showConsoleAction={false} />
      </div>
    );
  }

  if (state.shareStopped === true) {
    return (
      <div className={styles.banner} role="status">
        <p>
          {workspaceContext?.workspaceType === 'personal'
            ? t('fileViewer.commentSync.shareStoppedPersonal')
            : t('fileViewer.commentSync.shareStoppedTeam')}
        </p>
      </div>
    );
  }

  // Absent backfill means never attempted, not success — never rendered.
  // A stale-revision backfill is already filtered out server-side, so any
  // `backfill` this component sees describes the file's current publication.
  if (state.backfill?.state === 'failed') {
    return (
      <div className={styles.banner} role="status">
        <p className={styles.title}>{t('fileViewer.commentSync.backfillFailedTitle')}</p>
        <p>{t('fileViewer.commentSync.backfillFailedBody')}</p>
        {/* `retryable === true` means the server keeps retrying on its own —
            a manual button there would invite a redundant, possibly
            conflicting attempt. Only offer one when nothing else will. */}
        {!state.backfill.retryable ? (
          <button type="button" className={styles.retry} onClick={() => void retryBackfill()} disabled={retrying === 'backfill'}>
            {t('preview.retry')}
          </button>
        ) : null}
      </div>
    );
  }

  // Absent or `unknown` align is "not checked" — neither a warning nor a
  // clean bill of health. Only `diverged` is actionable.
  if (state.align?.state === 'diverged') {
    return (
      <div className={styles.banner} role="status">
        <p>{t('fileViewer.commentSync.alignFailedBody')}</p>
        <button type="button" className={styles.retry} onClick={() => void retryAlign()} disabled={retrying === 'align'}>
          {t('preview.retry')}
        </button>
      </div>
    );
  }

  return null;
}
