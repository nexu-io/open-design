// Version-1 import/migration only. Native editing and rendering use Hyperframes HTML.
export const FPS = 24;
export const WIDTH = 540;
export const HEIGHT = 960;
export const MAX_SECONDS = 60;

export type Asset = { id: string; name: string; type: 'image' | 'video'; data: string; duration: number };
export type Shot = {
  id: string; assetId: string | null; duration: number; start: number;
  caption: string; subtitle: string; accent: string;
  position: 'top' | 'center' | 'bottom'; fit: 'cover' | 'contain';
  graphic?: 'product' | 'landscape' | 'orbit' | 'type' | 'portrait';
};
export type Project = { version: 1; title: string; assets: Asset[]; shots: Shot[]; referenceId: string | null; cuts: number[] };

export const duration = (project: Project): number => project.shots.reduce((n, s) => n + s.duration, 0);
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validateProject(input: unknown): Project {
  assert(input && typeof input === 'object', '工程格式无效');
  const p = input as Project;
  assert(p.version === 1, '不支持此工程版本');
  assert(typeof p.title === 'string' && p.title.length <= 100, '工程名称过长');
  assert(Array.isArray(p.assets) && p.assets.length <= 30, '最多支持 30 份素材');
  assert(Array.isArray(p.shots) && p.shots.length > 0 && p.shots.length <= 24, '需要 1–24 个镜头');
  const ids = new Set<string>();
  let size = 0;
  for (const a of p.assets) {
    assert(typeof a.id === 'string' && !ids.has(a.id), '素材 ID 重复或无效');
    ids.add(a.id);
    assert(typeof a.name === 'string' && a.name.length <= 200, '素材名称无效');
    assert(a.type === 'image' || a.type === 'video', '素材类型无效');
    assert(typeof a.data === 'string' && (a.type === 'image'
      ? /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(a.data)
      : /^data:video\/(mp4|webm|quicktime);base64,[A-Za-z0-9+/=\r\n]+$/.test(a.data)), '只支持内嵌 PNG/JPEG/WebP 图片和 MP4/WebM/MOV 视频');
    size += a.data.length;
    assert(Number.isFinite(a.duration) && a.duration >= 0 && a.duration < 86400, '素材时长无效');
    if (a.type === 'video') assert(a.duration >= 0.5, '视频至少需要 0.5 秒');
  }
  assert(size <= 100 * 1024 * 1024, '工程内嵌素材不能超过 100 MB');
  const shotIds = new Set<string>();
  for (const s of p.shots) {
    assert(typeof s.id === 'string' && !shotIds.has(s.id), '镜头 ID 重复或无效');
    shotIds.add(s.id);
    assert(s.assetId === null || ids.has(s.assetId), '镜头引用了不存在的素材');
    assert(Number.isFinite(s.duration) && s.duration >= 0.5 && s.duration <= MAX_SECONDS, '镜头时长须在 0.5–60 秒之间');
    assert(Math.abs(s.duration * FPS - Math.round(s.duration * FPS)) < 0.001, '时长必须对齐到 24fps 的帧');
    assert(Number.isFinite(s.start) && s.start >= 0, '素材起点无效');
    const asset = p.assets.find(a => a.id === s.assetId);
    if (asset?.type === 'video') assert(s.start + s.duration <= asset.duration + 1 / FPS, '镜头超出了素材视频的可用时长');
    assert(typeof s.caption === 'string' && s.caption.length <= 60, '标题最多 60 字');
    assert(typeof s.subtitle === 'string' && s.subtitle.length <= 120, '副标题最多 120 字');
    assert(/^#[0-9a-f]{6}$/i.test(s.accent), '颜色格式无效');
    assert(['top', 'center', 'bottom'].includes(s.position), '字幕位置无效');
    assert(['cover', 'contain'].includes(s.fit), '画面适配方式无效');
    assert(s.graphic === undefined || ['product', 'landscape', 'orbit', 'type', 'portrait'].includes(s.graphic), '模板图形无效');
  }
  assert(duration(p) <= MAX_SECONDS + 0.001, '作品总时长不能超过 60 秒');
  assert(p.referenceId === null || p.assets.some(a => a.id === p.referenceId && a.type === 'video'), '参考视频不存在');
  assert(Array.isArray(p.cuts) && p.cuts.length <= 200 && p.cuts.every(n => Number.isFinite(n) && n >= 0 && n <= MAX_SECONDS), '切点数据无效');
  return p;
}
