import type { LandingLocaleCode, LandingUiCopy } from './i18n';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

type UiText = {
  blogTitle: string;
  blogDescription: string;
  blogCategories: string;
  all: string;
  product: string;
  guides: string;
  useCases: string;
  community: string;
  minRead: string;
  readMore: string;
  read: string;
  backToBlog: string;
  noEntries: string;
  noPosts: string;
  nextStep: string;
  joinDiscord: string;
  viewSource: string;
  downloadTitle: string;
  downloadBody: string;
  downloadLabel: string;
  skillsTitle: string;
  skillsBody: string;
  skillsLabel: string;
  repoTitle: string;
  repoBody: string;
  repoLabel: string;
  breadcrumb: string;
  catalog: string;
  skill: string;
  skills: string;
  system: string;
  systems: string;
  template: string;
  templates: string;
  craft: string;
  craftRule: string;
  plugin: string;
  plugins: string;
  capability: string;
  capabilities: string;
  portable: string;
  visualSystems: string;
  artifactTemplates: string;
  principles: string;
  mode: string;
  scenario: string;
  platform: string;
  featured: string;
  category: string;
  allSkills: string;
  allSystems: string;
  allTemplates: string;
  allCraft: string;
  detailSkill: string;
  detailSystem: string;
  detailTemplate: string;
  detailCraft: string;
  viewOnGithub: string;
  viewDesignOnGithub: string;
  upstream: string;
  preview: string;
  triggers: string;
  triggersLead: string;
  examplePrompt: string;
  relatedSkills: string;
  relatedCraft: string;
  paletteSample: string;
  paletteLead: (count: number) => string;
  visualTheme: string;
  relatedSystems: (category: string) => string;
  forkOnGithub: string;
  templatePreview: string;
  whatsInside: string;
  whatsInsideLead: string;
  renderer: string;
  seedData: string;
  readme: string;
  readFullRule: string;
  pluginRegistryTitle: string;
  pluginRegistryDescription: (count: number) => string;
  directoryRailRight: string;
  directoryRailLeft: string;
  topbarTitle: string;
  topbarSubtitle: string;
  topbarMeta: string;
  sourceJson: string;
  heroLabel: string;
  heroTitle: string;
  heroBody: string;
  browseRegistry: string;
  communityMarketplace: string;
  registryPreview: string;
  installableEntries: string;
  official: string;
  withPreview: string;
  surfaces: string;
  availableSources: string;
  registryEntries: string;
  searchPlugins: string;
  searchPlaceholder: string;
  filtersLabel: string;
  visiblePlugins: string;
  openDetails: (title: string) => string;
  details: string;
  pluginDetailTitle: (title: string) => string;
  pluginDetailDescription: (description: string, command: string) => string;
  pluginRail: (id: string) => string;
  allPlugins: string;
  registry: string;
  deprecated: string;
  yanked: string;
  installFromRegistry: string;
  copy: string;
  copied: string;
  select: string;
  previewAndFacts: string;
  marketplaceJson: string;
  sourceRepository: string;
  homepage: string;
  interactivePreview: string;
  imagePreview: string;
  videoPoster: string;
  liveHtmlPreview: string;
  trusted: string;
  restricted: string;
  pluginId: string;
  version: string;
  license: string;
  publisher: string;
  notSpecified: string;
  howItResolves: string;
  provenance: string;
  provenanceBody: string;
  workflowSurface: string;
  directSourceFallback: string;
  howPeopleUseIt: string;
  examplePromptBody: string;
  moreFrom: (registryName: string) => string;
  relatedPlugins: string;
};

const lower = (value: string): string => value.toLocaleLowerCase();

function buildUiCopy(t: UiText): DeepPartial<LandingUiCopy> {
  return {
    blog: {
      title: t.blogTitle,
      seoTitle: `${t.blogTitle} — Open Design`,
      description: t.blogDescription,
      categoriesLabel: t.blogCategories,
      categories: {
        all: t.all,
        product: t.product,
        guides: t.guides,
        useCases: t.useCases,
        community: t.community,
      },
      minRead: t.minRead,
      readMore: t.readMore,
      read: t.read,
      backToBlog: t.backToBlog,
      noEntries: t.noEntries,
      noPostsInCategory: t.noPosts,
      nextStep: t.nextStep,
      joinDiscord: t.joinDiscord,
      viewSource: t.viewSource,
      cta: {
        downloadTitle: t.downloadTitle,
        downloadBody: t.downloadBody,
        downloadLabel: t.downloadLabel,
        skillsTitle: t.skillsTitle,
        skillsBody: t.skillsBody,
        skillsLabel: t.skillsLabel,
        repoTitle: t.repoTitle,
        repoBody: t.repoBody,
        repoLabel: t.repoLabel,
      },
    },
    tutorials: {
      title: t.guides,
      seoTitle: `${t.guides} — Open Design`,
      description: `${t.guides}: Open Design / YouTube / ${t.skills} / ${t.systems} / ${t.community}.`,
      categoriesLabel: `${t.guides} · ${t.category}`,
      categories: {
        all: t.all,
        gettingStarted: t.guides,
        tutorial: t.guides,
        demo: t.preview,
        review: t.details,
        community: t.community,
      },
      official: t.official,
      watch: t.read,
      watchCta: `${t.read} →`,
      watchOnYouTube: `YouTube ↗`,
      openOnYouTube: `YouTube ↗`,
      backToTutorials: `← ${t.guides}`,
      viewSource: t.viewSource,
      noEntries: t.noEntries,
      suggestVideo: `${t.community} · GitHub`,
      noCategory: t.noPosts,
      thumbnailAlt: (title) => `${t.preview}: ${title}`,
      detailTitle: (title) => `${title} — Open Design ${t.guides}`,
      localizedTitle: (_title, author) => `Open Design ${t.guides}: ${author}`,
      localizedSummary: (_title, author, category) =>
        `${author} / ${category}: Open Design / ${t.skills} / ${t.systems} / ${t.templates}.`,
      localizedBodyHtml: (_title, author, summary) =>
        `<p>${summary}</p><h2>${t.blogTitle}</h2><p>${author}: Open Design / ${t.skills} / ${t.systems} / ${t.templates}. ${t.blogDescription}</p>`,
    },
    catalog: {
      breadcrumbLabel: t.breadcrumb,
      skills: {
        title: (count) => `${t.skills} — ${count} ${t.capabilities} | Open Design`,
        description: `${t.catalog}: ${t.skills} / SKILL.md / ${t.templates} / ${t.systems}.`,
        label: `${t.catalog} · Nº 01`,
        heading: (count) => `${t.skills} — ${count} ${t.capabilities}.`,
        lead: `${t.skill} / SKILL.md / daemon / DESIGN.md / ${t.systems}.`,
        mode: t.mode,
        scenario: t.scenario,
        platform: t.platform,
        featured: t.featured,
        allAria: t.allSkills,
        detailTitle: (name) => `${name} — Open Design ${t.skill}`,
        detailFallbackDescription: (name) => `Open Design ${t.skill}: ${name}.`,
        detailLabel: t.detailSkill,
        featuredNumber: (rank) => `· ${t.featured} Nº ${rank}`,
        viewOnGithub: t.viewOnGithub,
        upstream: t.upstream,
        previewCaption: (slug) => `${t.preview}: skills/${slug}/example.html`,
        triggers: t.triggers,
        triggersLead: t.triggersLead,
        examplePrompt: t.examplePrompt,
        related: t.relatedSkills,
        filterTitle: (heading, count) => `${heading} ${t.skills} — ${count} ${t.capabilities}`,
        modeDescription: (heading, count) =>
          `${count} ${t.skills}: ${lower(heading)} / daemon / DESIGN.md / ${t.systems}.`,
        scenarioDescription: (heading, count) =>
          `${count} ${t.skills}: ${lower(heading)} / decks / prototypes / ${t.templates} / live artifacts.`,
        modeHeading: (heading, count) => `${heading} — ${count} ${t.skills}.`,
        scenarioHeading: (heading, count) => `${heading} — ${count} ${t.skills}.`,
        modeLead: (label) => `${t.mode}: ${label}. ${t.skill} / DESIGN.md.`,
        scenarioLead: (label) => `${t.scenario}: ${label}. ${t.system} / artifact.`,
        allSkills: (count) => `← ${t.allSkills}${typeof count === 'number' ? ` (${count})` : ''}`,
      },
      systems: {
        title: (count) => `${t.systems} — ${count} ${t.visualSystems} | Open Design`,
        description: `${t.systems}: DESIGN.md / tokens / color / type / components.`,
        label: `${t.catalog} · Nº 02`,
        heading: (count) => `${t.systems} — ${count} ${t.visualSystems}.`,
        lead: `${t.system}: DESIGN.md token spec. ${t.skills} / shared visual language.`,
        category: t.category,
        allAria: t.allSystems,
        detailTitle: (name) => `${name} — Open Design ${t.system}`,
        detailFallbackDescription: (name, category) => `Open Design ${t.system}: ${name}, ${category}.`,
        detailLabel: t.detailSystem,
        viewOnGithub: t.viewDesignOnGithub,
        paletteSample: t.paletteSample,
        paletteLead: t.paletteLead,
        visualTheme: t.visualTheme,
        related: t.relatedSystems,
        categoryDescription: (heading, count) =>
          `${count} ${t.systems}: ${lower(heading)} / ${t.skill} / DESIGN.md.`,
        categoryHeading: (heading, count) => `${heading} — ${count} ${t.systems}.`,
        categoryLead: (label) => `${t.category}: ${label}. ${t.skill} / tokens.`,
        allSystems: `← ${t.allSystems}`,
      },
      templates: {
        title: (count) => `${t.templates} — ${count} ${t.artifactTemplates} | Open Design`,
        description: `${t.templates}: fork / artifact / seed data / reusable files.`,
        label: `${t.catalog} · Nº 04`,
        heading: (count) => `${t.templates} — ${count} ${t.artifactTemplates}.`,
        lead: `${t.template}: renderer / seed data / delivery files.`,
        allAria: t.allTemplates,
        liveArtifact: t.template,
        skillTemplate: `${t.skill} ${t.template}`,
        detailTitle: (name) => `${name} — Open Design ${t.template}`,
        detailLabel: t.detailTemplate,
        forkOnGithub: t.forkOnGithub,
        previewCaption: t.templatePreview,
        whatsInside: t.whatsInside,
        whatsInsideLead: t.whatsInsideLead,
        renderer: t.renderer,
        seedData: t.seedData,
        readme: t.readme,
      },
      craft: {
        title: (count) => `${t.craft} — ${count} ${t.principles} | Open Design`,
        description: `${t.craft}: accessibility / motion / color / RTL/Bidi / states / typography.`,
        label: `${t.catalog} · Nº 03`,
        heading: (count) => `${t.craft} — ${count} ${t.principles}.`,
        lead: `${t.skill} + ${t.craftRule}: agent prompt quality rules.`,
        allAria: t.allCraft,
        detailTitle: (name) => `${name} — Open Design ${t.craftRule}`,
        detailFallbackDescription: (name) => `Open Design ${t.craftRule}: ${name}.`,
        detailLabel: t.detailCraft,
        readFullRule: t.readFullRule,
        related: t.relatedCraft,
      },
    },
    plugins: {
      registryTitle: t.pluginRegistryTitle,
      registryDescription: t.pluginRegistryDescription,
      directoryRailRight: t.directoryRailRight,
      directoryRailLeft: `${t.sourceJson} · vendor/plugin-name`,
      topbarTitle: t.topbarTitle,
      topbarSubtitle: t.topbarSubtitle,
      topbarMeta: t.topbarMeta,
      sourceJson: t.sourceJson,
      heroLabel: t.heroLabel,
      heroTitle: t.heroTitle,
      heroBody: t.heroBody,
      browseRegistry: t.browseRegistry,
      communityMarketplace: t.communityMarketplace,
      preview: t.registryPreview,
      installableEntries: t.installableEntries,
      official: t.official,
      withPreview: t.withPreview,
      surfaces: t.surfaces,
      availableFromSources: t.availableSources,
      registryEntries: t.registryEntries,
      searchPlugins: t.searchPlugins,
      searchPlaceholder: t.searchPlaceholder,
      filtersLabel: t.filtersLabel,
      all: t.all,
      community: t.community,
      visiblePlugins: t.visiblePlugins,
      openDetails: t.openDetails,
      details: t.details,
      detailTitle: (title) => `${title} — Open Design ${t.plugin}`,
      detailDescription: t.pluginDetailDescription,
      detailRailRight: t.pluginRail,
      allPlugins: t.allPlugins,
      registry: t.registry,
      deprecated: t.deprecated,
      yanked: t.yanked,
      installFromRegistry: t.installFromRegistry,
      copy: t.copy,
      copied: t.copied,
      select: t.select,
      previewAndFacts: t.previewAndFacts,
      marketplaceJson: t.marketplaceJson,
      sourceRepository: t.sourceRepository,
      homepage: t.homepage,
      interactivePreview: t.interactivePreview,
      imagePreview: t.imagePreview,
      videoPoster: t.videoPoster,
      liveHtmlPreview: t.liveHtmlPreview,
      trustLabels: {
        official: t.official,
        trusted: t.trusted,
        restricted: t.restricted,
      },
      facts: {
        pluginId: t.pluginId,
        version: t.version,
        registry: t.registry,
        mode: t.mode,
        license: t.license,
        publisher: t.publisher,
        notSpecified: t.notSpecified,
      },
      howItResolves: t.howItResolves,
      provenance: t.provenance,
      provenanceBody: t.provenanceBody,
      capabilities: t.capabilities,
      workflowSurface: t.workflowSurface,
      directSourceFallback: t.directSourceFallback,
      examplePrompt: t.examplePrompt,
      howPeopleUseIt: t.howPeopleUseIt,
      examplePromptBody: t.examplePromptBody,
      moreFrom: t.moreFrom,
      related: t.relatedPlugins,
    },
  };
}

