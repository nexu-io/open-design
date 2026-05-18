import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProjectLocation } from '@open-design/contracts';
import type { AppConfig } from '../types';
import {
  fetchProjectLocations,
  openProjectLocationFolderDialog,
  scanProjectLocations,
  updateProjectLocations,
} from '../state/project-locations';
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
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftsRef = useRef<DraftLocation[]>(drafts);

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
      setCfg((current) => ({ ...current, projectLocations: toConfigLocations(saved) }));
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

  async function handleAddFolder() {
    setError(null);
    setStatus(null);
    const selected = await openProjectLocationFolderDialog();
    if (!selected) {
      setStatus(t('settings.projectLocationsNoFolderSelected'));
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
    else await runScan();
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
        <div className="project-location-card is-built-in">
          <div>
            <strong>{builtIn.name}</strong>
            <code>{builtIn.path}</code>
          </div>
          <span>Default</span>
        </div>
      ) : null}

      <div className="project-location-list">
        {drafts.map((draft, index) => (
          <div className="project-location-edit" key={`${draft.id ?? 'new'}-${index}`}>
            <div className="project-location-edit-main">
              <strong>{locationLabel(draft.path)}</strong>
              <code>{draft.path}</code>
              <small>{t('settings.projectLocationsWorkBaseMeta')}</small>
            </div>
            <button type="button" className="icon-btn danger" onClick={() => removeDraft(index)} disabled={saving}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="icon-btn project-location-add"
        onClick={handleAddFolder}
        disabled={loading || saving}
      >
        <Icon name="plus" size={12} />
        {t('settings.projectLocationsAddFolder')}
      </button>

      {status ? <p className="settings-rescan-status">{status}</p> : null}
      {error ? <p className="settings-rescan-status error">{error}</p> : null}
    </section>
  );
}
