import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchProjectFileSharePlan } from '../../providers/registry';
import type { SharePlanSummary } from '@open-design/contracts';
import { useShareScopeKeyboard } from './useShareScopeKeyboard';
import { Button } from '@open-design/components';
import { ShareButton } from './ShareButton';
import { SHARE_MAX_TOTAL_BYTES, shareEntryPresentation, workspaceContextHasTeamIdentity, type ShareContentFreshness, type WorkspaceCollabContext } from '@open-design/contracts';
import type { PublicFilePublishFailureKey } from '../../collab/public-file-publish';
import type { useT } from '../../i18n';
import { RemixIcon } from '../RemixIcon';
import { Icon } from '../Icon';
import { ShareSignInButton } from './ShareSignInButton';
import { CommentSyncBanner } from './CommentSyncBanner';
import { useCommentSyncState } from './useCommentSyncState';
import { LinkAccessRow } from './LinkAccessRow';
import { ShareNoticeRow } from './ShareNoticeRow';
import { ShareErrorRow } from './ShareErrorRow';
import { ShareProgressButton } from './ShareProgressButton';
import styles from './ShareTab.module.css';
export type SharePublishFailureKey = PublicFilePublishFailureKey | 'fileViewer.publishFileTooLarge' | 'fileViewer.unpublishFileFailed';

/** Deployment custom domains may vary; only open browser-safe HTTP(S) URLs. */
function browsableSharePageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Time-based waiting feedback, not transferred bytes. Only success may reach 1. */
export function boundedPublishProgress(elapsedMs: number, completed: boolean): number {
  if (completed) return 1;
  const elapsed = Number.isNaN(elapsedMs) ? 0 : Math.max(0, elapsedMs);
  return Math.min(0.9, 0.9 * (1 - Math.exp(-elapsed / 5000)));
}

