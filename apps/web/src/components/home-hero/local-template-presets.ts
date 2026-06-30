import type { Locale } from '../../i18n/types';

export type LocalTemplatePresetChipId = 'social-card' | 'diagram';

// ------------------------------------------------------------------
// Preview specs
//
// Each preset carries a small declarative `preview` spec instead of a
// single opaque "variant". A spec is a (layout skeleton x palette) pair —
// the same model the reference skills use: guizang-social-card-skill ships
// 28 layout skeletons rendered across a handful of color themes, and
// fireworks-tech-graph ships one diagram per category across 8 visual
// styles. Splitting layout from palette lets a dozen skeletons produce
// dozens of distinct, on-brand thumbnails without one bespoke render
// branch per card. `TemplatePreview.tsx` interprets these specs.
// ------------------------------------------------------------------

// Social card layout skeletons (rendered as crisp HTML/flex mockups).
export type SocialPreviewLayout =
  | 'post' // single platform post: avatar + name + body + engagement
  | 'metric' // hero number with caption + sparkline
  | 'chart' // title + bar chart announcement
  | 'thread-strip' // numbered connected card strip
  | 'editorial-carousel' // magazine 3:4 swipe (Monocle / Kinfolk / Cereal)
  | 'swiss-carousel' // grid cards, single anchor color, extreme type contrast
  | 'cover' // image-led big-title cover
  | 'wechat-pair' // 21:9 header + 1:1 share card
  | 'story' // 9:16 vertical launch frame
  | 'poll' // 9:16 interactive poll sticker
  | 'quote' // serif pull-quote card
  | 'framework' // numbered framework / checklist
  | 'photo-grid' // casual 2x2 photo dump
  | 'thumbnail' // 16:9 YouTube-style cover with bold title + face
  | 'poster'; // full-bleed dramatic quote poster

// Editorial + swiss color themes and per-platform brand tints.
export type SocialPalette =
  | 'x' // near-black ink, electric-blue spark
  | 'ink' // editorial ink-on-cream (default editorial)
  | 'kraft' // warm paper / heritage
  | 'dune' // sand / art-design
  | 'linkedin' // LinkedIn blue
  | 'klein' // IKB Klein blue (swiss)
  | 'instagram' // warm IG gradient
  | 'safety' // safety orange (swiss)
  | 'rednote' // Xiaohongshu red
  | 'forest' // forest ink (nature)
  | 'wechat' // WeChat green
  | 'indigo' // indigo porcelain (tech/research)
  | 'midnight' // midnight ink + champagne gold
  | 'reddit' // Reddit orange
  | 'youtube' // YouTube red
  | 'facebook' // Facebook blue
  | 'producthunt' // Product Hunt orange-red
  | 'spotify'; // Spotify green on near-black

// Diagram layout skeletons (rendered as SVG, 248x150).
export type DiagramPreviewLayout =
  | 'architecture' // layered client -> gateway -> services -> store
  | 'swimlane' // role lanes + stages + decision
  | 'agent-loop' // hexagon agent + LLM + tools + loop
  | 'rag' // ingest -> embed -> vector store -> retrieve -> rerank
  | 'sequence' // UML lifelines + zig-zag messages
  | 'class' // UML class boxes + inheritance
  | 'pipeline' // left-to-right flow with branch
  | 'lineage' // DAG with converging/diverging edges
  | 'matrix' // comparison grid
  | 'before-after' // split before | after panel
  | 'quadrant' // 2x2 two-axis positioning
  | 'mesh' // multi-agent ring + coordinator
  | 'state' // state-machine circles + transitions
  | 'mindmap' // central root + radiating branches
  | 'timeline'; // horizontal axis + alternating milestones

// Diagram visual styles (fireworks-tech-graph). Mostly light surfaces plus
// the two canonical dark showcases (blueprint, dark-terminal).
export type DiagramPalette =
  | 'flat' // white, helvetica, product-doc friendly
  | 'notion' // minimal white, single accent
  | 'claude' // warm cream, restrained Anthropic palette
  | 'openai' // pure white, clean modern
  | 'blueprint' // deep blue grid + cyan strokes (dark showcase)
  | 'terminal'; // dark terminal chrome + neon (dark showcase)

export interface SocialPreviewSpec {
  kind: 'social';
  layout: SocialPreviewLayout;
  palette: SocialPalette;
}

export interface DiagramPreviewSpec {
  kind: 'diagram';
  layout: DiagramPreviewLayout;
  palette: DiagramPalette;
}

export type PreviewSpec = SocialPreviewSpec | DiagramPreviewSpec;

export interface LocalTemplatePreset {
  id: string;
  chipId: LocalTemplatePresetChipId;
  subcategorySlug: string;
  title: string;
  description: string;
  promptText: string;
  preview: PreviewSpec;
}

interface LocalizedPresetSource {
  id: string;
  chipId: LocalTemplatePresetChipId;
  subcategorySlug: string;
  preview: PreviewSpec;
  title: LocalizedPresetCopy;
  description: LocalizedPresetCopy;
  promptText: LocalizedPresetCopy;
}

interface LocalizedPresetCopy {
  en: string;
  zh: string;
  zhTW?: string;
}

