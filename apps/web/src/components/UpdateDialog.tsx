import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';

import { Icon } from './Icon';
import { useAnalytics } from '../analytics/provider';
import {
  trackUpdateCheckResult,
  trackUpdateIndicatorClick,
  trackUpdateInstallResult,
  trackUpdatePromptSurfaceView,
} from '../analytics/events';
import { useI18n } from '../i18n';
import { openExternalUrl } from '../providers/registry';
import {
  checkForUpdaterUpdate,
  deriveUpdaterModel,
  downloadUpdaterUpdate,
  openUpdaterInstaller,
  quitAfterUpdaterInstallerOpen,
  readUpdaterStatus,
  restartSafetyFromActionResult,
  restartSafetyFromUpdaterStatus,
  subscribeToUpdaterOpenDialog,
  subscribeToUpdaterStatus,
  syncUpdaterMenuLabels,
  type UpdaterRestartSafety,
} from '../lib/updater';
import styles from './UpdateDialog.module.css';

const RELEASES_URL = 'https://github.com/nexu-io/open-design/releases';
const MENU_SOURCE = 'mac-app-menu';

function withEllipsis(value: string): string {
  return `${value.replace(/[.\u2026]+$/u, '')}…`;
}

function shouldRunManualCheck(status: OpenDesignHostUpdaterStatusSnapshot): boolean {
  return status.state === 'idle' || status.state === 'not-available' || status.state === 'error';
}

