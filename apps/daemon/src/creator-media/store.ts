import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { CreatorMediaAsset, CreatorMediaProjectData, CreatorMediaScanCandidate } from '@open-design/contracts';

function filePath(dataDir: string, projectId: string) { return path.join(dataDir, 'creator-media', `${projectId}.json`); }
async function read(dataDir: string, projectId: string): Promise<CreatorMediaProjectData> {
  try { const value = JSON.parse(await fsp.readFile(filePath(dataDir, projectId), 'utf8')) as CreatorMediaProjectData; return { assets: Array.isArray(value.assets) ? value.assets : [], taskLinks: Array.isArray(value.taskLinks) ? value.taskLinks : [] }; } catch { return { assets: [], taskLinks: [] }; }
}
export async function getCreatorMediaProjectData(dataDir: string, projectId: string): Promise<CreatorMediaProjectData> { return read(dataDir, projectId); }
async function write(dataDir: string, projectId: string, data: CreatorMediaProjectData) {
  const file = filePath(dataDir, projectId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
  await fsp.rename(temp, file);
}

export async function upsertCreatorMediaAssets(dataDir: string, projectId: string, candidates: CreatorMediaScanCandidate[]): Promise<CreatorMediaAsset[]> {
  const data = await read(dataDir, projectId); const now = new Date().toISOString();
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
