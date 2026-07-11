// Dumb share-menu popover for HtmlViewer's toolbar: the share-link copy/open
// actions, the per-provider "Deploy to X" entries, and the social-share
// entry. Props in, JSX out. The trigger button + open/close state
// (`deployMenuOpen`/`onToggleMenu`) are owned by a not-yet-extracted sibling
// cluster (the share/download chrome-menu open state) — threaded through as
// props here, same pattern `DeployModal` uses for `portalRoot`.
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import { trackShareOptionPopoverClick } from '../../../analytics/events';
import { RemixIcon } from '../../../components/RemixIcon';
import { DEPLOY_PROVIDER_OPTIONS } from '../constants';
import type { ArtifactTrackingAnalytics, TranslateFn } from '../types';
import type { ShareLinkCopyController } from '../hooks/useShareLinkCopy.hooks';
import type { DeployProviderId, SocialShareResponse } from '@open-design/contracts';

export interface ShareMenuProps {
  t: TranslateFn;
  analytics: ArtifactTrackingAnalytics;
  projectId: string;
  projectKind: TrackingProjectKind;
  fileName: string;
  fileKind: string | null;
  streaming: boolean;
  deployMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  shareMenuLabel: string;
  sharePageUrl: string;
  canCopyShareLink: boolean;
  canOpenSharePage: boolean;
  shareLinkStatusHint: string;
  shareUnavailableHint: string;
  shareLinkCopy: ShareLinkCopyController;
  fireShareExport: (
    format:
      | 'pdf' | 'pptx' | 'zip' | 'html' | 'image' | 'markdown'
      | 'template' | 'share_link' | 'share_page',
    fn: () => Promise<unknown> | unknown,
  ) => void;
  onShareGuideToast: (message: string) => void;
  onOpenInNewTab: (url: string) => void;
  onOpenDeployModal: (providerId: DeployProviderId) => void;
  deployActionIconFor: (providerId: DeployProviderId) => string;
  deployActionLabelFor: (providerId: DeployProviderId) => string;
  onOpenSocialShareFlow: () => void;
  activeProjectSocialShare: SocialShareResponse | null;
  socialShareMenuLabel: string;
}

export function ShareMenu({
  t,
  analytics,
  projectId,
  projectKind,
  fileName,
  fileKind,
  streaming,
  deployMenuOpen,
  onToggleMenu,
  onCloseMenu,
  shareMenuLabel,
  sharePageUrl,
  canCopyShareLink,
  canOpenSharePage,
  shareLinkStatusHint,
  shareUnavailableHint,
  shareLinkCopy,
  fireShareExport,
  onShareGuideToast,
  onOpenInNewTab,
  onOpenDeployModal,
  deployActionIconFor,
  deployActionLabelFor,
  onOpenSocialShareFlow,
  activeProjectSocialShare,
  socialShareMenuLabel,
}: ShareMenuProps) {
  return (
    <div className="share-menu chrome-share-menu">
      <button
        type="button"
        className="chrome-action chrome-action-secondary chrome-action-with-label chrome-action-text-only"
        aria-haspopup="menu"
        aria-expanded={deployMenuOpen}
        aria-label={shareMenuLabel}
        onClick={onToggleMenu}
      >
        <span>{shareMenuLabel}</span>
      </button>
      {deployMenuOpen ? (
        <div className="share-menu-popover" role="menu">
          <div className="share-menu-section-label" role="presentation">
            {t('fileViewer.shareMenuShareLink')}
          </div>
          {sharePageUrl ? (
            <>
              <button
                type="button"
                className="share-menu-item"
                role="menuitem"
                disabled={!canCopyShareLink}
                title={!canCopyShareLink ? shareUnavailableHint : shareLinkStatusHint || undefined}
                onClick={() => {
                  if (!canCopyShareLink || !sharePageUrl) return;
                  fireShareExport('share_link', async () => {
                    const ok = await shareLinkCopy.copyShareLink(sharePageUrl);
                    if (!ok) throw new Error('copy_share_link_failed');
                  });
                }}
              >
                <span className="share-menu-icon"><RemixIcon name="file-copy-line" size={15} /></span>
                <span className="share-menu-text">
                  <span>{shareLinkCopy.copyShareLinkLabel}</span>
                  {shareLinkStatusHint ? (
                    <small>{shareLinkStatusHint}</small>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className="share-menu-item"
                role="menuitem"
                disabled={!canOpenSharePage}
                title={!canOpenSharePage ? shareLinkStatusHint || shareUnavailableHint : shareLinkStatusHint || undefined}
                onClick={() => {
                  if (!canOpenSharePage || !sharePageUrl) return;
                  onCloseMenu();
                  fireShareExport('share_page', () => {
                    onOpenInNewTab(sharePageUrl);
                  });
                }}
              >
                <span className="share-menu-icon"><RemixIcon name="external-link-line" size={15} /></span>
                <span className="share-menu-text">
                  <span>{t('fileViewer.openSharePage')}</span>
                  {shareLinkStatusHint ? (
                    <small>{shareLinkStatusHint}</small>
                  ) : null}
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="share-menu-item share-menu-guide"
              role="menuitem"
              title={shareUnavailableHint}
              onClick={() => {
                // Share-intent-but-blocked signal: user wants a
                // share link but nothing is deployed yet.
                trackShareOptionPopoverClick(
                  analytics.track,
                  {
                    page_name: 'artifact',
                    area: 'share_option_popover',
                    artifact_id: anonymizeArtifactId({ projectId, fileName }),
                    artifact_kind: artifactKindToTracking({ fileKind }),
                    element: 'publish_required_guide',
                    project_id: projectId,
                    project_kind: projectKind,
                  },
                  { requestId: analytics.newRequestId() },
                );
                onShareGuideToast(shareUnavailableHint);
              }}
            >
              <span className="share-menu-icon"><RemixIcon name="link" size={15} /></span>
              <span className="share-menu-text">
                <span>
                  {streaming
                    ? t('fileViewer.shareAfterGenerationComplete')
                    : t('fileViewer.shareLinkPublishGuide')}
                </span>
              </span>
            </button>
          )}
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
              onClick={() => {
                // Just open the deploy modal. The real publish is
                // tracked by artifact_deploy_result from
                // deployToSelectedProvider — no "popover opened"
                // export event here.
                onOpenDeployModal(option.id);
              }}
            >
              <span className="share-menu-icon">
                <RemixIcon name={deployActionIconFor(option.id)} size={15} />
              </span>
              <span>{deployActionLabelFor(option.id)}</span>
            </button>
          ))}
          <div className="share-menu-divider" />
          <div className="share-menu-section-label" role="presentation">
            {t('socialShare.projectSection')}
          </div>
          <button
            type="button"
            className="share-menu-item"
            role="menuitem"
            onClick={() => {
              onCloseMenu();
              // Deploy-then-share also routes through the deploy
              // modal; the real publish is tracked by
              // artifact_deploy_result, not an export event.
              onOpenSocialShareFlow();
            }}
          >
            <span className="share-menu-icon">
              <RemixIcon
                name={activeProjectSocialShare ? 'share-forward-line' : 'upload-cloud-line'}
                size={15}
              />
            </span>
            <span>{socialShareMenuLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
