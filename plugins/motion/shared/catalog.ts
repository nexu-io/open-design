export const templateCategories = [
  { id: 'featured', label: '精选模板' }, { id: 'clone', label: '视频复刻' },
  { id: 'ads', label: '产品宣传' }, { id: 'motion', label: '动态设计' }, { id: 'script', label: '口播内容' },
] as const;
export const collectionNames = { reference: '完整参考', moment: '创作片段', block: '动效模板', component: '动效组件', example: '影片范例', builtin: '本地模板' };
export type CatalogEntry = {
  id: string; collection: Exclude<keyof typeof collectionNames, 'builtin'>; title: string; description: string;
  tags: string[]; role?: string; seconds?: number; ratio?: string; video?: string; poster?: string;
  videoAvailable?: boolean; posterAvailable?: boolean; mediaFingerprint?: string; sourceUrl: string; author: string;
};
export type GalleryTemplate = {
  id: string; title: string; subtitle: string; description: string; collection: keyof typeof collectionNames;
  kind: 'builtin' | 'reference' | 'registry'; tags: string[]; role?: string; duration?: number; ratio?: string;
  previewUrl?: string; posterUrl?: string; sourceUrl?: string; author: string; mediaFingerprint?: string;
  authorName?: string; social?: TemplateSocial;
  variants?: GalleryTemplate[];
};
export type SocialPlatform = 'X' | 'Instagram' | 'YouTube' | 'TikTok';
export type TemplateSocial = { platform: SocialPlatform; views: number; sourceUrl: string; syncedAt: string; metadataUrl: string };
export type TemplatePage = { items: GalleryTemplate[]; total: number; entryTotal: number; catalogTotal: number; galleryTotal?: number; offset: number; next: number | null };
export const featuredTemplateIds = [
  'hf-moment-M945', 'hf-moment-M953', 'hf-reference-aroll-careerwithriya',
  'hf-moment-M1023', 'hf-moment-M1000', 'hf-moment-M990',
];
const roleNames: Record<string, string> = { 'a-roll': '口播', hook: '开场', setup: '铺垫', proof: '产品展示', turn: '转场', payoff: '高潮', cta: '结尾' };
export function templateCategoryLabel(template: GalleryTemplate) {
  if (template.role === 'a-roll' || template.tags.includes('口播')) return 'A-roll Cuts';
  return roleNames[template.role || ''] || (template.collection === 'reference' ? '动态图形' : collectionNames[template.collection]);
}
export function socialPlatform(value?: string): SocialPlatform | undefined {
  try {
    const url = new URL(value || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    const host = url.hostname.replace(/^(www|m|mobile)\./, '');
    if (['x.com', 'twitter.com'].includes(host)) return 'X';
    if (host === 'instagram.com') return 'Instagram';
    if (['youtube.com', 'youtu.be'].includes(host)) return 'YouTube';
    if (host === 'tiktok.com') return 'TikTok';
  } catch {}
}
export function formatTemplateViews(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) return '';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: value >= 10_000 && value < 1_000_000 ? 0 : 1 }).format(value);
}
function displayRatio(value?: string) {
  if (!value) return undefined;
  const [width, height] = value.split(/[/:]/).map(Number);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return value;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const unit = gcd(width, height); return `${width / unit}:${height / unit}`;
}
export function isCatalogMedia(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'static.heygen.ai' && !url.username && !url.password && !url.port && /^\/(hyperframes-oss|hyperframes)\//.test(url.pathname);
  } catch { return false; }
}
export function catalogTemplates(entries: CatalogEntry[], frames: { id: string; video: string; poster: string }[] = []): GalleryTemplate[] {
  const posters = new Map(frames.map(frame => [frame.id, frame]));
  const ids = new Set<string>();
  const external = entries.map(entry => {
    if (!/^hf-(reference|moment|block|component|example)-[a-zA-Z0-9_-]+$/.test(entry.id) || ids.has(entry.id) || !entry.title || !Array.isArray(entry.tags) || !Object.hasOwn(collectionNames, entry.collection)) throw new Error('模板目录身份无效');
    ids.add(entry.id);
    if ((entry.video && !isCatalogMedia(entry.video)) || (entry.poster && !isCatalogMedia(entry.poster))) throw new Error('模板预览地址无效');
    const source = new URL(entry.sourceUrl);
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('模板来源无效');
    const frame = posters.get(entry.id);
    const poster = frame && frame.video === entry.video && /^\/web\/catalog\/template-frames\/[a-f0-9]{24}\.jpg$/.test(frame.poster) ? frame.poster : entry.posterAvailable === false ? undefined : entry.poster;
    return {
      id: entry.id, title: entry.title, description: entry.description || '', tags: entry.tags, role: entry.role,
      collection: entry.collection, kind: ['reference', 'moment'].includes(entry.collection) ? 'reference' : 'registry',
      subtitle: [roleNames[entry.role || ''] || collectionNames[entry.collection], entry.author].filter(Boolean).join(' · '),
      duration: entry.seconds, ratio: displayRatio(entry.ratio),
      previewUrl: entry.videoAvailable === false ? undefined : entry.video, posterUrl: poster,
      sourceUrl: entry.sourceUrl, author: entry.author, mediaFingerprint: entry.mediaFingerprint,
    } satisfies GalleryTemplate;
  });
  return external;
}
export function sourceIdentity(value?: string) {
  if (!value) return;
  let url: URL; try { url = new URL(value); } catch { return; }
  const host = url.hostname.replace(/^www\./, '');
  if (['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) { const id = url.pathname.match(/\/status\/(\d+)/)?.[1]; if (id) return 'x:' + id; }
  if (host === 'instagram.com') { const id = url.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/)?.[1]; if (id) return 'instagram:' + id; }
  if (host === 'youtu.be') return 'youtube:' + url.pathname.slice(1);
  if (['youtube.com', 'm.youtube.com'].includes(host)) { const id = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]; if (id) return 'youtube:' + id; }
  if (host === 'tiktok.com') { const id = url.pathname.match(/\/video\/(\d+)/)?.[1]; if (id) return 'tiktok:' + id; }
}
// Same-video and same-source choices share a card, but every original ID remains selectable.
export function groupTemplates(items: GalleryTemplate[]) {
  const groups: GalleryTemplate[][] = [], keys = new Map<string, GalleryTemplate[]>();
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  for (const item of items) {
    const source = sourceIdentity(item.sourceUrl);
    const identities = [item.previewUrl && 'video:' + item.previewUrl, item.mediaFingerprint && 'media:' + item.mediaFingerprint,
      item.role === 'a-roll' && item.collection === 'moment' ? 'family:spoken' : source || (item.kind === 'builtin' ? 'id:' + item.id : 'title:' + normalize(item.title) + ':' + normalize(item.author))].filter(Boolean) as string[];
    let group = identities.map(key => keys.get(key)).find(Boolean);
    if (!group) { group = []; groups.push(group); }
    group.push(item); identities.forEach(key => keys.set(key, group!));
  }
  return groups.map(items => {
    const primary = items.find(item => item.collection === 'reference') || items[0];
    return items.length === 1 ? primary : { ...primary, variants: [primary, ...items.filter(item => item !== primary)] };
  });
}
export function templatePage(items: GalleryTemplate[], options: { category?: string; query?: string; offset?: number; limit?: number; grouped?: boolean } = {}): TemplatePage {
  const { category = 'featured', query = '', offset = 0, limit = 12, grouped = false } = options;
  if (!['featured', 'all', 'clone', 'ads', 'motion', 'script', 'builtin'].includes(category) || query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 60) throw new Error('模板分页参数无效');
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter(item => {
    const spoken = item.tags.includes('口播') || item.role === 'a-roll';
    const categoryMatch = category === 'builtin' ? item.kind === 'builtin'
      : category === 'clone' ? item.kind === 'reference'
      : category === 'script' ? spoken
      : category === 'motion' ? !spoken
      : category === 'ads' ? item.kind === 'reference' || item.tags.some(tag => /ad|product|social|showcase|marketing/i.test(tag))
      : true;
    return categoryMatch && terms.every(term => `${item.id} ${item.title} ${item.description} ${item.subtitle} ${item.authorName || ''} ${item.tags.join(' ')} ${collectionNames[item.collection]} ${templateCategoryLabel(item)} ${socialPlatform(item.sourceUrl) || ''}`.toLowerCase().includes(term));
  });
  if (category === 'featured' || category === 'all') {
    const rank = (id: string) => { const index = featuredTemplateIds.indexOf(id); return index < 0 ? featuredTemplateIds.length : index; };
    matches.sort((a, b) => rank(a.id) - rank(b.id));
  }
  const visible = grouped ? groupTemplates(matches) : matches;
  return { items: visible.slice(offset, offset + limit), total: visible.length, entryTotal: matches.length, catalogTotal: items.length,
    offset, next: offset + limit < visible.length ? offset + limit : null };
}
