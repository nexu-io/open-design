import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { fetchProjectFileSharePlan } from '../../providers/registry';
import type { SharePlanSummary } from '@open-design/contracts';
import { useShareScopeKeyboard } from './useShareScopeKeyboard';
import { Button } from '@open-design/components';
import { SHARE_MAX_TOTAL_BYTES, shareEntryPresentation, workspaceContextHasTeamIdentity, type ShareContentFreshness, type WorkspaceCollabContext } from '@open-design/contracts';
import type { PublicFilePublishFailureKey } from '../../collab/public-file-publish';
import type { useT } from '../../i18n';
import { RemixIcon } from '../RemixIcon';
import { CloudSignInTip } from '../CloudSignInTip';
import { CommentSyncBanner } from './CommentSyncBanner';
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

/** Keep idle markup unchanged; native progress and its action share one busy row. */
function PublishProgressFrame({ value, label, children }: { value: number | null; label: string; children: ReactNode }) {
  if (value === null) return <>{children}</>;
  return (
    <div className={styles.publishControl}>
      <progress className={styles.publishProgress} max={1} value={value} aria-label={label} />
      {children}
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
  const [sharePlanFailed, setSharePlanFailed] = useState(false);
  const [showShareExclusions, setShowShareExclusions] = useState(false);
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
    setSharePlanFailed(false);
    if (!projectId || !filePath || !canPublishPublic || viewerOnly || publicationStatus === 'stopped') { setSharePlanPending(false); return; }
    setSharePlanPending(true);
    void fetchProjectFileSharePlan(projectId, filePath, workspaceContext).then(
      (plan) => { if (!cancelled) { setSharePlan(plan); setSharePlanPending(false); } },
      () => { if (!cancelled) { setSharePlan(null); setSharePlanPending(false); setSharePlanFailed(true); } },
    );
    return () => { cancelled = true; };
  }, [projectId, filePath, workspaceContext, canPublishPublic, viewerOnly, publicationStatus]);
  const planTooLarge = sharePlan?.exceedsSizeLimit === true;
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
                      <div className={styles.linkAccessHeading}>
                        <div className={styles.linkAccessRow}>
                          <span className={styles.linkAccessLabel}>{t('fileViewer.linkAccessTitle')}</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={linkAccessChecked}
                            aria-label={t('fileViewer.linkAccessTitle')}
                            className={`${styles.linkAccessToggle}${linkAccessChecked ? ` ${styles.linkAccessToggleOn}` : ''}`}
                            disabled={!canMutatePublicShare || viewerOnly || publishingPublicFile || (!filePublished && (streaming || sharePlanPending))}
                            title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                            onClick={() => {
                              if (!canMutatePublicShare || viewerOnly) return;
                              if (filePublished) void unpublishCurrentFilePublic();
                              else if (publicationStatus === 'stopped') void publishCurrentFilePublic('resume');
                              else setPrepublishLinkAccess(value => !value);
                            }}
                          >
                            <span className={styles.linkAccessToggleThumb} aria-hidden="true" />
                          </button>
                        </div>
                        <p className={styles.linkAccessDescription}>{t('fileViewer.linkAccessDescription')}</p>
                      </div>
                      {publishFailureKey ? (
                        <p className={styles.publishError} role="status">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
                            <circle cx="8" cy="8" r="6.2" />
                            <path d="M8 4.8v3.6M8 11h.01" />
                          </svg>
                          <span>{t(publishFailureKey)}</span>
                        </p>
                      ) : null}
                      {planTooLarge && sharePlan ? (
                        <p className={styles.sharePlanWarning} role="alert">
                          {t('fileViewer.publishFileTooLarge')}
                          {' '}({(sharePlan.totalBytes / 1048576).toFixed(2)} MiB / {SHARE_MAX_TOTAL_BYTES / 1048576} MiB; {sharePlan.totalBytes} / {SHARE_MAX_TOTAL_BYTES} B)
                        </p>
                      ) : null}
                      {filePublished ? (
                        <>
                        <div className={`chrome-publish-plain ${styles.publishedLink}`}>
                          <div className="chrome-publish-url" title={publishedFileUrl}>
                              <RemixIcon name="link" size={12} className={styles.publishedLinkIcon} />
                              {publishedFileUrl}
                            </div>
                            <div className="chrome-publish-actions">
                              <Button
                                type="button"
                                className={styles.copyButton}
                                disabled={streaming || copyingLink}
                                aria-busy={copyingLink || undefined}
                                title={streaming ? t('fileViewer.shareAfterGenerationComplete') : undefined}
                                onClick={() => {
                                  void handleCopyPublishedFileLink();
                                }}
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox={!copyingLink && publishLinkFeedback === 'copied' ? '0 0 16 16' : '0 0 24 24'}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={copyingLink ? 2 : 1.8}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                  focusable="false"
                                  className={copyingLink ? 'icon-spin' : publishLinkFeedback === 'copied' ? styles.copiedIcon : undefined}
                                >
                                  <path d={copyingLink
                                    ? 'M12 3a9 9 0 1 0 9 9'
                                    : publishLinkFeedback === 'copied'
                                    ? 'm3 8 3 3 7-7'
                                    : 'M10 13.5a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 10.5a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l1.7-1.7'} />
                                </svg>
                                {copyingLink
                                  ? t('fileViewer.copyingLink')
                                  : publishLinkFeedback === 'copied'
                                  ? t('preview.shareCopied')
                                  : t('fileViewer.copyShareLink')}
                              </Button>
                          </div>
                          {publishLinkFeedback === 'failed' ? (
                            <p className={styles.copyHint} role="status">{t('fileViewer.copyLinkManually')}</p>
                          ) : null}
                        </div>
                        {!canMutatePublicShare && canResumeUpdateAfterLogin ? (
                          <div className={styles.updateNotice}>
                            <p>{t('fileViewer.shareOutdatedSignInHint')}</p>
                            <CloudSignInTip sharePrompt className={styles.signInAction}
                              actionLabel={t('fileViewer.signInToUpdate')}
                              onLoginSuccess={onUpdateLoginSuccess} />
                          </div>
                        ) : null}
                        {updateAvailable ? (
                          <div className={styles.updateNotice}>
                            <p>{t('fileViewer.shareUpdateHint')}</p>
                            <Button
                              type="button"
                              className={styles.updateButton}
                              disabled={!canMutatePublicShare || viewerOnly || streaming || publishingPublicFile || sharePlanPending || planTooLarge}
                              aria-busy={publishingPublicFile || undefined}
                              onClick={() => { if (canMutatePublicShare && !viewerOnly) void updateCurrentFilePublic?.(); }}
                            >
                              {t('fileViewer.shareUpdateLink')}
                            </Button>
                          </div>
                        ) : null}
                        </>
                      ) : (
                        <>
                        {sharePlanFailed ? (
                          <div className={styles.sharePlanWarning} role="alert">{t('fileViewer.sharePlanUnavailable')}</div>
                        ) : null}
                        {sharePlan && Array.isArray(sharePlan.exclusions) && sharePlan.exclusions.length > 0 ? (
                          <div className={styles.sharePlanWarning} role="status">
                            <p>{t('fileViewer.shareMissingRefs')}</p>
                            <button type="button" onClick={() => setShowShareExclusions(value => !value)} aria-expanded={showShareExclusions}>
                              {t('fileViewer.shareMissingRefsToggle')} ({sharePlan.exclusions.length})
                            </button>
                            {showShareExclusions ? <ul>{sharePlan.exclusions.map((item, index) => <li key={item.path + index}><code>{item.path}</code> — {item.reason === 'missing' ? t('fileViewer.shareMissingRefsToggle') : t('fileViewer.shareInvalidRefs')}</li>)}</ul> : null}
                          </div>
                        ) : null}
                        {publicationStatus !== 'stopped' || publishingPublicFile ? (
                        <PublishProgressFrame value={publicationStatus === 'stopped' ? null : publishProgress} label={t('fileViewer.uploadingFile')}>
                        <Button
                          type="button"
                          className={`${styles.copyButton}${publishingPublicFile && publicationStatus !== 'stopped' && publishProgress !== null ? ` ${styles.publishingButton}` : ''}`}
                          role="menuitem"
                          disabled={streaming || viewerOnly || publishingPublicFile || sharePlanPending || planTooLarge || (initialUnpublished && !prepublishLinkAccess)}
                          aria-busy={publishingPublicFile}
                          title={viewerOnly ? viewerOnlyDisabledTitle : streaming ? t('fileViewer.shareAfterGenerationComplete') : undefined}
                          onClick={() => {
                            void publishCurrentFilePublic(publicationStatus === 'stopped' ? 'resume' : undefined);
                          }}
                        >
                          {publishingPublicFile ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false" className="icon-spin">
                              <path d="M12 3a9 9 0 1 0 9 9" />
                            </svg>
                          ) : publishFailureKey === 'fileViewer.publishFileFailed' ? (
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M20 7v5h-5M4.9 9a8 8 0 0 1 13.6-3L20 8M4 17v-5h5m6.1 3a8 8 0 0 1-13.6 3L4 16" />
                            </svg>
                          ) : (
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M12 15V4m-4 4 4-4 4 4M5 20h14" />
                            </svg>
                          )}
                          <span>{publishingPublicFile
                            ? publicationStatus === 'stopped' ? '正在开启…' : `${t('fileViewer.uploadingFile')}${publishProgress !== null ? ` ${Math.round(publishProgress * 100)}%` : ''}`
                            : publishFailureKey === 'fileViewer.publishFileFailed' || publishFailureKey === 'fileViewer.publishFileTooLarge'
                              ? t('preview.retry')
                              : t('fileViewer.generateAndCopyLink')}</span>
                        </Button>
                        </PublishProgressFrame>
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
                            <p className={styles.linkAccessDescription}>{t(canResumeUpdateAfterLogin ? 'fileViewer.shareOutdatedSignInHint' : 'fileViewer.publishFileRequiresWorkspace')}</p>
                          </div>
                          {filePublished && publishedFileUrl ? (
                            <div className={styles.publishedLink}>
                              <span className="chrome-publish-url" title={publishedFileUrl}>{publishedFileUrl}</span>
                              <Button type="button" className={styles.copyButton} disabled={streaming || copyingLink}
                                aria-busy={copyingLink || undefined}
                                onClick={() => { void handleCopyPublishedFileLink(); }}>
                                {copyingLink ? t('fileViewer.copyingLink') : publishLinkFeedback === 'copied' ? t('fileViewer.copied') : t('fileViewer.copyShareLink')}
                              </Button>
                            </div>
                          ) : null}
                          <CloudSignInTip sharePrompt className={styles.signInAction}
                            actionLabel={canResumeUpdateAfterLogin ? t('fileViewer.signInToUpdate') : undefined}
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
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                                <path d="m4 6 4 4 4-4" />
                              </svg>
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
                                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                                        <path d="m3 8 3 3 7-7" />
                                      </svg>
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
