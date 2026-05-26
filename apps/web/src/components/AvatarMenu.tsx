import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { RemixIcon } from './RemixIcon';
import { renderModelOptions } from './modelOptions';
import type { AgentInfo, AppConfig, ExecMode } from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { isMacPlatform } from '../utils/platform';

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
  onOpenSettings: () => void;
  onRefreshAgents: () => void;
  onBack?: () => void;
}

/**
 * Compact settings control at the right of the project header. Click opens a dropdown
 * with current execution mode, the agent picker (when in daemon mode), and
 * a Settings entry — replaces the wide AgentPicker + env-pill row.
 */
export function AvatarMenu({
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onOpenSettings,
  onRefreshAgents,
  onBack,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
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

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const installedAgents = agents.filter((a) => a.available);

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

  return (
    <div className="avatar-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="avatar-agent-trigger"
        onClick={() => setOpen((v) => !v)}
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
      {open ? (
        <div className="avatar-popover" role="dialog" aria-label={t('avatar.title')}>
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
                  ? `${currentAgent.name}${currentAgent.version ? ` · ${currentAgent.version}` : ''}${currentModelLabel && currentModelId !== 'default' ? ` · ${currentModelLabel}` : ''}`
                  : t('avatar.noAgentSelected')}
            </span>
          </div>

          <button
            type="button"
            className={`avatar-item${config.mode === 'daemon' ? ' active' : ''}`}
            aria-current={config.mode === 'daemon' ? 'true' : undefined}
            onClick={() => {
              if (config.mode === 'daemon') {
                setOpen(false);
                if (!daemonLive) {
                  onOpenSettings();
                }
                return;
              }
              onModeChange('daemon');
              if (!daemonLive) {
                // No daemon — let user know via settings page rather than
                // silently failing.
                setOpen(false);
                onOpenSettings();
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
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      onAgentChange(a.id);
                      // Keep the popover open so the user can immediately
                      // pick a model for the agent they just chose.
                    }}
                  >
                    <AgentIcon id={a.id} size={18} />
                    <span>{a.name}</span>
                    {selected ? (
                      <span className="avatar-item-meta">
                        {t('avatar.metaSelected')}
                      </span>
                    ) : a.version ? (
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
                  <div className="avatar-section-label">
                    {t('avatar.modelSection')}
                  </div>
                  {currentAgent.models && currentAgent.models.length > 0 ? (
                    <label className="avatar-select-row">
                      <span className="avatar-select-label">
                        {t('avatar.modelLabel')}
                      </span>
                      <select
                        className="avatar-select"
                        value={currentModelId ?? ''}
                        onChange={(e) =>
                          onAgentModelChange(currentAgent.id, {
                            model: e.target.value,
                          })
                        }
                      >
                        {renderModelOptions(currentAgent.models)}
                        {/* When the user has typed a custom id in
                            Settings, surface it here too so the dropdown
                            actually shows the active selection rather
                            than collapsing to "Default". */}
                        {currentModelId &&
                        !currentAgent.models.some(
                          (m) => m.id === currentModelId,
                        ) ? (
                          <option value={currentModelId}>
                            {currentModelId}{' '}
                            {t('avatar.customSuffix')}
                          </option>
                        ) : null}
                      </select>
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

          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />

          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <RemixIcon name="settings-line" size={15} />
            </span>
            <span>{t('avatar.settings')}</span>
            <span className="avatar-item-meta">{isMacPlatform() ? '⌘,' : 'Ctrl+,'}</span>
          </button>
          {onBack ? (
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
          ) : null}
        </div>
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
