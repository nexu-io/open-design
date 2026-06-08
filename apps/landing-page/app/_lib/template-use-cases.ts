import {
  getBundledPluginById,
  type BundledPluginRecord,
} from './bundled-plugins';
import type { LandingLocaleCode } from '../i18n';

export interface TemplateUseCaseCopy {
  title: string;
  eyebrow: string;
  description: string;
  intro: string;
  ctaLabel: string;
}

export interface TemplateUseCase {
  slug: string;
  copy: TemplateUseCaseCopy;
  zh?: Partial<TemplateUseCaseCopy>;
  keywords: readonly string[];
  pluginIds: readonly string[];
  faq: readonly {
    question: string;
    answer: string;
  }[];
}

const faq = (useCase: string, examples: string) => [
  {
    question: `What is included in these ${useCase} templates?`,
    answer:
      `Each result links to a real Open Design template with preview media, source attribution, a GitHub source link, and a prompt or renderer you can fork for your own artifact.`,
  },
  {
    question: `Can I customize these ${useCase} examples?`,
    answer:
      `Yes. Open Design templates are source-backed artifacts, so you can reuse the structure, swap the content, and adapt the visual system inside your local agent workflow.`,
  },
  {
    question: `Which templates are a good starting point?`,
    answer: examples,
  },
] as const;

