import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import { getResolvedDeviceId } from '../analytics/client';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { useAnalytics } from '../analytics/provider';
import { useT } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { PlanBadge } from './PlanBadge';
import { RemixIcon } from './RemixIcon';
import { orderAgentsWithOpenDesignFirst } from './agentOrdering';
import { defaultAgentModelId, effectiveAgentModelChoice } from './agentModelSelection';
import {
  orderModelOptionsByAvailability,
  SearchableModelSelect,
} from './modelOptions';
import type { AgentInfo, AppConfig, ExecMode, ProviderModelOption } from '../types';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { KNOWN_PROVIDERS } from '../state/config';
import { mergeProviderModelOptions, providerModelsCacheKey } from './SettingsDialog';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { fetchProviderModels } from '../providers/provider-models';
import {
  canUpgradeVelaPlan,
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
  formatVelaBalanceUsd,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  amrPlansUrlForProfile,
} from '../runtime/amr-guidance';
import { isMacPlatform } from '../utils/platform';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';

interface Props {
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiModelChange?: (model: string) => void;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onOpenSettings: (section?: 'execution') => void;
  onRefreshAgents: () => void;
  onBack?: () => void;
  placement?: 'down' | 'up';
  /** Fired when the dropdown transitions from closed to open. */
  onOpen?: () => void;
}

function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design' : agent.name;
}

/**
 * Compact runtime control. Click opens a dropdown with current execution mode
 * and the agent picker (when in daemon mode).
 */
