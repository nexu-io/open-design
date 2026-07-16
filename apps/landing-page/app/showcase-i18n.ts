/*
 * /showcase/ page content — localized copy + non-localized work data.
 *
 * The showcase is a curated gallery of REAL Open Design output — shipped
 * launch sites, decks, prototypes, and motion pieces — so evaluating users
 * can judge actual quality instead of feature copy (funnel: acquisition).
 *
 * Split of concerns mirrors `community-i18n.ts`:
 *   - SHOWCASE_WORKS — structural, NON-translatable facts per work (type,
 *     cover asset, hover clip, destination link, tool credit). Shared across
 *     every locale; never duplicated per language.
 *   - ShowcaseCopy   — every translatable string (page chrome + per-work
 *     title/blurb). `en` is the authoritative base; other locales are
 *     DeepPartial overrides merged over `en` via `mergeCopy`, so an
 *     untranslated string falls back to English rather than breaking.
 *
 * Cover assets live in `public/showcase/` (compressed JPEGs, all far below
 * the CI blob guard). Template-library works reference the baked preview
 * clips already published to the repo-assets CDN by the plugin-preview bake
 * pipeline — no new binaries for those.
 */
import { DEFAULT_LOCALE, type LandingLocaleCode } from './i18n';
import { pluginDetailPath } from './_lib/plugin-slug';

export type ShowcaseWorkType = 'landing' | 'prototype' | 'deck' | 'video';

export interface ShowcaseWork {
  id: string;
  type: ShowcaseWorkType;
  /** Cover image — site-relative (`/showcase/…`) or absolute CDN URL. */
  cover: string;
  /** Optional hover-play clip (repo-assets CDN mp4, baked previews). */
  hoverVideo?: string;
  /** Destination: external URL or site-relative path (localized at render). */
  href?: string;
  external?: boolean;
  /** Marks a re-creation of an existing third-party site (labeled on card). */
  replicaDemo?: boolean;
  /** Tool credit chip, non-translatable product names. */
  madeWith: string;
}

const CDN = 'https://repo-assets.open-design.ai/plugin-previews';

