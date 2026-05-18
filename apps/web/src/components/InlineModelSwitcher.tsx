// InlineModelSwitcher — top-bar chip exposing CLI/BYOK + model picker.
//
// Lives in the entry view's sticky top-bar so users can swap between a
// local CLI and BYOK (and the active model under either) without having
// to open the full Settings dialog. The chip is intentionally narrow —
// it shows the active mode + agent/provider + model in one line and
// opens a compact popover for switching. All persistence is delegated
// upward through the same callbacks `AvatarMenu` already uses, so the
// switcher inherits autosave + daemon sync without re-implementing it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { KNOWN_PROVIDERS } from '../state/config';
import type { AgentInfo, ApiProtocol, AppConfig, ExecMode } from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import { renderModelOptions } from './modelOptions';

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
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'about',
  ) => void;
}

const API_PROTOCOL_TABS: Array<{ id: ApiProtocol; title: string }> = [
  { id: 'anthropic', title: 'Anthropic' },
  { id: 'openai', title: 'OpenAI' },
  { id: 'azure', title: 'Azure' },
  { id: 'google', title: 'Google' },
];

export function InlineModelSwitcher({
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const installedAgents = useMemo(
    () => agents.filter((a) => a.available),
    [agents],
  );
  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const currentModelId =
    currentChoice.model ?? currentAgent?.models?.[0]?.id ?? null;
  const currentModelLabel =
    currentAgent?.models?.find((m) => m.id === currentModelId)?.label ?? null;

  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const providerForProtocol = useMemo(
    () =>
      KNOWN_PROVIDERS.find(
        (p) =>
          p.protocol === apiProtocol &&
          (config.apiProviderBaseUrl
            ? p.baseUrl === config.apiProviderBaseUrl
            : false),
      ) ?? KNOWN_PROVIDERS.find((p) => p.protocol === apiProtocol),
    [apiProtocol, config.apiProviderBaseUrl],
  );
  const apiModelOptions = providerForProtocol?.models ?? [];

  // Chip text — keep it tight so the pill doesn't wrap on small viewports.
  // CLI: "Claude · Sonnet 4.5"; BYOK: "Anthropic · sonnet-4.5".
  const chipMode =
    config.mode === 'daemon'
      ? t('inlineSwitcher.chipCli')
      : t('inlineSwitcher.chipByok');
  const chipPrimary =
    config.mode === 'daemon'
      ? currentAgent?.name ?? t('inlineSwitcher.noAgent')
      : apiProtocolLabel(apiProtocol);
  const chipModel =
    config.mode === 'daemon'
      ? currentModelLabel && currentModelId !== 'default'
        ? currentModelLabel
        : t('inlineSwitcher.modelDefault')
      : config.model.trim() || t('inlineSwitcher.modelDefault');

  return (
    <div className="inline-switcher" ref={wrapRef}>
      <button
        type="button"
        className="inline-switcher__chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('inlineSwitcher.chipTitle')}
      >
        <span className="inline-switcher__chip-icon" aria-hidden="true">
          {config.mode === 'daemon' && currentAgent ? (
            <AgentIcon id={currentAgent.id} size={18} />
          ) : (
            <span className="inline-switcher__byok-glyph">
              <Icon name="link" size={12} />
            </span>
          )}
        </span>
        <span className="inline-switcher__chip-text">
          <span className="inline-switcher__chip-mode">{chipMode}</span>
          <span className="inline-switcher__chip-sep" aria-hidden="true">
            ·
          </span>
          <span className="inline-switcher__chip-primary">{chipPrimary}</span>
          <span className="inline-switcher__chip-sep" aria-hidden="true">
            ·
          </span>
          <span className="inline-switcher__chip-model">{chipModel}</span>
        </span>
        <Icon
          name="chevron-down"
          size={12}
          className="inline-switcher__chip-chevron"
        />
      </button>

      {open ? (
        <div className="inline-switcher__popover" role="menu">
          <div className="inline-switcher__row">
            <span className="inline-switcher__label">
              {t('inlineSwitcher.modeLabel')}
            </span>
            <div className="inline-switcher__seg" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={config.mode === 'daemon'}
                className={
                  'inline-switcher__seg-btn' +
                  (config.mode === 'daemon' ? ' is-active' : '')
                }
                disabled={!daemonLive && config.mode !== 'daemon'}
                onClick={() => {
                  // Optional-call so a transient Fast Refresh state where a
                  // parent has not yet re-rendered with the new prop signature
                  // does not crash the entire entry view. The same defensive
                  // pattern is applied to every callback below.
                  onModeChange?.('daemon');
                  if (!daemonLive) {
                    setOpen(false);
                    onOpenSettings?.('execution');
                  }
                }}
                title={
                  !daemonLive
                    ? t('inlineSwitcher.daemonOffline')
                    : t('inlineSwitcher.useCli')
                }
              >
                {t('inlineSwitcher.chipCli')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={config.mode === 'api'}
                className={
                  'inline-switcher__seg-btn' +
                  (config.mode === 'api' ? ' is-active' : '')
                }
                onClick={() => onModeChange?.('api')}
                title={t('inlineSwitcher.useByok')}
              >
                {t('inlineSwitcher.chipByok')}
              </button>
            </div>
          </div>

          {config.mode === 'daemon' ? (
            <>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">
                  {t('inlineSwitcher.agentLabel')}
                </span>
                {installedAgents.length === 0 ? (
                  <span className="inline-switcher__hint">
                    {t('inlineSwitcher.noAgentsDetected')}
                  </span>
                ) : (
                  <div
                    className="inline-switcher__agent-grid"
                    role="radiogroup"
                  >
                    {installedAgents.map((a) => {
                      const active = config.agentId === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={
                            'inline-switcher__agent' +
                            (active ? ' is-active' : '')
                          }
                          onClick={() => onAgentChange?.(a.id)}
                          title={a.version ? `${a.name} · ${a.version}` : a.name}
                        >
                          <AgentIcon id={a.id} size={20} />
                          <span className="inline-switcher__agent-name">
                            {a.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {currentAgent &&
              currentAgent.models &&
              currentAgent.models.length > 0 ? (
                <div className="inline-switcher__row">
                  <span className="inline-switcher__label">
                    {t('inlineSwitcher.modelLabel')}
                  </span>
                  <select
                    className="inline-switcher__select"
                    value={currentModelId ?? ''}
                    onChange={(e) =>
                      onAgentModelChange?.(currentAgent.id, {
                        model: e.target.value,
                      })
                    }
                  >
                    {renderModelOptions(currentAgent.models)}
                    {currentModelId &&
                    !currentAgent.models.some((m) => m.id === currentModelId) ? (
                      <option value={currentModelId}>
                        {currentModelId} {t('inlineSwitcher.customSuffix')}
                      </option>
                    ) : null}
                  </select>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">
                  {t('inlineSwitcher.providerLabel')}
                </span>
                <div className="inline-switcher__chips" role="tablist">
                  {API_PROTOCOL_TABS.map((tab) => {
                    const active = apiProtocol === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={
                          'inline-switcher__chip-tab' +
                          (active ? ' is-active' : '')
                        }
                        onClick={() => onApiProtocolChange?.(tab.id)}
                      >
                        {tab.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="inline-switcher__row">
                <span className="inline-switcher__label">
                  {t('inlineSwitcher.modelLabel')}
                </span>
                {apiModelOptions.length > 0 ? (
                  <select
                    className="inline-switcher__select"
                    value={config.model}
                    onChange={(e) => onApiModelChange?.(e.target.value)}
                  >
                    {apiModelOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                    {config.model &&
                    !apiModelOptions.includes(config.model) ? (
                      <option value={config.model}>
                        {config.model} {t('inlineSwitcher.customSuffix')}
                      </option>
                    ) : null}
                  </select>
                ) : (
                  <span className="inline-switcher__hint">
                    {t('inlineSwitcher.openSettingsForModel')}
                  </span>
                )}
              </div>

              {!config.apiKey ? (
                <div className="inline-switcher__warn" role="status">
                  {t('inlineSwitcher.missingApiKey')}
                </div>
              ) : null}
            </>
          )}

          <button
            type="button"
            className="inline-switcher__more"
            onClick={() => {
              setOpen(false);
              onOpenSettings?.('execution');
            }}
          >
            <Icon name="settings" size={13} />
            <span>{t('inlineSwitcher.openFullSettings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