const SHARED = {
  zh: {
    blogTitle: '博客', blogDescription: '理解、探索和构建 Open Design 的本地化笔记。', blogCategories: '博客分类', all: '全部', product: '产品', guides: '指南', useCases: '使用场景', community: '社区', minRead: '分钟阅读', readMore: '继续阅读 →', read: '阅读 →', backToBlog: '← 返回博客', noEntries: '暂无文章。', noPosts: '这个分类还没有文章。', nextStep: '下一步', joinDiscord: '加入 Discord', viewSource: '在 GitHub 查看源码 ↗', downloadTitle: '下载桌面端', downloadBody: '试用开源设计工作台，查看 release notes，或加入社区。', downloadLabel: '下载桌面端 ↗', skillsTitle: '本地运行 Skill 工作流', skillsBody: '浏览工作流库，选择起点，并接入已有 agent。', skillsLabel: '浏览工作流 ↗', repoTitle: '查看 GitHub 实现', repoBody: '打开仓库查看源码、点 Star、fork 工作流或讨论下一步。', repoLabel: '打开仓库 ↗',
    breadcrumb: '面包屑', catalog: '目录', skill: 'Skill', skills: 'Skill', system: '设计系统', systems: '设计系统', template: '模板', templates: '模板', craft: '工艺', craftRule: '工艺规则', plugin: '插件', plugins: '插件', capability: '能力', capabilities: '可组合设计能力', portable: '可移植', visualSystems: '可移植视觉系统', artifactTemplates: '可 fork 的 artifact 模板', principles: '品牌无关渲染原则', mode: '模式', scenario: '场景', platform: '平台', featured: '精选', category: '分类', allSkills: '全部 Skill', allSystems: '全部设计系统', allTemplates: '全部模板', allCraft: '全部工艺规则', detailSkill: 'Skill', detailSystem: '设计系统', detailTemplate: '模板', detailCraft: '工艺规则', viewOnGithub: '在 GitHub 查看', viewDesignOnGithub: '在 GitHub 查看 DESIGN.md', upstream: '上游来源', preview: '预览', triggers: '触发词', triggersLead: '选择器会用这些提示匹配 Skill。复制后按 brief 调整。', examplePrompt: '示例提示词', relatedSkills: '相关 Skill', relatedCraft: '其他工艺规则', paletteSample: '色板示例', paletteLead: (count: number) => `从 DESIGN.md 颜色章节提取的前 ${count} 个色值。`, visualTheme: '视觉主题', relatedSystems: (category: string) => `${category} 中的相关系统`, forkOnGithub: '在 GitHub fork', templatePreview: '由模板种子数据渲染。', whatsInside: '模板包含什么', whatsInsideLead: '模板包含渲染器、种子数据、SKILL.md 和连接说明。', renderer: 'artifact 渲染器', seedData: '离线 / 预览渲染的种子值', readme: '连接方式、刷新节奏和自定义说明', readFullRule: '在 GitHub 阅读完整规则',
    pluginRegistryTitle: 'Open Design 插件 — 官方与社区注册表', pluginRegistryDescription: (count: number) => `浏览 ${count} 个 Open Design 插件。`, directoryRailRight: 'Open Design 注册表 · 官方 · 社区', directoryRailLeft: 'vendor/plugin-name · marketplace.json', topbarTitle: 'OD / 注册表', topbarSubtitle: '公开索引', topbarMeta: '官方 · 社区 · 自托管', sourceJson: '源 JSON', heroLabel: '插件注册表 · 公共生态', heroTitle: '浏览带实时预览的 agent 原生设计插件。', heroBody: '发现可安装的工作流、deck、图像模板、设计系统和原子能力。', browseRegistry: '浏览注册表', communityMarketplace: '社区 marketplace.json', registryPreview: '注册表预览', installableEntries: '可安装条目', official: '官方', withPreview: '带预览', surfaces: '表面类型', availableSources: '可用来源', registryEntries: '注册表条目', searchPlugins: '搜索插件', searchPlaceholder: '搜索插件、工作流、vendor...', filtersLabel: '注册表筛选', visiblePlugins: '个可见插件', openDetails: (title: string) => `打开 ${title} 详情`, details: '详情', pluginDetailTitle: (title: string) => `${title} — Open Design 插件`, pluginDetailDescription: (description: string, command: string) => `${description} 使用 ${command} 安装。`, pluginRail: (id: string) => `Open Design 插件 · ${id}`, allPlugins: '全部插件', registry: '注册表', deprecated: '已弃用', yanked: '已下架', installFromRegistry: '从注册表安装', copy: '复制', copied: '已复制', select: '选择', previewAndFacts: '插件预览与信息', marketplaceJson: 'Marketplace JSON 文件', sourceRepository: '源仓库', homepage: '主页', interactivePreview: '交互预览', imagePreview: '图片预览', videoPoster: '视频封面', liveHtmlPreview: 'Live HTML 预览', trusted: '可信', restricted: '受限', pluginId: '插件 ID', version: '版本', license: '许可证', publisher: '发布方', notSpecified: '未指定', howItResolves: '解析方式', provenance: '注册表来源', provenanceBody: '该条目来自 marketplace catalog，并解析到下方传输来源。', workflowSurface: '工作流表面', directSourceFallback: '直接来源 fallback', howPeopleUseIt: '使用方式', examplePromptBody: '注册表条目包含可直接运行的提示词种子。', moreFrom: (registryName: string) => `更多来自 ${registryName}`, relatedPlugins: '相关插件',
  },
} satisfies Record<'zh', UiText>;