/** Keep copy/copied/copying icons and labels identical across every published state. */
export function ShareCopyLinkIcon({ copying, copied }: { copying: boolean; copied: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox={!copying && copied ? '0 0 16 16' : '0 0 24 24'}
      fill="none"
      stroke="currentColor"
      strokeWidth={copying ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={copying ? 'icon-spin' : copied ? styles.copiedIcon : undefined}
    >
      <path d={copying
        ? 'M12 3a9 9 0 1 0 9 9'
        : copied
        ? 'm3 8 3 3 7-7'
        : 'M10 13.5a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 10.5a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l1.7-1.7'} />
    </svg>
  );
}

/**
 * S3/S4/S5/S13/K5: the one published-link block (chain-icon URL row + dark
 * copy button). Signed-in, signed-in-prompt, and the app-level signed-out
 * fallback all render this so a published link never changes shape with
 * session state.
 */
export function SharePublishedLinkControls({ url, copying, feedback, disabled = false, title, onCopy, t }: {
  url: string;
  copying: boolean;
  feedback: 'copied' | 'failed' | null;
  disabled?: boolean;
  title?: string;
  onCopy: () => void;
  t: ReturnType<typeof useT>;
}) {
  const copied = !copying && feedback === 'copied';
  return (
    <div className={`chrome-publish-plain ${styles.publishedLink}`}>
      <div className={`chrome-publish-url ${styles.publishedUrl}`} title={url}>
        <RemixIcon name="link" size={12} className={styles.publishedLinkIcon} />
        {url}
      </div>
      <div className={`chrome-publish-actions ${styles.publishedActions}`}>
        <ShareButton
          variant="primary"
          hoverLighten={false}
          disabled={disabled || copying}
          aria-busy={copying || undefined}
          title={title}
          onClick={onCopy}
        >
          <ShareCopyLinkIcon copying={copying} copied={copied} />
          {copying
            ? t('fileViewer.copyingLink')
            : copied
            ? t('preview.shareCopied')
            : t('fileViewer.copyShareLink')}
        </ShareButton>
      </div>
      {feedback === 'failed' ? (
        <p className={styles.copyHint} role="status">{t('fileViewer.copyLinkManually')}</p>
      ) : null}
    </div>
  );
}

export function ShareTab({
  menuOrigin,
  publicationStatus = null,
  publicationFreshness = 'unknown',
  updateCurrentFilePublic,
  canResumeUpdateAfterLogin = false,
  onUpdateLoginSuccess,
  projectId,
  filePath,
  workspaceContext,
  t,
  shareAccess,
  shareAccessMenuOpen,
  shareAccessBusy,
  viewerOnly,
  setShareAccessMenuOpen,
  setWorkspaceShareAccess,
  canPublishPublic,
  filePublished,
  publishedFileUrl,
  copyPublishedFileLink,
  publishLinkFeedback,
  publishingPublicFile,
  publishProgress,
  unpublishCurrentFilePublic,
  viewerOnlyDisabledTitle,
  publishCurrentFilePublic,
  publishFailureKey,
  streaming,
  sharePageUrl,
  canCopyShareLink,
  shareUnavailableHint,
  copyShareLink,
  copyShareLinkLabel,
  canOpenSharePage,
  shareLinkStatusHint,
}: {
  menuOrigin: 'toolbar' | 'artifact-card';
  /** Exact file status from authoritative project share-state, not local URL presence. */
  publicationStatus?: 'active' | 'stopped' | null;
  publicationFreshness?: ShareContentFreshness;
  updateCurrentFilePublic?: () => Promise<void>;
  canResumeUpdateAfterLogin?: boolean;
  onUpdateLoginSuccess?: () => void;
  projectId?: string;
  filePath?: string;
  workspaceContext: WorkspaceCollabContext | null;
  t: ReturnType<typeof useT>;
  shareAccess: 'private' | 'workspace';
  shareAccessMenuOpen: boolean;
  shareAccessBusy: boolean;
  viewerOnly: boolean;
  setShareAccessMenuOpen: Dispatch<SetStateAction<boolean>>;
  setWorkspaceShareAccess: (nextAccess: 'private' | 'workspace') => void;
  canPublishPublic: boolean;
  filePublished: boolean;
  publishedFileUrl: string;
  copyPublishedFileLink: () => Promise<void>;
  publishLinkFeedback: 'copied' | 'failed' | null;
  publishingPublicFile: boolean;
  publishProgress: number | null;
  unpublishCurrentFilePublic: () => Promise<void>;
  viewerOnlyDisabledTitle: string;
  publishCurrentFilePublic: (mode?: 'resume') => Promise<void>;
  publishFailureKey: SharePublishFailureKey | null;
  streaming: boolean;
  sharePageUrl: string;
  canCopyShareLink: boolean;
  shareUnavailableHint: string;
  copyShareLink: (url: string) => Promise<boolean>;
  copyShareLinkLabel: string;
  canOpenSharePage: boolean;
  shareLinkStatusHint: string;
}) {
  const [copyingLink, setCopyingLink] = useState(false);
  const [sharePlan, setSharePlan] = useState<SharePlanSummary | null>(null);
  const [sharePlanPending, setSharePlanPending] = useState(false);
  // S1: selected link access is only an unpublished UI intent. It never
  // transfers bytes or creates a URL until Generate and copy is clicked.
  const [prepublishLinkAccess, setPrepublishLinkAccess] = useState(true);
  useEffect(() => { setPrepublishLinkAccess(true); }, [projectId, filePath]);
  // A retained personal-project URL may outlive the signed-in workspace context.
  // It remains readable/copyable, but mutations require an authenticated workspace.
  const canMutatePublicShare = canPublishPublic && workspaceContext !== null;
  const initialUnpublished = !filePublished && publicationStatus == null;
  const linkAccessChecked = filePublished || (initialUnpublished && prepublishLinkAccess);
  useEffect(() => {
    let cancelled = false;
    setSharePlan(null);
    if (!projectId || !filePath || !canPublishPublic || viewerOnly || publicationStatus === 'stopped') { setSharePlanPending(false); return; }
    setSharePlanPending(true);
    void fetchProjectFileSharePlan(projectId, filePath, workspaceContext).then(
      (plan) => { if (!cancelled) { setSharePlan(plan); setSharePlanPending(false); } },
      () => { if (!cancelled) { setSharePlan(null); setSharePlanPending(false); } },
    );
    return () => { cancelled = true; };
  }, [projectId, filePath, workspaceContext, canPublishPublic, viewerOnly, publicationStatus]);
  const planTooLarge = sharePlan?.exceedsSizeLimit === true;
  // K1/K4: while a comment backfill is pending, it replaces the primary
  // action itself (progress bar or busy button) instead of stacking a
  // second dark pill below a link the visitor can't fully trust yet.
  // Only fetch once something is actually published — comment backfill is
  // meaningless before that, and firing this request during the unpublished
  // first-share flow competes for share-plan network traffic to no purpose.
  const commentSyncState = useCommentSyncState(filePublished ? projectId : undefined, workspaceContext, { filePath });
  const backfillPending = filePublished && commentSyncState?.backfill?.state === 'pending'
    ? commentSyncState.backfill
    : null;
  // K1 design ("同步已有评论 · 12 条") names the initial batch size. An older
  // daemon that predates CommentBackfillState.total leaves it absent, not
  // zero — that keeps the indeterminate sweep and the generic sentence
  // instead of rendering "0 条" for a count nobody measured.
  const backfillTotal = typeof backfillPending?.total === 'number' && backfillPending.total > 0
    ? backfillPending.total
    : null;
  const backfillProgress = backfillTotal !== null && typeof backfillPending?.synced === 'number'
    ? Math.min(1, Math.max(0, backfillPending.synced / backfillTotal))
    : null;
  const updateAvailable = Boolean(updateCurrentFilePublic) && filePublished && shareEntryPresentation({
    status: publicationStatus ?? 'none', freshness: publicationFreshness,
  }).appearance === 'outdated';
  const copyInFlight = useRef(false);
  const { scopeTriggerRef, scopeOptionsRef, handleScopeKeyDown } = useShareScopeKeyboard({
    open: shareAccessMenuOpen,
    disabled: shareAccessBusy || viewerOnly,
    setOpen: setShareAccessMenuOpen,
  });

  // The host owns clipboard outcomes and their reset timer; only await its action here.
  async function handleCopyPublishedFileLink() {
    if (copyInFlight.current || streaming) return;
    copyInFlight.current = true;
    setCopyingLink(true);
    try {
      await copyPublishedFileLink();
    } finally {
      copyInFlight.current = false;
      setCopyingLink(false);
    }
  }

  return (
                      <div className={`chrome-unified-panel chrome-unified-panel--share ${styles.panel}`}>
                      {publicationStatus === 'stopped' && workspaceContext ? (
                        <p className={styles.publishHint} role="status">
                          {workspaceContext.workspaceType === 'personal'
                            ? t('fileViewer.commentSync.shareStoppedPersonal')
                            : t('fileViewer.commentSync.shareStoppedTeam')}
                        </p>
                      ) : null}
                      {canPublishPublic || filePublished ? (
                      <>
                      <LinkAccessRow
                        label={t('fileViewer.linkAccessTitle')}
                        description={t('fileViewer.linkAccessDescription')}
                        checked={linkAccessChecked}
                        disabled={!canMutatePublicShare || viewerOnly || publishingPublicFile || (!filePublished && (streaming || sharePlanPending))}
                        title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                        onToggle={() => {
                          if (!canMutatePublicShare || viewerOnly) return;
                          if (filePublished) void unpublishCurrentFilePublic();
                          else if (publicationStatus === 'stopped') void publishCurrentFilePublic('resume');
                          else setPrepublishLinkAccess(value => !value);
                        }}
                      />
                      {publishFailureKey ? (
                        <ShareErrorRow message={t(publishFailureKey)} />
                      ) : planTooLarge && sharePlan ? (
                        // No yellow advisory here (2026 UI audit: G4/S1/S2/S7/S15 — delete, no
                        // lighter replacement). A pre-check size block still leaves the button
                        // disabled below with no failed request to explain itself, so it borrows
                        // the same red error row a failed attempt would show.
                        <ShareErrorRow message={<>
                          {t('fileViewer.publishFileTooLarge')}
                          {' '}({(sharePlan.totalBytes / 1048576).toFixed(2)} MiB / {SHARE_MAX_TOTAL_BYTES / 1048576} MiB; {sharePlan.totalBytes} / {SHARE_MAX_TOTAL_BYTES} B)
                        </>} />
                      ) : null}
                      {filePublished ? (
                        backfillPending ? (
                        <div className={styles.syncStatus} role="status">
                          {backfillPending.reopened === true ? (
                            <ShareButton variant="primary" hoverLighten={false} disabled aria-busy="true">
                              <Icon name="share-spinner" size={13} strokeWidth={2} className="icon-spin" />
                              <span>{t('fileViewer.commentSync.reopenSyncBusy')}</span>
                            </ShareButton>
                          ) : (
                            <>
                            <ShareProgressButton
                              variant="sync"
                              determinate={backfillProgress !== null}
                              percent={backfillProgress ?? 0}
                              label={backfillTotal !== null
                                ? t('fileViewer.commentSync.backfillPendingCountBody', { count: backfillTotal })
                                : t('fileViewer.commentSync.backfillPendingBody')}
                            />
                            <p className={styles.publishHint}>{t('fileViewer.publishingContinuesOnClose')}</p>
                            </>
                          )}
                        </div>
                        ) : (
                        <>
                        <SharePublishedLinkControls
                          url={publishedFileUrl}
                          copying={copyingLink}
                          feedback={publishLinkFeedback}
                          disabled={streaming}
                          title={streaming ? t('fileViewer.shareAfterGenerationComplete') : undefined}
                          onCopy={() => { void handleCopyPublishedFileLink(); }}
                          t={t}
                        />
                        {!canMutatePublicShare && canResumeUpdateAfterLogin ? (
                          <ShareNoticeRow
                            message={t('fileViewer.shareOutdatedSignInHint')}
                            action={
                              <ShareSignInButton variant="soft"
                                actionLabel={t('fileViewer.signInToUpdate')}
                                onLoginSuccess={onUpdateLoginSuccess} />
                            }
                          />
                        ) : null}
                        {updateAvailable ? (
                          <ShareNoticeRow
                            message={t('fileViewer.shareUpdateHint')}
                            action={
                              <ShareButton
                                variant="soft"
                                disabled={!canMutatePublicShare || viewerOnly || streaming || publishingPublicFile || sharePlanPending || planTooLarge}
                                aria-busy={publishingPublicFile || undefined}
                                onClick={() => { if (canMutatePublicShare && !viewerOnly) void updateCurrentFilePublic?.(); }}
                              >
                                {t('fileViewer.shareUpdateLink')}
                              </ShareButton>
                            }
                          />
                        ) : null}
                        </>
                        )
                      ) : (
                        <>
                        {/* 2026 UI audit (G4/S1/S2/S7/S15): the plan-unavailable and
                            missing-refs advisories were yellow banners; deleted, no lighter
                            replacement. Neither ever blocked publishing (unlike planTooLarge
                            above), so there is no reason left to surface here. */}
                        {publicationStatus !== 'stopped' || publishingPublicFile ? (
                        <ShareProgressButton variant="upload" value={publicationStatus === 'stopped' ? null : publishProgress} label={t('fileViewer.uploadingFile')}>
                        <ShareButton
                          variant="primary"
                          hoverLighten={false}
                          transparentWhenBusy={publishingPublicFile && publicationStatus !== 'stopped' && publishProgress !== null}
                          role="menuitem"
                          disabled={streaming || viewerOnly || publishingPublicFile || sharePlanPending || planTooLarge || (initialUnpublished && !prepublishLinkAccess)}
                          aria-busy={publishingPublicFile}
                          title={viewerOnly ? viewerOnlyDisabledTitle : streaming ? t('fileViewer.shareAfterGenerationComplete') : undefined}
                          onClick={() => {
                            void publishCurrentFilePublic(publicationStatus === 'stopped' ? 'resume' : undefined);
                          }}
                        >
                          {publishingPublicFile ? (
                            <Icon name="share-spinner" size={13} strokeWidth={2} className="icon-spin" />
                          ) : publishFailureKey === 'fileViewer.publishFileFailed' ? (
                            <Icon name="share-refresh-arrows" size={13} strokeWidth={1.8} />
                          ) : (
                            <Icon name="share-upload-arrow" size={13} strokeWidth={1.8} />
                          )}
                          <span>{publishingPublicFile
                            ? publicationStatus === 'stopped' ? t('fileViewer.shareReopening') : `${t('fileViewer.uploadingFile')}${publishProgress !== null ? ` ${Math.round(publishProgress * 100)}%` : ''}`
                            : publishFailureKey === 'fileViewer.publishFileFailed' || publishFailureKey === 'fileViewer.publishFileTooLarge'
                              ? t('preview.retry')
                              : t('fileViewer.generateAndCopyLink')}</span>
                        </ShareButton>
                        </ShareProgressButton>
                        ) : null}
                        </>
                      ) }
                      {publishingPublicFile && !filePublished && publicationStatus !== 'stopped' ? (
                        <p className={styles.publishHint}>{t('fileViewer.publishingContinuesOnClose')}</p>
                      ) : null}
                      </>
                      ) : (
                        <div className={styles.signInPrompt}>
                          <div className={styles.linkAccessHeading}>
                            <span className={styles.linkAccessLabel}>{t('fileViewer.linkAccessTitle')}</span>
                            <p className={styles.linkAccessDescription}>{t(canResumeUpdateAfterLogin ? 'fileViewer.shareOutdatedSignInHint' : 'fileViewer.signInToShareDescription')}</p>
                          </div>
                          {filePublished && publishedFileUrl ? (
                            <SharePublishedLinkControls
                              url={publishedFileUrl}
                              copying={copyingLink}
                              feedback={publishLinkFeedback}
                              disabled={streaming}
                              onCopy={() => { void handleCopyPublishedFileLink(); }}
                              t={t}
                            />
                          ) : null}
                          {/* S0: the sole full-width primary action when nothing has
                              ever been shared. When a stale link is already shown above
                              (the filePublished branch just above), this instead plays
                              S13's secondary "sign in to update" role next to it. */}
                          <ShareSignInButton variant={filePublished && publishedFileUrl ? 'soft' : 'primary'}
                            actionLabel={canResumeUpdateAfterLogin ? t('fileViewer.signInToUpdate') : t('fileViewer.signInToShare')}
                            onLoginSuccess={canResumeUpdateAfterLogin ? onUpdateLoginSuccess : undefined} />
                        </div>
                      )}
                      {/* Team-only, same as ReactComponentViewer's copy of this card above —
                          see the comment there (recvq5bM78HWCE). */}
                      {workspaceContextHasTeamIdentity(workspaceContext) ? (
                      <>
                      <div className={styles.scopeHeading}>
                        <div className={styles.scopeRow}>
                          <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                            <span>{t('fileViewer.workspaceVisibilityTitle')}</span>
                          </div>
                          <div className="chrome-access-select" onKeyDown={handleScopeKeyDown}>
                            <button
                              type="button"
                              className="chrome-access-trigger"
                              ref={scopeTriggerRef}
                              aria-haspopup="listbox"
                              aria-expanded={shareAccessMenuOpen}
                              disabled={shareAccessBusy || viewerOnly}
                              onClick={() => setShareAccessMenuOpen((v) => !v)}
                            >
                              <span className="share-menu-icon">
                                {/* recvqaVLC3MNaQ: same spinner-over-disabled fix as the
                                    ReactComponentViewer copy of this card above. */}
                                <RemixIcon
                                  name={
                                    shareAccessBusy
                                      ? 'loader-4-line'
                                      : shareAccess === 'private'
                                        ? 'lock-line'
                                        : 'team-line'
                                  }
                                  size={16}
                                  className={shareAccessBusy ? 'icon-spin' : undefined}
                                />
                              </span>
                              <span>
                                {shareAccess === 'private'
                                  ? t('fileViewer.workspaceAccessPrivate')
                                  : t('fileViewer.workspaceAccessMembers')}
                              </span>
                              <Icon name="share-chevron-down" size={12} strokeWidth={1.5} />
                            </button>
                            {shareAccessMenuOpen ? (
                              <div className="chrome-access-options" role="listbox" ref={scopeOptionsRef}>
                                {([
                                  ['private', 'lock-line', t('fileViewer.workspaceAccessPrivate')],
                                  ['workspace', 'team-line', t('fileViewer.workspaceAccessMembers')],
                                ] as const).map(([value, icon, label]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    role="option"
                                    aria-selected={shareAccess === value}
                                    className={shareAccess === value ? 'is-active' : undefined}
                                    disabled={shareAccessBusy || viewerOnly}
                                    onClick={() => void setWorkspaceShareAccess(value)}
                                  >
                                    <span className="share-menu-icon"><RemixIcon name={icon} size={16} /></span>
                                    <span>{label}</span>
                                    {shareAccess === value ? (
                                      <Icon name="share-check" size={13} strokeWidth={1.8} />
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p className={styles.scopeDescription}>
                          {shareAccess === 'private'
                            ? t('fileViewer.workspaceSharePrivateDescription')
                            : t('fileViewer.workspaceShareWorkspaceDescription')}
                        </p>
                      </div>
                      </>
                      ) : null}
                      {menuOrigin === 'toolbar' && sharePageUrl ? (
                        <>
                          <div className="share-menu-divider" />
                          <div className="share-menu-section-label" role="presentation">
                            {t('fileViewer.shareMenuPublishOnline')}
                          </div>
                          {sharePageUrl ? (
                            <>
                              <button
                                type="button"
                                className="share-menu-item"
                                role="menuitem"
                                disabled={!canCopyShareLink || viewerOnly}
                                title={
                                  viewerOnly
                                    ? viewerOnlyDisabledTitle
                                    : canCopyShareLink
                                      ? undefined
                                      : shareUnavailableHint
                                }
                                onClick={() => {
                                  void copyShareLink(sharePageUrl);
                                }}
                              >
                                <span className="share-menu-icon"><RemixIcon name="file-copy-line" size={15} /></span>
                                <span>{copyShareLinkLabel}</span>
                              </button>
                              <button
                                type="button"
                                className="share-menu-item"
                                role="menuitem"
                                disabled={!canOpenSharePage || viewerOnly}
                                title={
                                  viewerOnly
                                    ? viewerOnlyDisabledTitle
                                    : canOpenSharePage
                                      ? undefined
                                      : shareLinkStatusHint || shareUnavailableHint
                                }
                                onClick={() => {
                                  if (!canOpenSharePage) return;
                                  const url = browsableSharePageUrl(sharePageUrl);
                                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                }}
                              >
                                <span className="share-menu-icon"><RemixIcon name="external-link-line" size={15} /></span>
                                <span>{t('fileViewer.openSharePage')}</span>
                              </button>
                            </>
                          ) : null}
                          {sharePageUrl && (shareLinkStatusHint || shareUnavailableHint) ? (
                            <div className="share-menu-section-label" role="presentation">
                              {shareLinkStatusHint || shareUnavailableHint}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      {menuOrigin === 'toolbar' && filePublished ? (
                        <CommentSyncBanner projectId={projectId} workspaceContext={workspaceContext} filePath={filePath} backfillOnly />
                      ) : null}
                      </div>
  );
}
