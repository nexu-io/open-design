import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { RemixIcon } from './RemixIcon';
import { SearchableModelSelect } from './modelOptions';
import type { AgentInfo, AppConfig, ExecMode, ProviderModelOption } from '../types';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import { KNOWN_PROVIDERS } from '../state/config';
import { mergeProviderModelOptions, providerModelsCacheKey } from './SettingsDialog';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { fetchProviderModels } from '../providers/provider-models';
import { isMacPlatform } from '../utils/platform';
import { amrConsoleUrlForProfile } from '../runtime/amr-guidance';

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
  return agent.id === 'amr' ? 'Open Design AMR' : agent.name;
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

  const installedAgents = agents.filter((a) => a.available);
  const amrAvailable = installedAgents.some((a) => a.id === 'amr');
  const showAmrAccountShortcut =
    config.mode === 'daemon' && currentAgent?.id === 'amr' && amrAvailable;
  const amrProfile = config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE;
  const amrConsoleUrl = amrConsoleUrlForProfile(amrProfile);

  // Resolve the user's model + reasoning pick for the active agent. Falls
  // back to the agent's first declared option (`'default'`) when the user
  // hasn't touched the picker yet so the labels don't read as empty.
  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const currentModelId =
    currentChoice.model ?? currentAgent?.models?.[0]?.id ?? null;
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
          {showAmrAccountShortcut ? (
            <a
              className="avatar-amr-account-link"
              href={amrConsoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <span className="avatar-amr-account-link__icon" aria-hidden>
                <RemixIcon name="wallet-3-line" size={15} />
              </span>
              <span className="avatar-amr-account-link__copy">
                <span>{t('avatar.amrConsole')}</span>
                <span>{t('avatar.amrConsoleMeta')}</span>
              </span>
              <RemixIcon name="external-link-line" size={13} />
            </a>
          ) : null}

          <button
            type="button"
            className={`avatar-item${config.mode === 'daemon' ? ' active' : ''}`}
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
            {config.mode === 'daemon' ? (
              <span className="avatar-item-meta">{t('avatar.metaActive')}</span>
            ) : !daemonLive ? (
              <span className="avatar-item-meta">{t('avatar.metaOffline')}</span>
            ) : null}
            {config.mode === 'daemon' ? (
              <RemixIcon name="check-line" size={14} className="avatar-item-check" />
            ) : null}
          </button>
          <button
            type="button"
            className={`avatar-item${config.mode === 'api' ? ' active' : ''}`}
            aria-current={config.mode === 'api' ? 'true' : undefined}
            onClick={() => onModeChange('api')}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="link" size={15} />
            </span>
            <span>{t('avatar.useApi')}</span>
            {config.mode === 'api' ? (
              <span className="avatar-item-meta">{t('avatar.metaActive')}</span>
            ) : null}
            {config.mode === 'api' ? (
              <RemixIcon name="check-line" size={14} className="avatar-item-check" />
            ) : null}
          </button>

          {config.mode === 'daemon' && installedAgents.length > 0 ? (
            <>
              <div className="avatar-section-label">{t('avatar.codeAgent')}</div>
              {installedAgents.map((a) => {
                const selected = config.agentId === a.id;
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
                    {selected ? (
                      <span className="avatar-item-meta">
                        {t('avatar.metaSelected')}
                      </span>
                    ) : a.id !== 'amr' && a.version ? (
                      <span className="avatar-item-meta">{a.version}</span>
                    ) : null}
                    {selected ? (
                      <RemixIcon name="check-line" size={14} className="avatar-item-check" />
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
                        models={currentAgent.models}
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
                  models={byokModelOptions.map((m) => ({ id: m.id, label: m.label }))}
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