// Order matters: it is the display order inside the "All" rail. Per the
// brief, overseas-facing social categories (X, Threads, LinkedIn,
// Instagram) lead; domestic categories (Xiaohongshu, WeChat) follow.
const PRESET_SOURCES: LocalizedPresetSource[] = [
  // ============================ SOCIAL ============================
  // ---- Twitter / X (overseas) ----
  {
    id: 'social-x-founder-update',
    chipId: 'social-card',
    subcategorySlug: 'x-twitter-card',
    preview: { kind: 'social', layout: 'post', palette: 'x' },
    title: { en: 'X Founder Update', zh: 'X 创始人更新' },
    description: { en: 'Metric, lesson, next step', zh: '指标 · 经验 · 下一步' },
    promptText: {
      en: 'Create an X founder-update post card from this note: avatar + handle header, one sharp metric, a one-line lesson, and a crisp next-step CTA. Near-black ink on white, electric-blue accent, screenshot-ready 16:9.',
      zh: '把这段笔记做成 X 创始人更新帖卡片：头像 + 账号头部、一个关键指标、一句经验和一个清晰的下一步 CTA。白底近黑字、电光蓝强调色，输出适合时间线的 16:9。',
    },
  },
  {
    id: 'social-x-data-drop',
    chipId: 'social-card',
    subcategorySlug: 'x-twitter-card',
    preview: { kind: 'social', layout: 'chart', palette: 'x' },
    title: { en: 'X Data Drop', zh: 'X 数据卡' },
    description: { en: 'Chart-led announcement', zh: '图表先行公告' },
    promptText: {
      en: 'Turn this number into an X data-drop card: bold headline, a clean bar chart with one highlighted bar, and a single takeaway line. White surface, one accent color, generous whitespace.',
      zh: '把这个数据做成 X 数据卡：醒目标题、干净的柱状图（高亮一根）、一句结论。白底、单一强调色、留白充足。',
    },
  },
  {
    id: 'social-x-hot-take',
    chipId: 'social-card',
    subcategorySlug: 'x-twitter-card',
    preview: { kind: 'social', layout: 'quote', palette: 'x' },
    title: { en: 'X Hot Take', zh: 'X 观点卡' },
    description: { en: 'Bold one-liner card', zh: '一句话强观点' },
    promptText: {
      en: 'Design a punchy X opinion card around this hot take: one big typographic statement, oversized quote mark, and a small attribution. Restrained palette, extreme type contrast.',
      zh: '围绕这个观点做一张有冲击力的 X 观点卡：一句放大的排版主张、超大引号和小字署名。克制配色、极致字号对比。',
    },
  },
  {
    id: 'social-x-thread-recap',
    chipId: 'social-card',
    subcategorySlug: 'x-twitter-card',
    preview: { kind: 'social', layout: 'thread-strip', palette: 'x' },
    title: { en: 'X Thread Recap', zh: 'X 长帖串图' },
    description: { en: 'Numbered recap strip', zh: '编号串联组图' },
    promptText: {
      en: 'Create a numbered X thread recap as a 4-card strip: each card has an index badge, a tight headline, and a supporting line, visually connected like a thread. Clean ink-on-white.',
      zh: '把这条 X 长帖做成 4 张编号串图：每张有序号徽标、紧凑标题和一句支撑文案，视觉上像一条线串起来。干净的白底黑字。',
    },
  },
  // ---- Threads (overseas) ----
  {
    id: 'social-thread-launch',
    chipId: 'social-card',
    subcategorySlug: 'threads-card',
    preview: { kind: 'social', layout: 'thread-strip', palette: 'ink' },
    title: { en: 'Thread Launch Set', zh: 'Threads 发布组图' },
    description: { en: 'Hook, proof, takeaway', zh: 'Hook · 证据 · 结论' },
    promptText: {
      en: 'Create a launch card set for Threads: hook card, proof card, product card, and takeaway CTA. Conversational tone, easy to scan, editorial ink-on-cream.',
      zh: '做一套 Threads 发布组图：hook 卡、证据卡、产品卡和结论 CTA。语气像对话、易扫读，编辑感的米底墨字。',
    },
  },
  {
    id: 'social-thread-photo-dump',
    chipId: 'social-card',
    subcategorySlug: 'threads-card',
    preview: { kind: 'social', layout: 'photo-grid', palette: 'ink' },
    title: { en: 'Threads Photo Dump', zh: 'Threads 随手组图' },
    description: { en: 'Casual 4-up grid', zh: '随性四宫格' },
    promptText: {
      en: 'Lay out a casual Threads photo dump: a relaxed 2x2 grid with one hero tile, soft rounded corners, and a short caption strip. Warm, unpolished-on-purpose editorial feel.',
      zh: '做一组随性的 Threads 图文：2x2 网格、其中一格为主图，圆角柔和，加一条短说明。温暖、刻意松弛的编辑感。',
    },
  },
  {
    id: 'social-thread-quote',
    chipId: 'social-card',
    subcategorySlug: 'threads-card',
    preview: { kind: 'social', layout: 'quote', palette: 'kraft' },
    title: { en: 'Threads Quote', zh: 'Threads 金句卡' },
    description: { en: 'Serif pull-quote', zh: '衬线金句卡' },
    promptText: {
      en: 'Design a serif pull-quote card for Threads from this line: large Playfair-style quote, a thin rule, and an attribution. Kraft-paper warmth, generous margins.',
      zh: '把这句话做成 Threads 衬线金句卡：放大的 Playfair 风格引文、一条细分割线和署名。牛皮纸般的暖色、宽裕留白。',
    },
  },
  {
    id: 'social-thread-carousel',
    chipId: 'social-card',
    subcategorySlug: 'threads-card',
    preview: { kind: 'social', layout: 'editorial-carousel', palette: 'dune' },
    title: { en: 'Threads Carousel', zh: 'Threads 编辑组图' },
    description: { en: 'Soft editorial swipe', zh: '柔和编辑轮播' },
    promptText: {
      en: 'Create a soft editorial Threads carousel: image-led cover, two narrative cards, and a closing card. Restrained magazine layout inspired by Cereal, sand palette, serif headings.',
      zh: '做一套柔和的 Threads 编辑轮播：图片主导封面、两张叙事卡和一张收尾卡。参考 Cereal 的克制版式、沙色调、衬线标题。',
    },
  },
  // ---- LinkedIn (overseas) ----
  {
    id: 'social-linkedin-insight',
    chipId: 'social-card',
    subcategorySlug: 'linkedin-card',
    preview: { kind: 'social', layout: 'metric', palette: 'linkedin' },
    title: { en: 'LinkedIn Insight', zh: 'LinkedIn 洞察卡' },
    description: { en: 'B2B metric narrative', zh: 'B2B 指标叙事' },
    promptText: {
      en: 'Design a LinkedIn thought-leadership card: a strong claim, one hero statistic, a small supporting sparkline, and executive-readable hierarchy. LinkedIn blue accent on white.',
      zh: '设计一张 LinkedIn 思想领导力卡片：强主张、一个核心数据、一条小趋势线，以及适合管理层快速阅读的层级。白底 + LinkedIn 蓝强调色。',
    },
  },
  {
    id: 'social-linkedin-carousel',
    chipId: 'social-card',
    subcategorySlug: 'linkedin-card',
    preview: { kind: 'social', layout: 'swiss-carousel', palette: 'linkedin' },
    title: { en: 'LinkedIn Carousel', zh: 'LinkedIn 文档轮播' },
    description: { en: 'Document swipe deck', zh: '文档式滑动卡' },
    promptText: {
      en: 'Create a LinkedIn document carousel (swipe deck): cover, three structured insight pages with one anchor color and grid typography, and a CTA page. Swiss, high contrast, 4:5.',
      zh: '做一套 LinkedIn 文档轮播（可滑动）：封面、三页结构化洞察（单一强调色 + 网格排版）和一页 CTA。瑞士风、高对比、4:5。',
    },
  },
  {
    id: 'social-linkedin-framework',
    chipId: 'social-card',
    subcategorySlug: 'linkedin-card',
    preview: { kind: 'social', layout: 'framework', palette: 'linkedin' },
    title: { en: 'LinkedIn Framework', zh: 'LinkedIn 框架卡' },
    description: { en: 'Numbered framework', zh: '编号方法论' },
    promptText: {
      en: 'Turn this method into a LinkedIn framework card: a titled list of numbered steps, each with a short label, clean dividers, and a memorable name. Professional, scannable.',
      zh: '把这个方法做成 LinkedIn 框架卡：带标题的编号步骤列表，每步一个短标签、干净的分隔线和一个好记的名字。专业、易扫读。',
    },
  },
  {
    id: 'social-linkedin-chart',
    chipId: 'social-card',
    subcategorySlug: 'linkedin-card',
    preview: { kind: 'social', layout: 'chart', palette: 'klein' },
    title: { en: 'LinkedIn Data Story', zh: 'LinkedIn 数据故事' },
    description: { en: 'Trend in one chart', zh: '一图讲趋势' },
    promptText: {
      en: 'Create a LinkedIn data-story card: a headline claim, one clean chart that proves it, and a one-line interpretation. Klein-blue anchor, ample whitespace, exec-friendly.',
      zh: '做一张 LinkedIn 数据故事卡：一句主张、一张证明它的干净图表、一句解读。克莱因蓝锚定色、留白充足、适合管理层。',
    },
  },
  // ---- Instagram story (overseas) ----
  {
    id: 'social-story-countdown',
    chipId: 'social-card',
    subcategorySlug: 'instagram-story',
    preview: { kind: 'social', layout: 'story', palette: 'instagram' },
    title: { en: 'Story Countdown', zh: 'Story 倒计时' },
    description: { en: '9:16 launch sequence', zh: '9:16 发布序列' },
    promptText: {
      en: 'Create a 9:16 Instagram story for this launch: progress segments, a big countdown number, a benefit line, and a swipe-up CTA. Warm IG gradient, one consistent accent.',
      zh: '为这次发布做一张 9:16 Instagram story：顶部进度条、放大的倒计时数字、一句卖点和 swipe-up CTA。暖色 IG 渐变、统一强调色。',
    },
  },
  {
    id: 'social-story-poll',
    chipId: 'social-card',
    subcategorySlug: 'instagram-story',
    preview: { kind: 'social', layout: 'poll', palette: 'safety' },
    title: { en: 'Story Poll', zh: 'Story 投票贴' },
    description: { en: 'Interactive sticker', zh: '互动投票贴纸' },
    promptText: {
      en: 'Design a 9:16 Instagram story poll: a clear question, a two-option poll sticker with a split bar, and a playful prompt to vote. Safety-orange anchor, bold sans type.',
      zh: '设计一张 9:16 Instagram story 投票贴：清晰问题、带分隔条的双选项投票贴纸和俏皮的投票引导。安全橙锚定色、粗体无衬线。',
    },
  },
  {
    id: 'social-story-quote',
    chipId: 'social-card',
    subcategorySlug: 'instagram-story',
    preview: { kind: 'social', layout: 'quote', palette: 'dune' },
    title: { en: 'Story Quote', zh: 'Story 金句' },
    description: { en: 'Full-bleed type', zh: '满版排版' },
    promptText: {
      en: 'Create a full-bleed 9:16 Instagram story quote: centered serif statement, oversized quote mark, and a small handle. Sand palette, lots of breathing room.',
      zh: '做一张满版 9:16 Instagram story 金句：居中的衬线主张、超大引号和一个小账号名。沙色调、充足呼吸感。',
    },
  },
  {
    id: 'social-story-reveal',
    chipId: 'social-card',
    subcategorySlug: 'instagram-story',
    preview: { kind: 'social', layout: 'cover', palette: 'instagram' },
    title: { en: 'Story Reveal', zh: 'Story 揭晓卡' },
    description: { en: 'Product reveal', zh: '产品揭晓' },
    promptText: {
      en: 'Create a 9:16 product-reveal story: a full-bleed product image, a bold title band, a one-line benefit, and a page indicator. Warm gradient, high-impact crop.',
      zh: '做一张 9:16 产品揭晓 story：满版产品图、醒目标题带、一句卖点和页码指示。暖色渐变、强冲击力裁切。',
    },
  },
  // ---- Xiaohongshu / Rednote (domestic) ----
  {
    id: 'social-editorial-xhs',
    chipId: 'social-card',
    subcategorySlug: 'xiaohongshu-carousel',
    preview: { kind: 'social', layout: 'editorial-carousel', palette: 'ink' },
    title: { en: 'Editorial Rednote', zh: '杂志风小红书' },
    description: { en: '3:4 editorial carousel', zh: '3:4 图文组图' },
    promptText: {
      en: 'Create a Rednote / Xiaohongshu 3:4 editorial carousel: image-led cover, three value cards, a comparison card, and a save-worthy checklist. Restrained magazine layout inspired by Monocle / Kinfolk / Cereal.',
      zh: '把笔记做成小红书 3:4 杂志风图文组图：图片主导封面、三张价值卡、一张对比卡和一张值得收藏的 checklist。版式参考 Monocle / Kinfolk / Cereal 的克制编辑感。',
    },
  },
  {
    id: 'social-swiss-product-review',
    chipId: 'social-card',
    subcategorySlug: 'xiaohongshu-carousel',
    preview: { kind: 'social', layout: 'swiss-carousel', palette: 'klein' },
    title: { en: 'Swiss Review Cards', zh: '瑞士风测评卡' },
    description: { en: 'KPI, matrix, before-after', zh: 'KPI · 矩阵 · 对比' },
    promptText: {
      en: 'Turn this product review into a Swiss-style Rednote carousel: one accent color, grid typography, a KPI tower, a before-after card, a matrix card, and a recommendation. Export-ready 1080x1440.',
      zh: '把这份测评做成瑞士风小红书轮播：单一强调色、网格排版、KPI Tower、前后对比卡、矩阵卡和最终推荐。输出 1080x1440。',
    },
  },
  {
    id: 'social-rednote-cover',
    chipId: 'social-card',
    subcategorySlug: 'xiaohongshu-carousel',
    preview: { kind: 'social', layout: 'cover', palette: 'rednote' },
    title: { en: 'Rednote Cover', zh: '小红书封面' },
    description: { en: 'Image-led big title', zh: '图片大标题封面' },
    promptText: {
      en: 'Design a scroll-stopping Rednote cover: a full-bleed image, an oversized title with a highlighted keyword, a short hook, and a 1/6 page indicator. Bold, saturated, mobile-first 3:4.',
      zh: '设计一张让人停下滑动的小红书封面：满版图片、放大标题（高亮一个关键词）、一句钩子和 1/6 页码。大胆、饱和、移动优先 3:4。',
    },
  },
  {
    id: 'social-rednote-checklist',
    chipId: 'social-card',
    subcategorySlug: 'xiaohongshu-carousel',
    preview: { kind: 'social', layout: 'framework', palette: 'forest' },
    title: { en: 'Rednote Checklist', zh: '小红书清单' },
    description: { en: 'Save-worthy checklist', zh: '值得收藏清单' },
    promptText: {
      en: 'Create a save-worthy Rednote checklist card: a clear title, numbered items with checkable markers, soft dividers, and a "save this" nudge. Calm forest palette, friendly type.',
      zh: '做一张值得收藏的小红书清单卡：清晰标题、可勾选的编号条目、柔和分隔线和一句“记得收藏”。沉静的森林色、亲切字体。',
    },
  },
  // ---- WeChat cover (domestic) ----
  {
    id: 'social-wechat-cover-pair',
    chipId: 'social-card',
    subcategorySlug: 'wechat-cover',
    preview: { kind: 'social', layout: 'wechat-pair', palette: 'wechat' },
    title: { en: 'WeChat Cover Pair', zh: '公众号封面对' },
    description: { en: '21:9 header + 1:1 share', zh: '21:9 头图 + 1:1 分享' },
    promptText: {
      en: 'Create a WeChat article cover pair: a 21:9 header plus a matching 1:1 share card with consistent typography, image treatment, and title hierarchy. Mobile-readable crop.',
      zh: '做一套公众号封面对：21:9 头图 + 配套 1:1 分享卡，字体、图像处理和标题层级一致，并保证手机裁切可读。',
    },
  },
  {
    id: 'social-wechat-banner',
    chipId: 'social-card',
    subcategorySlug: 'wechat-cover',
    preview: { kind: 'social', layout: 'cover', palette: 'indigo' },
    title: { en: 'WeChat Article Banner', zh: '公众号头图' },
    description: { en: '2.35:1 article banner', zh: '2.35:1 文章头图' },
    promptText: {
      en: 'Design a 2.35:1 WeChat article banner: a calm indigo-porcelain background, a confident serif title, a thin accent rule, and a tasteful author byline. Research / tech editorial feel.',
      zh: '设计一张 2.35:1 公众号文章头图：沉静的靛蓝瓷色背景、自信的衬线标题、一条细强调线和雅致的作者署名。研究 / 科技编辑感。',
    },
  },
  {
    id: 'social-wechat-knowledge',
    chipId: 'social-card',
    subcategorySlug: 'wechat-cover',
    preview: { kind: 'social', layout: 'swiss-carousel', palette: 'forest' },
    title: { en: 'WeChat Knowledge Card', zh: '公众号知识卡' },
    description: { en: 'Structured explainer', zh: '结构化科普卡' },
    promptText: {
      en: 'Turn this explainer into a structured WeChat knowledge card set: a definition card, a how-it-works card, and a takeaway card with grid typography and one calm anchor color.',
      zh: '把这段科普做成结构化的公众号知识卡组：定义卡、原理卡和结论卡，网格排版 + 一个沉静的锚定色。',
    },
  },
  {
    id: 'social-wechat-quote',
    chipId: 'social-card',
    subcategorySlug: 'wechat-cover',
    preview: { kind: 'social', layout: 'quote', palette: 'midnight' },
    title: { en: 'WeChat Quote Cover', zh: '公众号金句封面' },
    description: { en: 'Gold-accent quote', zh: '烫金金句封面' },
    promptText: {
      en: 'Create a premium WeChat quote cover: a deep midnight-ink ground, a serif pull-quote, an oversized quote mark in champagne gold, and a refined byline. Editorial, high-end.',
      zh: '做一张高级感的公众号金句封面：深墨夜底色、衬线金句、香槟金的超大引号和雅致署名。编辑感、高端。',
    },
  },

  // ---- Reddit (overflow) ----
  {
    id: 'social-reddit-post',
    chipId: 'social-card',
    subcategorySlug: 'reddit-card',
    preview: { kind: 'social', layout: 'post', palette: 'reddit' },
    title: { en: 'Reddit Post Card', zh: 'Reddit 帖子卡' },
    description: { en: 'Subreddit + upvotes', zh: '版块 + 点赞数' },
    promptText: {
      en: 'Turn this into a realistic Reddit post card: subreddit + author header, a punchy title, a short body, and an upvote / comment bar with real-looking counts. Reddit-orange accent, light surface.',
      zh: '把内容做成拟真 Reddit 帖子卡：版块 + 作者头部、有冲击力的标题、一段正文，以及带真实感数据的点赞 / 评论栏。Reddit 橙强调色、浅色背景。',
    },
  },
  {
    id: 'social-reddit-thread',
    chipId: 'social-card',
    subcategorySlug: 'reddit-card',
    preview: { kind: 'social', layout: 'thread-strip', palette: 'reddit' },
    title: { en: 'Reddit Recap', zh: 'Reddit 串楼' },
    description: { en: 'Top comments strip', zh: '热评串图' },
    promptText: {
      en: 'Create a Reddit comment-recap strip: the original post on top, then 3 highlighted top comments as connected cards with upvote chips. Reddit-orange accent, clean and scannable.',
      zh: '做一组 Reddit 热评串图：顶部是原帖，下面 3 条高赞评论做成串联卡片，带点赞徽标。Reddit 橙强调色、干净易扫读。',
    },
  },
  // ---- YouTube thumbnail (overflow) ----
  {
    id: 'social-youtube-thumb',
    chipId: 'social-card',
    subcategorySlug: 'youtube-thumbnail',
    preview: { kind: 'social', layout: 'thumbnail', palette: 'youtube' },
    title: { en: 'YouTube Thumbnail', zh: 'YouTube 封面' },
    description: { en: '16:9 high-CTR cover', zh: '16:9 高点击封面' },
    promptText: {
      en: 'Design a high-CTR 16:9 YouTube thumbnail: a bold 3-4 word title with a highlighted keyword, a strong subject crop area, an arrow or circle callout, and high contrast. Punchy, readable at small size.',
      zh: '设计一张高点击率的 16:9 YouTube 封面：3-4 个字的醒目标题（高亮一个关键词）、突出的主体区域、箭头或圈选标注，高对比度。有冲击力、缩略也清晰。',
    },
  },
  {
    id: 'social-youtube-metric',
    chipId: 'social-card',
    subcategorySlug: 'youtube-thumbnail',
    preview: { kind: 'social', layout: 'thumbnail', palette: 'instagram' },
    title: { en: 'YouTube Milestone', zh: 'YouTube 里程碑' },
    description: { en: 'Subscriber / view stat', zh: '订阅 / 播放数据' },
    promptText: {
      en: 'Create a YouTube milestone card: one hero number (subscribers or views), a short caption, and a small growth sparkline. Red accent, bold sans, screenshot-ready 16:9.',
      zh: '做一张 YouTube 里程碑卡：一个核心数字（订阅或播放量）、一句说明和一条小增长趋势线。红色强调色、粗体无衬线、16:9 截图可用。',
    },
  },
  // ---- Facebook (overflow) ----
  {
    id: 'social-facebook-post',
    chipId: 'social-card',
    subcategorySlug: 'facebook-card',
    preview: { kind: 'social', layout: 'post', palette: 'facebook' },
    title: { en: 'Facebook Post Card', zh: 'Facebook 帖子卡' },
    description: { en: 'Page update + reactions', zh: '主页更新 + 互动' },
    promptText: {
      en: 'Turn this into a realistic Facebook post card: page avatar + name header, an update body, and a reactions / comments / shares bar with real-looking counts. Facebook-blue accent, white surface.',
      zh: '把内容做成拟真 Facebook 帖子卡：主页头像 + 名称头部、一段更新正文，以及带真实感数据的表情 / 评论 / 分享栏。Facebook 蓝强调色、白色背景。',
    },
  },
  {
    id: 'social-facebook-event',
    chipId: 'social-card',
    subcategorySlug: 'facebook-card',
    preview: { kind: 'social', layout: 'cover', palette: 'facebook' },
    title: { en: 'Facebook Event Cover', zh: 'Facebook 活动封面' },
    description: { en: 'Date, place, hook', zh: '时间 · 地点 · 钩子' },
    promptText: {
      en: 'Design a Facebook event cover: a bold title, the date and place, a one-line hook, and an RSVP affordance. Facebook-blue accent, image-led, mobile-readable crop.',
      zh: '设计一张 Facebook 活动封面：醒目标题、时间地点、一句钩子和报名提示。Facebook 蓝强调色、图片主导、手机裁切可读。',
    },
  },
  // ---- Product Hunt (overflow) ----
  {
    id: 'social-producthunt-launch',
    chipId: 'social-card',
    subcategorySlug: 'product-hunt-card',
    preview: { kind: 'social', layout: 'metric', palette: 'producthunt' },
    title: { en: 'Product Hunt Launch', zh: 'Product Hunt 发布' },
    description: { en: 'Upvotes + #1 badge', zh: '点赞 + 第一徽标' },
    promptText: {
      en: 'Create a Product Hunt launch card: product name + tagline, a big upvote number, a "#1 Product of the Day" badge, and a maker line. Product-Hunt orange accent, clean light surface.',
      zh: '做一张 Product Hunt 发布卡：产品名 + 一句话简介、大号点赞数、"#1 Product of the Day" 徽标和制作者署名。Product Hunt 橙红强调色、干净浅色背景。',
    },
  },
  {
    id: 'social-producthunt-framework',
    chipId: 'social-card',
    subcategorySlug: 'product-hunt-card',
    preview: { kind: 'social', layout: 'framework', palette: 'producthunt' },
    title: { en: 'Launch Checklist', zh: '发布清单卡' },
    description: { en: 'Pre-launch steps', zh: '发布前步骤' },
    promptText: {
      en: 'Turn this into a Product Hunt launch checklist card: a title, numbered pre-launch steps with check markers, and a "launch day" CTA. Orange accent, friendly and scannable.',
      zh: '把内容做成 Product Hunt 发布清单卡：标题、带勾选标记的编号发布前步骤，以及"发布日"CTA。橙色强调色、亲切易扫读。',
    },
  },
  // ---- Spotify (overflow) ----
  {
    id: 'social-spotify-nowplaying',
    chipId: 'social-card',
    subcategorySlug: 'spotify-card',
    preview: { kind: 'social', layout: 'cover', palette: 'spotify' },
    title: { en: 'Now Playing Card', zh: 'Spotify 播放卡' },
    description: { en: 'Track + progress bar', zh: '歌曲 + 进度条' },
    promptText: {
      en: 'Design a Spotify-style now-playing card: a square album-art block (CSS gradient), track title + artist, a progress bar with timestamps, and playback controls. Spotify-green accent on near-black.',
      zh: '设计一张 Spotify 风格的播放卡：方形专辑封面块（CSS 渐变）、歌曲名 + 艺人、带时间戳的进度条和播放控件。近黑底 + Spotify 绿强调色。',
    },
  },
  {
    id: 'social-spotify-wrapped',
    chipId: 'social-card',
    subcategorySlug: 'spotify-card',
    preview: { kind: 'social', layout: 'metric', palette: 'spotify' },
    title: { en: 'Wrapped Stat', zh: '年度报告卡' },
    description: { en: 'Minutes / top artist', zh: '分钟数 / 最爱艺人' },
    promptText: {
      en: 'Create a Spotify-Wrapped-style stat card: one playful hero number (minutes listened or top artist), a bold caption, and a vivid gradient. Spotify-green accent, energetic 9:16 or 1:1.',
      zh: '做一张 Spotify Wrapped 风格的数据卡：一个有趣的核心数字（收听分钟数或最爱艺人）、醒目标题和鲜亮渐变。Spotify 绿强调色、活力 9:16 或 1:1。',
    },
  },
  // ---- Quote poster (overflow) ----
  {
    id: 'social-quote-midnight',
    chipId: 'social-card',
    subcategorySlug: 'quote-poster',
    preview: { kind: 'social', layout: 'poster', palette: 'midnight' },
    title: { en: 'Gold Quote Poster', zh: '烫金金句海报' },
    description: { en: 'Serif quote, gold mark', zh: '衬线金句 · 烫金引号' },
    promptText: {
      en: 'Create a premium quote poster: a deep midnight-ink ground, a centered serif pull-quote, an oversized champagne-gold quote mark, and a refined attribution. Editorial, high-end, 4:5.',
      zh: '做一张高级感的金句海报：深墨夜底色、居中的衬线金句、香槟金的超大引号和雅致署名。编辑感、高端、4:5。',
    },
  },
  {
    id: 'social-quote-ink',
    chipId: 'social-card',
    subcategorySlug: 'quote-poster',
    preview: { kind: 'social', layout: 'poster', palette: 'ink' },
    title: { en: 'Editorial Quote', zh: '编辑金句卡' },
    description: { en: 'Ink-on-cream pull-quote', zh: '米底墨字金句' },
    promptText: {
      en: 'Design an editorial quote poster: ink-on-cream, a large serif statement, a thin rule, and a small attribution. Restrained magazine layout, generous margins.',
      zh: '设计一张编辑感金句海报：米底墨字、放大的衬线主张、一条细分割线和小字署名。克制的杂志版式、宽裕留白。',
    },
  },

  // ============================ DIAGRAM ============================
  // ---- Architecture ----
  {
    id: 'diagram-flat-architecture',
    chipId: 'diagram',
    subcategorySlug: 'architecture-diagram',
    preview: { kind: 'diagram', layout: 'architecture', palette: 'flat' },
    title: { en: 'Flat Architecture', zh: '扁平架构图' },
    description: { en: 'Product-doc friendly', zh: '适合产品文档' },
    promptText: {
      en: 'Draw a product-doc friendly system architecture diagram in a clean flat-icon style: client, API gateway, services, workers, database, cache, object storage, observability, semantic arrows, and a bottom-right legend.',
      zh: '用干净的扁平图标风画一张适合产品文档的系统架构图：客户端、API 网关、服务、worker、数据库、缓存、对象存储、可观测性、语义箭头和右下角图例。',
    },
  },
  {
    id: 'diagram-blueprint-microservices',
    chipId: 'diagram',
    subcategorySlug: 'architecture-diagram',
    preview: { kind: 'diagram', layout: 'architecture', palette: 'blueprint' },
    title: { en: 'Blueprint Services', zh: '蓝图微服务' },
    description: { en: 'Cloud deployment map', zh: '云部署结构图' },
    promptText: {
      en: 'Create a blueprint-style microservices deployment diagram with regions, ingress, queues, services, storage, secrets, monitoring, failure paths, and a rollback path. Deep-blue grid, cyan strokes.',
      zh: '画一张蓝图风微服务部署图：region、入口、队列、服务、存储、密钥、监控、失败路径和回滚路径。深蓝网格、青色线条。',
    },
  },
  {
    id: 'diagram-service-mesh',
    chipId: 'diagram',
    subcategorySlug: 'architecture-diagram',
    preview: { kind: 'diagram', layout: 'mesh', palette: 'notion' },
    title: { en: 'Service Mesh', zh: '服务网格图' },
    description: { en: 'Single-accent mesh', zh: '单色服务网格' },
    promptText: {
      en: 'Draw a service-mesh diagram in a minimal Notion-clean style: a central control plane, sidecar-wrapped services in a ring, mTLS edges, and traffic-policy callouts. White surface, one accent color.',
      zh: '用极简 Notion 风画一张服务网格图：中心控制平面、环形排列的带 sidecar 服务、mTLS 连线和流量策略标注。白底、单一强调色。',
    },
  },
  {
    id: 'diagram-claude-stack',
    chipId: 'diagram',
    subcategorySlug: 'architecture-diagram',
    preview: { kind: 'diagram', layout: 'architecture', palette: 'claude' },
    title: { en: 'Cloud Stack', zh: '云端分层架构' },
    description: { en: 'Warm cream layers', zh: '暖米分层架构' },
    promptText: {
      en: 'Draw a layered cloud architecture in a warm, restrained cream style: edge, app tier, service tier, data tier, and platform services, with tidy semantic arrows and a small legend. Anthropic-like palette.',
      zh: '用暖色克制的米色风画一张分层云架构：边缘层、应用层、服务层、数据层和平台服务，配整洁的语义箭头和小图例。类 Anthropic 调色。',
    },
  },
  // ---- Workflow ----
  {
    id: 'diagram-workflow-swimlane',
    chipId: 'diagram',
    subcategorySlug: 'workflow-diagram',
    preview: { kind: 'diagram', layout: 'swimlane', palette: 'flat' },
    title: { en: 'Workflow Swimlane', zh: '泳道流程图' },
    description: { en: 'Roles, states, handoffs', zh: '角色 · 状态 · 交接' },
    promptText: {
      en: 'Create a swimlane workflow diagram with owner lanes, triggers, states, decision branches, handoffs, exceptions, timeout handling, and final outputs. Clean flat style.',
      zh: '画一张泳道流程图：负责人泳道、触发条件、状态、决策分支、交接、异常、超时处理和最终产出。干净扁平风。',
    },
  },
  {
    id: 'diagram-state-machine',
    chipId: 'diagram',
    subcategorySlug: 'workflow-diagram',
    preview: { kind: 'diagram', layout: 'state', palette: 'notion' },
    title: { en: 'State Machine', zh: '状态机图' },
    description: { en: 'States & transitions', zh: '状态与转移' },
    promptText: {
      en: 'Draw a state-machine diagram with an initial state, named states, guarded transitions, a self-loop for retries, and a terminal state. Minimal Notion-clean style, single accent.',
      zh: '画一张状态机图：初始态、命名状态、带守卫的转移、重试自环和终止态。极简 Notion 风、单一强调色。',
    },
  },
  {
    id: 'diagram-approval-flow',
    chipId: 'diagram',
    subcategorySlug: 'workflow-diagram',
    preview: { kind: 'diagram', layout: 'swimlane', palette: 'claude' },
    title: { en: 'Approval Flow', zh: '审批流程图' },
    description: { en: 'Roles & gates', zh: '角色与审批关卡' },
    promptText: {
      en: 'Create an approval workflow across role lanes (requester, reviewer, approver) with submit, review gate, approve/reject branches, escalation, and notification. Warm cream style.',
      zh: '画一张跨角色泳道的审批流程（申请人、审核、审批）：提交、审核关卡、通过/驳回分支、升级和通知。暖米色风。',
    },
  },
  {
    id: 'diagram-pipeline-run',
    chipId: 'diagram',
    subcategorySlug: 'workflow-diagram',
    preview: { kind: 'diagram', layout: 'pipeline', palette: 'openai' },
    title: { en: 'Pipeline Run', zh: '流水线运行图' },
    description: { en: 'Stages & branches', zh: '阶段与分支' },
    promptText: {
      en: 'Draw a CI/CD pipeline run diagram left-to-right: source, build, test, a branch gate, deploy, and rollback path, distinguishing success and failure arrows. Pure-white clean style.',
      zh: '从左到右画一张 CI/CD 流水线运行图：源、构建、测试、分支关卡、部署和回滚路径，区分成功与失败箭头。纯白干净风。',
    },
  },
  // ---- RAG / Agent ----
  {
    id: 'diagram-dark-tool-call',
    chipId: 'diagram',
    subcategorySlug: 'rag-agent-diagram',
    preview: { kind: 'diagram', layout: 'agent-loop', palette: 'terminal' },
    title: { en: 'Dark Tool Flow', zh: '暗色工具调用图' },
    description: { en: 'Terminal agent loop', zh: '终端风 Agent 回路' },
    promptText: {
      en: 'Draw an AI tool-call flow in dark-terminal style: a planner, an LLM (double-border), tool inputs/outputs, validation, a retry loop, memory, and final response. Neon accents, clear arrow labels.',
      zh: '用暗色终端风画一张 AI 工具调用流程：planner、LLM（双线框）、工具输入/输出、校验、重试回路、记忆和最终响应。霓虹强调色、清晰箭头标签。',
    },
  },
  {
    id: 'diagram-rag-memory',
    chipId: 'diagram',
    subcategorySlug: 'rag-agent-diagram',
    preview: { kind: 'diagram', layout: 'rag', palette: 'claude' },
    title: { en: 'RAG Memory Map', zh: 'RAG 记忆图' },
    description: { en: 'Retriever, reranker, memory', zh: '检索 · 重排 · 记忆' },
    promptText: {
      en: 'Draw a RAG memory architecture: ingestion, chunking, embeddings, a vector store (cylinder), retriever, reranker, working memory, long-term memory, citations, a feedback loop, and a personalized response. Warm cream style.',
      zh: '画一张 RAG 记忆架构：采集、切块、embedding、向量库（圆柱）、retriever、reranker、工作记忆、长期记忆、引用、反馈回路和个性化响应。暖米色风。',
    },
  },
  {
    id: 'diagram-agent-mesh',
    chipId: 'diagram',
    subcategorySlug: 'rag-agent-diagram',
    preview: { kind: 'diagram', layout: 'mesh', palette: 'flat' },
    title: { en: 'Multi-Agent Mesh', zh: '多智能体网格' },
    description: { en: 'Orchestrator & workers', zh: '编排者与执行体' },
    promptText: {
      en: 'Draw a multi-agent orchestration diagram: a coordinator (hexagon) routing to worker agents in a ring, shared memory, tool access, and a result aggregator. Clean flat style, semantic edges.',
      zh: '画一张多智能体编排图：协调者（六边形）将任务路由给环形排列的执行体，共享记忆、工具访问和结果聚合器。干净扁平风、语义连线。',
    },
  },
  {
    id: 'diagram-agent-loop',
    chipId: 'diagram',
    subcategorySlug: 'rag-agent-diagram',
    preview: { kind: 'diagram', layout: 'agent-loop', palette: 'notion' },
    title: { en: 'Agent Loop', zh: 'Agent 决策回路' },
    description: { en: 'Plan, act, reflect', zh: '规划 · 执行 · 反思' },
    promptText: {
      en: 'Draw an agentic plan-act-reflect loop in minimal style: an agent (hexagon), an LLM call, tool execution, an observation, and a reflection arrow that loops back. Notion-clean, single accent.',
      zh: '用极简风画一张 agent 的规划-执行-反思回路：agent（六边形）、LLM 调用、工具执行、观察和回到起点的反思箭头。Notion 风、单一强调色。',
    },
  },
  // ---- UML ----
  {
    id: 'diagram-uml-sequence',
    chipId: 'diagram',
    subcategorySlug: 'uml-diagram',
    preview: { kind: 'diagram', layout: 'sequence', palette: 'flat' },
    title: { en: 'UML Sequence', zh: 'UML 时序图' },
    description: { en: 'Checkout / API timeline', zh: '下单 / API 时间线' },
    promptText: {
      en: 'Create a UML sequence diagram with user, frontend, API, payment provider, database, and notification service, including activation bars, a success path, an error path, and retry behavior.',
      zh: '画一张 UML 时序图：用户、前端、API、支付服务、数据库和通知服务，含激活条、成功路径、错误路径和重试行为。',
    },
  },
  {
    id: 'diagram-uml-class',
    chipId: 'diagram',
    subcategorySlug: 'uml-diagram',
    preview: { kind: 'diagram', layout: 'class', palette: 'notion' },
    title: { en: 'UML Class', zh: 'UML 类图' },
    description: { en: 'Entities & relations', zh: '实体与关系' },
    promptText: {
      en: 'Draw a UML class diagram for this domain: classes with attribute and method compartments, inheritance, composition, and multiplicity labels. Minimal Notion-clean style.',
      zh: '为这个领域画一张 UML 类图：含属性与方法分区的类、继承、组合和多重性标注。极简 Notion 风。',
    },
  },
  {
    id: 'diagram-uml-state',
    chipId: 'diagram',
    subcategorySlug: 'uml-diagram',
    preview: { kind: 'diagram', layout: 'state', palette: 'claude' },
    title: { en: 'UML State', zh: 'UML 状态图' },
    description: { en: 'Lifecycle states', zh: '生命周期状态' },
    promptText: {
      en: 'Draw a UML state diagram for an entity lifecycle: initial state, named states with entry actions, guarded transitions, a composite state, and a final state. Warm cream style.',
      zh: '为一个实体的生命周期画 UML 状态图：初始态、带进入动作的命名状态、带守卫的转移、复合状态和终止态。暖米色风。',
    },
  },
  {
    id: 'diagram-uml-activity',
    chipId: 'diagram',
    subcategorySlug: 'uml-diagram',
    preview: { kind: 'diagram', layout: 'swimlane', palette: 'openai' },
    title: { en: 'UML Activity', zh: 'UML 活动图' },
    description: { en: 'Actions & forks', zh: '动作与分叉' },
    promptText: {
      en: 'Create a UML activity diagram with swimlanes, a start node, actions, a decision diamond, fork/join bars for parallel work, and an end node. Pure-white clean style.',
      zh: '画一张 UML 活动图：泳道、开始节点、动作、决策菱形、用于并行的 fork/join 条和结束节点。纯白干净风。',
    },
  },
  // ---- Data flow ----
  {
    id: 'diagram-data-lineage',
    chipId: 'diagram',
    subcategorySlug: 'data-flow-diagram',
    preview: { kind: 'diagram', layout: 'lineage', palette: 'flat' },
    title: { en: 'Data Lineage', zh: '数据血缘图' },
    description: { en: 'Events to warehouse', zh: '事件到数仓' },
    promptText: {
      en: 'Draw a data lineage diagram from UI events to ingestion, stream processing, warehouse, semantic layer, dashboards, quality checks, retention, and a deletion path. Distinguish read, write, async, and audit arrows.',
      zh: '画一张数据血缘图，从 UI 事件到采集、流处理、数仓、语义层、看板、质量检查、保留周期和删除路径，区分 read、write、async、audit 箭头。',
    },
  },
  {
    id: 'diagram-event-pipeline',
    chipId: 'diagram',
    subcategorySlug: 'data-flow-diagram',
    preview: { kind: 'diagram', layout: 'pipeline', palette: 'notion' },
    title: { en: 'Event Pipeline', zh: '事件流水线' },
    description: { en: 'Producers to sinks', zh: '生产者到下游' },
    promptText: {
      en: 'Draw an event-streaming pipeline: producers, a message bus, stream processors, a branch for dead-letter handling, and downstream sinks. Minimal Notion-clean style, typed arrows.',
      zh: '画一张事件流水线：生产者、消息总线、流处理器、死信处理分支和下游 sink。极简 Notion 风、带类型的箭头。',
    },
  },
  {
    id: 'diagram-etl-map',
    chipId: 'diagram',
    subcategorySlug: 'data-flow-diagram',
    preview: { kind: 'diagram', layout: 'pipeline', palette: 'claude' },
    title: { en: 'ETL Map', zh: 'ETL 流程图' },
    description: { en: 'Extract, transform, load', zh: '抽取 · 转换 · 加载' },
    promptText: {
      en: 'Draw an ETL data map: sources, extract, transform with a validation branch, load into a warehouse (cylinder), and a reporting layer. Warm cream style, clear stage labels.',
      zh: '画一张 ETL 数据流程图：数据源、抽取、含校验分支的转换、加载进数仓（圆柱）和报表层。暖米色风、清晰阶段标签。',
    },
  },
  {
    id: 'diagram-stream-topology',
    chipId: 'diagram',
    subcategorySlug: 'data-flow-diagram',
    preview: { kind: 'diagram', layout: 'lineage', palette: 'openai' },
    title: { en: 'Stream Topology', zh: '流处理拓扑' },
    description: { en: 'Fan-out & joins', zh: '扇出与汇聚' },
    promptText: {
      en: 'Draw a stream-processing topology: a source that fans out to parallel operators, windowed joins, a stateful aggregator, and two sinks. Pure-white clean style, distinguish async edges.',
      zh: '画一张流处理拓扑：源扇出到并行算子、窗口 join、有状态聚合器和两个 sink。纯白干净风、区分异步连线。',
    },
  },
  // ---- Comparison ----
  {
    id: 'diagram-comparison-matrix',
    chipId: 'diagram',
    subcategorySlug: 'comparison-diagram',
    preview: { kind: 'diagram', layout: 'matrix', palette: 'flat' },
    title: { en: 'Decision Matrix', zh: '决策矩阵图' },
    description: { en: 'Options & tradeoffs', zh: '方案与取舍' },
    promptText: {
      en: 'Turn this tradeoff analysis into a comparison matrix: options as columns; cost, latency, reliability, effort, and lock-in as rows; cells scored, with a recommended column highlighted and a next validation step.',
      zh: '把这份取舍分析做成对比矩阵：方案为列；成本、延迟、可靠性、工作量、锁定为行；单元格打分，高亮推荐列，并给出下一步验证。',
    },
  },
  {
    id: 'diagram-before-after',
    chipId: 'diagram',
    subcategorySlug: 'comparison-diagram',
    preview: { kind: 'diagram', layout: 'before-after', palette: 'notion' },
    title: { en: 'Before / After', zh: '前后对比图' },
    description: { en: 'Old vs new state', zh: '旧态 vs 新态' },
    promptText: {
      en: 'Draw a before / after comparison: a muted "before" cluster on the left, a divider, an improved "after" cluster on the right with the accent color, and arrows showing what changed. Minimal style.',
      zh: '画一张前后对比图：左侧灰调的“之前”集群、中间分割线、右侧用强调色的“之后”集群，以及标注变化的箭头。极简风。',
    },
  },
  {
    id: 'diagram-option-scorecard',
    chipId: 'diagram',
    subcategorySlug: 'comparison-diagram',
    preview: { kind: 'diagram', layout: 'matrix', palette: 'claude' },
    title: { en: 'Option Scorecard', zh: '方案评分卡' },
    description: { en: 'Weighted criteria', zh: '加权评分' },
    promptText: {
      en: 'Create a weighted option scorecard: candidates as columns, weighted criteria as rows, per-cell scores, a weighted total row, and the winning column highlighted. Warm cream style.',
      zh: '做一张加权方案评分卡：候选方案为列、加权标准为行、每格评分、一行加权总分，并高亮胜出列。暖米色风。',
    },
  },
  {
    id: 'diagram-tradeoff-quadrant',
    chipId: 'diagram',
    subcategorySlug: 'comparison-diagram',
    preview: { kind: 'diagram', layout: 'quadrant', palette: 'openai' },
    title: { en: 'Tradeoff Quadrant', zh: '取舍四象限' },
    description: { en: 'Two-axis positioning', zh: '双轴定位' },
    promptText: {
      en: 'Draw a 2x2 tradeoff quadrant positioning options on two axes (e.g. effort vs impact), with each option as a labeled dot, quadrant labels, and a highlighted recommended zone. Pure-white clean style.',
      zh: '画一张 2x2 取舍四象限，把方案放在两条轴上（如工作量 vs 影响），每个方案为带标签的点，标注象限并高亮推荐区。纯白干净风。',
    },
  },
  // ---- Sequence (overflow) ----
  {
    id: 'diagram-sequence-auth',
    chipId: 'diagram',
    subcategorySlug: 'sequence-diagram',
    preview: { kind: 'diagram', layout: 'sequence', palette: 'flat' },
    title: { en: 'Auth Sequence', zh: '鉴权时序图' },
    description: { en: 'Login / token handshake', zh: '登录 / 令牌握手' },
    promptText: {
      en: 'Create a sequence diagram for an auth handshake: client, gateway, auth service, and token store, with activation bars, a success path, a token-refresh path, and an error path. Clean flat style.',
      zh: '画一张鉴权握手的时序图：客户端、网关、鉴权服务和令牌存储，含激活条、成功路径、令牌刷新路径和错误路径。干净扁平风。',
    },
  },
  {
    id: 'diagram-sequence-payment',
    chipId: 'diagram',
    subcategorySlug: 'sequence-diagram',
    preview: { kind: 'diagram', layout: 'sequence', palette: 'notion' },
    title: { en: 'Payment Sequence', zh: '支付时序图' },
    description: { en: 'Checkout call timeline', zh: '下单调用时间线' },
    promptText: {
      en: 'Draw a checkout sequence diagram: user, frontend, API, payment provider, and webhook handler, with activation bars, a confirmation callback, and a retry on failure. Minimal Notion-clean style.',
      zh: '画一张下单时序图：用户、前端、API、支付服务和 webhook 处理器，含激活条、确认回调和失败重试。极简 Notion 风。',
    },
  },
  // ---- Mind map (overflow) ----
  {
    id: 'diagram-mindmap-topic',
    chipId: 'diagram',
    subcategorySlug: 'mindmap-diagram',
    preview: { kind: 'diagram', layout: 'mindmap', palette: 'flat' },
    title: { en: 'Topic Mind Map', zh: '主题思维导图' },
    description: { en: 'Central idea + branches', zh: '中心主题 + 分支' },
    promptText: {
      en: 'Draw a mind map: a central topic node with labeled branches radiating to sub-topics and leaf ideas, color-coded by branch. Clean flat style, readable labels, balanced layout.',
      zh: '画一张思维导图：中心主题节点向外辐射出带标签的分支到子主题与叶节点，按分支配色。干净扁平风、标签清晰、布局均衡。',
    },
  },
  {
    id: 'diagram-mindmap-plan',
    chipId: 'diagram',
    subcategorySlug: 'mindmap-diagram',
    preview: { kind: 'diagram', layout: 'mindmap', palette: 'claude' },
    title: { en: 'Project Map', zh: '项目脑图' },
    description: { en: 'Goals, tasks, owners', zh: '目标 · 任务 · 负责人' },
    promptText: {
      en: 'Create a project mind map: a central goal, primary branches for workstreams, and leaf nodes for tasks and owners. Warm cream style, one accent per branch.',
      zh: '做一张项目脑图：中心目标、工作流主分支和任务 / 负责人叶节点。暖米色风、每条分支一个强调色。',
    },
  },
  // ---- Network (overflow) ----
  {
    id: 'diagram-network-topology',
    chipId: 'diagram',
    subcategorySlug: 'network-diagram',
    preview: { kind: 'diagram', layout: 'lineage', palette: 'blueprint' },
    title: { en: 'Network Topology', zh: '网络拓扑图' },
    description: { en: 'VPC, subnets, nodes', zh: 'VPC · 子网 · 节点' },
    promptText: {
      en: 'Draw a network topology diagram: internet gateway, load balancer, public and private subnets, compute nodes, and a database tier, with security-group boundaries and traffic edges. Blueprint style, cyan strokes.',
      zh: '画一张网络拓扑图：互联网网关、负载均衡、公有 / 私有子网、计算节点和数据库层，标注安全组边界和流量连线。蓝图风、青色线条。',
    },
  },
  {
    id: 'diagram-network-mesh',
    chipId: 'diagram',
    subcategorySlug: 'network-diagram',
    preview: { kind: 'diagram', layout: 'mesh', palette: 'notion' },
    title: { en: 'Peer Network', zh: '对等网络图' },
    description: { en: 'Nodes & connections', zh: '节点与连接' },
    promptText: {
      en: 'Draw a peer-to-peer network diagram: a central coordinator and peer nodes in a ring with bidirectional connections and a few cross-links. Minimal Notion-clean style, single accent.',
      zh: '画一张对等网络图：中心协调者与环形排列的对等节点，带双向连接和少量交叉连线。极简 Notion 风、单一强调色。',
    },
  },
  // ---- ER model (overflow) ----
  {
    id: 'diagram-er-schema',
    chipId: 'diagram',
    subcategorySlug: 'er-diagram',
    preview: { kind: 'diagram', layout: 'class', palette: 'flat' },
    title: { en: 'ER Schema', zh: 'ER 模型图' },
    description: { en: 'Entities & relations', zh: '实体与关系' },
    promptText: {
      en: 'Create an entity-relationship diagram: entity tables with primary/foreign keys and typed columns, plus relationship lines with crow’s-foot multiplicity. Clean flat style, tidy alignment.',
      zh: '画一张实体关系（ER）图：含主键 / 外键和带类型列的实体表，以及带鱼尾纹多重性的关系连线。干净扁平风、对齐整洁。',
    },
  },
  {
    id: 'diagram-er-domain',
    chipId: 'diagram',
    subcategorySlug: 'er-diagram',
    preview: { kind: 'diagram', layout: 'class', palette: 'openai' },
    title: { en: 'Domain Model', zh: '领域模型图' },
    description: { en: 'Aggregates & links', zh: '聚合与关联' },
    promptText: {
      en: 'Draw a domain model: aggregate-root entities with their fields, value objects, and association lines showing one-to-many and many-to-many links. Pure-white clean style.',
      zh: '画一张领域模型图：含字段的聚合根实体、值对象，以及表示一对多 / 多对多的关联连线。纯白干净风。',
    },
  },
  // ---- Timeline (overflow) ----
  {
    id: 'diagram-timeline-roadmap',
    chipId: 'diagram',
    subcategorySlug: 'timeline-diagram',
    preview: { kind: 'diagram', layout: 'timeline', palette: 'flat' },
    title: { en: 'Roadmap Timeline', zh: '路线图时间线' },
    description: { en: 'Phases & milestones', zh: '阶段与里程碑' },
    promptText: {
      en: 'Draw a roadmap timeline left-to-right: quarters as stages, milestone markers, a highlighted "now" point, and a branch for a parallel track. Clean flat style, clear date labels.',
      zh: '从左到右画一张路线图时间线：季度为阶段、里程碑标记、高亮的"现在"节点，以及一条并行轨道分支。干净扁平风、清晰日期标签。',
    },
  },
  {
    id: 'diagram-timeline-release',
    chipId: 'diagram',
    subcategorySlug: 'timeline-diagram',
    preview: { kind: 'diagram', layout: 'timeline', palette: 'claude' },
    title: { en: 'Release Timeline', zh: '发布时间线' },
    description: { en: 'Versions & dates', zh: '版本与日期' },
    promptText: {
      en: 'Create a release timeline: sequential version markers with dates, a highlighted current release, and a branch for a hotfix. Warm cream style, clear labels.',
      zh: '做一张发布时间线：带日期的连续版本标记、高亮当前版本，以及一条热修复分支。暖米色风、清晰标签。',
    },
  },
  // ---- State machine (overflow) ----
  {
    id: 'diagram-statemachine-order',
    chipId: 'diagram',
    subcategorySlug: 'state-machine-diagram',
    preview: { kind: 'diagram', layout: 'state', palette: 'flat' },
    title: { en: 'Order State Machine', zh: '订单状态机' },
    description: { en: 'Lifecycle transitions', zh: '生命周期转移' },
    promptText: {
      en: 'Draw an order state machine: initial state, named states (placed, paid, shipped, delivered), guarded transitions, a cancel path, and a self-loop for retries. Clean flat style.',
      zh: '画一张订单状态机：初始态、命名状态（已下单、已支付、已发货、已送达）、带守卫的转移、取消路径和重试自环。干净扁平风。',
    },
  },
  {
    id: 'diagram-statemachine-job',
    chipId: 'diagram',
    subcategorySlug: 'state-machine-diagram',
    preview: { kind: 'diagram', layout: 'state', palette: 'terminal' },
    title: { en: 'Job State Machine', zh: '任务状态机' },
    description: { en: 'Queued → done / failed', zh: '排队 → 完成 / 失败' },
    promptText: {
      en: 'Draw a background-job state machine in dark-terminal style: queued, running, retrying (self-loop), succeeded, and failed terminal states, with guarded transitions and neon accents.',
      zh: '用暗色终端风画一张后台任务状态机：排队、运行、重试（自环）、成功和失败终止态，带守卫转移和霓虹强调色。',
    },
  },
];