const zhTw: UiText = {
  ...SHARED.zh,
  blogTitle: '部落格',
  blogDescription: '理解、探索與建構 Open Design 的本地化筆記。',
  blogCategories: '部落格分類',
  all: '全部',
  product: '產品',
  guides: '指南',
  useCases: '使用場景',
  community: '社群',
  minRead: '分鐘閱讀',
  readMore: '繼續閱讀 →',
  read: '閱讀 →',
  backToBlog: '← 返回部落格',
  noEntries: '暫無文章。',
  noPosts: '這個分類還沒有文章。',
  nextStep: '下一步',
  joinDiscord: '加入 Discord',
  viewSource: '在 GitHub 查看原始碼 ↗',
  downloadTitle: '下載桌面端',
  downloadBody: '試用開源設計工作台，查看 release notes，或加入社群。',
  downloadLabel: '下載桌面端 ↗',
  skillsTitle: '本地執行 Skill 工作流',
  skillsBody: '瀏覽工作流庫，選擇起點，並接入已有 agent。',
  skillsLabel: '瀏覽工作流 ↗',
  repoTitle: '查看 GitHub 實作',
  repoBody: '打開倉庫查看原始碼、點 Star、fork 工作流或討論下一步。',
  repoLabel: '打開倉庫 ↗',
  breadcrumb: '麵包屑',
  catalog: '目錄',
  skill: 'Skill',
  skills: 'Skill',
  system: '設計系統',
  systems: '設計系統',
  template: '模板',
  templates: '模板',
  craft: '工藝',
  craftRule: '工藝規則',
  capability: '能力',
  capabilities: '可組合設計能力',
  portable: '可移植',
  visualSystems: '可移植視覺系統',
  artifactTemplates: '可 fork 的 artifact 模板',
  principles: '品牌無關渲染原則',
  mode: '模式',
  scenario: '場景',
  platform: '平台',
  featured: '精選',
  category: '分類',
  allSkills: '全部 Skill',
  allSystems: '全部設計系統',
  allTemplates: '全部模板',
  detailSystem: '設計系統',
  detailTemplate: '模板',
  allCraft: '全部工藝規則',
  detailCraft: '工藝規則',
  viewOnGithub: '在 GitHub 查看',
  viewDesignOnGithub: '在 GitHub 查看 DESIGN.md',
  upstream: '上游來源',
  preview: '預覽',
  triggers: '觸發詞',
  triggersLead: '選擇器會用這些提示匹配 Skill。複製後按 brief 調整。',
  examplePrompt: '示例提示詞',
  relatedSkills: '相關 Skill',
  relatedCraft: '其他工藝規則',
  paletteSample: '色板示例',
  paletteLead: (count: number) => `從 DESIGN.md 色彩章節提取的前 ${count} 個色值。`,
  visualTheme: '視覺主題',
  relatedSystems: (category: string) => `${category} 中的相關系統`,
  forkOnGithub: '在 GitHub fork',
  templatePreview: '由模板種子資料渲染。',
  whatsInside: '模板包含什麼',
  whatsInsideLead: '模板包含渲染器、種子資料、SKILL.md 和連接說明。',
  renderer: 'artifact 渲染器',
  seedData: '離線 / 預覽渲染的種子值',
  readme: '連接方式、刷新節奏和自訂說明',
  readFullRule: '在 GitHub 閱讀完整規則',
  plugin: '外掛',
  plugins: '外掛',
  pluginRegistryTitle: 'Open Design 外掛 — 官方與社群註冊表',
  pluginRegistryDescription: (count: number) => `瀏覽 ${count} 個 Open Design 外掛。`,
  directoryRailRight: 'Open Design 註冊表 · 官方 · 社群',
  directoryRailLeft: 'vendor/plugin-name · marketplace.json',
  topbarTitle: 'OD / 註冊表',
  topbarSubtitle: '公開索引',
  topbarMeta: '官方 · 社群 · 自託管',
  heroLabel: '外掛註冊表 · 公共生態',
  heroTitle: '瀏覽帶即時預覽的 agent 原生設計外掛。',
  heroBody: '發現可安裝的工作流、deck、影像模板、設計系統和原子能力。',
  browseRegistry: '瀏覽註冊表',
  communityMarketplace: '社群 marketplace.json',
  registryPreview: '註冊表預覽',
  installableEntries: '可安裝條目',
  official: '官方',
  withPreview: '帶預覽',
  surfaces: '表面類型',
  availableSources: '可用來源',
  registryEntries: '註冊表條目',
  searchPlugins: '搜尋外掛',
  searchPlaceholder: '搜尋外掛、工作流、vendor...',
  filtersLabel: '註冊表篩選',
  visiblePlugins: '個可見外掛',
  openDetails: (title: string) => `打開 ${title} 詳情`,
  details: '詳情',
  pluginDetailTitle: (title: string) => `${title} — Open Design 外掛`,
  pluginDetailDescription: (description: string, command: string) =>
    `${description} 使用 ${command} 安裝。`,
  pluginRail: (id: string) => `Open Design 外掛 · ${id}`,
  allPlugins: '全部外掛',
  sourceJson: '來源 JSON',
  registry: '註冊表',
  deprecated: '已棄用',
  yanked: '已下架',
  installFromRegistry: '從註冊表安裝',
  copy: '複製',
  copied: '已複製',
  select: '選擇',
  previewAndFacts: '外掛預覽與資訊',
  marketplaceJson: 'Marketplace JSON 檔案',
  sourceRepository: '來源倉庫',
  homepage: '首頁',
  interactivePreview: '互動預覽',
  imagePreview: '圖片預覽',
  videoPoster: '影片封面',
  liveHtmlPreview: 'Live HTML 預覽',
  trusted: '可信',
  restricted: '受限',
  pluginId: '外掛 ID',
  version: '版本',
  license: '授權',
  publisher: '發布方',
  notSpecified: '未指定',
  howItResolves: '解析方式',
  provenance: '註冊表來源',
  provenanceBody: '這個條目來自 marketplace catalog，並解析到下方傳輸來源。',
  workflowSurface: '工作流表面',
  directSourceFallback: '直接來源 fallback',
  howPeopleUseIt: '使用方式',
  examplePromptBody: '註冊表條目包含可直接執行的提示詞種子。',
  moreFrom: (registryName: string) => `更多來自 ${registryName}`,
  relatedPlugins: '相關外掛',
};

const make = (text: UiText): DeepPartial<LandingUiCopy> => buildUiCopy(text);

const zhTutorialsCopy = {
  title: '教程',
  seoTitle: '教程 — Open Design',
  description:
    '观看 Open Design 的上手 walkthrough、插件教程、演示、评测与社区视频。所有视频都在页面内播放，并保留原始 YouTube 来源。',
  categoriesLabel: '教程分类',
  categories: {
    all: '全部',
    gettingStarted: '入门',
    tutorial: '教程',
    demo: '演示',
    review: '评测',
    community: '社区',
  },
  official: '官方',
  watch: '观看',
  watchCta: '观看 →',
  watchOnYouTube: '在 YouTube 观看 ↗',
  openOnYouTube: '在 YouTube 打开 ↗',
  backToTutorials: '← 返回教程',
  viewSource: '在 GitHub 查看源码 ↗',
  noEntries: '暂时还没有教程。我们正在整理第一批视频，请稍后再来，或者',
  suggestVideo: '推荐一支视频',
  noCategory: '这个分类还没有教程，更多内容正在整理。',
  thumbnailAlt: (title: string) => `${title} 的视频封面`,
  detailTitle: (title: string) => `${title} — Open Design 教程`,
  localizedTitle: (_title: string, author: string) => `Open Design 教程：${author}`,
  localizedSummary: (_title: string, author: string, category: string) =>
    `${author} 通过一支 ${category} 视频讲解 Open Design 的本地优先设计工作流、Skill、设计系统与可复用模板。`,
  localizedBodyHtml: (_title: string, author: string, summary: string) =>
    `<p>${summary}</p><h2>本地化摘要</h2><p>这支视频来自 ${author}，围绕 Open Design 的安装、能力演示、设计系统、Skill 与本地 Agent 工作流展开。页面保留原始视频来源，非英文页面使用站内 i18n 摘要，避免正文回退成英文。</p>`,
} satisfies NonNullable<DeepPartial<LandingUiCopy>['tutorials']>;

const zhTwTutorialsCopy = {
  title: '教學',
  seoTitle: '教學 — Open Design',
  description:
    '觀看 Open Design 的上手 walkthrough、外掛教學、演示、評測與社群影片。所有影片都在頁面內播放，並保留原始 YouTube 來源。',
  categoriesLabel: '教學分類',
  categories: {
    all: '全部',
    gettingStarted: '入門',
    tutorial: '教學',
    demo: '演示',
    review: '評測',
    community: '社群',
  },
  official: '官方',
  watch: '觀看',
  watchCta: '觀看 →',
  watchOnYouTube: '在 YouTube 觀看 ↗',
  openOnYouTube: '在 YouTube 開啟 ↗',
  backToTutorials: '← 返回教學',
  viewSource: '在 GitHub 查看原始碼 ↗',
  noEntries: '暫時還沒有教學。我們正在整理第一批影片，請稍後再來，或者',
  suggestVideo: '推薦一支影片',
  noCategory: '這個分類還沒有教學，更多內容正在整理。',
  thumbnailAlt: (title: string) => `${title} 的影片封面`,
  detailTitle: (title: string) => `${title} — Open Design 教學`,
  localizedTitle: (_title: string, author: string) => `Open Design 教學：${author}`,
  localizedSummary: (_title: string, author: string, category: string) =>
    `${author} 透過一支 ${category} 影片講解 Open Design 的本地優先設計工作流、Skill、設計系統與可複用模板。`,
  localizedBodyHtml: (_title: string, author: string, summary: string) =>
    `<p>${summary}</p><h2>本地化摘要</h2><p>這支影片來自 ${author}，圍繞 Open Design 的安裝、能力演示、設計系統、Skill 與本地 Agent 工作流展開。頁面保留原始影片來源，非英文頁面使用站內 i18n 摘要，避免正文回退成英文。</p>`,
} satisfies NonNullable<DeepPartial<LandingUiCopy>['tutorials']>;