export function UpdateDialog() {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const analyticsTrackRef = useRef(analytics.track);
  analyticsTrackRef.current = analytics.track;
  const statusRef = useRef<OpenDesignHostUpdaterStatusSnapshot | null>(null);
  const statusRevisionRef = useRef(0);
  const laterRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<OpenDesignHostUpdaterStatusSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(MENU_SOURCE);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restartSafety, setRestartSafety] = useState<UpdaterRestartSafety | null>(null);
  const model = useMemo(() => deriveUpdaterModel(status, { hostAvailable: status != null }), [status]);
  const versionProps = useMemo(() => ({
    ...(model.currentVersion ? { app_version_before: model.currentVersion } : {}),
    ...(model.availableVersion ? { app_version_after: model.availableVersion } : {}),
  }), [model.availableVersion, model.currentVersion]);

  const applyStatus = useCallback((next: OpenDesignHostUpdaterStatusSnapshot) => {
    statusRevisionRef.current += 1;
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    void syncUpdaterMenuLabels({
      check: withEllipsis(t('settings.updateCheck')),
      checking: t('settings.updateStatusChecking'),
      downloading: t('settings.updateStatusDownloading'),
      install: withEllipsis(t('updater.openInstaller')),
      installing: t('settings.updateStatusInstalling'),
      restart: withEllipsis(t('updater.installRestart')),
    });
  }, [t]);

  useEffect(() => {
    let mounted = true;
    const unsubscribeStatus = subscribeToUpdaterStatus((next) => {
      if (mounted) applyStatus(next);
    });
    const unsubscribeOpen = subscribeToUpdaterOpenDialog((request) => {
      if (!mounted) return;
      const requestSource = request.source || MENU_SOURCE;
      setSource(requestSource);
      setRestartSafety(null);
      setActionError(null);
      setOpen(true);
      trackUpdateIndicatorClick(analyticsTrackRef.current, {
        action: 'open_prompt',
        area: 'mac_app_menu',
        element: 'check_for_updates',
        page_name: 'app',
      });
      void (async () => {
        let current = statusRef.current;
        if (current == null) {
          const result = await readUpdaterStatus({ payload: { source: requestSource } });
          if (!mounted || !result.ok) return;
          current = result.status;
          applyStatus(current);
        }
        if (!shouldRunManualCheck(current)) return;
        const result = await checkForUpdaterUpdate({
          payload: { autoDownload: true, source: requestSource },
        });
        if (!mounted) return;
        if (result.ok) {
          applyStatus(result.status);
          trackUpdateCheckResult(analyticsTrackRef.current, {
            area: 'update_dialog',
            page_name: 'app',
            result: result.status.state === 'not-available'
              ? 'up_to_date'
              : result.status.state === 'error'
                ? 'failed'
                : 'available',
            ...(result.status.currentVersion ? { app_version_before: result.status.currentVersion } : {}),
            ...(result.status.availableVersion ? { app_version_after: result.status.availableVersion } : {}),
            ...(result.status.error?.code ? { error_code: result.status.error.code } : {}),
          });
        } else {
          setActionError(result.reason);
          trackUpdateCheckResult(analyticsTrackRef.current, {
            area: 'update_dialog',
            error_code: result.reason,
            page_name: 'app',
            result: 'failed',
          });
        }
      })();
    });
    const mountStatusRevision = statusRevisionRef.current;
    void readUpdaterStatus({ payload: { source: 'update-dialog:mount' } }).then((result) => {
      if (mounted && result.ok && statusRevisionRef.current === mountStatusRevision) applyStatus(result.status);
    });
    return () => {
      mounted = false;
      unsubscribeStatus();
      unsubscribeOpen();
    };
  }, [applyStatus]);

  const readySurfaceKey = open && model.shouldShowControl ? model.promptKey : null;
  const lastReadySurfaceKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (readySurfaceKey == null || lastReadySurfaceKeyRef.current === readySurfaceKey) return;
    lastReadySurfaceKeyRef.current = readySurfaceKey;
    trackUpdatePromptSurfaceView(analytics.track, {
      area: 'update_dialog',
      page_name: 'app',
      ...versionProps,
    });
  }, [analytics.track, readySurfaceKey, versionProps]);

  useEffect(() => {
    if (restartSafety == null) return;
    laterRef.current?.focus();
  }, [restartSafety]);

  useEffect(() => {
    if (!open || restartSafety != null) return;
    (primaryRef.current ?? closeRef.current)?.focus();
  }, [open, restartSafety, status?.state]);

  const close = useCallback(() => {
    if (actionBusy) return;
    trackUpdateIndicatorClick(analytics.track, {
      action: 'dismiss',
      area: 'update_dialog',
      element: 'later',
      page_name: 'app',
      ...versionProps,
    });
    setOpen(false);
    setRestartSafety(null);
    setActionError(null);
  }, [actionBusy, analytics.track, versionProps]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  const checkAgain = useCallback(async () => {
    setActionBusy(true);
    setActionError(null);
    setRestartSafety(null);
    try {
      const result = await checkForUpdaterUpdate({ payload: { autoDownload: true, source } });
      if (result.ok) {
        applyStatus(result.status);
        trackUpdateCheckResult(analytics.track, {
          area: 'update_dialog',
          page_name: 'app',
          result: result.status.state === 'not-available' ? 'up_to_date' : result.status.state === 'error' ? 'failed' : 'available',
          ...(result.status.currentVersion ? { app_version_before: result.status.currentVersion } : {}),
          ...(result.status.availableVersion ? { app_version_after: result.status.availableVersion } : {}),
          ...(result.status.error?.code ? { error_code: result.status.error.code } : {}),
        });
      } else {
        setActionError(result.reason);
        trackUpdateCheckResult(analytics.track, {
          area: 'update_dialog',
          error_code: result.reason,
          page_name: 'app',
          result: 'failed',
        });
      }
    } finally {
      setActionBusy(false);
    }
  }, [analytics.track, applyStatus, source]);

  const download = useCallback(async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await downloadUpdaterUpdate({ payload: { source } });
      if (result.ok) applyStatus(result.status);
      else setActionError(result.reason);
    } finally {
      setActionBusy(false);
    }
  }, [applyStatus, source]);

  const installAndQuit = useCallback(async (force: boolean) => {
    setActionBusy(true);
    setActionError(null);
    setRestartSafety(null);
    trackUpdateIndicatorClick(analytics.track, {
      action: force ? 'force_restart' : 'install',
      area: 'update_dialog',
      element: force ? 'restart_anyway' : 'install_update',
      page_name: 'app',
      ...versionProps,
    });
    try {
      const options = { payload: { force, source } };
      const installResult = await openUpdaterInstaller(options);
      if (!installResult.ok) {
        setActionError(installResult.reason);
        trackUpdateInstallResult(analytics.track, {
          area: 'update_dialog',
          error_code: installResult.reason,
          page_name: 'app',
          result: 'failed',
          ...versionProps,
        });
        return;
      }
      const safety = restartSafetyFromUpdaterStatus(installResult.status);
      if (safety != null) {
        setRestartSafety(safety);
        trackUpdateInstallResult(analytics.track, {
          area: 'update_dialog',
          error_code: safety.state === 'blocked' ? 'active-runs-blocked' : 'active-runs-unknown',
          page_name: 'app',
          result: 'failed',
          ...versionProps,
        });
        return;
      }
      applyStatus(installResult.status);
      const quitResult = await quitAfterUpdaterInstallerOpen(options);
      const quitSafety = restartSafetyFromActionResult(quitResult);
      if (quitSafety != null) {
        setRestartSafety(quitSafety);
        trackUpdateInstallResult(analytics.track, {
          area: 'update_dialog',
          error_code: quitSafety.state === 'blocked' ? 'active-runs-blocked' : 'active-runs-unknown',
          page_name: 'app',
          result: 'failed',
          ...versionProps,
        });
      } else if (!quitResult.ok) {
        setActionError(quitResult.reason);
        trackUpdateInstallResult(analytics.track, {
          area: 'update_dialog',
          error_code: quitResult.reason,
          page_name: 'app',
          result: 'failed',
          ...versionProps,
        });
      } else {
        trackUpdateInstallResult(analytics.track, {
          area: 'update_dialog',
          page_name: 'app',
          result: 'success',
          ...versionProps,
        });
      }
    } finally {
      setActionBusy(false);
    }
  }, [analytics.track, applyStatus, source, versionProps]);

  const openReleaseNotes = useCallback(() => {
    trackUpdateIndicatorClick(analytics.track, {
      action: 'open_link',
      area: 'update_dialog',
      element: 'view_release_notes',
      page_name: 'app',
      ...versionProps,
    });
    void openExternalUrl(RELEASES_URL);
  }, [analytics.track, versionProps]);

  if (!open) return null;

  const state = status?.state;
  const ready = state === 'downloaded' && model.hasDownloadedInstaller;
  const available = state === 'available';
  const checking = state === 'checking';
  const downloading = state === 'downloading';
  const installing = state === 'installing' || model.installerOpened;
  const unsupported = state === 'unsupported';
  const progress = model.downloadProgress?.percent;
  const statusMessage = (() => {
    if (restartSafety?.state === 'blocked') {
      return t('updater.activeRunsBody', { count: restartSafety.activeRunCount });
    }
    if (restartSafety?.state === 'unknown') return t('updater.activeRunsUnknownBody');
    if (actionError != null) {
      return ready || available || installing
        ? t('settings.updateActionFailed')
        : t('updater.dialogCheckFailed');
    }
    if (status?.error != null && restartSafetyFromUpdaterStatus(status) == null) {
      return state === 'error' ? t('updater.dialogCheckFailed') : t('settings.updateActionFailed');
    }
    // A forced installer reinstall reads differently from a routine update:
    // the same copy covers both the not-yet-downloaded and ready states.
    if ((ready || available) && model.reinstall != null) {
      return model.availableVersion == null
        ? t('updater.reinstallReadyGeneric')
        : t('updater.reinstallReadyVersion', { version: model.availableVersion });
    }
    if (ready) {
      if (model.availableVersion != null) {
        return t('updater.dialogReadyVersion', { version: model.availableVersion });
      }
      return t('updater.dialogReadyGeneric');
    }
    if (checking) return t('settings.updateStatusChecking');
    if (downloading) {
      return progress == null
        ? t('settings.updateStatusDownloading')
        : t('settings.updateStatusDownloadingPercent', { percent: progress });
    }
    if (available) {
      return model.availableVersion == null
        ? t('updater.dialogAvailableGeneric')
        : t('updater.dialogAvailableVersion', { version: model.availableVersion });
    }
    if (installing) return t('settings.updateStatusInstalling');
    if (model.upToDate) {
      if (status?.currentVersion == null) return t('updater.upToDate');
      const version = `v${status.currentVersion}`;
      return locale === 'zh-CN' || locale === 'zh-TW'
        ? `${t('updater.upToDate')}（${version}）`
        : `${t('updater.upToDate')} (${version})`;
    }
    if (unsupported) return t('updater.dialogUnsupported');
    return t('settings.updateStatusNotChecked');
  })();

  const showSafety = restartSafety != null;
  const reinstallUrl = model.reinstall?.url ?? null;
  const title = showSafety ? t('updater.activeRunsTitle') : t('settings.updateCheck');
  const primaryLabel = (() => {
    if (ready) return model.updateKind === 'payload' ? t('updater.installRestart') : t('updater.openInstaller');
    if (available) return t('updater.download');
    if (unsupported) return t('updater.manualDownload');
    if (state === 'error') return t('settings.updateRecheck');
    return t('settings.updateCheck');
  })();
  const primaryDisabled = actionBusy || checking || downloading || installing;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section
        aria-describedby="update-dialog-status"
        aria-labelledby="update-dialog-title"
        aria-modal="true"
        className={styles.dialog}
        data-testid="update-dialog"
        role="dialog"
      >
        <button
          aria-label={t('common.close')}
          className={styles.close}
          disabled={actionBusy}
          onClick={close}
          ref={closeRef}
          type="button"
        >
          <Icon name="close" size={15} />
        </button>
        <div className={`${styles.icon} ${showSafety ? styles.iconWarning : styles.iconBrand}`} aria-hidden>
          {showSafety ? (
            <Icon name="alert-triangle" size={22} />
          ) : (
            <span className={`${styles.brandGlyph} od-brand-glyph`} />
          )}
        </div>
        <h2 className={styles.title} id="update-dialog-title">{title}</h2>
        <p className={styles.status} id="update-dialog-status" aria-live="polite">{statusMessage}</p>
        {!showSafety && downloading && progress != null ? (
          <div className={styles.progress} aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        {!showSafety && (available || ready) ? (
          <div className={styles.metaRow}>
            {reinstallUrl != null ? (
              <button
                className={styles.releaseLink}
                data-testid="update-dialog-reinstall-learn-more"
                onClick={() => void openExternalUrl(reinstallUrl)}
                type="button"
              >
                {t('updater.reinstallLearnMore')} <Icon name="external-link" size={13} />
              </button>
            ) : (
              <button
                className={styles.releaseLink}
                onClick={openReleaseNotes}
                type="button"
              >
                {t('updater.viewVersionFeatures')} <Icon name="external-link" size={13} />
              </button>
            )}
          </div>
        ) : null}
        <div className={`${styles.actions} ${model.upToDate ? styles.actionsCentered : ''}`}>
          {!model.upToDate ? (
            <button className={styles.secondaryButton} onClick={close} ref={laterRef} type="button">
              {t('updater.later')}
            </button>
          ) : null}
          {model.upToDate ? (
            <button
              className={styles.primaryButton}
              onClick={openReleaseNotes}
              ref={primaryRef}
              type="button"
            >
              {t('updater.viewVersionFeatures')} <Icon name="external-link" size={13} />
            </button>
          ) : showSafety ? (
            <button
              className={styles.dangerButton}
              disabled={actionBusy}
              onClick={() => void installAndQuit(true)}
              type="button"
            >
              {t('updater.restartAnyway')}
            </button>
          ) : (!checking && !downloading && !installing) ? (
            <button
              className={styles.primaryButton}
              disabled={primaryDisabled}
              onClick={() => {
                if (ready) void installAndQuit(false);
                else if (available) void download();
                else if (unsupported) openReleaseNotes();
                else void checkAgain();
              }}
              ref={primaryRef}
              type="button"
            >
              {primaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
