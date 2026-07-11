// Dumb deploy/publish modal for HtmlViewer: provider picker, credential form,
// Cloudflare Pages zone picker, deploy result cards, and the social-share
// panel. Props in, JSX out — every value here is owned by
// `hooks/useDeployFlow.hooks.ts` except `deployLinkCopy`, a separate
// already-extracted sibling hook the orchestrator still wires independently.
import type { MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../components/Icon';
import { RemixIcon } from '../../../components/RemixIcon';
import { SocialShareGrid } from '../../../components/SocialShareGrid';
import type { SocialShareResponse } from '@open-design/contracts';
import { CLOUDFLARE_PAGES_PROVIDER_ID, DEPLOY_PROVIDER_OPTIONS } from '../constants';
import { deployResultState, isValidCloudflareDomainPrefixInput } from '../rules';
import type {
  CloudflarePagesZoneOption,
  DeployProviderOption,
  DeployResultCard,
  TranslateFn,
} from '../types';
import type { DeployLinkCopyController } from '../hooks/useDeployLinkCopy.hooks';

export interface DeployModalProps {
  t: TranslateFn;
  onClose: () => void;
  deployModalKicker: string;
  deployModalTitle: string;
  deployModalSubtitle: string;
  activeProjectSocialShare: SocialShareResponse | null;
  socialShareBlockedState: ReturnType<typeof deployResultState> | null;
  socialShareDisplayUrl: string;
  socialShareUnavailableMessage: string;
  socialShareBlockedDeployment: { id: string; url: string } | null;
  deployLinkCopy: DeployLinkCopyController;
  activeDeployment: { id: string; status: string; statusMessage?: string } | null;
  deployPhase: 'idle' | 'deploying' | 'preparing-link';
  onRetryDeploymentLink: () => void;
  deployProviderId: string;
  onChangeDeployProvider: (nextProviderId: string) => void;
  deployProvider: DeployProviderOption;
  deployProviderLabel: string;
  deployTokenInputRef: MutableRefObject<HTMLInputElement | null>;
  deployToken: string;
  setDeployToken: (value: string) => void;
  savingDeployConfig: boolean;
  onSaveDeployConfig: () => void;
  deployConfig: { configured: boolean } | null;
  cloudflareAccountId: string;
  setCloudflareAccountId: (value: string) => void;
  cloudflareDomainPrefix: string;
  setCloudflareDomainPrefix: (value: string) => void;
  cloudflareZonesLoading: boolean;
  onLoadCloudflareZones: () => void;
  cloudflareZoneId: string;
  setCloudflareZoneId: (value: string) => void;
  cloudflareZones: CloudflarePagesZoneOption[];
  cloudflareZonesError: string | null;
  cloudflareHostnamePreview: string;
  teamId: string;
  setTeamId: (value: string) => void;
  teamSlug: string;
  setTeamSlug: (value: string) => void;
  deployError: string | null;
  deployResultCards: DeployResultCard[];
  statusLabelFor: (state: ReturnType<typeof deployResultState>) => string;
  deploying: boolean;
  onDeployToSelectedProvider: () => void;
  deployButtonLabel: string;
  /** Portal target (the orchestrator's `document.body`, guarded for SSR) — a bare `document` read is forbidden inside `features/**`. */
  portalRoot: Element;
}

export function DeployModal({
  t,
  onClose,
  deployModalKicker,
  deployModalTitle,
  deployModalSubtitle,
  activeProjectSocialShare,
  socialShareBlockedState,
  socialShareDisplayUrl,
  socialShareUnavailableMessage,
  socialShareBlockedDeployment,
  deployLinkCopy,
  activeDeployment,
  deployPhase,
  onRetryDeploymentLink,
  deployProviderId,
  onChangeDeployProvider,
  deployProvider,
  deployProviderLabel,
  deployTokenInputRef,
  deployToken,
  setDeployToken,
  savingDeployConfig,
  onSaveDeployConfig,
  deployConfig,
  cloudflareAccountId,
  setCloudflareAccountId,
  cloudflareDomainPrefix,
  setCloudflareDomainPrefix,
  cloudflareZonesLoading,
  onLoadCloudflareZones,
  cloudflareZoneId,
  setCloudflareZoneId,
  cloudflareZones,
  cloudflareZonesError,
  cloudflareHostnamePreview,
  teamId,
  setTeamId,
  teamSlug,
  setTeamSlug,
  deployError,
  deployResultCards,
  statusLabelFor,
  deploying,
  onDeployToSelectedProvider,
  deployButtonLabel,
  portalRoot,
}: DeployModalProps) {
  return createPortal(
    <div
      className="modal-backdrop viewer-modal-backdrop deploy-flow-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal deploy-modal deploy-flow-modal" role="dialog" aria-modal="true">
        <div className="deploy-flow-modal__scroll">
          <div className="modal-head">
            <div className="kicker">{deployModalKicker}</div>
            <h2>{deployModalTitle}</h2>
            <p className="subtitle">{deployModalSubtitle}</p>
          </div>
          <div className="deploy-form">
            <div className={`deploy-social-share${activeProjectSocialShare ? '' : ' is-locked'}${socialShareBlockedState ? ` is-${socialShareBlockedState}` : ''}`}>
              <div className="deploy-social-share__head">
                <div className="deploy-social-share__label">
                  {t('socialShare.projectSection')}
                </div>
                {socialShareDisplayUrl ? (
                  <a
                    className="deploy-social-share__url"
                    href={socialShareDisplayUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {socialShareDisplayUrl}
                  </a>
                ) : null}
              </div>
              {!activeProjectSocialShare || socialShareBlockedState ? (
                <p className="hint">{socialShareUnavailableMessage}</p>
              ) : null}
              {activeProjectSocialShare ? (
                <SocialShareGrid
                  share={activeProjectSocialShare}
                  onAfterShare={onClose}
                />
              ) : null}
              {socialShareBlockedDeployment?.url ? (
                <div className="deploy-social-share__actions">
                  <button
                    type="button"
                    className="viewer-action"
                    onClick={() => {
                      void deployLinkCopy.copyDeployLink(socialShareBlockedDeployment.url);
                    }}
                  >
                    <Icon name="copy" size={14} />
                    <span>{deployLinkCopy.copyDeployLabel(socialShareBlockedDeployment.url)}</span>
                  </button>
                  {activeDeployment?.id === socialShareBlockedDeployment.id ? (
                    <button
                      type="button"
                      className="viewer-action"
                      disabled={deployPhase === 'preparing-link'}
                      onClick={onRetryDeploymentLink}
                    >
                      {deployPhase === 'preparing-link'
                        ? t('fileViewer.preparingPublicLink')
                        : t('fileViewer.retryLink')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          <label className="deploy-provider-field">
            <span className="deploy-field-title">{t('fileViewer.deployProviderLabel')}</span>
            <select
              value={deployProviderId}
              onChange={(e) => onChangeDeployProvider(e.target.value)}
            >
              {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <div className="field-label-row deploy-token-label-row">
            <label htmlFor="deploy-token" className="deploy-field-title required">{t(deployProvider.tokenLabelKey)}</label>
            <a
              href={deployProvider.tokenLink}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t(deployProvider.tokenLinkKey)}
            </a>
          </div>
          <div className="deploy-token-input-row">
            <input
              ref={deployTokenInputRef}
              id="deploy-token"
              type="password"
              value={deployToken}
              placeholder={t(deployProvider.tokenPlaceholderKey, { provider: deployProviderLabel })}
              onChange={(e) => setDeployToken(e.target.value)}
            />
            <button
              type="button"
              className="ghost-link button-like"
              disabled={savingDeployConfig}
              onClick={onSaveDeployConfig}
            >
              {savingDeployConfig ? t('fileViewer.savingConfig') : t('fileViewer.save')}
            </button>
          </div>
          {deployConfig?.configured || deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
            <div className="deploy-token-hints">
              {deployConfig?.configured ? (
                <p className="hint">{t(deployProvider.tokenReuseHintKey, { provider: deployProviderLabel })}</p>
              ) : null}
              {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <p className="hint">{t('fileViewer.cloudflareApiTokenScopeHint')}</p>
              ) : null}
            </div>
          ) : null}
          {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
            <>
              <div className="deploy-field-grid single-field">
                <label>
                  <span className="deploy-field-title required">{t('fileViewer.cloudflareAccountId')}</span>
                  <input
                    value={cloudflareAccountId}
                    onChange={(e) => setCloudflareAccountId(e.target.value)}
                  />
                  <span className="field-hint">{t('fileViewer.cloudflareAccountIdHint')}</span>
                </label>
              </div>
              <div className="deploy-field-grid cloudflare-domain-grid">
                <label>
                  <span className="deploy-field-title">{t('fileViewer.cloudflareDomainPrefixLabel')}</span>
                  <input
                    value={cloudflareDomainPrefix}
                    placeholder={t('fileViewer.cloudflareDomainPrefixPlaceholder')}
                    onChange={(e) => setCloudflareDomainPrefix(e.target.value)}
                  />
                </label>
                <div className="deploy-field-control">
                  <span className="deploy-field-title-row">
                    <label className="deploy-field-title" htmlFor="cloudflare-zone-select">
                      {t('fileViewer.cloudflareZoneLabel')}
                    </label>
                    <button
                      type="button"
                      className="ghost-link deploy-field-inline-action"
                      disabled={cloudflareZonesLoading || !deployConfig?.configured}
                      onClick={onLoadCloudflareZones}
                    >
                      <RemixIcon name="refresh-line" size={13} />
                      {cloudflareZonesLoading ? t('fileViewer.cloudflareZonesLoading') : t('fileViewer.cloudflareZonesRefresh')}
                    </button>
                  </span>
                  <select
                    id="cloudflare-zone-select"
                    value={cloudflareZoneId}
                    disabled={cloudflareZonesLoading || (!deployConfig?.configured && !cloudflareZones.length)}
                    onChange={(e) => setCloudflareZoneId(e.target.value)}
                  >
                    {cloudflareZones.length === 0 ? (
                      <option value="">{t('fileViewer.cloudflareZonePlaceholder')}</option>
                    ) : null}
                    {cloudflareZones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {cloudflareZonesError ? (
                <p className="deploy-error">{cloudflareZonesError}</p>
              ) : cloudflareZonesLoading ? (
                <p className="hint">{t('fileViewer.cloudflareZonesLoading')}</p>
              ) : deployConfig?.configured && cloudflareZones.length === 0 ? (
                <p className="hint">{t('fileViewer.cloudflareZonesEmpty')}</p>
              ) : null}
              {cloudflareDomainPrefix.trim() && !isValidCloudflareDomainPrefixInput(cloudflareDomainPrefix) ? (
                <p className="deploy-error">{t('fileViewer.cloudflareDomainPrefixInvalid')}</p>
              ) : cloudflareHostnamePreview ? (
                <p className="hint">
                  {t('fileViewer.cloudflareHostnamePreview', { hostname: cloudflareHostnamePreview })}
                </p>
              ) : null}
            </>
          ) : (
            <div className="deploy-field-grid">
              <label>
                <span className="deploy-field-title">{t('fileViewer.vercelTeamId')}</span>
                <input
                  value={teamId}
                  placeholder={t('fileViewer.optional')}
                  onChange={(e) => setTeamId(e.target.value)}
                />
              </label>
              <label>
                <span className="deploy-field-title">{t('fileViewer.vercelTeamSlug')}</span>
                <input
                  value={teamSlug}
                  placeholder={t('fileViewer.optional')}
                  onChange={(e) => setTeamSlug(e.target.value)}
                />
              </label>
            </div>
          )}
          {deployError ? <p className="deploy-error">{deployError}</p> : null}
          {!deployError
            && deployPhase === 'idle'
            && deployResultCards.length > 0
            && deployResultState(activeDeployment?.status) === 'ready' ? (
            <p className="hint" role="status">
              {t('fileViewer.deployLinkReady')} · {t('fileViewer.deployResultLabel')}
            </p>
          ) : null}
          {deployResultCards.length > 0 ? (
            <div className={`deploy-result-block ${deployResultState(activeDeployment?.status)}`}>
              <div className="deploy-result-summary">
                <div className="deploy-result-summary-head">
                  <div className="deploy-result-label">{t('fileViewer.deployResultLabel')}</div>
                  <div className={`deploy-result-badge ${deployResultState(activeDeployment?.status)}`}>
                    {statusLabelFor(deployResultState(activeDeployment?.status))}
                  </div>
                </div>
                {activeDeployment?.statusMessage ? (
                  <p className="deploy-result-message">{activeDeployment.statusMessage}</p>
                ) : null}
                <div className="deploy-result-links">
                  {deployResultCards.map((card) => {
                    const state = deployResultState(card.status);
                    const canRetry = state === 'delayed' || state === 'protected';
                    const isDisabled = state === 'protected' || state === 'failed';
                    return (
                      <div key={card.id} className={`deploy-result-link ${state}`}>
                        <div className="deploy-result-link-main">
                          <div className="deploy-result-link-head">
                            <span className="deploy-result-link-label">{card.label}</span>
                            <span className={`deploy-result-link-state ${state}`}>{statusLabelFor(state)}</span>
                          </div>
                          {card.message ? (
                            <p className="deploy-result-link-message">{card.message}</p>
                          ) : null}
                          <a
                            className="deploy-result-url"
                            href={card.url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {card.url}
                          </a>
                        </div>
                        <div className="deploy-result-actions">
                          {canRetry ? (
                            <button
                              type="button"
                              className="viewer-action"
                              disabled={deployPhase === 'preparing-link'}
                              onClick={onRetryDeploymentLink}
                            >
                              {deployPhase === 'preparing-link'
                                ? t('fileViewer.preparingPublicLink')
                                : t('fileViewer.retryLink')}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="viewer-action"
                            onClick={() => {
                              void deployLinkCopy.copyDeployLink(card.url);
                            }}
                          >
                            <Icon name="copy" size={14} />
                            <span>{deployLinkCopy.copyDeployLabel(card.url)}</span>
                          </button>
                          <a
                            className={`ghost-link ${isDisabled ? 'disabled' : ''}`}
                            href={isDisabled ? undefined : card.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-disabled={isDisabled}
                          >
                            <Icon name="upload" size={14} />
                            {t('fileViewer.open')}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="ghost-link button-like"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="viewer-action primary"
            disabled={deploying || savingDeployConfig || deployPhase !== 'idle'}
            onClick={onDeployToSelectedProvider}
          >
            {deployButtonLabel}
          </button>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
