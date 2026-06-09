import type { BundledPluginRecord } from './bundled-plugins';
import type { LandingLocaleCode } from '../i18n';

export interface PluginDetailFaqItem {
  question: string;
  answer: string;
}

function isZhLocale(locale: LandingLocaleCode): boolean {
  return locale === 'zh' || locale === 'zh-tw';
}

function artifactName(plugin: BundledPluginRecord, isZh: boolean): string {
  const mode = plugin.mode?.toLowerCase();
  const surface = plugin.surface?.toLowerCase();
  const previewType = plugin.previewType?.toLowerCase();
  const haystack = `${plugin.title} ${plugin.description} ${plugin.tags.join(' ')}`.toLowerCase();

  if (mode === 'video' || previewType === 'video') return isZh ? '视频模板' : 'video template';
  if (mode === 'image' || previewType === 'image') return isZh ? '图片模板' : 'image template';
  if (haystack.includes('deck') || haystack.includes('ppt') || haystack.includes('slides')) {
    return isZh ? '演示文稿模板' : 'deck template';
  }
  if (surface === 'web' || haystack.includes('landing') || haystack.includes('website')) {
    return isZh ? '网页模板' : 'web template';
  }
  if (haystack.includes('dashboard')) return isZh ? '看板模板' : 'dashboard template';
  if (haystack.includes('report')) return isZh ? '报告模板' : 'report template';
  return isZh ? 'Open Design 模板' : 'Open Design template';
}

const INTERNAL_TAGS = new Set([
  'example',
  'first-party',
  'zhangzara',
  'html-deck',
  'html-slides',
]);

const ZH_TAG_LABELS: Record<string, string> = {
  deck: '演示文稿',
  marketing: '营销内容',
  web: '网页',
  'soft-editorial': '柔和编辑风格',
  literary: '文学感',
  elegant: '优雅视觉',
  considered: '克制叙事',
  'editorial-feature': '专题报道',
  'longform-brand-story': '长篇品牌故事',
  dashboard: '看板',
  report: '报告',
  finance: '财务分析',
  prototype: '产品原型',
  image: '图片生成',
  video: '视频生成',
};

const EN_TAG_LABELS: Record<string, string> = {
  deck: 'deck',
  marketing: 'marketing content',
  web: 'web page',
  'soft-editorial': 'soft editorial style',
  literary: 'literary pacing',
  elegant: 'elegant visuals',
  considered: 'considered narrative',
  'editorial-feature': 'editorial feature',
  'longform-brand-story': 'long-form brand story',
  dashboard: 'dashboard',
  report: 'report',
  finance: 'finance analysis',
  prototype: 'product prototype',
  image: 'image generation',
  video: 'video generation',
};

const ZH_SCENARIO_LABELS: Record<string, string> = {
  marketing: '营销材料、品牌内容或对外展示',
  web: '网页、落地页或线上展示',
  deck: '演示文稿、提案或汇报材料',
  prototype: '产品原型或交互演示',
  image: '图片生成或视觉素材',
  video: '视频生成或动态素材',
};

const EN_SCENARIO_LABELS: Record<string, string> = {
  marketing: 'marketing, brand, or public-facing content',
  web: 'web pages, landing pages, or online presentations',
  deck: 'decks, proposals, or review materials',
  prototype: 'product prototypes or interactive demos',
  image: 'image generation or visual assets',
  video: 'video generation or motion assets',
};

function publicTags(plugin: BundledPluginRecord, isZh: boolean): string[] {
  const labels = isZh ? ZH_TAG_LABELS : EN_TAG_LABELS;
  return plugin.tags
    .filter((tag) => !INTERNAL_TAGS.has(tag) && !tag.startsWith('zhangzara-'))
    .map((tag) => labels[tag] ?? tag.replace(/-/g, ' '))
    .filter(Boolean)
    .slice(0, 5);
}

function joinList(items: readonly string[], isZh: boolean): string {
  return items.filter(Boolean).join(isZh ? '、' : ', ');
}

function scenarioLabel(plugin: BundledPluginRecord, artifact: string, isZh: boolean): string {
  const labels = isZh ? ZH_SCENARIO_LABELS : EN_SCENARIO_LABELS;
  const raw = plugin.scenario || plugin.platform || plugin.surface;
  if (!raw) return artifact;
  return labels[raw] ?? raw.replace(/-/g, isZh ? '、' : ' ');
}