export const SHOWCASE_WORKS: readonly ShowcaseWork[] = [
  // ---- landing pages ------------------------------------------------------
  {
    id: 'fable5-site',
    type: 'landing',
    cover: '/showcase/fable5-site.jpg',
    href: 'https://asme-nu.vercel.app/',
    external: true,
    madeWith: 'Open Design',
  },
  {
    id: 'opendesign-y2k',
    type: 'landing',
    cover: '/showcase/opendesign-y2k.jpg',
    madeWith: 'Open Design',
  },
  {
    id: 'oryzo-replica',
    type: 'landing',
    cover: '/showcase/oryzo-replica.jpg',
    replicaDemo: true,
    madeWith: 'Open Design',
  },
  // ---- prototypes (template library, baked previews on the CDN) ----------
  {
    id: 'github-dashboard',
    type: 'prototype',
    cover: `${CDN}/example-github-dashboard.e62822fb978db2cf.poster.jpg`,
    hoverVideo: `${CDN}/example-github-dashboard.e62822fb978db2cf.mp4`,
    href: pluginDetailPath('example-github-dashboard'),
    madeWith: 'Open Design',
  },
  {
    id: 'taste-editorial',
    type: 'prototype',
    cover: `${CDN}/example-web-prototype-taste-editorial.85f9a9794adf3a99.poster.jpg`,
    hoverVideo: `${CDN}/example-web-prototype-taste-editorial.85f9a9794adf3a99.mp4`,
    href: pluginDetailPath('example-web-prototype-taste-editorial'),
    madeWith: 'Open Design',
  },
  {
    id: 'taste-brutalist',
    type: 'prototype',
    cover: `${CDN}/example-web-prototype-taste-brutalist.7430274db7d5178c.poster.jpg`,
    hoverVideo: `${CDN}/example-web-prototype-taste-brutalist.7430274db7d5178c.mp4`,
    href: pluginDetailPath('example-web-prototype-taste-brutalist'),
    madeWith: 'Open Design',
  },
  // ---- decks --------------------------------------------------------------
  {
    id: 'swiss-deck',
    type: 'deck',
    cover: `${CDN}/example-deck-swiss-international/0c869eb1a4d0d324/poster.jpg`,
    hoverVideo: `${CDN}/example-deck-swiss-international/0c869eb1a4d0d324/preview.mp4`,
    href: pluginDetailPath('example-deck-swiss-international'),
    madeWith: 'Open Design',
  },
  {
    id: 'pitch-deck',
    type: 'deck',
    cover: `${CDN}/example-html-ppt-pitch-deck/1790847524ab4667/poster.jpg`,
    hoverVideo: `${CDN}/example-html-ppt-pitch-deck/1790847524ab4667/preview.mp4`,
    href: pluginDetailPath('example-html-ppt-pitch-deck'),
    madeWith: 'Open Design',
  },
  {
    id: 'biennale-deck',
    type: 'deck',
    cover: `${CDN}/example-html-ppt-zhangzara-biennale-yellow/290a336318d001bb/poster.jpg`,
    hoverVideo: `${CDN}/example-html-ppt-zhangzara-biennale-yellow/290a336318d001bb/preview.mp4`,
    href: pluginDetailPath('example-html-ppt-zhangzara-biennale-yellow'),
    madeWith: 'Open Design',
  },
  // ---- videos (published on X; covers extracted from the clips) ----------
  {
    id: 'launch-0-10-0',
    type: 'video',
    cover: '/showcase/launch-0-10-0.jpg',
    href: 'https://x.com/i/status/2067081172878873014',
    external: true,
    madeWith: 'Hyperframes',
  },
  {
    id: 'launch-0-9-0',
    type: 'video',
    cover: '/showcase/launch-0-9-0.jpg',
    href: 'https://x.com/i/status/2062525773253157268',
    external: true,
    madeWith: 'Hyperframes',
  },
  {
    id: 'cloud-fable5',
    type: 'video',
    cover: '/showcase/cloud-fable5.jpg',
    href: 'https://x.com/i/status/2072611730870394911',
    external: true,
    madeWith: 'Seedance 2.0',
  },
  {
    id: 'event-shanghai',
    type: 'video',
    cover: '/showcase/event-shanghai.jpg',
    href: 'https://x.com/i/status/2072932345636626898',
    external: true,
    madeWith: 'Hyperframes',
  },
  {
    id: 'event-osaka',
    type: 'video',
    cover: '/showcase/event-osaka.jpg',
    href: 'https://x.com/i/status/2071859129895780445',
    external: true,
    madeWith: 'Hyperframes',
  },
] as const;

interface WorkCopy {
  title: string;
  blurb: string;
}

export interface ShowcaseCopy {
  meta: { title: string; description: string };
  hero: { label: string; title: string; lead: string };
  filters: { all: string } & Record<ShowcaseWorkType, string>;
  card: {
    replicaBadge: string;
    madeWith: (tool: string) => string;
    viewLive: string;
    viewOnX: string;
    viewTemplate: string;
  };
  works: Record<string, WorkCopy>;
  figma: {
    label: string;
    title: string;
    items: { title: string; body: string }[];
    compareCta: string;
  };
}

