import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { CreatorMediaAsset, CreatorMediaProjectData, CreatorMediaRoot, CreatorMediaScanCandidate } from '@open-design/contracts';

function filePath(dataDir: string, projectId: string) { return path.join(dataDir, 'creator-media', `${projectId}.json`); }
async function read(dataDir: string, projectId: string): Promise<CreatorMediaProjectData> {
  try { const value = JSON.parse(await fsp.readFile(filePath(dataDir, projectId), 'utf8')) as Partial<CreatorMediaProjectData>; return { roots: Array.isArray(value.roots) ? value.roots : [], assets: Array.isArray(value.assets) ? value.assets : [], taskLinks: Array.isArray(value.taskLinks) ? value.taskLinks : [] }; } catch { return { roots: [], assets: [], taskLinks: [] }; }
}
export async function getCreatorMediaProjectData(dataDir: string, projectId: string): Promise<CreatorMediaProjectData> { return read(dataDir, projectId); }
async function write(dataDir: string, projectId: string, data: CreatorMediaProjectData) {
  const file = filePath(dataDir, projectId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
  await fsp.rename(temp, file);
}

export async function upsertCreatorMediaAssets(
  dataDir: string,
  projectId: string,
  candidates: CreatorMediaScanCandidate[],
  scan?: { rootPath: string; complete: boolean; scannedAt?: string },
): Promise<CreatorMediaAsset[]> {
  const data = await read(dataDir, projectId); const now = new Date().toISOString();
  if (scan) {
    const scannedAt = scan.scannedAt ?? now;
    const root = data.roots.find((entry) => entry.rootPath === scan.rootPath);
    if (root) root.lastScannedAt = scannedAt;
    else data.roots.push({ rootPath: scan.rootPath, addedAt: now, lastScannedAt: scannedAt } satisfies CreatorMediaRoot);
    if (scan.complete) {
      const discoveredPaths = new Set(candidates.filter((candidate) => candidate.rootPath === scan.rootPath).map((candidate) => candidate.sourcePath));
      for (const asset of data.assets) {
        if (asset.rootPath === scan.rootPath && !discoveredPaths.has(asset.sourcePath)) {
          asset.availability = 'missing';
          asset.updatedAt = now;
        }
      }
    }
  }
  const assets = candidates.map((candidate) => {
    const existing = data.assets.find((asset) => asset.sourcePath === candidate.sourcePath);
    if (existing) { Object.assign(existing, candidate, { updatedAt: now }); return existing; }
    const asset: CreatorMediaAsset = { ...candidate, id: `creator-media:${randomUUID()}`, projectId, createdAt: now, updatedAt: now }; data.assets.push(asset); return asset;
  });
  await write(dataDir, projectId, data); return assets;
}

export async function linkCreatorTaskMediaAsset(dataDir: string, projectId: string, taskId: string, assetId: string): Promise<void> {
  const data = await read(dataDir, projectId); if (!data.assets.some((asset) => asset.id === assetId)) throw new Error('creator media asset not found');
  if (!data.taskLinks.some((link) => link.taskId === taskId && link.assetId === assetId)) data.taskLinks.push({ taskId, assetId, createdAt: new Date().toISOString() });
  await write(dataDir, projectId, data);
}

export async function unlinkCreatorTaskMediaAsset(dataDir: string, projectId: string, taskId: string, assetId: string): Promise<void> {
  const data = await read(dataDir, projectId);
  data.taskLinks = data.taskLinks.filter((link) => link.taskId !== taskId || link.assetId !== assetId);
  await write(dataDir, projectId, data);
}