const jp: UiText = {
  ...SHARED.zh,
  blogTitle: '編集ノート', blogDescription: 'Open Design を理解し、試し、構築するためのローカライズされたノート。', blogCategories: '記事カテゴリ', all: 'すべて', product: 'プロダクト', guides: 'ガイド', useCases: 'ユースケース', community: 'コミュニティ', minRead: '分で読めます', readMore: '続きを読む →', read: '読む →', backToBlog: '← ノートへ戻る', noEntries: '記事はまだありません。', noPosts: 'このカテゴリの記事はまだありません。', nextStep: '次のステップ', joinDiscord: 'Discord に参加', viewSource: 'GitHub でソースを見る ↗', downloadTitle: 'デスクトップ版をダウンロード', downloadBody: 'オープンソースのデザインワークスペースを試し、リリースノートを確認できます。', downloadLabel: 'デスクトップをダウンロード ↗', skillsTitle: 'Skill ワークフローをローカル実行', skillsBody: 'ワークフローライブラリから起点を選び、普段の agent に接続します。', skillsLabel: 'ワークフローを見る ↗', repoTitle: 'GitHub の実装を見る', repoBody: 'ソースを読み、Star し、workflow を fork し、次の改善を議論できます。', repoLabel: 'リポジトリを開く ↗',
  breadcrumb: 'パンくず', catalog: 'カタログ', skill: 'Skill', skills: 'Skill', system: 'デザインシステム', systems: 'デザインシステム', template: 'テンプレート', templates: 'テンプレート', craft: 'クラフト', craftRule: 'クラフトルール', plugin: 'プラグイン', plugins: 'プラグイン', capabilities: '構成可能なデザイン能力', visualSystems: '移植可能な視覚システム', artifactTemplates: 'fork 可能な artifact テンプレート', principles: 'ブランド非依存のレンダリング原則', mode: 'モード', scenario: 'シナリオ', platform: 'プラットフォーム', featured: '注目', category: 'カテゴリ', allSkills: 'すべての Skill', allSystems: 'すべてのデザインシステム', allTemplates: 'すべてのテンプレート', allCraft: 'すべてのクラフトルール', detailSkill: 'Skill', detailSystem: 'デザインシステム', detailTemplate: 'テンプレート', detailCraft: 'クラフトルール', viewOnGithub: 'GitHub で見る', viewDesignOnGithub: 'GitHub で DESIGN.md を見る', upstream: '上流ソース', triggers: 'トリガー', triggersLead: 'これらの prompt が Skill のマッチに使われます。', examplePrompt: 'サンプル prompt', relatedSkills: '関連 Skill', relatedCraft: 'その他のクラフトルール', paletteSample: 'パレット例', paletteLead: (count) => `DESIGN.md から抽出した最初の ${count} 色。`, visualTheme: '視覚テーマ', relatedSystems: (category) => `${category} の関連システム`, forkOnGithub: 'GitHub で fork', templatePreview: 'テンプレートの seed data からレンダリング。', whatsInside: 'テンプレートの中身', whatsInsideLead: 'renderer、seed data、SKILL.md、接続説明を含みます。', renderer: 'artifact renderer', seedData: 'オフライン / preview 用 seed value', readme: '接続、更新頻度、カスタム方法', readFullRule: 'GitHub で全文を読む',
  pluginRegistryTitle: 'Open Design プラグイン — 公式とコミュニティ登録', pluginRegistryDescription: (count) => `${count} 個の Open Design プラグインを閲覧。`, directoryRailRight: 'Open Design Registry · 公式 · コミュニティ', topbarTitle: 'OD / レジストリ', topbarSubtitle: '公開インデックス', topbarMeta: '公式 · コミュニティ · セルフホスト', sourceJson: 'ソース JSON', heroLabel: 'プラグイン登録 · 公開エコシステム', heroTitle: 'ライブ preview 付き agent-native design plugin を閲覧。', heroBody: 'インストール可能な workflow、deck、画像テンプレート、デザインシステムを発見できます。', browseRegistry: '登録を閲覧', communityMarketplace: 'コミュニティ marketplace.json', registryPreview: '登録 preview', installableEntries: 'インストール可能項目', official: '公式', withPreview: 'preview あり', surfaces: 'surface', availableSources: '利用可能なソース', registryEntries: '登録項目', searchPlugins: 'プラグイン検索', searchPlaceholder: 'プラグイン、workflow、vendor を検索...', filtersLabel: '登録フィルタ', visiblePlugins: '表示中のプラグイン', openDetails: (title) => `${title} の詳細を開く`, details: '詳細', pluginDetailTitle: (title) => `${title} — Open Design プラグイン`, pluginDetailDescription: (description, command) => `${description} ${command} でインストール。`, pluginRail: (id) => `Open Design プラグイン · ${id}`, allPlugins: 'すべてのプラグイン', registry: 'レジストリ', deprecated: '非推奨', yanked: '取り下げ済み', installFromRegistry: 'レジストリからインストール', copy: 'コピー', copied: 'コピー済み', select: '選択', previewAndFacts: 'プラグイン preview と情報', marketplaceJson: 'Marketplace JSON ファイル', sourceRepository: 'ソースリポジトリ', homepage: 'ホームページ', interactivePreview: 'インタラクティブ preview', imagePreview: '画像 preview', videoPoster: '動画 poster', liveHtmlPreview: 'Live HTML preview', trusted: '信頼済み', restricted: '制限付き', pluginId: 'プラグイン ID', version: 'バージョン', license: 'ライセンス', publisher: '公開者', notSpecified: '未指定', howItResolves: '解決方法', provenance: '登録の由来', provenanceBody: 'この項目は marketplace catalog から検出され、下の転送ソースへ解決されます。', workflowSurface: 'ワークフロー surface', directSourceFallback: '直接ソース fallback', howPeopleUseIt: '利用方法', examplePromptBody: '登録項目にはすぐ試せる prompt seed が含まれます。', moreFrom: (registryName) => `${registryName} の他の項目`, relatedPlugins: '関連プラグイン',
};

function cloneWith(base: UiText, patch: Partial<UiText>): UiText {
  return { ...base, ...patch };
}

type OwnedUiLabels = {
  preview: string;
  details: string;
  download: string;
  repository: string;
  homepage: string;
  source: string;
  trigger: string;
  prompt: string;
  palette: string;
  theme: string;
  fork: string;
  registry: string;
  deprecated: string;
  yanked: string;
  trusted: string;
  restricted: string;
  notSpecified: string;
  fallback: string;
};

const OWNED_UI_LABELS = {
  zh: {
    preview: '预览',
    details: '详情',
    download: '下载',
    repository: '仓库',
    homepage: '主页',
    source: '来源',
    trigger: '触发词',
    prompt: '提示词',
    palette: '色板',
    theme: '主题',
    fork: 'Fork',
    registry: '注册表',
    deprecated: '已弃用',
    yanked: '已下架',
    trusted: '可信',
    restricted: '受限',
    notSpecified: '未指定',
    fallback: '备用来源',
  },
  'zh-tw': {
    preview: '預覽',
    details: '詳細資訊',
    download: '下載',
    repository: '倉庫',
    homepage: '首頁',
    source: '來源',
    trigger: '觸發詞',
    prompt: '提示詞',
    palette: '色板',
    theme: '主題',
    fork: 'Fork',
    registry: '註冊表',
    deprecated: '已棄用',
    yanked: '已下架',
    trusted: '可信',
    restricted: '受限',
    notSpecified: '未指定',
    fallback: '備用來源',
  },
  ja: {
    preview: 'プレビュー',
    details: '詳細',
    download: 'ダウンロード',
    repository: 'リポジトリ',
    homepage: 'ホームページ',
    source: 'ソース',
    trigger: 'トリガー',
    prompt: 'プロンプト',
    palette: 'パレット',
    theme: 'テーマ',
    fork: 'フォーク',
    registry: 'レジストリ',
    deprecated: '非推奨',
    yanked: '取り下げ済み',
    trusted: '信頼済み',
    restricted: '制限付き',
    notSpecified: '未指定',
    fallback: '代替ソース',
  },
  ko: {
    preview: '미리보기',
    details: '상세 정보',
    download: '다운로드',
    repository: '저장소',
    homepage: '홈페이지',
    source: '소스',
    trigger: '트리거',
    prompt: '프롬프트',
    palette: '팔레트',
    theme: '테마',
    fork: '포크',
    registry: '레지스트리',
    deprecated: '지원 중단',
    yanked: '철회됨',
    trusted: '신뢰됨',
    restricted: '제한됨',
    notSpecified: '지정되지 않음',
    fallback: '대체 소스',
  },
  de: {
    preview: 'Vorschau',
    details: 'Details',
    download: 'Herunterladen',
    repository: 'Repository',
    homepage: 'Startseite',
    source: 'Quelle',
    trigger: 'Ausloeser',
    prompt: 'Prompt',
    palette: 'Palette',
    theme: 'Theme',
    fork: 'Fork',
    registry: 'Register',
    deprecated: 'Veraltet',
    yanked: 'Entfernt',
    trusted: 'Vertrauenswuerdig',
    restricted: 'Eingeschraenkt',
    notSpecified: 'Nicht angegeben',
    fallback: 'Ersatzquelle',
  },
  fr: {
    preview: 'Apercu',
    details: 'Details',
    download: 'Telecharger',
    repository: 'Depot',
    homepage: 'Accueil',
    source: 'Source',
    trigger: 'Declencheur',
    prompt: 'Prompt',
    palette: 'Palette',
    theme: 'Theme',
    fork: 'Fork',
    registry: 'Registre',
    deprecated: 'Obsolete',
    yanked: 'Retire',
    trusted: 'Fiable',
    restricted: 'Restreint',
    notSpecified: 'Non indique',
    fallback: 'Source de repli',
  },
  ru: {
    preview: 'Предпросмотр',
    details: 'Сведения',
    download: 'Скачать',
    repository: 'Репозиторий',
    homepage: 'Главная',
    source: 'Источник',
    trigger: 'Триггер',
    prompt: 'Промпт',
    palette: 'Палитра',
    theme: 'Тема',
    fork: 'Форк',
    registry: 'Реестр',
    deprecated: 'Устарело',
    yanked: 'Снято',
    trusted: 'Доверенный',
    restricted: 'Ограничено',
    notSpecified: 'Не указано',
    fallback: 'Резервный источник',
  },
  es: {
    preview: 'Vista previa',
    details: 'Detalles',
    download: 'Descargar',
    repository: 'Repositorio',
    homepage: 'Inicio',
    source: 'Fuente',
    trigger: 'Disparador',
    prompt: 'Prompt',
    palette: 'Paleta',
    theme: 'Tema',
    fork: 'Fork',
    registry: 'Registro',
    deprecated: 'Obsoleto',
    yanked: 'Retirado',
    trusted: 'Confiable',
    restricted: 'Restringido',
    notSpecified: 'No especificado',
    fallback: 'Fuente alternativa',
  },
  'pt-br': {
    preview: 'Previa',
    details: 'Detalhes',
    download: 'Baixar',
    repository: 'Repositorio',
    homepage: 'Pagina inicial',
    source: 'Fonte',
    trigger: 'Gatilho',
    prompt: 'Prompt',
    palette: 'Paleta',
    theme: 'Tema',
    fork: 'Fork',
    registry: 'Registro',
    deprecated: 'Obsoleto',
    yanked: 'Removido',
    trusted: 'Confiavel',
    restricted: 'Restrito',
    notSpecified: 'Nao informado',
    fallback: 'Fonte alternativa',
  },
  it: {
    preview: 'Anteprima',
    details: 'Dettagli',
    download: 'Scarica',
    repository: 'Repository',
    homepage: 'Homepage',
    source: 'Sorgente',
    trigger: 'Attivatore',
    prompt: 'Prompt',
    palette: 'Palette',
    theme: 'Tema',
    fork: 'Fork',
    registry: 'Registro',
    deprecated: 'Obsoleto',
    yanked: 'Rimosso',
    trusted: 'Affidabile',
    restricted: 'Limitato',
    notSpecified: 'Non indicato',
    fallback: 'Sorgente alternativa',
  },
  vi: {
    preview: 'Xem trước',
    details: 'Chi tiết',
    download: 'Tải xuống',
    repository: 'Kho mã',
    homepage: 'Trang chủ',
    source: 'Nguồn',
    trigger: 'Kích hoạt',
    prompt: 'Prompt',
    palette: 'Bảng màu',
    theme: 'Chủ đề',
    fork: 'Fork',
    registry: 'Kho registry',
    deprecated: 'Không còn khuyến nghị',
    yanked: 'Đã gỡ',
    trusted: 'Đáng tin',
    restricted: 'Bị hạn chế',
    notSpecified: 'Chưa nêu',
    fallback: 'Nguồn dự phòng',
  },
  pl: {
    preview: 'Podglad',
    details: 'Szczegoly',
    download: 'Pobierz',
    repository: 'Repozytorium',
    homepage: 'Strona glowna',
    source: 'Zrodlo',
    trigger: 'Wyzwalacz',
    prompt: 'Prompt',
    palette: 'Paleta',
    theme: 'Motyw',
    fork: 'Fork',
    registry: 'Rejestr',
    deprecated: 'Przestarzale',
    yanked: 'Wycofane',
    trusted: 'Zaufane',
    restricted: 'Ograniczone',
    notSpecified: 'Nie podano',
    fallback: 'Zrodlo zapasowe',
  },
  id: {
    preview: 'Pratinjau',
    details: 'Detail',
    download: 'Unduh',
    repository: 'Repositori',
    homepage: 'Beranda',
    source: 'Sumber',
    trigger: 'Pemicu',
    prompt: 'Prompt',
    palette: 'Palet',
    theme: 'Tema',
    fork: 'Fork',
    registry: 'Registri',
    deprecated: 'Usang',
    yanked: 'Ditarik',
    trusted: 'Tepercaya',
    restricted: 'Terbatas',
    notSpecified: 'Tidak disebutkan',
    fallback: 'Sumber cadangan',
  },
  nl: {
    preview: 'Voorbeeld',
    details: 'Details',
    download: 'Downloaden',
    repository: 'Repository',
    homepage: 'Startpagina',
    source: 'Bron',
    trigger: 'Trigger',
    prompt: 'Prompt',
    palette: 'Palet',
    theme: 'Thema',
    fork: 'Fork',
    registry: 'Register',
    deprecated: 'Verouderd',
    yanked: 'Verwijderd',
    trusted: 'Vertrouwd',
    restricted: 'Beperkt',
    notSpecified: 'Niet opgegeven',
    fallback: 'Reservebron',
  },
  ar: {
    preview: 'معاينة',
    details: 'تفاصيل',
    download: 'تنزيل',
    repository: 'المستودع',
    homepage: 'الصفحة الرئيسية',
    source: 'المصدر',
    trigger: 'مشغل',
    prompt: 'موجه',
    palette: 'لوحة ألوان',
    theme: 'سمة',
    fork: 'Fork',
    registry: 'السجل',
    deprecated: 'قديم',
    yanked: 'مسحوب',
    trusted: 'موثوق',
    restricted: 'مقيد',
    notSpecified: 'غير محدد',
    fallback: 'مصدر احتياطي',
  },
  tr: {
    preview: 'Onizleme',
    details: 'Ayrintilar',
    download: 'Indir',
    repository: 'Depo',
    homepage: 'Ana sayfa',
    source: 'Kaynak',
    trigger: 'Tetikleyici',
    prompt: 'Prompt',
    palette: 'Palet',
    theme: 'Tema',
    fork: 'Fork',
    registry: 'Kayit',
    deprecated: 'Kullanimdan kalkti',
    yanked: 'Geri cekildi',
    trusted: 'Guvenilir',
    restricted: 'Kisitli',
    notSpecified: 'Belirtilmedi',
    fallback: 'Yedek kaynak',
  },
  uk: {
    preview: 'Перегляд',
    details: 'Деталі',
    download: 'Завантажити',
    repository: 'Репозиторій',
    homepage: 'Головна',
    source: 'Джерело',
    trigger: 'Тригер',
    prompt: 'Промпт',
    palette: 'Палітра',
    theme: 'Тема',
    fork: 'Форк',
    registry: 'Реєстр',
    deprecated: 'Застаріло',
    yanked: 'Вилучено',
    trusted: 'Довірено',
    restricted: 'Обмежено',
    notSpecified: 'Не вказано',
    fallback: 'Резервне джерело',
  },
} satisfies Record<Exclude<LandingLocaleCode, 'en'>, OwnedUiLabels>;

