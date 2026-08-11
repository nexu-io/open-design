import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';

import { Icon } from './Icon';
import { popoverIn } from '../motion';
import { openExternalUrl } from '../providers/registry';
import {
  deriveUpdaterModel,
  openUpdaterInstaller,
  quitAfterUpdaterInstallerOpen,
  readUpdaterStatus,
  restartSafetyFromActionResult,
  restartSafetyFromUpdaterStatus,
  subscribeToUpdaterStatus,
  type UpdaterModel,
  type UpdaterRestartSafety,
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
import styles from './UpdaterPopup.module.css';

const INSTALL_HANDOFF_WATCHDOG_MS = 10_000;

/** Rocket badge from the update visual language, on the ready indicator. */
function RocketBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-testid="updater-rocket-glyph"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M4.99958 12.9999C4.99958 7.91198 7.90222 3.5636 11.9996 1.81799C16.0969 3.5636 18.9996 7.91198 18.9996 12.9999C18.9996 13.8229 18.9236 14.6264 18.779 15.4027L20.7194 17.2353C20.8845 17.3913 20.9238 17.6389 20.815 17.8383L18.3196 22.4133C18.1873 22.6557 17.8836 22.7451 17.6412 22.6128C17.5993 22.59 17.5608 22.5612 17.5271 22.5274L15.2925 20.2928C15.1049 20.1053 14.8506 19.9999 14.5854 19.9999H9.41379C9.14857 19.9999 8.89422 20.1053 8.70668 20.2928L6.47209 22.5274C6.27683 22.7227 5.96025 22.7227 5.76498 22.5274C5.73122 22.4937 5.70246 22.4552 5.67959 22.4133L3.18412 17.8383C3.07537 17.6389 3.11464 17.3913 3.27975 17.2353L5.22014 15.4027C5.07551 14.6264 4.99958 13.8229 4.99958 12.9999ZM6.47542 19.6957L7.29247 18.8786C7.85508 18.316 8.61814 17.9999 9.41379 17.9999H14.5854C15.381 17.9999 16.1441 18.316 16.7067 18.8786L17.5237 19.6957L18.5056 17.8955L17.4058 16.8568C16.9117 16.3901 16.6884 15.7045 16.8128 15.0364C16.9366 14.3722 16.9996 13.6911 16.9996 12.9999C16.9996 9.13037 15.0045 5.69965 11.9996 4.04033C8.99462 5.69965 6.99958 9.13037 6.99958 12.9999C6.99958 13.6911 7.06255 14.3722 7.18631 15.0364C7.31078 15.7045 7.08746 16.3901 6.59338 16.8568L5.49353 17.8955L6.47542 19.6957ZM11.9996 12.9999C10.895 12.9999 9.99958 12.1045 9.99958 10.9999C9.99958 9.89537 10.895 8.99994 11.9996 8.99994C13.1041 8.99994 13.9996 9.89537 13.9996 10.9999C13.9996 12.1045 13.1041 12.9999 11.9996 12.9999Z" />
    </svg>
  );
}

type InstallState = 'idle' | 'opening' | 'handoff' | 'quitting' | 'recoverable';
type Translator = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type UpdaterPopupProps = {
  allowSilentUpdates?: boolean;
  /**
   * True after daemon app-config has been fetched and merged. The silent-update
   * preference is daemon-owned and stripped from localStorage, so `undefined`
   * only means "no preference" once this flag is true — before that it may
   * still be hydrating a saved false.
   */
  silentUpdatePreferenceReady?: boolean;
  onAllowSilentUpdatesChange?: (allowSilentUpdates: boolean) => Promise<void> | void;
};

