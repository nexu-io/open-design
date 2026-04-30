import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCALE_LABEL, LOCALES, useI18n } from '../i18n';
import type { Locale } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import {
  CUSTOM_MODEL_SENTINEL,
  isCustomModel,
  renderModelOptions,
} from './modelOptions';
import { KNOWN_PROVIDERS } from '../state/config';
import type { AgentInfo, AppConfig, ExecMode } from '../types';

interface Props {
  initial: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  welcome?: boolean;
  onSave: (cfg: AppConfig) => void;
  onClose: () => void;
  onRefreshAgents: () => void;
}

const SUGGESTED_MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'mimo-v2.5-pro',
];

export function SettingsDialog({
  initial,
  agents,
  daemonLive,
  welcome,
  onSave,
  onClose,
  onRefreshAgents,
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const [cfg, setCfg] = useState<AppConfig>(initial);
  const [showApiKey, setShowApiKey] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageMenuRect, setLanguageMenuRect] = useState<DOMRect | null>(null);
  const languageRef = useRef<HTMLDivElement | null>(null);

  // If the daemon goes offline mid-edit, force API mode so the UI doesn't
  // pretend Local CLI is selectable.
  useEffect(() => {
    if (!daemonLive && cfg.mode === 'daemon') {
      setCfg((c) => ({ ...c, mode: 'api' }));
    }
  }, [daemonLive, cfg.mode]);

  useEffect(() => {
    if (!languageOpen) return;
    const updateRect = () => {
      const button = languageRef.current?.querySelector('button');
      setLanguageMenuRect(button?.getBoundingClientRect() ?? null);
    };
    updateRect();
    function onDown(e: MouseEvent) {
      if (languageRef.current?.contains(e.target as Node)) return;
      setLanguageOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLanguageOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [languageOpen]);

  const installedCount = useMemo(
    () => agents.filter((a) => a.available).length,
    [agents],
  );

  const setMode = (mode: ExecMode) => setCfg((c) => ({ ...c, mode }));

  const canSave =
    cfg.mode === 'daemon'
      ? Boolean(cfg.agentId && agents.find((a) => a.id === cfg.agentId)?.available)
      : Boolean(cfg.apiKey.trim() && cfg.model.trim() && cfg.baseUrl.trim());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          {welcome ? (
            <>
              <span className="kicker">{t('settings.welcomeKicker')}</span>
              <h2>{t('settings.welcomeTitle')}</h2>
              <p className="subtitle">{t('settings.welcomeSubtitle')}</p>
            </>
          ) : (
            <>
              <span className="kicker">{t('settings.kicker')}</span>
              <h2>{t('settings.title')}</h2>
              <p className="subtitle">{t('settings.subtitle')}</p>
            </>
          )}
        </header>

        <div className="modal-body">
          <div
            className="seg-control"
            role="tablist"
            aria-label={t('settings.modeAria')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={cfg.mode === 'daemon'}
              className={'seg-btn' + (cfg.mode === 'daemon' ? ' active' : '')}
              disabled={!daemonLive}
              onClick={() => setMode('daemon')}
              title={
                daemonLive
                  ? t('settings.modeDaemonHelp')
                  : t('settings.modeDaemonOffline')
              }
            >
              <span className="seg-title">{t('settings.modeDaemon')}</span>
              <span className="seg-meta">
                {daemonLive
                  ? t('settings.modeDaemonInstalledMeta', { count: installedCount })
                  : t('settings.modeDaemonOfflineMeta')}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cfg.mode === 'api'}
              className={'seg-btn' + (cfg.mode === 'api' ? ' active' : '')}
              onClick={() => setMode('api')}
            >
              <span className="seg-title">{t('settings.modeApi')}</span>
              <span className="seg-meta">{t('settings.modeApiMeta')}</span>
            </button>
          </div>

          {cfg.mode === 'daemon' ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{t('settings.codeAgent')}</h3>
                  <p className="hint">{t('settings.codeAgentHint')}</p>
                </div>
                <button
                  type="button"
                  className="ghost icon-btn"
                  onClick={onRefreshAgents}
                  title={t('settings.rescanTitle')}
                >
                  {t('settings.rescan')}
                </button>
              </div>
              {agents.length === 0 ? (
                <div className="empty-card">
                  {t('settings.noAgentsDetected')}
                </div>
              ) : (
                <div className="agent-grid">
                  {agents.map((a) => {
                    const active = cfg.agentId === a.id;
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={
                          'agent-card' +
                          (active ? ' active' : '') +
                          (a.available ? '' : ' disabled')
                        }
                        onClick={() =>
                          a.available && setCfg((c) => ({ ...c, agentId: a.id }))
                        }
                        disabled={!a.available}
                        aria-pressed={active}
                      >
                        <AgentIcon id={a.id} size={40} />
                        <div className="agent-card-body">
                          <div className="agent-card-name">{a.name}</div>
                          <div className="agent-card-meta">
                            {a.available ? (
                              a.version ? (
                                <span title={a.path ?? ''}>{a.version}</span>
                              ) : (
                                <span title={a.path ?? ''}>
                                  {t('common.installed')}
                                </span>
                              )
                            ) : (
                              <span className="muted">
                                {t('common.notInstalled')}
                              </span>
                            )}
                          </div>
                        </div>
                        {a.available ? (
                          <span
                            className={'status-dot' + (active ? ' active' : '')}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const selected = agents.find(
                  (a) => a.id === cfg.agentId && a.available,
                );
                if (!selected) return null;
                const hasModels =
                  Array.isArray(selected.models) && selected.models.length > 0;
                const hasReasoning =
                  Array.isArray(selected.reasoningOptions) &&
                  selected.reasoningOptions.length > 0;
                if (!hasModels && !hasReasoning) return null;
                const choice = cfg.agentModels?.[selected.id] ?? {};
                const setChoice = (
                  next: { model?: string; reasoning?: string },
                ) => {
                  setCfg((c) => {
                    const prev = c.agentModels?.[selected.id] ?? {};
                    return {
                      ...c,
                      agentModels: {
                        ...(c.agentModels ?? {}),
                        [selected.id]: { ...prev, ...next },
                      },
                    };
                  });
                };
                const modelValue =
                  choice.model ?? selected.models?.[0]?.id ?? '';
                const reasoningValue =
                  choice.reasoning ??
                  selected.reasoningOptions?.[0]?.id ?? '';
                const customActive =
                  hasModels && isCustomModel(modelValue, selected.models!);
                const selectValue = customActive
                  ? CUSTOM_MODEL_SENTINEL
                  : modelValue;
                return (
                  <div className="agent-model-row">
                    {hasModels ? (
                      <label className="field">
                        <span className="field-label">
                          {t('settings.modelPicker')}
                        </span>
                        <select
                          value={selectValue}
                          onChange={(e) => {
                            if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                              // Switching to "Custom…" should clear the
                              // value so the input below opens empty for
                              // typing — keeping the previous live id
                              // would defeat the point.
                              setChoice({ model: '' });
                            } else {
                              setChoice({ model: e.target.value });
                            }
                          }}
                        >
                          {renderModelOptions(selected.models!)}
                          <option value={CUSTOM_MODEL_SENTINEL}>
                            {t('settings.modelCustom')}
                          </option>
                        </select>
                      </label>
                    ) : null}
                    {customActive ? (
                      <label className="field">
                        <span className="field-label">
                          {t('settings.modelCustomLabel')}
                        </span>
                        <input
                          type="text"
                          value={modelValue}
                          placeholder={t('settings.modelCustomPlaceholder')}
                          onChange={(e) =>
                            setChoice({ model: e.target.value.trim() })
                          }
                        />
                      </label>
                    ) : null}
                    {hasReasoning ? (
                      <label className="field">
                        <span className="field-label">
                          {t('settings.reasoningPicker')}
                        </span>
                        <select
                          value={reasoningValue}
                          onChange={(e) =>
                            setChoice({ reasoning: e.target.value })
                          }
                        >
                          {selected.reasoningOptions!.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <p className="hint">{t('settings.modelPickerHint')}</p>
                  </div>
                );
              })()}
            </section>
          ) : (
            <section className="settings-section">
              <div className="section-head">
                <h3>{t('settings.apiSection')}</h3>
              </div>
              <label className="field">
                <span className="field-label">{t('settings.apiKey')}</span>
                <div className="field-row">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk-ant-..."
                    value={cfg.apiKey}
                    onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="ghost icon-btn"
                    onClick={() => setShowApiKey((v) => !v)}
                    title={
                      showApiKey ? t('settings.hideKey') : t('settings.showKey')
                    }
                  >
                    {showApiKey ? t('settings.hide') : t('settings.show')}
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">{t('settings.model')}</span>
                <input
                  type="text"
                  value={cfg.model}
                  list="suggested-models"
                  onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                />
                <datalist id="suggested-models">
                  {SUGGESTED_MODELS.map((m) => (
                    <option value={m} key={m} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span className="field-label">{t('settings.baseUrl')}</span>
                <input
                  type="text"
                  value={cfg.baseUrl}
                  onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Quick fill provider</span>
                <select
                  value=""
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    if (!isNaN(idx) && KNOWN_PROVIDERS[idx]) {
                      const p = KNOWN_PROVIDERS[idx]!;
                      setCfg((c) => ({ ...c, baseUrl: p.baseUrl, model: p.model }));
                    }
                  }}
                >
                  <option value="">— choose a provider —</option>
                  {KNOWN_PROVIDERS.map((p, i) => (
                    <option key={i} value={i}>{p.label}</option>
                  ))}
                </select>
              </label>
              <p className="hint">{t('settings.apiHint')}</p>
            </section>
          )}

          <section className="settings-section">
            <div className="section-head">
              <div>
                <h3>{t('settings.language')}</h3>
                <p className="hint">{t('settings.languageHint')}</p>
              </div>
            </div>
            <div className="settings-language-picker" ref={languageRef}>
              <button
                type="button"
                className="settings-language-button"
                aria-haspopup="menu"
                aria-expanded={languageOpen}
                onClick={() => setLanguageOpen((v) => !v)}
              >
                <span className="settings-language-icon" aria-hidden="true">
                  <Icon name="languages" size={22} strokeWidth={1.8} />
                </span>
                <span className="settings-language-text">
                  <span className="settings-language-title">
                    {LOCALE_LABEL[locale]}
                  </span>
                  <span className="settings-language-code">{locale}</span>
                </span>
                <Icon name="chevron-down" size={16} />
              </button>
              {languageOpen && languageMenuRect ? (
                <div
                  className="settings-language-menu"
                  role="menu"
                  style={{
                    bottom: window.innerHeight - languageMenuRect.top + 6,
                    left: languageMenuRect.left,
                    width: languageMenuRect.width,
                  }}
                >
                  {LOCALES.map((code) => {
                    const active = locale === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`settings-language-option${active ? ' active' : ''}`}
                        onClick={() => {
                          setLocale(code as Locale);
                          setLanguageOpen(false);
                        }}
                      >
                        <span>
                          <span className="settings-language-option-title">
                            {LOCALE_LABEL[code]}
                          </span>
                          <span className="settings-language-option-code">
                            {code}
                          </span>
                        </span>
                        {active ? <Icon name="check" size={16} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" className="ghost" onClick={onClose}>
            {welcome ? t('settings.skipForNow') : t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canSave}
            onClick={() => onSave(cfg)}
          >
            {welcome ? t('settings.getStarted') : t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