function localizeOwnedUiText(locale: Exclude<LandingLocaleCode, 'en'>, text: UiText): UiText {
  const labels = OWNED_UI_LABELS[locale];
  const renderer = `${text.template} renderer`;
  const seedData = `${text.template} data`;
  return {
    ...text,
    blogDescription: `${text.blogTitle}: Open Design / ${text.product} / ${text.guides} / ${text.useCases} / ${text.community}.`,
    viewSource: `GitHub · ${labels.source} ↗`,
    downloadTitle: `${labels.download} Open Design Desktop`,
    downloadBody: `Open Design Desktop / GitHub / Discord.`,
    downloadLabel: `${labels.download} ↗`,
    skillsTitle: `${text.skills} · Open Design`,
    skillsBody: `${text.skills}: SKILL.md / daemon / DESIGN.md / ${text.systems}.`,
    skillsLabel: `${text.skills} ↗`,
    repoTitle: `GitHub · ${labels.repository}`,
    repoBody: `GitHub: Open Design / ${text.skills} / ${text.templates} / ${text.systems}.`,
    repoLabel: `GitHub ↗`,
    breadcrumb: `${text.catalog} / ${text.category}`,
    capability: text.skill,
    capabilities: `${text.skill} / ${text.system} / ${text.template}`,
    portable: `${text.system} / ${text.template}`,
    visualSystems: `${text.system} / DESIGN.md`,
    artifactTemplates: `${text.template} / artifact`,
    principles: `${text.craftRule} / UI`,
    allSkills: `${text.all} ${text.skills}`,
    allSystems: `${text.all} ${text.systems}`,
    allTemplates: `${text.all} ${text.templates}`,
    allCraft: `${text.all} ${text.craft}`,
    registry: labels.registry,
    detailSkill: text.skill,
    detailSystem: text.system,
    detailTemplate: text.template,
    detailCraft: text.craftRule,
    viewOnGithub: `GitHub · ${labels.source}`,
    viewDesignOnGithub: `DESIGN.md · GitHub`,
    upstream: labels.source,
    preview: labels.preview,
    triggers: labels.trigger,
    triggersLead: `${labels.trigger}: ${text.skill} / ${labels.prompt}.`,
    examplePrompt: labels.prompt,
    relatedSkills: `${text.skills} · ${text.category}`,
    relatedCraft: `${text.craft} · ${text.category}`,
    paletteSample: `${labels.palette} · ${labels.preview}`,
    paletteLead: (count: number) => `DESIGN.md · ${labels.palette} · ${count}.`,
    visualTheme: labels.theme,
    relatedSystems: (category: string) => `${category} · ${text.systems}`,
    forkOnGithub: `GitHub · ${labels.fork}`,
    templatePreview: `${text.template} · ${labels.preview}.`,
    whatsInside: `${text.template} · ${labels.details}`,
    whatsInsideLead: `${renderer} / ${seedData} / SKILL.md / README.`,
    renderer,
    seedData,
    readme: `README / ${labels.source}`,
    readFullRule: `GitHub · ${text.craftRule}`,
    pluginRegistryTitle: `${text.plugins} — Open Design`,
    pluginRegistryDescription: (count: number) => `${count} ${text.plugins} · Open Design.`,
    directoryRailRight: `Open Design · ${text.official} · ${text.community}`,
    directoryRailLeft: `vendor/plugin-name · marketplace.json`,
    topbarTitle: `OD / ${labels.registry}`,
    topbarSubtitle: text.catalog,
    topbarMeta: `${text.official} · ${text.community} · local-first`,
    sourceJson: 'JSON',
    heroLabel: `${text.plugins} · ${labels.registry}`,
    heroTitle: `${text.plugins} · Open Design`,
    heroBody: `${text.skills} / ${text.templates} / ${text.systems} / ${text.craft}.`,
    browseRegistry: `${labels.registry} ↗`,
    communityMarketplace: `${text.community} marketplace.json`,
    registryPreview: `${labels.registry} · ${labels.preview}`,
    installableEntries: text.plugins,
    withPreview: labels.preview,
    surfaces: text.platform,
    availableSources: `${labels.registry} / JSON`,
    registryEntries: `${labels.registry} · ${text.plugins}`,
    searchPlugins: `${text.plugins} · ${text.catalog}`,
    searchPlaceholder: `${text.plugins}, vendor/plugin-name...`,
    filtersLabel: `${labels.registry} · ${text.category}`,
    visiblePlugins: text.plugins,
    openDetails: (title: string) => `${labels.details}: ${title}`,
    details: labels.details,
    pluginDetailTitle: (title: string) => `${title} — Open Design ${text.plugin}`,
    pluginDetailDescription: (description: string, command: string) => `${description} ${command}.`,
    pluginRail: (id: string) => `Open Design ${text.plugin} · ${id}`,
    allPlugins: `${text.all} ${text.plugins}`,
    deprecated: labels.deprecated,
    yanked: labels.yanked,
    previewAndFacts: `${text.plugin} · ${labels.preview}`,
    marketplaceJson: 'marketplace.json',
    sourceRepository: `GitHub · ${labels.repository}`,
    homepage: labels.homepage,
    interactivePreview: `HTML · ${labels.preview}`,
    imagePreview: labels.preview,
    videoPoster: labels.preview,
    liveHtmlPreview: `HTML · ${labels.preview}`,
    trusted: labels.trusted,
    restricted: labels.restricted,
    notSpecified: labels.notSpecified,
    howItResolves: `${labels.registry} / JSON`,
    provenance: `${labels.registry} / ${labels.source}`,
    provenanceBody: `marketplace.json / vendor/plugin-name / ${labels.source}.`,
    workflowSurface: `${text.skills} / ${text.platform}`,
    directSourceFallback: labels.fallback,
    howPeopleUseIt: text.useCases,
    examplePromptBody: `${labels.prompt}: ${text.skill} / ${text.template}.`,
    moreFrom: (registryName: string) => `${registryName} · ${text.plugins}`,
    relatedPlugins: `${text.plugins} · ${text.category}`,
  };
}

