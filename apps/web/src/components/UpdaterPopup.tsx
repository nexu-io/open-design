import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';

import { Icon } from './Icon';
import { popoverIn } from '../motion';
import {
  deriveUpdaterModel,
  openUpdaterInstaller,
  quitAfterUpdaterInstallerOpen,
  readUpdaterStatus,
  subscribeToUpdaterStatus,
  type UpdaterModel,
} from '../lib/updater';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { useAnalytics, useAppVersion } from '../analytics/provider';
import {
  trackUpdateIndicatorClick,
  trackUpdateIndicatorSurfaceView,
  trackUpdateInstallResult,
  trackUpdatePromptSurfaceView,
} from '../analytics/events';

const INSTALL_HANDOFF_WATCHDOG_MS = 10_000;

type InstallState = 'idle' | 'opening' | 'handoff' | 'recoverable';
type Translator = (key: keyof Dict, vars?: Record<string, string | number>) => string;

function versionText(t: Translator, model: UpdaterModel): string {
  const version = model.availableVersion;
  if (model.updateKind === 'payload') {
    return version == null ? t('updater.payloadReadyGeneric') : t('updater.payloadReadyVersion', { version });
  }
  return version == null ? t('updater.readyGeneric') : t('updater.readyVersion', { version });
}

function installActionText(t: Translator, model: UpdaterModel, installBusy: boolean): string {
  if (model.updateKind === 'payload') {
    return installBusy ? t('updater.installingRestart') : t('updater.installRestart');
  }
  return installBusy ? t('updater.opening') : t('updater.openInstaller');
}

function channelLabelFor(channel: string | null | undefined): string | null {
  switch (channel) {
    case 'beta':
      return 'Beta channel';
    case 'nightly':
      return 'Nightly channel';
    case 'preview':
      return 'Preview channel';
    case 'stable':
      return 'Stable channel';
    default:
      return null;
  }
}

function updateVersionProps(model: UpdaterModel, appVersionBefore: string | null) {
  return {
    ...(appVersionBefore ? { app_version_before: appVersionBefore } : {}),
    ...(model.availableVersion ? { app_version_after: model.availableVersion } : {}),
  };
}

function updaterErrorCode(model: UpdaterModel): string | undefined {
  return model.status?.error?.code;
}

