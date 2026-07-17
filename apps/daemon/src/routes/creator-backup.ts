/**
 * Creator backup routes (daemon side).
 *
 * Exposes ONLY list / create / validate over HTTP. Restore is deliberately
 * absent: it is orchestrated solely by the packaged desktop main process
 * through a fixed-parameter capability, never as a daemon HTTP endpoint.
 */

import type { Express } from 'express';
import type {
  CreateCreatorBackupRequest,
  ValidateCreatorBackupRequest,
} from '@open-design/contracts';

import {
  createCreatorBackup,
  listCreatorBackups,
  validateCreatorBackup,
} from '../creator-backup/store.js';
import { readProjectIdentity } from '../creator-backup/project-identity.js';

export interface RegisterCreatorBackupRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

function requireProject(deps: RegisterCreatorBackupRoutesDeps, projectId: string): void {
  if (!deps.projectStore.getProject(deps.db, projectId)) {
    const error = new Error('project not found') as Error & { status?: number };
    error.status = 404;
    throw error;
  }
}

// backupId path param: illegal (empty / traversal) -> 400; absence -> 404.
function requireBackupId(value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error('backup id is required') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  if (/[/\\]/.test(value) || value.includes('..')) {
    const error = new Error('backup id is not path safe') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return value;
}

export function registerCreatorBackupRoutes(app: Express, deps: RegisterCreatorBackupRoutesDeps): void {
  const { RUNTIME_DATA_DIR } = deps.paths;

  app.get('/api/projects/:id/creator-backups', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const backups = await listCreatorBackups(RUNTIME_DATA_DIR);
      // Filter to snapshots that reference this project (manifests carry the
      // minimal project association, never raw asset bodies).
      const scoped = backups.filter((backup) => backup.projectIds.includes(req.params.id));
      res.json({ backups: scoped });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-backups', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const body = (req.body ?? {}) as CreateCreatorBackupRequest;
      if (body.profile !== undefined && body.profile !== 'full') {
        const error = new Error('unsupported backup profile') as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      const backup = await createCreatorBackup(RUNTIME_DATA_DIR, req.params.id, {
        ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim() } : {}),
        ...(body.profile === 'full' ? { profile: 'full' } : {}),
        // Read minimal project identity through the controlled DB API so the
        // snapshot can re-establish the Creator project association on restore.
        // Best-effort: an identity read failure must NOT fail the whole snapshot
        // (identity is optional metadata; the file capture still proceeds).
        identityProvider: (projectId: string) => {
          try {
            return readProjectIdentity(deps.db, projectId);
          } catch {
            return null;
          }
        },
      });
      res.status(201).json({ backup });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-backups/:backupId/validate', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const backupId = requireBackupId(req.params.backupId);
      const body = (req.body ?? {}) as ValidateCreatorBackupRequest;
      // Prefer the path param; fall back to the body only when it is safe.
      const effectiveId = typeof body.backupId === 'string' && body.backupId ? body.backupId : backupId;
      const result = await validateCreatorBackup(RUNTIME_DATA_DIR, effectiveId);
      res.status(result.valid ? 200 : 422).json(result);
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

}