const ko = cloneWith(jp, {
  blogTitle: '작업 노트', blogDescription: 'Open Design을 이해하고 탐색하고 구축하기 위한 현지화 노트.', blogCategories: '글 분류', all: '전체', product: '제품', guides: '가이드', useCases: '사용 사례', community: '커뮤니티', minRead: '분 읽기', readMore: '더 읽기 →', read: '읽기 →', backToBlog: '← 노트로 돌아가기', noEntries: '아직 글이 없습니다.', noPosts: '이 분류에는 아직 글이 없습니다.', nextStep: '다음 단계', joinDiscord: 'Discord 참여', viewSource: 'GitHub에서 소스 보기 ↗', downloadTitle: '데스크톱 빌드 다운로드', downloadBody: '오픈소스 디자인 워크스페이스를 실행하고 릴리스 노트를 확인하세요.', downloadLabel: '데스크톱 다운로드 ↗', skillsTitle: 'Skill 워크플로 로컬 실행', skillsBody: '워크플로 라이브러리에서 시작점을 골라 쓰는 agent에 연결합니다.', skillsLabel: '워크플로 보기 ↗', repoTitle: 'GitHub 구현 보기', repoBody: '소스를 확인하고 Star를 누르고 workflow를 fork하거나 다음 개선을 논의하세요.', repoLabel: '저장소 열기 ↗',
  breadcrumb: '탐색 경로', catalog: '카탈로그', system: '디자인 시스템', systems: '디자인 시스템', template: '템플릿', templates: '템플릿', craft: '크래프트', craftRule: '크래프트 규칙', plugin: '플러그인', plugins: '플러그인', capabilities: '조합 가능한 디자인 능력', visualSystems: '이식 가능한 시각 시스템', artifactTemplates: 'fork 가능한 artifact 템플릿', principles: '브랜드 독립 렌더링 원칙', mode: '모드', scenario: '시나리오', platform: '플랫폼', featured: '추천', category: '분류', allSkills: '모든 Skill', allSystems: '모든 디자인 시스템', allTemplates: '모든 템플릿', allCraft: '모든 크래프트 규칙', detailSystem: '디자인 시스템', detailTemplate: '템플릿', detailCraft: '크래프트 규칙', viewOnGithub: 'GitHub에서 보기', viewDesignOnGithub: 'GitHub에서 DESIGN.md 보기', upstream: '상위 소스', triggers: '트리거', triggersLead: '선택기는 이 prompt로 Skill을 매칭합니다.', examplePrompt: '예시 prompt', relatedSkills: '관련 Skill', relatedCraft: '다른 크래프트 규칙', paletteSample: '팔레트 예시', paletteLead: (count) => `DESIGN.md에서 추출한 처음 ${count}개 색상입니다.`, visualTheme: '시각 테마', relatedSystems: (category) => `${category} 관련 시스템`, forkOnGithub: 'GitHub에서 fork', whatsInside: '템플릿 구성', readFullRule: 'GitHub에서 전체 규칙 읽기',
  pluginRegistryTitle: 'Open Design 플러그인 — 공식 및 커뮤니티 레지스트리', pluginRegistryDescription: (count) => `${count}개의 Open Design 플러그인을 탐색합니다.`, topbarTitle: 'OD / 레지스트리', topbarSubtitle: '공개 인덱스', topbarMeta: '공식 · 커뮤니티 · 자체 호스팅', sourceJson: '소스 JSON', heroLabel: '플러그인 레지스트리 · 공개 생태계', heroTitle: '실시간 preview가 있는 agent-native 디자인 플러그인을 탐색하세요.', browseRegistry: '레지스트리 보기', registryPreview: '레지스트리 preview', installableEntries: '설치 가능 항목', official: '공식', withPreview: 'preview 있음', availableSources: '사용 가능한 소스', registryEntries: '레지스트리 항목', searchPlugins: '플러그인 검색', searchPlaceholder: '플러그인, workflow, vendor 검색...', visiblePlugins: '표시 중인 플러그인', openDetails: (title) => `${title} 상세 열기`, details: '상세', pluginDetailTitle: (title) => `${title} — Open Design 플러그인`, installFromRegistry: '레지스트리에서 설치', copy: '복사', copied: '복사됨', select: '선택', previewAndFacts: '플러그인 preview 및 정보', sourceRepository: '소스 저장소', homepage: '홈페이지', trusted: '신뢰됨', restricted: '제한됨', pluginId: '플러그인 ID', version: '버전', license: '라이선스', publisher: '게시자', notSpecified: '미지정', howItResolves: '해결 방식', provenance: '레지스트리 출처', workflowSurface: '워크플로 surface', howPeopleUseIt: '사용 방식', relatedPlugins: '관련 플러그인',
});

const de = cloneWith(jp, {
  blogTitle: 'Journal', blogDescription: 'Lokalisierte Notizen zum Verstehen, Erkunden und Bauen mit Open Design.', blogCategories: 'Journal-Kategorien', all: 'Alle', product: 'Produkt', guides: 'Leitfäden', useCases: 'Anwendungsfälle', community: 'Gemeinschaft', minRead: 'Min. Lesezeit', readMore: 'Weiterlesen →', read: 'Lesen →', backToBlog: '← Zurück zum Journal', noEntries: 'Noch keine Einträge.', noPosts: 'In dieser Kategorie gibt es noch keine Beiträge.', nextStep: 'Nächster Schritt', joinDiscord: 'Discord beitreten', viewSource: 'Quelle auf GitHub ansehen ↗', downloadTitle: 'Desktop-Build herunterladen', downloadBody: 'Teste den offenen Design-Workspace, lies die Versionsnotizen oder komm in die Gemeinschaft.', downloadLabel: 'Desktop herunterladen ↗', skillsTitle: 'Skill-Workflow lokal ausführen', skillsBody: 'Wähle einen Workflow und verbinde ihn mit deinem Agenten.', skillsLabel: 'Workflows ansehen ↗', repoTitle: 'Implementierung auf GitHub ansehen', repoBody: 'Prüfe den Quellcode, gib einen Stern, forke Workflows oder diskutiere nächste Schritte.', repoLabel: 'Repository öffnen ↗',
  breadcrumb: 'Navigationspfad', catalog: 'Katalog', system: 'Designsystem', systems: 'Designsysteme', template: 'Vorlage', templates: 'Vorlagen', craft: 'Gestaltung', craftRule: 'Gestaltungsregel', plugin: 'Plugin-Modul', plugins: 'Plugin-Module', capabilities: 'kombinierbare Designfähigkeiten', visualSystems: 'portable visuelle Systeme', artifactTemplates: 'forkbare Artifact-Vorlagen', principles: 'markenunabhängige Renderprinzipien', mode: 'Arbeitsmodus', scenario: 'Szenario', platform: 'Plattform', featured: 'Empfohlen', category: 'Kategorie', allSkills: 'Alle Skills', allSystems: 'Alle Designsysteme', allTemplates: 'Alle Vorlagen', allCraft: 'Alle Gestaltungsregeln', detailSystem: 'Designsystem', detailTemplate: 'Vorlage', detailCraft: 'Gestaltungsregel', viewOnGithub: 'Auf GitHub ansehen', viewDesignOnGithub: 'DESIGN.md auf GitHub ansehen', upstream: 'Ursprungsquelle', triggers: 'Auslöser', triggersLead: 'Diese Prompts helfen dem Picker beim passenden Skill.', examplePrompt: 'Beispielprompt', relatedSkills: 'Verwandte Skills', relatedCraft: 'Weitere Gestaltungsregeln', paletteSample: 'Palettenprobe', paletteLead: (count) => `Die ersten ${count} Farben aus DESIGN.md.`, visualTheme: 'Visuelles Thema', relatedSystems: (category) => `Verwandte Systeme in ${category}`, forkOnGithub: 'Auf GitHub forken', whatsInside: 'Inhalt der Vorlage', readFullRule: 'Vollständige Regel auf GitHub lesen',
  pluginRegistryTitle: 'Open Design Plugins — offizielle und gemeinschaftliche Register', pluginRegistryDescription: (count) => `${count} Open Design Plugins durchsuchen.`, topbarTitle: 'OD / REGISTER', topbarSubtitle: 'Öffentlicher Index', topbarMeta: 'Offiziell · Gemeinschaft · selbst gehostet', sourceJson: 'Quell-JSON', heroLabel: 'Plugin-Register · öffentliches Ökosystem', heroTitle: 'Agent-native Design-Plugins mit Live-Vorschau durchsuchen.', browseRegistry: 'Register durchsuchen', registryPreview: 'Registervorschau', installableEntries: 'installierbare Einträge', official: 'Offiziell', withPreview: 'mit Vorschau', availableSources: 'Verfügbare Quellen', registryEntries: 'Registereinträge', searchPlugins: 'Plugins suchen', searchPlaceholder: 'Plugins, Workflows, Anbieter suchen...', filtersLabel: 'Registerfilter', visiblePlugins: 'sichtbare Plugins', openDetails: (title) => `Einzelheiten zu ${title} öffnen`, details: 'Einzelheiten', pluginDetailTitle: (title) => `${title} — Open Design Plugin`, installFromRegistry: 'Aus Register installieren', copy: 'Kopieren', copied: 'Kopiert', select: 'Auswählen', previewAndFacts: 'Plugin-Vorschau und Fakten', sourceRepository: 'Quell-Repository', homepage: 'Startseite', trusted: 'Vertrauenswürdig', restricted: 'Eingeschränkt', pluginId: 'Plugin-Kennung', version: 'Plugin-Version', license: 'Lizenz', publisher: 'Herausgeber', notSpecified: 'Nicht angegeben', howItResolves: 'Auflösung', provenance: 'Registerherkunft', workflowSurface: 'Workflow-Oberfläche', directSourceFallback: 'Direkte Quellenreserve', howPeopleUseIt: 'Nutzung', relatedPlugins: 'Verwandte Plugins',
});