export const TEMPLATE_USE_CASES = [
  {
    slug: 'saas-landing-pages',
    copy: {
      title: 'SaaS landing page templates',
      eyebrow: 'Website templates',
      description:
        'Fork Open Design templates for SaaS homepages, waitlists, AI automation products, and cinematic product sites.',
      intro:
        'Use these templates when the search intent is “make me a SaaS landing page” rather than “browse every Open Design plugin.” Each card opens the original source-backed template.',
      ctaLabel: 'Browse SaaS landing templates',
    },
    zh: {
      title: 'SaaS 落地页模板',
      eyebrow: '网站模板',
      description: '用于 SaaS 官网、waitlist、AI 自动化产品和产品宣传页的 Open Design 模板。',
      intro: '这个入口匹配“我要做 SaaS 落地页”的搜索意图，卡片会回到原始模板详情页。',
    },
    keywords: ['saas landing page template', 'startup website template', 'ai product landing page'],
    pluginIds: [
      'example-saas-landing',
      'example-waitlist-page',
      'example-ai-automation',
      'example-flowmate',
      'example-web-prototype',
      'example-web-prototype-taste-soft',
      'example-web-prototype-taste-editorial',
      'video-template-hyperframes-website-to-video-promo',
    ],
    faq: faq('SaaS landing page', 'Start with the SaaS landing, waitlist page, or AI automation examples when you need a fast product website.'),
  },
  {
    slug: 'startup-pitch-decks',
    copy: {
      title: 'Startup pitch deck templates',
      eyebrow: 'Deck templates',
      description:
        'Pitch deck templates for accelerator demos, startup narratives, and early product fundraising stories.',
      intro:
        'These templates collect the slide systems that look like founder pitch decks instead of generic presentation themes.',
      ctaLabel: 'Browse pitch deck templates',
    },
    zh: {
      title: '创业 Pitch Deck 模板',
      eyebrow: '幻灯片模板',
      description: '用于路演、Demo Day、早期融资和产品叙事的 pitch deck 模板。',
      intro: '这里聚合的是像创业融资材料的模板，而不是泛泛的 PPT 主题。',
    },
    keywords: ['startup pitch deck template', 'demo day pitch deck', 'founder pitch deck'],
    pluginIds: [
      'example-html-ppt-pitch-deck',
      'example-html-ppt-zhangzara-raw-grid',
      'example-html-ppt-zhangzara-signal',
      'example-html-ppt-zhangzara-broadside',
      'example-html-ppt-zhangzara-bold-poster',
      'example-html-ppt-product-launch',
    ],
    faq: faq('startup pitch deck', 'Use the pitch deck, raw grid, signal, or broadside examples when the story needs to feel investor-ready.'),
  },
  {
    slug: 'investor-decks',
    copy: {
      title: 'Investor deck templates',
      eyebrow: 'Fundraising templates',
      description:
        'Investor-ready templates for market theses, business cases, valuation narratives, and funding updates.',
      intro:
        'This page groups templates that can become funding memos, investor updates, or thesis decks with real source links.',
      ctaLabel: 'Browse investor templates',
    },
    zh: {
      title: '投资人 Deck 模板',
      eyebrow: '融资材料模板',
      description: '用于投资论证、商业案例、估值叙事和融资更新的模板。',
    },
    keywords: ['investor deck template', 'fundraising deck', 'investment thesis template'],
    pluginIds: [
      'example-html-ppt-zhangzara-signal',
      'example-html-ppt-zhangzara-cartesian',
      'example-dcf-valuation',
      'example-ib-pitch-book',
      'example-finance-report',
      'example-data-report',
    ],
    faq: faq('investor deck', 'Start with Signal, Cartesian, DCF valuation, or finance report templates for investor-facing materials.'),
  },
  {
    slug: 'product-launch-decks',
    copy: {
      title: 'Product launch deck templates',
      eyebrow: 'Launch templates',
      description:
        'Presentation and video templates for launches, product reveals, feature announcements, and release narratives.',
      intro:
        'Use this page for launch-specific searches: product launch deck, product reveal video, and announcement presentation.',
      ctaLabel: 'Browse launch templates',
    },
    zh: {
      title: '产品发布 Deck 模板',
      eyebrow: '发布模板',
      description: '用于产品发布、功能公告、产品 reveal 和发布叙事的演示与视频模板。',
    },
    keywords: ['product launch deck template', 'product reveal video template', 'feature announcement deck'],
    pluginIds: [
      'example-html-ppt-product-launch',
      'example-html-ppt-zhangzara-playful',
      'example-html-ppt-zhangzara-coral',
      'video-template-hyperframes-product-reveal-minimal',
      'video-template-hyperframes-saas-product-promo-30s',
      'video-template-hyperframes-brand-sizzle-reel',
    ],
    faq: faq('product launch deck', 'Use the product launch deck with HyperFrames product reveal or SaaS promo videos for a launch package.'),
  },
  {
    slug: 'business-dashboards',
    copy: {
      title: 'Business dashboard templates',
      eyebrow: 'Dashboard templates',
      description:
        'Dashboard templates for metrics reviews, social analytics, GitHub activity, finance, and operational reporting.',
      intro:
        'These entries map to real dashboard and report templates that can become internal review surfaces or public live artifacts.',
      ctaLabel: 'Browse dashboard templates',
    },
    zh: {
      title: '业务看板模板',
      eyebrow: 'Dashboard 模板',
      description: '用于指标复盘、社媒分析、GitHub 活动、财务和运营报告的看板模板。',
    },
    keywords: ['business dashboard template', 'analytics dashboard template', 'finance dashboard template'],
    pluginIds: [
      'example-dashboard',
      'example-dashboard-ui-glass',
      'example-flowai-live-dashboard-template',
      'example-social-media-dashboard',
      'example-github-dashboard',
      'example-data-report',
      'example-finance-report',
      'image-template-notion-team-dashboard-live-artifact',
    ],
    faq: faq('business dashboard', 'Start with dashboard, glass dashboard, FlowAI live dashboard, or finance report templates.'),
  },
  {
    slug: 'weekly-report-decks',
    copy: {
      title: 'Weekly report deck templates',
      eyebrow: 'Reporting templates',
      description:
        'Weekly report, KPI review, and team update templates for polished recurring business communication.',
      intro:
        'This page targets report searches with templates that already read like weekly reviews and team updates.',
      ctaLabel: 'Browse weekly report templates',
    },
    zh: {
      title: '周报 Deck 模板',
      eyebrow: '汇报模板',
      description: '用于周报、KPI 复盘和团队进展同步的模板。',
    },
    keywords: ['weekly report template', 'team update deck', 'business review template'],
    pluginIds: [
      'example-html-ppt-weekly-report',
      'example-data-report',
      'example-finance-report',
      'example-html-ppt-knowledge-arch-blueprint',
      'example-social-media-dashboard',
    ],
    faq: faq('weekly report deck', 'Use weekly report, data report, finance report, or knowledge architecture templates for recurring updates.'),
  },
  {
    slug: 'social-media-posts',
    copy: {
      title: 'Social media post templates',
      eyebrow: 'Social templates',
      description:
        'Templates for X posts, Xiaohongshu cards, fashion posts, travel collages, announcement posters, and social carousels.',
      intro:
        'This page turns the existing image and social card templates into long-tail entrances for social content searches.',
      ctaLabel: 'Browse social post templates',
    },
    zh: {
      title: '社交媒体帖子模板',
      eyebrow: '社媒模板',
      description: '用于 X、小红书、时尚内容、旅行拼贴、公告海报和轮播图的模板。',
    },
    keywords: ['social media post template', 'xiaohongshu card template', 'x post card template'],
    pluginIds: [
      'example-card-xiaohongshu',
      'example-card-twitter',
      'example-social-x-post-card',
      'example-social-carousel',
      'example-html-ppt-xhs-post',
      'example-html-ppt-xhs-pastel-card',
      'image-template-social-media-post-editorial-fashion-photography',
      'image-template-social-media-post-travel-snapshot-collage-prompt',
    ],
    faq: faq('social media post', 'Use Xiaohongshu cards, X post cards, social carousel, or image post templates for social campaigns.'),
  },
  {
    slug: 'instagram-carousel-templates',
    copy: {
      title: 'Instagram carousel templates',
      eyebrow: 'Carousel templates',
      description:
        'Carousel-style templates for editorial social posts, fashion stories, travel collections, and campaign slides.',
      intro:
        'These templates fit searches for carousel posts even when the original asset is a deck, social card, or image prompt.',
      ctaLabel: 'Browse carousel templates',
    },
    zh: {
      title: 'Instagram 轮播模板',
      eyebrow: '轮播模板',
      description: '用于编辑感社媒、时尚故事、旅行合集和活动推广的轮播模板。',
    },
    keywords: ['instagram carousel template', 'social carousel template', 'fashion carousel template'],
    pluginIds: [
      'example-social-carousel',
      'example-html-ppt-xhs-white-editorial',
      'example-html-ppt-xhs-pastel-card',
      'example-html-ppt-zhangzara-editorial-tri-tone',
      'image-template-social-media-post-fashion-editorial-collage',
      'image-template-social-media-post-editorial-fashion-photography',
      'image-template-social-media-post-travel-snapshot-collage-prompt',
    ],
    faq: faq('Instagram carousel', 'Start with the social carousel, XHS editorial cards, and fashion editorial image templates.'),
  },
  {
    slug: 'creator-portfolios',
    copy: {
      title: 'Creator portfolio templates',
      eyebrow: 'Portfolio templates',
      description:
        'Portfolio templates for designers, AI creators, indie makers, studios, and personal brand pages.',
      intro:
        'This page packages portfolio-shaped templates for people searching by role and outcome.',
      ctaLabel: 'Browse portfolio templates',
    },
    zh: {
      title: '创作者作品集模板',
      eyebrow: '作品集模板',
      description: '用于设计师、AI 创作者、独立开发者、工作室和个人品牌的作品集模板。',
    },
    keywords: ['creator portfolio template', 'designer portfolio template', 'personal brand deck'],
    pluginIds: [
      'example-ai-designer-portfolio',
      'example-portfolio-cosmic',
      'example-html-ppt-zhangzara-capsule',
      'example-html-ppt-zhangzara-pink-script',
      'example-html-ppt-zhangzara-playful',
      'example-html-ppt-zhangzara-studio',
      'example-html-ppt-zhangzara-creative-mode',
    ],
    faq: faq('creator portfolio', 'Use the AI designer portfolio, cosmic portfolio, capsule, pink script, or studio examples.'),
  },
  {
    slug: 'resume-templates',
    copy: {
      title: 'Resume templates',
      eyebrow: 'Career templates',
      description:
        'Modern resume and CV templates that can be exported, customized, and kept source-backed.',
      intro:
        'This page gives resume searchers a direct path into the existing Open Design resume and portfolio assets.',
      ctaLabel: 'Browse resume templates',
    },
    zh: {
      title: '简历模板',
      eyebrow: '求职模板',
      description: '可自定义、可导出、带源码归因的现代简历和 CV 模板。',
    },
    keywords: ['resume template', 'cv template', 'modern resume template'],
    pluginIds: [
      'example-resume-modern',
      'example-ai-designer-portfolio',
      'example-portfolio-cosmic',
      'example-html-ppt-zhangzara-capsule',
    ],
    faq: faq('resume', 'Start with Modern Resume, then adapt the AI designer portfolio or creator portfolio templates for richer career pages.'),
  },
  {
    slug: 'wedding-lifestyle-media-kits',
    copy: {
      title: 'Wedding and lifestyle media kit templates',
      eyebrow: 'Lifestyle templates',
      description:
        'Editorial templates for wedding media, lifestyle features, intimate event decks, and soft visual stories.',
      intro:
        'These templates are selected because their visual language maps naturally to wedding, lifestyle, and soft editorial searches.',
      ctaLabel: 'Browse lifestyle templates',
    },
    zh: {
      title: '婚礼与生活方式媒体模板',
      eyebrow: '生活方式模板',
      description: '用于婚礼媒体、生活方式专题、亲密活动 deck 和柔和视觉叙事的模板。',
      intro: '这里把现有模板按“婚礼/生活方式”意图归组，用户搜婚礼相关词时能落到真正匹配的专题页。',
    },
    keywords: ['wedding media kit template', 'lifestyle editorial template', 'wedding invitation deck'],
    pluginIds: [
      'example-html-ppt-zhangzara-soft-editorial',
      'example-html-ppt-zhangzara-pink-script',
      'example-html-ppt-zhangzara-long-table',
      'example-html-ppt-zhangzara-grove',
      'example-html-ppt-zhangzara-capsule',
      'image-template-social-media-post-fashion-editorial-collage',
    ],
    faq: faq('wedding and lifestyle media kit', 'Use Soft Editorial, Pink Script, Long Table, Grove, or Capsule for lifestyle and wedding-adjacent narratives.'),
  },
  {
    slug: 'gallery-museum-presentations',
    copy: {
      title: 'Gallery and museum presentation templates',
      eyebrow: 'Cultural templates',
      description:
        'Presentation templates for galleries, museums, biennales, cultural institutions, and exhibition programs.',
      intro:
        'This page captures cultural-institution search intent by mapping it to the strongest existing presentation styles.',
      ctaLabel: 'Browse museum templates',
    },
    zh: {
      title: '画廊与博物馆演示文稿模板',
      eyebrow: '文化机构模板',
      description: '用于画廊、博物馆、双年展、文化机构和展览项目的演示文稿模板。',
    },
    keywords: ['museum presentation template', 'gallery deck template', 'exhibition presentation template'],
    pluginIds: [
      'example-html-ppt-zhangzara-soft-editorial',
      'example-html-ppt-zhangzara-stencil-tablet',
      'example-html-ppt-zhangzara-biennale-yellow',
      'example-html-ppt-zhangzara-vellum',
      'example-html-ppt-zhangzara-cobalt-grid',
    ],
    faq: faq('gallery and museum presentation', 'Use Soft Editorial, Stencil Tablet, Biennale Yellow, Vellum, or Cobalt Grid for cultural decks.'),
  },
  {
    slug: 'brand-story-decks',
    copy: {
      title: 'Brand story deck templates',
      eyebrow: 'Brand templates',
      description:
        'Long-form brand story templates for editorial features, brand launches, founder narratives, and identity decks.',
      intro:
        'These templates are designed for searchers who want a story-driven brand artifact, not a blank presentation file.',
      ctaLabel: 'Browse brand story templates',
    },
    zh: {
      title: '品牌故事 Deck 模板',
      eyebrow: '品牌模板',
      description: '用于长篇品牌故事、专题报道、品牌发布、创始人叙事和品牌识别 deck 的模板。',
    },
    keywords: ['brand story deck template', 'brand narrative template', 'longform brand story'],
    pluginIds: [
      'example-html-ppt-zhangzara-soft-editorial',
      'example-html-ppt-zhangzara-broadside',
      'example-html-ppt-zhangzara-bold-poster',
      'example-html-ppt-zhangzara-cobalt-grid',
      'example-html-ppt-zhangzara-editorial-tri-tone',
      'video-template-hyperframes-brand-sizzle-reel',
    ],
    faq: faq('brand story deck', 'Start with Soft Editorial, Broadside, Bold Poster, Cobalt Grid, or a HyperFrames brand sizzle reel.'),
  },
  {
    slug: 'consulting-deliverables',
    copy: {
      title: 'Consulting deliverable templates',
      eyebrow: 'Consulting templates',
      description:
        'Templates for consulting reports, advisory decks, client documents, strategy narratives, and polished deliverables.',
      intro:
        'This page converts broad “consulting template” searches into a set of source-backed Open Design examples.',
      ctaLabel: 'Browse consulting templates',
    },
    zh: {
      title: '咨询交付物模板',
      eyebrow: '咨询模板',
      description: '用于咨询报告、顾问 deck、客户文件、战略叙事和正式交付物的模板。',
    },
    keywords: ['consulting deliverable template', 'strategy deck template', 'client report template'],
    pluginIds: [
      'example-html-ppt-zhangzara-soft-editorial',
      'example-html-ppt-zhangzara-blue-professional',
      'example-html-ppt-zhangzara-signal',
      'example-data-report',
      'example-finance-report',
      'example-digital-eguide',
      'example-article-magazine',
    ],
    faq: faq('consulting deliverable', 'Use Blue Professional, Signal, Soft Editorial, data report, or finance report templates for client work.'),
  },
  {
    slug: 'founder-essay-decks',
    copy: {
      title: 'Founder essay deck templates',
      eyebrow: 'Founder templates',
      description:
        'Templates for founder essays, vision decks, point-of-view memos, and public company narratives.',
      intro:
        'This page gives founder-writing searches a practical landing page with reusable editorial deck templates.',
      ctaLabel: 'Browse founder essay templates',
    },
    zh: {
      title: '创始人文章与愿景 Deck 模板',
      eyebrow: '创始人模板',
      description: '用于创始人文章、愿景 deck、观点 memo 和公司公开叙事的模板。',
    },
    keywords: ['founder essay template', 'founder vision deck', 'company narrative template'],
    pluginIds: [
      'example-html-ppt-zhangzara-soft-editorial',
      'example-html-ppt-zhangzara-broadside',
      'example-html-ppt-zhangzara-peoples-platform',
      'example-blog-post',
      'example-article-magazine',
      'example-html-ppt-obsidian-claude-gradient',
    ],
    faq: faq('founder essay deck', 'Use Soft Editorial, Broadside, Peoples Platform, blog post, or article magazine templates.'),
  },
  {
    slug: 'editorial-feature-presentations',
    copy: {
      title: 'Editorial feature presentation templates',
      eyebrow: 'Editorial templates',
      description:
        'Editorial feature templates for magazine-style decks, fashion narratives, interviews, and visual stories.',
      intro:
        'This page turns magazine and editorial-looking templates into direct long-tail SEO entrances.',
      ctaLabel: 'Browse editorial templates',
    },
    zh: {
      title: '专题报道演示文稿模板',
      eyebrow: '编辑部模板',
      description: '用于杂志式 deck、时尚叙事、访谈和视觉故事的专题报道模板。',
    },
    keywords: ['editorial feature template', 'magazine deck template', 'fashion presentation template'],
    pluginIds: [
      'example-html-ppt-zhangzara-soft-editorial',
      'example-html-ppt-zhangzara-editorial-tri-tone',
      'example-html-ppt-taste-editorial',
      'example-article-magazine',
      'example-html-ppt-xhs-white-editorial',
      'image-template-social-media-post-editorial-fashion-photography',
    ],
    faq: faq('editorial feature presentation', 'Use Soft Editorial, Editorial Tri Tone, Taste Editorial, or Article Magazine templates.'),
  },
  {
    slug: 'white-paper-report-templates',
    copy: {
      title: 'White paper and report templates',
      eyebrow: 'Document templates',
      description:
        'White paper, research report, thesis, finance report, and long-form analysis templates.',
      intro:
        'These templates suit users searching for formal research, reporting, and long-form document artifacts.',
      ctaLabel: 'Browse report templates',
    },
    zh: {
      title: '白皮书与报告模板',
      eyebrow: '文档模板',
      description: '用于白皮书、研究报告、投资论证、财务报告和长篇分析的模板。',
    },
    keywords: ['white paper template', 'research report template', 'longform report template'],
    pluginIds: [
      'example-html-ppt-zhangzara-vellum',
      'example-html-ppt-zhangzara-cartesian',
      'example-html-ppt-zhangzara-cobalt-grid',
      'example-data-report',
      'example-finance-report',
      'example-digital-eguide',
    ],
    faq: faq('white paper and report', 'Use Vellum, Cartesian, Cobalt Grid, data report, or finance report templates.'),
  },
  {
    slug: 'course-training-decks',
    copy: {
      title: 'Course and training deck templates',
      eyebrow: 'Education templates',
      description:
        'Templates for course modules, training decks, technical sharing, classroom material, and knowledge architecture.',
      intro:
        'This page groups education-shaped templates for people searching with learning and training language.',
      ctaLabel: 'Browse training templates',
    },
    zh: {
      title: '课程与培训 Deck 模板',
      eyebrow: '教育模板',
      description: '用于课程模块、培训 deck、技术分享、课堂材料和知识架构的模板。',
    },
    keywords: ['course deck template', 'training presentation template', 'technical sharing deck'],
    pluginIds: [
      'example-html-ppt-course-module',
      'example-html-ppt-tech-sharing',
      'example-html-ppt-knowledge-arch-blueprint',
      'example-html-ppt-zhangzara-daisy-days',
      'example-docs-page',
    ],
    faq: faq('course and training deck', 'Use course module, tech sharing, knowledge architecture, or docs page templates.'),
  },
  {
    slug: 'developer-docs-pages',
    copy: {
      title: 'Developer docs page templates',
      eyebrow: 'Developer templates',
      description:
        'Templates for docs pages, engineering runbooks, technical explainers, and product documentation.',
      intro:
        'This page gives engineering and documentation searches a direct Open Design template set.',
      ctaLabel: 'Browse developer docs templates',
    },
    zh: {
      title: '开发者文档页面模板',
      eyebrow: '开发者模板',
      description: '用于文档页、工程 runbook、技术解释和产品文档的模板。',
    },
    keywords: ['developer docs template', 'engineering runbook template', 'technical documentation template'],
    pluginIds: [
      'example-docs-page',
      'example-eng-runbook',
      'example-html-ppt-tech-sharing',
      'example-html-ppt-knowledge-arch-blueprint',
      'example-github-dashboard',
    ],
    faq: faq('developer docs page', 'Use docs page, engineering runbook, tech sharing, or GitHub dashboard templates.'),
  },
  {
    slug: 'short-form-video-templates',
    copy: {
      title: 'Short-form video templates',
      eyebrow: 'Video templates',
      description:
        'Short-form video templates for TikTok, product promos, talking heads, social overlays, and brand reels.',
      intro:
        'These HyperFrames templates match searches for video ads, TikTok layouts, product promos, and social motion graphics.',
      ctaLabel: 'Browse video templates',
    },
    zh: {
      title: '短视频模板',
      eyebrow: '视频模板',
      description: '用于 TikTok、产品宣传、口播、社交 overlay 和品牌短片的视频模板。',
    },
    keywords: ['short form video template', 'tiktok video template', 'product promo video template'],
    pluginIds: [
      'video-template-hyperframes-tiktok-karaoke-talking-head',
      'video-template-hyperframes-social-overlay-stack',
      'video-template-hyperframes-saas-product-promo-30s',
      'video-template-hyperframes-product-reveal-minimal',
      'video-template-hyperframes-brand-sizzle-reel',
      'video-template-hyperframes-logo-outro-cinematic',
    ],
    faq: faq('short-form video', 'Use TikTok karaoke talking head, social overlay stack, product reveal, or brand sizzle templates.'),
  },
  {
    slug: 'financial-report-templates',
    copy: {
      title: 'Financial report templates',
      eyebrow: 'Finance templates',
      description:
        'Templates for finance reports, DCF valuation, banking pitch books, revenue reviews, and investor analysis.',
      intro:
        'This page collects finance-specific templates so searchers do not have to infer them from the full template catalog.',
      ctaLabel: 'Browse finance templates',
    },
    zh: {
      title: '财务报告模板',
      eyebrow: '金融模板',
      description: '用于财报、DCF 估值、投行 pitch book、收入复盘和投资分析的模板。',
    },
    keywords: ['financial report template', 'dcf valuation template', 'investment banking pitch book template'],
    pluginIds: [
      'example-finance-report',
      'example-dcf-valuation',
      'example-ib-pitch-book',
      'example-data-report',
      'example-html-ppt-zhangzara-cartesian',
      'video-template-hyperframes-money-counter-hype',
    ],
    faq: faq('financial report', 'Use finance report, DCF valuation, IB pitch book, Cartesian, or money counter video templates.'),
  },
] as const satisfies readonly TemplateUseCase[];