const en: ShowcaseCopy = {
  meta: {
    title: 'Showcase — real work generated with Open Design',
    description:
      'A curated gallery of real output — launch sites, prototypes, decks, and motion pieces generated with Open Design. Judge the quality yourself.',
  },
  hero: {
    label: 'Showcase',
    title: 'Real work, generated with Open Design.',
    lead: 'Not mockups — shipped launch sites, working prototypes, presentation decks, and published motion pieces. Filter by type and judge the output quality yourself.',
  },
  filters: {
    all: 'All',
    landing: 'Landing pages',
    prototype: 'Prototypes',
    deck: 'Decks',
    video: 'Videos',
  },
  card: {
    replicaBadge: 'Website replica demo',
    madeWith: (tool: string) => `Made with ${tool}`,
    viewLive: 'View live site',
    viewOnX: 'Watch on X',
    viewTemplate: 'Open as template',
  },
  works: {
    'fable5-site': {
      title: 'Claude Fable 5 — model intro site',
      blurb: 'A complete model-introduction site — hero, capabilities, pricing — one-shotted and shipped live.',
    },
    'opendesign-y2k': {
      title: 'Open Design — Y2K brand page',
      blurb: 'Sticker-collage Y2K brand statement with liquid 3D type, generated as one self-contained HTML file.',
    },
    'oryzo-replica': {
      title: 'Oryzo product page',
      blurb: 'A faithful re-creation of an award-winning product page, demonstrating web-replication fidelity. Original design by Lusion.',
    },
    'github-dashboard': {
      title: 'GitHub analytics dashboard',
      blurb: 'Repository analytics prototype — stars, forks, contributors, issues — rendered as a working page.',
    },
    'taste-editorial': {
      title: 'Editorial-minimalist prototype',
      blurb: 'Warm monochrome canvas and serif display type; a web prototype with a strong editorial voice.',
    },
    'taste-brutalist': {
      title: 'Brutalist print prototype',
      blurb: 'Swiss industrial-print treatment — newsprint canvas, monolithic black type — as a web prototype.',
    },
    'swiss-deck': {
      title: 'Swiss International deck',
      blurb: '16-column grid, one saturated accent, 22 locked layouts — a full presentation system.',
    },
    'pitch-deck': {
      title: 'Investor pitch deck',
      blurb: 'Investor-ready 10-slide HTML pitch deck with a white + blue→purple gradient system.',
    },
    'biennale-deck': {
      title: 'Biennale Yellow deck',
      blurb: 'Solar yellow on warm parchment with deep indigo serifs — an art-book deck treatment.',
    },
    'launch-0-10-0': {
      title: 'Open Design 0.10.0 launch film',
      blurb: '“From prompts to design loops.” The 0.10.0 release film, authored end-to-end in Hyperframes.',
    },
    'launch-0-9-0': {
      title: 'Open Design 0.9.0 launch film',
      blurb: '“Bring any model. Run any agent.” The 0.9.0 release film, authored in Hyperframes.',
    },
    'cloud-fable5': {
      title: 'Open Design Cloud × Claude Fable 5',
      blurb: 'Partnership announcement film for Claude Fable 5 on Open Design Cloud, generated with Seedance 2.0.',
    },
    'event-shanghai': {
      title: 'Shanghai meetup teaser',
      blurb: 'Event teaser for the Shanghai community meetup — dot-matrix globe and all — built in Hyperframes.',
    },
    'event-osaka': {
      title: 'Osaka / Kyoto meetup teaser',
      blurb: 'Event teaser for the Osaka / Kyoto hands-on meetup, built in Hyperframes.',
    },
  },
  figma: {
    label: 'Why it looks different',
    title: 'What you just saw is real output — not artboards.',
    items: [
      {
        title: 'Ships as real code',
        body: 'Every piece above is HTML/CSS/JS you can open, host, and iterate on — not a canvas that still needs a handoff.',
      },
      {
        title: 'Any model, any agent',
        body: 'Generated by the coding agents and models you already use; Open Design orchestrates them into design work.',
      },
      {
        title: 'Open source, self-hostable',
        body: 'The engine behind these works is open source. Run it locally, keep your work on your machine.',
      },
      {
        title: 'Systems, not one-offs',
        body: 'Decks and prototypes come from reusable templates and design systems — fork one and make it yours.',
      },
    ],
    compareCta: 'See how Open Design compares',
  },
};