const fr = cloneWith(de, { blogTitle: 'Carnet', blogDescription: 'Notes localisées pour comprendre, explorer et construire avec Open Design.', blogCategories: 'Catégories du carnet', all: 'Tout', product: 'Produit', guides: 'Guides pratiques', useCases: 'Cas d’usage', community: 'Communauté', minRead: 'min de lecture', readMore: 'Lire la suite →', read: 'Lire →', backToBlog: '← Retour au carnet', noEntries: 'Aucune entrée pour le moment.', noPosts: 'Aucun article dans cette catégorie.', nextStep: 'Étape suivante', joinDiscord: 'Rejoindre Discord', viewSource: 'Voir la source sur GitHub ↗', downloadTitle: 'Télécharger le build desktop', downloadLabel: 'Télécharger le desktop ↗', skillsTitle: 'Exécuter le workflow de skill en local', skillsLabel: 'Voir les workflows ↗', repoTitle: 'Voir l’implémentation sur GitHub', repoLabel: 'Ouvrir le dépôt ↗', breadcrumb: 'Fil d’Ariane', catalog: 'Catalogue', system: 'système de design', systems: 'systèmes de design', template: 'modèle', templates: 'modèles', craft: 'règles de conception', craftRule: 'règle de conception', plugin: 'plugin', plugins: 'plugins', capabilities: 'capacités de design composables', visualSystems: 'systèmes visuels portables', artifactTemplates: 'modèles d’artifact à forker', principles: 'principes de rendu indépendants de la marque', mode: 'Mode de flux', scenario: 'Scénario', platform: 'Plateforme', featured: 'Sélection', category: 'Catégorie', allSkills: 'Tous les skills', allSystems: 'Tous les systèmes de design', allTemplates: 'Tous les modèles', allCraft: 'Toutes les règles de conception', detailSystem: 'Système de design', detailTemplate: 'Modèle', detailCraft: 'Règle de conception', viewOnGithub: 'Voir sur GitHub', upstream: 'Source amont', triggers: 'Déclencheurs', examplePrompt: 'Prompt d’exemple', relatedSkills: 'Skills liés', relatedCraft: 'Autres règles', paletteSample: 'Exemple de palette', visualTheme: 'Thème visuel', forkOnGithub: 'Forker sur GitHub', pluginRegistryTitle: 'Plugins Open Design — registres officiels et communautaires', pluginRegistryDescription: (count) => `Parcourir ${count} plugins Open Design.`, topbarTitle: 'OD / REGISTRE', topbarSubtitle: 'Index public', topbarMeta: 'Officiel · Communauté · auto-hébergé', sourceJson: 'JSON source', heroLabel: 'Registre de plugins · écosystème public', heroTitle: 'Parcourir les plugins de design agent-native avec aperçu live.', browseRegistry: 'Parcourir le registre', installableEntries: 'entrées installables', official: 'Officiel', withPreview: 'avec aperçu', availableSources: 'Sources disponibles', registryEntries: 'Entrées du registre', searchPlugins: 'Rechercher des plugins', filtersLabel: 'Filtres du registre', visiblePlugins: 'plugins visibles', details: 'Détails locaux', installFromRegistry: 'Installer depuis le registre', copy: 'Copier', copied: 'Copié', select: 'Sélectionner', previewAndFacts: 'Aperçu et informations du plugin', sourceRepository: 'Dépôt source', homepage: 'Page d’accueil', trusted: 'Fiable', restricted: 'Restreint', pluginId: 'ID du plugin', version: 'Version du plugin', license: 'Licence', publisher: 'Éditeur', notSpecified: 'Non indiqué', howItResolves: 'Résolution', provenance: 'Provenance du registre', workflowSurface: 'Surface de workflow', howPeopleUseIt: 'Usages', relatedPlugins: 'Plugins liés' });

const es = cloneWith(fr, { blogTitle: 'Bitácora', blogDescription: 'Notas localizadas para entender, explorar y construir con Open Design.', blogCategories: 'Categorías de la bitácora', all: 'Todo', product: 'Producto', guides: 'Guías', useCases: 'Casos de uso', community: 'Comunidad', minRead: 'min de lectura', readMore: 'Leer más →', read: 'Leer →', backToBlog: '← Volver a la bitácora', noEntries: 'Todavía no hay entradas.', noPosts: 'Todavía no hay artículos en esta categoría.', nextStep: 'Siguiente paso', joinDiscord: 'Unirse a Discord', downloadTitle: 'Descargar build de escritorio', downloadLabel: 'Descargar desktop ↗', skillsTitle: 'Ejecutar workflows de skill en local', skillsLabel: 'Ver workflows ↗', repoTitle: 'Ver implementación en GitHub', repoLabel: 'Abrir repositorio ↗', breadcrumb: 'Ruta de navegación', catalog: 'Catálogo', system: 'sistema de diseño', systems: 'sistemas de diseño', template: 'plantilla', templates: 'plantillas', craft: 'reglas de oficio', craftRule: 'regla de oficio', capabilities: 'capacidades de diseño componibles', visualSystems: 'sistemas visuales portables', artifactTemplates: 'plantillas de artifact para fork', principles: 'principios de render independientes de marca', mode: 'Modo', scenario: 'Escenario', platform: 'Plataforma', featured: 'Destacado', category: 'Categoría', allSkills: 'Todos los skills', allSystems: 'Todos los sistemas', allTemplates: 'Todas las plantillas', allCraft: 'Todas las reglas', viewOnGithub: 'Ver en GitHub', upstream: 'Fuente upstream', triggers: 'Disparadores', examplePrompt: 'Prompt de ejemplo', relatedSkills: 'Skills relacionados', paletteSample: 'Muestra de paleta', visualTheme: 'Tema visual', forkOnGithub: 'Fork en GitHub', pluginRegistryTitle: 'Plugins de Open Design — registros oficiales y comunitarios', pluginRegistryDescription: (count) => `Explora ${count} plugins de Open Design.`, topbarTitle: 'OD / REGISTRO', topbarSubtitle: 'Índice público', topbarMeta: 'Oficial · Comunidad · autohospedado', sourceJson: 'JSON fuente', heroLabel: 'Registro de plugins · ecosistema público', browseRegistry: 'Explorar registro', installableEntries: 'entradas instalables', official: 'Oficial', withPreview: 'con vista previa', availableSources: 'Fuentes disponibles', registryEntries: 'Entradas del registro', searchPlugins: 'Buscar plugins', filtersLabel: 'Filtros del registro', visiblePlugins: 'plugins visibles', installFromRegistry: 'Instalar desde el registro', copy: 'Copiar', copied: 'Copiado', select: 'Seleccionar', sourceRepository: 'Repositorio fuente', homepage: 'Página principal', trusted: 'Confiable', restricted: 'Restringido', pluginId: 'ID del plugin', version: 'Versión', license: 'Licencia', publisher: 'Publicador', notSpecified: 'No especificado', provenance: 'Procedencia del registro', workflowSurface: 'Superficie de workflow', relatedPlugins: 'Plugins relacionados' });

