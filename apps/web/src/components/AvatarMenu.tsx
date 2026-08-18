import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { getResolvedDeviceId } from '../analytics/client';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { useAnalytics } from '../analytics/provider';
import { useT } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { modelProviderIconSrc } from './modelProviderIcon';
import { RemixIcon } from './RemixIcon';
import {
  agentModelIsSelectable,
  defaultAgentModelId,
  effectiveAgentModelChoice,
} from './agentModelSelection';
import { orderModelOptionsByAvailability } from './modelOptions';
import {
  mergeProviderModelOptions,
  providerModelsCacheKey,
} from './providerModelsCache';
import { KNOWN_PROVIDERS } from '../state/config';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { fetchProviderModels } from '../providers/provider-models';
import type { AgentInfo, AppConfig, ExecMode, ProviderModelOption } from '../types';
import {
  canUpgradeVelaPlan,
  fetchVelaLoginStatus,
  type VelaLoginStatus,
} from '../providers/daemon';
import { openExternalUrl } from '../providers/registry';
import { amrPlansUrlForWorkspace } from '../runtime/amr-guidance';
import { isMacPlatform } from '../utils/platform';
import {
  useWorkspaceBillingResponse,
  useWorkspaceContext,
  workspaceBillingSnapshotForContext,
} from '../collab/useWorkspaceContext';
import {
  projectWorkspaceContext,
  projectWorkspaceScopeReady,
  type ProjectWorkspaceScopeState,
} from '../collab/useProjectWorkspaceScope';

interface Props {
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string; serviceTier?: string },
  ) => void;
  onApiModelChange?: (model: string) => void;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onOpenSettings: (section?: 'execution') => void;
  onRefreshAgents: () => void;
  onBack?: () => void;
  placement?: 'down' | 'up';
  /** Fired when the dropdown transitions from closed to open. */
  onOpen?: () => void;
  /**
   * Project detail supplies its daemon-authoritative persisted workspace
   * scope. Other surfaces omit it and continue using the ambient navigation
   * workspace.
   */
  projectWorkspaceScope?: ProjectWorkspaceScopeState;
}

/**
 * Compact runtime control. Click opens a dropdown with the Open Design account
 * and the model picker for the active agent. Execution wiring that is not a
 * per-message choice (execution mode, which CLI agent, PATH rescan, BYOK
 * provider setup) lives in Settings → Execution; this popover keeps the
 * active agent's model and reasoning choices close to the composer.
 */