function buildSpecificScenarioFaq(
  plugin: BundledPluginRecord,
  title: string,
  description: string,
  isZh: boolean,
): PluginDetailFaqItem[] {
  const text = `${description} ${plugin.tags.join(' ')}`.toLowerCase();

  if (isZh) {
    const scenarios: PluginDetailFaqItem[] = [];
    if (/婚礼|生活方式/.test(description)) {
      scenarios.push({
        question: `可以用 ${title} 做婚礼/生活方式媒体包吗？`,
        answer:
          `可以。这个模板的柔和编辑风格适合把新人故事、场地氛围、图片方向、流程安排、供应商信息和合作权益整理成一个可分享的 deck。它更像婚礼策划师、摄影师或生活方式品牌给团队/客户看的媒体包，而不是只做一张静态请柬。`,
      });
    }
    if (/画廊|博物馆/.test(description)) {
      scenarios.push({
        question: `${title} 适合画廊或博物馆演示文稿吗？`,
        answer:
          `适合。它的节奏偏长文和留白，适合展览介绍、策展陈述、艺术家故事、空间照片和参观信息。使用时可以保留大图和文字章节，把示例内容替换成展览主题、作品说明、时间地点和机构信息。`,
      });
    }
    if (/咨询交付物/.test(description)) {
      scenarios.push({
        question: `咨询服务文件或客户提案可以从这个模板开始吗？`,
        answer:
          `可以，尤其适合不想做成传统商务 PPT 的咨询交付物。你可以把章节改成背景、洞察、方案、路线图、报价和下一步行动，让客户看到一个更编辑化、更有叙事感的 proposal。`,
      });
    }
    if (/品牌长文|创始人/.test(description)) {
      scenarios.push({
        question: `能不能改成品牌长文或创始人文章？`,
        answer:
          `能。这个模板适合承载长段文字、引用、图片和章节推进。把开头改成观点或品牌命题，中间放产品/团队/用户故事，最后落到愿景、发布计划或 CTA，就能从演示文稿变成一篇可分享的品牌故事。`,
      });
    }
    if (/编辑专题|专题/.test(description)) {
      scenarios.push({
        question: `如果我要做专题报道，应该怎么用这个模板？`,
        answer:
          `先确定专题主线，再按封面、导语、人物/品牌背景、关键图片、引用、细节页和结尾行动来替换内容。这个模板的价值在于把“图片 + 长文 + 氛围”组织成连续阅读体验，适合媒体稿、访谈稿和活动报道。`,
      });
    }
    return scenarios.slice(0, 5);
  }

  const scenarios: PluginDetailFaqItem[] = [];
  if (text.includes('wedding') || text.includes('lifestyle')) {
    scenarios.push({
      question: `Can I use ${title} for a wedding or lifestyle media kit?`,
      answer:
        `Yes. Use it to package the story, venue mood, image direction, schedule, vendor notes, and partnership details into a shareable deck for planners, photographers, venues, or lifestyle brands.`,
    });
  }
  if (text.includes('gallery') || text.includes('museum') || text.includes('editorial-feature')) {
    scenarios.push({
      question: `Does ${title} work for gallery, museum, or editorial presentations?`,
      answer:
        `Yes. Its long-form pacing, large imagery, and quiet editorial structure fit exhibition introductions, curatorial notes, artist stories, and magazine-style visual features.`,
    });
  }
  if (text.includes('consulting')) {
    scenarios.push({
      question: `Can this template become a consulting deliverable or client proposal?`,
      answer:
        `Yes. Reframe the sections as context, insight, recommendation, roadmap, pricing, and next steps. It works well when the deliverable should feel more editorial than a conventional business deck.`,
    });
  }
  if (text.includes('brand') || text.includes('founder') || text.includes('longform')) {
    scenarios.push({
      question: `Can I turn ${title} into a brand story or founder essay?`,
      answer:
        `Yes. Keep the editorial rhythm, then replace the sample content with a point of view, product or team story, proof points, quotes, imagery, and a final call to action.`,
    });
  }
  return scenarios.slice(0, 5);
}

