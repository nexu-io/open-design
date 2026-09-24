import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useShareScopeKeyboard } from './useShareScopeKeyboard';
import { Button } from '@open-design/components';
import { workspaceContextHasTeamIdentity, type WorkspaceCollabContext } from '@open-design/contracts';
import type { PublicFilePublishFailureKey } from '../../collab/public-file-publish';
import type { useT } from '../../i18n';
import { RemixIcon } from '../RemixIcon';
import styles from './ShareTab.module.css';

export type SharePublishFailureKey = PublicFilePublishFailureKey | 'fileViewer.publishFileTooLarge' | 'fileViewer.unpublishFileFailed';

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
  publishCurrentFilePublic: () => Promise<void>;
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
                      {canPublishPublic ? (
                      <>
                      <div className={styles.linkAccessHeading}>
                        <div className={styles.linkAccessRow}>
                          <span className={styles.linkAccessLabel}>{t('fileViewer.linkAccessTitle')}</span>
                          <span className={styles.linkAccessRowEnd}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={filePublished}
                            aria-label={t('fileViewer.linkAccessTitle')}
                            className={`${styles.linkAccessToggle}${filePublished ? ` ${styles.linkAccessToggleOn}` : ''}`}
                            disabled={viewerOnly || publishingPublicFile || streaming}
                            title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                            onClick={() => {
                              // The switch IS the publish/unpublish control (board S4 has
                              // no separate "stop sharing" button — see the evidence file
                              // for why this replaces, rather than duplicates, that action).
                              void (filePublished ? unpublishCurrentFilePublic() : publishCurrentFilePublic());
                            }}
                          >
                            <span className={styles.linkAccessToggleThumb} aria-hidden="true" />
                          </button>
                          <Button
                            type="button"
                            className="share-menu-help od-tooltip"
                            aria-label={t('fileViewer.publishSingleFileDescription')}
                            data-tooltip={t('fileViewer.publishSingleFileDescription')}
                            data-tooltip-placement="top"
                            onClick={event => event.stopPropagation()}
                          >
                            <RemixIcon name="question-line" size={14} />
                          </Button>
                          </span>
                        </div>
                        <p className={styles.linkAccessDescription}>{t('fileViewer.linkAccessDescription')}</p>
                      </div>
                      {filePublished && publishProgress !== null ? (
                        <progress max={1} value={publishProgress} aria-label={t('fileViewer.publishingFile')} />
                      ) : null}
                      {filePublished ? (
                        <div className="chrome-publish-plain">
                          <div className={`chrome-publish-url${publishLinkFeedback === 'failed' ? ` ${styles.copyFallback}` : ''}`} title={publishedFileUrl}>
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
                                  ? t('fileViewer.copied')
                                  : t('fileViewer.copyShareLink')}
                              </Button>
                              <button
                                type="button"
                                className="chrome-publish-button chrome-publish-button--ghost"
                                disabled={viewerOnly || publishingPublicFile}
                                title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                                onClick={() => {
                                  void unpublishCurrentFilePublic();
                                }}
                              >
                                {t('fileViewer.unpublishFile')}
                              </button>
                          </div>
                          {publishLinkFeedback === 'failed' ? (
                            <p className={styles.copyHint} role="status">{t('fileViewer.copyLinkManually')}</p>
                          ) : null}
                        </div>
                      ) : (
                        <PublishProgressFrame value={publishProgress} label={t('fileViewer.uploadingFile')}>
                        <Button
                          type="button"
                          className={`${styles.copyButton}${publishingPublicFile && publishProgress !== null ? ` ${styles.publishingButton}` : ''}`}
                          role="menuitem"
                          disabled={streaming || viewerOnly || publishingPublicFile}
                          aria-busy={publishingPublicFile}
                          title={viewerOnly ? viewerOnlyDisabledTitle : streaming ? t('fileViewer.shareAfterGenerationComplete') : undefined}
                          onClick={() => {
                            void publishCurrentFilePublic();
                          }}
                        >
                          {publishingPublicFile ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false" className="icon-spin">
                              <path d="M12 3a9 9 0 1 0 9 9" />
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
                            ? `${t('fileViewer.uploadingFile')}${publishProgress !== null ? ` ${Math.round(publishProgress * 100)}%` : ''}`
                            : publishFailureKey === 'fileViewer.publishFileFailed' || publishFailureKey === 'fileViewer.publishFileTooLarge'
                              ? t('preview.retry')
                              : t('fileViewer.generateAndCopyLink')}</span>
                        </Button>
                        </PublishProgressFrame>
                      ) }
                      {publishingPublicFile && !filePublished ? (
                        <p className={styles.publishHint}>{t('fileViewer.publishingContinuesOnClose')}</p>
                      ) : null}
                      {publishFailureKey ? (
                        <p className={styles.publishError} role="status">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <circle cx="8" cy="8" r="6.2" />
                            <path d="M8 4.8v3.6M8 11h.01" />
                          </svg>
                          <span>{t(publishFailureKey)}</span>
                        </p>
                      ) : null}
                      </>
                      ) : null}
                      {/* Team-only, same as ReactComponentViewer's copy of this card above —
                          see the comment there (recvq5bM78HWCE). */}
                      {menuOrigin === 'toolbar' && workspaceContextHasTeamIdentity(workspaceContext) ? (
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
                                  window.open(sharePageUrl, '_blank', 'noopener');
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
                      </div>
  );
}