function versionText(t: Translator, model: UpdaterModel): string {
  const version = model.availableVersion;
  if (model.reinstall != null) {
    return version == null ? t('updater.reinstallReadyGeneric') : t('updater.reinstallReadyVersion', { version });
  }
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
    case 'prerelease':
      return 'Prerelease channel';
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

/**
 * User-facing copy for a restart-safety preflight denial. The popup keeps
 * these denials hard-blocked (no force path — that lives in the app-menu
 * UpdateDialog), but the copy must say why instead of a generic failure.
 */
function restartSafetyText(t: Translator, safety: UpdaterRestartSafety): string {
  return safety.state === 'blocked'
    ? t('updater.activeRunsBody', { count: safety.activeRunCount })
    : t('updater.activeRunsUnknownBody');
}

export function UpdaterPopup({
  allowSilentUpdates,
  silentUpdatePreferenceReady = false,
  onAllowSilentUpdatesChange,
}: UpdaterPopupProps) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const actionInFlightRef = useRef(false);
  const handoffWatchdogRef = useRef<number | null>(null);
  const [model, setModel] = useState<UpdaterModel>(() => deriveUpdaterModel(null));
  const [panelOpen, setPanelOpen] = useState(false);
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [installError, setInstallError] = useState<string | null>(null);
  const [allowSilentUpdatesChecked, setAllowSilentUpdatesChecked] = useState(() => allowSilentUpdates ?? true);
  const [silentUpdatesPersistError, setSilentUpdatesPersistError] = useState<string | null>(null);
  const [silentUpdatesPersisting, setSilentUpdatesPersisting] = useState(false);
  // Seed bookkeeping must outlive effect dependency churn: a successful
  // parent setConfig(true) re-runs the seed effect mid-flight; we must not
  // cancel the in-flight finally (that stranded the checkbox disabled).
  const seedInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    if (installState !== 'idle') return;
    // Until a successful daemon GET has landed, undefined may still mean
    // "loading a saved false" — keep the optimistic default only for display.
    if (!silentUpdatePreferenceReady && allowSilentUpdates === undefined) return;
    setAllowSilentUpdatesChecked(allowSilentUpdates ?? true);
    setSilentUpdatesPersistError(null);
  }, [allowSilentUpdates, installState, silentUpdatePreferenceReady]);

  // Prompt show-up seed: only after a *successful* daemon config fetch.
  // If the preference is still undefined then, write the default (true) once.
  // Bookkeeping uses a ref so a successful parent re-render mid-flight does
  // not cancel clearing `silentUpdatesPersisting`.
  useEffect(() => {
    if (!panelOpen) return;
    if (!silentUpdatePreferenceReady) return;
    if (allowSilentUpdates !== undefined) return;
    if (onAllowSilentUpdatesChange == null) return;
    if (seedInFlightRef.current) return;

    seedInFlightRef.current = true;
    setAllowSilentUpdatesChecked(true);
    setSilentUpdatesPersistError(null);
    setSilentUpdatesPersisting(true);
    void Promise.resolve(onAllowSilentUpdatesChange(true))
      .catch(() => {
        if (!mountedRef.current) return;
        setSilentUpdatesPersistError(t('settings.autosaveError'));
      })
      .finally(() => {
        seedInFlightRef.current = false;
        if (!mountedRef.current) return;
        setSilentUpdatesPersisting(false);
      });
  }, [
    allowSilentUpdates,
    onAllowSilentUpdatesChange,
    panelOpen,
    silentUpdatePreferenceReady,
    t,
  ]);

  const handleSilentUpdatesChange = useCallback(
    async (next: boolean) => {
      const previous = allowSilentUpdatesChecked;
      setAllowSilentUpdatesChecked(next);
      setSilentUpdatesPersistError(null);
      if (onAllowSilentUpdatesChange == null) return;
      setSilentUpdatesPersisting(true);
      try {
        // Parent must be non-optimistic for this daemon-owned key: only
        // commit app-wide config after the daemon write succeeds.
        await onAllowSilentUpdatesChange(next);
      } catch {
        if (!mountedRef.current) return;
        setAllowSilentUpdatesChecked(previous);
        setSilentUpdatesPersistError(t('settings.autosaveError'));
      } finally {
        if (mountedRef.current) setSilentUpdatesPersisting(false);
      }
    },
    [allowSilentUpdatesChecked, onAllowSilentUpdatesChange, t],
  );

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
  const installBusy = installState === 'opening' || installState === 'handoff' || installState === 'quitting';
  const quitRecoverable = installState === 'recoverable' || installState === 'quitting';
  const canStartInstall = ready || installState === 'recoverable';
  const showControl = ready || installState !== 'idle';
  const installFailureText = model.canOpenInstaller ? t('updater.openFailedFallback') : t('updater.failed');
  const controlLabel = quitRecoverable
    ? t('updater.quitButton')
    : model.updateKind === 'payload'
      ? t('updater.installRestart')
      : t('updater.openInstaller');
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
    setInstallError(null);
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
      if (onAllowSilentUpdatesChange != null) {
        try {
          await onAllowSilentUpdatesChange(allowSilentUpdatesChecked);
        } catch {
          // Installing the update is more important than persisting this preference.
        }
      }
      const result = await openUpdaterInstaller({ payload: { source: 'updater-prompt' } });
      if (!result.ok) {
        actionInFlightRef.current = false;
        setInstallError(installFailureText);
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
        const safety = restartSafetyFromUpdaterStatus(result.status);
        actionInFlightRef.current = false;
        setInstallError(safety == null ? installFailureText : restartSafetyText(t, safety));
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
      setInstallError(null);
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
        const quitSafety = restartSafetyFromActionResult(quitResult);
        if (quitSafety != null) setInstallError(restartSafetyText(t, quitSafety));
        clearHandoffWatchdog();
        actionInFlightRef.current = false;
        setInstallState('recoverable');
        setPanelOpen(true);
      }
    } catch (error) {
      clearHandoffWatchdog();
      actionInFlightRef.current = false;
      setInstallError(installFailureText);
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

  const retryQuit = async () => {
    if (actionInFlightRef.current || installState !== 'recoverable') return;
    actionInFlightRef.current = true;
    clearHandoffWatchdog();
    setInstallState('quitting');
    startHandoffWatchdog();
    try {
      const quitResult = await quitAfterUpdaterInstallerOpen({ payload: { source: 'updater-prompt' } });
      if (quitResult.ok) return;
    } catch {
      // Keep the explicit quit recovery action available.
    }
    clearHandoffWatchdog();
    actionInFlightRef.current = false;
    setInstallState('recoverable');
    setPanelOpen(true);
  };

  if (!showControl) return null;

  return (
    <div className="entry-updater-menu" ref={wrapRef}>
      <button
        aria-disabled={installBusy ? 'true' : undefined}
        aria-expanded={panelOpen}
        aria-label={controlLabel}
        className={`${styles.rocketButton}${installBusy ? ` ${styles.disabled}` : ''}`}
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
        <RocketBadgeIcon className={styles.rocketIcon} />
      </button>
      <AnimatePresence>
        {panelOpen ? (
          <UpdaterPopupPanel
            allowSilentUpdatesChecked={allowSilentUpdatesChecked}
            channelLabel={channelLabel}
            installError={installError}
            installBusy={installBusy}
            model={model}
            quitRecoverable={quitRecoverable}
            silentUpdatesPersistError={silentUpdatesPersistError}
            silentUpdatesPersisting={silentUpdatesPersisting}
            t={t}
            onClose={close}
            onInstall={() => {
              if (installState === 'recoverable') {
                void retryQuit();
              } else {
                void installAndQuit();
              }
            }}
            onSilentUpdatesChange={(next) => {
              void handleSilentUpdatesChange(next);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ReinstallLearnMoreLink({ t, url }: { t: Translator; url: string }) {
  return (
    <button
      className="updater-popup__link"
      data-testid="updater-reinstall-learn-more"
      type="button"
      onClick={() => void openExternalUrl(url)}
    >
      {t('updater.reinstallLearnMore')} <Icon name="external-link" size={12} />
    </button>
  );
}

function UpdaterPopupPanel({
  allowSilentUpdatesChecked,
  channelLabel,
  installError,
  installBusy,
  model,
  quitRecoverable,
  silentUpdatesPersistError,
  silentUpdatesPersisting,
  t,
  onClose,
  onInstall,
  onSilentUpdatesChange,
}: {
  allowSilentUpdatesChecked: boolean;
  channelLabel: string | null;
  installError: string | null;
  installBusy: boolean;
  model: UpdaterModel;
  quitRecoverable: boolean;
  silentUpdatesPersistError: string | null;
  silentUpdatesPersisting: boolean;
  t: Translator;
  onClose: () => void;
  onInstall: () => void;
  onSilentUpdatesChange: (allowSilentUpdates: boolean) => void;
}) {
  return (
    <motion.section
      aria-labelledby="updater-popup-title"
      className="updater-popup is-ready"
      data-testid="updater-popup"
      role="dialog"
      variants={popoverIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      onMouseDown={(event) => event.stopPropagation()}
    >
      {/* No cover art: this panel has no cover source. Covers on the update
          surfaces come from the what's-new document's `imageUrl` (see
          WhatsNewPopup), never from a bundled asset or a hardcoded URL. */}
      <div className="updater-popup__body">
        <h2 id="updater-popup-title">{quitRecoverable ? t('updater.quitFailedTitle') : t('updater.ready')}</h2>
        {quitRecoverable && model.updateKind === 'payload'
          ? null
          : <p>{quitRecoverable ? t('updater.quitFailedBody') : versionText(t, model)}</p>}
        {!quitRecoverable && model.reinstall?.url != null ? (
          <ReinstallLearnMoreLink t={t} url={model.reinstall.url} />
        ) : null}
        {channelLabel != null ? <span className="updater-popup__badge">{channelLabel}</span> : null}
        {installError != null ? (
          <p className="updater-popup__error" data-testid="updater-install-error" role="alert">
            {installError}
          </p>
        ) : null}
      </div>
      <div className="updater-popup__footer">
        {!quitRecoverable ? <div className="updater-popup__preference">
          <label className="updater-popup__checkbox">
            <input
              checked={allowSilentUpdatesChecked}
              data-testid="updater-silent-update-checkbox"
              disabled={installBusy || silentUpdatesPersisting}
              type="checkbox"
              onChange={(event) => onSilentUpdatesChange(event.currentTarget.checked)}
            />
            <span>{t('updater.allowSilentUpdates')}</span>
          </label>
          {silentUpdatesPersistError != null ? (
            <p className="updater-popup__error" data-testid="updater-silent-update-error" role="alert">
              {silentUpdatesPersistError}
            </p>
          ) : null}
        </div> : null}
        <div className="updater-popup__actions">
          <button className="updater-popup__button" disabled={installBusy} type="button" onClick={onClose}>
            {t('updater.later')}
          </button>
          <button
            className="updater-popup__button updater-popup__button--primary"
            data-testid="updater-install-button"
            disabled={installBusy}
            type="button"
            onClick={onInstall}
          >
            {quitRecoverable ? t('updater.quitButton') : installActionText(t, model, installBusy)}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