export function buildPluginDetailFaq(
  plugin: BundledPluginRecord,
  title: string,
  description: string,
  locale: LandingLocaleCode,
): PluginDetailFaqItem[] {
  const isZh = isZhLocale(locale);
  const artifact = artifactName(plugin, isZh);
  const tagText = joinList(publicTags(plugin, isZh), isZh);
  const scenario = scenarioLabel(plugin, artifact, isZh);
  const hasLiveHtml = plugin.previewType === 'html' && Boolean(plugin.previewEntryUrl);
  const hasPreview = Boolean(plugin.previewPoster || plugin.previewEntryUrl || plugin.previewVideo);
  const specificScenarioFaq = buildSpecificScenarioFaq(plugin, title, description, isZh);

  if (isZh) {
    if (specificScenarioFaq.length > 0) {
      return [
        ...specificScenarioFaq,
        {
          question: `我怎么把 ${title} 改成自己的项目？`,
          answer: `先选一个真实交付目标，不要只改标题。比如媒体包就替换故事、图片、流程和联系人；客户提案就替换背景、洞察、方案和下一步。保留模板的章节节奏，再换成你的品牌色、字体、素材和 CTA。`,
        },
        {
          question: hasLiveHtml
            ? `这个 HTML 模板怎么看完整效果？`
            : `这是一个真实可复用的模板，还是只是一张展示图？`,
          answer: hasLiveHtml
            ? `页面预览区域可以打开 HTML live preview，也可以从 GitHub 链接进入源码目录。这样你看到的不是静态截图，而是可以继续修改的原始实现。`
            : `这是 Open Design 仓库里的真实插件模板，页面保留了来源、manifest id 和 GitHub 源码链接。你可以从源码继续改，而不是只拿一张展示图。`,
        },
      ];
    }

    return [
      {
        question: `${title} 适合拿来做什么？`,
        answer: `${title} 是一个${artifact}。${description} 它适合从${scenario}方向起步；如果你的需求和${tagText || artifact}相关，可以先从这个模板改内容、图片、结构和品牌风格。`,
      },
      {
        question: `这是一个真实可复用的模板，还是只是一张展示图？`,
        answer: `这是 Open Design 仓库里的真实插件模板，页面保留了来源、manifest id 和 GitHub 源码链接。${hasPreview ? '如果模板带有预览，页面会展示 poster、视频或 HTML 入口。' : '如果当前模板没有单独预览图，也仍然可以通过 GitHub 源码查看原始实现。'}`,
      },
      {
        question: `我怎么把 ${title} 改成自己的项目？`,
        answer: `先保留模板的结构和节奏，再替换标题、正文、素材、数据和 CTA。完成第一版后，再根据你的品牌色、字体、语气和交付格式做二次调整；这样比从空白页面开始更快。`,
      },
      {
        question: `${title} 能用于客户提案或正式交付吗？`,
        answer: `可以作为起点使用。Open Design 的模板是 source-backed artifact，你可以 fork 源码、替换真实内容并继续开发。正式发布前，仍建议检查版权素材、品牌授权、数据准确性和最终导出格式。`,
      },
      {
        question: hasLiveHtml
          ? `这个 HTML 模板怎么看完整效果？`
          : `如果我想继续开发这个模板，应该看哪里？`,
        answer: hasLiveHtml
          ? `页面预览区域可以打开 HTML live preview，也可以从 GitHub 链接进入源码目录。这样你看到的不是静态截图，而是可以继续修改的原始实现。`
          : `优先点页面里的 GitHub 源码链接。那里能看到 manifest、提示词、示例文件和相关资源，适合继续改成自己的版本。`,
      },
    ];
  }

  if (specificScenarioFaq.length > 0) {
    return [
      ...specificScenarioFaq,
      {
        question: `How do I adapt ${title} for my own project?`,
        answer:
          `Start from a real deliverable, not just a title swap. For a media kit, replace the story, images, schedule, credits, and contact details. For a proposal, replace the context, insight, recommendation, roadmap, and next steps.`,
      },
      {
        question: hasLiveHtml
          ? `How can I view the full HTML version?`
          : `Is this a real reusable template or just a preview image?`,
        answer: hasLiveHtml
          ? `Open the HTML live preview from the preview area, or use the GitHub link to inspect the source folder. You are working from the original implementation rather than a static screenshot.`
          : `It is a real Open Design plugin template from the repository. The detail page keeps the source attribution, manifest id, and GitHub source link so you can keep developing from the source.`,
      },
    ];
  }

  return [
    {
      question: `What can I use ${title} for?`,
      answer: `${title} is a ${artifact}. ${description} Use it as a starting point for ${scenario}; if your project relates to ${tagText || artifact}, replace the copy, media, structure, and brand system with your own material.`,
    },
    {
      question: `Is this a real reusable template or just a preview image?`,
      answer: `It is a real Open Design plugin template from the repository. The detail page keeps the source attribution, manifest id, and GitHub source link. ${hasPreview ? 'When preview media exists, the page renders the poster, video, or HTML entry directly.' : 'When a template has no standalone preview image, the GitHub source still shows the original implementation.'}`,
    },
    {
      question: `How do I customize ${title} for my own project?`,
      answer: `Keep the template structure and pacing first, then replace the headlines, body copy, assets, data, and calls to action. After the first pass, tune the brand colors, typography, tone, and export format for your actual use case.`,
    },
    {
      question: `Can I use ${title} for client or production work?`,
      answer: `Yes, as a starting point. Open Design templates are source-backed artifacts, so you can fork the source, replace the sample content, and keep developing. Before publishing, review asset rights, brand permissions, data accuracy, and the final delivery format.`,
    },
    {
      question: hasLiveHtml
        ? `How can I view the full HTML version?`
        : `Where should I look if I want to keep developing this template?`,
      answer: hasLiveHtml
        ? `Open the HTML live preview from the preview area, or use the GitHub link to inspect the source folder. You are working from the original implementation rather than a static screenshot.`
        : `Start with the GitHub source link on this page. It includes the manifest, prompt, example files, and related assets needed to adapt the template.`,
    },
  ];
}