export function AvatarMenu({
  config,
  agents,
  onAgentChange,
  onAgentModelChange,
  onApiModelChange,
  providerModelsCache,
  onOpenSettings,
  onBack,
  placement = 'down',
  onOpen,
  projectWorkspaceScope,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  // recvqfYKutwWlQ: gate the AMR upgrade entry on billing permission below,
  // not just plan tier — a team member without `canManageBilling` (owner-only)
  // can't act on an upgrade even when the tier itself is upgradeable.
  const {
    context: ambientWorkspaceContext,
    loading: ambientWorkspaceContextLoading,
  } = useWorkspaceContext();
  const workspaceContext = projectWorkspaceScope
    ? projectWorkspaceContext(projectWorkspaceScope.scope)
    : ambientWorkspaceContext;
  const workspaceContextLoading = projectWorkspaceScope
    ? projectWorkspaceScope.loading ||
      !projectWorkspaceScopeReady(projectWorkspaceScope.scope)
    : ambientWorkspaceContextLoading;
  const workspaceBillingResponse = useWorkspaceBillingResponse(
    projectWorkspaceScope
      ? {
          context: workspaceContext,
          loading: workspaceContextLoading,
          revision: `${projectWorkspaceScope.scope?.projectId ?? 'unknown'}:${
            projectWorkspaceScope.scope?.workspaceId ?? 'unbound'
          }`,
        }
      : undefined,
  );
  const [open, setOpen] = useState(false);
  // Toggle that reports the closed→open transition (for analytics) without
  // firing on close.
  function toggleOpen() {
    setOpen((v) => {
      if (!v) onOpen?.();
      return !v;
    });
  }
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
      const width = Math.min(208, window.innerWidth - margin * 2);
      const left = Math.min(
        Math.max(rect.left, margin),
        window.innerWidth - width - margin,
      );

      if (placement === 'up') {
        // The model list is unbounded (an agent can expose 30+ models), so the
        // popover has to stay inside the viewport or the active row scrolls off
        // the top of the screen and becomes unreachable.
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

  const amrAgent = useMemo(
    () => agents.find((a) => a.id === 'amr' && a.available) ?? null,
    [agents],
  );
  const amrAvailable = amrAgent !== null;
  const amrProfile = config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE;

  // Fetch the live login status when the popover opens so plan-gated model
  // rows route to the signed-in profile's workspace-scoped plans page (see
  // openAmrUpgrade).
  const [amrAccount, setAmrAccount] = useState<VelaLoginStatus | null>(null);
  useEffect(() => {
    if (!open || !amrAvailable) {
      setAmrAccount(null);
      return;
    }
    let cancelled = false;
    setAmrAccount(null);
    void fetchVelaLoginStatus()
      .then((status) => {
        if (!cancelled) setAmrAccount(status);
      })
      .catch(() => {
        if (!cancelled) setAmrAccount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, amrAvailable]);
  const exactWorkspaceSnapshot = workspaceBillingSnapshotForContext(
    workspaceBillingResponse,
    workspaceContext,
  );
  const scopedPlanId =
    workspaceContext?.workspaceType === 'team'
      ? exactWorkspaceSnapshot?.billing.planId?.trim() || null
      : workspaceContext?.workspaceType === 'personal'
        ? workspaceBillingResponse?.summary?.membershipTier?.trim() || null
        : null;
  const amrPlanId = projectWorkspaceScope
    ? scopedPlanId
    : scopedPlanId ?? (amrAccount?.loggedIn
      ? amrAccount.account?.plan?.trim() || null
      : null);
  const amrResolvedProfile = amrAccount?.profile ?? amrProfile;
  const financialWorkspaceId =
    !workspaceContextLoading && workspaceContext?.workspaceId.trim()
      ? workspaceContext.workspaceId
      : null;
  const amrPlansUrl = amrPlansUrlForWorkspace(
    amrResolvedProfile,
    financialWorkspaceId,
  );
  // Personal workspaces always resolve `canManageBilling` true (the user is
  // their own owner), so this does not affect the personal-workspace upgrade
  // path.
  const amrCanUpgrade =
    !!amrAccount?.loggedIn &&
    canUpgradeVelaPlan(amrPlanId?.replace(/^team[_-]/i, '')) &&
    Boolean(workspaceContext?.permissions?.canManageBilling) &&
    amrPlansUrl !== null;
  const openAmrTarget = (
    targetUrl: string | null,
    source: 'avatar_amr_upgrade',
  ) => {
    if (!targetUrl) return;
    const attribution = recordAmrEntry(analytics.track, source, new Date(), {
      metricsConsent: config.telemetry?.metrics === true,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config.installationId,
    });
    setOpen(false);
    void openExternalUrl(attributedAmrUrl(targetUrl, attribution, deviceId));
  };
  // Plan-gated models stay visible but are not selectable; clicking one routes
  // to the plans page instead of silently choosing a model the run would reject.
  const openAmrUpgrade = () => {
    if (!amrCanUpgrade) return;
    openAmrTarget(amrPlansUrl, 'avatar_amr_upgrade');
  };

  // Resolve the user's model + reasoning pick for the active agent. Falls
  // back to the agent's declared default when the saved effort is absent or
  // belongs to a different model route.
  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const normalizedCurrentChoice = effectiveAgentModelChoice(currentAgent, currentChoice) ?? currentChoice;
  const currentModelId =
    normalizedCurrentChoice.model ?? defaultAgentModelId(currentAgent);
  const activeReasoningOptions =
    currentAgent?.models?.find((model) => model.id === currentModelId)?.reasoningOptions ??
    currentAgent?.reasoningOptions;
  const currentReasoningId =
    activeReasoningOptions?.some(
      (option) => option.id === normalizedCurrentChoice.reasoning,
    )
      ? normalizedCurrentChoice.reasoning!
      : activeReasoningOptions?.find((option) => option.default)?.id ??
        activeReasoningOptions?.[0]?.id ?? null;
  const currentModelOption = currentAgent?.models?.find(
    (m) => m.id === currentModelId,
  ) ?? null;
  const currentModelLabel = currentModelOption?.label;
  const currentServiceTierOptions = currentModelOption?.serviceTierOptions ?? [];
  const currentServiceTierId = currentServiceTierOptions.some(
    (tier) => tier.id === currentChoice.serviceTier,
  )
    ? currentChoice.serviceTier!
    : 'default';
  const apiModelLabel = config.model?.trim() || null;

  // BYOK catalogue for the composer popover. The popover is the model picker
  // for the ACTIVE execution mode, so BYOK mode offers a selectable provider
  // catalogue writing through `onApiModelChange`, exactly like daemon mode
  // offers the agent catalogue through `onAgentModelChange` (regression
  // #6142 collapsed this into a read-only readout). Models come from the
  // shared Settings cache when the host passes one, with a local discovery
  // fetch as fallback so surfaces without cache wiring still get the live
  // catalogue; the curated suggested list seeds the merge either way.
  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const byokProvider = useMemo(
    () =>
      KNOWN_PROVIDERS.find(
        (provider) =>
          provider.protocol === apiProtocol &&
          (config.apiProviderBaseUrl
            ? provider.baseUrl === config.apiProviderBaseUrl
            : false),
      ) ?? KNOWN_PROVIDERS.find((provider) => provider.protocol === apiProtocol),
    [apiProtocol, config.apiProviderBaseUrl],
  );
  const byokModelsKey = providerModelsCacheKey(
    apiProtocol,
    config.baseUrl ?? '',
    config.apiKey ?? '',
    config.apiVersion ?? '',
  );
  const [discoveredByokModels, setDiscoveredByokModels] = useState<
    Record<string, ProviderModelOption[]>
  >({});
  const fetchedByokModels =
    providerModelsCache?.[byokModelsKey] ??
    discoveredByokModels[byokModelsKey] ??
    [];

  useEffect(() => {
    if (!open || config.mode !== 'api') return;
    if (fetchedByokModels.length > 0) return;
    if (apiProtocol === 'azure' || apiProtocol === 'ollama') return;
    const baseUrl = config.baseUrl?.trim() ?? '';
    if (!/^https?:\/\//i.test(baseUrl)) return;
    // AIHubMix's catalogue is public; every other protocol needs a key.
    if (apiProtocol !== 'aihubmix' && !(config.apiKey ?? '').trim()) return;
    const key = byokModelsKey;
    let cancelled = false;
    void fetchProviderModels({
      protocol: apiProtocol,
      baseUrl,
      apiKey: config.apiKey ?? '',
    })
      .then((result) => {
        if (cancelled || !result.ok || !result.models?.length) return;
        setDiscoveredByokModels((current) => ({
          ...current,
          [key]: result.models ?? [],
        }));
      })
      .catch(() => {
        // Non-fatal: the list falls back to the suggested seed models.
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
    byokModelsKey,
    fetchedByokModels.length,
  ]);

  const byokModelOptions = mergeProviderModelOptions(
    fetchedByokModels,
    byokProvider?.preferredModels.length
      ? byokProvider.preferredModels
      : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol] ?? [],
  );

  // Selected-model readout shown inside the trigger (left of the Send button).
  // Hidden by default in CSS; composer-row contexts opt it in.
  const triggerModelLabel =
    config.mode === 'api'
      ? apiModelLabel
      : config.mode === 'daemon'
        ? currentModelLabel ?? currentModelId
        : null;
  // Model id backing the readout — used to resolve the provider brand mark that
  // replaces the model-name text in the composer trigger.
  const triggerModelId =
    config.mode === 'api'
      ? config.model?.trim() || null
      : config.mode === 'daemon'
        ? currentModelId
        : null;
  const triggerModelIconSrc = modelProviderIconSrc(triggerModelId);
  // Whether the daemon-mode popover can offer a real model radio list. When it
  // can't (agent unavailable, or its model catalog is empty — e.g. the AMR
  // member account before the vela catalog resolves), the popover falls back
  // to a static current-model row so it never opens as an empty shell.
  const hasSelectableModels = Boolean(
    currentAgent &&
      currentAgent.available &&
      ((currentAgent.models && currentAgent.models.length > 0) ||
        (currentAgent.reasoningOptions && currentAgent.reasoningOptions.length > 0)),
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
        {config.mode === 'daemon' && currentAgent ? (
          <AgentIcon id={currentAgent.id} size={20} />
        ) : (
          <RemixIcon name="link" size={20} />
        )}
        {triggerModelLabel ? (
          <span className="avatar-agent-trigger__model">
            {triggerModelIconSrc ? (
              <img
                className="avatar-agent-trigger__model-logo"
                src={triggerModelIconSrc}
                alt={triggerModelLabel}
                width={18}
                height={18}
              />
            ) : (
              triggerModelLabel
            )}
          </span>
        ) : null}
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
          {config.mode === 'daemon' ? (
            <>
              {hasSelectableModels && currentAgent ? (
                <div className="avatar-model-section">
                  {currentAgent.models && currentAgent.models.length > 0 ? (
                    <div className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.modelLabel')}
                      </span>
                      <div
                        className="avatar-model-list"
                        role="radiogroup"
                        aria-label={t('avatar.modelLabel')}
                        data-testid="avatar-model-list"
                      >
                        {(currentModelId &&
                        !currentAgent.models.some((m) => m.id === currentModelId)
                          ? [
                              ...currentAgentModelOptions,
                              {
                                id: currentModelId,
                                label: `${currentModelId} ${t('avatar.customSuffix')}`,
                              },
                            ]
                          : currentAgentModelOptions
                        ).map((model) => {
                          const active = model.id === currentModelId;
                          // Same gate the home composer's compact list asks —
                          // one definition of "locked", derived from what the
                          // config will actually keep, so the two surfaces
                          // cannot drift apart again.
                          const locked = !agentModelIsSelectable(
                            currentAgent,
                            model.id,
                          );
                          return (
                            <button
                              key={model.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              aria-disabled={locked ? 'true' : undefined}
                              title={
                                locked
                                  ? t('settings.amrModelUpgradeHint')
                                  : undefined
                              }
                              className={`avatar-model-option${active ? ' is-active' : ''}${
                                locked ? ' is-locked' : ''
                              }`}
                              data-testid={`avatar-model-option-${model.id}`}
                              onClick={() => {
                                if (locked) {
                                  openAmrUpgrade();
                                  return;
                                }
                                onAgentModelChange(currentAgent.id, {
                                  model: model.id,
                                  serviceTier: undefined,
                                });
                                // Selection made — dismiss the popover right away.
                                setOpen(false);
                              }}
                            >
                              <span
                                className="avatar-model-option-logo"
                                aria-hidden="true"
                              >
                                {(() => {
                                  const src = modelProviderIconSrc(model.id);
                                  return src ? (
                                    <img
                                      src={src}
                                      alt=""
                                      width={16}
                                      height={16}
                                    />
                                  ) : (
                                    <AgentIcon id={currentAgent.id} size={16} />
                                  );
                                })()}
                              </span>
                              <span className="avatar-model-option-label">
                                {model.label}
                              </span>
                              {locked ? (
                                <RemixIcon
                                  name="lock-line"
                                  size={14}
                                  className="avatar-model-option-check"
                                />
                              ) : active ? (
                                <RemixIcon
                                  name="check-line"
                                  size={14}
                                  className="avatar-model-option-check"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {activeReasoningOptions &&
                  activeReasoningOptions.length > 0 &&
                  currentReasoningId ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.reasoningLabel')}
                      </span>
                      <select
                        className="avatar-select"
                        value={currentReasoningId}
                        onChange={(event) =>
                          onAgentModelChange(currentAgent.id, {
                            reasoning: event.target.value,
                          })
                        }
                      >
                        {activeReasoningOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {currentServiceTierOptions.length > 0 ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.serviceTierLabel')}
                      </span>
                      <select
                        className="avatar-select"
                        value={currentServiceTierId}
                        onChange={(event) =>
                          onAgentModelChange(currentAgent.id, {
                            serviceTier:
                              event.target.value === 'default'
                                ? undefined
                                : event.target.value,
                          })
                        }
                      >
                        <option value="default">{t('common.default')}</option>
                        {currentServiceTierOptions.map((tier) => (
                          <option key={tier.id} value={tier.id}>
                            {tier.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : currentModelLabel ? (
                <div className="avatar-model-section">
                  <div className="avatar-select-row">
                    <span className="avatar-select-label">
                      {t('avatar.modelLabel')}
                    </span>
                    <div className="avatar-static-value">{currentModelLabel}</div>
                  </div>
                </div>
              ) : currentAgent ? (
                <div className="avatar-model-section">
                  <div className="avatar-select-row">
                    <span className="avatar-select-label">
                      {t('avatar.codeAgent')}
                    </span>
                    <div className="avatar-static-value">{currentAgent.name}</div>
                  </div>
                </div>
              ) : (
                <div className="avatar-model-section">
                  <div className="avatar-select-row">
                    <div className="avatar-static-value">
                      {t('avatar.noAgentSelected')}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {config.mode === 'api' ? (
            byokModelOptions.length > 0 ? (
              <div className="avatar-model-section">
                <div className="avatar-select-row">
                  <span className="avatar-select-label">
                    {t('avatar.modelLabel')}
                  </span>
                  <div
                    className="avatar-model-list"
                    role="radiogroup"
                    aria-label={t('avatar.modelLabel')}
                    data-testid="avatar-model-list"
                  >
                    {(config.model &&
                    !byokModelOptions.some((m) => m.id === config.model)
                      ? [
                          ...byokModelOptions,
                          {
                            id: config.model,
                            label: `${config.model} ${t('avatar.customSuffix')}`,
                          },
                        ]
                      : byokModelOptions
                    ).map((model) => {
                      const active = model.id === config.model;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`avatar-model-option${active ? ' is-active' : ''}`}
                          data-testid={`avatar-model-option-${model.id}`}
                          onClick={() => {
                            onApiModelChange?.(model.id);
                            // Selection made — dismiss the popover right away.
                            setOpen(false);
                          }}
                        >
                          <span
                            className="avatar-model-option-logo"
                            aria-hidden="true"
                          >
                            {(() => {
                              const src = modelProviderIconSrc(model.id);
                              return src ? (
                                <img src={src} alt="" width={16} height={16} />
                              ) : (
                                <RemixIcon name="link" size={16} />
                              );
                            })()}
                          </span>
                          <span className="avatar-model-option-label">
                            {model.label}
                          </span>
                          {active ? (
                            <RemixIcon
                              name="check-line"
                              size={14}
                              className="avatar-model-option-check"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : apiModelLabel ? (
              // Never an empty shell: with no catalogue to offer (e.g. Azure
              // deployments are free-form names), keep the current model
              // visible as a readout.
              <div className="avatar-model-section">
                <div className="avatar-select-row">
                  <span className="avatar-select-label">
                    {t('avatar.modelLabel')}
                  </span>
                  <div className="avatar-static-value">{apiModelLabel}</div>
                </div>
              </div>
            ) : null
          ) : null}

          {/* The one link out to 设置 → 执行. #5517's popover has no such entry,
              but #5517 also never moved CLI switching out of this popover — we
              did (2026-07-21), so without this the place that switching moved TO
              is unreachable from here. Pinned to the bottom of the scroll port
              like the home switcher's, so a long model list cannot scroll it
              away. */}
          <button
            type="button"
            className="avatar-item avatar-item--pinned"
            data-testid="avatar-open-execution-settings"
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
