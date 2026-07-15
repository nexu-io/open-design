import type { Express } from 'express';
import type {
  CreateCreatorReleasePackageRequest,
  CreatorReleasePackage,
  UpdateCreatorReleasePackageRequest,
} from '@open-design/contracts';

import {
  createCreatorReleasePackage,
  deleteCreatorReleasePackage,
  getCreatorReleaseProjectData,
  updateCreatorReleasePackage,
} from '../creator-release/store.js';
import { getCreatorContentProjectData } from '../creator-content/store.js';
import { getCreatorMediaProjectData } from '../creator-media/store.js';

export interface RegisterCreatorReleaseRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}

type ContentData = Awaited<ReturnType<typeof getCreatorContentProjectData>>;
type MediaData = Awaited<ReturnType<typeof getCreatorMediaProjectData>>;

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

function requireProject(deps: RegisterCreatorReleaseRoutesDeps, projectId: string): void {
  if (!deps.projectStore.getProject(deps.db, projectId)) {
    const error = new Error('project not found') as Error & { status?: number };
    error.status = 404;
    throw error;
  }
}

// releaseId 路径参数：非法（空/路径穿越）一律 400；不存在交由查找逻辑返回 404。
function requireReleaseId(value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error('release id is required') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  if (/[/\\]/.test(value) || value.includes('..')) {
    const error = new Error('release id is not path safe') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return value;
}

// contentId 必须存在于当前项目的 Creator Content 数据；跨项目/未知 content → 400。
function assertContentInProject(content: ContentData, contentId: string): void {
  if (!content.contentProjects.some((entry) => entry.id === contentId)) {
    const error = new Error('creator content not found in this project') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
}

// 校验素材引用的最终值：
// - 与既有引用相同 id → 保留（含 available / missing / 已不存在），不拒绝；
// - 其他项目的素材、未知素材、或当前项目 missing 素材作为「新」引用 → 400；
// - 找到且 available → 允许。
function assertAssetReference(media: MediaData, candidate: string, currentId: string | undefined): void {
  if (candidate === currentId) return;
  const asset = media.assets.find((entry) => entry.id === candidate);
  if (!asset) {
    const error = new Error('creator media asset not found in this project') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  if (asset.availability !== 'available') {
    const error = new Error('creator media asset must be available in this project') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
}

type ExportAssetRef = { id: string; availability: 'available' | 'missing' | 'unavailable' } | null;

function assetRef(media: MediaData, assetId: string | undefined): ExportAssetRef {
  if (assetId === undefined) return null;
  const asset = media.assets.find((entry) => entry.id === assetId);
  // 原引用存在但当前媒体数据中找不到 → 保留 id 并标记 unavailable；
  // 找到且 availability === 'missing' 必须标记 missing，不得丢失引用。
  if (!asset) return { id: assetId, availability: 'unavailable' };
  return { id: assetId, availability: asset.availability === 'missing' ? 'missing' : 'available' };
}

// 确定性的导出文档：仅含稳定 id 与 availability 语义，不含任何本机路径或素材二进制内容。
function buildExport(release: CreatorReleasePackage, media: MediaData, contentTitle: string | null) {
  return {
    id: release.id,
    projectId: release.projectId,
    contentId: release.contentId,
    platform: release.platform,
    status: release.status,
    title: release.title,
    description: release.description,
    tags: release.tags,
    coverAssetId: release.coverAssetId,
    exportAssetId: release.exportAssetId,
    scheduledAt: release.scheduledAt,
    publishedAt: release.publishedAt,
    publishedUrl: release.publishedUrl,
    checklist: release.checklist,
    createdAt: release.createdAt,
    updatedAt: release.updatedAt,
    content: { id: release.contentId, title: contentTitle },
    coverAsset: assetRef(media, release.coverAssetId),
    exportAsset: assetRef(media, release.exportAssetId),
  };
}

export function registerCreatorReleaseRoutes(app: Express, deps: RegisterCreatorReleaseRoutesDeps): void {
  const { RUNTIME_DATA_DIR } = deps.paths;

  app.get('/api/projects/:id/creator-release-packages', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const data = await getCreatorReleaseProjectData(RUNTIME_DATA_DIR, req.params.id);
      res.json({ releasePackages: data.releasePackages });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-release-packages', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const body = (req.body ?? {}) as CreateCreatorReleasePackageRequest;
      if (typeof body.contentId !== 'string' || !body.contentId.trim()) {
        const error = new Error('content id is required') as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      // 内容归属校验：create 的最终 contentId 必须在当前项目存在。
      const content = await getCreatorContentProjectData(RUNTIME_DATA_DIR, req.params.id);
      assertContentInProject(content, body.contentId);
      const media = await getCreatorMediaProjectData(RUNTIME_DATA_DIR, req.params.id);
      if (typeof body.coverAssetId === 'string') assertAssetReference(media, body.coverAssetId, undefined);
      if (typeof body.exportAssetId === 'string') assertAssetReference(media, body.exportAssetId, undefined);
      const release = await createCreatorReleasePackage(RUNTIME_DATA_DIR, req.params.id, body);
      res.status(201).json({ releasePackage: release });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.patch('/api/projects/:id/creator-release-packages/:releaseId', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const releaseId = req.params.releaseId;
      const current = (await getCreatorReleaseProjectData(RUNTIME_DATA_DIR, req.params.id))
        .releasePackages.find((entry) => entry.id === releaseId);
      if (!current) return res.status(404).json({ error: 'creator release package not found' });

      const body = (req.body ?? {}) as UpdateCreatorReleasePackageRequest;
      // 内容归属校验：PATCH 未提供 contentId 时保留既有值，但仍须绑定当前项目存在的内容。
      const effectiveContentId = body.contentId ?? current.contentId;
      const content = await getCreatorContentProjectData(RUNTIME_DATA_DIR, req.params.id);
      assertContentInProject(content, effectiveContentId);

      const media = await getCreatorMediaProjectData(RUNTIME_DATA_DIR, req.params.id);
      const effectiveCover = body.coverAssetId === undefined ? current.coverAssetId : body.coverAssetId;
      if (typeof effectiveCover === 'string') assertAssetReference(media, effectiveCover, current.coverAssetId);
      const effectiveExport = body.exportAssetId === undefined ? current.exportAssetId : body.exportAssetId;
      if (typeof effectiveExport === 'string') assertAssetReference(media, effectiveExport, current.exportAssetId);

      // 最终交给 store：store 校验字段语义并强制 ready/published 状态门禁。
      const release = await updateCreatorReleasePackage(RUNTIME_DATA_DIR, req.params.id, releaseId, body);
      if (!release) return res.status(404).json({ error: 'creator release package not found' });
      res.json({ releasePackage: release });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/projects/:id/creator-release-packages/:releaseId', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      const deleted = await deleteCreatorReleasePackage(RUNTIME_DATA_DIR, req.params.id, req.params.releaseId);
      if (!deleted) return res.status(404).json({ error: 'creator release package not found' });
      // 仅删除 release 记录，不触及 content、task、media 或原始素材文件。
      res.status(204).end();
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.get('/api/projects/:id/creator-release-packages/:releaseId/export', async (req, res) => {
    try {
      requireProject(deps, req.params.id);
      requireReleaseId(req.params.releaseId);
      const data = await getCreatorReleaseProjectData(RUNTIME_DATA_DIR, req.params.id);
      const release = data.releasePackages.find((entry) => entry.id === req.params.releaseId);
      if (!release) return res.status(404).json({ error: 'creator release package not found' });
      const media = await getCreatorMediaProjectData(RUNTIME_DATA_DIR, req.params.id);
      const content = await getCreatorContentProjectData(RUNTIME_DATA_DIR, req.params.id);
      const contentTitle = content.contentProjects.find((entry) => entry.id === release.contentId)?.title ?? null;
      res.status(200).set('content-type', 'application/json').json(buildExport(release, media, contentTitle));
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });
}