export function AvatarMenu({
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiModelChange,
  providerModelsCache,
  onOpenSettings,
  onRefreshAgents,
  onBack,
  placement = 'down',
  onOpen,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const [open, setOpen] = useState(false);
  // Toggle that reports the closed→open transition (for analytics) without
  // firing on close.
  function toggleOpen() {
    setOpen((v) => {
      if (!v) onOpen?.();
      return !v;
    });
  }
  const [discoveredProviderModels, setDiscoveredProviderModels] = useState<Record<string, ProviderModelOption[]>>({});
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const margin = 16;
      const gap = 8;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, margin),
        window.innerWidth - width - margin,
      );

      if (placement === 'up') {
        const available = Math.max(160, rect.top - margin - gap);
        setPopoverStyle({
          position: 'fixed',
          top: 'auto',
          bottom: Math.max(margin, window.innerHeight - rect.top + gap),
          left,
          right: 'auto',
          width,
          maxHeight: Math.min(520, available),
          overflowY: 'auto',
          zIndex: 1000,
        });
        return;
      }

      const top = rect.bottom + gap;
      const available = Math.max(160, window.innerHeight - top - margin);
      setPopoverStyle({
        position: 'fixed',
        top,
        bottom: 'auto',
        left,
        right: 'auto',
        width,
        maxHeight: Math.min(520, available),
        overflowY: 'auto',
        zIndex: 1000,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, placement]);

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );
  const currentAgentModelOptions = useMemo(() => {
    const models = currentAgent?.models ?? [];
    if (currentAgent?.id !== 'amr') return models;
    return orderModelOptionsByAvailability(models);
  }, [currentAgent]);

  const installedAgents = orderAgentsWithOpenDesignFirst(
    agents.filter((a) => a.available && isVisibleLocalCliAgent(a)),
  );
  const amrAvailable = installedAgents.some((a) => a.id === 'amr');
  const amrProfile = config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE;

  // Fetch the live account (plan tier + wallet balance) when the popover opens,
  // whenever the Open Design runtime is installed — so the Open Design agent row
  // can show the real plan/balance even when another agent is currently active.
  const [amrAccount, setAmrAccount] = useState<VelaLoginStatus | null>(null);
  const [amrWalletSnapshot, setAmrWalletSnapshot] =
    useState<AmrWalletSnapshot | null>(null);
  useEffect(() => {
    if (!open || !amrAvailable) {
      setAmrAccount(null);
      setAmrWalletSnapshot(null);
      return;
    }
    let cancelled = false;
    setAmrAccount(null);
    setAmrWalletSnapshot(null);
    void fetchVelaLoginStatus()
      .then(async (status) => {
        if (cancelled) return;
        setAmrAccount(status);
        if (status?.loggedIn && !formatVelaBalanceUsd(status.account?.balanceUsd)) {
          const wallet = await fetchAmrWalletSnapshot();
          if (!cancelled) setAmrWalletSnapshot(wallet);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAmrAccount(null);
          setAmrWalletSnapshot(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, amrAvailable]);
  const amrPlanTrimmed = amrAccount?.loggedIn
    ? amrAccount.account?.plan?.trim() || ''
    : '';
  const amrPlanDisplay = amrPlanTrimmed
    ? amrPlanTrimmed.charAt(0).toUpperCase() + amrPlanTrimmed.slice(1)
    : null;
  const amrBalanceLabel = amrAccount?.loggedIn
    ? formatVelaBalanceUsd(amrAccount.account?.balanceUsd) ??
      (amrWalletSnapshot?.status === 'available'
        ? formatVelaBalanceUsd(amrWalletSnapshot.balanceUsd)
        : null)
    : null;
  const amrResolvedProfile = amrAccount?.profile ?? amrProfile;
  const amrCanUpgrade =
    !!amrAccount?.loggedIn && canUpgradeVelaPlan(amrAccount.account?.plan);
  const amrPlansUrl = amrPlansUrlForProfile(amrResolvedProfile);
  const handleAmrUpgradeClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    const attribution = recordAmrEntry(analytics.track, 'avatar_amr_upgrade', new Date(), {
      metricsConsent: config.telemetry?.metrics === true,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config.installationId,
    });
    event.currentTarget.href = attributedAmrUrl(amrPlansUrl, attribution, deviceId);
    setOpen(false);
  };

  // Resolve the user's model + reasoning pick for the active agent. Falls
  // back to the agent's first declared option (`'default'`) when the user
  // hasn't touched the picker yet so the labels don't read as empty.
  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const normalizedCurrentChoice = effectiveAgentModelChoice(currentAgent, currentChoice) ?? currentChoice;
  const currentModelId =
    normalizedCurrentChoice.model ?? defaultAgentModelId(currentAgent);
  const currentReasoningId =
    currentChoice.reasoning ?? currentAgent?.reasoningOptions?.[0]?.id ?? null;
  const currentModelLabel = currentAgent?.models?.find(
    (m) => m.id === currentModelId,
  )?.label;

  const apiProtocol = config.apiProtocol ?? 'openai';
  const byokProvider =
    KNOWN_PROVIDERS.find(
      (provider) =>
        provider.protocol === apiProtocol &&
        (config.apiProviderBaseUrl
          ? provider.baseUrl === config.apiProviderBaseUrl
          : provider.baseUrl === config.baseUrl),
    ) ?? KNOWN_PROVIDERS.find((provider) => provider.protocol === apiProtocol);
  const byokProviderModelsKey = providerModelsCacheKey(
    apiProtocol,
    config.baseUrl ?? '',
    config.apiKey ?? '',
    config.apiVersion ?? '',
  );
  const fetchedByokModels = providerModelsCache?.[byokProviderModelsKey] ?? discoveredProviderModels[byokProviderModelsKey] ?? [];

  useEffect(() => {
    if (!open || config.mode !== 'api') return;
    if (fetchedByokModels.length > 0) return;
    if (apiProtocol === 'azure' || apiProtocol === 'ollama') return;
    const baseUrl = config.baseUrl?.trim() ?? '';
    const apiKey = config.apiKey?.trim() ?? '';
    if (!baseUrl || !apiKey) return;
    let cancelled = false;
    void fetchProviderModels({
      protocol: apiProtocol,
      baseUrl,
      apiKey,
    }).then((result) => {
      if (cancelled || !result.ok || !result.models?.length) return;
      setDiscoveredProviderModels((current) => ({
        ...current,
        [byokProviderModelsKey]: result.models ?? [],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    config.mode,
    apiProtocol,
    config.baseUrl,
    config.apiKey,
    byokProviderModelsKey,
    fetchedByokModels.length,
  ]);

  const byokModelOptions = mergeProviderModelOptions(
    fetchedByokModels,
    byokProvider?.models?.length
      ? byokProvider.models
      : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol] ?? [],
  );

  return (
    <div className={`avatar-menu avatar-menu--${placement}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="avatar-agent-trigger"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip={t('avatar.title')}
        title={t('avatar.title')}
        aria-label={t('avatar.title')}
      >
        {currentAgent ? (
          <AgentIcon id={currentAgent.id} size={20} />
        ) : (
          <RemixIcon name="link" size={20} />
        )}
        <RemixIcon name="arrow-down-s-line" size={14} />
      </button>
      {open && popoverStyle ? createPortal(
        <div
          ref={popoverRef}
          className="avatar-popover"
          role="dialog"
          aria-label={t('avatar.title')}
          style={popoverStyle}
        >
          <div className="avatar-popover-head">
            <span className="who">
              {config.mode === 'daemon'
                ? t('avatar.localCli')
                : apiProtocolLabel(config.apiProtocol)}
            </span>
            <span className="where">
              {config.mode === 'api'
                ? safeHost(config.baseUrl)
                : currentAgent
                  ? `${displayAgentName(currentAgent)}${
                      currentAgent.id !== 'amr' && currentAgent.version
                        ? ` · ${currentAgent.version}`
                        : ''
                    }${
                      currentModelLabel && currentModelId !== 'default'
                        ? ` · ${currentModelLabel}`
                        : ''
                    }`
                  : t('avatar.noAgentSelected')}
            </span>
          </div>
          <button
            type="button"
            className={`avatar-item avatar-item--mode${config.mode === 'daemon' ? ' active' : ''}`}
            aria-current={config.mode === 'daemon' ? 'true' : undefined}
            onClick={() => {
              if (config.mode === 'daemon') {
                setOpen(false);
                if (!daemonLive) {
                  onOpenSettings('execution');
                }
                return;
              }
              onModeChange('daemon');
              if (!daemonLive) {
                // No daemon — let user know via settings page rather than
                // silently failing.
                setOpen(false);
                onOpenSettings('execution');
              }
            }}
            disabled={!daemonLive && config.mode !== 'daemon'}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="file-code-line" size={15} />
            </span>
            <span>{t('avatar.useLocal')}</span>
            {!daemonLive ? (
              <span className="avatar-item-meta">{t('avatar.metaOffline')}</span>
            ) : null}
            {config.mode === 'daemon' ? (
              <span className="avatar-item__check" aria-hidden>
                <RemixIcon name="check-line" size={15} />
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`avatar-item avatar-item--mode${config.mode === 'api' ? ' active' : ''}`}
            aria-current={config.mode === 'api' ? 'true' : undefined}
            onClick={() => onModeChange('api')}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="link" size={15} />
            </span>
            <span>{t('avatar.useApi')}</span>
            {config.mode === 'api' ? (
              <span className="avatar-item__check" aria-hidden>
                <RemixIcon name="check-line" size={15} />
              </span>
            ) : null}
          </button>

          {config.mode === 'daemon' && installedAgents.length > 0 ? (
            <>
              <div className="avatar-section-label">{t('avatar.codeAgent')}</div>
              {installedAgents.map((a) => {
                const selected = config.agentId === a.id;
                // Open Design row carries the account (balance + plan) inline,
                // plus Upgrade and Console actions, so it is a container rather
                // than a single select button (which can't nest buttons/links).
                if (a.id === 'amr') {
                  return (
                    <div
                      key={a.id}
                      className={`avatar-item avatar-amr-row${selected ? ' active' : ''}`}
                      data-testid={`avatar-agent-option-${a.id}`}
                    >
                      <button
                        type="button"
                        className="avatar-amr-row__select"
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => {
                          recordAmrEntry(
                            analytics.track,
                            'avatar_amr_agent_card',
                            new Date(),
                            { metricsConsent: config.telemetry?.metrics === true },
                          );
                          onAgentChange('amr');
                        }}
                      >
                        <AgentIcon id="amr" size={24} />
                        <span className="avatar-amr-row__text">
                          <span className="avatar-amr-row__name-row">
                            <span className="avatar-amr-row__name">
                              {displayAgentName(a)}
                            </span>
                            <PlanBadge plan={amrPlanDisplay} size="md" />
                          </span>
                          {amrBalanceLabel ? (
                            <span className="avatar-amr-row__subtitle">
                              <span className="avatar-amr-row__stat">
                                <span className="avatar-amr-row__stat-label">
                                  {t('settings.amrBalance')}
                                </span>
                                <span className="avatar-amr-row__stat-value">
                                  {amrBalanceLabel}
                                </span>
                              </span>
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {amrCanUpgrade ? (
                        <a
                          className="avatar-amr-row__upgrade"
                          href={amrPlansUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleAmrUpgradeClick}
                        >
                          {t('settings.amrUpgrade')}
                        </a>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <button
                    type="button"
                    key={a.id}
                    className={`avatar-item${selected ? ' active' : ''}`}
                    data-testid={`avatar-agent-option-${a.id}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      onAgentChange(a.id);
                      // Keep the popover open so the user can immediately
                      // pick a model for the agent they just chose.
                    }}
                  >
                    <AgentIcon id={a.id} size={18} />
                    <span>{displayAgentName(a)}</span>
                    {a.version ? (
                      <span className="avatar-item-meta">{a.version}</span>
                    ) : null}
                  </button>
                );
              })}
              {currentAgent &&
              currentAgent.available &&
              ((currentAgent.models && currentAgent.models.length > 0) ||
                (currentAgent.reasoningOptions &&
                  currentAgent.reasoningOptions.length > 0)) ? (
                <div className="avatar-model-section">
                  {currentAgent.models && currentAgent.models.length > 0 ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.modelLabel')}
                      </span>
                      <SearchableModelSelect
                        className="inline-switcher__select avatar-select"
                        value={currentModelId ?? ''}
                        onChange={(value) =>
                          onAgentModelChange(currentAgent.id, {
                            model: value,
                          })
                        }
                        models={currentAgentModelOptions}
                        additionalOptions={
                          currentModelId &&
                          !currentAgent.models.some((m) => m.id === currentModelId)
                            ? [
                                {
                                  value: currentModelId,
                                  label: `${currentModelId} ${t('avatar.customSuffix')}` ,
                                },
                              ]
                            : undefined
                        }
                        searchPlaceholder={t('newproj.modelSearch')}
                        searchInputTestId="avatar-model-search"
                        popoverTestId="avatar-model-popover"
                        minSearchableOptions={5}
                        disabledOptionHint={
                          currentAgent.id === 'amr'
                            ? (option) =>
                                option.enabled === false
                                  ? t('settings.amrModelUpgradeHint')
                                  : null
                            : undefined
                        }
                        onDisabledOptionUpgrade={
                          currentAgent.id === 'amr'
                            ? () => {
                                const attribution = recordAmrEntry(
                                  analytics.track,
                                  'avatar_amr_upgrade',
                                  new Date(),
                                  {
                                    metricsConsent:
                                      config.telemetry?.metrics === true,
                                  },
                                );
                                const deviceId = amrHandoffDeviceId({
                                  metricsConsent:
                                    config.telemetry?.metrics === true,
                                  resolvedDeviceId: getResolvedDeviceId(),
                                  installationId: config.installationId,
                                });
                                window.open(
                                  attributedAmrUrl(
                                    amrPlansUrl,
                                    attribution,
                                    deviceId,
                                  ),
                                  '_blank',
                                  'noopener,noreferrer',
                                );
                              }
                            : undefined
                        }
                      />
                    </label>
                  ) : null}
                  {currentAgent.reasoningOptions &&
                  currentAgent.reasoningOptions.length > 0 ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.reasoningLabel')}
                      </span>
                      <select
                        className="avatar-select"
                        value={currentReasoningId ?? ''}
                        onChange={(e) =>
                          onAgentModelChange(currentAgent.id, {
                            reasoning: e.target.value,
                          })
                        }
                      >
                        {currentAgent.reasoningOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="avatar-item"
                onClick={() => {
                  onRefreshAgents();
                }}
              >
                <span className="avatar-item-icon" aria-hidden>
                  <RemixIcon name="refresh-line" size={15} />
                </span>
                <span>{t('avatar.rescan')}</span>
              </button>
            </>
          ) : null}

          {config.mode === 'api' ? (
            <div className="avatar-model-section">
              <label className="avatar-select-row">
                <span className="avatar-select-label">
                  {t('avatar.modelLabel')}
                </span>
                <SearchableModelSelect
                  className="inline-switcher__select avatar-select"
                  value={config.model ?? ''}
                  onChange={(value) => onApiModelChange?.(value)}
                  models={byokModelOptions.map((m) => ({ ...m, label: m.label }))}
                  additionalOptions={
                    config.model && !byokModelOptions.some((m) => m.id === config.model)
                      ? [
                          {
                            value: config.model,
                            label: byokProvider?.models?.includes(config.model)
                              ? config.model
                              : `${config.model} ${t('avatar.customSuffix')}`,
                          },
                        ]
                      : undefined
                  }
                  searchPlaceholder={t('newproj.modelSearch')}
                  searchInputTestId="avatar-byok-model-search"
                  popoverTestId="avatar-byok-model-popover"
                  minSearchableOptions={5}
                />
              </label>
            </div>
          ) : null}

          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />

          <button
            type="button"
            className="avatar-item avatar-item--execution-settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings('execution');
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="settings-3-line" size={15} />
            </span>
            <span>{t('inlineSwitcher.openFullSettings')}</span>
          </button>

          {onBack ? (
            <>
              <button
                type="button"
                className="avatar-item"
                onClick={() => {
                  setOpen(false);
                  onBack();
                }}
              >
                <span className="avatar-item-icon" aria-hidden>
                  <RemixIcon name="arrow-left-line" size={15} />
                </span>
                <span>{t('avatar.backToProjects')}</span>
              </button>
            </>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