export function UpdaterPopup() {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const actionInFlightRef = useRef(false);
  const handoffWatchdogRef = useRef<number | null>(null);
  const [model, setModel] = useState<UpdaterModel>(() => deriveUpdaterModel(null));
  const [panelOpen, setPanelOpen] = useState(false);
  const [installState, setInstallState] = useState<InstallState>('idle');

  const clearHandoffWatchdog = useCallback(() => {
    if (handoffWatchdogRef.current == null) return;
    window.clearTimeout(handoffWatchdogRef.current);
    handoffWatchdogRef.current = null;
  }, []);

  const recoverFromInstallerHandoff = useCallback(() => {
    handoffWatchdogRef.current = null;
    actionInFlightRef.current = false;
    setInstallState('recoverable');
    setPanelOpen(true);
  }, []);

  const startHandoffWatchdog = useCallback(() => {
    clearHandoffWatchdog();
    // The quit IPC can resolve before Electron has actually torn down the
    // renderer. Keep the handoff UI up, but do not leave it stuck forever.
    handoffWatchdogRef.current = window.setTimeout(recoverFromInstallerHandoff, INSTALL_HANDOFF_WATCHDOG_MS);
  }, [clearHandoffWatchdog, recoverFromInstallerHandoff]);

  useEffect(() => clearHandoffWatchdog, [clearHandoffWatchdog]);

  useEffect(() => {
    let mounted = true;
    const applyStatus = (status: OpenDesignHostUpdaterStatusSnapshot) => {
      if (!mounted) return;
      setModel(deriveUpdaterModel(status, { hostAvailable: true }));
    };
    const unsubscribe = subscribeToUpdaterStatus(applyStatus);
    void readUpdaterStatus({ payload: { source: 'updater-indicator:mount' } }).then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setModel(result.model);
      } else {
        setModel(deriveUpdaterModel(null, { hostAvailable: false }));
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const ready = model.environment === 'desktop' && model.shouldShowControl;
  const installBusy = installState === 'opening' || installState === 'handoff';
  const canStartInstall = ready || installState === 'recoverable';
  const showControl = ready || installState !== 'idle';
  const controlLabel = model.updateKind === 'payload' ? t('updater.installRestart') : t('updater.openInstaller');
  const channelLabel = channelLabelFor(model.status?.channel);
  const analytics = useAnalytics();
  const appVersionBefore = useAppVersion();
  const versionProps = useMemo(
    () => updateVersionProps(model, appVersionBefore),
    [appVersionBefore, model.availableVersion],
  );

  const indicatorSurfaceKey = `${model.currentVersion ?? 'unknown'}->${model.availableVersion ?? 'unknown'}:${model.status?.downloadPath ?? 'unknown'}`;
  const lastIndicatorSurfaceKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) {
      lastIndicatorSurfaceKeyRef.current = null;
      return;
    }
    if (lastIndicatorSurfaceKeyRef.current === indicatorSurfaceKey) return;
    lastIndicatorSurfaceKeyRef.current = indicatorSurfaceKey;
    trackUpdateIndicatorSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'update_indicator',
      ...versionProps,
    });
  }, [analytics.track, indicatorSurfaceKey, ready, versionProps]);

  const promptSurfaceKey = panelOpen ? indicatorSurfaceKey : null;
  const lastPromptSurfaceKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (promptSurfaceKey == null) {
      lastPromptSurfaceKeyRef.current = null;
      return;
    }
    if (lastPromptSurfaceKeyRef.current === promptSurfaceKey) return;
    lastPromptSurfaceKeyRef.current = promptSurfaceKey;
    trackUpdatePromptSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'update_prompt',
      ...versionProps,
    });
  }, [analytics.track, promptSurfaceKey, versionProps]);

  const close = useCallback(() => {
    if (installBusy) return;
    trackUpdateIndicatorClick(analytics.track, {
      page_name: 'home',
      area: 'update_prompt',
      element: 'later',
      action: 'dismiss',
      ...versionProps,
    });
    setPanelOpen(false);
  }, [analytics.track, installBusy, versionProps]);

  useEffect(() => {
    if (!panelOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrapRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [close, panelOpen]);

  const installAndQuit = async () => {
    if (actionInFlightRef.current || !canStartInstall) return;
    actionInFlightRef.current = true;
    clearHandoffWatchdog();
    setInstallState('opening');
    setPanelOpen(true);
    trackUpdateIndicatorClick(analytics.track, {
      page_name: 'home',
      area: 'update_prompt',
      element: 'install_update',
      action: 'install',
      ...versionProps,
    });
    try {
      const result = await openUpdaterInstaller({ payload: { source: 'updater-prompt' } });
      if (!result.ok) {
        actionInFlightRef.current = false;
        setInstallState('idle');
        trackUpdateInstallResult(analytics.track, {
          page_name: 'home',
          area: 'update_prompt',
          result: 'failed',
          error_code: result.reason,
          ...versionProps,
        });
        return;
      }
      if (result.model.errorMessage != null) {
        actionInFlightRef.current = false;
        setInstallState('idle');
        trackUpdateInstallResult(analytics.track, {
          page_name: 'home',
          area: 'update_prompt',
          result: 'failed',
          ...(updaterErrorCode(result.model) ? { error_code: updaterErrorCode(result.model) } : {}),
          ...versionProps,
        });
        return;
      }
      setModel(result.model);
      setInstallState('handoff');
      startHandoffWatchdog();
      trackUpdateInstallResult(analytics.track, {
        page_name: 'home',
        area: 'update_prompt',
        result: 'success',
        ...versionProps,
      });
      const quitResult = await quitAfterUpdaterInstallerOpen({ payload: { source: 'updater-prompt' } });
      if (!quitResult.ok) {
        clearHandoffWatchdog();
        actionInFlightRef.current = false;
        setInstallState('recoverable');
        setPanelOpen(true);
      }
    } catch (error) {
      clearHandoffWatchdog();
      actionInFlightRef.current = false;
      setInstallState('idle');
      trackUpdateInstallResult(analytics.track, {
        page_name: 'home',
        area: 'update_prompt',
        result: 'failed',
        error_code: error instanceof Error ? error.name : 'unknown',
        ...versionProps,
      });
    }
  };

  if (!showControl) return null;

  return (
    <div className="entry-updater-menu" ref={wrapRef}>
      <button
        aria-disabled={installBusy ? 'true' : undefined}
        aria-expanded={panelOpen}
        aria-label={controlLabel}
        className={`entry-nav-rail__btn entry-updater-menu__button is-ready${panelOpen ? ' is-active' : ''}${installBusy ? ' is-disabled' : ''}`}
        data-testid="entry-nav-updater"
        data-tooltip={controlLabel}
        title={controlLabel}
        type="button"
        onClick={() => {
          if (installBusy) return;
          if (panelOpen) {
            setPanelOpen(false);
            return;
          }
          trackUpdateIndicatorClick(analytics.track, {
            page_name: 'home',
            area: 'update_indicator',
            element: 'ready_indicator',
            action: 'open_prompt',
            ...versionProps,
          });
          setPanelOpen(true);
        }}
      >
        <span className="entry-updater-menu__glyph">
          <Icon name="arrow-up" size={18} strokeWidth={2.25} />
        </span>
      </button>
      <AnimatePresence>
        {panelOpen ? (
          <motion.section
            aria-labelledby="updater-popup-title"
            className="updater-popup is-ready"
            data-testid="updater-popup"
            role="dialog"
            variants={popoverIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="updater-popup__icon">
              <Icon name="arrow-up" size={20} strokeWidth={2.2} />
            </div>
            <div className="updater-popup__body">
              <h2 id="updater-popup-title">{t('updater.ready')}</h2>
              <p>{versionText(t, model)}</p>
              {channelLabel != null ? <span className="updater-popup__badge">{channelLabel}</span> : null}
            </div>
            <div className="updater-popup__actions">
              <button className="updater-popup__button" disabled={installBusy} type="button" onClick={close}>
                {t('updater.later')}
              </button>
              <button
                className="updater-popup__button updater-popup__button--primary"
                data-testid="updater-install-button"
                disabled={installBusy}
                type="button"
                onClick={() => {
                  void installAndQuit();
                }}
              >
                {installActionText(t, model, installBusy)}
              </button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
