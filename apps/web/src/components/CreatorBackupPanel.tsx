import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Button } from '@open-design/components';
import { restoreCreatorBackup } from '@open-design/host';
import type { CreatorBackupSummary } from '@open-design/contracts';

type ProjectOption = { id: string; name: string };

type CreatorBackupPanelProps = {
  projects: ProjectOption[];
};

function formatBackupTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Creator backup management panel.
 *
 * Lists, creates, and validates project-scoped backups through the daemon
 * local HTTP API, and restores them through the controlled host bridge
 * (`creator.restoreBackup`). Restore is intentionally NOT a daemon HTTP route:
 * the renderer may only ask the desktop main process to restore by backup id.
 */
export function CreatorBackupPanel({ projects }: CreatorBackupPanelProps): ReactElement {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '');
  const [backups, setBackups] = useState<CreatorBackupSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [validatingNote, setValidatingNote] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);

  // Keep a selection valid if the available projects resolve after first paint.
  useEffect(() => {
    const first = projects[0];
    if (!projectId && first) setProjectId(first.id);
  }, [projects, projectId]);

  const loadBackups = useCallback(async (pid: string) => {
    if (!pid) {
      setBackups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(pid)}/creator-backups`);
      if (!response.ok) throw new Error(`Failed to load backups (${response.status})`);
      const data = (await response.json()) as { backups?: CreatorBackupSummary[] };
      setBackups(Array.isArray(data.backups) ? data.backups : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backups');
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackups(projectId);
  }, [projectId, loadBackups]);

  const createBackup = useCallback(async () => {
    if (!projectId || creating) return;
    setCreating(true);
    setError(null);
    setRestoreNote(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/creator-backups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile: 'full' }),
      });
      if (!response.ok) throw new Error(`Failed to create backup (${response.status})`);
      await loadBackups(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  }, [projectId, creating, loadBackups]);

  const validateBackup = useCallback(async (backupId: string) => {
    if (!projectId || validatingId) return;
    setValidatingId(backupId);
    setValidatingNote(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/creator-backups/${encodeURIComponent(backupId)}/validate`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      );
      const data = (await response.json().catch(() => null)) as
        | { valid?: boolean; issues?: string[]; error?: string }
        | null;
      if (!response.ok) throw new Error(data?.error ?? `Validation failed (${response.status})`);
      setValidatingNote(
        data?.valid ? 'Backup is valid' : `Invalid: ${(data?.issues ?? []).join('; ') || 'unknown reason'}`,
      );
      await loadBackups(projectId);
    } catch (e) {
      setValidatingNote(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setValidatingId(null);
    }
  }, [projectId, validatingId, loadBackups]);

  const restoreBackup = useCallback(async (backupId: string) => {
    if (!projectId || restoringId) return;
    const confirmed =
      typeof window.confirm === 'function'
        ? window.confirm('Restore this backup? Current Creator metadata will be replaced; a rollback snapshot is saved automatically.')
        : true;
    if (!confirmed) return;
    setRestoringId(backupId);
    setRestoreNote(null);
    try {
      const result = await restoreCreatorBackup(backupId);
      if (!result.ok) throw new Error(result.error ?? 'Restore failed');
      setRestoreNote('Restore complete. The daemon restarted and your Creator metadata was restored.');
      await loadBackups(projectId);
    } catch (e) {
      setRestoreNote(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  }, [projectId, restoringId, loadBackups]);

  const sorted = [...backups].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="creator-backup">
      <div className="creator-backup__controls">
        <select
          aria-label="Backup project"
          value={projectId}
          onChange={(event) => {
            setRestoreNote(null);
            setValidatingNote(null);
            setProjectId(event.target.value);
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          className="creator-list__action"
          disabled={!projectId || creating}
          aria-label="Create backup"
          onClick={() => void createBackup()}
        >
          {creating ? 'Backing up…' : 'Create backup'}
        </Button>
      </div>

      {error ? <p className="creator-list__desc creator-backup__error" role="alert">{error}</p> : null}
      {restoreNote ? <p className="creator-list__desc creator-backup__note">{restoreNote}</p> : null}
      {validatingNote ? <p className="creator-list__desc creator-backup__note">{validatingNote}</p> : null}

      {loading ? (
        <p className="creator-list__desc">Loading backups…</p>
      ) : sorted.length === 0 ? (
        <p className="creator-list__desc">No backups for this project yet.</p>
      ) : (
        <ul className="creator-list">
          {sorted.map((backup) => (
            <li key={backup.id} className="creator-list__item">
              <div className="creator-list__main">
                <strong className="creator-list__title">{backup.id}</strong>
                <p className="creator-list__desc">
                  {formatBackupTime(backup.createdAt)} · {backup.fileCount} files · {formatBytes(backup.totalSize)} · {backup.status}
                  {backup.validated ? ' · verified' : ''}
                </p>
              </div>
              <div className="creator-list__actions">
                <Button
                  variant="ghost"
                  className="creator-list__action"
                  disabled={validatingId === backup.id}
                  aria-label={`Validate backup ${backup.id}`}
                  onClick={() => void validateBackup(backup.id)}
                >
                  {validatingId === backup.id ? 'Validating…' : 'Validate'}
                </Button>
                <Button
                  variant="ghost"
                  className="creator-list__action"
                  disabled={restoringId === backup.id}
                  aria-label={`Restore backup ${backup.id}`}
                  onClick={() => void restoreBackup(backup.id)}
                >
                  {restoringId === backup.id ? 'Restoring…' : 'Restore'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
