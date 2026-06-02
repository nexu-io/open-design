import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
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
  placement?: 'down' | 'up';
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
  onOpenSettings,
  onRefreshAgents,
  onBack,
  placement = 'down',
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
    <div className={`avatar-menu avatar-menu--${placement}`} ref={wrapRef}>
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
