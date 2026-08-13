/**
 * Demo fixture for the image canvas.
 *
 * This surface is a product-review prototype: the per-image copy, model name,
 * resolution and aspect ratio below are hard-coded rather than read from the
 * daemon, because nothing in the project record carries them yet. The image
 * FILES are real project files — only this descriptive layer is mocked.
 *
 * Content mirrors the reference prototype
 * `version/v2/pages/workspace-social-canvas.html` in nexu-io/open-design-next-mock.
 */

export interface ImageCardMeta {
  title: string;
  sub: string;
  tags: string[];
  ratio: string;
  model: string;
  res: string;
}

const DEFAULT_MODEL = 'Seedream 5 Lite';
const DEFAULT_RES = '2K';

export const CAMPAIGN_META: Record<string, ImageCardMeta> = {
  'gen-dance-01.jpg': {
    title: '桥下起舞',
    sub: '白衣舞者 · 蓝丝巾 · 逆光仰角',
    tags: ['#城市大片', '#运动风'],
    ratio: '9:16',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-skate-01.jpg': {
    title: '轮滑女孩',
    sub: '低机位 · 橙色头盔点色',
    tags: ['#街头', '#轮滑'],
    ratio: '9:16',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-tennis-01.jpg': {
    title: '网球时刻',
    sub: '仰拍 · 宝蓝跑鞋前景',
    tags: ['#网球', '#运动鞋'],
    ratio: '9:16',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-elk-01.jpg': {
    title: '林间飞鹿',
    sub: '精灵骑士 · 圣光森林',
    tags: ['#奇幻', '#横版'],
    ratio: '16:9',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-isles-01.jpg': {
    title: '浮空群岛',
    sub: '白魟掠过云海之城',
    tags: ['#奇幻', '#云海'],
    ratio: '16:9',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-ships-01.jpg': {
    title: '峡谷飞艇',
    sub: '三舰穿越瀑布群',
    tags: ['#奇幻', '#飞艇'],
    ratio: '16:9',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-rabbit-01.jpg': {
    title: '怀中玉兔',
    sub: '暗调和服 · 伦勃朗光',
    tags: ['#暗调人像', '#东方'],
    ratio: '16:9',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-falcon-01.jpg': {
    title: '白隼少年',
    sub: '酒红长袍 · 皮质猎手套',
    tags: ['#暗调人像', '#驯鹰'],
    ratio: '16:9',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
  'gen-dove-01.jpg': {
    title: '鸽与刀',
    sub: '金发少年 · 绿金织锦',
    tags: ['#暗调人像', '#戏剧感'],
    ratio: '16:9',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  },
};

/** Display order used before falling back to the project's own file order. */
export const CAMPAIGN_ORDER = Object.keys(CAMPAIGN_META);

/**
 * Metadata for a file the fixture doesn't know about — a user upload, or a
 * card produced by 再次生成 during the demo. Ratio is filled in later from the
 * image's natural size once it decodes.
 */
export function fallbackMeta(fileName: string): ImageCardMeta {
  const base = fileName.replace(/\.[^.]+$/, '');
  return {
    title: base,
    sub: '',
    tags: [],
    ratio: '3:4',
    model: DEFAULT_MODEL,
    res: DEFAULT_RES,
  };
}