const zhCN: DeepPartial<ShowcaseCopy> = {
  meta: {
    title: '作品展示 — 用 Open Design 生成的真实作品',
    description:
      '精选真实产出画廊 — 用 Open Design 生成的发布站点、原型、演示 deck 与动效视频。质量如何，自己判断。',
  },
  hero: {
    label: '作品展示',
    title: '真实作品，由 Open Design 生成。',
    lead: '不是效果图 — 是已上线的发布站点、可交互的原型、演示 deck 和已发布的动效视频。按类型筛选，自己判断产出质量。',
  },
  filters: { all: '全部', landing: '落地页', prototype: '原型', deck: '演示 Deck', video: '视频' },
  card: {
    replicaBadge: '网站复刻能力演示',
    madeWith: (tool: string) => `使用 ${tool} 制作`,
    viewLive: '访问站点',
    viewOnX: '在 X 观看',
    viewTemplate: '作为模板打开',
  },
  works: {
    'fable5-site': {
      title: 'Claude Fable 5 模型介绍站',
      blurb: '完整的模型介绍网站 — hero、能力、定价 — 一次生成并已上线。',
    },
    'opendesign-y2k': {
      title: 'Open Design Y2K 品牌页',
      blurb: '贴纸拼贴 Y2K 风格的品牌宣言页，液态 3D 字体，单个自包含 HTML 文件生成。',
    },
    'oryzo-replica': {
      title: 'Oryzo 产品页',
      blurb: '对获奖产品页的高保真复刻，演示网站复刻能力。原始设计来自 Lusion。',
    },
    'github-dashboard': {
      title: 'GitHub 数据仪表盘',
      blurb: '仓库分析原型 — star、fork、贡献者、issue — 渲染为可用页面。',
    },
    'taste-editorial': {
      title: '杂志编辑风原型',
      blurb: '暖色单色画布与衬线大标题；带强烈编辑气质的网页原型。',
    },
    'taste-brutalist': {
      title: '粗野主义印刷原型',
      blurb: '瑞士工业印刷处理 — 新闻纸底、黑色巨型字 — 的网页原型。',
    },
    'swiss-deck': {
      title: '瑞士国际主义 Deck',
      blurb: '16 列网格、单一饱和强调色、22 个锁定版式 — 一套完整演示系统。',
    },
    'pitch-deck': {
      title: '投资人路演 Deck',
      blurb: '面向投资人的 10 页 HTML 路演 deck，白底 + 蓝紫渐变体系。',
    },
    'biennale-deck': {
      title: '双年展黄 Deck',
      blurb: '暖羊皮纸上的太阳黄与深靛蓝衬线 — 艺术书式 deck 处理。',
    },
    'launch-0-10-0': {
      title: 'Open Design 0.10.0 发布片',
      blurb: '「From prompts to design loops.」0.10.0 版本发布片，全程用 Hyperframes 制作。',
    },
    'launch-0-9-0': {
      title: 'Open Design 0.9.0 发布片',
      blurb: '「Bring any model. Run any agent.」0.9.0 版本发布片，用 Hyperframes 制作。',
    },
    'cloud-fable5': {
      title: 'Open Design Cloud × Claude Fable 5',
      blurb: 'Claude Fable 5 登陆 Open Design Cloud 的合作宣传片，用 Seedance 2.0 生成。',
    },
    'event-shanghai': {
      title: '上海线下活动预告',
      blurb: '上海社区 meetup 活动预告片 — 含点阵地球 — 用 Hyperframes 制作。',
    },
    'event-osaka': {
      title: '大阪 / 京都活动预告',
      blurb: '大阪 / 京都动手工作坊的活动预告片，用 Hyperframes 制作。',
    },
  },
  figma: {
    label: '为什么不一样',
    title: '你刚看到的是真实产出 — 不是画板。',
    items: [
      { title: '产出即真实代码', body: '上面每件作品都是可打开、可托管、可继续迭代的 HTML/CSS/JS — 不是还需要交付流程的画布。' },
      { title: '任意模型、任意 agent', body: '由你已在用的编码 agent 和模型生成；Open Design 把它们编排成设计工作。' },
      { title: '开源、可自部署', body: '这些作品背后的引擎是开源的。本地运行，作品留在你自己的机器上。' },
      { title: '系统化而非一次性', body: 'Deck 和原型来自可复用的模板与设计系统 — fork 一份改成你自己的。' },
    ],
    compareCta: '看 Open Design 的对比优势',
  },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends (...args: never[]) => unknown
      ? T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};

/** Deep-merge a locale override over the English base; arrays replace wholesale. */
function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = out[key];
    if (
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue) &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value !== 'function'
    ) {
      out[key] = mergeCopy(baseValue, value as DeepPartial<typeof baseValue>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

const OVERRIDES: Partial<Record<LandingLocaleCode, DeepPartial<ShowcaseCopy>>> = {
  zh: zhCN,
};

export function getShowcaseCopy(locale: LandingLocaleCode = DEFAULT_LOCALE): ShowcaseCopy {
  return mergeCopy(en, OVERRIDES[locale]);
}
