// Feature-local hook for HtmlViewer's deploy/publish flow: provider
// selection, credential form state, the Cloudflare Pages zone picker, the
// deploy action itself, its pending-link retry, and the social-share
// payload/derived-label plumbing that reads the resulting deployment. Entirely
// HTTP-driven — no srcDoc/postMessage/iframe surface at all, so it moves as
// one self-contained cluster (Cluster E of the FileViewer.tsx decomposition).
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingDeployProvider,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import {
  buildSocialSharePayload,
  OPEN_DESIGN_GITHUB_REPO_URL,
  type SocialShareRequest,
  type SocialShareResponse,
} from '@open-design/contracts';
import type {
  DeployConfigResponse,
  DeployProjectFileResponse,
  DeployProviderId,
  DeploymentInfo,
} from '@open-design/contracts';
import { trackArtifactDeployResult } from '../../../analytics/events';
import type { Locale } from '../../../i18n/types';
import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  DEFAULT_DEPLOY_PROVIDER_ID,
  DEPLOY_PROVIDER_OPTIONS,
} from '../constants';
import {
  deployTransportPort as realDeployTransportPort,
  dismissPort as realDismissPort,
  windowOpenPort as realWindowOpenPort,
} from '../dependencies';
import {
  compareDeploymentsByNewest,
  deployResultState,
  getDeployProviderOption,
  isValidCloudflareDomainPrefixInput,
  normalizeCloudflareDomainPrefixInput,
  pickLatestShareDeployment,
  publicShareUrlForDeployment,
  resolveShareUrl,
  shareUrlForDeployment,
} from '../rules';
import type {
  ArtifactTrackingAnalytics,
  CloudflarePagesZoneOption,
  DeployResultCard,
  TranslateFn,
} from '../types';
import type { DeployTransportPort, DismissPort, WindowOpenPort } from '../ports';

export interface DeployFlowDeps {
  projectId: string;
  projectKind: TrackingProjectKind;
  fileName: string;
  fileKind: string | null;
  exportTitle: string;
  locale: Locale;
  /** Streaming gates the share-link actions (can't share mid-generation). */
  streaming: boolean;
  t: TranslateFn;
  analytics: ArtifactTrackingAnalytics;
  /**
   * The already-extracted `useWiredDeployLinkCopy` hook's reset action — a
   * sibling hook the orchestrator still owns (out of this cluster's scope).
   * Called whenever the deploy context changes so a stale "copied" pill
   * doesn't linger across files/providers/deploys.
   */
  resetCopiedDeployLink: () => void;
  /** Closes the (not-yet-extracted) deploy dropdown menu when the modal opens. */
  closeDeployMenu: () => void;
}

export interface DeployFlowController {
  deployment: DeploymentInfo | null;
  deploymentsByProvider: Partial<Record<DeployProviderId, DeploymentInfo>>;
  deployModalOpen: boolean;
  deployModalIntent: 'deploy' | 'social-share';
  closeDeployModal: () => void;
  deployConfig: DeployConfigResponse | null;
  deploying: boolean;
  deployPhase: 'idle' | 'deploying' | 'preparing-link';
  savingDeployConfig: boolean;
  deployError: string | null;
  deployResult: DeployProjectFileResponse | null;
  deployProviderId: DeployProviderId;
  projectSocialShare: SocialShareResponse | null;
  deployToken: string;
  setDeployToken: (value: string) => void;
  teamId: string;
  setTeamId: (value: string) => void;
  teamSlug: string;
  setTeamSlug: (value: string) => void;
  cloudflareAccountId: string;
  setCloudflareAccountId: (value: string) => void;
  cloudflareZones: CloudflarePagesZoneOption[];
  cloudflareZonesLoading: boolean;
  cloudflareZonesError: string | null;
  cloudflareZoneId: string;
  setCloudflareZoneId: (value: string) => void;
  cloudflareDomainPrefix: string;
  setCloudflareDomainPrefix: (value: string) => void;
  deployTokenInputRef: MutableRefObject<HTMLInputElement | null>;
  deploySavedToast: { message: string; details: string } | null;
  setDeploySavedToast: (value: { message: string; details: string } | null) => void;
  deployActionToast: string | null;
  setDeployActionToast: (value: string | null) => void;
  shareGuideToast: string | null;
  setShareGuideToast: (value: string | null) => void;