function localizePreset(source: LocalizedPresetSource, locale: Locale): LocalTemplatePreset {
  return {
    id: source.id,
    chipId: source.chipId,
    subcategorySlug: source.subcategorySlug,
    title: localizePresetCopy(source.title, locale),
    description: localizePresetCopy(source.description, locale),
    promptText: localizePresetCopy(source.promptText, locale),
    preview: source.preview,
  };
}

function localizePresetCopy(copy: LocalizedPresetCopy, locale: Locale): string {
  if (locale === 'zh-CN') return copy.zh;
  if (locale === 'zh-TW') return copy.zhTW ?? toTraditionalChinesePresetCopy(copy.zh);
  return copy.en;
}

// The home template rail is intentionally local data, not part of the global
// Dict contract. Keep non-Chinese locales on English, but do not show
// simplified copy in Traditional Chinese UI.
function toTraditionalChinesePresetCopy(text: string): string {
  return ZH_TW_REPLACEMENTS.reduce((next, [from, to]) => next.replaceAll(from, to), text);
}

const ZH_TW_REPLACEMENTS: Array<[string, string]> = [
  ['小红书', '小紅書'],
  ['公众号', '公眾號'],
  ['瑞士风', '瑞士風'],
  ['创始人', '創辦人'],
  ['思想领导力', '思想領導力'],
  ['笔记', '筆記'],
  ['关键', '關鍵'],
  ['视觉', '視覺'],
  ['风格', '風格'],
  ['简述', '簡述'],
  ['品牌', '品牌'],
  ['配色', '配色'],
  ['复制', '複製'],
  ['种子', '種子'],
  ['避免', '避免'],
  ['安全裁切', '安全裁切'],
  ['清晰', '清晰'],
  ['金句', '金句'],
  ['数据故事', '數據故事'],
  ['数据血缘', '資料血緣'],
  ['数据卡', '數據卡'],
  ['数据', '資料'],
  ['图表', '圖表'],
  ['组图', '組圖'],
  ['封面对', '封面組'],
  ['封面', '封面'],
  ['头图', '頭圖'],
  ['头部', '頭部'],
  ['头像', '頭像'],
  ['账号', '帳號'],
  ['电光蓝', '電光藍'],
  ['指标', '指標'],
  ['经验', '經驗'],
  ['下一步', '下一步'],
  ['点击', '點擊'],
  ['订阅', '訂閱'],
  ['播放', '播放'],
  ['烫金', '燙金'],
  ['衬线', '襯線'],
  ['编辑', '編輯'],
  ['主题', '主題'],
  ['目标', '目標'],
  ['任务', '任務'],
  ['负责人', '負責人'],
  ['网络', '網路'],
  ['拓扑', '拓樸'],
  ['订单', '訂單'],
  ['已下单', '已下單'],
  ['发货', '出貨'],
  ['送达', '送達'],
  ['后台', '後台'],
  ['运行', '執行'],
  ['创建', '建立'],
  ['设计', '設計'],
  ['内容', '內容'],
  ['选择', '選擇'],
  ['用户', '使用者'],
  ['截图', '截圖'],
  ['内置', '內建'],
  ['导出', '匯出'],
  ['静态', '靜態'],
  ['画板', '畫板'],
  ['标签', '標籤'],
  ['语义', '語義'],
  ['质量', '品質'],
  ['输出', '輸出'],
  ['时间线', '時間軸'],
  ['时间', '時間'],
  ['路线图', '路線圖'],
  ['流程图', '流程圖'],
  ['架构图', '架構圖'],
  ['微服务', '微服務'],
  ['服务', '服務'],
  ['状态机', '狀態機'],
  ['状态', '狀態'],
  ['转移', '轉移'],
  ['队列', '佇列'],
  ['排队', '佇列'],
  ['失败', '失敗'],
  ['终止', '終止'],
  ['重试', '重試'],
  ['守卫', '守衛'],
  ['路径', '路徑'],
  ['节点', '節點'],
  ['阶段', '階段'],
  ['并行', '平行'],
  ['轨道', '軌道'],
  ['热修复', '熱修復'],
  ['发布', '發布'],
  ['页面', '頁面'],
  ['滑动', '滑動'],
  ['轮播', '輪播'],
  ['文档', '文件'],
  ['对比', '對比'],
  ['编号', '編號'],
  ['方法论', '方法論'],
  ['清单', '清單'],
  ['测评', '評測'],
  ['观点', '觀點'],
  ['洞察', '洞察'],
  ['证据', '證據'],
  ['产品', '產品'],
  ['领导力', '領導力'],
  ['管理层', '管理層'],
  ['倒计时', '倒數計時'],
  ['投票贴', '投票貼'],
  ['揭晓', '揭曉'],
  ['卡片', '卡片'],
  ['强调色', '強調色'],
  ['强', '強'],
  ['干净', '乾淨'],
  ['风', '風'],
  ['图', '圖'],
  ['这', '這'],
  ['个', '個'],
  ['与', '與'],
  ['对', '對'],
  ['为', '為'],
  ['时', '時'],
  ['后', '後'],
];

export function localTemplatePresetsForChip(
  chipId: string | null,
  locale: Locale,
  subcategorySlug: string | null = null,
): LocalTemplatePreset[] {
  if (chipId !== 'social-card' && chipId !== 'diagram') return [];
  return PRESET_SOURCES
    .filter((preset) => preset.chipId === chipId)
    .filter((preset) => !subcategorySlug || preset.subcategorySlug === subcategorySlug)
    .map((preset) => localizePreset(preset, locale));
}

export function localTemplatePresetSearchText(chipId: string, locale: Locale): string {
  return localTemplatePresetsForChip(chipId, locale)
    .map((preset) => `${preset.title} ${preset.description} ${preset.promptText} ${preset.subcategorySlug}`)
    .join(' ');
}
