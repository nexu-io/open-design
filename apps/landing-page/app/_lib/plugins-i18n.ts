/*
 * Plugins-specific i18n strings, kept separate from `_lib/i18n.ts` so
 * the plugin library's chrome (hub, list pages, chip rails, share
 * dialog) doesn't bloat the canonical Copy table every page already
 * loads. The catch-all (`pages/[locale]/[...path].astro`) and the
 * locale-prefixed detail page (`pages/[locale]/plugins/[slug]/`)
 * import from here.
 *
 * Locale strategy:
 *   - English fills every key; every other locale is `Partial<...>`
 *     and falls back to English on miss. Translations were drafted to
 *     match the voice of the existing `_lib/i18n.ts` overrides for
 *     each locale. Long blurbs that don't have an obvious idiomatic
 *     translation stay in English — the catalog still reads cleanly,
 *     and a follow-up can polish them without rebuilding the schema.
 *   - 7 artifact-kind labels and 25 scene-subcategory labels are
 *     translated to keep the chip rails legible at a glance.
 *   - Share-dialog copy ports the 18-locale table from PR #2679 so
 *     the brand keyword "open-source Claude Design alternative" stays
 *     in English on every share (deliberate — see PR #2679).
 */
/*
 * Locale key uses `LandingLocaleCode` (short codes — `en`, `zh`,
 * `zh-tw`, `pt-br`, …) to match the rest of `app/pages/plugins/...`,
 * which derives the active locale from `localeFromPath()`. The
 * Cloudflare `_redirects` file maps the long-code variants
 * (`/zh-CN/...` → `/zh/...`) so visitors can still land here from
 * either URL shape.
 */
import type { LandingLocaleCode } from '../i18n';
const DEFAULT_LOCALE: LandingLocaleCode = 'en';

export interface PluginCategoryCopy {
  label: string;
  description: string;
}

export interface PluginsCopy {
  hubLabel: string;
  hubHeading: (n: number) => string;
  hubLead: string;

  tileTemplates: string;
  tileSkills: string;
  tileSystems: string;
  tileCraft: string;
  tileTemplatesBlurb: string;
  tileSkillsBlurb: string;
  tileSystemsBlurb: string;
  tileCraftBlurb: string;

  browseTemplates: string;
  browseSkills: string;
  browseSystems: string;
  browseCraft: string;

  templatesLabel: string;
  templatesHeading: (n: number) => string;
  templatesLead: string;

  skillsLabel: string;
  skillsHeading: (n: number) => string;
  skillsLead: string;

  systemsLabel: string;
  systemsHeading: (n: number) => string;
  systemsLead: string;
  systemsMetaTitle: (n: number) => string;
  systemsMetaDescription: string;
  systemsAboutHead: string;
  systemsAboutBody: string;
  /** Lowercase category suffix appended to design-system detail titles/H1 (e.g. "design system"). */
  detailSystemLabel: string;
  /** Placeholder for the client-side catalog filter on templates / systems. */
  searchPlaceholder: string;
  /** Shown when a catalog filter matches nothing. */
  searchNoResults: string;
  /** Caption under the design-system mock-UI live preview. */
  systemPreviewCaption: (name: string) => string;
  /** CTA on a system catalog card, drilling into the detail page. */
  systemCardCta: string;
  /** "Contribute a plugin" callout shown on every plugins page. */
  contributeTitle: string;
  contributeBody: string;
  /** Primary CTA — open a pull request directly. */
  contributeCta: string;
  /** Secondary CTA — open an issue (lower barrier than a PR). */
  contributeIssueCta: string;

  craftLabel: string;
  craftHeading: (n: number) => string;
  craftLead: string;

  artifactKindLabel: string;
  sceneLabel: string;
  allChip: string;

  category: Record<
    'prototype' | 'live-artifact' | 'deck' | 'image' | 'video' | 'hyperframes' | 'audio',
    PluginCategoryCopy
  >;

  subcategory: Record<string, string>;

  // Detail page chrome
  detailUseCta: string;        // "Use this plugin →"
  detailFindOnGithub: string;  // "Find on GitHub →"
  detailHomepage: string;      // "Homepage ↗"
  detailMode: string;
  detailScenario: string;
  detailPlatform: string;
  detailSurface: string;
  detailAuthor: string;
  detailManifestId: string;
  detailTags: string;
  detailPreviewCaption: string;
  detailClickForLivePreview: string;  // "Click for live preview ↗"
  detailOpenInNewTab: string;          // "Open in new tab ↗" (visible label)
  /**
   * Accessible-name variant of {@link detailOpenInNewTab}: same meaning, no
   * decorative `↗` glyph. Splitting the keys keeps screen readers from
   * announcing the arrow as part of the control's name while the visible
   * label keeps the visual cue. (Reviewer flag: `aria-label` should not
   * embed decorative typography.)
   */
  detailOpenInNewTabAria: string;
  detailBucketLabel: Record<
    'examples' | 'image-templates' | 'video-templates' | 'scenarios' | 'design-systems' | 'atoms',
    string
  >;

  // A11y strings used as `aria-label` / `alt` / `<iframe title>` on the
  // detail page. Anything that takes the plugin's localized title is a
  // function so the surrounding sentence frame stays in the page locale
  // even when the catalog row's English fallback fires.
  breadcrumbLabel: string;            // <nav aria-label>
  shareDialogClose: string;           // share dialog × button
  previewImageAlt: (title: string) => string;       // <img alt>
  previewSummaryAria: (title: string) => string;    // <summary aria-label>
  previewIframeTitle: (title: string) => string;    // <iframe title>

  // Share dialog
  shareOpen: string;
  shareTitle: string;
  shareLead: string;
  shareCopyText: string;
  shareCopyLink: string;
  shareJumpTo: string;
  shareTemplate: (vars: { title: string; url: string }) => string;

  /*
   * Templates page chrome (YouMind-shape grid, PR #3185). Hero is
   * eyebrow + static H1 + lead + a counter chip; cards carry
   * Featured tag, "Read full prompt" excerpt header, primary CTA,
   * and an `aria-label` for the share trigger. FAQ ships its 6
   * Q&A pairs as paired arrays so the visible accordion + the
   * FAQPage JSON-LD share a single source of truth.
   */
  templatesHeroEyebrow: string;
  templatesHeroLead: string;
  templatesCounterLabel: string;
  cardFeaturedTag: string;
  cardReadFullPrompt: string;
  cardUseTemplate: string;
  cardShareAria: (title: string) => string;
  faqHead: string;
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
}

const en: PluginsCopy = {
  hubLabel: 'Plugin library',
  hubHeading: (n) => `${n} composable pieces.`,
  hubLead:
    'Open Design is built around four kinds of plugin. Templates and Skills are what your agent runs; Systems and Craft are how it stays on-brand and accessible. Pick a section to drill in, or jump straight to a slug if you already know which one you want.',

  tileTemplates: 'Templates',
  tileSkills: 'Skills',
  tileSystems: 'Systems',
  tileCraft: 'Craft',
  tileTemplatesBlurb:
    'Visual, runnable templates — prototypes, slides, image and video generators, motion compositions. Every entry ships an example.html so you can fork, swap data, and ship.',
  tileSkillsBlurb:
    'Instruction skills the agent loads mid-task — copywriting, color theory, creative direction, brainstorming. Pure SKILL.md prose; the output depends on your input.',
  tileSystemsBlurb:
    'Brand-anchored design systems — palette, typography, motion, voice. Snap a project to a system and every plugin output inherits the same identity.',
  tileCraftBlurb:
    'Brand-agnostic craft rules — accessibility, RTL, motion easing, photography ethics. Skills opt in via `od.craft.requires` so a plugin inherits the right rigour automatically.',

  browseTemplates: 'Browse templates',
  browseSkills: 'Browse skills',
  browseSystems: 'Browse systems',
  browseCraft: 'Browse craft',

  templatesLabel: 'Plugins · Templates',
  templatesHeading: (n) => `${n} runnable templates.`,
  templatesLead:
    'Every template ships a working preview — the catalog row’s thumbnail comes straight from the manifest poster the agent uses inside the product. Browse all of them below, or jump to one of the seven artifact kinds.',

  skillsLabel: 'Plugins · Skills',
  skillsHeading: (n) => `${n} instruction skills.`,
  skillsLead:
    'Skills the agent loads mid-task — copywriting, color theory, creative direction, brainstorming. There’s no static demo because the outcome depends on your input, so each detail page reads like a brief: title, description, triggers, attribution.',

  systemsLabel: 'Plugins · Systems',
  systemsHeading: () => 'Design systems, ready for your agent',
  systemsLead:
    'Browse real-world design system examples — brand-grade palette, typography, motion and voice your coding agent can snap any project to. Every system is open-source and runs with Claude, Codex, Cursor and more.',
  systemsMetaTitle: (n) => `Design System Examples — ${n} Open-Source Design Systems | Open Design`,
  systemsMetaDescription:
    'Browse design system examples your coding agent can apply automatically — brand-grade palette, typography, motion and voice from real-world design systems. Open-source, BYOK, works with Claude, Codex and Cursor.',
  systemsAboutHead: 'What is a design system?',
  systemsAboutBody:
    'A design system is a reusable set of brand foundations — color palette, typography, spacing, motion and voice — that keeps every screen consistent. In Open Design each design system is a plugin: snap a project to one and your coding agent inherits the palette, type, motion and voice automatically, so everything it generates stays on-brand.',
  detailSystemLabel: 'design system',
  searchPlaceholder: 'Search by name or keyword…',
  searchNoResults: 'No matches. Try a different keyword.',
  systemPreviewCaption: (name) =>
    `Mock UI styled entirely with ${name}'s design tokens — a live preview of the design system, not a screenshot.`,
  systemCardCta: 'View design system →',
  contributeTitle: 'Built a plugin? Ship it to the catalogue.',
  contributeBody:
    'Every template, skill, and design system here is community-extensible. Open a pull request to add yours directly, or open an issue to propose one — merged contributions show up in this catalogue and in the product automatically.',
  contributeCta: 'Open a pull request →',
  contributeIssueCta: 'Or open an issue →',

  craftLabel: 'Plugins · Craft',
  craftHeading: (n) => `${n} craft principles.`,
  craftLead:
    'Brand-agnostic craft rules — accessibility, RTL, motion easing, photography ethics. Skills opt in via `od.craft.requires` so a plugin inherits the right rigour automatically.',

  artifactKindLabel: 'Artifact kind',
  sceneLabel: 'Scene',
  allChip: 'All',

  category: {
    prototype: {
      label: 'Prototype',
      description:
        'Interactive product mockups — dashboards, apps, landing pages, internal tools. Anything you’d hand a stakeholder and click through.',
    },
    'live-artifact': {
      label: 'Live Artifact',
      description:
        'Refreshable, data-aware artifacts that re-render whenever the underlying data changes. Live dashboards, monitoring boards, recurring trackers.',
    },
    deck: {
      label: 'Slides',
      description:
        'Polished slide decks from a narrative brief — pitch decks, course modules, weekly reports, product launches.',
    },
    image: {
      label: 'Image',
      description:
        'Image assets generated from structured creative direction — UI mockups, brand visuals, storyboards, social posts, illustrations.',
    },
    video: {
      label: 'Video',
      description:
        'Video prompts, storyboards, and render-ready motion artifacts — short-form social, marketing cuts, motion graphics, cinematic stories.',
    },
    hyperframes: {
      label: 'HyperFrames',
      description:
        'HyperFrames-ready motion compositions — agent-built video that blends template HTML with frame-level keyframes.',
    },
    audio: {
      label: 'Audio',
      description:
        'Audio, voice, and sound-design assets generated from a brief — podcast intros, jingles, ambient beds.',
    },
  },

  subcategory: {
    'business-dashboards': 'Dashboards',
    'app-prototypes': 'Apps',
    'landing-marketing': 'Landing & marketing',
    'developer-tools': 'Developer tools',
    'docs-reports': 'Docs & reports',
    'brand-design': 'Brand & design',
    'pitch-business': 'Pitch & business',
    'course-training': 'Course & training',
    'reports-briefings': 'Reports & briefings',
    'product-sales': 'Product & sales',
    'engineering-talks': 'Engineering talks',
    'creative-decks': 'Creative decks',
    'ui-product-mockups': 'UI & product mockups',
    'brand-visuals': 'Brand & logo',
    'storyboards-motion-refs': 'Storyboards',
    'social-content': 'Social & content',
    'avatar-portrait': 'Avatar & portrait',
    'illustration-style': 'Illustration & style',
    'motion-effects': 'Motion & effects',
    'social-short-form': 'Social short form',
    'marketing-product': 'Marketing & product',
    'data-explainers': 'Data & explainers',
    'cinematic-story': 'Cinematic story',
  },

  detailUseCta: 'Use this plugin →',
  detailFindOnGithub: 'Find on GitHub →',
  detailHomepage: 'Homepage ↗',
  detailMode: 'Mode',
  detailScenario: 'Scenario',
  detailPlatform: 'Platform',
  detailSurface: 'Surface',
  detailAuthor: 'Author',
  detailManifestId: 'Manifest id',
  detailTags: 'Tags',
  detailPreviewCaption: 'Preview from the bundled-plugin manifest.',
  detailClickForLivePreview: 'Click for live preview ↗',
  detailOpenInNewTab: 'Open in new tab ↗',
  detailOpenInNewTabAria: 'Open in new tab',
  detailBucketLabel: {
    examples: 'Example',
    'image-templates': 'Image template',
    'video-templates': 'Video template',
    scenarios: 'Scenario',
    'design-systems': 'Design system',
    atoms: 'Atom',
  },

  breadcrumbLabel: 'Breadcrumb',
  shareDialogClose: 'Close',
  previewImageAlt: (title) => `${title} preview`,
  previewSummaryAria: (title) => `Open interactive preview for ${title}`,
  previewIframeTitle: (title) => `${title} interactive preview`,

  shareOpen: 'Share ↗',
  shareTitle: 'Share this plugin',
  shareLead:
    'Copy the message below, then jump to the platform you want to share on and paste.',
  shareCopyText: 'Copy text',
  shareCopyLink: 'Copy link only',
  shareJumpTo: 'Then jump to:',
  shareTemplate: ({ title, url }) =>
    `🎨 Just discovered ${title} on @opendesignai — the open-source Claude Design alternative.
✨ Local-first · BYOK · your agent does the design.

→ ${url}`,

  // Templates grid (PR #3185)
  templatesHeroEyebrow: 'Open Source Claude Design',
  templatesHeroLead:
    'Agent-built artifacts you can fork and ship — prototypes, slides, image and video templates. Run them on your own keys with the local agent; the prompts, posters, and example HTML are all under Apache-2.0.',
  templatesCounterLabel: 'Total',
  cardFeaturedTag: 'Featured',
  cardReadFullPrompt: 'Read full prompt →',
  cardUseTemplate: 'Use this template',
  cardShareAria: (title) => `Share ${title}`,
  faqHead: 'FAQ',
  faqItems: [
    {
      question: 'What are Open Design templates?',
      answer:
        'Bundled-plugin templates that ship with Open Design — the open source Claude Design alternative. Each one is a runnable artifact: a prototype, slide deck, image generator, video composition, or HyperFrames motion piece. Your local agent runs the plugin against its prompt and an optional example HTML, and produces a ready-to-share asset on your own machine.',
    },
    {
      question: 'How are templates licensed?',
      answer:
        'Apache-2.0 across the board. Fork the prompt, adapt the <code>example.html</code>, change the brand tokens — the only ask is that you keep the LICENSE notice when you redistribute.',
    },
    {
      question: 'Can I run them with my own API keys?',
      answer:
        "Yes. Open Design is BYOK at every layer — your Claude / OpenAI / local-model credentials never leave your machine. The marketing site doesn't proxy any inference; the live previews you see on the catalogue rows come from posters and Cloudflare Stream URLs the templates ship with, not from a hosted runtime.",
    },
    {
      question: 'How do I contribute a template?',
      answer:
        'Open a PR against <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> with a new folder containing <code>open-design.json</code>, <code>SKILL.md</code>, and a runnable <code>example.html</code>. The contributor guide in the repo&rsquo;s <code>CONTRIBUTING.md</code> walks through the manifest fields. Approved contributions land in the public catalogue and surface here automatically on the next deploy.',
    },
    {
      question: 'How is this different from Claude Design Studio?',
      answer:
        "Claude Design Studio is Anthropic's hosted product. Open Design is the <strong>open source Claude Design alternative</strong> — every template, prompt, and design system in this catalogue lives in a public repo, runs locally against the keys you choose, and can be extended through plugins anyone can author. We mirror the same artifact taxonomy (prototypes, slides, images, video) so the mental model carries over, but everything down to the agent runtime stays on your machine.",
    },
    {
      question: 'Where do the previews come from?',
      answer:
        'Each template&rsquo;s manifest carries a poster URL (Cloudflare CDN) and, for video templates, a Cloudflare Stream MP4. The grid renders the poster as the static thumbnail and swaps in the looping video on hover. Image and prototype templates show their poster directly; clicking through opens the runnable <code>example.html</code> on the detail page.',
    },
  ],
};

