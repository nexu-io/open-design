import type { Dispatch, SetStateAction } from 'react';
import { workspaceContextHasTeamIdentity, type SocialShareResponse, type WorkspaceCollabContext } from '@open-design/contracts';
import type { PublicFilePublishFailureKey } from '../../collab/public-file-publish';
import type { useT } from '../../i18n';
import type { WebDeployProviderId } from '../../providers/registry';
import type { DeployProviderOption } from '../FileViewer';
import { RemixIcon } from '../RemixIcon';
import { SocialShareGrid } from '../SocialShareGrid';

export function ShareTab({
  menuOrigin,
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
  unpublishCurrentFilePublic,
  viewerOnlyDisabledTitle,
  publishCurrentFilePublic,
  publishFailureKey,
  activeProjectSocialShare,
  shareableDeploymentUrl,
  DEPLOY_PROVIDER_OPTIONS,
  streaming,
  openDeployModal,
  deployActionIconFor,
  deployActionLabelFor,
  sharePageUrl,
  canCopyShareLink,
  shareUnavailableHint,
  copyShareLink,
  copyShareLinkLabel,
  canOpenSharePage,
  shareLinkStatusHint,
}: {
  menuOrigin: 'toolbar' | 'artifact-card';
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
  unpublishCurrentFilePublic: () => Promise<void>;
  viewerOnlyDisabledTitle: string;
  publishCurrentFilePublic: () => Promise<void>;
  publishFailureKey: PublicFilePublishFailureKey | null;
  activeProjectSocialShare: SocialShareResponse | null;
  shareableDeploymentUrl: string;
  DEPLOY_PROVIDER_OPTIONS: DeployProviderOption[];
  streaming: boolean;
  openDeployModal: (nextProviderId?: WebDeployProviderId, intent?: 'deploy' | 'social-share') => Promise<void>;
  deployActionIconFor: (providerId: WebDeployProviderId) => 'pages-line' | 'upload-cloud-line';
  deployActionLabelFor: (providerId: WebDeployProviderId) => string;
  sharePageUrl: string;
  canCopyShareLink: boolean;
  shareUnavailableHint: string;
  copyShareLink: (url: string) => Promise<boolean>;
  copyShareLinkLabel: string;
  canOpenSharePage: boolean;
  shareLinkStatusHint: string;
}) {
  return (
                      <div className="chrome-unified-panel chrome-unified-panel--share">
                      {/* Team-only, same as ReactComponentViewer's copy of this card above —
                          see the comment there (recvq5bM78HWCE). */}
                      {menuOrigin === 'toolbar' && workspaceContextHasTeamIdentity(workspaceContext) ? (
                      <>
                      {/* Access control gets the same section-label + row treatment as the
                          publish / deploy / save tiers below; its explanation moves into the
                          trailing "?" instead of a card sub-line. */}
                      <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                        <span>{t('fileViewer.workspaceShareTitle')}</span>
                        <button
                          type="button"
                          className="share-menu-help od-tooltip"
                          data-testid="workspace-access-help"
                          aria-label={shareAccess === 'private'
                            ? t('fileViewer.workspaceSharePrivateDescription')
                            : t('fileViewer.workspaceShareWorkspaceDescription')}
                          data-tooltip={shareAccess === 'private'
                            ? t('fileViewer.workspaceSharePrivateDescription')
                            : t('fileViewer.workspaceShareWorkspaceDescription')}
                          data-tooltip-placement="top"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RemixIcon name="question-line" size={14} />
                        </button>
                      </div>
                      <div className="chrome-access-select">
                          <button
                            type="button"
                            className="chrome-access-trigger"
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
                            <RemixIcon name="arrow-down-s-line" size={16} />
                          </button>
                          {shareAccessMenuOpen ? (
                            <div className="chrome-access-options" role="listbox">
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
                                  {shareAccess === value ? <RemixIcon name="check-line" size={15} /> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                      ) : null}
                      {/* Publishing is a menu row like every other action in
                          this panel (deploy, save-as-template): same section
                          label, same icon + label row, with a trailing "?"
                          whose tooltip explains reach and the single-file
                          limitation. The published state swaps the row for the
                          link block (content, not an action). */}
                      {canPublishPublic ? (
                      <>
                      {/* The "?" lives on the section label, not inside the publish
                          menuitem: activating it is a help-discovery gesture, and
                          nesting it in the row would make that gesture publish a
                          public link (no hover-only path exists on touch). Same
                          structure as the workspace-access help above. */}
                      <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                        <span>{t('fileViewer.shareMenuPublishViaOd')}</span>
                        <button
                          type="button"
                          className="share-menu-help od-tooltip"
                          data-testid="publish-help"
                          aria-label={t('fileViewer.publishSingleFileDescription')}
                          data-tooltip={t('fileViewer.publishSingleFileDescription')}
                          data-tooltip-placement="top"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RemixIcon name="question-line" size={14} />
                        </button>
                      </div>
                      {filePublished ? (
                        <div className="chrome-publish-plain">
                          <div className="chrome-publish-url" title={publishedFileUrl}>
                              {publishedFileUrl}
                            </div>
                            <div className="chrome-publish-actions">
                              <button
                                type="button"
                                className="chrome-publish-button"
                                onClick={() => {
                                  void copyPublishedFileLink();
                                }}
                              >
                                <RemixIcon name="file-copy-line" size={14} />
                                {publishLinkFeedback === 'copied'
                                  ? t('fileViewer.copied')
                                  : publishLinkFeedback === 'failed'
                                    ? t('useEverywhere.copyFailed')
                                    : t('fileViewer.copyShareLink')}
                              </button>
                              <button
                                type="button"
                                className="chrome-publish-button chrome-publish-button--ghost"
                                disabled={publishingPublicFile}
                                onClick={() => {
                                  void unpublishCurrentFilePublic();
                                }}
                              >
                                {t('fileViewer.unpublishFile')}
                              </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          disabled={viewerOnly || publishingPublicFile}
                          aria-busy={publishingPublicFile}
                          title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                          onClick={() => {
                            void publishCurrentFilePublic();
                          }}
                        >
                          <span className="share-menu-icon">
                            <RemixIcon
                              name={publishingPublicFile ? 'loader-4-line' : 'upload-cloud-2-line'}
                              size={15}
                              className={publishingPublicFile ? 'icon-spin' : undefined}
                            />
                          </span>
                          <span>{publishingPublicFile ? t('fileViewer.publishingFile') : t('fileViewer.publishSingleFileTitle')}</span>
                        </button>
                      ) }
                      {publishFailureKey ? (
                        <p className="chrome-publish-error" role="status">
                          {t(publishFailureKey)}
                        </p>
                      ) : null}
                      </>
                      ) : null}
                      {menuOrigin === 'toolbar' ? (
                        <>
                          {/* Icons only for a clean link. Artifact-card Share is
                              intentionally narrower: Quick Share above only. */}
                          {activeProjectSocialShare && (shareableDeploymentUrl || publishedFileUrl) ? (
                            <>
                              <div className="share-menu-section-label" role="presentation">
                                {t('socialShare.projectSection')}
                              </div>
                              <SocialShareGrid share={activeProjectSocialShare} />
                            </>
                          ) : null}
                          <div className="share-menu-divider" />
                          <div className="share-menu-section-label" role="presentation">
                            {t('fileViewer.shareMenuPublishOnline')}
                          </div>
                          {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className="share-menu-item"
                              role="menuitem"
                              disabled={streaming || viewerOnly}
                              title={
                                viewerOnly
                                  ? viewerOnlyDisabledTitle
                                  : streaming
                                    ? t('fileViewer.shareAfterGenerationComplete')
                                    : undefined
                              }
                              onClick={() => {
                                void openDeployModal(option.id);
                              }}
                            >
                              <span className="share-menu-icon"><RemixIcon name={deployActionIconFor(option.id)} size={15} /></span>
                              <span>{deployActionLabelFor(option.id)}</span>
                            </button>
                          ))}
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