  openDeployModal: (
    nextProviderId?: DeployProviderId,
    intent?: 'deploy' | 'social-share',
  ) => Promise<void>;
  openSocialShareFlow: () => Promise<void>;
  changeDeployProvider: (nextProviderId: DeployProviderId) => Promise<void>;
  saveDeployConfig: () => Promise<DeployConfigResponse | null>;
  deployToSelectedProvider: () => Promise<void>;
  retryDeploymentLink: () => Promise<void>;
  loadCloudflareZones: (
    config?: DeployConfigResponse | null,
    options?: { requestSeq?: number },
  ) => Promise<void>;

  activeDeployment: DeploymentInfo | null;
  activeDeployedUrl: string;
  activeDeploymentDelayed: boolean;
  activeDeploymentProtected: boolean;
  deployProvider: ReturnType<typeof getDeployProviderOption>;
  deployProviderLabel: string;
  selectedCloudflareZone: CloudflarePagesZoneOption | null;
  normalizedCloudflarePrefix: string;
  cloudflareHostnamePreview: string;
  deployResultCards: DeployResultCard[];
  deployActionLabelFor: (providerId: DeployProviderId) => string;
  deployActionIconFor: (providerId: DeployProviderId) => string;
  shareableDeploymentUrl: string;
  socialShareBlockedDeployment: DeploymentInfo | null;
  socialShareBlockedState: ReturnType<typeof deployResultState> | null;
  socialShareDisplayUrl: string;
  socialShareUnavailableMessage: string;
  activeProjectSocialShare: SocialShareResponse | null;
  socialShareMenuLabel: string;
  sharePageUrl: string;
  canCopyShareLink: boolean;
  canOpenSharePage: boolean;
  shareLinkStatusHint: string;
  shareUnavailableHint: string;
  shareMenuLabel: string;
  deployMenuLabel: string;
  isSocialShareDeployModal: boolean;
  deployModalKicker: string;
  deployModalTitle: string;
  deployModalSubtitle: string;
  deployButtonLabel: string;
  statusLabelFor: (state: ReturnType<typeof deployResultState>) => string;
}