const overrides: Partial<Record<LandingLocaleCode, Partial<PluginsCopy>>> = {
  zh: {
    hubLabel: '插件库',
    hubHeading: (n) => `${n} 个可组合的构件。`,
    hubLead:
      'Open Design 围绕四类插件构建：Templates 与 Skills 是 agent 真正运行的内容，Systems 与 Craft 让它保持品牌一致和可访问。点进任意一类深入查看，或直接跳到你已经知道 slug 的那一项。',
    tileTemplates: '模板',
    tileSkills: '技能',
    tileSystems: '设计系统',
    tileCraft: '工艺',
    tileTemplatesBlurb:
      '可视化、可运行的模板——原型、幻灯片、图像与视频生成器、动效合成。每一条都附带 example.html，可以 fork、替换数据后直接交付。',
    tileSkillsBlurb:
      'agent 在任务中加载的指令型技能——文案、配色、创意指导、头脑风暴。纯 SKILL.md 文档，输出取决于你的输入。',
    tileSystemsBlurb:
      '锚定品牌的设计系统——色板、字体、动效、文风。把项目绑到某个系统，所有插件输出都会继承同一身份。',
    tileCraftBlurb:
      '与品牌无关的工艺规则——可访问性、RTL、动效缓动、摄影伦理。Skills 通过 `od.craft.requires` 选用，插件自动继承相应严谨度。',
    browseTemplates: '浏览模板',
    browseSkills: '浏览技能',
    browseSystems: '浏览系统',
    browseCraft: '浏览工艺',
    templatesLabel: '插件 · 模板',
    templatesHeading: (n) => `${n} 个可运行的模板。`,
    templatesLead:
      '每个模板都附带可用的预览——目录中的缩略图直接来自 agent 在产品里使用的 manifest 海报。浏览全部，或按七大产物类型筛选。',
    skillsLabel: '插件 · 技能',
    skillsHeading: (n) => `${n} 个指令型技能。`,
    skillsLead:
      'agent 在任务中加载的技能——文案、配色、创意指导、头脑风暴。没有静态 demo，输出取决于你的输入，所以每个详情页像一份简报：标题、描述、触发词、出处。',
    systemsLabel: '插件 · 设计系统',
    systemsHeading: () => '为你的 agent 准备的设计系统',
    systemsLead:
      '浏览真实世界的设计系统范例——品牌级的色板、字体、动效与文风，你的 coding agent 可一键套用到任何项目。每个系统都开源，支持 Claude、Codex、Cursor 等。',
    systemsMetaTitle: (n) => `设计系统范例 — ${n} 个开源设计系统 | Open Design`,
    systemsMetaDescription:
      '浏览你的 coding agent 可自动套用的设计系统范例——来自真实品牌的色板、字体、动效与文风。开源、BYOK，支持 Claude、Codex、Cursor。',
    systemsAboutHead: '什么是设计系统？',
    systemsAboutBody:
      '设计系统是一套可复用的品牌基础——色板、字体、间距、动效与文风——让每个界面保持一致。在 Open Design 中，每个设计系统都是一个插件：把项目绑到某个系统，你的 coding agent 会自动继承它的色板、字体、动效与文风，产出始终贴合品牌。',
    detailSystemLabel: '设计系统',
    searchPlaceholder: '按名称或关键词搜索…',
    searchNoResults: '没有匹配项，换个关键词试试。',
    systemPreviewCaption: (name) =>
      `用 ${name} 设计系统 token 渲染的示例界面 —— 设计效果实时预览，非截图。`,
    systemCardCta: '查看设计系统 →',
    contributeTitle: '做了一个 plugin？把它上架到目录。',
    contributeBody:
      '这里的每个模板、skill、设计系统都可由社区扩展。直接提一个 pull request 加上你的，或者提个 issue 提议——合并后会自动出现在这个目录和产品里。',
    contributeCta: '提交 Pull Request →',
    contributeIssueCta: '或提个 Issue →',
    craftLabel: '插件 · 工艺',
    craftHeading: (n) => `${n} 条工艺规则。`,
    craftLead:
      '与品牌无关的工艺规则——可访问性、RTL、动效缓动、摄影伦理。Skills 通过 `od.craft.requires` 选用，插件自动继承相应严谨度。',
    artifactKindLabel: '产物类型',
    sceneLabel: '场景',
    allChip: '全部',
    category: {
      prototype: { label: '原型', description: '交互式产品稿——仪表盘、应用、落地页、内部工具。任何能交给 stakeholder 点击的东西。' },
      'live-artifact': { label: '实时产物', description: '可刷新、感知数据的产物，底层数据变化时自动重新渲染。实时仪表盘、监控板、周期跟踪。' },
      deck: { label: '幻灯片', description: '从叙事简报生成的精致 deck——融资 deck、课程模块、周报、产品发布。' },
      image: { label: '图像', description: '从结构化创意指令生成的图像——UI 稿、品牌视觉、分镜、社媒、插画。' },
      video: { label: '视频', description: '视频提示词、分镜与可渲染的动态产物——短视频、营销片段、动效图形、电影感故事。' },
      hyperframes: { label: 'HyperFrames', description: 'HyperFrames 就绪的动效合成——agent 构建的视频，融合模板 HTML 与帧级关键帧。' },
      audio: { label: '音频', description: '从简报生成的音频、人声与声音设计——播客片头、音乐衬底、环境音。' },
    },
    subcategory: {
      'business-dashboards': '仪表盘', 'app-prototypes': '应用', 'landing-marketing': '落地页 / 营销',
      'developer-tools': '开发者工具', 'docs-reports': '文档 / 报告', 'brand-design': '品牌 / 设计',
      'pitch-business': '路演 / 商业', 'course-training': '课程 / 培训', 'reports-briefings': '报告 / 简报',
      'product-sales': '产品 / 销售', 'engineering-talks': '工程演讲', 'creative-decks': '创意 deck',
      'ui-product-mockups': 'UI / 产品稿', 'brand-visuals': '品牌 / Logo', 'storyboards-motion-refs': '分镜',
      'social-content': '社媒 / 内容', 'avatar-portrait': '头像 / 肖像', 'illustration-style': '插画 / 风格',
      'motion-effects': '动效', 'social-short-form': '短视频', 'marketing-product': '营销 / 产品',
      'data-explainers': '数据讲解', 'cinematic-story': '电影感叙事',
    },
    detailUseCta: '使用此插件 →', detailFindOnGithub: '在 GitHub 上查看 →', detailHomepage: '主页 ↗',
    detailMode: '模式', detailScenario: '场景', detailPlatform: '平台', detailSurface: '形态',
    detailAuthor: '作者', detailManifestId: 'Manifest ID', detailTags: '标签',
    detailPreviewCaption: '来自 bundled-plugin manifest 的预览。',
    detailClickForLivePreview: '点击预览实时效果 ↗', detailOpenInNewTab: '在新标签打开 ↗',
    detailBucketLabel: { examples: '示例', 'image-templates': '图像模板', 'video-templates': '视频模板', scenarios: '场景', 'design-systems': '设计系统', atoms: 'Atom' },
    shareOpen: '分享 ↗', shareTitle: '分享这个插件',
    shareLead: '复制下面的文案，然后跳到你想分享的平台粘贴即可。',
    shareCopyText: '复制文案', shareCopyLink: '只复制链接', shareJumpTo: '跳转到：',
    shareTemplate: ({ title, url }) => `🎨 安利一个：@opendesignai 上的 ${title} —— Claude Design 的开源替代品。\n✨ 本地优先 · 自带模型 · 让你自己的 agent 做设计。\n\n→ ${url}`,
    detailOpenInNewTabAria: '在新标签打开',
    breadcrumbLabel: '面包屑导航',
    shareDialogClose: '关闭',
    previewImageAlt: (title) => `${title} 预览`,
    previewSummaryAria: (title) => `打开 ${title} 的互动预览`,
    previewIframeTitle: (title) => `${title} 互动预览`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: '开源 Claude Design',
    templatesHeroLead:
      'Agent 生成的可复刻交付物 — 原型、幻灯片、图像和视频模板。使用本地 agent 在你自己的密钥上运行；所有提示词、海报和示例 HTML 都基于 Apache-2.0 许可证开源。',
    templatesCounterLabel: '总计',
    cardFeaturedTag: '精选',
    cardReadFullPrompt: '查看完整提示词 →',
    cardUseTemplate: '使用此模板',
    cardShareAria: (title) => `分享 ${title}`,
    faqHead: '常见问题',
    faqItems: [
      {
        question: '什么是 Open Design 模板？',
        answer:
          'Open Design 附带的打包插件模板 — Open Design 是开源的 Claude Design 替代品。每个模板都是一个可运行的交付物：原型、幻灯片组、图像生成器、视频合成或 HyperFrames 动画作品。本地 agent 根据提示词和可选的示例 HTML 运行插件，在你的机器上生成可立即分享的资源。',
      },
      {
        question: '模板采用什么许可证？',
        answer:
          '全部采用 Apache-2.0 许可证。你可以复刻提示词、修改 <code>example.html</code>、改变品牌标识 — 唯一的要求是在重新分发时保留 LICENSE 声明。',
      },
      {
        question: '我可以用自己的 API 密钥运行它们吗？',
        answer:
          '可以。Open Design 在每个层级都支持 BYOK（自带密钥）— 你的 Claude / OpenAI / 本地模型凭证永远不会离开你的机器。营销网站不会代理任何推理；你在目录行中看到的实时预览来自模板附带的海报和 Cloudflare Stream URL，而不是来自托管的运行时。',
      },
      {
        question: '我如何贡献一个模板？',
        answer:
          '向 <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> 提交 PR，新文件夹包含 <code>open-design.json</code>、<code>SKILL.md</code> 和可运行的 <code>example.html</code>。仓库中的 <code>CONTRIBUTING.md</code> 贡献指南会逐步说明清单字段。被批准的贡献会进入公开目录，在下次部署时自动显示在此处。',
      },
      {
        question: '这与 Claude Design Studio 有什么区别？',
        answer:
          'Claude Design Studio 是 Anthropic 的托管产品。Open Design 是**开源的 Claude Design 替代品** — 此目录中的每个模板、提示词和设计系统都存在于公开仓库中，针对你选择的密钥在本地运行，并可通过任何人都能创作的插件进行扩展。我们采用相同的交付物分类法（原型、幻灯片、图像、视频），便于概念转移，但从 agent 运行时到其他所有内容都保留在你的机器上。',
      },
      {
        question: '预览从哪里来？',
        answer:
          '每个模板的清单都包含一个海报 URL（Cloudflare CDN）以及视频模板的 Cloudflare Stream MP4。网格将海报呈现为静态缩略图，悬停时切换到循环视频。图像和原型模板直接显示其海报；点击进入会在详情页面打开可运行的 <code>example.html</code>。',
      },
    ],
  },
  'zh-tw': {
    hubLabel: '外掛庫', hubHeading: (n) => `${n} 個可組合的元件。`,
    hubLead: 'Open Design 圍繞四類外掛構建：Templates 與 Skills 是 agent 真正執行的內容，Systems 與 Craft 讓它保持品牌一致與可存取性。',
    tileTemplates: '範本', tileSkills: '技能', tileSystems: '設計系統', tileCraft: '工藝',
    browseTemplates: '瀏覽範本', browseSkills: '瀏覽技能', browseSystems: '瀏覽系統', browseCraft: '瀏覽工藝',
    artifactKindLabel: '產物類型', sceneLabel: '場景', allChip: '全部',
    detailUseCta: '使用此外掛 →', detailFindOnGithub: '在 GitHub 上查看 →',
    detailClickForLivePreview: '點擊預覽即時效果 ↗', detailOpenInNewTab: '在新分頁開啟 ↗',
    shareOpen: '分享 ↗', shareTitle: '分享這個外掛',
    shareLead: '複製下面的文案，然後跳到你想分享的平台貼上即可。',
    shareCopyText: '複製文案', shareCopyLink: '只複製連結', shareJumpTo: '跳轉到：',
    shareTemplate: ({ title, url }) => `🎨 推薦一個：@opendesignai 上的 ${title} —— Claude Design 的開源替代品。\n✨ 本地優先 · 自帶模型 · 讓你自己的 agent 做設計。\n\n→ ${url}`,
    tileTemplatesBlurb: '可視覺、可執行的模板——原型、簡報、影像與影片產生器、動效合成。每一條都附 example.html，fork 即可換資料、出貨。',
    tileSkillsBlurb: 'agent 在任務途中載入的指令技能——文案、色彩理論、創意指導、發想。純 SKILL.md 文字；產出取決於你輸入什麼。',
    tileSystemsBlurb: '品牌錨定的設計系統——色票、字體、動效、語氣。把專案綁到一個系統，所有外掛產出都會繼承同一個識別。',
    tileCraftBlurb: '與品牌無關的工藝規則——可達性、RTL、動效曲線、攝影倫理。技能透過 `od.craft.requires` opt-in，外掛自動繼承對應的嚴謹度。',
    templatesLabel: '外掛 · 模板',
    templatesHeading: (n) => `${n} 個可執行模板。`,
    templatesLead: '每個模板都附可運作的預覽——目錄縮圖直接來自 agent 在產品內使用的 manifest poster。可以全部瀏覽，也可以跳到七種產出類型之一。',
    skillsLabel: '外掛 · 技能',
    skillsHeading: (n) => `${n} 個指令技能。`,
    skillsLead: 'agent 任務中載入的技能——文案、色彩、創意指導、發想。沒有靜態 demo，因為產出取決於你的輸入；每個詳情頁讀起來像一份 brief：標題、描述、觸發條件、署名。',
    systemsLabel: '外掛 · 設計系統',
    systemsHeading: () => '為你的 agent 準備的設計系統',
    systemsLead: '瀏覽真實世界的設計系統範例——品牌級的色票、字體、動效與語氣，你的 coding agent 可一鍵套用到任何專案。每個系統都開源，支援 Claude、Codex、Cursor 等。',
    systemsMetaTitle: (n) => `設計系統範例 — ${n} 個開源設計系統 | Open Design`,
    systemsMetaDescription: '瀏覽你的 coding agent 可自動套用的設計系統範例——來自真實品牌的色票、字體、動效與語氣。開源、BYOK，支援 Claude、Codex、Cursor。',
    systemsAboutHead: '什麼是設計系統？',
    systemsAboutBody: '設計系統是一套可重用的品牌基礎——色票、字體、間距、動效與語氣——讓每個介面保持一致。在 Open Design 中，每個設計系統都是一個外掛：綁定專案到某個系統，你的 coding agent 會自動繼承它的色票、字體、動效與語氣，產出始終貼合品牌。',
    detailSystemLabel: '設計系統',
    searchPlaceholder: '依名稱或關鍵字搜尋…',
    searchNoResults: '沒有相符項目，換個關鍵字試試。',
    systemPreviewCaption: (name) =>
      `用 ${name} 設計系統 token 渲染的範例介面 —— 設計效果即時預覽，非截圖。`,
    systemCardCta: '檢視設計系統 →',
    contributeTitle: '做了一個 plugin？把它上架到目錄。',
    contributeBody:
      '這裡的每個範本、skill、設計系統都可由社群擴充。直接提一個 pull request 加上你的，或者提個 issue 提議——合併後會自動出現在這個目錄和產品裡。',
    contributeCta: '提交 Pull Request →',
    contributeIssueCta: '或提個 Issue →',
    craftLabel: '外掛 · 工藝',
    craftHeading: (n) => `${n} 條工藝原則。`,
    craftLead: '與品牌無關的工藝規則——可達性、RTL、動效曲線、攝影倫理。技能透過 `od.craft.requires` opt-in，外掛自動繼承相應嚴謹度。',
    detailHomepage: '首頁 ↗',
    detailMode: '模式',
    detailScenario: '場景',
    detailPlatform: '平台',
    detailSurface: '表面',
    detailAuthor: '作者',
    detailManifestId: 'Manifest ID',
    detailTags: '標籤',
    detailPreviewCaption: '來自 bundled-plugin manifest 的預覽。',
    detailBucketLabel: { examples: '範例', 'image-templates': '影像模板', 'video-templates': '影片模板', scenarios: '場景', 'design-systems': '設計系統', atoms: 'Atom' },
    detailOpenInNewTabAria: '在新分頁開啟',
    breadcrumbLabel: '麵包屑導覽',
    shareDialogClose: '關閉',
    previewImageAlt: (title) => `${title} 預覽`,
    previewSummaryAria: (title) => `開啟 ${title} 的互動預覽`,
    previewIframeTitle: (title) => `${title} 互動預覽`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: '開源 Claude Design',
    templatesHeroLead:
      'Agent 生成的可分叉與發佈的成品 — 原型、簡報、圖像和影片範本。使用本機 agent 在你自己的金鑰上執行；所有提示、海報和範例 HTML 均採用 Apache-2.0 授權。',
    templatesCounterLabel: '總計',
    cardFeaturedTag: '精選',
    cardReadFullPrompt: '閱讀完整提示 →',
    cardUseTemplate: '使用此範本',
    cardShareAria: (title) => `分享 ${title}`,
    faqHead: '常見問題',
    faqItems: [
      {
        question: 'Open Design 範本是什麼？',
        answer:
          'Open Design 隨附的套裝外掛範本 — 開源 Claude Design 替代方案。每一個都是可執行的成品：原型、簡報、圖像生成器、影片編排或 HyperFrames 動畫作品。你的本機 agent 會針對其提示和可選的範例 HTML 執行外掛，並在你自己的機器上生成可立即分享的資產。',
      },
      {
        question: '範本如何授權？',
        answer:
          '全部採用 Apache-2.0 授權。分叉提示、調整 <code>example.html</code>、變更品牌權杖 — 唯一的要求是在你重新發佈時保留 LICENSE 聲明。',
      },
      {
        question: '我可以用自己的 API 金鑰執行它們嗎？',
        answer:
          '可以。Open Design 在每一層都支持 BYOK — 你的 Claude / OpenAI / 本機模型憑證永遠不會離開你的機器。行銷網站不會代理任何推理；你在目錄列中看到的即時預覽來自範本隨附的海報和 Cloudflare Stream URL，而非託管執行時環境。',
      },
      {
        question: '我如何貢獻範本？',
        answer:
          '針對 <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> 開立 PR，其中包含新資料夾，內含 <code>open-design.json</code>、<code>SKILL.md</code> 和可執行的 <code>example.html</code>。回購中 <code>CONTRIBUTING.md</code> 內的貢獻者指南會詳細說明清單欄位。已核准的貢獻將登陸公開目錄，並在下一次部署時自動出現在此處。',
      },
      {
        question: '這與 Claude Design Studio 有什麼不同？',
        answer:
          'Claude Design Studio 是 Anthropic 的託管產品。Open Design 是 <strong>開源 Claude Design 替代方案</strong> — 此目錄中的每一個範本、提示和設計系統都存在於公開回購中、針對你選擇的金鑰在本機執行，並可透過任何人都能編寫的外掛進行擴充。我們採用相同的成品分類系統（原型、簡報、圖像、影片），所以心理模型保持一致，但從 agent 執行時環境一切都保留在你的機器上。',
      },
      {
        question: '預覽從何而來？',
        answer:
          '每個範本的清單都包含海報 URL（Cloudflare CDN）以及影片範本的 Cloudflare Stream MP4。網格將海報呈現為靜態縮圖，並在滑鼠懸停時換入循環影片。圖像和原型範本直接顯示其海報；點擊會在詳細頁面上開啟可執行的 <code>example.html</code>。',
      },
    ],
    category: {
      prototype: {
        label: '原型',
        description:
          '互動式產品模型 — 儀表板、應用程式、登陸頁面、內部工具。任何你會遞交給利益相關者並點擊瀏覽的內容。',
      },
      'live-artifact': {
        label: '互動成品',
        description:
          '可重新整理且資料感知的成品，每當基礎資料變更時就會重新呈現。即時儀表板、監控板、循環追蹤器。',
      },
      deck: {
        label: '簡報',
        description:
          '從敘事簡要生成的精美簡報 — 推介簡報、課程模組、週報、產品發布。',
      },
      image: {
        label: '圖像',
        description:
          '從結構化創意指導生成的圖像資產 — UI 模型、品牌視覺、故事板、社群貼文、插圖。',
      },
      video: {
        label: '影片',
        description:
          '影片提示、故事板和可渲染的動畫成品 — 短影片社群、行銷剪輯、動畫圖形、電影故事。',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames 就緒的動畫編排 — Agent 生成的影片，融合範本提示、場景指導和品牌線索成可呈現的時間線。',
      },
      audio: {
        label: '音訊',
        description:
          '短形式聲音識別的音訊提示和素材 — UI 音效、轉場提示音、旁白腳本。',
      },
    },
    subcategory: {
      'business-dashboards': '儀表板',
      'app-prototypes': '應用程式',
      'landing-marketing': '登陸頁·行銷',
      'developer-tools': '開發者工具',
      'docs-reports': '文件·報告',
      'brand-design': '品牌·設計',
      'pitch-business': '提案·商務',
      'course-training': '課程·培訓',
      'reports-briefings': '報告·簡報',
      'product-sales': '產品·銷售',
      'engineering-talks': '工程分享',
      'creative-decks': '創意簡報',
      'ui-product-mockups': 'UI·產品模型',
      'brand-visuals': '品牌·標誌',
      'storyboards-motion-refs': '分鏡腳本',
      'social-content': '社群·內容',
      'avatar-portrait': '頭像·肖像',
      'illustration-style': '插圖·風格',
      'motion-effects': '動畫·特效',
      'social-short-form': '社群短影音',
      'marketing-product': '行銷·產品',
      'data-explainers': '資料·圖解',
      'cinematic-story': '電影敘事',
    },
  },
  ja: {
    hubLabel: 'プラグインライブラリ', hubHeading: (n) => `${n} 個の組み合わせ可能なパーツ。`,
    tileTemplates: 'テンプレート', tileSkills: 'スキル', tileSystems: 'システム', tileCraft: 'クラフト',
    browseTemplates: 'テンプレートを見る', browseSkills: 'スキルを見る', browseSystems: 'システムを見る', browseCraft: 'クラフトを見る',
    artifactKindLabel: '成果物の種類', sceneLabel: 'シーン', allChip: 'すべて',
    detailUseCta: 'このプラグインを使う →', detailFindOnGithub: 'GitHub で見る →',
    detailClickForLivePreview: 'クリックでライブプレビュー ↗', detailOpenInNewTab: '新しいタブで開く ↗',
    shareOpen: '共有 ↗', shareTitle: 'このプラグインを共有',
    shareLead: '下のメッセージをコピーしてから、共有したいプラットフォームに移動して貼り付けてください。',
    shareCopyText: 'テキストをコピー', shareCopyLink: 'リンクのみコピー', shareJumpTo: 'プラットフォームへ：',
    shareTemplate: ({ title, url }) => `🎨 @opendesignai で ${title} を発見 —— オープンソースの Claude Design 代替。\n✨ ローカル優先 · BYOK · あなたのエージェントが設計する。\n\n→ ${url}`,
    hubLead: 'Open Design は 4 種類のプラグインを軸に作られています：テンプレートとスキルは agent が実行するもの、システムとクラフトはブランドとアクセシビリティを守るもの。セクションを選んで掘り下げるか、目当ての slug が決まっているなら直接ジャンプしてください。',
    tileTemplatesBlurb: 'ビジュアルで実行可能なテンプレート——プロトタイプ、スライド、画像／動画ジェネレーター、モーション合成。すべての項目に example.html が同梱されており、fork してデータを差し替えればすぐ出荷できます。',
    tileSkillsBlurb: 'agent がタスク途中で読み込む指示スキル——コピー、カラーセオリー、クリエイティブディレクション、ブレスト。純粋な SKILL.md テキストで、結果はあなたの入力次第です。',
    tileSystemsBlurb: 'ブランドに紐づくデザインシステム——パレット、タイポグラフィ、モーション、トーン。プロジェクトをシステムに紐づければ、すべてのプラグイン出力が同じアイデンティティを引き継ぎます。',
    tileCraftBlurb: 'ブランドに依存しないクラフトルール——アクセシビリティ、RTL、モーションイージング、写真倫理。スキルは `od.craft.requires` で opt-in し、プラグインは適切な厳密さを自動的に継承します。',
    templatesLabel: 'プラグイン · テンプレート',
    templatesHeading: (n) => `${n} 個の実行可能テンプレート。`,
    templatesLead: 'すべてのテンプレートに動作するプレビューが付属——カタログのサムネイルは、agent がプロダクト内部で使う manifest poster からそのまま取得しています。一覧を眺めるか、7 つの成果物タイプのいずれかに直接ジャンプしてください。',
    skillsLabel: 'プラグイン · スキル',
    skillsHeading: (n) => `${n} 個の指示スキル。`,
    skillsLead: 'agent がタスク途中で読み込むスキル——コピー、カラーセオリー、クリエイティブディレクション、ブレスト。結果は入力次第のため静的 demo はありません。各詳細ページは brief のように読めます：タイトル、説明、トリガー、クレジット。',
    systemsLabel: 'プラグイン · システム',
    systemsHeading: (n) => `${n} 個のデザインシステム。`,
    systemsLead: 'プラグインが `od.craft.requires` で採用できるブランド紐付きデザインシステム。それぞれパレット、タイポグラフィ、モーション、ボイスを持ち、プロジェクトをシステムに紐づければすべてのプラグイン出力が同じアイデンティティを引き継ぎます。',
    craftLabel: 'プラグイン · クラフト',
    craftHeading: (n) => `${n} 個のクラフト原則。`,
    craftLead: 'ブランド非依存のクラフトルール——アクセシビリティ、RTL、モーションイージング、写真倫理。スキルは `od.craft.requires` で opt-in し、プラグインは適切な厳密さを自動継承します。',
    detailHomepage: 'ホームページ ↗',
    detailMode: 'モード',
    detailScenario: 'シーン',
    detailPlatform: 'プラットフォーム',
    detailSurface: 'サーフェス',
    detailAuthor: '作者',
    detailManifestId: 'Manifest ID',
    detailTags: 'タグ',
    detailPreviewCaption: 'bundled-plugin manifest からのプレビュー。',
    detailBucketLabel: { examples: 'サンプル', 'image-templates': '画像テンプレート', 'video-templates': '動画テンプレート', scenarios: 'シーン', 'design-systems': 'デザインシステム', atoms: 'Atom' },
    detailOpenInNewTabAria: '新しいタブで開く',
    breadcrumbLabel: 'パンくずリスト',
    shareDialogClose: '閉じる',
    previewImageAlt: (title) => `${title} のプレビュー`,
    previewSummaryAria: (title) => `${title} のインタラクティブプレビューを開く`,
    previewIframeTitle: (title) => `${title} のインタラクティブプレビュー`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'エージェントが生成したアーティファクト — プロトタイプ、スライド、画像・動画テンプレート — をフォークしてそのままデプロイできます。ローカルエージェントで独自のキーを使って実行できます。プロンプト、ポスター、サンプルHTMLすべてApache-2.0ライセンスです。',
    templatesCounterLabel: '合計',
    cardFeaturedTag: 'おすすめ',
    cardReadFullPrompt: 'プロンプト全文を読む →',
    cardUseTemplate: 'このテンプレートを使う',
    cardShareAria: (title) => `${title}を共有`,
    faqHead: 'よくある質問',
    faqItems: [
      {
        question: 'Open Designのテンプレートとは？',
        answer:
          'Open Designに付属するバンドル型プラグインテンプレートです。Open DesignはオープンソースのClaude Design代替ツールです。各テンプレートは実行可能なアーティファクト — プロトタイプ、スライドセット、画像生成器、動画コンポジション、またはHyperFramesモーション作品のいずれか。ローカルエージェントがプロンプトとオプションのサンプルHTMLに対してプラグインを実行し、あなたのマシン上で共有可能なアセットを生成します。',
      },
      {
        question: 'テンプレートのライセンスは？',
        answer:
          'すべてApache-2.0です。プロンプトをフォーク、<code>example.html</code>を修正、ブランドトークンを変更 — 再配布する際はLICENSE通知を保持するだけです。',
      },
      {
        question: '自分のAPIキーで実行できますか？',
        answer:
          '可能です。Open Designはあらゆる層でBYOK対応 — あなたのClaude / OpenAI / ローカルモデルの認証情報はマシンを離れません。マーケティングサイトは推論をプロキシしません。カタログ行に表示されるライブプレビューはテンプレートに付属するポスターとCloudflare Stream URLから来たもので、ホストされたランタイムからではありません。',
      },
      {
        question: 'テンプレートはどうやって投稿しますか？',
        answer:
          '<a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a>に対してPRを開き、<code>open-design.json</code>、<code>SKILL.md</code>、実行可能な<code>example.html</code>を含む新しいフォルダを追加してください。リポジトリの<code>CONTRIBUTING.md</code>に投稿ガイドがあり、マニフェストフィールドについて説明しています。承認された投稿は公開カタログに載り、次のデプロイで自動的にここに表示されます。',
      },
      {
        question: 'Claude Design Studioとの違いは？',
        answer:
          'Claude Design StudioはAnthropicのホスト型プロダクトです。Open Designは<strong>オープンソースのClaude Design代替ツール</strong> — このカタログ内のすべてのテンプレート、プロンプト、デザインシステムは公開リポジトリに存在し、あなたが選んだキーでローカルで実行でき、誰でも作成できるプラグインを通じて拡張可能です。同じアーティファクト分類（プロトタイプ、スライド、画像、動画）をミラーしているのでメンタルモデルは引き継がれますが、エージェントランタイムまですべてあなたのマシン上に留まります。',
      },
      {
        question: 'プレビューはどこから来ていますか？',
        answer:
          '各テンプレートのマニフェストにはポスターURL（Cloudflare CDN）が含まれ、動画テンプレートの場合はCloudflare Stream MP4が含まれます。グリッドはポスターを静的サムネイルとしてレンダリングし、ホバー時にループ動画に切り替わります。画像とプロトタイプテンプレートはポスターを直接表示します。クリックするとディテールページで実行可能な<code>example.html</code>が開きます。',
      },
    ],
    category: {
      prototype: {
        label: 'プロトタイプ',
        description:
          'インタラクティブなプロダクトモックアップ — ダッシュボード、アプリ、ランディングページ、社内ツール。ステークホルダーに渡してクリックスルーするようなもの。',
      },
      'live-artifact': {
        label: 'ライブアーティファクト',
        description:
          'リフレッシュ可能でデータ対応のアーティファクト — 基盤データが変わるたびに再レンダリング。ライブダッシュボード、モニタリングボード、定期トラッカー。',
      },
      deck: {
        label: 'スライド',
        description:
          'ナレーティブブリーフから生成された洗練されたスライドセット — ピッチデック、コースモジュール、週次レポート、プロダクトローンチ。',
      },
      image: {
        label: '画像',
        description:
          '構造化されたクリエイティブディレクションから生成されたイメージアセット — UIモックアップ、ブランドビジュアル、ストーリーボード、ソーシャルポスト、イラスト。',
      },
      video: {
        label: '動画',
        description:
          '動画プロンプト、ストーリーボード、レンダリング対応モーションアーティファクト — ショートフォームソーシャル、マーケティングカット、モーショングラフィックス、シネマティックストーリー。',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames対応モーションコンポジション — テンプレートプロンプト、シーンディレクション、ブランドキューをレンダリング可能なタイムラインにブレンドしたエージェント生成動画。',
      },
      audio: {
        label: 'オーディオ',
        description:
          'ショートフォームソニックアイデンティティのためのオーディオプロンプトとステム — UIサウンド、トランジショナルバンパー、ボイスオーバースクリプト。',
      },
    },
    subcategory: {
      'business-dashboards': 'ダッシュボード',
      'app-prototypes': 'アプリ',
      'landing-marketing': 'ランディング・マーケティング',
      'developer-tools': '開発者ツール',
      'docs-reports': 'ドキュメント・レポート',
      'brand-design': 'ブランド・デザイン',
      'pitch-business': 'ピッチ・ビジネス',
      'course-training': 'コース・トレーニング',
      'reports-briefings': 'レポート・ブリーフィング',
      'product-sales': 'プロダクト・セールス',
      'engineering-talks': 'エンジニアリング',
      'creative-decks': 'クリエイティブデッキ',
      'ui-product-mockups': 'UI・プロダクトモックアップ',
      'brand-visuals': 'ブランド・ロゴ',
      'storyboards-motion-refs': 'ストーリーボード',
      'social-content': 'ソーシャル・コンテンツ',
      'avatar-portrait': 'アバター・ポートレート',
      'illustration-style': 'イラスト・スタイル',
      'motion-effects': 'モーション・エフェクト',
      'social-short-form': 'ソーシャル短編',
      'marketing-product': 'マーケティング・プロダクト',
      'data-explainers': 'データ・解説',
      'cinematic-story': 'シネマティック',
    },
  },
  ko: {
    hubLabel: '플러그인 라이브러리', hubHeading: (n) => `${n}개의 조합 가능한 구성요소.`,
    tileTemplates: '템플릿', tileSkills: '스킬', tileSystems: '시스템', tileCraft: '크래프트',
    browseTemplates: '템플릿 보기', browseSkills: '스킬 보기', browseSystems: '시스템 보기', browseCraft: '크래프트 보기',
    artifactKindLabel: '산출물 종류', sceneLabel: '장면', allChip: '전체',
    detailUseCta: '이 플러그인 사용 →', detailFindOnGithub: 'GitHub에서 보기 →',
    detailClickForLivePreview: '클릭하여 라이브 프리뷰 ↗', detailOpenInNewTab: '새 탭에서 열기 ↗',
    shareOpen: '공유 ↗', shareTitle: '이 플러그인 공유',
    shareLead: '아래 메시지를 복사한 다음 공유할 플랫폼으로 이동해 붙여넣으세요.',
    shareCopyText: '텍스트 복사', shareCopyLink: '링크만 복사', shareJumpTo: '플랫폼으로:',
    shareTemplate: ({ title, url }) => `🎨 @opendesignai에서 ${title} 발견 —— 오픈 소스 Claude Design 대안.\n✨ 로컬 우선 · BYOK · 에이전트가 디자인합니다.\n\n→ ${url}`,
    hubLead: 'Open Design은 네 가지 플러그인 종류를 중심으로 구성됩니다: 템플릿과 스킬은 agent가 실행하는 것, 시스템과 크래프트는 브랜드와 접근성을 지키는 것. 섹션을 골라 들어가거나, 원하는 slug를 알고 있다면 바로 이동하세요.',
    tileTemplatesBlurb: '시각적이고 실행 가능한 템플릿——프로토타입, 슬라이드, 이미지 및 비디오 생성기, 모션 컴포지션. 모든 항목에 example.html이 포함되어 있어 fork하고 데이터만 바꾸면 바로 출시할 수 있습니다.',
    tileSkillsBlurb: 'agent가 작업 중에 로드하는 지시 스킬——카피라이팅, 컬러 이론, 크리에이티브 디렉션, 브레인스토밍. 순수 SKILL.md 텍스트이며 결과는 입력에 따라 달라집니다.',
    tileSystemsBlurb: '브랜드에 고정된 디자인 시스템——팔레트, 타이포그래피, 모션, 보이스. 프로젝트를 시스템에 연결하면 모든 플러그인 출력이 동일한 아이덴티티를 계승합니다.',
    tileCraftBlurb: '브랜드에 무관한 크래프트 규칙——접근성, RTL, 모션 이징, 사진 윤리. 스킬은 `od.craft.requires`로 opt-in하며 플러그인이 적절한 엄밀함을 자동으로 계승합니다.',
    templatesLabel: '플러그인 · 템플릿',
    templatesHeading: (n) => `${n}개의 실행 가능한 템플릿.`,
    templatesLead: '모든 템플릿에는 작동하는 프리뷰가 포함됩니다——카탈로그 썸네일은 agent가 제품 내에서 사용하는 manifest poster에서 바로 가져옵니다. 전체를 둘러보거나 7가지 산출물 종류 중 하나로 바로 이동하세요.',
    skillsLabel: '플러그인 · 스킬',
    skillsHeading: (n) => `${n}개의 지시 스킬.`,
    skillsLead: 'agent가 작업 도중 로드하는 스킬——카피라이팅, 컬러 이론, 크리에이티브 디렉션, 브레인스토밍. 결과는 입력에 따라 다르므로 정적 demo가 없습니다. 각 상세 페이지는 brief처럼 읽힙니다: 제목, 설명, 트리거, 크레딧.',
    systemsLabel: '플러그인 · 시스템',
    systemsHeading: (n) => `${n}개의 디자인 시스템.`,
    systemsLead: '플러그인이 `od.craft.requires`로 채택할 수 있는 브랜드 고정 디자인 시스템. 각자 팔레트, 타이포그래피, 모션, 보이스를 가지며 프로젝트를 시스템에 연결하면 모든 플러그인 출력이 같은 아이덴티티를 계승합니다.',
    craftLabel: '플러그인 · 크래프트',
    craftHeading: (n) => `${n}개의 크래프트 원칙.`,
    craftLead: '브랜드 무관 크래프트 규칙——접근성, RTL, 모션 이징, 사진 윤리. 스킬은 `od.craft.requires`로 opt-in하며 플러그인이 적절한 엄밀함을 자동 계승합니다.',
    detailHomepage: '홈페이지 ↗',
    detailMode: '모드',
    detailScenario: '장면',
    detailPlatform: '플랫폼',
    detailSurface: '서피스',
    detailAuthor: '작성자',
    detailManifestId: 'Manifest ID',
    detailTags: '태그',
    detailPreviewCaption: 'bundled-plugin manifest에서 가져온 프리뷰.',
    detailBucketLabel: { examples: '예시', 'image-templates': '이미지 템플릿', 'video-templates': '비디오 템플릿', scenarios: '장면', 'design-systems': '디자인 시스템', atoms: 'Atom' },
    detailOpenInNewTabAria: '새 탭에서 열기',
    breadcrumbLabel: '경로 탐색',
    shareDialogClose: '닫기',
    previewImageAlt: (title) => `${title} 프리뷰`,
    previewSummaryAria: (title) => `${title} 인터랙티브 프리뷰 열기`,
    previewIframeTitle: (title) => `${title} 인터랙티브 프리뷰`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      '에이전트가 만든 아티팩트를 포크해서 배포하세요 — 프로토타입, 슬라이드, 이미지, 비디오 템플릿. 로컬 에이전트에서 자신의 키로 실행하면 됩니다. 프롬프트, 포스터, 예제 HTML은 모두 Apache-2.0 라이선스입니다.',
    templatesCounterLabel: '전체',
    cardFeaturedTag: '추천',
    cardReadFullPrompt: '전체 프롬프트 보기 →',
    cardUseTemplate: '이 템플릿 사용하기',
    cardShareAria: (title) => `${title} 공유하기`,
    faqHead: '자주 묻는 질문',
    faqItems: [
      {
        question: 'Open Design 템플릿이란 무엇인가요?',
        answer:
          'Open Design — open source Claude Design 대체 솔루션과 함께 제공되는 번들 플러그인 템플릿입니다. 각각은 실행 가능한 아티팩트입니다: 프로토타입, 슬라이드 덱, 이미지 생성기, 비디오 컴포지션 또는 HyperFrames 모션 작품. 로컬 에이전트가 플러그인을 프롬프트 및 선택적 예제 HTML에 대해 실행하면, 자신의 머신에서 공유할 준비가 된 에셋을 생성합니다.',
      },
      {
        question: '템플릿은 어떤 라이선스를 사용하나요?',
        answer:
          '전부 Apache-2.0입니다. 프롬프트를 포크하고, <code>example.html</code>을 수정하고, 브랜드 토큰을 변경해도 괜찮습니다 — 재배포할 때 LICENSE 공지를 유지하면 됩니다.',
      },
      {
        question: '자신의 API 키로 실행할 수 있나요?',
        answer:
          '네, 가능합니다. Open Design은 모든 계층에서 BYOK를 지원합니다 — Claude / OpenAI / 로컬 모델 인증 정보가 머신을 떠나지 않습니다. 마케팅 사이트는 추론을 프록시하지 않고, 카탈로그 행에서 보는 라이브 미리보기는 호스팅된 런타임이 아니라 템플릿과 함께 제공되는 포스터 및 Cloudflare Stream URL에서 나옵니다.',
      },
      {
        question: '템플릿을 기여하려면 어떻게 하나요?',
        answer:
          '<a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a>에 PR을 열고 <code>open-design.json</code>, <code>SKILL.md</code>, 실행 가능한 <code>example.html</code>을 포함한 새 폴더를 추가하면 됩니다. 리포지토리의 <code>CONTRIBUTING.md</code>에 있는 기여자 가이드에서 매니페스트 필드를 안내합니다. 승인된 기여는 공개 카탈로그에 등록되고 다음 배포에서 자동으로 여기에 표시됩니다.',
      },
      {
        question: 'Claude Design Studio와 다른 점이 뭐죠?',
        answer:
          'Claude Design Studio는 Anthropic의 호스팅 제품입니다. Open Design은 <strong>open source Claude Design 대체 솔루션</strong>입니다 — 이 카탈로그의 모든 템플릿, 프롬프트, 디자인 시스템은 공개 리포지토리에 있고, 선택한 키에 대해 로컬에서 실행되며, 누구나 작성할 수 있는 플러그인을 통해 확장할 수 있습니다. 동일한 아티팩트 분류(프로토타입, 슬라이드, 이미지, 비디오)를 반영하므로 멘탈 모델이 유지되지만, 에이전트 런타임까지 모든 것이 머신에 머물러 있습니다.',
      },
      {
        question: '미리보기는 어디서 나오나요?',
        answer:
          '각 템플릿의 매니페스트에는 포스터 URL(Cloudflare CDN)과 비디오 템플릿의 경우 Cloudflare Stream MP4가 포함됩니다. 그리드는 포스터를 정적 썸네일로 렌더링하고 호버 시 루핑 비디오로 바뀝니다. 이미지 및 프로토타입 템플릿은 포스터를 직접 표시하고, 클릭하면 상세 페이지에서 실행 가능한 <code>example.html</code>을 엽니다.',
      },
    ],
    category: {
      prototype: {
        label: '프로토타입',
        description:
          '대시보드, 앱, 랜딩 페이지, 내부 도구 등 인터랙티브 제품 목업. 이해관계자와 함께 클릭하며 살펴볼 수 있는 모든 것.',
      },
      'live-artifact': {
        label: '라이브 아티팩트',
        description:
          '기본 데이터가 변경될 때마다 다시 렌더링되는 새로고침 가능하고 데이터 인식 아티팩트. 라이브 대시보드, 모니터링 보드, 반복 추적기.',
      },
      deck: {
        label: '슬라이드',
        description:
          '서사 브리프에서 만든 세련된 슬라이드 덱 — 피치 덱, 과정 모듈, 주간 보고서, 제품 런칭.',
      },
      image: {
        label: '이미지',
        description:
          '구조화된 창의적 방향에서 생성된 이미지 에셋 — UI 목업, 브랜드 시각, 스토리보드, 소셜 포스트, 일러스트.',
      },
      video: {
        label: '비디오',
        description:
          '비디오 프롬프트, 스토리보드, 렌더링 준비 완료된 모션 아티팩트 — 숏폼 소셜, 마케팅 컷, 모션 그래픽, 시네마틱 스토리.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames 준비 완료된 모션 컴포지션 — 템플릿 프롬프트, 씬 방향, 브랜드 큐를 렌더링 가능한 타임라인으로 혼합한 에이전트 구축 비디오.',
      },
      audio: {
        label: '오디오',
        description:
          '숏폼 소닉 아이덴티티를 위한 오디오 프롬프트 및 스템 — UI 사운드, 전환 범퍼, 보이스오버 스크립트.',
      },
    },
    subcategory: {
      'business-dashboards': '대시보드',
      'app-prototypes': '앱',
      'landing-marketing': '랜딩 & 마케팅',
      'developer-tools': '개발자 도구',
      'docs-reports': '문서 & 리포트',
      'brand-design': '브랜드 & 디자인',
      'pitch-business': '피치 & 비즈니스',
      'course-training': '강좌 & 교육',
      'reports-briefings': '리포트 & 브리핑',
      'product-sales': '제품 & 판매',
      'engineering-talks': '엔지니어링 토크',
      'creative-decks': '크리에이티브 덱',
      'ui-product-mockups': 'UI & 제품 목업',
      'brand-visuals': '브랜드 & 로고',
      'storyboards-motion-refs': '스토리보드',
      'social-content': '소셜 & 콘텐츠',
      'avatar-portrait': '아바타 & 초상화',
      'illustration-style': '일러스트 & 스타일',
      'motion-effects': '모션 & 이펙트',
      'social-short-form': '소셜 숏폼',
      'marketing-product': '마케팅 & 제품',
      'data-explainers': '데이터 & 설명',
      'cinematic-story': '시네마틱 스토리',
    },
  },
  de: {
    hubLabel: 'Plugin-Bibliothek', hubHeading: (n) => `${n} kombinierbare Bausteine.`,
    tileTemplates: 'Vorlagen', tileSkills: 'Skills', tileSystems: 'Systeme', tileCraft: 'Handwerk',
    browseTemplates: 'Vorlagen ansehen', browseSkills: 'Skills ansehen', browseSystems: 'Systeme ansehen', browseCraft: 'Handwerk ansehen',
    artifactKindLabel: 'Artefakt-Art', sceneLabel: 'Szene', allChip: 'Alle',
    detailUseCta: 'Plugin nutzen →', detailFindOnGithub: 'Auf GitHub ansehen →',
    detailClickForLivePreview: 'Klicken für Live-Vorschau ↗', detailOpenInNewTab: 'In neuem Tab öffnen ↗',
    shareOpen: 'Teilen ↗', shareTitle: 'Diesen Plugin teilen',
    shareLead: 'Kopiere die Nachricht unten und füge sie auf der gewünschten Plattform ein.',
    shareCopyText: 'Text kopieren', shareCopyLink: 'Nur Link kopieren', shareJumpTo: 'Zur Plattform:',
    shareTemplate: ({ title, url }) => `🎨 Gerade entdeckt: ${title} auf @opendesignai — die Open-Source-Alternative zu Claude Design.\n✨ Local-first · BYOK · dein Agent designt.\n\n→ ${url}`,
    hubLead: 'Open Design ist um vier Plugin-Arten herum gebaut: Templates und Skills sind das, was dein Agent ausführt; Systems und Craft halten Marke und Zugänglichkeit. Wähle eine Sektion zum Vertiefen oder springe direkt zu einem Slug, wenn du schon weißt, welches du willst.',
    tileTemplatesBlurb: 'Visuelle, lauffähige Templates — Prototypen, Slides, Bild- und Video-Generatoren, Motion-Kompositionen. Jeder Eintrag liefert eine example.html, sodass du forken, Daten austauschen und ausliefern kannst.',
    tileSkillsBlurb: 'Instruktions-Skills, die der Agent mitten in einer Aufgabe lädt — Texten, Farbenlehre, Creative Direction, Brainstorming. Reine SKILL.md-Prosa; das Ergebnis hängt von deiner Eingabe ab.',
    tileSystemsBlurb: 'Marken-verankerte Designsysteme — Palette, Typografie, Motion, Voice. Verbinde ein Projekt mit einem System und jedes Plugin-Output erbt dieselbe Identität.',
    tileCraftBlurb: 'Markenneutrale Craft-Regeln — Barrierefreiheit, RTL, Motion-Easing, Fotografie-Ethik. Skills opten via `od.craft.requires` ein, sodass ein Plugin automatisch die richtige Strenge erbt.',
    templatesLabel: 'Plugins · Templates',
    templatesHeading: (n) => `${n} lauffähige Templates.`,
    templatesLead: 'Jedes Template kommt mit einer funktionierenden Preview — die Thumbnails der Katalogzeilen stammen direkt aus dem Manifest-Poster, den der Agent im Produkt benutzt. Schau dir alle an oder springe zu einer der sieben Artefakt-Arten.',
    skillsLabel: 'Plugins · Skills',
    skillsHeading: (n) => `${n} Instruktions-Skills.`,
    skillsLead: 'Skills, die der Agent während einer Aufgabe lädt — Texten, Farbenlehre, Creative Direction, Brainstorming. Es gibt keine statische Demo, weil das Ergebnis von deiner Eingabe abhängt; jede Detailseite liest sich wie ein Brief: Titel, Beschreibung, Trigger, Attribution.',
    systemsLabel: 'Plugins · Systeme',
    systemsHeading: (n) => `${n} Designsysteme.`,
    systemsLead: 'Marken-verankerte Designsysteme, die Plugins via `od.craft.requires` übernehmen können. Jedes liefert eigene Palette, Typografie, Motion und Voice; verbinde ein Projekt mit einem System und jedes Plugin-Output erbt dieselbe Identität.',
    craftLabel: 'Plugins · Gestaltung',
    craftHeading: (n) => `${n} Gestaltungsprinzipien.`,
    craftLead: 'Markenneutrale Craft-Regeln — Barrierefreiheit, RTL, Motion-Easing, Fotografie-Ethik. Skills opten via `od.craft.requires` ein, sodass ein Plugin automatisch die richtige Strenge erbt.',
    detailHomepage: 'Homepage ↗',
    detailMode: 'Modus',
    detailScenario: 'Szene',
    detailPlatform: 'Plattform',
    detailSurface: 'Oberfläche',
    detailAuthor: 'Autor',
    detailManifestId: 'Manifest-ID',
    detailTags: 'Tags',
    detailPreviewCaption: 'Vorschau aus dem bundled-plugin Manifest.',
    detailBucketLabel: { examples: 'Beispiel', 'image-templates': 'Bild-Template', 'video-templates': 'Video-Template', scenarios: 'Szene', 'design-systems': 'Designsystem', atoms: 'Atom' },
    detailOpenInNewTabAria: 'In neuem Tab öffnen',
    breadcrumbLabel: 'Brotkrumen-Navigation',
    shareDialogClose: 'Schließen',
    previewImageAlt: (title) => `${title} Vorschau`,
    previewSummaryAria: (title) => `Interaktive Vorschau für ${title} öffnen`,
    previewIframeTitle: (title) => `${title} Interaktive Vorschau`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Agent-erstellte Artefakte, die du forken und deployen kannst — Prototypen, Slides, Bild- und Video-Templates. Führe sie auf deinen eigenen Keys mit dem lokalen Agent aus; die Prompts, Poster und Beispiel-HTML stehen alle unter Apache-2.0.',
    templatesCounterLabel: 'Gesamt',
    cardFeaturedTag: 'Empfohlen',
    cardReadFullPrompt: 'Vollständigen Prompt lesen →',
    cardUseTemplate: 'Dieses Template verwenden',
    cardShareAria: (title) => `${title} teilen`,
    faqHead: 'FAQ',
    faqItems: [
      {
        question: 'Was sind Open Design Templates?',
        answer:
          'Gebündelte Plugin-Templates, die mit Open Design — der open source Claude Design Alternative — ausgeliefert werden. Jedes ist ein ausführbares Artefakt: ein Prototyp, ein Slide Deck, ein Bildgenerator, eine Video-Komposition oder ein HyperFrames Motion-Stück. Dein lokaler Agent führt das Plugin gegen seinen Prompt und optional gegen ein Beispiel-HTML aus und erzeugt ein fertiges, teilbares Asset auf deinem eigenen Rechner.',
      },
      {
        question: 'Unter welcher Lizenz stehen die Templates?',
        answer:
          'Apache-2.0 durchgehend. Forke den Prompt, passe die <code>example.html</code> an, ändere die Brand-Tokens — die einzige Bitte ist, dass du den LICENSE-Hinweis beibehältst, wenn du es weitergibst.',
      },
      {
        question: 'Kann ich sie mit meinen eigenen API-Keys ausführen?',
        answer:
          'Ja. Open Design ist BYOK auf jeder Ebene — deine Claude / OpenAI / Local-Model-Zugangsdaten verlassen niemals deinen Rechner. Die Marketing-Website proxyt keine Inferenz; die Live-Vorschauversionen, die du in den Katalogzeilen siehst, stammen von Postern und Cloudflare Stream URLs, die die Templates mitbringen, nicht von einer gehosteten Runtime.',
      },
      {
        question: 'Wie trage ich ein Template bei?',
        answer:
          'Öffne einen PR gegen <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> mit einem neuen Ordner, der <code>open-design.json</code>, <code>SKILL.md</code> und ein ausführbares <code>example.html</code> enthält. Der Contributor-Leitfaden in der <code>CONTRIBUTING.md</code> des Repos führt dich durch die Manifest-Felder. Genehmigte Beiträge landen im öffentlichen Katalog und werden hier beim nächsten Deploy automatisch angezeigt.',
      },
      {
        question: 'Wie unterscheidet sich das von Claude Design Studio?',
        answer:
          'Claude Design Studio ist Anthropics gehostetes Produkt. Open Design ist die <strong>open source Claude Design Alternative</strong> — jedes Template, jeder Prompt und jedes Design System in diesem Katalog lebt in einem öffentlichen Repo, läuft lokal gegen die Keys deiner Wahl und kann durch Plugins erweitert werden, die jeder verfassen kann. Wir verwenden die gleiche Artefakt-Taxonomie (Prototypen, Slides, Bilder, Video), damit die mentale Modellierung übertragbar ist, aber alles bis hinunter zur Agent-Runtime bleibt auf deinem Rechner.',
      },
      {
        question: 'Woher kommen die Vorschauversionen?',
        answer:
          'Das Manifest jedes Templates trägt eine Poster-URL (Cloudflare CDN) und für Video-Templates eine Cloudflare Stream MP4. Das Grid rendert das Poster als statische Vorschau und wechselt beim Hover zum loopenden Video. Bild- und Prototypen-Templates zeigen ihr Poster direkt an; durch Klicken wird das ausführbare <code>example.html</code> auf der Detail-Seite geöffnet.',
      },
    ],
    category: {
      prototype: {
        label: 'Prototyp',
        description:
          'Interaktive Produkt-Mockups — Dashboards, Apps, Landing Pages, interne Tools. Alles, das du einer Stakeholder in die Hand gibst und durchklickst.',
      },
      'live-artifact': {
        label: 'Live Artifact',
        description:
          'Auffrischbare, datengesteuerte Artefakte, die sich neu rendern, wann immer sich die zugrunde liegenden Daten ändern. Live Dashboards, Monitoring-Boards, wiederkehrende Tracker.',
      },
      deck: {
        label: 'Slides',
        description:
          'Polierte Slide Decks aus einer narrativen Briefing — Pitch Decks, Kursmodule, Wochenberichte, Produktstarts.',
      },
      image: {
        label: 'Bild',
        description:
          'Bild-Assets, die aus strukturierter kreativer Richtung erzeugt werden — UI-Mockups, Brand-Visuals, Storyboards, Social Posts, Illustrationen.',
      },
      video: {
        label: 'Video',
        description:
          'Video-Prompts, Storyboards und renderfertige Motion-Artefakte — Short-Form Social, Marketing-Cuts, Motion Graphics, kinematische Geschichten.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames-ready Motion-Kompositionen — Agent-erstelltes Video, das Template-Prompts, Szenen-Richtung und Brand-Cues zu einer renderbaren Timeline verbindet.',
      },
      audio: {
        label: 'Audio',
        description:
          'Audio-Prompts und Stems für Short-Form Sonic Identity — UI-Sounds, Übergangsbumper, Voiceover-Skripte.',
      },
    },
    subcategory: {
      'business-dashboards': 'Dashboards',
      'app-prototypes': 'Apps',
      'landing-marketing': 'Landing & Marketing',
      'developer-tools': 'Developer-Tools',
      'docs-reports': 'Dokumente & Berichte',
      'brand-design': 'Brand & Design',
      'pitch-business': 'Pitch & Business',
      'course-training': 'Schulung & Training',
      'reports-briefings': 'Berichte & Briefings',
      'product-sales': 'Produkt & Vertrieb',
      'engineering-talks': 'Engineering-Talks',
      'creative-decks': 'Creative Decks',
      'ui-product-mockups': 'UI & Mockups',
      'brand-visuals': 'Brand & Logo',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Social & Content',
      'avatar-portrait': 'Avatar & Portrait',
      'illustration-style': 'Illustration & Stil',
      'motion-effects': 'Motion & Effekte',
      'social-short-form': 'Social Short-Form',
      'marketing-product': 'Marketing & Produkt',
      'data-explainers': 'Daten & Explainer',
      'cinematic-story': 'Cinematic Story',
    },
  },
  fr: {
    hubLabel: 'Bibliothèque de plugins', hubHeading: (n) => `${n} éléments composables.`,
    tileTemplates: 'Modèles', tileSkills: 'Skills', tileSystems: 'Systèmes', tileCraft: 'Artisanat',
    browseTemplates: 'Parcourir les modèles', browseSkills: 'Parcourir les skills', browseSystems: 'Parcourir les systèmes', browseCraft: 'Parcourir l’artisanat',
    artifactKindLabel: 'Type d’artefact', sceneLabel: 'Scène', allChip: 'Tous',
    detailUseCta: 'Utiliser ce plugin →', detailFindOnGithub: 'Voir sur GitHub →',
    detailClickForLivePreview: 'Cliquer pour aperçu en direct ↗', detailOpenInNewTab: 'Ouvrir dans un nouvel onglet ↗',
    shareOpen: 'Partager ↗', shareTitle: 'Partager ce plugin',
    shareLead: 'Copiez le message ci-dessous, puis ouvrez la plateforme de votre choix et collez.',
    shareCopyText: 'Copier le texte', shareCopyLink: 'Copier le lien', shareJumpTo: 'Aller sur :',
    shareTemplate: ({ title, url }) => `🎨 Découvert : ${title} sur @opendesignai — l’alternative open-source à Claude Design.\n✨ Local-first · BYOK · votre agent fait le design.\n\n→ ${url}`,
    hubLead: 'Open Design s’articule autour de quatre types de plugins : Templates et Skills sont ce que ton agent exécute ; Systems et Craft maintiennent la marque et l’accessibilité. Choisis une section ou saute directement à un slug si tu sais déjà ce que tu veux.',
    tileTemplatesBlurb: 'Templates visuels et exécutables — prototypes, slides, générateurs d’image et de vidéo, compositions motion. Chaque entrée embarque un example.html : forke, change les données, expédie.',
    tileSkillsBlurb: 'Skills d’instruction que l’agent charge en cours de tâche — copie, théorie des couleurs, direction créative, brainstorming. Pure prose SKILL.md ; le résultat dépend de ton input.',
    tileSystemsBlurb: 'Design systems ancrés à la marque — palette, typographie, motion, voix. Branche un projet à un système et chaque sortie de plugin hérite de la même identité.',
    tileCraftBlurb: 'Règles de craft indépendantes de la marque — accessibilité, RTL, easing motion, éthique photo. Les skills opt-in via `od.craft.requires`, et le plugin hérite automatiquement de la rigueur appropriée.',
    templatesLabel: 'Plugins · Templates',
    templatesHeading: (n) => `${n} templates exécutables.`,
    templatesLead: 'Chaque template livre une preview fonctionnelle — la vignette du catalogue vient directement du poster de manifest utilisé par l’agent dans le produit. Parcours tout, ou saute à l’une des sept catégories d’artefact.',
    skillsLabel: 'Plugins · Skills',
    skillsHeading: (n) => `${n} skills d’instruction.`,
    skillsLead: 'Skills que l’agent charge pendant une tâche — copie, théorie des couleurs, direction créative, brainstorming. Pas de demo statique parce que le résultat dépend de ton input ; chaque page détail se lit comme un brief : titre, description, triggers, attribution.',
    systemsLabel: 'Plugins · Systèmes',
    systemsHeading: (n) => `${n} design systems.`,
    systemsLead: 'Design systems ancrés à la marque que les plugins peuvent adopter via `od.craft.requires`. Chacun apporte palette, typographie, motion et voix ; branche un projet à un système, chaque sortie de plugin hérite de la même identité.',
    craftLabel: 'Plugins · Craft',
    craftHeading: (n) => `${n} principes de craft.`,
    craftLead: 'Règles de craft indépendantes de la marque — accessibilité, RTL, easing motion, éthique photo. Les skills opt-in via `od.craft.requires`, et le plugin hérite automatiquement de la rigueur appropriée.',
    detailHomepage: 'Page d’accueil ↗',
    detailMode: 'Mode',
    detailScenario: 'Scène',
    detailPlatform: 'Plateforme',
    detailSurface: 'Surface',
    detailAuthor: 'Auteur',
    detailManifestId: 'ID du manifest',
    detailTags: 'Tags',
    detailPreviewCaption: 'Preview depuis le manifest bundled-plugin.',
    detailBucketLabel: { examples: 'Exemple', 'image-templates': 'Template image', 'video-templates': 'Template vidéo', scenarios: 'Scène', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Ouvrir dans un nouvel onglet',
    breadcrumbLabel: 'Fil d’Ariane',
    shareDialogClose: 'Fermer',
    previewImageAlt: (title) => `Aperçu de ${title}`,
    previewSummaryAria: (title) => `Ouvrir l’aperçu interactif de ${title}`,
    previewIframeTitle: (title) => `Aperçu interactif de ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      "Des artefacts construits par agent que vous pouvez forker et déployer — prototypes, diaporamas, modèles d'images et vidéos. Exécutez-les sur vos propres clés avec l'agent local ; les prompts, affiches et HTML d'exemple sont tous sous Apache-2.0.",
    templatesCounterLabel: 'Total',
    cardFeaturedTag: 'À la une',
    cardReadFullPrompt: 'Lire le prompt complet →',
    cardUseTemplate: 'Utiliser ce modèle',
    cardShareAria: (title) => `Partager ${title}`,
    faqHead: 'FAQ',
    faqItems: [
      {
        question: "Qu'est-ce que les modèles Open Design ?",
        answer:
          "Des modèles avec plugins intégrés qui sont livrés avec Open Design — l'alternative open source à Claude Design. Chacun est un artefact exécutable : un prototype, un diaporama, un générateur d'images, une composition vidéo, ou une pièce de mouvement HyperFrames. Votre agent local exécute le plugin selon son prompt et un HTML d'exemple optionnel, et produit un atout prêt à partager sur votre propre machine.",
      },
      {
        question: 'Comment les modèles sont-ils licenciés ?',
        answer:
          "Apache-2.0 partout. Forkez le prompt, adaptez l'<code>example.html</code>, changez les tokens de marque — la seule demande est de conserver la notice LICENSE lors de la redistribution.",
      },
      {
        question: 'Puis-je les exécuter avec mes propres clés API ?',
        answer:
          "Oui. Open Design est BYOK à tous les niveaux — vos identifiants Claude / OpenAI / modèle local ne quittent jamais votre machine. Le site marketing ne proxy aucune inférence ; les aperçus en direct que vous voyez sur les lignes du catalogue proviennent des affiches et des URLs Cloudflare Stream que les modèles livrent, pas d'un runtime hébergé.",
      },
      {
        question: 'Comment puis-je contribuer un modèle ?',
        answer:
          'Ouvrez une PR contre <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> avec un nouveau dossier contenant <code>open-design.json</code>, <code>SKILL.md</code>, et un <code>example.html</code> exécutable. Le guide des contributeurs dans le fichier <code>CONTRIBUTING.md</code> du repo décrit les champs du manifeste. Les contributions approuvées arrivent dans le catalogue public et s\'affichent ici automatiquement au prochain déploiement.',
      },
      {
        question: 'En quoi cela diffère-t-il de Claude Design Studio ?',
        answer:
          "Claude Design Studio est le produit hébergé d'Anthropic. Open Design est l'<strong>alternative open source à Claude Design</strong> — chaque modèle, prompt et système de design dans ce catalogue vit dans un repo public, s'exécute localement avec les clés que vous choisissez, et peut être étendu via des plugins que n'importe qui peut créer. Nous reflétions la même taxonomie d'artefacts (prototypes, diaporamas, images, vidéo) pour que le modèle mental soit transférable, mais tout, jusqu'au runtime de l'agent, reste sur votre machine.",
      },
      {
        question: "D'où viennent les aperçus ?",
        answer:
          "Le manifeste de chaque modèle porte une URL d'affiche (CDN Cloudflare) et, pour les modèles vidéo, un MP4 Cloudflare Stream. La grille rend l'affiche comme miniature statique et fait défiler la vidéo en boucle au survol. Les modèles d'image et prototype affichent leur affiche directement ; cliquer ouvre le <code>example.html</code> exécutable sur la page de détail.",
      },
    ],
    category: {
      prototype: {
        label: 'Prototype',
        description:
          'Maquettes interactives de produits — tableaux de bord, applications, landing pages, outils internes. Tout ce que vous présenteriez à une partie prenante et parcouriez.',
      },
      'live-artifact': {
        label: 'Artefact dynamique',
        description:
          'Artefacts actualisables et conscients des données qui se réaffichent chaque fois que les données sous-jacentes changent. Tableaux de bord dynamiques, tableaux de surveillance, traceurs récurrents.',
      },
      deck: {
        label: 'Diaporama',
        description:
          "Diaporamas polis à partir d'un résumé narratif — pitchs, modules de cours, rapports hebdomadaires, lancements de produits.",
      },
      image: {
        label: 'Image',
        description:
          "Ressources d'images générées à partir de directives créatives structurées — maquettes d'interface, visuels de marque, storyboards, publications sociales, illustrations.",
      },
      video: {
        label: 'Vidéo',
        description:
          'Prompts vidéo, storyboards et artefacts de mouvement prêts au rendu — court-métrage social, coupes marketing, motion graphics, histoires cinématiques.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Compositions de mouvement HyperFrames — vidéo construite par agent qui fusionne les prompts de modèle, les directives de scène et les indices de marque en une timeline rendable.',
      },
      audio: {
        label: 'Audio',
        description:
          "Prompts audio et stems pour identité sonore court-métrage — sons d'interface, bumpers de transition, scripts de voix off.",
      },
    },
    subcategory: {
      'business-dashboards': 'Tableaux de bord',
      'app-prototypes': 'Applications',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Outils développeurs',
      'docs-reports': 'Docs & rapports',
      'brand-design': 'Brand & design',
      'pitch-business': 'Pitch & business',
      'course-training': 'Formation & cours',
      'reports-briefings': 'Rapports & briefings',
      'product-sales': 'Produit & ventes',
      'engineering-talks': 'Engineering talks',
      'creative-decks': 'Présentations créatives',
      'ui-product-mockups': 'UI & maquettes produit',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Social & contenu',
      'avatar-portrait': 'Avatar & portrait',
      'illustration-style': 'Illustration & style',
      'motion-effects': 'Motion & effets',
      'social-short-form': 'Contenu court social',
      'marketing-product': 'Marketing & produit',
      'data-explainers': 'Data & explainers',
      'cinematic-story': 'Cinematic story',
    },
  },
  ru: {
    hubLabel: 'Библиотека плагинов', hubHeading: (n) => `${n} компонуемых элементов.`,
    tileTemplates: 'Шаблоны', tileSkills: 'Скиллы', tileSystems: 'Системы', tileCraft: 'Ремесло',
    browseTemplates: 'Все шаблоны', browseSkills: 'Все скиллы', browseSystems: 'Все системы', browseCraft: 'Все правила ремесла',
    artifactKindLabel: 'Тип артефакта', sceneLabel: 'Сцена', allChip: 'Все',
    detailUseCta: 'Использовать плагин →', detailFindOnGithub: 'Посмотреть на GitHub →',
    detailClickForLivePreview: 'Кликните для живого превью ↗', detailOpenInNewTab: 'Открыть в новой вкладке ↗',
    shareOpen: 'Поделиться ↗', shareTitle: 'Поделиться плагином',
    shareLead: 'Скопируйте сообщение ниже, затем перейдите на нужную платформу и вставьте.',
    shareCopyText: 'Скопировать текст', shareCopyLink: 'Только ссылка', shareJumpTo: 'Перейти:',
    shareTemplate: ({ title, url }) => `🎨 Нашёл ${title} на @opendesignai — open-source альтернативу Claude Design.\n✨ Локально · BYOK · агент сам делает дизайн.\n\n→ ${url}`,
    hubLead: 'Open Design построен вокруг четырёх видов плагинов: Templates и Skills — это то, что выполняет твой agent; Systems и Craft удерживают бренд и доступность. Выбери раздел для углубления или сразу перейди по slug, если уже знаешь, что нужно.',
    tileTemplatesBlurb: 'Визуальные, исполняемые шаблоны — прототипы, слайды, генераторы изображений и видео, motion-композиции. Каждая запись поставляется с example.html — форкни, замени данные, отправляй.',
    tileSkillsBlurb: 'Инструкционные навыки, которые agent подгружает по ходу задачи — копирайтинг, теория цвета, креативное руководство, брейншторм. Чистый текст SKILL.md; результат зависит от твоего ввода.',
    tileSystemsBlurb: 'Привязанные к бренду дизайн-системы — палитра, типографика, motion, тон. Привяжи проект к системе, и любой вывод плагина наследует ту же идентичность.',
    tileCraftBlurb: 'Бренд-агностичные craft-правила — доступность, RTL, motion-easing, этика фотографии. Навыки opt-in через `od.craft.requires`, и плагин автоматически наследует нужную строгость.',
    templatesLabel: 'Плагины · Шаблоны',
    templatesHeading: (n) => `${n} исполняемых шаблонов.`,
    templatesLead: 'Каждый шаблон поставляется с рабочей превью — миниатюра в каталоге берётся прямо из manifest poster, который agent использует внутри продукта. Пробегись по всем или прыгни в одну из семи категорий артефактов.',
    skillsLabel: 'Плагины · Навыки',
    skillsHeading: (n) => `${n} инструкционных навыков.`,
    skillsLead: 'Навыки, которые agent подгружает в процессе задачи — копирайтинг, теория цвета, креативное руководство, брейншторм. Статичной demo нет, потому что результат зависит от ввода; каждая детальная страница читается как brief: заголовок, описание, триггеры, авторство.',
    systemsLabel: 'Плагины · Системы',
    systemsHeading: (n) => `${n} дизайн-систем.`,
    systemsLead: 'Привязанные к бренду дизайн-системы, которые плагины могут принять через `od.craft.requires`. У каждой своя палитра, типографика, motion и тон; привяжи проект к системе — и любой вывод плагина наследует ту же идентичность.',
    craftLabel: 'Плагины · Craft',
    craftHeading: (n) => `${n} принципов craft.`,
    craftLead: 'Бренд-агностичные craft-правила — доступность, RTL, motion-easing, этика фотографии. Навыки opt-in через `od.craft.requires`, плагин автоматически наследует нужную строгость.',
    detailHomepage: 'Главная ↗',
    detailMode: 'Режим',
    detailScenario: 'Сцена',
    detailPlatform: 'Платформа',
    detailSurface: 'Поверхность',
    detailAuthor: 'Автор',
    detailManifestId: 'ID манифеста',
    detailTags: 'Теги',
    detailPreviewCaption: 'Превью из bundled-plugin манифеста.',
    detailBucketLabel: { examples: 'Пример', 'image-templates': 'Шаблон изображения', 'video-templates': 'Шаблон видео', scenarios: 'Сцена', 'design-systems': 'Дизайн-система', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Открыть в новой вкладке',
    breadcrumbLabel: 'Навигация по разделам',
    shareDialogClose: 'Закрыть',
    previewImageAlt: (title) => `Превью ${title}`,
    previewSummaryAria: (title) => `Открыть интерактивное превью ${title}`,
    previewIframeTitle: (title) => `Интерактивное превью ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Артефакты, созданные агентом, которые можно форкировать и развёртывать — прототипы, слайды, шаблоны изображений и видео. Запускайте их на собственных ключах с локальным агентом; промпты, постеры и пример HTML распространяются под Apache-2.0.',
    templatesCounterLabel: 'Всего',
    cardFeaturedTag: 'Избранное',
    cardReadFullPrompt: 'Прочитать полный промпт →',
    cardUseTemplate: 'Использовать этот шаблон',
    cardShareAria: (title) => `Поделиться ${title}`,
    faqHead: 'FAQ',
    faqItems: [
      {
        question: 'Что такое шаблоны Open Design?',
        answer:
          'Шаблоны с встроенными плагинами, которые поставляются с Open Design — открытую альтернативу Claude Design. Каждый из них — это исполняемый артефакт: прототип, слайд-дек, генератор изображений, видеокомпозиция или motion-piece на HyperFrames. Локальный агент запускает плагин по его промпту и опциональному примеру HTML, и создаёт готовый к публикации ассет на вашей машине.',
      },
      {
        question: 'Как лицензируются шаблоны?',
        answer:
          'Apache-2.0 везде. Форкируйте промпт, адаптируйте <code>example.html</code>, измените токены брендов — единственное требование: сохраняйте notice лицензии при распространении.',
      },
      {
        question: 'Могу ли я запускать их с собственными API-ключами?',
        answer:
          'Да. Open Design работает с собственными ключами на каждом уровне — ваши учётные данные Claude / OpenAI / локальной модели никогда не покидают машину. Сайт маркетинга не проксирует никакое inference; live-превью, которые вы видите в строках каталога, поступают из постеров и Cloudflare Stream URL, которые поставляются с шаблонами, а не из размещённого runtime.',
      },
      {
        question: 'Как мне внести свой шаблон?',
        answer:
          'Откройте PR в <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> с новой папкой, содержащей <code>open-design.json</code>, <code>SKILL.md</code> и исполняемый <code>example.html</code>. Руководство контрибьютора в <code>CONTRIBUTING.md</code> репо описывает поля манифеста. Одобренные вклады попадают в публичный каталог и автоматически появляются здесь при следующем деплое.',
      },
      {
        question: 'Чем это отличается от Claude Design Studio?',
        answer:
          'Claude Design Studio — это размещённый продукт Anthropic. Open Design — это <strong>открытая альтернатива Claude Design</strong> — каждый шаблон, промпт и дизайн-система в этом каталоге находятся в публичном репо, работают локально с выбранными вами ключами и могут быть расширены через плагины, которые может написать кто угодно. Мы используем ту же таксономию артефактов (прототипы, слайды, изображения, видео), чтобы ментальная модель совпадала, но всё, вплоть до runtime агента, остаётся на вашей машине.',
      },
      {
        question: 'Откуда берутся превью?',
        answer:
          'Манифест каждого шаблона содержит URL постера (Cloudflare CDN) и для видеошаблонов — Cloudflare Stream MP4. Сетка рендерит постер как статический thumbnail и переключается на видео при наведении. Шаблоны изображений и прототипов показывают постер напрямую; нажатие открывает исполняемый <code>example.html</code> на странице деталей.',
      },
    ],
    category: {
      prototype: {
        label: 'Прототип',
        description:
          'Интерактивные мокапы продуктов — дашборды, приложения, лендинги, внутренние инструменты. Всё, что вы бы показали стейкхолдеру и кликали бы по нему.',
      },
      'live-artifact': {
        label: 'Live Artifact',
        description:
          'Обновляемые, осведомлённые о данных артефакты, которые перерисовываются каждый раз, когда меняются базовые данные. Live-дашборды, мониторинг-доски, повторяющиеся трекеры.',
      },
      deck: {
        label: 'Слайды',
        description:
          'Полированные слайд-деки из нарративного бриефа — pitch-деки, модули курсов, еженедельные отчёты, запуски продуктов.',
      },
      image: {
        label: 'Изображение',
        description:
          'Графические активы, созданные из структурированного творческого направления — мокапы UI, визуалы бренда, раскадровки, посты в соцсетях, иллюстрации.',
      },
      video: {
        label: 'Видео',
        description:
          'Видеопромпты, раскадровки и готовые к рендеру motion-артефакты — короткоформатный контент для соцсетей, маркетинговые нарезки, motion-графика, кинематические истории.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames-готовые motion-композиции — видео, созданное агентом, которое объединяет промпты шаблонов, направление сцены и токены бренда в рендеримую временную шкалу.',
      },
      audio: {
        label: 'Аудио',
        description:
          'Аудиопромпты и основы для короткоформатной звуковой идентичности — звуки UI, переходные бамперы, скрипты озвучки.',
      },
    },
    subcategory: {
      'business-dashboards': 'Панели управления',
      'app-prototypes': 'Приложения',
      'landing-marketing': 'Лендинги & маркетинг',
      'developer-tools': 'Инструменты разработки',
      'docs-reports': 'Документы & отчёты',
      'brand-design': 'Бренд & дизайн',
      'pitch-business': 'Питч & бизнес',
      'course-training': 'Курсы & обучение',
      'reports-briefings': 'Отчёты & брифинги',
      'product-sales': 'Продукт & продажи',
      'engineering-talks': 'Инженерные презентации',
      'creative-decks': 'Креативные колоды',
      'ui-product-mockups': 'UI & макеты продукта',
      'brand-visuals': 'Бренд & логотип',
      'storyboards-motion-refs': 'Раскадровки',
      'social-content': 'Соцсети & контент',
      'avatar-portrait': 'Аватар & портрет',
      'illustration-style': 'Иллюстрация & стиль',
      'motion-effects': 'Анимация & эффекты',
      'social-short-form': 'Короткий контент',
      'marketing-product': 'Маркетинг & продукт',
      'data-explainers': 'Данные & объяснения',
      'cinematic-story': 'Кинематографичные истории',
    },
  },
  es: {
    hubLabel: 'Biblioteca de plugins', hubHeading: (n) => `${n} piezas componibles.`,
    tileTemplates: 'Plantillas', tileSkills: 'Skills', tileSystems: 'Sistemas', tileCraft: 'Oficio',
    browseTemplates: 'Ver plantillas', browseSkills: 'Ver skills', browseSystems: 'Ver sistemas', browseCraft: 'Ver oficio',
    artifactKindLabel: 'Tipo de artefacto', sceneLabel: 'Escena', allChip: 'Todos',
    detailUseCta: 'Usar este plugin →', detailFindOnGithub: 'Ver en GitHub →',
    detailClickForLivePreview: 'Clic para vista previa ↗', detailOpenInNewTab: 'Abrir en nueva pestaña ↗',
    shareOpen: 'Compartir ↗', shareTitle: 'Compartir este plugin',
    shareLead: 'Copia el mensaje y abre la plataforma donde quieras compartirlo.',
    shareCopyText: 'Copiar texto', shareCopyLink: 'Solo el enlace', shareJumpTo: 'Ir a:',
    shareTemplate: ({ title, url }) => `🎨 Acabo de descubrir ${title} en @opendesignai — la alternativa open-source a Claude Design.\n✨ Local-first · BYOK · tu agente diseña.\n\n→ ${url}`,
    hubLead: 'Open Design se construye alrededor de cuatro tipos de plugin: Templates y Skills son lo que tu agent ejecuta; Systems y Craft mantienen marca y accesibilidad. Elige una sección para profundizar o salta directo a un slug si ya sabes cuál quieres.',
    tileTemplatesBlurb: 'Templates visuales y ejecutables — prototipos, slides, generadores de imagen y video, composiciones motion. Cada entrada incluye un example.html: forkea, cambia los datos, despacha.',
    tileSkillsBlurb: 'Skills de instrucción que el agent carga a mitad de tarea — copy, teoría del color, dirección creativa, brainstorming. Prosa pura de SKILL.md; el resultado depende de tu input.',
    tileSystemsBlurb: 'Design systems anclados a la marca — paleta, tipografía, motion, voz. Conecta un proyecto a un sistema y cada salida de plugin hereda la misma identidad.',
    tileCraftBlurb: 'Reglas de craft agnósticas a la marca — accesibilidad, RTL, easing de motion, ética fotográfica. Los skills opt-in con `od.craft.requires`, y el plugin hereda el rigor adecuado automáticamente.',
    templatesLabel: 'Plugins · Templates',
    templatesHeading: (n) => `${n} templates ejecutables.`,
    templatesLead: 'Cada template trae una preview funcional — el thumbnail del catálogo viene directamente del poster del manifest que el agent usa dentro del producto. Recórrelos todos o salta a una de las siete clases de artefacto.',
    skillsLabel: 'Plugins · Skills',
    skillsHeading: (n) => `${n} skills de instrucción.`,
    skillsLead: 'Skills que el agent carga durante una tarea — copy, teoría del color, dirección creativa, brainstorming. No hay demo estática porque el resultado depende de tu input; cada página de detalle se lee como un brief: título, descripción, triggers, atribución.',
    systemsLabel: 'Plugins · Sistemas',
    systemsHeading: (n) => `${n} design systems.`,
    systemsLead: 'Design systems anclados a la marca que los plugins pueden adoptar vía `od.craft.requires`. Cada uno trae paleta, tipografía, motion y voz; conecta un proyecto a un sistema y cada salida de plugin hereda la misma identidad.',
    craftLabel: 'Plugins · Craft',
    craftHeading: (n) => `${n} principios de craft.`,
    craftLead: 'Reglas de craft agnósticas a la marca — accesibilidad, RTL, easing de motion, ética fotográfica. Los skills opt-in con `od.craft.requires`, y el plugin hereda el rigor adecuado automáticamente.',
    detailHomepage: 'Sitio web ↗',
    detailMode: 'Modo',
    detailScenario: 'Escena',
    detailPlatform: 'Plataforma',
    detailSurface: 'Superficie',
    detailAuthor: 'Autor',
    detailManifestId: 'ID del manifest',
    detailTags: 'Etiquetas',
    detailPreviewCaption: 'Preview del manifest bundled-plugin.',
    detailBucketLabel: { examples: 'Ejemplo', 'image-templates': 'Template de imagen', 'video-templates': 'Template de video', scenarios: 'Escena', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Abrir en nueva pestaña',
    breadcrumbLabel: 'Ruta de navegación',
    shareDialogClose: 'Cerrar',
    previewImageAlt: (title) => `Vista previa de ${title}`,
    previewSummaryAria: (title) => `Abrir vista previa interactiva de ${title}`,
    previewIframeTitle: (title) => `Vista previa interactiva de ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Artefactos construidos por agentes que puedes bifurcar e implementar — prototipos, diapositivas y plantillas de imagen y vídeo. Ejecútalos con tus propias claves usando el agente local; los prompts, posters y HTML de ejemplo están todos bajo Apache-2.0.',
    templatesCounterLabel: 'Total',
    cardFeaturedTag: 'Destacado',
    cardReadFullPrompt: 'Leer prompt completo →',
    cardUseTemplate: 'Usar esta plantilla',
    cardShareAria: (title) => `Compartir ${title}`,
    faqHead: 'Preguntas frecuentes',
    faqItems: [
      {
        question: '¿Qué son las plantillas de Open Design?',
        answer:
          'Plantillas de plugins integrados que se incluyen con Open Design — la alternativa open source a Claude Design. Cada una es un artefacto ejecutable: un prototipo, un conjunto de diapositivas, un generador de imágenes, una composición de vídeo o una pieza de movimiento HyperFrames. Tu agente local ejecuta el plugin contra su prompt y un HTML de ejemplo opcional, y produce un activo listo para compartir en tu máquina.',
      },
      {
        question: '¿Cómo se licencian las plantillas?',
        answer:
          'Apache-2.0 en todos los casos. Bifurca el prompt, adapta el <code>example.html</code>, cambia los tokens de marca — lo único que pedimos es que mantengas el aviso de LICENSE cuando redistribuyas.',
      },
      {
        question: '¿Puedo ejecutarlas con mis propias claves API?',
        answer:
          'Sí. Open Design es BYOK en todas las capas — tus credenciales de Claude, OpenAI o modelo local nunca abandonan tu máquina. El sitio de marketing no realiza proxy de ninguna inferencia; las vistas previas en directo que ves en las filas del catálogo provienen de posters y URLs de Cloudflare Stream que se incluyen con las plantillas, no de un runtime alojado.',
      },
      {
        question: '¿Cómo contribuyo con una plantilla?',
        answer:
          'Abre un PR contra <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> con una nueva carpeta que contenga <code>open-design.json</code>, <code>SKILL.md</code> y un <code>example.html</code> ejecutable. La guía de contribuyentes en el <code>CONTRIBUTING.md</code> del repositorio te explica los campos del manifiesto. Las contribuciones aprobadas aparecen en el catálogo público y se muestran aquí automáticamente en el siguiente despliegue.',
      },
      {
        question: '¿En qué se diferencia de Claude Design Studio?',
        answer:
          'Claude Design Studio es el producto alojado de Anthropic. Open Design es la <strong>alternativa open source a Claude Design</strong> — cada plantilla, prompt y sistema de diseño en este catálogo vive en un repositorio público, se ejecuta localmente contra las claves que elijas, y puede extenderse mediante plugins que cualquiera puede crear. Espejamos la misma taxonomía de artefactos (prototipos, diapositivas, imágenes, vídeo) para que el modelo mental sea coherente, pero todo, incluido el runtime del agente, permanece en tu máquina.',
      },
      {
        question: '¿De dónde vienen las vistas previas?',
        answer:
          'El manifiesto de cada plantilla contiene una URL de póster (CDN de Cloudflare) y, para plantillas de vídeo, un MP4 de Cloudflare Stream. La cuadrícula renderiza el póster como la miniatura estática e intercambia el vídeo en bucle al pasar el ratón. Las plantillas de imagen y prototipo muestran su póster directamente; al hacer clic se abre el <code>example.html</code> ejecutable en la página de detalles.',
      },
    ],
    category: {
      prototype: {
        label: 'Prototipo',
        description:
          'Maquetas de productos interactivas — paneles de control, aplicaciones, páginas de inicio, herramientas internas. Cualquier cosa que le entregarías a un stakeholder para hacer clic.',
      },
      'live-artifact': {
        label: 'Artefacto en directo',
        description:
          'Artefactos actualizables y conscientes de datos que se rerenderizarán cada vez que cambien los datos subyacentes. Paneles de control en directo, tableros de monitorización, rastreadores recurrentes.',
      },
      deck: {
        label: 'Diapositivas',
        description:
          'Conjuntos de diapositivas pulidas a partir de un resumen narrativo — pitch decks, módulos de cursos, informes semanales, lanzamientos de productos.',
      },
      image: {
        label: 'Imagen',
        description:
          'Activos de imagen generados a partir de dirección creativa estructurada — maquetas de UI, identidad visual de marca, storyboards, posts de redes sociales, ilustraciones.',
      },
      video: {
        label: 'Vídeo',
        description:
          'Prompts de vídeo, storyboards y artefactos de movimiento listos para renderizar — vídeos de corta duración para redes sociales, cortes de marketing, motion graphics, historias cinematográficas.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Composiciones de movimiento listas para HyperFrames — vídeo construido por agentes que combina prompts de plantilla, dirección de escena y pistas de marca en una línea de tiempo renderizable.',
      },
      audio: {
        label: 'Audio',
        description:
          'Prompts de audio y stems para identidad sónica a corta distancia — sonidos de UI, bumpers de transición, scripts de voz en off.',
      },
    },
    subcategory: {
      'business-dashboards': 'Dashboards',
      'app-prototypes': 'Apps',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Herramientas para desarrolladores',
      'docs-reports': 'Docs & informes',
      'brand-design': 'Brand & diseño',
      'pitch-business': 'Pitch & negocios',
      'course-training': 'Curso & formación',
      'reports-briefings': 'Informes & resúmenes',
      'product-sales': 'Producto & ventas',
      'engineering-talks': 'Charlas técnicas',
      'creative-decks': 'Presentaciones creativas',
      'ui-product-mockups': 'UI & mockups de producto',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Social & contenido',
      'avatar-portrait': 'Avatar & retrato',
      'illustration-style': 'Ilustración & estilo',
      'motion-effects': 'Motion & efectos',
      'social-short-form': 'Contenido corto social',
      'marketing-product': 'Marketing & producto',
      'data-explainers': 'Datos & explicadores',
      'cinematic-story': 'Historia cinemática',
    },
  },
  'pt-br': {
    hubLabel: 'Biblioteca de plugins', hubHeading: (n) => `${n} peças combináveis.`,
    tileTemplates: 'Templates', tileSkills: 'Skills', tileSystems: 'Sistemas', tileCraft: 'Ofício',
    browseTemplates: 'Ver templates', browseSkills: 'Ver skills', browseSystems: 'Ver sistemas', browseCraft: 'Ver ofício',
    artifactKindLabel: 'Tipo de artefato', sceneLabel: 'Cena', allChip: 'Todos',
    detailUseCta: 'Usar este plugin →', detailFindOnGithub: 'Ver no GitHub →',
    detailClickForLivePreview: 'Clique para preview ao vivo ↗', detailOpenInNewTab: 'Abrir em nova aba ↗',
    shareOpen: 'Compartilhar ↗', shareTitle: 'Compartilhar este plugin',
    shareLead: 'Copie a mensagem e abra a plataforma onde quer compartilhar.',
    shareCopyText: 'Copiar texto', shareCopyLink: 'Só o link', shareJumpTo: 'Ir para:',
    shareTemplate: ({ title, url }) => `🎨 Acabei de descobrir ${title} no @opendesignai — a alternativa open-source ao Claude Design.\n✨ Local-first · BYOK · seu agente faz o design.\n\n→ ${url}`,
    hubLead: 'Open Design é construído em torno de quatro tipos de plugin: Templates e Skills são o que seu agent executa; Systems e Craft mantêm marca e acessibilidade. Escolha uma seção para se aprofundar ou pule direto para um slug se já sabe o que quer.',
    tileTemplatesBlurb: 'Templates visuais e executáveis — protótipos, slides, geradores de imagem e vídeo, composições motion. Cada entrada vem com um example.html: forke, troque os dados, entregue.',
    tileSkillsBlurb: 'Skills de instrução que o agent carrega no meio da tarefa — copy, teoria das cores, direção criativa, brainstorming. Pura prosa de SKILL.md; o resultado depende do seu input.',
    tileSystemsBlurb: 'Design systems ancorados na marca — paleta, tipografia, motion, voz. Conecte um projeto a um sistema e toda saída de plugin herda a mesma identidade.',
    tileCraftBlurb: 'Regras de craft agnósticas à marca — acessibilidade, RTL, easing de motion, ética fotográfica. Skills fazem opt-in via `od.craft.requires`, e o plugin herda o rigor adequado automaticamente.',
    templatesLabel: 'Plugins · Templates',
    templatesHeading: (n) => `${n} templates executáveis.`,
    templatesLead: 'Cada template traz uma preview funcional — a thumbnail do catálogo vem direto do poster do manifest que o agent usa dentro do produto. Veja todos ou pule para uma das sete classes de artefato.',
    skillsLabel: 'Plugins · Skills',
    skillsHeading: (n) => `${n} skills de instrução.`,
    skillsLead: 'Skills que o agent carrega durante uma tarefa — copy, teoria das cores, direção criativa, brainstorming. Não há demo estática porque o resultado depende do input; cada página de detalhe lê como um brief: título, descrição, triggers, atribuição.',
    systemsLabel: 'Plugins · Sistemas',
    systemsHeading: (n) => `${n} design systems.`,
    systemsLead: 'Design systems ancorados na marca que os plugins podem adotar via `od.craft.requires`. Cada um traz paleta, tipografia, motion e voz; conecte um projeto a um sistema e toda saída de plugin herda a mesma identidade.',
    craftLabel: 'Plugins · Craft',
    craftHeading: (n) => `${n} princípios de craft.`,
    craftLead: 'Regras de craft agnósticas à marca — acessibilidade, RTL, easing de motion, ética fotográfica. Skills fazem opt-in via `od.craft.requires`, e o plugin herda o rigor adequado automaticamente.',
    detailHomepage: 'Site ↗',
    detailMode: 'Modo',
    detailScenario: 'Cena',
    detailPlatform: 'Plataforma',
    detailSurface: 'Superfície',
    detailAuthor: 'Autor',
    detailManifestId: 'ID do manifest',
    detailTags: 'Tags',
    detailPreviewCaption: 'Preview do manifest bundled-plugin.',
    detailBucketLabel: { examples: 'Exemplo', 'image-templates': 'Template de imagem', 'video-templates': 'Template de vídeo', scenarios: 'Cena', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Abrir em nova aba',
    breadcrumbLabel: 'Trilha de navegação',
    shareDialogClose: 'Fechar',
    previewImageAlt: (title) => `Pré-visualização de ${title}`,
    previewSummaryAria: (title) => `Abrir pré-visualização interativa de ${title}`,
    previewIframeTitle: (title) => `Pré-visualização interativa de ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Artefatos construídos por agentes que você pode fazer fork e deployar — protótipos, apresentações, templates de imagem e vídeo. Execute-os com suas próprias chaves usando o agente local; os prompts, cartazes e HTML de exemplo estão todos sob Apache-2.0.',
    templatesCounterLabel: 'Total',
    cardFeaturedTag: 'Destaque',
    cardReadFullPrompt: 'Ler prompt completo →',
    cardUseTemplate: 'Usar este template',
    cardShareAria: (title) => `Compartilhar ${title}`,
    faqHead: 'Perguntas Frequentes',
    faqItems: [
      {
        question: 'O que são os templates Open Design?',
        answer:
          'Templates com plugin integrado que vêm com Open Design — a alternativa open source para Claude Design. Cada um é um artefato executável: um protótipo, deck de apresentação, gerador de imagem, composição de vídeo ou uma peça de motion HyperFrames. Seu agente local executa o plugin contra seu prompt e um HTML de exemplo opcional, gerando um ativo pronto para compartilhar na sua máquina.',
      },
      {
        question: 'Como os templates são licenciados?',
        answer:
          'Apache-2.0 em tudo. Faça fork do prompt, adapte o <code>example.html</code>, altere os tokens de marca — o único pedido é manter o aviso de LICENSE quando você redistribuir.',
      },
      {
        question: 'Posso executá-los com minhas próprias chaves de API?',
        answer:
          'Sim. Open Design é BYOK em todas as camadas — suas credenciais Claude / OpenAI / modelo local nunca saem da sua máquina. O site de marketing não faz proxy de nenhuma inferência; as visualizações ao vivo que você vê nas linhas do catálogo vêm de cartazes e URLs do Cloudflare Stream que os templates incluem, não de um runtime hospedado.',
      },
      {
        question: 'Como contribuo com um template?',
        answer:
          'Abra um PR contra <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> com uma nova pasta contendo <code>open-design.json</code>, <code>SKILL.md</code> e um <code>example.html</code> executável. O guia de contribuidor no <code>CONTRIBUTING.md</code> do repositório detalha os campos do manifesto. Contribuições aprovadas aparecem no catálogo público e são exibidas aqui automaticamente no próximo deploy.',
      },
      {
        question: 'Como isso difere do Claude Design Studio?',
        answer:
          'Claude Design Studio é o produto hospedado da Anthropic. Open Design é a <strong>alternativa open source para Claude Design</strong> — cada template, prompt e design system neste catálogo reside em um repositório público, executa localmente contra as chaves que você escolhe e pode ser estendido através de plugins que qualquer pessoa pode criar. Espelhamos a mesma taxonomia de artefatos (protótipos, apresentações, imagens, vídeo) para que o modelo mental seja transferível, mas tudo, até o runtime do agente, fica na sua máquina.',
      },
      {
        question: 'De onde vêm as visualizações?',
        answer:
          'O manifesto de cada template carrega uma URL de cartaz (CDN Cloudflare) e, para templates de vídeo, um MP4 do Cloudflare Stream. A grade renderiza o cartaz como miniatura estática e alterna para o vídeo em loop ao passar o mouse. Templates de imagem e protótipo mostram seu cartaz diretamente; clicar abre o <code>example.html</code> executável na página de detalhes.',
      },
    ],
    category: {
      prototype: {
        label: 'Protótipo',
        description:
          'Mockups de produtos interativos — dashboards, aplicativos, landing pages, ferramentas internas. Qualquer coisa que você entregaria a um stakeholder e clicaria.',
      },
      'live-artifact': {
        label: 'Artefato Ao Vivo',
        description:
          'Artefatos atualizáveis e cientes de dados que re-renderizam sempre que os dados subjacentes mudam. Dashboards ao vivo, painéis de monitoramento, rastreadores recorrentes.',
      },
      deck: {
        label: 'Apresentação',
        description:
          'Decks de apresentação polidos a partir de um resumo narrativo — pitch decks, módulos de cursos, relatórios semanais, lançamentos de produtos.',
      },
      image: {
        label: 'Imagem',
        description:
          'Ativos de imagem gerados a partir de direção criativa estruturada — mockups de UI, visuais de marca, storyboards, posts sociais, ilustrações.',
      },
      video: {
        label: 'Vídeo',
        description:
          'Prompts de vídeo, storyboards e artefatos de motion prontos para renderizar — short-form social, cortes de marketing, motion graphics, histórias cinematográficas.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Composições de motion prontas para HyperFrames — vídeo construído por agentes que mescla prompts de template, direção de cena e dicas de marca em uma timeline renderizável.',
      },
      audio: {
        label: 'Áudio',
        description:
          'Prompts de áudio e stems para identidade sônica short-form — sons de UI, bumpers de transição, scripts de voiceover.',
      },
    },
    subcategory: {
      'business-dashboards': 'Dashboards',
      'app-prototypes': 'Apps',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Ferramentas para desenvolvedores',
      'docs-reports': 'Docs & relatórios',
      'brand-design': 'Brand & design',
      'pitch-business': 'Pitch & negócios',
      'course-training': 'Curso & treinamento',
      'reports-briefings': 'Relatórios & resumos',
      'product-sales': 'Produto & vendas',
      'engineering-talks': 'Talks de engenharia',
      'creative-decks': 'Decks criativos',
      'ui-product-mockups': 'UI & mockups de produto',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Social & conteúdo',
      'avatar-portrait': 'Avatar & retrato',
      'illustration-style': 'Ilustração & estilo',
      'motion-effects': 'Motion & efeitos',
      'social-short-form': 'Social em formato curto',
      'marketing-product': 'Marketing & produto',
      'data-explainers': 'Data & explicadores',
      'cinematic-story': 'Cinematic story',
    },
  },
  it: {
    hubLabel: 'Libreria plugin', hubHeading: (n) => `${n} pezzi componibili.`,
    tileTemplates: 'Modelli', tileSkills: 'Skill', tileSystems: 'Sistemi', tileCraft: 'Artigianato',
    browseTemplates: 'Esplora modelli', browseSkills: 'Esplora skill', browseSystems: 'Esplora sistemi', browseCraft: 'Esplora artigianato',
    artifactKindLabel: 'Tipo di artefatto', sceneLabel: 'Scena', allChip: 'Tutti',
    detailUseCta: 'Usa questo plugin →', detailFindOnGithub: 'Vedi su GitHub →',
    detailClickForLivePreview: 'Clicca per anteprima live ↗', detailOpenInNewTab: 'Apri in nuova scheda ↗',
    shareOpen: 'Condividi ↗', shareTitle: 'Condividi questo plugin',
    shareLead: 'Copia il messaggio e apri la piattaforma su cui vuoi condividere.',
    shareCopyText: 'Copia testo', shareCopyLink: 'Solo il link', shareJumpTo: 'Vai a:',
    shareTemplate: ({ title, url }) => `🎨 Ho appena scoperto ${title} su @opendesignai — l’alternativa open-source a Claude Design.\n✨ Local-first · BYOK · il tuo agente progetta.\n\n→ ${url}`,
    hubLead: 'Open Design è costruito attorno a quattro tipi di plugin: Templates e Skill sono ciò che il tuo agent esegue; Systems e Craft tengono insieme brand e accessibilità. Scegli una sezione in cui scendere o salta a uno slug se sai già quale ti serve.',
    tileTemplatesBlurb: 'Template visuali ed eseguibili — prototipi, slide, generatori di immagine e video, composizioni motion. Ogni voce porta un example.html: fai fork, cambia i dati, spedisci.',
    tileSkillsBlurb: 'Skill di istruzione che l’agent carica a metà task — copy, teoria del colore, direzione creativa, brainstorming. Pura prosa SKILL.md; il risultato dipende dall’input.',
    tileSystemsBlurb: 'Design system ancorati al brand — palette, tipografia, motion, voice. Aggancia un progetto a un sistema e ogni output di plugin eredita la stessa identità.',
    tileCraftBlurb: 'Regole di craft agnostiche al brand — accessibilità, RTL, easing motion, etica fotografica. Le skill fanno opt-in via `od.craft.requires`, e il plugin eredita automaticamente la rigorosità giusta.',
    templatesLabel: 'Plugin · Template',
    templatesHeading: (n) => `${n} template eseguibili.`,
    templatesLead: 'Ogni template include una preview funzionante — la thumbnail del catalogo arriva diretta dal poster del manifest che l’agent usa dentro il prodotto. Sfogliali tutti o salta a una delle sette classi di artefatto.',
    skillsLabel: 'Plugin · Skill',
    skillsHeading: (n) => `${n} skill di istruzione.`,
    skillsLead: 'Skill che l’agent carica durante un task — copy, teoria del colore, direzione creativa, brainstorming. Niente demo statica perché il risultato dipende dall’input; ogni pagina di dettaglio si legge come un brief: titolo, descrizione, trigger, attribuzione.',
    systemsLabel: 'Plugin · Sistemi',
    systemsHeading: (n) => `${n} design system.`,
    systemsLead: 'Design system ancorati al brand che i plugin possono adottare via `od.craft.requires`. Ognuno con palette, tipografia, motion e voice; aggancia un progetto a un sistema e ogni output di plugin eredita la stessa identità.',
    craftLabel: 'Plugin · Craft',
    craftHeading: (n) => `${n} principi di craft.`,
    craftLead: 'Regole di craft agnostiche al brand — accessibilità, RTL, easing motion, etica fotografica. Le skill fanno opt-in via `od.craft.requires`, e il plugin eredita la rigorosità giusta automaticamente.',
    detailHomepage: 'Sito ↗',
    detailMode: 'Modalità',
    detailScenario: 'Scena',
    detailPlatform: 'Piattaforma',
    detailSurface: 'Superficie',
    detailAuthor: 'Autore',
    detailManifestId: 'ID manifest',
    detailTags: 'Tag',
    detailPreviewCaption: 'Preview dal manifest bundled-plugin.',
    detailBucketLabel: { examples: 'Esempio', 'image-templates': 'Template immagine', 'video-templates': 'Template video', scenarios: 'Scena', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Apri in una nuova scheda',
    breadcrumbLabel: 'Percorso di navigazione',
    shareDialogClose: 'Chiudi',
    previewImageAlt: (title) => `Anteprima di ${title}`,
    previewSummaryAria: (title) => `Apri anteprima interattiva di ${title}`,
    previewIframeTitle: (title) => `Anteprima interattiva di ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      "Artefatti costruiti da agenti che puoi forkare e deployare — prototipi, slide, template per immagini e video. Eseguili con le tue chiavi usando l'agente locale; i prompt, i poster e l'HTML di esempio sono tutti sotto Apache-2.0.",
    templatesCounterLabel: 'Totale',
    cardFeaturedTag: 'In Evidenza',
    cardReadFullPrompt: 'Leggi il prompt completo →',
    cardUseTemplate: 'Usa questo template',
    cardShareAria: (title) => `Condividi ${title}`,
    faqHead: 'Domande Frequenti',
    faqItems: [
      {
        question: 'Cosa sono i template di Open Design?',
        answer:
          "Template con plugin inclusi che vengono forniti con Open Design — l'alternativa open source a Claude Design. Ogni template è un artefatto eseguibile: un prototipo, un mazzo di slide, un generatore di immagini, una composizione video o un pezzo di motion di HyperFrames. L'agente locale esegue il plugin rispetto al suo prompt e a un HTML di esempio opzionale, e produce un asset pronto da condividere sul tuo computer.",
      },
      {
        question: 'Come sono licenziati i template?',
        answer:
          "Apache-2.0 sempre. Forkalo, adatta l'<code>example.html</code>, modifica i token di branding — l'unica richiesta è che tu mantenga l'avviso LICENSE quando lo redistribuisci.",
      },
      {
        question: 'Posso eseguirli con le mie chiavi API?',
        answer:
          'Sì. Open Design è BYOK a tutti i livelli — le tue credenziali Claude / OpenAI / modello locale non lasciano mai la tua macchina. Il sito di marketing non effettua proxy di alcuna inferenza; le anteprime live che vedi sulle righe del catalogo provengono da poster e URL di Cloudflare Stream che i template includono, non da un runtime ospitato.',
      },
      {
        question: 'Come contribuisco con un template?',
        answer:
          'Apri una PR contro <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> con una nuova cartella contenente <code>open-design.json</code>, <code>SKILL.md</code> e un <code>example.html</code> eseguibile. La guida per i contributori nel <code>CONTRIBUTING.md</code> del repository illustra i campi del manifest. I contributi approvati finiscono nel catalogo pubblico e appaiono automaticamente qui al prossimo deploy.',
      },
      {
        question: 'Come si differenzia da Claude Design Studio?',
        answer:
          "Claude Design Studio è il prodotto hosted di Anthropic. Open Design è l'<strong>alternativa open source a Claude Design</strong> — ogni template, prompt e design system in questo catalogo vive in un repo pubblico, viene eseguito localmente rispetto alle chiavi che scegli, e può essere esteso attraverso plugin che chiunque può creare. Rispecchiamo la stessa tassonomia di artefatti (prototipi, slide, immagini, video) così il modello mentale rimane lo stesso, ma tutto fino al runtime dell'agente rimane sulla tua macchina.",
      },
      {
        question: 'Da dove provengono le anteprime?',
        answer:
          "Il manifest di ogni template include un URL poster (CDN Cloudflare) e, per i template video, un MP4 di Cloudflare Stream. La griglia renderizza il poster come thumbnail statica e mostra il video in loop al passaggio del mouse. I template di immagini e prototipi mostrano il loro poster direttamente; cliccare per aprire l'<code>example.html</code> eseguibile nella pagina di dettaglio.",
      },
    ],
    category: {
      prototype: {
        label: 'Prototipo',
        description:
          'Mockup interattivi di prodotti — dashboard, app, landing page, strumenti interni. Qualsiasi cosa che mostreresti a uno stakeholder e per cui faresti click attraverso.',
      },
      'live-artifact': {
        label: 'Artefatto Live',
        description:
          'Artefatti aggiornabili e consapevoli dei dati che si rigenerano ogni volta che i dati sottostanti cambiano. Dashboard live, bacheche di monitoraggio, tracker ricorrenti.',
      },
      deck: {
        label: 'Slide',
        description:
          'Mazzi di slide lucidati da un brief narrativo — pitch deck, moduli di corsi, report settimanali, lanci di prodotto.',
      },
      image: {
        label: 'Immagine',
        description:
          'Asset di immagini generati da una direzione creativa strutturata — mockup UI, visual di brand, storyboard, post social, illustrazioni.',
      },
      video: {
        label: 'Video',
        description:
          'Prompt video, storyboard e artefatti di motion pronti per il rendering — short-form social, cut per il marketing, motion graphics, storie cinematografiche.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Composizioni di motion pronte per HyperFrames — video costruito da agenti che unisce prompt di template, direzione di scena e indicazioni di brand in una timeline renderizzabile.',
      },
      audio: {
        label: 'Audio',
        description:
          "Prompt audio e stem per l'identità sonico short-form — suoni UI, bump di transizione, script di voiceover.",
      },
    },
    subcategory: {
      'business-dashboards': 'Dashboard',
      'app-prototypes': 'App',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Developer tools',
      'docs-reports': 'Documenti & report',
      'brand-design': 'Brand & design',
      'pitch-business': 'Pitch & business',
      'course-training': 'Corso & training',
      'reports-briefings': 'Report & briefing',
      'product-sales': 'Prodotto & vendite',
      'engineering-talks': 'Engineering talks',
      'creative-decks': 'Creative deck',
      'ui-product-mockups': 'UI & mockup prodotto',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboard',
      'social-content': 'Social & contenuti',
      'avatar-portrait': 'Avatar & ritratto',
      'illustration-style': 'Illustrazione & stile',
      'motion-effects': 'Motion & effetti',
      'social-short-form': 'Social short form',
      'marketing-product': 'Marketing & prodotto',
      'data-explainers': 'Dati & spiegazioni',
      'cinematic-story': 'Cinematic story',
    },
  },
  id: {
    hubLabel: 'Pustaka plugin', hubHeading: (n) => `${n} potongan yang bisa digabungkan.`,
    tileTemplates: 'Template', tileSkills: 'Skill', tileSystems: 'Sistem', tileCraft: 'Kerajinan',
    browseTemplates: 'Jelajahi template', browseSkills: 'Jelajahi skill', browseSystems: 'Jelajahi sistem', browseCraft: 'Jelajahi kerajinan',
    artifactKindLabel: 'Jenis artefak', sceneLabel: 'Adegan', allChip: 'Semua',
    detailUseCta: 'Gunakan plugin ini →', detailFindOnGithub: 'Lihat di GitHub →',
    detailClickForLivePreview: 'Klik untuk live preview ↗', detailOpenInNewTab: 'Buka di tab baru ↗',
    shareOpen: 'Bagikan ↗', shareTitle: 'Bagikan plugin ini',
    shareLead: 'Salin pesan di bawah, lalu buka platform yang ingin Anda gunakan dan tempel.',
    shareCopyText: 'Salin teks', shareCopyLink: 'Salin tautan', shareJumpTo: 'Buka:',
    shareTemplate: ({ title, url }) => `🎨 Baru nemu ${title} di @opendesignai — alternatif open-source untuk Claude Design.\n✨ Local-first · BYOK · agent kamu yang nge-desain.\n\n→ ${url}`,
    hubLead: 'Open Design dibangun di sekitar empat jenis plugin: Templates dan Skills adalah yang dijalankan agent kamu; Systems dan Craft menjaga brand dan aksesibilitas. Pilih satu bagian untuk mendalami, atau lompat langsung ke slug kalau sudah tahu mau yang mana.',
    tileTemplatesBlurb: 'Template visual dan dapat dijalankan — prototipe, slide, generator gambar dan video, komposisi motion. Setiap entri membawa example.html: fork, ganti data, kirim.',
    tileSkillsBlurb: 'Skill instruksi yang dimuat agent di tengah tugas — copywriting, teori warna, arah kreatif, brainstorming. Murni prosa SKILL.md; hasil tergantung input kamu.',
    tileSystemsBlurb: 'Design system yang berlabuh di brand — palet, tipografi, motion, voice. Kaitkan proyek ke system, dan setiap output plugin mewarisi identitas yang sama.',
    tileCraftBlurb: 'Aturan craft yang agnostik brand — aksesibilitas, RTL, easing motion, etika fotografi. Skills opt-in lewat `od.craft.requires`, plugin otomatis mewarisi kekakuan yang sesuai.',
    templatesLabel: 'Plugin · Template',
    templatesHeading: (n) => `${n} template yang dapat dijalankan.`,
    templatesLead: 'Setiap template memiliki preview yang berfungsi — thumbnail katalog langsung dari poster manifest yang dipakai agent di dalam produk. Telusuri semua atau lompat ke salah satu dari tujuh jenis artefak.',
    skillsLabel: 'Plugin · Skill',
    skillsHeading: (n) => `${n} skill instruksi.`,
    skillsLead: 'Skill yang agent muat di tengah tugas — copywriting, teori warna, arah kreatif, brainstorming. Tidak ada demo statis karena hasil tergantung input; setiap halaman detail dibaca seperti brief: judul, deskripsi, trigger, atribusi.',
    systemsLabel: 'Plugin · Sistem',
    systemsHeading: (n) => `${n} design system.`,
    systemsLead: 'Design system yang berlabuh di brand yang dapat diadopsi plugin lewat `od.craft.requires`. Masing-masing punya palet, tipografi, motion dan voice; kaitkan proyek ke system, semua output plugin mewarisi identitas yang sama.',
    craftLabel: 'Plugin · Craft',
    craftHeading: (n) => `${n} prinsip craft.`,
    craftLead: 'Aturan craft agnostik brand — aksesibilitas, RTL, easing motion, etika fotografi. Skills opt-in via `od.craft.requires`, plugin otomatis mewarisi kekakuan yang sesuai.',
    detailHomepage: 'Beranda ↗',
    detailMode: 'Mode',
    detailScenario: 'Adegan',
    detailPlatform: 'Platform',
    detailSurface: 'Permukaan',
    detailAuthor: 'Penulis',
    detailManifestId: 'ID manifest',
    detailTags: 'Tag',
    detailPreviewCaption: 'Preview dari manifest bundled-plugin.',
    detailBucketLabel: { examples: 'Contoh', 'image-templates': 'Template gambar', 'video-templates': 'Template video', scenarios: 'Adegan', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Buka di tab baru',
    breadcrumbLabel: 'Navigasi breadcrumb',
    shareDialogClose: 'Tutup',
    previewImageAlt: (title) => `Pratinjau ${title}`,
    previewSummaryAria: (title) => `Buka pratinjau interaktif ${title}`,
    previewIframeTitle: (title) => `Pratinjau interaktif ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Artefak buatan agen yang bisa Anda fork dan deploy — prototipe, slide, dan template gambar serta video. Jalankan di kunci pribadi Anda dengan agen lokal; prompt, poster, dan contoh HTML semuanya di bawah Apache-2.0.',
    templatesCounterLabel: 'Total',
    cardFeaturedTag: 'Unggulan',
    cardReadFullPrompt: 'Baca prompt lengkap →',
    cardUseTemplate: 'Gunakan template ini',
    cardShareAria: (title) => `Bagikan ${title}`,
    faqHead: 'FAQ',
    faqItems: [
      {
        question: 'Apa itu template Open Design?',
        answer:
          'Template plugin bundel yang disertakan dengan Open Design — alternatif open source Claude Design. Masing-masing adalah artefak yang dapat dijalankan: prototipe, deck slide, generator gambar, komposisi video, atau piece motion HyperFrames. Agen lokal Anda menjalankan plugin terhadap prompt-nya dan contoh HTML opsional, dan menghasilkan aset siap bagikan di mesin Anda sendiri.',
      },
      {
        question: 'Bagaimana lisensi template?',
        answer:
          'Apache-2.0 di semua tempat. Fork prompt, adaptasi <code>example.html</code>, ubah brand token — satu-satunya permintaan adalah Anda menjaga pemberitahuan LICENSE saat didistribusikan ulang.',
      },
      {
        question: 'Bisakah saya menjalankannya dengan kunci API saya sendiri?',
        answer:
          'Ya. Open Design adalah BYOK di setiap layer — kredensial Claude / OpenAI / local-model Anda tidak pernah meninggalkan mesin Anda. Situs pemasaran tidak mem-proxy inference apa pun; preview langsung yang Anda lihat di baris katalog berasal dari poster dan URL Cloudflare Stream yang disertakan template, bukan dari runtime yang di-host.',
      },
      {
        question: 'Bagaimana cara saya berkontribusi template?',
        answer:
          'Buka PR terhadap <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> dengan folder baru berisi <code>open-design.json</code>, <code>SKILL.md</code>, dan <code>example.html</code> yang dapat dijalankan. Panduan kontributor di <code>CONTRIBUTING.md</code> repo berjalan melalui field manifest. Kontribusi yang disetujui mendarat di katalog publik dan muncul di sini secara otomatis pada deploy berikutnya.',
      },
      {
        question: 'Bagaimana perbedaannya dengan Claude Design Studio?',
        answer:
          'Claude Design Studio adalah produk hosted Anthropic. Open Design adalah <strong>alternatif open source Claude Design</strong> — setiap template, prompt, dan design system di katalog ini tinggal di repo publik, berjalan lokal terhadap kunci yang Anda pilih, dan dapat diperluas melalui plugin yang siapa pun bisa buat. Kami mencerminkan taksonomi artefak yang sama (prototipe, slide, gambar, video) sehingga model mental terbawa, tetapi semuanya hingga runtime agen tetap di mesin Anda.',
      },
      {
        question: 'Dari mana preview berasal?',
        answer:
          'Manifest setiap template membawa URL poster (Cloudflare CDN) dan, untuk template video, Cloudflare Stream MP4. Grid me-render poster sebagai thumbnail statis dan menukar video loop saat hover. Template gambar dan prototipe menampilkan poster mereka secara langsung; mengklik membuka <code>example.html</code> yang dapat dijalankan di halaman detail.',
      },
    ],
    category: {
      prototype: {
        label: 'Prototipe',
        description:
          'Mockup produk interaktif — dashboard, aplikasi, landing page, internal tools. Apa pun yang akan Anda berikan ke stakeholder dan klik melaluinya.',
      },
      'live-artifact': {
        label: 'Artefak Langsung',
        description:
          'Artefak yang dapat disegarkan dan sadar data yang me-render ulang kapan pun data dasar berubah. Dashboard langsung, monitoring board, tracker berulang.',
      },
      deck: {
        label: 'Slide',
        description:
          'Deck slide yang dipoles dari ringkasan naratif — pitch deck, modul kursus, laporan mingguan, peluncuran produk.',
      },
      image: {
        label: 'Gambar',
        description:
          'Aset gambar yang dihasilkan dari arahan kreatif terstruktur — mockup UI, visual brand, storyboard, postingan sosial, ilustrasi.',
      },
      video: {
        label: 'Video',
        description:
          'Prompt video, storyboard, dan artefak motion siap render — short-form sosial, potongan pemasaran, grafis motion, cerita sinematik.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Komposisi motion siap HyperFrames — video buatan agen yang memadukan prompt template, arahan scene, dan isyarat brand menjadi timeline yang dapat dirender.',
      },
      audio: {
        label: 'Audio',
        description:
          'Prompt audio dan stem untuk identitas sonik short-form — suara UI, bumper transisional, skrip voiceover.',
      },
    },
    subcategory: {
      'business-dashboards': 'Dashboard',
      'app-prototypes': 'Aplikasi',
      'landing-marketing': 'Landing & pemasaran',
      'developer-tools': 'Developer tools',
      'docs-reports': 'Dokumen & laporan',
      'brand-design': 'Brand & desain',
      'pitch-business': 'Pitch & bisnis',
      'course-training': 'Kursus & pelatihan',
      'reports-briefings': 'Laporan & briefing',
      'product-sales': 'Produk & penjualan',
      'engineering-talks': 'Engineering talks',
      'creative-decks': 'Deck kreatif',
      'ui-product-mockups': 'UI & mockup produk',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboard',
      'social-content': 'Sosial & konten',
      'avatar-portrait': 'Avatar & potret',
      'illustration-style': 'Ilustrasi & gaya',
      'motion-effects': 'Motion & efek',
      'social-short-form': 'Konten pendek',
      'marketing-product': 'Pemasaran & produk',
      'data-explainers': 'Data & penjelasan',
      'cinematic-story': 'Cinematic story',
    },
  },
  pl: {
    hubLabel: 'Biblioteka pluginów', hubHeading: (n) => `${n} komponowalnych elementów.`,
    tileTemplates: 'Szablony', tileSkills: 'Umiejętności', tileSystems: 'Systemy', tileCraft: 'Rzemiosło',
    browseTemplates: 'Przeglądaj szablony', browseSkills: 'Przeglądaj skille', browseSystems: 'Przeglądaj systemy', browseCraft: 'Przeglądaj rzemiosło',
    artifactKindLabel: 'Typ artefaktu', sceneLabel: 'Scena', allChip: 'Wszystkie',
    detailUseCta: 'Użyj tego pluginu →', detailFindOnGithub: 'Zobacz na GitHubie →',
    detailClickForLivePreview: 'Kliknij, aby zobaczyć podgląd ↗', detailOpenInNewTab: 'Otwórz w nowej karcie ↗',
    shareOpen: 'Udostępnij ↗', shareTitle: 'Udostępnij ten plugin',
    shareLead: 'Skopiuj wiadomość poniżej, otwórz wybraną platformę i wklej.',
    shareCopyText: 'Kopiuj tekst', shareCopyLink: 'Skopiuj link', shareJumpTo: 'Przejdź do:',
    shareTemplate: ({ title, url }) => `🎨 Właśnie odkryłem ${title} na @opendesignai — open-source’ową alternatywę dla Claude Design.\n✨ Local-first · BYOK · twój agent projektuje.\n\n→ ${url}`,
    hubLead: 'Open Design opiera się na czterech rodzajach wtyczek: Templates i Skills to to, co uruchamia twój agent; Systems i Craft pilnują marki i dostępności. Wybierz sekcję, by zejść głębiej, albo skocz prosto do sluga, jeśli już wiesz, czego chcesz.',
    tileTemplatesBlurb: 'Wizualne, wykonywalne szablony — prototypy, slajdy, generatory obrazów i wideo, kompozycje motion. Każda pozycja ma example.html: forkujesz, podmieniasz dane, wysyłasz.',
    tileSkillsBlurb: 'Wtyczki instrukcyjne, które agent wczytuje w trakcie zadania — copywriting, teoria koloru, kierunek kreatywny, burze mózgów. Czysty tekst SKILL.md; wynik zależy od twojego inputu.',
    tileSystemsBlurb: 'Design systemy zakotwiczone w marce — paleta, typografia, motion, głos. Podepnij projekt do systemu, a każdy output wtyczki dziedziczy tę samą tożsamość.',
    tileCraftBlurb: 'Reguły craftu niezależne od marki — dostępność, RTL, easing motion, etyka fotografii. Skills włączają się przez `od.craft.requires`, a wtyczka automatycznie dziedziczy odpowiednią surowość.',
    templatesLabel: 'Wtyczki · Szablony',
    templatesHeading: (n) => `${n} wykonywalnych szablonów.`,
    templatesLead: 'Każdy szablon ma działający podgląd — miniatura w katalogu przychodzi prosto z postera manifestu, którego agent używa wewnątrz produktu. Przejrzyj wszystkie albo skocz do jednej z siedmiu klas artefaktu.',
    skillsLabel: 'Wtyczki · Skille',
    skillsHeading: (n) => `${n} skilli instrukcyjnych.`,
    skillsLead: 'Skille, które agent wczytuje w trakcie zadania — copywriting, teoria koloru, kierunek kreatywny, burze mózgów. Bez statycznego demo, bo wynik zależy od inputu; każda strona szczegółu czyta się jak brief: tytuł, opis, triggery, atrybucja.',
    systemsLabel: 'Wtyczki · Systemy',
    systemsHeading: (n) => `${n} design systemów.`,
    systemsLead: 'Zakotwiczone w marce design systemy, które wtyczki mogą przyjąć przez `od.craft.requires`. Każdy z własną paletą, typografią, motion i głosem; podepnij projekt do systemu, a każdy output wtyczki dziedziczy tę samą tożsamość.',
    craftLabel: 'Wtyczki · Craft',
    craftHeading: (n) => `${n} zasad craftu.`,
    craftLead: 'Reguły craftu niezależne od marki — dostępność, RTL, easing motion, etyka fotografii. Skills włączają się przez `od.craft.requires`, a wtyczka automatycznie dziedziczy odpowiednią surowość.',
    detailHomepage: 'Strona główna ↗',
    detailMode: 'Tryb',
    detailScenario: 'Scena',
    detailPlatform: 'Platforma',
    detailSurface: 'Powierzchnia',
    detailAuthor: 'Autor',
    detailManifestId: 'ID manifestu',
    detailTags: 'Tagi',
    detailPreviewCaption: 'Podgląd z manifestu bundled-plugin.',
    detailBucketLabel: { examples: 'Przykład', 'image-templates': 'Szablon obrazu', 'video-templates': 'Szablon wideo', scenarios: 'Scena', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Otwórz w nowej karcie',
    breadcrumbLabel: 'Ścieżka nawigacyjna',
    shareDialogClose: 'Zamknij',
    previewImageAlt: (title) => `Podgląd ${title}`,
    previewSummaryAria: (title) => `Otwórz interaktywny podgląd ${title}`,
    previewIframeTitle: (title) => `Interaktywny podgląd ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Artefakty tworzone przez agentów, które możesz sforkować i wdrożyć — prototypy, slajdy, szablony obrazów i wideo. Uruchamiaj je na własnych kluczach z lokalnym agentem; wszystkie prompty, plakaty i przykładowe HTML-e są dostępne na licencji Apache-2.0.',
    templatesCounterLabel: 'Razem',
    cardFeaturedTag: 'Wyróżnione',
    cardReadFullPrompt: 'Czytaj pełny prompt →',
    cardUseTemplate: 'Użyj tego szablonu',
    cardShareAria: (title) => `Udostępnij ${title}`,
    faqHead: 'FAQ',
    faqItems: [
      {
        question: 'Czym są szablony Open Design?',
        answer:
          "Szablony z wbudowanymi wtyczkami, które dostarczane są z Open Design — open source'ową alternatywą Claude Design. Każdy to artefakt, który można uruchomić: prototyp, prezentacja, generator obrazów, kompozycja wideo lub piece motion HyperFrames. Twój lokalny agent uruchamia wtyczkę względem jej promptu i opcjonalnego przykładowego HTML-a, produkcując gotowy do udostępnienia zasób na Twojej maszynie.",
      },
      {
        question: 'Na jakiej licencji są szablony?',
        answer:
          'Apache-2.0 wszędzie. Sforkuj prompt, zaadaptuj <code>example.html</code>, zmień tokeny brandowe — jedyna prośba to zachować notatkę LICENSE przy redystrybucji.',
      },
      {
        question: 'Czy mogę uruchamiać je z własnymi kluczami API?',
        answer:
          'Tak. Open Design to BYOK na każdej warstwie — Twoje dane uwierzytelniające Claude / OpenAI / lokalnego modelu nigdy nie opuszczają Twoją maszynę. Witryna marketingowa nie realizuje żadnych wnioskodawań; podglądy na żywo, które widzisz na rzędach katalogów, pochodzą z plakatów i adresów URL Cloudflare Stream, które dostarczają szablony, a nie z hostowanego środowiska uruchomieniowego.',
      },
      {
        question: 'Jak wnieść swój szablon?',
        answer:
          'Otwórz PR przeciwko <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> z nowym folderem zawierającym <code>open-design.json</code>, <code>SKILL.md</code> i runnable <code>example.html</code>. Przewodnik dla współpracowników w pliku <code>CONTRIBUTING.md</code> repozytorium wyjaśnia pola manifestu. Zatwierdzone wkłady trafiają do publicznego katalogu i pojawiają się tu automatycznie przy następnym wdrożeniu.',
      },
      {
        question: 'Czym różni się to od Claude Design Studio?',
        answer:
          "Claude Design Studio to hostowany produkt firmy Anthropic. Open Design to <strong>open source'owa alternatywa Claude Design</strong> — każdy szablon, prompt i system designu w tym katalogu żyje w publicznym repozytorium, uruchamia się lokalnie względem wybranych przez Ciebie kluczy i może być rozszerzany poprzez wtyczki, które każdy może napisać. Dublujemy tę samą taksonomię artefaktów (prototypy, slajdy, obrazy, wideo), aby model mentalny był spójny, ale wszystko aż do środowiska uruchomieniowego agenta pozostaje na Twojej maszynie.",
      },
      {
        question: 'Skąd pochodzą podglądy?',
        answer:
          'Manifest każdego szablonu zawiera adres URL plakatu (CDN Cloudflare) i dla szablonów wideo — MP4 z Cloudflare Stream. Siatka renderuje plakat jako statyczną miniaturę i zamienia wideo na najechaniu. Szablony obrazów i prototypów pokazują swój plakat bezpośrednio; kliknięcie otwiera runnable <code>example.html</code> na stronie szczegółów.',
      },
    ],
    category: {
      prototype: {
        label: 'Prototyp',
        description:
          'Interaktywne mockupy produktów — dashboardy, aplikacje, strony docelowe, narzędzia wewnętrzne. Wszystko, co pokazałbyś zainteresowanej stronie i przeklikanbyś.',
      },
      'live-artifact': {
        label: 'Artefakt na żywo',
        description:
          'Odświeżalne, świadome danych artefakty, które re-renderują się za każdym razem, gdy zmienią się dane bazowe. Dashboardy na żywo, tablice monitorowania, powtarzające się trackery.',
      },
      deck: {
        label: 'Slajdy',
        description:
          'Wypolerowane prezentacje ze zwięzłej narracji — pitch decks, moduły kursowe, raporty tygodniowe, premiery produktów.',
      },
      image: {
        label: 'Obraz',
        description:
          'Zasoby graficzne wygenerowane ze strukturalnych wytycznych kreatywnych — mockupy UI, materiały brandowe, scenorysy, posty w mediach społecznościowych, ilustracje.',
      },
      video: {
        label: 'Wideo',
        description:
          'Prompty wideo, scenorysy i artefakty motion gotowe do renderowania — krótkie formy społeczne, cięcia marketingowe, grafika motion, cinematic stories.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Kompozycje motion gotowe dla HyperFrames — wideo tworzone przez agentów, które łączą prompty szablonów, kierunek sceny i wskazówki brandowe w renderowalną oś czasu.',
      },
      audio: {
        label: 'Audio',
        description:
          'Prompty audio i stemy dla krótkoformatowej tożsamości sonicznej — dźwięki UI, przejściowe bumpers, skrypty voiceover.',
      },
    },
    subcategory: {
      'business-dashboards': 'Panele nawigacyjne',
      'app-prototypes': 'Aplikacje',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Narzędzia dla deweloperów',
      'docs-reports': 'Dokumenty & raporty',
      'brand-design': 'Brand & design',
      'pitch-business': 'Pitch & biznes',
      'course-training': 'Kursy & szkolenia',
      'reports-briefings': 'Raporty & briefingi',
      'product-sales': 'Produkt & sprzedaż',
      'engineering-talks': 'Inżynieria & technologia',
      'creative-decks': 'Kreatywne prezentacje',
      'ui-product-mockups': 'UI & mockupy produktów',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboardy',
      'social-content': 'Social & treści',
      'avatar-portrait': 'Avatar & portrety',
      'illustration-style': 'Ilustracje & styl',
      'motion-effects': 'Animacja & efekty',
      'social-short-form': 'Social short form',
      'marketing-product': 'Marketing & produkt',
      'data-explainers': 'Dane & infografiki',
      'cinematic-story': 'Cinematic story',
    },
  },
  ar: {
    hubLabel: 'مكتبة الإضافات', hubHeading: (n) => `${n} قطعة قابلة للتركيب.`,
    tileTemplates: 'قوالب', tileSkills: 'مهارات', tileSystems: 'أنظمة', tileCraft: 'حِرَفية',
    browseTemplates: 'تصفح القوالب', browseSkills: 'تصفح المهارات', browseSystems: 'تصفح الأنظمة', browseCraft: 'تصفح الحِرَفية',
    artifactKindLabel: 'نوع المنتج', sceneLabel: 'مشهد', allChip: 'الكل',
    detailUseCta: 'استخدم هذه الإضافة ←', detailFindOnGithub: 'اعرضها على GitHub ←',
    detailClickForLivePreview: 'انقر للمعاينة الحية ↗', detailOpenInNewTab: 'افتح في علامة تبويب جديدة ↗',
    shareOpen: 'مشاركة ↗', shareTitle: 'شارك هذه الإضافة',
    shareLead: 'انسخ الرسالة أدناه، ثم انتقل إلى المنصة التي تريد المشاركة عليها والصقها.',
    shareCopyText: 'انسخ النص', shareCopyLink: 'انسخ الرابط فقط', shareJumpTo: 'انتقل إلى:',
    shareTemplate: ({ title, url }) => `🎨 اكتشفت للتو ${title} على @opendesignai — البديل مفتوح المصدر لـ Claude Design.\n✨ محلي أولًا · BYOK · وكيلك يصمّم.\n\n→ ${url}`,
    hubLead: 'تم بناء Open Design حول أربعة أنواع من الإضافات: القوالب والمهارات هي ما يشغّله الـ agent؛ والأنظمة والحرفة تحافظان على الهوية وإمكانية الوصول. اختر قسما للتعمق، أو انتقل مباشرة إلى slug إذا كنت تعرف ما تريد.',
    tileTemplatesBlurb: 'قوالب مرئية وقابلة للتشغيل — نماذج أولية، شرائح، مولّدات صور وفيديو، تركيبات حركة. كل مدخل يأتي مع example.html: انسخ، بدّل البيانات، اطلق.',
    tileSkillsBlurb: 'مهارات إرشاد يحملها الـ agent أثناء المهمة — كتابة، نظرية الألوان، توجيه إبداعي، عصف ذهني. نص SKILL.md خالص؛ النتيجة تعتمد على مدخلاتك.',
    tileSystemsBlurb: 'أنظمة تصميم مرتبطة بالهوية — لوحة ألوان، تيبوغرافيا، حركة، صوت. اربط مشروعا بنظام، فترث كل مخرجات الإضافات نفس الهوية.',
    tileCraftBlurb: 'قواعد حرفة لا تعتمد على الهوية — إمكانية الوصول، RTL، انسيابية الحركة، أخلاقيات التصوير. تشترك المهارات عبر `od.craft.requires`، فترث الإضافة الصرامة المناسبة تلقائيا.',
    templatesLabel: 'إضافات · قوالب',
    templatesHeading: (n) => `${n} قالبا قابلا للتشغيل.`,
    templatesLead: 'كل قالب يأتي مع معاينة شغّالة — صورة الكتالوج المصغّرة تأتي مباشرة من بوستر manifest الذي يستخدمه الـ agent داخل المنتج. تصفّح الجميع، أو انتقل إلى أحد الأنواع السبعة من المنتجات.',
    skillsLabel: 'إضافات · مهارات',
    skillsHeading: (n) => `${n} مهارة إرشاد.`,
    skillsLead: 'مهارات يحملها الـ agent أثناء المهمة — كتابة، نظرية الألوان، توجيه إبداعي، عصف ذهني. لا توجد demo ثابتة لأن النتيجة تعتمد على المدخل؛ كل صفحة تفصيل تُقرأ كموجز: عنوان، وصف، محفّزات، إسناد.',
    systemsLabel: 'إضافات · أنظمة',
    systemsHeading: (n) => `${n} نظام تصميم.`,
    systemsLead: 'أنظمة تصميم مرتبطة بالهوية يمكن للإضافات تبنّيها عبر `od.craft.requires`. لكل واحد لوحة، تيبوغرافيا، حركة وصوت خاصة؛ اربط مشروعا بنظام وكل مخرجات إضافة ترث نفس الهوية.',
    craftLabel: 'إضافات · حرفة',
    craftHeading: (n) => `${n} مبدأ حرفة.`,
    craftLead: 'قواعد حرفة لا تعتمد على الهوية — إمكانية الوصول، RTL، انسيابية الحركة، أخلاقيات التصوير. المهارات تشترك عبر `od.craft.requires`، فترث الإضافة الصرامة المناسبة تلقائيا.',
    detailHomepage: 'الصفحة الرئيسية ↗',
    detailMode: 'الوضع',
    detailScenario: 'المشهد',
    detailPlatform: 'المنصة',
    detailSurface: 'السطح',
    detailAuthor: 'المؤلف',
    detailManifestId: 'معرف Manifest',
    detailTags: 'الوسوم',
    detailPreviewCaption: 'معاينة من bundled-plugin manifest.',
    detailBucketLabel: { examples: 'مثال', 'image-templates': 'قالب صور', 'video-templates': 'قالب فيديو', scenarios: 'مشهد', 'design-systems': 'نظام تصميم', atoms: 'Atom' },
    detailOpenInNewTabAria: 'فتح في علامة تبويب جديدة',
    breadcrumbLabel: 'مسار التنقل',
    shareDialogClose: 'إغلاق',
    previewImageAlt: (title) => `معاينة ${title}`,
    previewSummaryAria: (title) => `فتح المعاينة التفاعلية لـ ${title}`,
    previewIframeTitle: (title) => `المعاينة التفاعلية لـ ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'أداة وقوالب مبنية بواسطة الوكيل يمكنك نسخها ونشرها — نماذج أولية وشرائح وقوالب صور وفيديو. شغّلها على مفاتيحك الخاصة مع الوكيل المحلي؛ الأوامر والملصقات وملفات HTML التوضيحية كلها تحت Apache-2.0.',
    templatesCounterLabel: 'الإجمالي',
    cardFeaturedTag: 'مميز',
    cardReadFullPrompt: 'اقرأ الأمر كاملاً →',
    cardUseTemplate: 'استخدم هذا القالب',
    cardShareAria: (title) => `شارك ${title}`,
    faqHead: 'الأسئلة الشائعة',
    faqItems: [
      {
        question: 'ما هي قوالب Open Design؟',
        answer:
          'قوالب مدمجة تأتي مع Open Design — البديل مفتوح المصدر لـ Claude Design. كل واحد منها أداة قابلة للتشغيل: نموذج أولي أو مجموعة شرائح أو مولد صور أو مركبة فيديو أو قطعة حركة HyperFrames. يقوم وكيلك المحلي بتشغيل المكون على أساس أمره وملف HTML توضيحي اختياري، وينتج أصل جاهز للمشاركة على جهازك.',
      },
      {
        question: 'كيف يتم ترخيص القوالب؟',
        answer:
          'Apache-2.0 في كل مكان. انسخ الأمر وعدّل <code>example.html</code> وغيّر رموز العلامة التجارية — المطلب الوحيد هو أن تحتفظ بإشعار LICENSE عند إعادة التوزيع.',
      },
      {
        question: 'هل يمكنني تشغيلها باستخدام مفاتيح API الخاصة بي؟',
        answer:
          'نعم. Open Design هو BYOK في كل طبقة — بيانات اعتماد Claude و OpenAI والنموذج المحلي الخاصة بك لا تترك جهازك أبداً. موقع التسويق لا يوجه أي استدلال؛ المعاينات المباشرة التي تراها في صفوف الكتالوج تأتي من الملصقات وعناوين URL لـ Cloudflare Stream التي يأتي معها القالب، وليس من وقت تشغيل مستضاف.',
      },
      {
        question: 'كيف أساهم بقالب؟',
        answer:
          'افتح PR ضد <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> بمجلد جديد يحتوي على <code>open-design.json</code> و <code>SKILL.md</code> و <code>example.html</code> قابل للتشغيل. يرشدك دليل المساهم في <code>CONTRIBUTING.md</code> الخاص بالمستودع عبر حقول البيان. تظهر المساهمات المعتمدة في الكتالوج العام وتظهر هنا تلقائياً عند النشر التالي.',
      },
      {
        question: 'كيف يختلف هذا عن Claude Design Studio؟',
        answer:
          'Claude Design Studio هو المنتج المستضاف من Anthropic. Open Design هو <strong>البديل مفتوح المصدر لـ Claude Design</strong> — كل قالب وأمر ونظام تصميم في هذا الكتالوج يوجد في مستودع عام، يعمل محلياً ضد المفاتيح التي تختارها، ويمكن توسيعه من خلال المكونات التي يمكن لأي شخص تأليفها. نعكس نفس تصنيف الأداة (نماذج أولية وشرائح وصور وفيديو) بحيث ينقل النموذج العقلي، لكن كل شيء وصولاً إلى وقت التشغيل للوكيل يبقى على جهازك.',
      },
      {
        question: 'من أين تأتي المعاينات؟',
        answer:
          'يحمل بيان كل قالب عنوان URL للملصق (CDN من Cloudflare) وبالنسبة لقوالب الفيديو، MP4 من Cloudflare Stream. تعرض الشبكة الملصق كصورة مصغرة ثابتة وتبديل الفيديو المتكرر عند التمرير. تعرض قوالب الصور والنموذج الأولي الملصق مباشرة؛ ينفتح النقر من خلال <code>example.html</code> القابل للتشغيل على صفحة التفاصيل.',
      },
    ],
    category: {
      prototype: {
        label: 'نموذج أولي',
        description:
          'نماذج منتجات تفاعلية — لوحات معلومات وتطبيقات وصفحات هبوط وأدوات داخلية. أي شيء ستسلمه لصاحب مصلحة وتنقر عليه.',
      },
      'live-artifact': {
        label: 'أداة مباشرة',
        description:
          'أدوات قابلة للتحديث وتدرك البيانات التي تعاد رسالتها كلما تغيرت البيانات الأساسية. لوحات معلومات مباشرة وألواح مراقبة وأجهزة تتبع متكررة.',
      },
      deck: {
        label: 'شرائح',
        description:
          'مجموعات شرائح مصقولة من موجز سردي — عروض الملاعب ووحدات الدورات والتقارير الأسبوعية وإطلاقات المنتجات.',
      },
      image: {
        label: 'صورة',
        description:
          'أصول الصور المنتجة من التوجيه الإبداعي المنظم — نماذج واجهة المستخدم والمرئيات العلامة التجارية والقصص المصورة ومنشورات وسائل التواصل والرسوم التوضيحية.',
      },
      video: {
        label: 'فيديو',
        description:
          'موجزات الفيديو والقصص المصورة والأداة جاهزة للحركة — وسائل التواصل قصيرة الشكل والقطع التسويقية والرسومات المتحركة والقصص السينمائية.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'مركبات حركة جاهزة لـ HyperFrames — فيديو مبني بواسطة الوكيل يمزج موجزات القالب واتجاه المشهد ورموز العلامة التجارية في جدول زمني قابل للعرض.',
      },
      audio: {
        label: 'صوت',
        description:
          'موجزات صوتية وسيقان لهوية سونية قصيرة الشكل — أصوات واجهة المستخدم والمصدات الانتقالية وسكريبتات السرد.',
      },
    },
    subcategory: {
      'business-dashboards': 'لوحات المعلومات',
      'app-prototypes': 'التطبيقات',
      'landing-marketing': 'الصفحات الهبوط والتسويق',
      'developer-tools': 'أدوات المطورين',
      'docs-reports': 'المستندات والتقارير',
      'brand-design': 'العلامة التجارية والتصميم',
      'pitch-business': 'العروض والأعمال',
      'course-training': 'الدورات والتدريب',
      'reports-briefings': 'التقارير والإحاطات',
      'product-sales': 'المنتج والمبيعات',
      'engineering-talks': 'محادثات الهندسة',
      'creative-decks': 'العروض الإبداعية',
      'ui-product-mockups': 'UI والنماذج الأولية للمنتج',
      'brand-visuals': 'العلامة التجارية والشعار',
      'storyboards-motion-refs': 'اللوحات الموصوفة',
      'social-content': 'وسائل التواصل والمحتوى',
      'avatar-portrait': 'الصورة الرمزية والصورة الشخصية',
      'illustration-style': 'الرسوم التوضيحية والأسلوب',
      'motion-effects': 'الحركة والمؤثرات',
      'social-short-form': 'وسائل التواصل قصيرة الشكل',
      'marketing-product': 'التسويق والمنتج',
      'data-explainers': 'البيانات والشروحات',
      'cinematic-story': 'القصة السينمائية',
    },
  },
  tr: {
    hubLabel: 'Eklenti kütüphanesi', hubHeading: (n) => `${n} birleştirilebilir parça.`,
    tileTemplates: 'Şablonlar', tileSkills: 'Yetenekler', tileSystems: 'Sistemler', tileCraft: 'Zanaat',
    browseTemplates: 'Şablonları gözat', browseSkills: 'Yetenekleri gözat', browseSystems: 'Sistemleri gözat', browseCraft: 'Zanaatı gözat',
    artifactKindLabel: 'Çıktı türü', sceneLabel: 'Sahne', allChip: 'Tümü',
    detailUseCta: 'Bu eklentiyi kullan →', detailFindOnGithub: 'GitHub’da görüntüle →',
    detailClickForLivePreview: 'Canlı önizleme için tıkla ↗', detailOpenInNewTab: 'Yeni sekmede aç ↗',
    shareOpen: 'Paylaş ↗', shareTitle: 'Bu eklentiyi paylaş',
    shareLead: 'Aşağıdaki mesajı kopyala, dilediğin platformu açıp yapıştır.',
    shareCopyText: 'Metni kopyala', shareCopyLink: 'Sadece linki kopyala', shareJumpTo: 'Şuraya git:',
    shareTemplate: ({ title, url }) => `🎨 Yeni keşfettim: ${title} (@opendesignai) — Claude Design’a açık kaynaklı alternatif.\n✨ Local-first · BYOK · ajanın tasarlıyor.\n\n→ ${url}`,
    hubLead: 'Open Design dört eklenti türü etrafında inşa edilmiştir: Templates ve Skills agent’ın çalıştırdığı, Systems ve Craft ise marka ve erişilebilirliği koruyan parçalar. Bir bölüme dal ya da hangi slug’u istediğini biliyorsan doğrudan oraya zıpla.',
    tileTemplatesBlurb: 'Görsel ve çalıştırılabilir şablonlar — prototipler, slaytlar, görsel ve video üreticileri, motion kompozisyonları. Her giriş example.html ile gelir: fork, veri değiştir, gönder.',
    tileSkillsBlurb: 'Agent’ın görev sırasında yüklediği yönerge skill’leri — metin yazımı, renk teorisi, kreatif yönlendirme, beyin fırtınası. Saf SKILL.md metni; sonuç input’una göre değişir.',
    tileSystemsBlurb: 'Markaya bağlanmış tasarım sistemleri — palet, tipografi, motion, ses. Bir projeyi bir sisteme bağla, tüm eklenti çıktıları aynı kimliği miras alsın.',
    tileCraftBlurb: 'Markadan bağımsız craft kuralları — erişilebilirlik, RTL, motion easing, fotoğraf etiği. Skills `od.craft.requires` ile opt-in eder, eklenti uygun katılığı otomatik miras alır.',
    templatesLabel: 'Eklentiler · Şablonlar',
    templatesHeading: (n) => `${n} çalıştırılabilir şablon.`,
    templatesLead: 'Her şablon çalışan bir önizleme ile gelir — katalog satırının küçük resmi doğrudan agent’ın ürün içinde kullandığı manifest poster’ından alınır. Hepsine bak ya da yedi artefakt türünden birine zıpla.',
    skillsLabel: 'Eklentiler · Skill’ler',
    skillsHeading: (n) => `${n} yönerge skill’i.`,
    skillsLead: 'Agent’ın görev sırasında yüklediği skill’ler — metin yazımı, renk teorisi, kreatif yönlendirme, beyin fırtınası. Sonuç input’a bağlı olduğu için statik demo yok; her detay sayfası bir brief gibi okunur: başlık, açıklama, tetikler, atıf.',
    systemsLabel: 'Eklentiler · Sistemler',
    systemsHeading: (n) => `${n} tasarım sistemi.`,
    systemsLead: 'Eklentilerin `od.craft.requires` ile benimseyebildiği markaya bağlı tasarım sistemleri. Her biri kendi paleti, tipografisi, motion’ı ve sesi ile gelir; projeni bir sisteme bağla, tüm eklenti çıktıları aynı kimliği miras alır.',
    craftLabel: 'Eklentiler · Craft',
    craftHeading: (n) => `${n} craft prensibi.`,
    craftLead: 'Markadan bağımsız craft kuralları — erişilebilirlik, RTL, motion easing, fotoğraf etiği. Skills `od.craft.requires` ile opt-in eder, eklenti uygun katılığı otomatik miras alır.',
    detailHomepage: 'Anasayfa ↗',
    detailMode: 'Mod',
    detailScenario: 'Sahne',
    detailPlatform: 'Platform',
    detailSurface: 'Yüzey',
    detailAuthor: 'Yazar',
    detailManifestId: 'Manifest ID',
    detailTags: 'Etiketler',
    detailPreviewCaption: 'bundled-plugin manifest’ten önizleme.',
    detailBucketLabel: { examples: 'Örnek', 'image-templates': 'Görsel şablon', 'video-templates': 'Video şablon', scenarios: 'Sahne', 'design-systems': 'Tasarım sistemi', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Yeni sekmede aç',
    breadcrumbLabel: 'İçerik haritası',
    shareDialogClose: 'Kapat',
    previewImageAlt: (title) => `${title} önizlemesi`,
    previewSummaryAria: (title) => `${title} için etkileşimli önizlemeyi aç`,
    previewIframeTitle: (title) => `${title} etkileşimli önizleme`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Aracı tarafından oluşturulan ve fork edebileceğiniz artifacts — prototipler, slaytlar, resim ve video şablonları. Bunları yerel aracı kullanarak kendi anahtarlarınızda çalıştırın; tüm promptlar, posterler ve örnek HTML dosyaları Apache-2.0 lisansı altındadır.',
    templatesCounterLabel: 'Toplam',
    cardFeaturedTag: 'Öne Çıkanlar',
    cardReadFullPrompt: 'Tam promptu oku →',
    cardUseTemplate: 'Bu şablonu kullan',
    cardShareAria: (title) => `${title} paylaş`,
    faqHead: 'SSS',
    faqItems: [
      {
        question: 'Open Design şablonları nedir?',
        answer:
          "Open Design ile birlikte gelen eklenti paketlenmiş şablonlar — açık kaynak Claude Design alternatifi. Her biri çalıştırılabilir bir artifact: prototip, slayt seti, resim oluşturucu, video композисі veya HyperFrames hareket parçası. Yerel aracınız eklentiyi prompt ve isteğe bağlı örnek HTML'e karşı çalıştırır ve makinenizde paylaşılmaya hazır bir asset üretir.",
      },
      {
        question: 'Şablonlar nasıl lisanslanır?',
        answer:
          "Her yerde Apache-2.0. Promptu fork edin, <code>example.html</code>'i uyarlayın, marka tokenlarını değiştirin — tek istenen şey, yeniden dağıtırken LICENSE bildirisini tutmanızdır.",
      },
      {
        question: 'Kendi API anahtarlarımla çalıştırabilir miyim?',
        answer:
          "Evet. Open Design her katmanda BYOK'dur — Claude / OpenAI / yerel model kimlik bilgileriniz makinenizi asla terk etmez. Pazarlama sitesi herhangi bir inference proxy'si değildir; katalog satırlarında gördüğünüz canlı önizlemeler posterlerden ve şablonların sağladığı Cloudflare Stream URL'lerinden gelir, barındırılan bir runtime'dan değil.",
      },
      {
        question: 'Nasıl şablon katkısında bulunurum?',
        answer:
          '<a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> deposuna, <code>open-design.json</code>, <code>SKILL.md</code> ve çalıştırılabilir <code>example.html</code> içeren yeni bir klasörle bir PR açın. Depo içindeki katkıcı kılavuzu manifest alanlarında adım adım rehberlik eder. Onaylanan katkılar genel kataloga girer ve bir sonraki deployment\'ta burada otomatik olarak gösterilir.',
      },
      {
        question: "Bu, Claude Design Studio'dan nasıl farklı?",
        answer:
          "Claude Design Studio, Anthropic'in barındırılan ürünüdür. Open Design, <strong>açık kaynak Claude Design alternatifidir</strong> — bu katalogdaki her şablon, prompt ve tasarım sistemi genel bir repo'da yaşar, seçtiğiniz anahtarlara karşı yerel olarak çalışır ve herkesin yazabileceği eklentiler aracılığıyla genişletilebilir. Aynı artifact taksonomisini (prototipler, slaytlar, resimler, video) yansıtıyoruz, böylece zihinsel model devam eder, ancak aracı runtime'a kadar her şey makinenizde kalır.",
      },
      {
        question: 'Önizlemeler nereden geliyor?',
        answer:
          "Her şablonun manifestı bir poster URL'si (Cloudflare CDN) ve video şablonları için bir Cloudflare Stream MP4 taşır. Grid, poster'ı statik küçük resim olarak render eder ve üzerine gelince video döngüsünü başlatır. Resim ve prototip şablonları, poster'larını doğrudan gösterir; tıklamak ayrıntı sayfasında çalıştırılabilir <code>example.html</code>'i açar.",
      },
    ],
    category: {
      prototype: {
        label: 'Prototip',
        description:
          'Etkileşimli ürün modelleri — kontrol panelleri, uygulamalar, açılış sayfaları, dahili araçlar. Bir paydaşa sunacağınız ve tıklayacağınız her şey.',
      },
      'live-artifact': {
        label: 'Canlı Artifact',
        description:
          'Temel veriler değiştiğinde yeniden render olan yenilenebilir, veri farkında artifactlar. Canlı kontrol panelleri, izleme panoları, tekrarlayan izleyiciler.',
      },
      deck: {
        label: 'Slaytlar',
        description:
          'Bir anlatı özeti ile hazırlanmış cilalı slayt serileri — pitch serileri, kurs modülleri, haftalık raporlar, ürün lansmanları.',
      },
      image: {
        label: 'Resim',
        description:
          'Yapılandırılmış yaratıcı yönergelerden oluşturulan resim varlıkları — UI modelleri, marka görselleri, taslak serileri, sosyal gönderiler, illüstrasyonlar.',
      },
      video: {
        label: 'Video',
        description:
          "Video promptları, taslak serileri ve render'a hazır hareket artifactları — kısa form sosyal medya, pazarlama kesintileri, hareket grafikleri, sinematik hikayeler.",
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          "HyperFrames'e hazır hareket композиcileri — şablon promptlarını, sahne yönetimini ve marka ipuçlarını render'a uygun zaman çizelgesine birleştiren aracı tarafından oluşturulan video.",
      },
      audio: {
        label: 'Ses',
        description:
          "Kısa form sonic kimliği için ses promptları ve stem'ler — UI sesleri, geçiş bumper'ları, sesli anlatım komut dosyaları.",
      },
    },
    subcategory: {
      'business-dashboards': 'Kontrol Panelleri',
      'app-prototypes': 'Uygulamalar',
      'landing-marketing': 'Landing & pazarlama',
      'developer-tools': 'Geliştirici araçları',
      'docs-reports': 'Dokümanlar & raporlar',
      'brand-design': 'Marka & tasarım',
      'pitch-business': 'Sunum & iş',
      'course-training': 'Kurs & eğitim',
      'reports-briefings': 'Raporlar & özet',
      'product-sales': 'Ürün & satış',
      'engineering-talks': 'Mühendislik konuşmaları',
      'creative-decks': 'Yaratıcı sunumlar',
      'ui-product-mockups': 'UI & ürün mockupları',
      'brand-visuals': 'Marka & logo',
      'storyboards-motion-refs': 'Storyboardlar',
      'social-content': 'Sosyal & içerik',
      'avatar-portrait': 'Avatar & portre',
      'illustration-style': 'İllüstrasyon & stil',
      'motion-effects': 'Hareket & efektler',
      'social-short-form': 'Sosyal kısa form',
      'marketing-product': 'Pazarlama & ürün',
      'data-explainers': 'Veri & açıklamalar',
      'cinematic-story': 'Sinematik hikaye',
    },
  },
  uk: {
    hubLabel: 'Бібліотека плагінів', hubHeading: (n) => `${n} компонованих елементів.`,
    tileTemplates: 'Шаблони', tileSkills: 'Навички', tileSystems: 'Системи', tileCraft: 'Ремесло',
    browseTemplates: 'Переглянути шаблони', browseSkills: 'Переглянути навички', browseSystems: 'Переглянути системи', browseCraft: 'Переглянути ремесло',
    artifactKindLabel: 'Тип артефакту', sceneLabel: 'Сцена', allChip: 'Усі',
    detailUseCta: 'Використати цей плагін →', detailFindOnGithub: 'Дивитись на GitHub →',
    detailClickForLivePreview: 'Клікніть для живого перегляду ↗', detailOpenInNewTab: 'Відкрити в новій вкладці ↗',
    shareOpen: 'Поділитись ↗', shareTitle: 'Поділитись цим плагіном',
    shareLead: 'Скопіюйте повідомлення нижче, потім перейдіть на платформу й вставте.',
    shareCopyText: 'Копіювати текст', shareCopyLink: 'Тільки посилання', shareJumpTo: 'Перейти:',
    shareTemplate: ({ title, url }) => `🎨 Щойно знайшов ${title} на @opendesignai — open-source альтернативу Claude Design.\n✨ Local-first · BYOK · ваш агент робить дизайн.\n\n→ ${url}`,
    hubLead: 'Open Design побудовано навколо чотирьох видів плагінів: Templates і Skills — те, що виконує твій agent; Systems і Craft утримують бренд і доступність. Обери розділ для занурення або одразу перейди по slug, якщо вже знаєш, що потрібно.',
    tileTemplatesBlurb: 'Візуальні, виконувані шаблони — прототипи, слайди, генератори зображень і відео, motion-композиції. Кожен запис іде з example.html: форкай, міняй дані, відправляй.',
    tileSkillsBlurb: 'Інструкційні навички, які agent підвантажує під час задачі — копірайтинг, теорія кольору, креативне керівництво, брейншторм. Чистий текст SKILL.md; результат залежить від твого input.',
    tileSystemsBlurb: 'Прив’язані до бренду дизайн-системи — палітра, типографіка, motion, тон. Прив’яжи проєкт до системи, і будь-який вивід плагіна успадковує ту саму ідентичність.',
    tileCraftBlurb: 'Бренд-агностичні craft-правила — доступність, RTL, motion-easing, етика фотографії. Навички opt-in через `od.craft.requires`, і плагін автоматично успадковує потрібну строгість.',
    templatesLabel: 'Плагіни · Шаблони',
    templatesHeading: (n) => `${n} виконуваних шаблонів.`,
    templatesLead: 'Кожен шаблон має робочий попередній перегляд — мініатюра в каталозі береться прямо з manifest poster, який agent використовує всередині продукту. Перегляньте всі або стрибніть до однієї з семи категорій артефактів.',
    skillsLabel: 'Плагіни · Навички',
    skillsHeading: (n) => `${n} інструкційних навичок.`,
    skillsLead: 'Навички, які agent підвантажує під час задачі — копірайтинг, теорія кольору, креативне керівництво, брейншторм. Статичної demo немає, бо результат залежить від input; кожна сторінка деталей читається як brief: заголовок, опис, тригери, авторство.',
    systemsLabel: 'Плагіни · Системи',
    systemsHeading: (n) => `${n} дизайн-систем.`,
    systemsLead: 'Прив’язані до бренду дизайн-системи, які плагіни можуть прийняти через `od.craft.requires`. Кожна з власною палітрою, типографікою, motion і тоном; прив’яжи проєкт до системи — будь-який вивід плагіна успадковує ту саму ідентичність.',
    craftLabel: 'Плагіни · Craft',
    craftHeading: (n) => `${n} принципів craft.`,
    craftLead: 'Бренд-агностичні craft-правила — доступність, RTL, motion-easing, етика фотографії. Навички opt-in через `od.craft.requires`, плагін автоматично успадковує потрібну строгість.',
    detailHomepage: 'Головна ↗',
    detailMode: 'Режим',
    detailScenario: 'Сцена',
    detailPlatform: 'Платформа',
    detailSurface: 'Поверхня',
    detailAuthor: 'Автор',
    detailManifestId: 'ID маніфесту',
    detailTags: 'Теги',
    detailPreviewCaption: 'Прев’ю з bundled-plugin маніфесту.',
    detailBucketLabel: { examples: 'Приклад', 'image-templates': 'Шаблон зображення', 'video-templates': 'Шаблон відео', scenarios: 'Сцена', 'design-systems': 'Дизайн-система', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Відкрити в новій вкладці',
    breadcrumbLabel: 'Навігаційна стежка',
    shareDialogClose: 'Закрити',
    previewImageAlt: (title) => `Прев’ю ${title}`,
    previewSummaryAria: (title) => `Відкрити інтерактивне прев’ю ${title}`,
    previewIframeTitle: (title) => `Інтерактивне прев’ю ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Артефакти, створені агентом, які ви можете форкнути та запустити — прототипи, слайди, шаблони зображень і відео. Запускайте їх на своїх ключах з локальним агентом; промпти, постери та приклади HTML — все під Apache-2.0.',
    templatesCounterLabel: 'Всього',
    cardFeaturedTag: 'Рекомендовано',
    cardReadFullPrompt: 'Читати повний промпт →',
    cardUseTemplate: 'Використати цей шаблон',
    cardShareAria: (title) => `Поділитися ${title}`,
    faqHead: 'Часті питання',
    faqItems: [
      {
        question: 'Що таке шаблони Open Design?',
        answer:
          'Bundled-plugin шаблони, які поставляються з Open Design — відкритим вихідним кодом Claude Design альтернативою. Кожен з них — це запускаємий артефакт: прототип, колода слайдів, генератор зображень, відеокомпозиція або HyperFrames motion-кусок. Ваш локальний агент запускає плагін проти його промпту та опціонального прикладу HTML і створює готовий до поширення актив на вашій машині.',
      },
      {
        question: 'Як ліцензуються шаблони?',
        answer:
          'Apache-2.0 скрізь. Форкніть промпт, адаптуйте <code>example.html</code>, змініть токени бренду — єдине прохання — зберігати повідомлення LICENSE під час перерозповсюдження.',
      },
      {
        question: 'Чи можу я запускати їх зі своїми ключами API?',
        answer:
          'Так. Open Design використовує BYOK на кожному рівні — ваші облікові дані Claude / OpenAI / локальної моделі ніколи не залишають вашу машину. Маркетинговий сайт не проксує жодних висновків; живі попередження, які ви бачите в рядах каталогу, походять від постерів і URL-адрес Cloudflare Stream, які поставляються з шаблонами, а не від розміщеного середовища виконання.',
      },
      {
        question: 'Як я можу внести шаблон?',
        answer:
          'Відкрийте PR проти <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> з новою папкою, що містить <code>open-design.json</code>, <code>SKILL.md</code> та запускаємий <code>example.html</code>. Посібник для внесків у <code>CONTRIBUTING.md</code> репозиторію описує поля маніфесту. Затверджені внески потрапляють у публічний каталог і автоматично з\'являються тут при наступному розгортанні.',
      },
      {
        question: 'Чим це відрізняється від Claude Design Studio?',
        answer:
          'Claude Design Studio — це розміщений продукт Anthropic. Open Design — це <strong>відкритий вихідний код Claude Design альтернатива</strong> — кожен шаблон, промпт і система дизайну в цьому каталозі живуть у публічному репозиторії, запускаються локально проти обраних вами ключів і можуть розширюватися через плагіни, які може написати будь-хто. Ми дзеркалимо ту ж таксономію артефактів (прототипи, слайди, зображення, відео), щоб ментальна модель перенеслася, але все — від агента виконання до агента — залишається на вашій машині.',
      },
      {
        question: 'Звідки беруться попередження?',
        answer:
          'Маніфест кожного шаблону містить URL постера (Cloudflare CDN) і для відеошаблонів — Cloudflare Stream MP4. Сітка відображає постер як статичну мініатюру та переходить на циклічне відео при наведенні. Шаблони зображень і прототипів показують свій постер безпосередньо; натискання відкриває запускаємий <code>example.html</code> на сторінці деталей.',
      },
    ],
    category: {
      prototype: {
        label: 'Прототип',
        description:
          'Інтерактивні макети продуктів — панелі керування, програми, цільові сторінки, внутрішні інструменти. Все, що ви б передали зацікавленій стороні і клікали б по всьому.',
      },
      'live-artifact': {
        label: 'Live Artifact',
        description:
          'Оновлювані, визначені даними артефакти, які перерендеруються кожного разу, коли змінюються базові дані. Живі панелі керування, дошки моніторингу, повторювані трекери.',
      },
      deck: {
        label: 'Слайди',
        description:
          'Відполіровані колоди слайдів з наративної брифу — pitch deck, модулі курсів, тижневі звіти, запуски продуктів.',
      },
      image: {
        label: 'Зображення',
        description:
          'Графічні активи, створені зі структурованого креативного напрямку — макети UI, бренд-візуали, раскадри, пости в соцмережах, ілюстрації.',
      },
      video: {
        label: 'Відео',
        description:
          'Промпти для відео, раскадри та готові до рендеру motion-артефакти — короткотривалий контент для соцмереж, маркетингові кути, motion-графіка, кінематографічні історії.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames-готові motion-композиції — відео, створене агентом, що поєднує промпти шаблонів, режисуру сцен та бренд-сигнали в рендерований таймлайн.',
      },
      audio: {
        label: 'Аудіо',
        description:
          'Аудіо-промпти та стеми для короткотривалої звукової ідентичності — звуки UI, перехідні бампери, скрипти озвучення.',
      },
    },
    subcategory: {
      'business-dashboards': 'Панелі & аналітика',
      'app-prototypes': 'Додатки',
      'landing-marketing': 'Лендинги & маркетинг',
      'developer-tools': 'Інструменти розробника',
      'docs-reports': 'Документи & звіти',
      'brand-design': 'Бренд & дизайн',
      'pitch-business': 'Pitch & бізнес',
      'course-training': 'Курси & навчання',
      'reports-briefings': 'Звіти & брифінги',
      'product-sales': 'Продукт & продажі',
      'engineering-talks': 'Engineering презентації',
      'creative-decks': 'Креативні колоди',
      'ui-product-mockups': 'UI & макети продукту',
      'brand-visuals': 'Бренд & логотип',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Соцмережі & контент',
      'avatar-portrait': 'Аватари & портрети',
      'illustration-style': 'Ілюстрації & стиль',
      'motion-effects': 'Анімація & ефекти',
      'social-short-form': 'Короткі відео',
      'marketing-product': 'Маркетинг & продукт',
      'data-explainers': 'Дані & пояснення',
      'cinematic-story': 'Синематографічна історія',
    },
  },
  vi: {
    hubLabel: 'Thư viện plugin', hubHeading: (n) => `${n} thành phần có thể ghép nối.`,
    tileTemplates: 'Mẫu', tileSkills: 'Kỹ năng', tileSystems: 'Hệ thống', tileCraft: 'Thủ công',
    browseTemplates: 'Xem các mẫu', browseSkills: 'Xem kỹ năng', browseSystems: 'Xem hệ thống', browseCraft: 'Xem thủ công',
    artifactKindLabel: 'Loại sản phẩm', sceneLabel: 'Cảnh', allChip: 'Tất cả',
    detailUseCta: 'Dùng plugin này →', detailFindOnGithub: 'Xem trên GitHub →',
    detailClickForLivePreview: 'Nhấn để xem preview trực tiếp ↗', detailOpenInNewTab: 'Mở trong tab mới ↗',
    shareOpen: 'Chia sẻ ↗', shareTitle: 'Chia sẻ plugin này',
    shareLead: 'Sao chép nội dung dưới đây, rồi mở nền tảng bạn muốn chia sẻ và dán vào.',
    shareCopyText: 'Sao chép', shareCopyLink: 'Chỉ sao chép link', shareJumpTo: 'Mở:',
    shareTemplate: ({ title, url }) => `🎨 Vừa khám phá ${title} trên @opendesignai — giải pháp mã nguồn mở thay thế Claude Design.\n✨ Ưu tiên local · BYOK · agent của bạn thiết kế.\n\n→ ${url}`,
    hubLead: 'Open Design xoay quanh bốn loại plugin: Templates và Skills là thứ agent của bạn chạy; Systems và Craft giữ thương hiệu và tính tiếp cận. Chọn một mục để đào sâu, hoặc nhảy thẳng tới một slug nếu bạn đã biết cần gì.',
    tileTemplatesBlurb: 'Templates trực quan và chạy được — nguyên mẫu, slide, bộ sinh ảnh và video, bố cục motion. Mỗi mục có example.html: fork, đổi dữ liệu, ship ngay.',
    tileSkillsBlurb: 'Các skill chỉ dẫn mà agent nạp giữa tác vụ — copy, lý thuyết màu, chỉ đạo sáng tạo, brainstorm. Văn xuôi SKILL.md thuần; kết quả tuỳ input của bạn.',
    tileSystemsBlurb: 'Design system bám thương hiệu — bảng màu, kiểu chữ, motion, giọng nói. Gán một dự án vào một system và mọi đầu ra plugin sẽ kế thừa cùng một danh tính.',
    tileCraftBlurb: 'Các quy tắc craft không phụ thuộc thương hiệu — tiếp cận, RTL, easing motion, đạo đức nhiếp ảnh. Skills opt-in qua `od.craft.requires`, plugin tự kế thừa độ chặt phù hợp.',
    templatesLabel: 'Plugin · Templates',
    templatesHeading: (n) => `${n} templates chạy được.`,
    templatesLead: 'Mỗi template đều có preview chạy được — thumbnail trong catalog lấy trực tiếp từ manifest poster mà agent dùng trong sản phẩm. Lướt hết, hoặc nhảy tới một trong bảy loại artifact.',
    skillsLabel: 'Plugin · Skills',
    skillsHeading: (n) => `${n} skill chỉ dẫn.`,
    skillsLead: 'Skills agent nạp giữa tác vụ — copy, lý thuyết màu, chỉ đạo sáng tạo, brainstorm. Không có demo tĩnh vì kết quả phụ thuộc input; mỗi trang chi tiết đọc như một brief: tiêu đề, mô tả, trigger, ghi nguồn.',
    systemsLabel: 'Plugin · Systems',
    systemsHeading: (n) => `${n} design system.`,
    systemsLead: 'Design system bám thương hiệu mà plugin có thể chấp nhận qua `od.craft.requires`. Mỗi system có bảng màu, kiểu chữ, motion và voice riêng; gán dự án vào system, mọi đầu ra plugin kế thừa cùng danh tính.',
    craftLabel: 'Plugin · Craft',
    craftHeading: (n) => `${n} nguyên tắc craft.`,
    craftLead: 'Quy tắc craft không phụ thuộc thương hiệu — tiếp cận, RTL, easing motion, đạo đức nhiếp ảnh. Skills opt-in qua `od.craft.requires`, plugin tự kế thừa độ chặt phù hợp.',
    detailHomepage: 'Trang chủ ↗',
    detailMode: 'Chế độ',
    detailScenario: 'Cảnh',
    detailPlatform: 'Nền tảng',
    detailSurface: 'Bề mặt',
    detailAuthor: 'Tác giả',
    detailManifestId: 'ID manifest',
    detailTags: 'Thẻ',
    detailPreviewCaption: 'Preview từ manifest bundled-plugin.',
    detailBucketLabel: { examples: 'Ví dụ', 'image-templates': 'Template ảnh', 'video-templates': 'Template video', scenarios: 'Cảnh', 'design-systems': 'Design system', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Mở trong tab mới',
    breadcrumbLabel: 'Đường dẫn',
    shareDialogClose: 'Đóng',
    previewImageAlt: (title) => `Xem trước ${title}`,
    previewSummaryAria: (title) => `Mở xem trước tương tác của ${title}`,
    previewIframeTitle: (title) => `Xem trước tương tác của ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Các artifact được tạo bởi agent mà bạn có thể fork và deploy — prototype, slide, mẫu ảnh và video. Chạy chúng trên các key của riêng bạn với agent cục bộ; các prompt, poster và ví dụ HTML đều có giấy phép Apache-2.0.',
    templatesCounterLabel: 'Tổng cộng',
    cardFeaturedTag: 'Nổi bật',
    cardReadFullPrompt: 'Xem toàn bộ prompt →',
    cardUseTemplate: 'Sử dụng mẫu này',
    cardShareAria: (title) => `Chia sẻ ${title}`,
    faqHead: 'Câu hỏi thường gặp',
    faqItems: [
      {
        question: 'Mẫu Open Design là gì?',
        answer:
          'Các mẫu plugin đi kèm với Open Design — phiên bản alternative open source của Claude Design. Mỗi mẫu là một artifact có thể chạy được: một prototype, bộ slide, trình tạo ảnh, video composition, hoặc một motion piece HyperFrames. Agent cục bộ của bạn chạy plugin với prompt và một HTML ví dụ tùy chọn, và tạo ra một asset sẵn sàng chia sẻ trên máy của bạn.',
      },
      {
        question: 'Các mẫu được cấp phép như thế nào?',
        answer:
          'Apache-2.0 ở khắp mọi nơi. Fork prompt, chỉnh sửa <code>example.html</code>, thay đổi các brand token — yêu cầu duy nhất là giữ lại thông báo LICENSE khi bạn phân phối lại.',
      },
      {
        question: 'Tôi có thể chạy chúng với API key của riêng mình không?',
        answer:
          'Có. Open Design là BYOK ở mọi tầng — thông tin Claude / OpenAI / local-model của bạn không bao giờ rời khỏi máy của bạn. Trang marketing không proxy bất kỳ inference nào; các bản xem trước trực tiếp bạn thấy trên các hàng danh mục đến từ các poster và URL Cloudflare Stream mà các mẫu đi kèm, không phải từ một runtime được lưu trữ.',
      },
      {
        question: 'Làm cách nào để đóng góp một mẫu?',
        answer:
          'Mở một PR với <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> với một thư mục mới chứa <code>open-design.json</code>, <code>SKILL.md</code>, và một <code>example.html</code> có thể chạy được. Hướng dẫn đóng góp trong <code>CONTRIBUTING.md</code> của repo sẽ hướng dẫn bạn qua các trường manifest. Các đóng góp được phê duyệt sẽ xuất hiện trong danh mục công khai và được hiển thị ở đây tự động khi deploy tiếp theo.',
      },
      {
        question: 'Cái này khác biệt như thế nào so với Claude Design Studio?',
        answer:
          'Claude Design Studio là sản phẩm được lưu trữ của Anthropic. Open Design là <strong>phiên bản alternative open source của Claude Design</strong> — mỗi mẫu, prompt và design system trong danh mục này đều tồn tại trong một repo công khai, chạy cục bộ với các key bạn chọn, và có thể được mở rộng thông qua các plugin mà bất kỳ ai cũng có thể viết. Chúng tôi phản chiếu cùng một taxonomy artifact (prototype, slide, ảnh, video) để mô hình tinh thần vẫn tương tự, nhưng mọi thứ từ runtime agent vẫn ở trên máy của bạn.',
      },
      {
        question: 'Các bản xem trước đến từ đâu?',
        answer:
          'Manifest của mỗi mẫu chứa một URL poster (Cloudflare CDN) và, đối với các mẫu video, một MP4 Cloudflare Stream. Lưới hiển thị poster dưới dạng hình thu nhỏ tĩnh và chuyển sang video quay vòng khi di chuột qua. Các mẫu ảnh và prototype hiển thị poster của chúng trực tiếp; nhấp để mở <code>example.html</code> có thể chạy được trên trang chi tiết.',
      },
    ],
    category: {
      prototype: {
        label: 'Prototype',
        description:
          'Các mockup sản phẩm tương tác — dashboard, ứng dụng, landing page, nội bộ công cụ. Bất cứ thứ gì bạn sẽ trao cho một stakeholder và nhấp qua.',
      },
      'live-artifact': {
        label: 'Live Artifact',
        description:
          'Các artifact có thể làm mới, nhận thức dữ liệu sẽ re-render bất cứ khi nào dữ liệu cơ bản thay đổi. Dashboard trực tiếp, bảng giám sát, tracker tái diễn.',
      },
      deck: {
        label: 'Slides',
        description:
          'Các slide deck được đánh bóng từ một brief tường thuật — pitch deck, các module khóa học, báo cáo hàng tuần, peluncuran sản phẩm.',
      },
      image: {
        label: 'Image',
        description:
          'Các asset ảnh được tạo từ hướng sáng tạo có cấu trúc — mockup UI, visual thương hiệu, storyboard, bài viết mạng xã hội, minh họa.',
      },
      video: {
        label: 'Video',
        description:
          'Các prompt video, storyboard và motion artifact sẵn sàng render — short-form xã hội, marketing cut, motion graphics, những câu chuyện điện ảnh.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'Các motion composition sẵn sàng cho HyperFrames — video được tạo bởi agent kết hợp các template prompt, scene direction, và brand cue thành một timeline có thể render được.',
      },
      audio: {
        label: 'Audio',
        description:
          'Các prompt âm thanh và stem cho sonic identity short-form — UI sound, transitional bumper, voice script.',
      },
    },
    subcategory: {
      'business-dashboards': 'Bảng điều khiển',
      'app-prototypes': 'Ứng dụng',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Công cụ nhà phát triển',
      'docs-reports': 'Tài liệu & báo cáo',
      'brand-design': 'Thương hiệu & thiết kế',
      'pitch-business': 'Pitch & kinh doanh',
      'course-training': 'Khóa học & đào tạo',
      'reports-briefings': 'Báo cáo & tóm tắt',
      'product-sales': 'Sản phẩm & bán hàng',
      'engineering-talks': 'Kỹ thuật & thảo luận',
      'creative-decks': 'Bộ slide sáng tạo',
      'ui-product-mockups': 'UI & mockup sản phẩm',
      'brand-visuals': 'Thương hiệu & logo',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Mạng xã hội & nội dung',
      'avatar-portrait': 'Avatar & chân dung',
      'illustration-style': 'Minh họa & phong cách',
      'motion-effects': 'Chuyển động & hiệu ứng',
      'social-short-form': 'Video ngắn mạng xã hội',
      'marketing-product': 'Marketing & sản phẩm',
      'data-explainers': 'Dữ liệu & giải thích',
      'cinematic-story': 'Câu chuyện điện ảnh',
    },
  },
  nl: {
    hubLabel: 'Plugin-bibliotheek', hubHeading: (n) => `${n} combineerbare onderdelen.`,
    tileTemplates: 'Templates', tileSkills: 'Skills', tileSystems: 'Systemen', tileCraft: 'Vakmanschap',
    browseTemplates: 'Bekijk templates', browseSkills: 'Bekijk skills', browseSystems: 'Bekijk systemen', browseCraft: 'Bekijk vakmanschap',
    artifactKindLabel: 'Type artefact', sceneLabel: 'Scène', allChip: 'Alle',
    detailUseCta: 'Gebruik deze plugin →', detailFindOnGithub: 'Bekijk op GitHub →',
    detailClickForLivePreview: 'Klik voor live preview ↗', detailOpenInNewTab: 'Open in nieuw tabblad ↗',
    shareOpen: 'Delen ↗', shareTitle: 'Deel deze plugin',
    shareLead: 'Kopieer het bericht hieronder en plak het op het platform van jouw keuze.',
    shareCopyText: 'Tekst kopiëren', shareCopyLink: 'Alleen de link', shareJumpTo: 'Ga naar:',
    shareTemplate: ({ title, url }) => `🎨 Net ontdekt: ${title} op @opendesignai — het open-source alternatief voor Claude Design.\n✨ Local-first · BYOK · jouw agent ontwerpt.\n\n→ ${url}`,
    hubLead: 'Open Design is gebouwd rond vier soorten plug-ins: Templates en Skills zijn wat je agent draait; Systems en Craft houden merk en toegankelijkheid op orde. Kies een sectie om dieper in te duiken, of spring direct naar een slug als je al weet wat je wilt.',
    tileTemplatesBlurb: 'Visuele, draaiende templates — prototypes, slides, beeld- en videogeneratoren, motion-composities. Elke entry levert een example.html: fork, wissel data, ship.',
    tileSkillsBlurb: 'Instructie-skills die de agent halverwege een taak laadt — copy, kleurtheorie, creatieve regie, brainstorm. Pure SKILL.md-tekst; het resultaat hangt af van je input.',
    tileSystemsBlurb: 'Merk-verankerde designsystemen — palet, typografie, motion, voice. Koppel een project aan een systeem en elke plug-in-output erft dezelfde identiteit.',
    tileCraftBlurb: 'Merkagnostische craft-regels — toegankelijkheid, RTL, motion-easing, fotografie-ethiek. Skills opten in via `od.craft.requires`, zodat een plug-in automatisch de juiste striktheid erft.',
    templatesLabel: 'Plug-ins · Templates',
    templatesHeading: (n) => `${n} draaiende templates.`,
    templatesLead: 'Elke template levert een werkende preview — de thumbnail in de catalogus komt direct van de manifest-poster die de agent in het product gebruikt. Bekijk ze allemaal of spring naar een van de zeven artefactsoorten.',
    skillsLabel: 'Plug-ins · Skills',
    skillsHeading: (n) => `${n} instructie-skills.`,
    skillsLead: 'Skills die de agent tijdens een taak laadt — copy, kleurtheorie, creatieve regie, brainstorm. Geen statische demo omdat de uitkomst van je input afhangt; elke detailpagina leest als een brief: titel, beschrijving, triggers, attributie.',
    systemsLabel: 'Plug-ins · Systemen',
    systemsHeading: (n) => `${n} designsystemen.`,
    systemsLead: 'Merk-verankerde designsystemen die plug-ins kunnen overnemen via `od.craft.requires`. Elk levert eigen palet, typografie, motion en voice; koppel een project aan een systeem en elke plug-in-output erft dezelfde identiteit.',
    craftLabel: 'Plug-ins · Vakmanschap',
    craftHeading: (n) => `${n} craft-principes.`,
    craftLead: 'Merkagnostische craft-regels — toegankelijkheid, RTL, motion-easing, fotografie-ethiek. Skills opten in via `od.craft.requires`, zodat een plug-in automatisch de juiste striktheid erft.',
    detailHomepage: 'Homepage ↗',
    detailMode: 'Modus',
    detailScenario: 'Scène',
    detailPlatform: 'Platform',
    detailSurface: 'Oppervlak',
    detailAuthor: 'Auteur',
    detailManifestId: 'Manifest-ID',
    detailTags: 'Tags',
    detailPreviewCaption: 'Preview uit het bundled-plugin-manifest.',
    detailBucketLabel: { examples: 'Voorbeeld', 'image-templates': 'Beeld-template', 'video-templates': 'Video-template', scenarios: 'Scène', 'design-systems': 'Designsysteem', atoms: 'Atom' },
    detailOpenInNewTabAria: 'Openen in nieuw tabblad',
    breadcrumbLabel: 'Kruimelpad',
    shareDialogClose: 'Sluiten',
    previewImageAlt: (title) => `Voorvertoning van ${title}`,
    previewSummaryAria: (title) => `Interactieve voorvertoning van ${title} openen`,
    previewIframeTitle: (title) => `Interactieve voorvertoning van ${title}`,
    // PR #3185 follow-up: localize templates-page chrome + FAQ
    templatesHeroEyebrow: 'Open Source Claude Design',
    templatesHeroLead:
      'Agent-gebouwde artifacts die je kunt forken en deployen — prototypes, slides, image- en videosjablonen. Voer ze uit op je eigen keys met de lokale agent; de prompts, posters en voorbeeld-HTML staan allemaal onder Apache-2.0.',
    templatesCounterLabel: 'Totaal',
    cardFeaturedTag: 'Uitgelicht',
    cardReadFullPrompt: 'Lees volledige prompt →',
    cardUseTemplate: 'Dit sjabloon gebruiken',
    cardShareAria: (title) => `${title} delen`,
    faqHead: 'Veelgestelde vragen',
    faqItems: [
      {
        question: 'Wat zijn Open Design-sjablonen?',
        answer:
          'Gebundelde plugin-sjablonen die bij Open Design horen — het open source Claude Design-alternatief. Elk sjabloon is een runnable artifact: een prototype, presentatiedeck, imagegenerator, videocompositie of HyperFrames motion piece. Je lokale agent voert de plugin uit tegen zijn prompt en optionele voorbeeld-HTML, en produceert een klaar-om-te-delen asset op je eigen machine.',
      },
      {
        question: 'Onder welke licentie vallen de sjablonen?',
        answer:
          'Apache-2.0 overal. Fork de prompt, pas de <code>example.html</code> aan, verander de brand tokens — het enige wat we vragen is dat je de LICENSE-mededeling behoudt wanneer je het herverdeelt.',
      },
      {
        question: 'Kan ik ze uitvoeren met mijn eigen API-keys?',
        answer:
          "Ja. Open Design is BYOK op elk niveau — je Claude / OpenAI / lokale-model-referenties verlaten je machine nooit. De marketingsite proxy geen inference; de live voorbeelden die je in de catalogusrijen ziet, komen van posters en Cloudflare Stream URL's die de sjablonen meebrengen, niet van een gehoste runtime.",
      },
      {
        question: 'Hoe draag ik een sjabloon bij?',
        answer:
          'Open een PR tegen <a href="https://github.com/nexu-io/open-design/tree/main/plugins/_official" target="_blank" rel="noopener">nexu-io/open-design/plugins/_official</a> met een nieuwe map met daarin <code>open-design.json</code>, <code>SKILL.md</code> en een runnable <code>example.html</code>. De bijdragersrichtlijn in de <code>CONTRIBUTING.md</code> van de repo doorloopt de manifestvelden. Goedgekeurde bijdragen verschijnen in de publieke catalogus en komen hier automatisch naar voren bij de volgende deploy.',
      },
      {
        question: 'Wat is het verschil met Claude Design Studio?',
        answer:
          "Claude Design Studio is Anthropic's gehoste product. Open Design is het <strong>open source Claude Design-alternatief</strong> — elk sjabloon, prompt en designsysteem in deze catalogus leeft in een openbare repo, draait lokaal tegen de keys die je kiest, en kan worden uitgebreid via plugins die iedereen kan schrijven. We spiegelen dezelfde artifact-taxonomie (prototypes, slides, images, video) zodat het mentale model overeenkomt, maar alles tot en met de agent runtime blijft op je machine.",
      },
      {
        question: 'Waar komen de voorbeelden vandaan?',
        answer:
          'Het manifest van elk sjabloon bevat een poster-URL (Cloudflare CDN) en voor videosjablonen een Cloudflare Stream MP4. Het raster rendert de poster als statische thumbnail en wisselt de loopvideo in bij hover. Image- en prototype-sjablonen tonen hun poster direct; als je doorklikt, opent de runnable <code>example.html</code> op de detailpagina.',
      },
    ],
    category: {
      prototype: {
        label: 'Prototype',
        description:
          "Interactieve productmockups — dashboards, apps, landingspagina's, interne tools. Alles wat je een stakeholder zou geven om door te klikken.",
      },
      'live-artifact': {
        label: 'Live Artifact',
        description:
          'Vernieuwbare, data-bewuste artifacts die opnieuw renderen wanneer de onderliggende data verandert. Live dashboards, monitoringborden, terugkerende trackers.',
      },
      deck: {
        label: 'Slides',
        description:
          'Geslepen presentatiedecks van een narrative brief — pitch decks, cursusmodules, wekelijkse rapporten, productlanceringen.',
      },
      image: {
        label: 'Image',
        description:
          'Image-assets gegenereerd op basis van gestructtureerde creatieve richtlijnen — UI-mockups, merkvizuals, storyboards, sociale posts, illustraties.',
      },
      video: {
        label: 'Video',
        description:
          'Videoprompts, storyboards en render-ready motion artifacts — kort-vorm social, marketing cuts, motion graphics, cinematische verhalen.',
      },
      hyperframes: {
        label: 'HyperFrames',
        description:
          'HyperFrames-ready motion compositions — agent-gebouwde video die sjabloonprompts, scene direction en brand cues samenvoegt tot een renderable timeline.',
      },
      audio: {
        label: 'Audio',
        description:
          'Audioprompts en stems voor korte-vorm sonic identity — UI-geluiden, overgangsbumpers, voiceover-scripts.',
      },
    },
    subcategory: {
      'business-dashboards': 'Dashboards',
      'app-prototypes': 'Apps',
      'landing-marketing': 'Landing & marketing',
      'developer-tools': 'Developer tools',
      'docs-reports': 'Docs & rapporten',
      'brand-design': 'Brand & design',
      'pitch-business': 'Pitch & business',
      'course-training': 'Cursus & training',
      'reports-briefings': 'Rapporten & briefings',
      'product-sales': 'Product & sales',
      'engineering-talks': 'Engineering talks',
      'creative-decks': 'Creative decks',
      'ui-product-mockups': 'UI & product mockups',
      'brand-visuals': 'Brand & logo',
      'storyboards-motion-refs': 'Storyboards',
      'social-content': 'Social & content',
      'avatar-portrait': 'Avatar & portret',
      'illustration-style': 'Illustratie & stijl',
      'motion-effects': 'Motion & effects',
      'social-short-form': 'Social short form',
      'marketing-product': 'Marketing & product',
      'data-explainers': 'Data & uitleg',
      'cinematic-story': 'Cinematic story',
    },
  },
};

/**
 * Resolve a complete `PluginsCopy` object for a given locale, merging
 * locale overrides on top of the English baseline. Missing keys fall
 * back to English so a partially-translated locale still renders
 * sensibly.
 */
export function getPluginsCopy(locale: LandingLocaleCode): PluginsCopy {
  if (locale === DEFAULT_LOCALE) return en;
  const partial = overrides[locale];
  if (!partial) return en;
  return {
    ...en,
    ...partial,
    category: { ...en.category, ...(partial.category ?? {}) },
    subcategory: { ...en.subcategory, ...(partial.subcategory ?? {}) },
    detailBucketLabel: { ...en.detailBucketLabel, ...(partial.detailBucketLabel ?? {}) },
  };
}