export function getTemplateUseCases(): readonly TemplateUseCase[] {
  return TEMPLATE_USE_CASES;
}

export function getTemplateUseCaseBySlug(slug: string): TemplateUseCase | null {
  return TEMPLATE_USE_CASES.find((useCase) => useCase.slug === slug) ?? null;
}

export function getTemplateUseCaseCopy(
  useCase: TemplateUseCase,
  locale: LandingLocaleCode,
): TemplateUseCaseCopy {
  if ((locale === 'zh' || locale === 'zh-tw') && useCase.zh) {
    const merged = { ...useCase.copy, ...useCase.zh };
    if (!useCase.zh.ctaLabel) {
      return {
        ...merged,
        ctaLabel: `${locale === 'zh-tw' ? '瀏覽' : '浏览'}${merged.title}`,
      };
    }
    return merged;
  }
  return useCase.copy;
}

export function getPluginsForTemplateUseCase(
  useCase: TemplateUseCase,
): BundledPluginRecord[] {
  return useCase.pluginIds
    .map((id) => getBundledPluginById(id))
    .filter((plugin): plugin is BundledPluginRecord => Boolean(plugin));
}

export function getTemplateUseCasesForPlugin(
  plugin: BundledPluginRecord,
): readonly TemplateUseCase[] {
  return TEMPLATE_USE_CASES.filter((useCase) =>
    (useCase.pluginIds as readonly string[]).includes(plugin.manifestId),
  );
}
