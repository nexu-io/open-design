import { isCatalogMedia, socialPlatform, sourceIdentity } from './catalog.ts';
import type { CatalogEntry, GalleryTemplate, SocialPlatform } from './catalog.ts';

export const momentsMetadataUrl = 'https://static.heygen.ai/hyperframes-oss/desktop/moments/v5/manifest.json';
export type TemplateMetadata = {
  id: string; videoUrl: string; sourceUrl: string; authorName?: string;
  role?: string; mechanics: string[]; platform?: SocialPlatform; views?: number;
};
export type TemplateMetadataSnapshot = {
  version: 1; syncedAt: string; source: { url: string; sha256?: string; lastModified?: string }; entries: TemplateMetadata[];
};
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const roles = new Set(['a-roll', 'hook', 'setup', 'proof', 'turn', 'payoff', 'cta']);

/** Join exact IDs, video URLs and source posts. An author's other films must never donate views. */
export function normalizeTemplateMetadata(catalog: CatalogEntry[], payload: unknown, syncedAt: string): TemplateMetadataSnapshot {
  if (!Array.isArray(payload) || !Number.isFinite(Date.parse(syncedAt))) throw new Error('模板热度数据格式无效');
  const entries: TemplateMetadata[] = [], ids = new Set<string>(), originals = new Map(catalog.map(entry => [entry.id, entry]));
  for (const value of payload) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>, id = text(item.id);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    if (ids.has(id)) throw new Error('模板热度数据 ID 重复');
    ids.add(id);
    const original = originals.get('hf-moment-' + id), clip = text(item.clip);
    if (!original || !clip) continue;
    let videoUrl: string; try { videoUrl = new URL(clip, momentsMetadataUrl).href; } catch { continue; }
    if (!isCatalogMedia(videoUrl) || videoUrl !== original.video) continue;
    const sourceUrl = text(item.x_url) || text(item.source_url), platform = socialPlatform(sourceUrl);
    const samePost = !!sourceIdentity(sourceUrl) && sourceIdentity(sourceUrl) === sourceIdentity(original.sourceUrl);
    const role = text(item.role), name = text(item.x_author_name) || text(item.author_name);
    entries.push({ id: original.id, videoUrl, sourceUrl: original.sourceUrl,
      ...(samePost && name ? { authorName: name.replace(/\s*\([^()]*\)\s*$/, '') } : {}),
      ...(role && roles.has(role) ? { role } : {}),
      mechanics: Array.isArray(item.mechanic) ? item.mechanic.filter((value): value is string => typeof value === 'string' && value.length < 100) : [],
      ...(samePost && platform && typeof item.x_views === 'number' && Number.isSafeInteger(item.x_views) && item.x_views >= 0 ? { platform, views: item.x_views } : {}),
    });
  }
  return { version: 1, syncedAt, source: { url: momentsMetadataUrl }, entries: entries.sort((a, b) => a.id.localeCompare(b.id)) };
}

export function enrichTemplate(template: GalleryTemplate, originalVideo: string | undefined, metadata: TemplateMetadata | undefined, snapshot: TemplateMetadataSnapshot): GalleryTemplate {
  if (!metadata || metadata.id !== template.id || metadata.videoUrl !== originalVideo || metadata.sourceUrl !== template.sourceUrl) return template;
  return { ...template, authorName: metadata.authorName, role: metadata.role || template.role,
    ...(metadata.platform && metadata.views !== undefined ? { social: { platform: metadata.platform, views: metadata.views,
      sourceUrl: metadata.sourceUrl, syncedAt: snapshot.syncedAt, metadataUrl: snapshot.source.url } } : {}),
  };
}
