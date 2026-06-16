import type { Express } from 'express';
import type Database from 'better-sqlite3';

import { applyDiffReviewDecisionToCwd, getSnapshot, isDiffReviewSurfaceId, listIterationsForRun } from '../plugins/index.js';
import { getProject } from '../db.js';
import {
  getSurface,
  listSurfacesForProject,
  listSurfacesForRun,
  prefillProjectSurface,
  respondSurface as respondSurfaceRow,
  revokeProjectSurface,
} from '../genui/index.js';
import { resolveProjectDir } from '../projects.js';

export interface RegisterGenuiRoutesDeps {
  db: Database.Database;
  design: {
    runs: {
      get(runId: string): { projectId?: string | null } | undefined;
    };
  };
  paths: {
    PROJECTS_DIR: string;
  };
}

export function registerGenuiRoutes(app: Express, deps: RegisterGenuiRoutesDeps): void {
  const { db, design } = deps;
  const { PROJECTS_DIR } = deps.paths;

  app.get('/api/runs/:runId/genui', (req, res) => {
    try {
      const surfaces = listSurfacesForRun(db, req.params.runId);
      res.json({ runId: req.params.runId, surfaces });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/projects/:projectId/genui', (req, res) => {
    try {
      const surfaces = listSurfacesForProject(db, req.params.projectId);
      res.json({ projectId: req.params.projectId, surfaces });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/runs/:runId/genui/:surfaceId/respond', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const value = 'value' in body ? body.value : null;
      const respondedBy =
        body.respondedBy === 'agent' || body.respondedBy === 'auto'
          ? body.respondedBy
          : 'user';
      const stmt = db.prepare(
        `SELECT id FROM genui_surfaces
          WHERE run_id = ? AND surface_id = ? AND status = 'pending'
          ORDER BY requested_at DESC LIMIT 1`,
      );
      const row = stmt.get(req.params.runId, req.params.surfaceId) as { id?: string } | undefined;
      if (!row?.id) {
        return res.status(404).json({ error: 'no pending surface for runId/surfaceId' });
      }
      const updated = respondSurfaceRow(db, {
        runId: req.params.runId,
        rowId: row.id,
        value,
        respondedBy,
      });

      let diffReviewBridge: { ok: boolean; error?: string } | undefined;
      if (isDiffReviewSurfaceId(req.params.surfaceId)) {
        try {
          const run = design.runs.get(req.params.runId);
          const projectId = run?.projectId ?? null;
          if (projectId) {
            const project = getProject(db, projectId);
            const metadata = project?.metadata && typeof project.metadata === 'string'
              ? JSON.parse(project.metadata)
              : project?.metadata ?? undefined;
            const cwd = resolveProjectDir(PROJECTS_DIR, projectId, metadata);
            const bridgeResult = await applyDiffReviewDecisionToCwd({
              cwd,
              value,
              reviewer: respondedBy === 'agent' || respondedBy === 'auto' ? 'agent' : 'user',
            });
            diffReviewBridge = bridgeResult.ok ? { ok: true } : { ok: false, error: bridgeResult.error };
          } else {
            diffReviewBridge = { ok: false, error: 'run is not linked to a project' };
          }
        } catch (err) {
          diffReviewBridge = { ok: false, error: (err as Error).message };
          console.warn('[plugins] diff-review bridge failed:', err);
        }
      }

      const responsePayload: Record<string, unknown> = { ok: true, surface: updated };
      if (diffReviewBridge) responsePayload.diffReviewBridge = diffReviewBridge;
      res.json(responsePayload);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/projects/:projectId/genui/:surfaceId/revoke', (req, res) => {
    try {
      const changed = revokeProjectSurface(db, {
        projectId: req.params.projectId,
        surfaceId: req.params.surfaceId,
      });
      res.json({ ok: true, invalidated: changed });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/projects/:projectId/genui/prefill', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const snapshotId = typeof body.snapshotId === 'string' ? body.snapshotId : '';
      const surfaceId = typeof body.surfaceId === 'string' ? body.surfaceId : '';
      const persist = body.persist === 'run' || body.persist === 'conversation' || body.persist === 'project'
        ? body.persist
        : 'project';
      const kind = body.kind === 'form' || body.kind === 'choice' || body.kind === 'oauth-prompt'
        ? body.kind
        : 'confirmation';
      if (!snapshotId || !surfaceId) {
        return res.status(400).json({ error: 'snapshotId and surfaceId are required' });
      }
      const row = prefillProjectSurface(db, {
        projectId: req.params.projectId,
        pluginSnapshotId: snapshotId,
        surfaceId,
        kind,
        persist,
        value: 'value' in body ? body.value : null,
        schema: body.schema,
        expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : null,
      });
      res.json({ ok: true, surface: row });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/runs/:runId/genui/:surfaceId', (req, res) => {
    try {
      const row = db.prepare(
        `SELECT id FROM genui_surfaces
          WHERE run_id = ? AND surface_id = ?
          ORDER BY requested_at DESC LIMIT 1`,
      ).get(req.params.runId, req.params.surfaceId) as { id?: string } | undefined;
      if (!row?.id) return res.status(404).json({ error: 'surface not found' });
      const surface = getSurface(db, row.id);
      if (!surface) return res.status(404).json({ error: 'surface not found' });
      let spec = null;
      if (surface.pluginSnapshotId) {
        const snap = getSnapshot(db, surface.pluginSnapshotId);
        if (snap && Array.isArray(snap.genuiSurfaces)) {
          spec = snap.genuiSurfaces.find((s) => s?.id === surface.surfaceId) ?? null;
        }
      }
      res.json({ ...surface, spec });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/runs/:runId/devloop-iterations', (req, res) => {
    try {
      const iterations = listIterationsForRun(db, req.params.runId);
      res.json({ runId: req.params.runId, iterations });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/runs/:runId/replay', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const explicitSnapshotId = typeof body.snapshotId === 'string' ? body.snapshotId : '';
      const snapshotId = explicitSnapshotId;
      if (!snapshotId) {
        return res.status(400).json({
          error: 'snapshotId is required (runs are in-memory; pass the snapshotId returned by /api/plugins/:id/apply)',
        });
      }
      const snapshot = getSnapshot(db, snapshotId);
      if (!snapshot) return res.status(404).json({ error: 'snapshot not found' });
      res.json({
        ok: true,
        runId: req.params.runId,
        snapshotId,
        snapshot,
        rerun: {
          pluginId: snapshot.pluginId,
          pluginSpecVersion: snapshot.pluginSpecVersion,
          pluginVersion: snapshot.pluginVersion,
          inputs: snapshot.inputs,
          manifestSourceDigest: snapshot.manifestSourceDigest,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
