import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { ProjectLocation } from '@open-design/contracts';
import type { AppConfig } from '../types';
import {
  browseProjectLocationFolders,
  fetchProjectLocations,
  openProjectLocationFolderDialog,
  scanProjectLocations,
  updateProjectLocations,
} from '../state/project-locations';
import type { ProjectLocationFolderBrowserResponse } from '../state/project-locations';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  onProjectsRefresh?: () => Promise<void> | void;
}

interface DraftLocation {
  id?: string;
  path: string;
}

function locationLabel(locationPath: string): string {
  return locationPath.split(/[\\/]/).filter(Boolean).pop() || locationPath;
}

function externalLocations(locations: ProjectLocation[]): DraftLocation[] {
  return locations
    .filter((location) => !location.builtIn)
    .map((location) => ({ id: location.id, path: location.path }));
}

function toConfigLocations(locations: ProjectLocation[]): NonNullable<AppConfig['projectLocations']> {
  return locations
    .filter((location) => !location.builtIn)
    .map((location) => ({ id: location.id, name: location.name, path: location.path }));
}

export function ProjectLocationsSection({ cfg, setCfg, onProjectsRefresh }: Props) {
  const { t } = useI18n();
  const [locations, setLocations] = useState<ProjectLocation[]>([]);
  const [drafts, setDrafts] = useState<DraftLocation[]>(cfg.projectLocations ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folderBrowserLoading, setFolderBrowserLoading] = useState(false);
  const [folderBrowserError, setFolderBrowserError] = useState<string | null>(null);
  const [folderBrowser, setFolderBrowser] = useState<ProjectLocationFolderBrowserResponse | null>(null);
  const draftsRef = useRef<DraftLocation[]>(drafts);
  const manualPathInputRef = useRef<HTMLInputElement | null>(null);
  const noFolderSelectedStatus = t('settings.projectLocationsNoFolderSelected');
  const hasConfiguredDraft = drafts.some((draft) => draft.path.trim().length > 0);
  const visibleStatus = status === noFolderSelectedStatus && hasConfiguredDraft ? null : status;

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProjectLocations()
      .then((next) => {
        if (cancelled) return;
        setLocations(next);
        setDrafts(externalLocations(next));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setCfg]);

  const builtIn = useMemo(
    () => locations.find((location) => location.builtIn),
    [locations],
  );
  const effectiveDefaultLocationId = useMemo(() => {
    const configured = cfg.defaultProjectLocationId ?? 'default';
    return locations.some((location) => location.id === configured) ? configured : 'default';
  }, [cfg.defaultProjectLocationId, locations]);

  function defaultControlLabel(locationId: string): string {
    return effectiveDefaultLocationId === locationId
      ? t('settings.projectLocationsDefaultBadge')
      : t('settings.projectLocationsMakeDefault');
  }

  function handleDefaultLocationChange(locationId: string) {
    setError(null);
    setStatus(t('settings.projectLocationsDefaultSaved'));
    setCfg((current) => ({ ...current, defaultProjectLocationId: locationId }));
  }

  async function save(nextDrafts: DraftLocation[]) {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await updateProjectLocations(
        nextDrafts.filter((location) => location.path.trim()),
      );
      if (!saved) {
        setError(t('settings.projectLocationsSaveError'));
        return null;
      }
      setLocations(saved);
      const external = externalLocations(saved);
      setDrafts(external);
      setCfg((current) => {
        const configuredDefault = current.defaultProjectLocationId ?? 'default';
        const nextDefault = saved.some((location) => location.id === configuredDefault)
          ? configuredDefault
          : 'default';
        return {
          ...current,
          projectLocations: toConfigLocations(saved),
          defaultProjectLocationId: nextDefault,
        };
      });
      setStatus(t('settings.projectLocationsSaved'));
      void onProjectsRefresh?.();
      return external;
    } finally {
      setSaving(false);
    }
  }

  async function runScan() {
    const result = await scanProjectLocations();
    if (!result) {
      setError(t('settings.projectLocationsScanError'));
      return null;
    }
    setStatus(t('settings.projectLocationsScanComplete', {
      imported: result.imported.length,
      existing: result.existing.length,
    }));
    void onProjectsRefresh?.();
    return result;
  }

  function hasConfiguredWorkBase() {
    return draftsRef.current.some((draft) => draft.path.trim().length > 0);
  }

  function setNoFolderSelectedStatus() {
    setStatus(hasConfiguredWorkBase() ? null : noFolderSelectedStatus);
  }

  async function addLocationPath(locationPath: string) {
    const selected = locationPath.trim();
    if (!selected) {
      setNoFolderSelectedStatus();
      return;
    }
    if (draftsRef.current.some((draft) => draft.path === selected)) {
      setStatus(t('settings.projectLocationsDuplicate'));
      return;
    }
    const previous = draftsRef.current;
    const next = [...previous, { path: selected }];
    setDrafts(next);
    const saved = await save(next);
    if (!saved) setDrafts(previous);
    else {
      setManualPath('');
      setFolderBrowserOpen(false);
      await runScan();
    }
  }

  async function loadFolderBrowser(folderPath?: string | null): Promise<boolean> {
    setFolderBrowserLoading(true);
    setFolderBrowserError(null);
    try {
      const next = await browseProjectLocationFolders(folderPath);
      if (!next) {
        setFolderBrowserError('Could not load folders. Enter a folder path manually.');
        return false;
      }
      setFolderBrowser(next);
      return true;
    } finally {
      setFolderBrowserLoading(false);
    }
  }

  async function openFolderBrowser(): Promise<boolean> {
    setFolderBrowserOpen(true);
    return loadFolderBrowser(manualPath);
  }

  async function handleFolderBrowserUse() {
    const selected = folderBrowser?.path;
    if (!selected) return;
    setFolderBrowserOpen(false);
    await addLocationPath(selected);
  }

  async function handleAddFolder() {
    setError(null);
    setStatus(null);
    const selected = await openProjectLocationFolderDialog();
    if (!selected) {
      const opened = await openFolderBrowser();
      if (!opened) {
        setStatus(
          hasConfiguredWorkBase()
            ? null
            : `${noFolderSelectedStatus} ${t('settings.projectLocationsManualPlaceholder')}`,
        );
        manualPathInputRef.current?.focus();
        manualPathInputRef.current?.select();
      }
      return;
    }
    await addLocationPath(selected ?? '');
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    await addLocationPath(manualPath);
  }

  async function removeDraft(index: number) {
    const previous = draftsRef.current;
    const next = previous.filter((_, i) => i !== index);
    setDrafts(next);
    const saved = await save(next);
    if (!saved) setDrafts(previous);
  }

  return (
    <section className="settings-section settings-section-card project-locations-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.projectLocations')}</h3>
          <p className="hint">{t('settings.projectLocationsDescription')}</p>
        </div>
      </div>

      {builtIn ? (
        <div className={`project-location-card is-built-in${effectiveDefaultLocationId === builtIn.id ? ' is-default' : ''}`}>
          <div>
            <strong>{t('newproj.locationDefault')}</strong>
            <code>{builtIn.path}</code>
          </div>
          <label className="project-location-default-control">
            <input
              type="radio"
              name="project-location-default"
              checked={effectiveDefaultLocationId === builtIn.id}
              onChange={() => handleDefaultLocationChange(builtIn.id)}
            />
            <span>{defaultControlLabel(builtIn.id)}</span>
          </label>
        </div>
      ) : null}

      <div className="project-location-list">
        {drafts.map((draft, index) => (
          <div
            className={`project-location-edit${draft.id && effectiveDefaultLocationId === draft.id ? ' is-default' : ''}`}
            key={`${draft.id ?? 'new'}-${index}`}
          >
            <div className="project-location-edit-main">
              <strong>{locationLabel(draft.path)}</strong>
              <code>{draft.path}</code>
              <small>{t('settings.projectLocationsWorkBaseMeta')}</small>
            </div>
            {draft.id ? (
              <label className="project-location-default-control">
                <input
                  type="radio"
                  name="project-location-default"
                  checked={effectiveDefaultLocationId === draft.id}
                  onChange={() => handleDefaultLocationChange(draft.id!)}
                />
                <span>{defaultControlLabel(draft.id)}</span>
              </label>
            ) : null}
            <button type="button" className="icon-btn danger" onClick={() => removeDraft(index)} disabled={saving}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>

      <form className="project-location-manual" onSubmit={handleManualSubmit}>
        <label className="project-location-manual-label" htmlFor="project-location-manual-path">
          {t('settings.designSystemsProjectPath')}
        </label>
        <div className="project-location-manual-row">
          <input
            ref={manualPathInputRef}
            id="project-location-manual-path"
            className="project-location-manual-input"
            type="text"
            value={manualPath}
            onChange={(event) => setManualPath(event.currentTarget.value)}
            placeholder={t('settings.projectLocationsManualPlaceholder')}
            disabled={loading || saving}
          />
          <button type="submit" className="icon-btn project-location-manual-submit" disabled={loading || saving || !manualPath.trim()}>
            {t('common.save')}
          </button>
        </div>
      </form>

      <button
        type="button"
        className="icon-btn project-location-add"
        onClick={handleAddFolder}
        disabled={loading || saving}
      >
        <Icon name="plus" size={12} />
        {t('settings.projectLocationsAddFolder')}
      </button>

      {folderBrowserOpen ? (
        <div className="project-location-browser" role="dialog" aria-label="Choose project location">
          <div className="project-location-browser-head">
            <div>
              <strong>Choose folder</strong>
              <code>{folderBrowser?.path ?? 'Loading folders...'}</code>
            </div>
            <button type="button" className="icon-btn" onClick={() => setFolderBrowserOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
          <div className="project-location-browser-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => loadFolderBrowser(folderBrowser?.parentPath)}
              disabled={folderBrowserLoading || !folderBrowser?.parentPath}
            >
              <Icon name="arrow-up" size={12} />
              Parent folder
            </button>
            <button
              type="button"
              className="icon-btn primary"
              onClick={handleFolderBrowserUse}
              disabled={folderBrowserLoading || !folderBrowser?.path}
            >
              <Icon name="check" size={12} />
              Use this folder
            </button>
          </div>
          {folderBrowserError ? <p className="settings-rescan-status error">{folderBrowserError}</p> : null}
          <div className="project-location-browser-list">
            {folderBrowser?.entries.map((entry) => (
              <button
                type="button"
                className="project-location-browser-entry"
                key={entry.path}
                aria-label={entry.name}
                onClick={() => loadFolderBrowser(entry.path)}
                disabled={folderBrowserLoading}
              >
                <Icon name="folder" size={14} />
                <span>{entry.name}</span>
                <code>{entry.path}</code>
              </button>
            ))}
            {!folderBrowserLoading && folderBrowser && folderBrowser.entries.length === 0 ? (
              <p className="project-location-browser-empty">No child folders here.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {visibleStatus ? <p className="settings-rescan-status">{visibleStatus}</p> : null}
      {error ? <p className="settings-rescan-status error">{error}</p> : null}
    </section>
  );
}