export function useDeployFlow(
  port: DeployTransportPort,
  dismissPort: DismissPort,
  windowLocation: Pick<WindowOpenPort, 'getLocationOrigin'>,
  deps: DeployFlowDeps,
): DeployFlowController {
  const {
    projectId,
    projectKind,
    fileName,
    fileKind,
    exportTitle,
    locale,
    streaming,
    t,
    analytics,
    resetCopiedDeployLink,
    closeDeployMenu,
  } = deps;

  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [deploymentsByProvider, setDeploymentsByProvider] = useState<Partial<Record<DeployProviderId, DeploymentInfo>>>({});
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployModalIntent, setDeployModalIntent] = useState<'deploy' | 'social-share'>('deploy');
  const closeDeployModal = useCallback(() => {
    setDeployModalOpen(false);
    setDeployModalIntent('deploy');
  }, []);
  const [deployConfig, setDeployConfig] = useState<DeployConfigResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<'idle' | 'deploying' | 'preparing-link'>('idle');
  const [savingDeployConfig, setSavingDeployConfig] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployProjectFileResponse | null>(null);
  const [deployProviderId, setDeployProviderId] = useState<DeployProviderId>(DEFAULT_DEPLOY_PROVIDER_ID as DeployProviderId);
  const [projectSocialShare, setProjectSocialShare] = useState<SocialShareResponse | null>(null);
  const [deployToken, setDeployToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareZones, setCloudflareZones] = useState<CloudflarePagesZoneOption[]>([]);
  const [cloudflareZonesLoading, setCloudflareZonesLoading] = useState(false);
  const [cloudflareZonesError, setCloudflareZonesError] = useState<string | null>(null);
  const [cloudflareZoneId, setCloudflareZoneId] = useState('');
  const [cloudflareDomainPrefix, setCloudflareDomainPrefix] = useState('');
  const deployProviderLoadSeqRef = useRef(0);
  const deployTokenInputRef = useRef<HTMLInputElement | null>(null);
  const [deploySavedToast, setDeploySavedToast] = useState<{ message: string; details: string } | null>(null);
  const [deployActionToast, setDeployActionToast] = useState<string | null>(null);
  const [shareGuideToast, setShareGuideToast] = useState<string | null>(null);

  useEffect(() => {
    if (!deployModalOpen) return undefined;
    return dismissPort.subscribeEscapeKey(closeDeployModal);
  }, [dismissPort, closeDeployModal, deployModalOpen]);

  function deploymentMapForCurrentFile(items: DeploymentInfo[]) {
    const next: Partial<Record<DeployProviderId, DeploymentInfo>> = {};
    for (const option of DEPLOY_PROVIDER_OPTIONS) {
      const deploymentForProvider = items
        .filter((item) => item.fileName === fileName && item.providerId === option.id && item.url?.trim())
        .sort(compareDeploymentsByNewest)[0];
      if (deploymentForProvider) next[option.id] = deploymentForProvider;
    }
    return next;
  }

  function syncDeployFormFromConfig(
    providerId: DeployProviderId,
    config: DeployConfigResponse | null,
  ) {
    const matchingConfig = config?.providerId === providerId ? config : null;
    setDeployProviderId(providerId);
    setDeployConfig(matchingConfig);
    setDeployToken(matchingConfig?.tokenMask || '');
    setTeamId(matchingConfig?.teamId || '');
    setTeamSlug(matchingConfig?.teamSlug || '');
    setCloudflareAccountId(matchingConfig?.accountId || '');
    setCloudflareZoneId(matchingConfig?.cloudflarePages?.lastZoneId || '');
    setCloudflareDomainPrefix(matchingConfig?.cloudflarePages?.lastDomainPrefix || '');
  }

  function cloudflareConfigHintsFromForm() {
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    const hints = {
      ...(cloudflareZoneId.trim() ? { lastZoneId: cloudflareZoneId.trim() } : {}),
      ...((zone?.name || deployConfig?.cloudflarePages?.lastZoneName)
        ? { lastZoneName: zone?.name || deployConfig?.cloudflarePages?.lastZoneName }
        : {}),
      ...(cloudflareDomainPrefix.trim()
        ? { lastDomainPrefix: normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix) }
        : {}),
    };
    return Object.keys(hints).length > 0 ? hints : undefined;
  }

  function buildDeployConfigRequest(providerId: DeployProviderId) {
    const token = deployToken.trim();
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) {
      return {
        providerId,
        token,
        accountId: cloudflareAccountId.trim(),
        cloudflarePages: cloudflareConfigHintsFromForm(),
      };
    }
    return {
      providerId,
      token,
      teamId: teamId.trim(),
      teamSlug: teamSlug.trim(),
    };
  }

  async function loadDeployProvider(
    providerId: DeployProviderId,
    options?: { fallbackToExisting?: boolean },
  ) {
    const requestSeq = ++deployProviderLoadSeqRef.current;
    setDeployProviderId(providerId);
    const deployments = await port.fetchProjectDeployments(projectId);
    const nextDeploymentsByProvider = deploymentMapForCurrentFile(deployments);
    const exactDeployment = nextDeploymentsByProvider[providerId] ?? null;
    const fallbackDeployment = options?.fallbackToExisting
      ? Object.values(nextDeploymentsByProvider)[0] ?? null
      : null;
    const currentDeployment = exactDeployment ?? fallbackDeployment;
    // Use the explicit providerId for config/form so a fallback deployment from
    // another provider only fills the existing-URL display, never the form/credentials.
    const config = await port.fetchDeployConfig(providerId);
    if (requestSeq !== deployProviderLoadSeqRef.current) {
      return { config: null, currentDeployment: null };
    }
    syncDeployFormFromConfig(providerId, config);
    setDeploymentsByProvider(nextDeploymentsByProvider);
    setDeployment(currentDeployment ?? null);
    setDeployResult(currentDeployment ?? null);
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID && config?.configured) {
      void loadCloudflareZones(config, { requestSeq });
    }
    return { config, currentDeployment };
  }

  async function loadCloudflareZones(
    config: DeployConfigResponse | null = deployConfig,
    options?: { requestSeq?: number },
  ) {
    if (!config?.configured || config.providerId !== CLOUDFLARE_PAGES_PROVIDER_ID) return;
    const requestSeq = options?.requestSeq ?? deployProviderLoadSeqRef.current;
    setCloudflareZonesLoading(true);
    setCloudflareZonesError(null);
    try {
      const response = await port.fetchCloudflarePagesZones();
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      const zones = response?.zones ?? [];
      setCloudflareZones(zones);
      const hintedZoneId = response?.cloudflarePages?.lastZoneId || config.cloudflarePages?.lastZoneId || '';
      const nextZoneId = hintedZoneId && zones.some((zone) => zone.id === hintedZoneId)
        ? hintedZoneId
        : zones[0]?.id || '';
      setCloudflareZoneId(nextZoneId);
      const hintedPrefix = response?.cloudflarePages?.lastDomainPrefix || config.cloudflarePages?.lastDomainPrefix || '';
      if (hintedPrefix) setCloudflareDomainPrefix(hintedPrefix);
    } catch (err) {
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      setCloudflareZones([]);
      setCloudflareZonesError(err instanceof Error ? err.message : t('fileViewer.cloudflareZonesLoadFailed'));
    } finally {
      if (requestSeq === deployProviderLoadSeqRef.current) setCloudflareZonesLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setDeployResult(null);
    setDeployError(null);
    resetCopiedDeployLink();
    setDeployPhase('idle');
    void port.fetchProjectDeployments(projectId).then((items) => {
      if (cancelled) return;
      const nextDeploymentsByProvider = deploymentMapForCurrentFile(items);
      const current = nextDeploymentsByProvider[deployProviderId] ?? null;
      setDeploymentsByProvider(nextDeploymentsByProvider);
      setDeployment(current ?? null);
      setDeployResult(current ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fileName, deployProviderId]);

  async function openDeployModal(
    nextProviderId: DeployProviderId = deployProviderId,
    intent: 'deploy' | 'social-share' = 'deploy',
  ) {
    closeDeployMenu();
    setDeployModalOpen(true);
    setDeployModalIntent(intent);
    setDeployError(null);
    setDeployActionToast(null);
    resetCopiedDeployLink();
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId, { fallbackToExisting: true });
  }

  async function openSocialShareFlow() {
    const providerWithDeployment = DEPLOY_PROVIDER_OPTIONS.find(
      (option) => deploymentsByProvider[option.id]?.url?.trim(),
    )?.id;
    await openDeployModal(providerWithDeployment ?? deployProviderId, 'social-share');
  }

  async function changeDeployProvider(nextProviderId: DeployProviderId) {
    if (nextProviderId === deployProviderId) return;
    setDeployError(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId);
  }

  async function saveDeployConfig(): Promise<DeployConfigResponse | null> {
    setSavingDeployConfig(true);
    setDeployError(null);
    setDeployActionToast(null);
    try {
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        if (!deployToken.trim()) {
          setDeployActionToast(t('fileViewer.cloudflareApiTokenRequired'));
          deployTokenInputRef.current?.focus();
          return null;
        }
        if (!cloudflareAccountId.trim()) {
          throw new Error(t('fileViewer.cloudflareAccountIdRequired'));
        }
      }
      const config = await port.updateDeployConfig(buildDeployConfigRequest(deployProviderId));
      if (!config || config.providerId !== deployProviderId) {
        throw new Error(t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      }
      syncDeployFormFromConfig(deployProviderId, config);
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        await loadCloudflareZones(config);
      }
      return config;
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      return null;
    } finally {
      setSavingDeployConfig(false);
    }
  }

  function buildCloudflarePagesDeploySelection() {
    if (deployProviderId !== CLOUDFLARE_PAGES_PROVIDER_ID) return undefined;
    const prefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
    if (!prefix) return undefined;
    if (!isValidCloudflareDomainPrefixInput(prefix)) {
      throw new Error(t('fileViewer.cloudflareDomainPrefixInvalid'));
    }
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    if (!zone) {
      throw new Error(t('fileViewer.cloudflareZoneRequired'));
    }
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      domainPrefix: prefix,
    };
  }

  async function deployToSelectedProvider() {
    setDeploying(true);
    setDeployPhase('deploying');
    setDeployError(null);
    setDeployActionToast(null);
    resetCopiedDeployLink();
    // Real-deploy analytics: report success only after the provider actually
    // accepts the publish, failed on any hard error / missing config. This is
    // distinct from the share-popover "opened" signal (artifact_export_result).
    const deployStarted = performance.now();
    const providerForTracking: TrackingDeployProvider =
      deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? 'cloudflare_pages' : 'vercel';
    const firstConfigure = !deployConfig?.configured;
    let savedNewToken = false;
    const fireDeployResult = (
      result: 'success' | 'failed' | 'cancelled',
      errorCode?: string,
    ) => {
      trackArtifactDeployResult(analytics.track, {
        page_name: 'artifact',
        area: 'deploy_modal',
        artifact_id: anonymizeArtifactId({ projectId, fileName }),
        artifact_kind: artifactKindToTracking({ fileKind }),
        provider: providerForTracking,
        result,
        saved_new_token: savedNewToken,
        first_configure: firstConfigure,
        ...(errorCode ? { error_code: errorCode } : {}),
        deploy_duration_ms: Math.round(performance.now() - deployStarted),
        project_id: projectId,
        project_kind: projectKind,
      });
    };
    try {
      const cloudflarePagesSelection = buildCloudflarePagesDeploySelection();
      const typedToken = deployToken.trim();
      const hasNewToken = typedToken && typedToken !== deployConfig?.tokenMask;
      savedNewToken = Boolean(hasNewToken);
      const cloudflareHints = cloudflareConfigHintsFromForm();
      const cloudflareHintsChanged = deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID && Boolean(
        cloudflareHints?.lastZoneId !== deployConfig?.cloudflarePages?.lastZoneId ||
        cloudflareHints?.lastZoneName !== deployConfig?.cloudflarePages?.lastZoneName ||
        cloudflareHints?.lastDomainPrefix !== deployConfig?.cloudflarePages?.lastDomainPrefix,
      );
      const needsConfigSave =
        hasNewToken ||
        teamId.trim() !== (deployConfig?.teamId || '') ||
        teamSlug.trim() !== (deployConfig?.teamSlug || '') ||
        cloudflareAccountId.trim() !== (deployConfig?.accountId || '') ||
        cloudflareHintsChanged ||
        !deployConfig?.configured;
      if (needsConfigSave) {
        const nextConfig = await saveDeployConfig();
        if (!nextConfig) {
          // saveDeployConfig bailed (missing/invalid token, e.g. user clicked
          // Deploy without entering a key) — count as a failed deploy attempt.
          fireDeployResult('failed', 'CONFIG_REQUIRED');
          return;
        }
        if (!nextConfig?.configured) {
          const option = getDeployProviderOption(deployProviderId);
          throw new Error(t(option.tokenRequiredKey, { provider: t(option.labelKey) }));
        }
      }
      setDeployPhase('preparing-link');
      const next = await port.deployProjectFile(projectId, fileName, deployProviderId, cloudflarePagesSelection);
      setDeploymentsByProvider((current) => ({
        ...current,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
      if (deployResultState(next.status) !== 'failed') {
        fireDeployResult('success');
        setDeploySavedToast({
          message: t('fileViewer.deploySuccessToast'),
          details: t('fileViewer.deploySuccessToastDetails', {
            provider: deployProviderLabel,
            url: next.url,
          }),
        });
      } else {
        fireDeployResult('failed', `STATUS_${next.status ?? 'UNKNOWN'}`);
      }
    } catch (err) {
      const option = getDeployProviderOption(deployProviderId);
      const message = err instanceof Error
        ? err.message
        : t('fileViewer.deployProviderFailed', { provider: t(option.labelKey) });
      const tokenRequired =
        message === t(option.tokenRequiredKey, { provider: t(option.labelKey) });
      if (tokenRequired) {
        setDeployActionToast(message);
        deployTokenInputRef.current?.focus();
      } else {
        setDeployError(message);
      }
      fireDeployResult(
        'failed',
        tokenRequired ? 'CONFIG_REQUIRED' : err instanceof Error ? err.name : 'UNKNOWN',
      );
    } finally {
      setDeploying(false);
      setDeployPhase('idle');
    }
  }

  async function retryDeploymentLink() {
    const current = deployResult || deployment;
    if (!current?.id) return;
    setDeployError(null);
    setDeployPhase('preparing-link');
    try {
      const next = await port.checkDeploymentLink(projectId, current.id);
      setDeploymentsByProvider((items) => ({
        ...items,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployFailed'));
    } finally {
      setDeployPhase('idle');
    }
  }

  const activeDeployment = deployResult || deployment;
  const activeDeployedUrl = activeDeployment?.url?.trim() || '';
  const activeDeploymentDelayed = activeDeployment?.status === 'link-delayed';
  const activeDeploymentProtected = activeDeployment?.status === 'protected';
  const activeCloudflarePages = activeDeployment?.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? activeDeployment.cloudflarePages
    : undefined;
  const activeCloudflareCustomDomain = activeCloudflarePages?.customDomain;
  const deployProvider = getDeployProviderOption(deployProviderId);
  const deployProviderLabel = t(deployProvider.labelKey);
  const selectedCloudflareZone = cloudflareZones.find((zone) => zone.id === cloudflareZoneId) ?? null;
  const normalizedCloudflarePrefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
  const cloudflareHostnamePreview =
    selectedCloudflareZone && normalizedCloudflarePrefix
      ? `${normalizedCloudflarePrefix}.${selectedCloudflareZone.name}`
      : '';
  const deployResultCards: DeployResultCard[] = activeCloudflarePages
    ? (() => {
        const cards: DeployResultCard[] = [];
        const pagesDevUrl = activeCloudflarePages.pagesDev?.url || activeDeployedUrl;
        if (pagesDevUrl) {
          cards.push({
            id: 'pages-dev',
            label: t('fileViewer.cloudflarePagesDevLinkLabel'),
            url: pagesDevUrl,
            status: activeCloudflarePages.pagesDev?.status || activeDeployment?.status || 'link-delayed',
            message: activeCloudflarePages.pagesDev?.statusMessage,
          });
        }
        if (activeCloudflareCustomDomain?.url) {
          cards.push({
            id: 'custom-domain',
            label: t('fileViewer.cloudflareCustomDomainLinkLabel'),
            url: activeCloudflareCustomDomain.url,
            status: activeCloudflareCustomDomain.status,
            message:
              activeCloudflareCustomDomain.errorMessage ||
              activeCloudflareCustomDomain.statusMessage,
          });
        }
        return cards;
      })()
    : activeDeployedUrl
      ? [{
          id: 'default',
          label: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtectedLabel')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkPreparingLabel')
              : t('fileViewer.deployResultLabel'),
          url: activeDeployedUrl,
          status: activeDeployment?.status || 'ready',
          message: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtected')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkDelayed')
              : activeDeployment?.statusMessage,
        }]
      : [];
  const deployActionLabelFor = (providerId: DeployProviderId) => {
    const option = getDeployProviderOption(providerId);
    const label = t(option.labelKey);
    const hasActiveDeploymentForProvider = Boolean(deploymentsByProvider[providerId]?.url?.trim());
    return hasActiveDeploymentForProvider
      ? t('fileViewer.redeployToProvider', { provider: label })
      : t('fileViewer.deployToProvider', { provider: label });
  };
  const deployedEntries = DEPLOY_PROVIDER_OPTIONS
    .map((option) => deploymentsByProvider[option.id])
    .filter((item): item is DeploymentInfo => Boolean(item?.url?.trim()));
  const shareableDeploymentUrl =
    DEPLOY_PROVIDER_OPTIONS.map((option) => deploymentsByProvider[option.id])
      .map((item) => publicShareUrlForDeployment(item))
      .find(Boolean) ?? '';
  const socialShareBlockedDeployment =
    shareableDeploymentUrl
      ? null
      : deployedEntries.find((item) => deployResultState(item.status) === 'protected' && !publicShareUrlForDeployment(item)) ??
        deployedEntries.find((item) => !publicShareUrlForDeployment(item)) ??
        null;
  const socialShareBlockedState = socialShareBlockedDeployment
    ? deployResultState(socialShareBlockedDeployment.status)
    : null;
  const socialShareDisplayUrl =
    shareableDeploymentUrl || socialShareBlockedDeployment?.url?.trim() || activeDeployedUrl;
  const socialShareUnavailableMessage =
    socialShareBlockedState === 'protected'
      ? t('fileViewer.deployLinkProtected')
      : socialShareBlockedState === 'delayed'
        ? t('fileViewer.deployLinkDelayed')
        : t('socialShare.deployFirst');
  const projectSocialShareRequest = useMemo<SocialShareRequest | null>(() => {
    if (!socialShareDisplayUrl) return null;
    const title = t('socialShare.projectTitle', { title: exportTitle });
    const text = t('socialShare.projectText', {
      title: exportTitle,
      repo: OPEN_DESIGN_GITHUB_REPO_URL,
    });
    return {
      kind: 'project-html',
      locale,
      url: socialShareDisplayUrl,
      title,
      text,
      copyText: t('socialShare.projectCopyText', {
        title: exportTitle,
        url: socialShareDisplayUrl,
        repo: OPEN_DESIGN_GITHUB_REPO_URL,
      }),
    };
  }, [exportTitle, locale, socialShareDisplayUrl, t]);
  const projectSocialShareFallback = useMemo(
    () => (projectSocialShareRequest ? buildSocialSharePayload(projectSocialShareRequest) : null),
    [projectSocialShareRequest],
  );
  // Gate the async payload load on a stable *content* key, not the memo's
  // object identity. The request object can take a fresh identity on renders
  // where its inputs are value-equal (e.g. while deployment polling re-sets
  // state with a new map reference), and keying the effect on that identity
  // made `setProjectSocialShare` re-fire every render — an infinite render
  // loop once a deployment URL is available (#regression: ready-deploy share).
  const projectSocialShareKey = projectSocialShareRequest
    ? JSON.stringify(projectSocialShareRequest)
    : '';
  useEffect(() => {
    setProjectSocialShare(null);
    if (!projectSocialShareRequest) return;
    let cancelled = false;
    void port.createSocialSharePayload(projectSocialShareRequest)
      .then((payload) => {
        if (!cancelled) setProjectSocialShare(payload);
      })
      .catch(() => {
        if (!cancelled) setProjectSocialShare(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSocialShareKey]);
  const activeProjectSocialShare = projectSocialShare ?? projectSocialShareFallback;
  const socialShareMenuLabel =
    activeProjectSocialShare
      ? t('socialShare.projectSection')
      : socialShareBlockedState === 'protected'
        ? t('fileViewer.deployLinkProtectedLabel')
        : socialShareBlockedState === 'delayed'
        ? t('fileViewer.deployLinkPreparingLabel')
          : t('socialShare.deployFirst');
  const deployActionIconFor = (providerId: DeployProviderId) => {
    if (providerId === 'cloudflare-pages') return 'pages-line';
    return 'upload-cloud-line';
  };
  const latestShareDeployment = useMemo(
    () => pickLatestShareDeployment(deploymentsByProvider),
    [deploymentsByProvider],
  );
  const latestDeployedShareUrl = latestShareDeployment
    ? shareUrlForDeployment(latestShareDeployment)
    : '';
  const latestShareState = latestShareDeployment
    ? deployResultState(latestShareDeployment.status)
    : null;
  const sharePageUrl = useMemo(
    () => resolveShareUrl(latestDeployedShareUrl, windowLocation.getLocationOrigin()),
    [latestDeployedShareUrl, windowLocation],
  );
  const canCopyShareLink = !streaming && Boolean(sharePageUrl);
  const canOpenSharePage = !streaming && Boolean(sharePageUrl) && latestShareState !== 'delayed';
  const shareLinkStatusHint =
    streaming
      ? t('fileViewer.shareAfterGenerationComplete')
      : latestShareState === 'delayed'
      ? t('fileViewer.deployLinkDelayed')
      : latestShareState === 'protected'
        ? t('fileViewer.deployLinkProtected')
        : '';
  const shareUnavailableHint = streaming
    ? t('fileViewer.shareAfterGenerationComplete')
    : t('fileViewer.shareLinkRequiresDeploy');
  const shareMenuLabel = t('fileViewer.shareLabel');
  const deployMenuLabel = t('fileViewer.deployModalTitle') || 'Deploy';
  const isSocialShareDeployModal = deployModalIntent === 'social-share';
  const deployModalKicker = isSocialShareDeployModal
    ? t('socialShare.projectSection')
    : deployProviderLabel;
  const deployModalTitle = isSocialShareDeployModal
    ? t('socialShare.publishPageTitle')
    : t('fileViewer.deployToProvider', { provider: deployProviderLabel });
  const deployModalSubtitle = isSocialShareDeployModal
    ? t('socialShare.publishPageSubtitle')
    : t('fileViewer.deployModalSubtitle');
  const deployButtonLabel =
    deployPhase === 'deploying'
      ? t('fileViewer.deployingToProvider', { provider: deployProviderLabel })
      : deployPhase === 'preparing-link'
        ? t('fileViewer.preparingPublicLink')
        : isSocialShareDeployModal
          ? t('socialShare.publishPageTitle')
          : deployMenuLabel;
  const statusLabelFor = (state: ReturnType<typeof deployResultState>) => {
    if (state === 'ready') return t('fileViewer.deployLinkReady');
    if (state === 'protected') return t('fileViewer.deployLinkProtectedLabel');
    if (state === 'failed') return t('fileViewer.deployLinkFailed');
    return t('fileViewer.deployLinkPreparingLabel');
  };

  return {
    deployment,
    deploymentsByProvider,
    deployModalOpen,
    deployModalIntent,
    closeDeployModal,
    deployConfig,
    deploying,
    deployPhase,
    savingDeployConfig,
    deployError,
    deployResult,
    deployProviderId,
    projectSocialShare,
    deployToken,
    setDeployToken,
    teamId,
    setTeamId,
    teamSlug,
    setTeamSlug,
    cloudflareAccountId,
    setCloudflareAccountId,
    cloudflareZones,
    cloudflareZonesLoading,
    cloudflareZonesError,
    cloudflareZoneId,
    setCloudflareZoneId,
    cloudflareDomainPrefix,
    setCloudflareDomainPrefix,
    deployTokenInputRef,
    deploySavedToast,
    setDeploySavedToast,
    deployActionToast,
    setDeployActionToast,
    shareGuideToast,
    setShareGuideToast,
    openDeployModal,
    openSocialShareFlow,
    changeDeployProvider,
    saveDeployConfig,
    deployToSelectedProvider,
    retryDeploymentLink,
    loadCloudflareZones,
    activeDeployment,
    activeDeployedUrl,
    activeDeploymentDelayed,
    activeDeploymentProtected,
    deployProvider,
    deployProviderLabel,
    selectedCloudflareZone,
    normalizedCloudflarePrefix,
    cloudflareHostnamePreview,
    deployResultCards,
    deployActionLabelFor,
    deployActionIconFor,
    shareableDeploymentUrl,
    socialShareBlockedDeployment,
    socialShareBlockedState,
    socialShareDisplayUrl,
    socialShareUnavailableMessage,
    activeProjectSocialShare,
    socialShareMenuLabel,
    sharePageUrl,
    canCopyShareLink,
    canOpenSharePage,
    shareLinkStatusHint,
    shareUnavailableHint,
    shareMenuLabel,
    deployMenuLabel,
    isSocialShareDeployModal,
    deployModalKicker,
    deployModalTitle,
    deployModalSubtitle,
    deployButtonLabel,
    statusLabelFor,
  };
}

export function useWiredDeployFlow(deps: DeployFlowDeps): DeployFlowController {
  return useDeployFlow(realDeployTransportPort, realDismissPort, realWindowOpenPort, deps);
}