const simple: Record<Exclude<LandingLocaleCode, 'en' | 'zh' | 'zh-tw' | 'ja' | 'ko' | 'de' | 'fr' | 'es'>, UiText> = {
  ru: cloneWith(es, { blogTitle: 'Журнал', blogCategories: 'Категории журнала', all: 'Все', product: 'Продукт', guides: 'Руководства', useCases: 'Сценарии', community: 'Сообщество', minRead: 'мин чтения', readMore: 'Читать дальше →', read: 'Читать →', backToBlog: '← Назад в журнал', noEntries: 'Пока нет записей.', noPosts: 'В этой категории пока нет статей.', nextStep: 'Следующий шаг', joinDiscord: 'Войти в Discord', catalog: 'Каталог', system: 'дизайн-система', systems: 'дизайн-системы', template: 'шаблон', templates: 'шаблоны', craft: 'правила качества', craftRule: 'правило качества', plugin: 'плагин', plugins: 'плагины', mode: 'Режим', scenario: 'Сценарий', platform: 'Платформа', featured: 'Выбрано', category: 'Категория', copy: 'Копировать', copied: 'Скопировано', select: 'Выбрать', official: 'Официально', registry: 'Реестр', version: 'Версия', license: 'Лицензия', publisher: 'Издатель', notSpecified: 'Не указано', pluginId: 'ID плагина', installFromRegistry: 'Установить из реестра', relatedPlugins: 'Связанные плагины' }),
  'pt-br': cloneWith(es, { blogTitle: 'Diário', blogCategories: 'Categorias do diário', all: 'Tudo', product: 'Produto', guides: 'Guias', useCases: 'Casos de uso', community: 'Comunidade', minRead: 'min de leitura', readMore: 'Ler mais →', read: 'Ler →', backToBlog: '← Voltar ao diário', noEntries: 'Ainda não há entradas.', noPosts: 'Ainda não há posts nesta categoria.', nextStep: 'Próximo passo', joinDiscord: 'Entrar no Discord', catalog: 'Catálogo', system: 'sistema de design', systems: 'sistemas de design', template: 'modelo', templates: 'modelos', craft: 'regras de craft', craftRule: 'regra de craft', plugin: 'plugin', plugins: 'plugins', mode: 'Modo', scenario: 'Cenário', platform: 'Plataforma', featured: 'Destaque', category: 'Categoria', copy: 'Copiar', copied: 'Copiado', select: 'Selecionar', official: 'Oficial', registry: 'Registro', version: 'Versão', license: 'Licença', publisher: 'Publicador', notSpecified: 'Não informado', pluginId: 'ID do plugin', installFromRegistry: 'Instalar pelo registro', relatedPlugins: 'Plugins relacionados' }),
  it: cloneWith(es, { blogTitle: 'Diario', blogCategories: 'Categorie del diario', all: 'Tutto', product: 'Prodotto', guides: 'Guide', useCases: 'Casi d’uso', community: 'Comunità', minRead: 'min di lettura', readMore: 'Leggi altro →', read: 'Leggi →', backToBlog: '← Torna al diario', noEntries: 'Ancora nessuna voce.', noPosts: 'Ancora nessun articolo in questa categoria.', nextStep: 'Passo successivo', joinDiscord: 'Entra in Discord', catalog: 'Catalogo', system: 'sistema di design', systems: 'sistemi di design', template: 'modello', templates: 'modelli', craft: 'regole di craft', craftRule: 'regola di craft', plugin: 'plugin', plugins: 'plugin', mode: 'Modalità', scenario: 'Scenario d’uso', platform: 'Piattaforma', featured: 'In evidenza', category: 'Categoria', copy: 'Copia', copied: 'Copiato', select: 'Seleziona', official: 'Ufficiale', registry: 'Registro', version: 'Versione', license: 'Licenza', publisher: 'Editore', notSpecified: 'Non indicato', pluginId: 'ID plugin', installFromRegistry: 'Installa dal registro', relatedPlugins: 'Plugin correlati' }),
  vi: cloneWith(es, { blogTitle: 'Nhật ký', blogCategories: 'Danh mục bài viết', all: 'Tất cả', product: 'Sản phẩm', guides: 'Hướng dẫn', useCases: 'Tình huống dùng', community: 'Cộng đồng', minRead: 'phút đọc', readMore: 'Đọc tiếp →', read: 'Đọc →', backToBlog: '← Quay lại nhật ký', noEntries: 'Chưa có bài viết.', noPosts: 'Danh mục này chưa có bài viết.', nextStep: 'Bước tiếp theo', joinDiscord: 'Tham gia Discord', catalog: 'Danh mục', system: 'hệ thiết kế', systems: 'hệ thiết kế', template: 'mẫu', templates: 'mẫu', craft: 'quy tắc craft', craftRule: 'quy tắc craft', plugin: 'plugin', plugins: 'plugin', mode: 'Chế độ', scenario: 'Kịch bản', platform: 'Nền tảng', featured: 'Nổi bật', category: 'Phân loại', copy: 'Sao chép', copied: 'Đã sao chép', select: 'Chọn', official: 'Chính thức', registry: 'Kho registry', version: 'Phiên bản', license: 'Giấy phép', publisher: 'Nhà phát hành', notSpecified: 'Chưa nêu', pluginId: 'ID plugin', installFromRegistry: 'Cài từ kho registry', relatedPlugins: 'Plugin liên quan' }),
  pl: cloneWith(es, { blogTitle: 'Dziennik', blogCategories: 'Kategorie dziennika', all: 'Wszystko', product: 'Produkt', guides: 'Poradniki', useCases: 'Przypadki użycia', community: 'Społeczność', minRead: 'min czytania', readMore: 'Czytaj dalej →', read: 'Czytaj →', backToBlog: '← Wróć do dziennika', noEntries: 'Brak wpisów.', noPosts: 'Brak wpisów w tej kategorii.', nextStep: 'Następny krok', joinDiscord: 'Dołącz do Discorda', catalog: 'Katalog', system: 'system designu', systems: 'systemy designu', template: 'szablon', templates: 'szablony', craft: 'reguły jakości', craftRule: 'reguła jakości', plugin: 'plugin', plugins: 'pluginy', mode: 'Tryb', scenario: 'Scenariusz', platform: 'Platforma', featured: 'Wyróżnione', category: 'Kategoria', copy: 'Kopiuj', copied: 'Skopiowano', select: 'Wybierz', official: 'Oficjalne', registry: 'Rejestr', version: 'Wersja', license: 'Licencja', publisher: 'Wydawca', notSpecified: 'Nie podano', pluginId: 'ID pluginu', installFromRegistry: 'Zainstaluj z rejestru', relatedPlugins: 'Powiązane pluginy' }),
  id: cloneWith(es, { blogTitle: 'Catatan', blogCategories: 'Kategori catatan', all: 'Semua', product: 'Produk', guides: 'Panduan', useCases: 'Kasus penggunaan', community: 'Komunitas', minRead: 'menit baca', readMore: 'Baca lanjut →', read: 'Baca →', backToBlog: '← Kembali ke catatan', noEntries: 'Belum ada entri.', noPosts: 'Belum ada artikel di kategori ini.', nextStep: 'Langkah berikutnya', joinDiscord: 'Bergabung Discord', catalog: 'Katalog', system: 'sistem desain', systems: 'sistem desain', template: 'templat', templates: 'templat', craft: 'aturan craft', craftRule: 'aturan craft', plugin: 'plugin', plugins: 'plugin', mode: 'Mode kerja', scenario: 'Skenario', platform: 'Platform lokal', featured: 'Unggulan', category: 'Kategori', copy: 'Salin', copied: 'Tersalin', select: 'Pilih', official: 'Resmi', registry: 'Registri', version: 'Versi', license: 'Lisensi', publisher: 'Penerbit', notSpecified: 'Tidak disebutkan', pluginId: 'ID plugin', installFromRegistry: 'Instal dari registri', relatedPlugins: 'Plugin terkait' }),
  nl: cloneWith(de, { blogTitle: 'Logboek', blogCategories: 'Logboekcategorieën', all: 'Alles', product: 'Producten', guides: 'Gidsen', useCases: 'Gebruikssituaties', community: 'Gemeenschap', minRead: 'min leestijd', readMore: 'Lees meer →', read: 'Lees →', backToBlog: '← Terug naar logboek', noEntries: 'Nog geen items.', noPosts: 'Nog geen berichten in deze categorie.', nextStep: 'Volgende stap', joinDiscord: 'Word lid van Discord', catalog: 'Catalogus', system: 'designsysteem', systems: 'designsystemen', template: 'sjabloon', templates: 'sjablonen', craft: 'craftregels', craftRule: 'craftregel', plugin: 'plugin', plugins: 'plugins', mode: 'Werkmodus', scenario: 'Gebruiksscenario', platform: 'Platformlaag', featured: 'Uitgelicht', category: 'Categorie', copy: 'Kopieer', copied: 'Gekopieerd', select: 'Selecteer', official: 'Officieel', registry: 'Register', version: 'Versie', license: 'Licentie', publisher: 'Uitgever', notSpecified: 'Niet opgegeven', pluginId: 'Plugin-ID', installFromRegistry: 'Installeer uit register', relatedPlugins: 'Gerelateerde plugins' }),
  ar: cloneWith(es, { blogTitle: 'المدونة', blogCategories: 'تصنيفات المدونة', all: 'الكل', product: 'المنتج', guides: 'الأدلة', useCases: 'حالات الاستخدام', community: 'المجتمع', minRead: 'دقائق قراءة', readMore: 'اقرأ المزيد ←', read: 'اقرأ ←', backToBlog: '← العودة إلى المدونة', noEntries: 'لا توجد مقالات بعد.', noPosts: 'لا توجد مقالات في هذا التصنيف.', nextStep: 'الخطوة التالية', joinDiscord: 'انضم إلى Discord', catalog: 'الكتالوج', skill: 'Skill', skills: 'Skills', system: 'نظام تصميم', systems: 'أنظمة تصميم', template: 'قالب', templates: 'قوالب', craft: 'قواعد craft', craftRule: 'قاعدة craft', plugin: 'إضافة', plugins: 'إضافات', mode: 'الوضع', scenario: 'السيناريو', platform: 'المنصة', featured: 'مختار', category: 'التصنيف', copy: 'نسخ', copied: 'تم النسخ', select: 'اختيار', official: 'رسمي', registry: 'السجل', version: 'الإصدار', license: 'الرخصة', publisher: 'الناشر', notSpecified: 'غير محدد', pluginId: 'معرف الإضافة', installFromRegistry: 'تثبيت من السجل', relatedPlugins: 'إضافات مرتبطة' }),
  tr: cloneWith(es, { blogTitle: 'Günlük', blogCategories: 'Günlük kategorileri', all: 'Tümü', product: 'Ürün', guides: 'Kılavuzlar', useCases: 'Kullanım senaryoları', community: 'Topluluk', minRead: 'dk okuma', readMore: 'Devamını oku →', read: 'Oku →', backToBlog: '← Günlüğe dön', noEntries: 'Henüz kayıt yok.', noPosts: 'Bu kategoride henüz yazı yok.', nextStep: 'Sonraki adım', joinDiscord: 'Discord’a katıl', catalog: 'Katalog', system: 'tasarım sistemi', systems: 'tasarım sistemleri', template: 'şablon', templates: 'şablonlar', craft: 'craft kuralları', craftRule: 'craft kuralı', plugin: 'eklenti', plugins: 'eklentiler', mode: 'Mod', scenario: 'Senaryo', platform: 'Platform katmanı', featured: 'Öne çıkan', category: 'Kategori', copy: 'Kopyala', copied: 'Kopyalandı', select: 'Seç', official: 'Resmi', registry: 'Kayıt', version: 'Sürüm', license: 'Lisans', publisher: 'Yayıncı', notSpecified: 'Belirtilmedi', pluginId: 'Eklenti ID', installFromRegistry: 'Kayıttan kur', relatedPlugins: 'İlgili eklentiler' }),
  uk: cloneWith(es, { blogTitle: 'Журнал', blogCategories: 'Категорії журналу', all: 'Усе', product: 'Продукт', guides: 'Посібники', useCases: 'Сценарії', community: 'Спільнота', minRead: 'хв читання', readMore: 'Читати далі →', read: 'Читати →', backToBlog: '← Назад до журналу', noEntries: 'Поки немає записів.', noPosts: 'У цій категорії поки немає статей.', nextStep: 'Наступний крок', joinDiscord: 'Приєднатися до Discord', catalog: 'Каталог', system: 'дизайн-система', systems: 'дизайн-системи', template: 'шаблон', templates: 'шаблони', craft: 'правила якості', craftRule: 'правило якості', plugin: 'плагін', plugins: 'плагіни', mode: 'Режим', scenario: 'Сценарій', platform: 'Платформа', featured: 'Вибране', category: 'Категорія', copy: 'Копіювати', copied: 'Скопійовано', select: 'Вибрати', official: 'Офіційно', registry: 'Реєстр', version: 'Версія', license: 'Ліцензія', publisher: 'Видавець', notSpecified: 'Не вказано', pluginId: 'ID плагіна', installFromRegistry: 'Встановити з реєстру', relatedPlugins: 'Пов’язані плагіни' }),
};

export const EXTRA_LOCALIZED_LANDING_UI_COPY: Partial<
  Record<LandingLocaleCode, DeepPartial<LandingUiCopy>>
> = {
  zh: {
    ...make(localizeOwnedUiText('zh', SHARED.zh)),
    tutorials: zhTutorialsCopy,
  },
  'zh-tw': {
    ...make(localizeOwnedUiText('zh-tw', zhTw)),
    tutorials: zhTwTutorialsCopy,
  },
  ja: make(localizeOwnedUiText('ja', jp)),
  ko: make(localizeOwnedUiText('ko', ko)),
  de: make(localizeOwnedUiText('de', de)),
  fr: make(localizeOwnedUiText('fr', fr)),
  es: make(localizeOwnedUiText('es', es)),
  ...Object.fromEntries(
    Object.entries(simple).map(([locale, text]) => [
      locale,
      make(localizeOwnedUiText(locale as Exclude<LandingLocaleCode, 'en'>, text)),
    ]),
  ),
};
