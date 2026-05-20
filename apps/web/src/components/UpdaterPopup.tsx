import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { Icon } from './Icon';
import {
  deriveUpdaterModel,
  openUpdaterInstaller,
  quitAfterUpdaterInstallerOpen,
  readUpdaterStatus,
  subscribeToUpdaterStatus,
  type UpdaterModel,
} from '../lib/updater';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';

type InstallState = 'idle' | 'opening' | 'opened';
type QuitState = 'idle' | 'quitting';

function versionText(model: UpdaterModel): string {
  const version = model.availableVersion;
  return version == null ? 'A new version is ready.' : `Open Design ${version} is ready.`;
}

function navLabel(model: UpdaterModel): string {
  if (model.errorMessage != null) return 'Update failed';
  if (model.installerOpened) return 'Installer opened';
  if (model.downloadProgress != null || model.busy) {
    const percent = model.downloadProgress?.percent;
    return percent == null ? 'Downloading update' : `Downloading update ${percent}%`;
  }
  if (model.hasDownloadedInstaller) return 'Update ready';
  return 'Update available';
}

export function UpdaterPopup() {
  const [model, setModel] = useState<UpdaterModel>(() => deriveUpdaterModel(null));
  const [dismissedPromptKey, setDismissedPromptKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [quitState, setQuitState] = useState<QuitState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const applyStatus = (status: OpenDesignHostUpdaterStatusSnapshot) => {
      if (!mounted) return;
      setModel(deriveUpdaterModel(status, { hostAvailable: true }));
    };
    const unsubscribe = subscribeToUpdaterStatus(applyStatus);
    void readUpdaterStatus({ payload: { source: 'updater-popup:mount' } }).then((result) => {
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

  const isPanelOpen = useMemo(() => {
    if (actionError != null) return true;
    if (panelOpen) return true;
    if (!model.shouldPrompt || model.promptKey == null) return false;
    return model.promptKey !== dismissedPromptKey;
  }, [actionError, dismissedPromptKey, model.promptKey, model.shouldPrompt, panelOpen]);

  if (model.environment !== 'desktop' || !model.shouldShowControl) return null;

  const close = () => {
    if (model.promptKey != null) setDismissedPromptKey(model.promptKey);
    setPanelOpen(false);
    setInstallState('idle');
    setQuitState('idle');
    setActionError(null);
  };

  const openInstaller = async () => {
    setInstallState('opening');
    setActionError(null);
    const result = await openUpdaterInstaller({ payload: { source: 'updater-popup' } });
    if (!result.ok) {
      setActionError(result.reason);
      setInstallState('idle');
      return;
    }
    setModel(result.model);
    if (result.model.errorMessage != null) {
      setActionError(result.model.errorMessage);
      setInstallState('idle');
      return;
    }
    setInstallState('opened');
    setPanelOpen(true);
  };

  const quitOpenDesign = async () => {
    setQuitState('quitting');
    setActionError(null);
    const result = await quitAfterUpdaterInstallerOpen({ payload: { source: 'updater-popup' } });
    if (!result.ok) {
      setActionError(result.reason);
      setQuitState('idle');
    }
  };

  const opened = installState === 'opened' || model.installerOpened;
  const statusError = model.errorMessage;
  const failed = actionError != null || statusError != null;
  const title = failed ? (opened ? 'Could not quit' : 'Update failed') : opened ? 'Installer opened' : 'Update ready';
  const body = failed
    ? opened
      ? 'Open Design could not quit.'
      : statusError ?? 'The installer could not be opened.'
    : opened
    ? 'The installer is open. Quit Open Design before replacing the app.'
    : versionText(model);
  const progress = model.downloadProgress;
  const progressStyle = {
    '--updater-progress': `${progress?.percent ?? 100}%`,
  } as CSSProperties;
  const controlDisabled = model.busy && !model.hasDownloadedInstaller && !model.installerOpened;
  const controlLabel = navLabel(model);
  const canOpenInstaller = model.canOpenInstaller && model.hasDownloadedInstaller;

  return (
    <div className="entry-updater-menu">
      <button
        aria-disabled={controlDisabled ? 'true' : undefined}
        aria-expanded={isPanelOpen}
        aria-label={controlLabel}
        className={`entry-nav-rail__btn entry-updater-menu__button${isPanelOpen ? ' is-active' : ''}${controlDisabled ? ' is-disabled' : ''}`}
        data-testid="entry-nav-updater"
        data-tooltip={controlLabel}
        type="button"
        onClick={() => {
          if (controlDisabled) return;
          setPanelOpen((open) => !open);
        }}
      >
        <Icon name={opened ? 'check' : 'download'} size={18} />
        {progress != null ? (
          <span
            aria-label={controlLabel}
            aria-valuemax={100}
            aria-valuemin={0}
            {...(progress.percent == null ? {} : { 'aria-valuenow': progress.percent })}
            className="entry-updater-menu__progress"
            data-testid="entry-nav-updater-progress"
            role="progressbar"
            style={progressStyle}
          />
        ) : null}
      </button>
      {isPanelOpen ? (
        <section
          aria-labelledby="updater-popup-title"
          className="updater-popup"
          data-testid="updater-popup"
          role="dialog"
        >
          <div className="updater-popup__icon">
            <Icon name={opened ? 'check' : 'download'} size={20} />
          </div>
          <div className="updater-popup__body">
            <h2 id="updater-popup-title">{title}</h2>
            <p>{body}</p>
            {actionError != null && actionError !== body ? <p className="updater-popup__error">{actionError}</p> : null}
          </div>
          <div className="updater-popup__actions">
            {opened ? (
              <>
                <button className="updater-popup__button" type="button" onClick={close}>
                  Done
                </button>
                <button
                  className="updater-popup__button updater-popup__button--primary"
                  data-testid="updater-quit-button"
                  disabled={!model.canQuitAfterInstallerOpen || quitState === 'quitting'}
                  type="button"
                  onClick={() => {
                    void quitOpenDesign();
                  }}
                >
                  {quitState === 'quitting' ? 'Quitting...' : 'Quit Open Design'}
                </button>
              </>
            ) : failed ? (
              <button className="updater-popup__button" type="button" onClick={close}>
                Done
              </button>
            ) : (
              <>
                <button className="updater-popup__button" type="button" onClick={close}>
                  Later
                </button>
                <button
                  className="updater-popup__button updater-popup__button--primary"
                  data-testid="updater-install-button"
                  disabled={installState === 'opening' || !canOpenInstaller}
                  type="button"
                  onClick={() => {
                    void openInstaller();
                  }}
                >
                  {installState === 'opening' ? 'Opening...' : 'Open installer'}
                </button>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
