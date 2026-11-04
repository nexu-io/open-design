import { useEffect, useRef, useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AmrLoginPill } from '../AmrLoginPill';
import { Icon } from '../Icon';
import { useCommentSyncState } from './useCommentSyncState';
import { ShareNoticeRow } from './ShareNoticeRow';
import { ShareErrorRow } from './ShareErrorRow';
import { ShareButton } from './ShareButton';
import styles from './CommentSyncBanner.module.css';

/** The design's `.notice .secondary` retry glyph (K5 and the backfill/align retry rows). */
function RetryIcon() {
  return <Icon name="share-retry" size={13} strokeWidth={1.8} />;
}

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
export function CommentSyncBanner({ projectId, workspaceContext, filePath, includeBackfill = true, backfillOnly = false }: {
  projectId?: string;
  workspaceContext?: WorkspaceCollabContext | null;
  filePath?: string;
  includeBackfill?: boolean;
  backfillOnly?: boolean;
}) {
  const scope = JSON.stringify([projectId, workspaceAccountScopedCacheKey(workspaceContext), filePath]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [alignRetry, setAlignRetry] = useState<{ scope: string; status: 'pending' | 'failed' | 'succeeded' } | null>(null);
  const alignStatus = alignRetry?.scope === scope ? alignRetry.status : null;
  useEffect(() => {
    if (alignStatus !== 'succeeded') return;
    const timer = window.setTimeout(() => setAlignRetry(null), 1_500);
    return () => window.clearTimeout(timer);
  }, [alignStatus, scope]);
  const [retryError, setRetryError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const { t } = useI18n();
  const state = useCommentSyncState(projectId, workspaceContext, { filePath, refreshToken });

  const retryHeaders = workspaceContext ? workspaceProjectHeaders(workspaceContext) : undefined;

  async function retryBackfill() {
    setRetryError(false);
    if (!projectId || !filePath || retrying) return;
    setRetrying(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/comment-sync-state?filePath=${encodeURIComponent(filePath)}`, {
        method: 'POST', cache: 'no-store', headers: retryHeaders,
      });
      if (!response.ok) throw new Error(`Comment backfill retry failed: ${response.status}`);
    } catch {
      setRetryError(true);
      // The persisted GET state remains authoritative; background retries continue.
    } finally {
      setRetrying(false);
      setRefreshToken((token) => token + 1);
    }
  }
  async function retryAlign() {
    if (!projectId || alignStatus === 'pending') return;
    const requestScope = scope;
    setAlignRetry({ scope: requestScope, status: 'pending' });
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/comments/align`, {
        method: 'POST', cache: 'no-store', headers: retryHeaders,
      });
      if (!response.ok) throw new Error('Comment alignment retry failed');
      const result: unknown = await response.json();
      const status = result && typeof result === 'object' && 'state' in result ? result.state : undefined;
      if (currentScope.current !== requestScope) return;
      setAlignRetry({ scope: requestScope, status: status === 'aligned' ? 'succeeded' : 'failed' });
    } catch {
      if (currentScope.current !== requestScope) return;
      setAlignRetry({ scope: requestScope, status: 'failed' });
    } finally {
      if (currentScope.current === requestScope) setRefreshToken((token) => token + 1);
    }
  }

  const alignmentNotice = (
    <div className={`${styles.banner} ${styles.alignment}`} role={alignStatus === 'failed' ? 'alert' : 'status'} aria-busy={alignStatus === 'pending'}>
      <div className={styles.alignmentMessage}>
        {alignStatus === 'pending' ? <span className={styles.alignmentSpinner} aria-hidden="true" />
          : alignStatus === 'succeeded' ? <Icon name="check" size={15} />
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d={alignStatus === 'failed' ? 'M12 7v6m0 4h.01' : 'M12 11v6m0-10h.01'} />
            </svg>}
        <p>{t(alignStatus === 'pending' ? 'fileViewer.commentSync.alignRetryPending'
          : alignStatus === 'succeeded' ? 'fileViewer.commentSync.alignRetrySucceeded'
            : alignStatus === 'failed' ? 'fileViewer.commentSync.alignRetryFailed' : 'fileViewer.commentSync.alignFailedBody')}</p>
      </div>
      {alignStatus !== 'succeeded' ? (
        <button type="button" className={styles.alignmentRetry} onClick={() => void retryAlign()} disabled={alignStatus === 'pending'}>
          {alignStatus !== 'pending' ? <RetryIcon /> : null}
          {t(alignStatus === 'pending' ? 'fileViewer.commentSync.alignRetrying' : 'preview.retry')}
        </button>
      ) : null}
    </div>
  );
  // The manual request owns its short-lived feedback while the existing status
  // hook refreshes. Initial missing/unknown state still stays quiet.
  if (!state) return !backfillOnly && alignStatus ? alignmentNotice : null;
  if (backfillOnly && (state.sessionMissing || state.shareStopped === true)) return null;

  if (!backfillOnly && state.sessionMissing === true) {
    return (
      <div className={includeBackfill ? styles.banner : `${styles.banner} ${styles.alignment}`} role="status">
        <div className={styles.alignmentMessage}>
          {!includeBackfill ? <Icon name="info" size={15} /> : null}
          <p>{t('fileViewer.commentSync.sessionMissing')}</p>
        </div>
        <AmrLoginPill className={styles.login} hideSignedOutStatus hideSignedInStatus showConsoleAction={false} />
      </div>
    );
  }

  if (!backfillOnly && state.shareStopped === true) {
    return (
      <div className={includeBackfill ? styles.banner : `${styles.banner} ${styles.alignment}`} role="status">
        <div className={styles.alignmentMessage}>
          {!includeBackfill ? <Icon name="info" size={15} /> : null}
          <p>
            {workspaceContext?.workspaceType === 'personal'
              ? t('fileViewer.commentSync.shareStoppedPersonal')
              : t('fileViewer.commentSync.shareStoppedTeam')}
          </p>
        </div>
      </div>
    );
  }

  if (state.payloadTooLarge) {
    return includeBackfill
      ? <ShareErrorRow message={t('fileViewer.commentSync.payloadTooLarge')} role="alert" />
      : <div className={`${styles.banner} ${styles.alignment}`}><ShareErrorRow className={styles.neutral} message={t('fileViewer.commentSync.payloadTooLarge')} role="alert" /></div>;
  }

  // ShareTab owns its separate comment-progress region. Its backfillOnly
  // mount handles failure/retry here without duplicating that pending status.
  // Keep the non-backfillOnly pending presentation for existing consumers.
  if (includeBackfill && state.backfill?.state === 'pending') {
    if (backfillOnly) return null;
    const pendingCopyKey = state.backfill.reopened === true
      ? 'fileViewer.commentSync.backfillReopenedPendingBody'
      : 'fileViewer.commentSync.backfillPendingBody';
    return (
      <div className={backfillOnly ? `${styles.banner} ${styles.backfillOnly}` : styles.banner} role="status">
        <div className={styles.backfillProgress} aria-label={t(pendingCopyKey)}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>{t(pendingCopyKey)}</span>
        </div>
      </div>
    );
  }

  // Absent backfill means never attempted, not success — never rendered.
  // A stale-revision backfill is already filtered out server-side. Only a
  // verified stop→resume receipt tags this revision `reopened`; a stable URL
  // or UI history is not proof that visitors may still see deleted comments.
  if (includeBackfill && state.backfill?.state === 'failed') {
    return (
      <div className={backfillOnly ? `${styles.banner} ${styles.backfillOnly}` : styles.banner} role="status">
        <ShareNoticeRow
          className={styles.retrySpacing}
          message={t(state.backfill.reopened === true
            ? (state.backfill.retryable
              ? 'fileViewer.commentSync.backfillReopenedRetryingBody'
              : 'fileViewer.commentSync.backfillReopenedTerminalBody')
            : (state.backfill.retryable
              ? (state.backfill.code === 'BACKFILL_ENQUEUE_FAILED'
                ? 'fileViewer.commentSync.backfillFailedBody'
                : 'fileViewer.commentSync.backfillRetryingBody')
              : 'fileViewer.commentSync.backfillTerminalBody'))}
          action={state.backfill.retryable ? (
            <ShareButton
              variant={state.backfill.reopened === true ? 'soft-error' : 'soft'}
              dimDisabled
              onClick={() => void retryBackfill()}
              disabled={retrying}
            >
              <RetryIcon />
              {t('preview.retry')}
            </ShareButton>
          ) : undefined}
        />
        {/* OD-4 (allowed visual change): this was an unstyled grey `<p role="alert">`;
            it now uses the shared red-with-icon ShareErrorRow like every other
            share-panel error. `.banner p { margin: 0 }` still governs its spacing. */}
        {retryError ? <ShareErrorRow message={t('fileViewer.commentSync.backfillFailedBody')} role="alert" /> : null}
      </div>
    );
  }

  // Absent or `unknown` align is "not checked" — neither a warning nor a
  // clean bill of health. Only `diverged` is actionable.
  if (!backfillOnly && (state.align?.state === 'diverged' || alignStatus)) {
    return alignmentNotice;
  }

  return null;
}
