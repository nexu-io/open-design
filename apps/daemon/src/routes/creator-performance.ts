import type { Express } from 'express';
import type { CreateCreatorPerformanceSnapshotRequest } from '@open-design/contracts';

import {
  createCreatorPerformanceSnapshot,
  deleteCreatorPerformanceSnapshot,
  getCreatorPerformanceProjectData,
} from '../creator-performance/store.js';
import { getCreatorReleaseProjectData } from '../creator-release/store.js';

export interface RegisterCreatorPerformanceRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

function requireProject(deps: RegisterCreatorPerformanceRoutesDeps, projectId: string): void {
  if (!deps.projectStore.getProject(deps.db, projectId)) {
    const error = new Error('project not found') as Error & { status?: number };
    error.status = 404;
    throw error;
  }
}

// 路径参数 / 查询参数 ID：非法（空/路径穿越）一律 400；不存在交由查找逻辑返回 404。
function requireSafeId(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(`${field} is required`) as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  if (/[/\\]/.test(value) || value.includes('..')) {
    const error = new Error(`${field} is not path safe`) as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return value;
}

export function registerCreatorPerformanceRoutes(app: Express, deps: RegisterCreatorPerformanceRoutesDeps): void {
  const { RUNTIME_DATA_DIR } = deps.paths;

  app.get('/api/projects/:id/creator-performance-snapshots', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const data = await getCreatorPerformanceProjectData(RUNTIME_DATA_DIR, req.params.id);

      const releaseId = req.query.releaseId;
      if (releaseId !== undefined) {
        // 可选 releaseId 必须是路径安全的字符串；非法查询参数 → 400。
        const scoped = requireSafeId(String(releaseId), 'release id');
        // 引用的 release 必须属于当前项目，否则 → 400（不得跨项目过滤）。
        const release = (await getCreatorReleaseProjectData(RUNTIME_DATA_DIR, req.params.id))
          .releasePackages.find((entry) => entry.id === scoped);
        if (!release) {
          const error = new Error('creator release package not found in this project') as Error & { status?: number };
          error.status = 400;
          throw error;
        }
        res.json({ snapshots: data.snapshots.filter((snapshot) => snapshot.releaseId === scoped) });
        return;
      }

      res.json({ snapshots: data.snapshots });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-performance-snapshots', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const body = (req.body ?? {}) as CreateCreatorPerformanceSnapshotRequest;
      const releaseId = requireSafeId(String(body.releaseId ?? ''), 'release id');

      // release 必须属于当前项目且状态为 published；draft/ready/archived/未知/跨项目一律 400。
      const release = (await getCreatorReleaseProjectData(RUNTIME_DATA_DIR, req.params.id))
        .releasePackages.find((entry) => entry.id === releaseId);
      if (!release) {
        const error = new Error('creator release package not found in this project') as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      if (release.status !== 'published') {
        const error = new Error('performance snapshots require a published release') as Error & { status?: number };
        error.status = 400;
        throw error;
      }

      const snapshot = await createCreatorPerformanceSnapshot(RUNTIME_DATA_DIR, req.params.id, body);
      res.status(201).json({ snapshot });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/projects/:id/creator-performance-snapshots/:snapshotId', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const snapshotId = requireSafeId(req.params.snapshotId, 'snapshot id');
      // 仅删除目标快照；不级联影响 release、Content、Media 或原始文件。
      // GET/DELETE 对历史快照不因 release 后来 archived 而拒绝。
      const deleted = await deleteCreatorPerformanceSnapshot(RUNTIME_DATA_DIR, req.params.id, snapshotId);
      if (!deleted) return res.status(404).json({ error: 'creator performance snapshot not found' });
      res.status(204).end();
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });
}
