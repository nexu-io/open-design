import { EXTRA_LOCALIZED_HOME_BODY_COPY } from './home-page-i18n';
import { EXTRA_LOCALIZED_LANDING_UI_COPY } from './landing-ui-i18n';

export const DEFAULT_LOCALE = 'en';

export const LANDING_LOCALES = [
  {
    code: 'en',
    htmlLang: 'en',
    ogLocale: 'en_US',
    label: 'English',
    shortLabel: 'EN',
    dir: 'ltr',
  },
  {
    code: 'zh',
    htmlLang: 'zh-CN',
    ogLocale: 'zh_CN',
    label: '简体中文',
    shortLabel: '简中',
    dir: 'ltr',
  },
  {
    code: 'zh-tw',
    htmlLang: 'zh-TW',
    ogLocale: 'zh_TW',
    label: '繁體中文',
    shortLabel: '繁中',
    dir: 'ltr',
  },
  {
    code: 'ja',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    label: '日本語',
    shortLabel: 'JA',
    dir: 'ltr',
  },
  {
    code: 'ko',
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    label: '한국어',
    shortLabel: 'KO',
    dir: 'ltr',
  },
  {
    code: 'de',
    htmlLang: 'de',
    ogLocale: 'de_DE',
    label: 'Deutsch',
    shortLabel: 'DE',
    dir: 'ltr',
  },
  {
    code: 'fr',
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    label: 'Français',
    shortLabel: 'FR',
    dir: 'ltr',
  },
  {
    code: 'ru',
    htmlLang: 'ru',
    ogLocale: 'ru_RU',
    label: 'Русский',
    shortLabel: 'RU',
    dir: 'ltr',
  },
  {
    code: 'es',
    htmlLang: 'es',
    ogLocale: 'es_ES',
    label: 'Español',
    shortLabel: 'ES',
    dir: 'ltr',
  },
  {
    code: 'pt-br',
    htmlLang: 'pt-BR',
    ogLocale: 'pt_BR',
    label: 'Português (BR)',
    shortLabel: 'PT-BR',
    dir: 'ltr',
  },
  {
    code: 'it',
    htmlLang: 'it',
    ogLocale: 'it_IT',
    label: 'Italiano',
    shortLabel: 'IT',
    dir: 'ltr',
  },
  {
    code: 'vi',
    htmlLang: 'vi',
    ogLocale: 'vi_VN',
    label: 'Tiếng Việt',
    shortLabel: 'VI',
    dir: 'ltr',
  },
  {
    code: 'pl',
    htmlLang: 'pl',
    ogLocale: 'pl_PL',
    label: 'Polski',
    shortLabel: 'PL',
    dir: 'ltr',
  },
  {
    code: 'id',
    htmlLang: 'id',
    ogLocale: 'id_ID',
    label: 'Bahasa Indonesia',
    shortLabel: 'ID',
    dir: 'ltr',
  },
  {
    code: 'nl',
    htmlLang: 'nl',
    ogLocale: 'nl_NL',
    label: 'Nederlands',
    shortLabel: 'NL',
    dir: 'ltr',
  },
  {
    code: 'ar',
    htmlLang: 'ar',
    ogLocale: 'ar_AR',
    label: 'العربية',
    shortLabel: 'AR',
    dir: 'rtl',
  },
  {
    code: 'tr',
    htmlLang: 'tr',
    ogLocale: 'tr_TR',
    label: 'Türkçe',
    shortLabel: 'TR',
    dir: 'ltr',
  },
  {
    code: 'uk',
    htmlLang: 'uk',
    ogLocale: 'uk_UA',
    label: 'Українська',
    shortLabel: 'UK',
    dir: 'ltr',
  },
] as const;

export type LandingLocaleCode = (typeof LANDING_LOCALES)[number]['code'];
export type LandingLocale = (typeof LANDING_LOCALES)[number];

export interface HeaderCopy {
  brandMetaTitle: string;
  brandMetaBody: string;
  nav: {
    /** Top-level dropdown grouping the four catalog facets. */
    library: string;
    /**
     * Trigger label for the Plugins dropdown. The dropdown groups Templates,
     * Skills, Systems and Craft under one parent — surfaced as "Plugins"
     * since the new `/plugins/` hub. Kept distinct from `library` so each
     * locale can pick the term that reads naturally as a button.
     */
    plugins: string;
    skills: string;
    systems: string;
    templates: string;
    craft: string;
    /** Standalone link to the YouTube tutorials channel. */
    tutorials: string;
    blog: string;
    contact: string;
  };
  download: string;
  downloadAria: string;
  downloadTitle: string;
  starAria: string;
  starTitle: string;
  starPrefix: string;
}

export interface HeaderProductMenuCopy {
  toggleNavigationMenu: string;
  product: string;
  openDesignName: string;
  openDesignBlurb: string;
  htmlAnythingName: string;
  htmlAnythingBlurb: string;
  tutorialsName: string;
  tutorialsBlurb: string;
}

export interface CommonCopy {
  topbar: {
    issue?: string;
    filedUnder: string;
    category: string;
    madeOnEarth: string;
    live: string;
    languageSwitcherLabel: string;
    languageSwitcherPrefix?: string;
  };
  header: HeaderCopy;
}

const HEADER_PRODUCT_MENU_COPY: Record<LandingLocaleCode, HeaderProductMenuCopy> = {
  en: {
    toggleNavigationMenu: 'Toggle navigation menu',
    product: 'Product',
    openDesignName: 'Open Design',
    openDesignBlurb: 'The agentic design surface: skills, systems, templates.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / data to ship-ready HTML, by your local agent.',
    tutorialsName: 'Tutorials',
    tutorialsBlurb: 'Video walkthroughs, demos, and community reviews.',
  },
  zh: {
    toggleNavigationMenu: '切换导航菜单',
    product: '产品',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agent 原生设计工作台：Skill、设计系统、模板。',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / 数据变成可交付 HTML，由本地 Agent 完成。',
    tutorialsName: '教程',
    tutorialsBlurb: '视频上手、演示与社区评测。',
  },
  'zh-tw': {
    toggleNavigationMenu: '切換導覽選單',
    product: '產品',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agent 原生設計工作台：Skill、設計系統、模板。',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / 資料變成可交付 HTML，由本地 Agent 完成。',
    tutorialsName: '教學',
    tutorialsBlurb: '影片上手、演示與社群評測。',
  },
  ja: {
    toggleNavigationMenu: 'ナビゲーションメニューを切り替え',
    product: 'プロダクト',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agent ネイティブのデザイン面: Skill、システム、テンプレート。',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / データをローカル Agent で納品可能な HTML へ。',
    tutorialsName: 'チュートリアル',
    tutorialsBlurb: '動画ガイド、デモ、コミュニティレビュー。',
  },
  ko: {
    toggleNavigationMenu: '내비게이션 메뉴 전환',
    product: '제품',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agent 네이티브 디자인 작업면: Skill, 시스템, 템플릿.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / 데이터를 로컬 Agent로 배포 가능한 HTML로 변환.',
    tutorialsName: '튜토리얼',
    tutorialsBlurb: '영상 가이드, 데모, 커뮤니티 리뷰.',
  },
  de: {
    toggleNavigationMenu: 'Navigationsmenu umschalten',
    product: 'Produkt',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agentische Designoberfläche: Skills, Systeme, Vorlagen.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / Daten werden durch deinen lokalen Agent zu fertigem HTML.',
    tutorialsName: 'Tutorials',
    tutorialsBlurb: 'Videoanleitungen, Demos und Community-Reviews.',
  },
  fr: {
    toggleNavigationMenu: 'Basculer le menu de navigation',
    product: 'Produit',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Surface de design agentique : skills, systèmes, modèles.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / données vers du HTML prêt à livrer via votre agent local.',
    tutorialsName: 'Tutoriels',
    tutorialsBlurb: 'Guides vidéo, démos et avis de la communauté.',
  },
  ru: {
    toggleNavigationMenu: 'Переключить меню навигации',
    product: 'Продукт',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agent-native дизайн-среда: skills, системы, шаблоны.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / данные в готовый HTML через локального Agent.',
    tutorialsName: 'Руководства',
    tutorialsBlurb: 'Видеоразборы, демо и обзоры сообщества.',
  },
  es: {
    toggleNavigationMenu: 'Alternar menú de navegación',
    product: 'Producto',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Superficie de diseño agentic: skills, sistemas, plantillas.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / datos a HTML listo para entregar con tu Agent local.',
    tutorialsName: 'Tutoriales',
    tutorialsBlurb: 'Guías en video, demos y reseñas de la comunidad.',
  },
  'pt-br': {
    toggleNavigationMenu: 'Alternar menu de navegação',
    product: 'Produto',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Superfície de design agentic: skills, sistemas, templates.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / dados viram HTML pronto com seu Agent local.',
    tutorialsName: 'Tutoriais',
    tutorialsBlurb: 'Guias em vídeo, demos e avaliações da comunidade.',
  },
  it: {
    toggleNavigationMenu: 'Apri o chiudi il menu di navigazione',
    product: 'Prodotto',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Superficie di design agentic: skill, sistemi, template.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / dati in HTML pronto alla consegna con il tuo Agent locale.',
    tutorialsName: 'Tutorial',
    tutorialsBlurb: 'Guide video, demo e recensioni della community.',
  },
  vi: {
    toggleNavigationMenu: 'Chuyển menu điều hướng',
    product: 'Sản phẩm',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Bề mặt thiết kế agentic: skill, hệ thống, mẫu.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / dữ liệu thành HTML sẵn sàng giao bằng Agent cục bộ.',
    tutorialsName: 'Hướng dẫn',
    tutorialsBlurb: 'Video hướng dẫn, demo và đánh giá cộng đồng.',
  },
  pl: {
    toggleNavigationMenu: 'Przełącz menu nawigacji',
    product: 'Produkt',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agentic powierzchnia projektowa: skills, systemy, szablony.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / dane do gotowego HTML przez lokalnego Agent.',
    tutorialsName: 'Poradniki',
    tutorialsBlurb: 'Wideo, dema i recenzje społeczności.',
  },
  id: {
    toggleNavigationMenu: 'Alihkan menu navigasi',
    product: 'Produk',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Ruang desain agentic: skill, sistem, template.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / data menjadi HTML siap kirim lewat Agent lokal.',
    tutorialsName: 'Tutorial',
    tutorialsBlurb: 'Panduan video, demo, dan ulasan komunitas.',
  },
  nl: {
    toggleNavigationMenu: 'Navigatiemenu wisselen',
    product: 'Product',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agentic designoppervlak: skills, systemen, templates.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / data naar opleverklare HTML via je lokale Agent.',
    tutorialsName: 'Tutorials',
    tutorialsBlurb: 'Videogidsen, demo’s en communityreviews.',
  },
  ar: {
    toggleNavigationMenu: 'تبديل قائمة التنقل',
    product: 'المنتج',
    openDesignName: 'Open Design',
    openDesignBlurb: 'مساحة تصميم وكيلة: المهارات والأنظمة والقوالب.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / البيانات إلى HTML جاهز عبر Agent المحلي.',
    tutorialsName: 'الدروس',
    tutorialsBlurb: 'شروحات فيديو وعروض وتجارب من المجتمع.',
  },
  tr: {
    toggleNavigationMenu: 'Gezinme menüsünü aç/kapat',
    product: 'Ürün',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agentic tasarım yüzeyi: skill, sistemler, şablonlar.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / veriler yerel Agent ile teslim edilebilir HTML olur.',
    tutorialsName: 'Eğitimler',
    tutorialsBlurb: 'Video anlatımlar, demolar ve topluluk incelemeleri.',
  },
  uk: {
    toggleNavigationMenu: 'Перемкнути меню навігації',
    product: 'Продукт',
    openDesignName: 'Open Design',
    openDesignBlurb: 'Agent-native дизайн-поверхня: skills, системи, шаблони.',
    htmlAnythingName: 'HTML Anything',
    htmlAnythingBlurb: 'Markdown / дані у готовий HTML через локального Agent.',
    tutorialsName: 'Навчальні матеріали',
    tutorialsBlurb: 'Відеоінструкції, демо та огляди спільноти.',
  },
};

export interface HomeSeoCopy {
  title: string;
  description: string;
}

export interface HomeFaqEntry {
  q: string;
  a: string;
}

export interface HomePageCopy {
  rail: {
    right: string;
    left: string;
  };
  hero: {
    discordAria: string;
    joinDiscord: string;
    label: string;
    issue: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleMiddle: string;
    titleSecondEmphasis: string;
    lead: (skills: string, systems: string) => string;
    star: string;
    download: string;
    plate: string;
    composedIn: string;
    stats: [
      {
        strong: string;
        text: string;
      },
      {
        strong: string;
        text: string;
      },
      {
        strong: string;
        text: string;
      },
    ];
    foot: string;
    index: [string, string, string, string];
  };
  official: {
    aria: string;
    label: string;
    items: [
      {
        label: string;
        value: string;
      },
      {
        label: string;
        value: string;
      },
      {
        label: string;
        value: string;
      },
      {
        label: string;
        value: string;
      },
      {
        label: string;
        value: string;
      },
      {
        label: string;
        value: string;
      },
    ];
  };
  about: {
    rule: string;
    volume: string;
    label: string;
    titlePrefix: string;
    titleAgent: string;
    titleMiddle: string;
    titleCollaborator: string;
    titleSuffix: string;
    lead: string;
    approach: string;
    practice: string;
    stampTop: string;
    stampBottom: string;
    sideNote: [string, string, string, string, string];
    caption: string;
  };
  capabilities: {
    rule: string;
    surfaces: string;
    ribbon: string;
    label: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleSuffix: string;
    lead: string;
    cards: [
      {
        tag: string;
        title: string;
        body: (skills: string, systems: string) => string;
        aria: string;
      },
      {
        tag: string;
        title: string;
        body: (skills: string, systems: string) => string;
        aria: string;
      },
      {
        tag: string;
        title: string;
        body: (skills: string, systems: string) => string;
        aria: string;
      },
      {
        tag: string;
        title: string;
        body: (skills: string, systems: string) => string;
        aria: string;
      },
    ];
  };
  labs: {
    rule: string;
    ongoing: (skills: string) => string;
    label: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleSuffix: string;
    pills: {
      all: string;
      prototype: string;
      deck: string;
      mobile: string;
      office: string;
    };
    metaTitle: string;
    metaBody: string;
    items: [
      {
        badge: string;
        title: string;
        body: string;
      },
      {
        badge: string;
        title: string;
        body: string;
      },
      {
        badge: string;
        title: string;
        body: string;
      },
      {
        badge: string;
        title: string;
        body: string;
      },
      {
        badge: string;
        title: string;
        body: string;
      },
    ];
    foot: (skills: string) => string;
    viewLibrary: string;
    openAria: (title: string) => string;
  };
  method: {
    rule: string;
    stages: string;
    label: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleSuffix: string;
    lead: string;
    steps: [
      {
        title: string;
        body: (skills: string, systems: string) => string;
      },
      {
        title: string;
        body: (skills: string, systems: string) => string;
      },
      {
        title: string;
        body: (skills: string, systems: string) => string;
      },
      {
        title: string;
        body: (skills: string, systems: string) => string;
      },
    ];
    footLeft: string;
  };
  work: {
    rule: string;
    editedBy: string;
    label: string;
    titlePrefix: string;
    titleEmphasisA: string;
    titleMiddle: string;
    titleEmphasisB: string;
    titleSuffix: string;
    viewAll: (skills: string) => string;
    cards: [
      {
        label: string;
        title: string;
        body: string;
        metaLeft: string;
        metaRight: string;
      },
      {
        label: string;
        title: string;
        body: string;
        metaLeft: string;
        metaRight: string;
      },
    ];
  };
  testimonial: {
    rule: string;
    shoulders: string;
    label: string;
    quote: string;
    authorName: string;
    authorTitle: string;
    partnersText: string;
    partnerLabels: [string, string, string, string, string];
    readMore: string;
  };
  faqSection: {
    rule: string;
    answers: string;
    label: string;
    titlePrefix: string;
    titleMiddle: string;
    titleSuffix: string;
  };
  cta: {
    rule: string;
    command: string;
    label: string;
    titlePrefix: string;
    titleOpen: string;
    titleMiddle: string;
    titleVisual: string;
    titleSuffix: string;
    lead: string;
    star: string;
    issue: string;
    live: string;
    ribbon: string;
  };
  footer: {
    summary: string;
    downloadAria: string;
    download: string;
    columns: {
      studio: string;
      library: string;
      connect: string;
      openDesign: string;
    };
    studioLinks: [string, string, string, string];
    connectLinks: [string, string, string, string, string];
    libraryLinks: {
      skills: (skills: string) => string;
      systems: (systems: string) => string;
      templates: string;
      craft: string;
    };
    openDesignLinks: {
      official: string;
      quickstart: string;
      agents: string;
      compare: string;
      alternative: string;
    };
    bottomLeft: string;
    bottomRightA: string;
    bottomRightB: string;
    mega: string;
  };
}

/*
 * Homepage copy uses fixed-length tuples above because the editorial layout
 * has fixed slots. That keeps missing translations visible at typecheck time.
 */
export interface LandingUiCopy {
  footer: {
    summary: string;
    catalog: string;
    openDesign: string;
    official: string;
    quickstart: string;
    agents: string;
    compare: string;
    claudeAlternative: string;
    connect: string;
    github: string;
    issues: string;
    contributors: string;
    releases: string;
    discord: string;
    rss: string;
    bottomLeft: string;
    bottomRight: string;
  };
  blog: {
    title: string;
    seoTitle: string;
    description: string;
    categoriesLabel: string;
    categories: {
      all: string;
      product: string;
      guides: string;
      useCases: string;
      community: string;
    };
    minRead: string;
    readMore: string;
    read: string;
    backToBlog: string;
    noEntries: string;
    noPostsInCategory: string;
    nextStep: string;
    joinDiscord: string;
    viewSource: string;
    cta: {
      downloadTitle: string;
      downloadBody: string;
      downloadLabel: string;
      skillsTitle: string;
      skillsBody: string;
      skillsLabel: string;
      repoTitle: string;
      repoBody: string;
      repoLabel: string;
    };
  };
  tutorials: {
    title: string;
    seoTitle: string;
    description: string;
    categoriesLabel: string;
    categories: {
      all: string;
      gettingStarted: string;
      tutorial: string;
      demo: string;
      review: string;
      community: string;
    };
    official: string;
    watch: string;
    watchCta: string;
    watchOnYouTube: string;
    openOnYouTube: string;
    backToTutorials: string;
    viewSource: string;
    noEntries: string;
    suggestVideo: string;
    noCategory: string;
    thumbnailAlt: (title: string) => string;
    detailTitle: (title: string) => string;
    localizedTitle: (title: string, author: string) => string;
    localizedSummary: (title: string, author: string, category: string) => string;
    localizedBodyHtml: (title: string, author: string, summary: string) => string;
  };
  catalog: {
    breadcrumbLabel: string;
    skills: {
      title: (count: number) => string;
      description: string;
      label: string;
      heading: (count: number) => string;
      lead: string;
      mode: string;
      scenario: string;
      platform: string;
      featured: string;
      allAria: string;
      detailTitle: (name: string) => string;
      detailFallbackDescription: (name: string) => string;
      detailLabel: string;
      featuredNumber: (rank: string) => string;
      viewOnGithub: string;
      upstream: string;
      previewCaption: (slug: string) => string;
      triggers: string;
      triggersLead: string;
      examplePrompt: string;
      related: string;
      filterTitle: (heading: string, count: number) => string;
      modeDescription: (heading: string, count: number) => string;
      scenarioDescription: (heading: string, count: number) => string;
      modeHeading: (heading: string, count: number) => string;
      scenarioHeading: (heading: string, count: number) => string;
      modeLead: (label: string) => string;
      scenarioLead: (label: string) => string;
      allSkills: (count?: number) => string;
    };
    systems: {
      title: (count: number) => string;
      description: string;
      label: string;
      heading: (count: number) => string;
      lead: string;
      category: string;
      allAria: string;
      detailTitle: (name: string) => string;
      detailFallbackDescription: (name: string, category: string) => string;
      detailLabel: string;
      viewOnGithub: string;
      paletteSample: string;
      paletteLead: (count: number) => string;
      visualTheme: string;
      related: (category: string) => string;
      categoryDescription: (heading: string, count: number) => string;
      categoryHeading: (heading: string, count: number) => string;
      categoryLead: (label: string) => string;
      allSystems: string;
    };
    templates: {
      title: (count: number) => string;
      description: string;
      label: string;
      heading: (count: number) => string;
      lead: string;
      allAria: string;
      liveArtifact: string;
      skillTemplate: string;
      detailTitle: (name: string) => string;
      detailLabel: string;
      forkOnGithub: string;
      previewCaption: string;
      whatsInside: string;
      whatsInsideLead: string;
      renderer: string;
      seedData: string;
      readme: string;
    };
    craft: {
      title: (count: number) => string;
      description: string;
      label: string;
      heading: (count: number) => string;
      lead: string;
      allAria: string;
      detailTitle: (name: string) => string;
      detailFallbackDescription: (name: string) => string;
      detailLabel: string;
      readFullRule: string;
      related: string;
    };
  };
  plugins: {
    registryTitle: string;
    registryDescription: (count: number) => string;
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
    preview: string;
    installableEntries: string;
    official: string;
    withPreview: string;
    surfaces: string;
    availableFromSources: string;
    registryEntries: string;
    searchPlugins: string;
    searchPlaceholder: string;
    filtersLabel: string;
    all: string;
    community: string;
    visiblePlugins: string;
    openDetails: (title: string) => string;
    details: string;
    detailTitle: (title: string) => string;
    detailDescription: (description: string, command: string) => string;
    detailRailRight: (id: string) => string;
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
    trustLabels: {
      official: string;
      trusted: string;
      restricted: string;
    };
    facts: {
      pluginId: string;
      version: string;
      registry: string;
      mode: string;
      license: string;
      publisher: string;
      notSpecified: string;
    };
    howItResolves: string;
    provenance: string;
    provenanceBody: string;
    capabilities: string;
    workflowSurface: string;
    directSourceFallback: string;
    examplePrompt: string;
    howPeopleUseIt: string;
    examplePromptBody: string;
    moreFrom: (registryName: string) => string;
    related: string;
  };
}

type HomeFaqTemplate = {
  q: string;
  a: string;
  official?: boolean;
};

const COMMON_COPY: Record<LandingLocaleCode, CommonCopy> = {
  en: {
    topbar: {
      issue: 'Vol. 01 / Issue Nº 26',
      filedUnder: 'Filed under',
      category: 'Design · Intelligence',
      madeOnEarth: 'Apache-2.0 · Made on Earth',
      live: 'Live',
      languageSwitcherLabel: 'Switch language',
      languageSwitcherPrefix: 'Lang',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Open / Earth',
      nav: {
        library: 'Library',
        plugins: 'Plugins',
        skills: 'Skills',
        systems: 'Systems',
        templates: 'Templates',
        craft: 'Craft',
        tutorials: 'Tutorials',
        blog: 'Blog',
        contact: 'Contact',
      },
      download: 'Download',
      downloadAria: 'Download Open Design desktop',
      downloadTitle: 'Download the desktop app',
      starAria: 'Star Open Design on GitHub',
      starTitle: 'Click to star us on GitHub',
      starPrefix: 'Star',
    },
  },
  zh: {
    topbar: {
      issue: '第 01 卷 / 第 26 期',
      filedUnder: '归档于',
      category: '设计 · 智能',
      madeOnEarth: 'Apache-2.0 · 来自地球',
      live: '在线',
      languageSwitcherLabel: '切换语言',
      languageSwitcherPrefix: '语言',
    },
    header: {
      brandMetaTitle: '工作室 Nº 01',
      brandMetaBody: '柏林 / 开放 / 地球',
      nav: {
        library: '资源库',
        plugins: '插件',
        skills: '技能',
        systems: '设计系统',
        templates: '模板',
        craft: '工艺',
        tutorials: '教程',
        blog: '博客',
        contact: '联系',
      },
      download: '下载',
      downloadAria: '下载 Open Design 桌面端',
      downloadTitle: '下载桌面应用',
      starAria: '在 GitHub 为 Open Design 点 Star',
      starTitle: '去 GitHub 点 Star',
      starPrefix: 'Star',
    },
  },
  'zh-tw': {
    topbar: {
      issue: '第 01 卷 / 第 26 期',
      filedUnder: '歸檔於',
      category: '設計 · 智能',
      madeOnEarth: 'Apache-2.0 · 來自地球',
      live: '在線',
      languageSwitcherLabel: '切換語言',
      languageSwitcherPrefix: '語言',
    },
    header: {
      brandMetaTitle: '工作室 Nº 01',
      brandMetaBody: '柏林 / 開放 / 地球',
      nav: {
        library: '資源庫',
        plugins: '外掛',
        skills: '技能',
        systems: '設計系統',
        templates: '模板',
        craft: '工藝',
        tutorials: '教程',
        blog: '部落格',
        contact: '聯絡',
      },
      download: '下載',
      downloadAria: '下載 Open Design 桌面端',
      downloadTitle: '下載桌面應用',
      starAria: '在 GitHub 為 Open Design 按 Star',
      starTitle: '去 GitHub 按 Star',
      starPrefix: 'Star',
    },
  },
  ja: {
    topbar: {
      issue: 'Vol. 01 / Issue Nº 26',
      filedUnder: '分類',
      category: 'デザイン · インテリジェンス',
      madeOnEarth: 'Apache-2.0 · 地球製',
      live: 'ライブ',
      languageSwitcherLabel: '言語を切り替え',
      languageSwitcherPrefix: '言語',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Open / Earth',
      nav: {
        library: 'ライブラリ',
        plugins: 'プラグイン',
        skills: 'スキル',
        systems: 'システム',
        templates: 'テンプレート',
        craft: 'クラフト',
        tutorials: 'チュートリアル',
        blog: 'ブログ',
        contact: '連絡',
      },
      download: 'ダウンロード',
      downloadAria: 'Open Design デスクトップをダウンロード',
      downloadTitle: 'デスクトップアプリをダウンロード',
      starAria: 'GitHub で Open Design にスター',
      starTitle: 'GitHub でスターする',
      starPrefix: 'Star',
    },
  },
  ko: {
    topbar: {
      issue: '제 01 권 / 제 26 호',
      filedUnder: '분류',
      category: '디자인 · 인텔리전스',
      madeOnEarth: 'Apache-2.0 · 지구에서 제작',
      live: '라이브',
      languageSwitcherLabel: '언어 전환',
      languageSwitcherPrefix: '언어',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Open / Earth',
      nav: {
        library: '라이브러리',
        plugins: '플러그인',
        skills: '스킬',
        systems: '시스템',
        templates: '템플릿',
        craft: '크래프트',
        tutorials: '튜토리얼',
        blog: '블로그',
        contact: '문의',
      },
      download: '다운로드',
      downloadAria: 'Open Design 데스크톱 다운로드',
      downloadTitle: '데스크톱 앱 다운로드',
      starAria: 'GitHub에서 Open Design에 스타 주기',
      starTitle: 'GitHub에서 스타 주기',
      starPrefix: 'Star',
    },
  },
  de: {
    topbar: {
      issue: 'Band 01 / Ausgabe Nº 26',
      filedUnder: 'Kategorie',
      category: 'Design · Intelligenz',
      madeOnEarth: 'Apache-2.0 · Made on Earth',
      live: 'Live',
      languageSwitcherLabel: 'Sprache wechseln',
      languageSwitcherPrefix: 'Sprache',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Offen / Erde',
      nav: {
        library: 'Bibliothek',
        plugins: 'Plugins',
        skills: 'Skills',
        systems: 'Systeme',
        templates: 'Vorlagen',
        craft: 'Gestaltung',
        tutorials: 'Tutorials',
        blog: 'Blog',
        contact: 'Kontakt',
      },
      download: 'Download',
      downloadAria: 'Open Design Desktop herunterladen',
      downloadTitle: 'Desktop-App herunterladen',
      starAria: 'Open Design auf GitHub mit Stern markieren',
      starTitle: 'Auf GitHub sternen',
      starPrefix: 'Star',
    },
  },
  fr: {
    topbar: {
      issue: 'Vol. 01 / Nº 26',
      filedUnder: 'Classé dans',
      category: 'Design · Intelligence',
      madeOnEarth: 'Apache-2.0 · Fait sur Terre',
      live: 'Live',
      languageSwitcherLabel: 'Changer de langue',
      languageSwitcherPrefix: 'Langue',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Ouvert / Terre',
      nav: {
        library: 'Bibliothèque',
        plugins: 'Plugins',
        skills: 'Skills',
        systems: 'Systèmes',
        templates: 'Modèles',
        craft: 'Conception',
        tutorials: 'Tutoriels',
        blog: 'Blog',
        contact: 'Contact',
      },
      download: 'Télécharger',
      downloadAria: 'Télécharger Open Design Desktop',
      downloadTitle: "Télécharger l'application desktop",
      starAria: 'Ajouter une étoile à Open Design sur GitHub',
      starTitle: 'Mettre une étoile sur GitHub',
      starPrefix: 'Star',
    },
  },
  ru: {
    topbar: {
      issue: 'Том 01 / Выпуск Nº 26',
      filedUnder: 'Раздел',
      category: 'Дизайн · Интеллект',
      madeOnEarth: 'Apache-2.0 · Сделано на Земле',
      live: 'Live',
      languageSwitcherLabel: 'Сменить язык',
      languageSwitcherPrefix: 'Язык',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Берлин / Open / Earth',
      nav: {
        library: 'Библиотека',
        plugins: 'Плагины',
        skills: 'Skills',
        systems: 'Системы',
        templates: 'Шаблоны',
        craft: 'Правила',
        tutorials: 'Уроки',
        blog: 'Блог',
        contact: 'Контакт',
      },
      download: 'Скачать',
      downloadAria: 'Скачать Open Design Desktop',
      downloadTitle: 'Скачать desktop-приложение',
      starAria: 'Поставить звезду Open Design на GitHub',
      starTitle: 'Поставить звезду на GitHub',
      starPrefix: 'Star',
    },
  },
  es: {
    topbar: {
      issue: 'Vol. 01 / Nº 26',
      filedUnder: 'Categoría',
      category: 'Diseño · Inteligencia',
      madeOnEarth: 'Apache-2.0 · Hecho en la Tierra',
      live: 'Live',
      languageSwitcherLabel: 'Cambiar idioma',
      languageSwitcherPrefix: 'Idioma',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlín / Abierto / Tierra',
      nav: {
        library: 'Biblioteca',
        plugins: 'Plugins',
        skills: 'Skills',
        systems: 'Sistemas',
        templates: 'Plantillas',
        craft: 'Oficio',
        tutorials: 'Tutoriales',
        blog: 'Blog',
        contact: 'Contacto',
      },
      download: 'Descargar',
      downloadAria: 'Descargar Open Design Desktop',
      downloadTitle: 'Descargar la app de escritorio',
      starAria: 'Dar Star a Open Design en GitHub',
      starTitle: 'Dar Star en GitHub',
      starPrefix: 'Star',
    },
  },
  'pt-br': {
    topbar: {
      issue: 'Vol. 01 / Nº 26',
      filedUnder: 'Categoria',
      category: 'Design · Inteligência',
      madeOnEarth: 'Apache-2.0 · Feito na Terra',
      live: 'Live',
      languageSwitcherLabel: 'Trocar idioma',
      languageSwitcherPrefix: 'Idioma',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlim / Aberto / Terra',
      nav: {
        library: 'Biblioteca',
        plugins: 'Plugins',
        skills: 'Skills',
        systems: 'Sistemas',
        templates: 'Modelos',
        craft: 'Ofício',
        tutorials: 'Tutoriais',
        blog: 'Blog',
        contact: 'Contato',
      },
      download: 'Baixar',
      downloadAria: 'Baixar Open Design Desktop',
      downloadTitle: 'Baixar o app desktop',
      starAria: 'Dar Star no Open Design no GitHub',
      starTitle: 'Dar Star no GitHub',
      starPrefix: 'Star',
    },
  },
  it: {
    topbar: {
      issue: 'Vol. 01 / Nº 26',
      filedUnder: 'Categoria',
      category: 'Design · Intelligenza',
      madeOnEarth: 'Apache-2.0 · Fatto sulla Terra',
      live: 'Live',
      languageSwitcherLabel: 'Cambia lingua',
      languageSwitcherPrefix: 'Lingua',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlino / Aperto / Terra',
      nav: {
        library: 'Libreria',
        plugins: 'Plugin',
        skills: 'Skill',
        systems: 'Sistemi',
        templates: 'Template',
        craft: 'Regole',
        tutorials: 'Tutorial',
        blog: 'Blog',
        contact: 'Contatto',
      },
      download: 'Scarica',
      downloadAria: 'Scarica Open Design Desktop',
      downloadTitle: "Scarica l'app desktop",
      starAria: 'Metti una Star a Open Design su GitHub',
      starTitle: 'Metti una Star su GitHub',
      starPrefix: 'Star',
    },
  },
  vi: {
    topbar: {
      issue: 'Tập 01 / Số Nº 26',
      filedUnder: 'Chủ đề',
      category: 'Thiết kế · Trí tuệ',
      madeOnEarth: 'Apache-2.0 · Làm trên Trái Đất',
      live: 'Live',
      languageSwitcherLabel: 'Đổi ngôn ngữ',
      languageSwitcherPrefix: 'Ngôn ngữ',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Mở / Trái Đất',
      nav: {
        library: 'Thư viện',
        plugins: 'Plugin',
        skills: 'Skill',
        systems: 'Hệ thống',
        templates: 'Mẫu',
        craft: 'Quy tắc',
        tutorials: 'Hướng dẫn',
        blog: 'Blog',
        contact: 'Liên hệ',
      },
      download: 'Tải xuống',
      downloadAria: 'Tải Open Design Desktop',
      downloadTitle: 'Tải ứng dụng desktop',
      starAria: 'Star Open Design trên GitHub',
      starTitle: 'Star trên GitHub',
      starPrefix: 'Star',
    },
  },
  pl: {
    topbar: {
      issue: 'Tom 01 / Wydanie Nº 26',
      filedUnder: 'Kategoria',
      category: 'Design · Inteligencja',
      madeOnEarth: 'Apache-2.0 · Made on Earth',
      live: 'Live',
      languageSwitcherLabel: 'Zmień język',
      languageSwitcherPrefix: 'Język',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Otwarte / Ziemia',
      nav: {
        library: 'Biblioteka',
        plugins: 'Wtyczki',
        skills: 'Skills',
        systems: 'Systemy',
        templates: 'Szablony',
        craft: 'Reguły',
        tutorials: 'Samouczki',
        blog: 'Blog',
        contact: 'Kontakt',
      },
      download: 'Pobierz',
      downloadAria: 'Pobierz Open Design Desktop',
      downloadTitle: 'Pobierz aplikację desktop',
      starAria: 'Daj gwiazdkę Open Design na GitHubie',
      starTitle: 'Daj gwiazdkę na GitHubie',
      starPrefix: 'Star',
    },
  },
  id: {
    topbar: {
      issue: 'Vol. 01 / Edisi Nº 26',
      filedUnder: 'Kategori',
      category: 'Desain · Inteligensi',
      madeOnEarth: 'Apache-2.0 · Dibuat di Bumi',
      live: 'Live',
      languageSwitcherLabel: 'Ganti bahasa',
      languageSwitcherPrefix: 'Bahasa',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Terbuka / Bumi',
      nav: {
        library: 'Pustaka',
        plugins: 'Plugin',
        skills: 'Skill',
        systems: 'Sistem',
        templates: 'Templat',
        craft: 'Aturan',
        tutorials: 'Tutorial',
        blog: 'Blog',
        contact: 'Kontak',
      },
      download: 'Unduh',
      downloadAria: 'Unduh Open Design Desktop',
      downloadTitle: 'Unduh aplikasi desktop',
      starAria: 'Beri Star Open Design di GitHub',
      starTitle: 'Beri Star di GitHub',
      starPrefix: 'Star',
    },
  },
  nl: {
    topbar: {
      issue: 'Vol. 01 / Editie Nº 26',
      filedUnder: 'Categorie',
      category: 'Design · Intelligentie',
      madeOnEarth: 'Apache-2.0 · Made on Earth',
      live: 'Live',
      languageSwitcherLabel: 'Taal wisselen',
      languageSwitcherPrefix: 'Taal',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlijn / Open / Aarde',
      nav: {
        library: 'Bibliotheek',
        plugins: 'Plug-ins',
        skills: 'Skills',
        systems: 'Systemen',
        templates: 'Sjablonen',
        craft: 'Regels',
        tutorials: 'Tutorials',
        blog: 'Blog',
        contact: 'Contact',
      },
      download: 'Download',
      downloadAria: 'Open Design Desktop downloaden',
      downloadTitle: 'Desktop-app downloaden',
      starAria: 'Geef Open Design een Star op GitHub',
      starTitle: 'Star op GitHub',
      starPrefix: 'Star',
    },
  },
  ar: {
    topbar: {
      issue: 'المجلد 01 / العدد Nº 26',
      filedUnder: 'ضمن',
      category: 'تصميم · ذكاء',
      madeOnEarth: 'Apache-2.0 · صنع على الأرض',
      live: 'مباشر',
      languageSwitcherLabel: 'تبديل اللغة',
      languageSwitcherPrefix: 'اللغة',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'برلين / مفتوح / الأرض',
      nav: {
        library: 'المكتبة',
        plugins: 'الإضافات',
        skills: 'Skills',
        systems: 'أنظمة',
        templates: 'قوالب',
        craft: 'حرفة',
        tutorials: 'الدروس',
        blog: 'المدونة',
        contact: 'تواصل',
      },
      download: 'تنزيل',
      downloadAria: 'تنزيل Open Design Desktop',
      downloadTitle: 'تنزيل تطبيق سطح المكتب',
      starAria: 'ضع نجمة لـ Open Design على GitHub',
      starTitle: 'ضع نجمة على GitHub',
      starPrefix: 'Star',
    },
  },
  tr: {
    topbar: {
      issue: 'Cilt 01 / Sayı Nº 26',
      filedUnder: 'Kategori',
      category: 'Tasarım · Zeka',
      madeOnEarth: 'Apache-2.0 · Dünya üzerinde yapıldı',
      live: 'Canlı',
      languageSwitcherLabel: 'Dili değiştir',
      languageSwitcherPrefix: 'Dil',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Berlin / Açık / Dünya',
      nav: {
        library: 'Kütüphane',
        plugins: 'Eklentiler',
        skills: 'Skill',
        systems: 'Sistemler',
        templates: 'Şablonlar',
        craft: 'Kurallar',
        tutorials: 'Eğitimler',
        blog: 'Blog',
        contact: 'İletişim',
      },
      download: 'İndir',
      downloadAria: 'Open Design Desktop indir',
      downloadTitle: 'Desktop uygulamasını indir',
      starAria: "GitHub'da Open Design'a Star ver",
      starTitle: "GitHub'da Star ver",
      starPrefix: 'Star',
    },
  },
  uk: {
    topbar: {
      issue: 'Том 01 / Випуск Nº 26',
      filedUnder: 'Розділ',
      category: 'Дизайн · Інтелект',
      madeOnEarth: 'Apache-2.0 · Зроблено на Землі',
      live: 'Live',
      languageSwitcherLabel: 'Змінити мову',
      languageSwitcherPrefix: 'Мова',
    },
    header: {
      brandMetaTitle: 'Studio Nº 01',
      brandMetaBody: 'Берлін / Open / Earth',
      nav: {
        library: 'Бібліотека',
        plugins: 'Плагіни',
        skills: 'Skills',
        systems: 'Системи',
        templates: 'Шаблони',
        craft: 'Правила',
        tutorials: 'Туторіали',
        blog: 'Блог',
        contact: 'Контакт',
      },
      download: 'Завантажити',
      downloadAria: 'Завантажити Open Design Desktop',
      downloadTitle: 'Завантажити desktop-застосунок',
      starAria: 'Поставити зірку Open Design на GitHub',
      starTitle: 'Поставити зірку на GitHub',
      starPrefix: 'Star',
    },
  },
};

const HOME_SEO_COPY: Record<LandingLocaleCode, HomeSeoCopy> = {
  en: {
    title: 'Open Design — Official open-source Claude Design alternative',
    description:
      'Open Design is the official open-source, local-first Claude Design alternative. Generate decks, landing pages, dashboards, and brand systems with Claude Code, Codex, Cursor, Gemini, OpenCode, or Qwen — driven by {skills} composable skills and {systems} portable DESIGN.md systems.',
  },
  zh: {
    title: 'Open Design —— 官方 Claude Design 开源替代',
    description:
      'Open Design 是官方的开源、本地优先 Claude Design 替代方案。用 Claude Code、Codex、Cursor、Gemini、OpenCode 或 Qwen 生成演示文稿、落地页、仪表盘和品牌系统，背后由 {skills} 个可组合 Skill 与 {systems} 套 DESIGN.md 系统驱动。',
  },
  'zh-tw': {
    title: 'Open Design —— 官方 Claude Design 開源替代',
    description:
      'Open Design 是官方的開源、本地優先 Claude Design 替代方案。用 Claude Code、Codex、Cursor、Gemini、OpenCode 或 Qwen 生成簡報、落地頁、儀表板與品牌系統，背後由 {skills} 個可組合 Skill 與 {systems} 套 DESIGN.md 系統驅動。',
  },
  ja: {
    title: 'Open Design — 公式のオープンソース Claude Design 代替',
    description:
      'Open Design は公式のオープンソースかつローカル優先の Claude Design 代替です。Claude Code、Codex、Cursor、Gemini、OpenCode、Qwen と {skills} 個のスキル、{systems} 個の DESIGN.md システムでデッキ、ランディングページ、ダッシュボード、ブランドシステムを生成します。',
  },
  ko: {
    title: 'Open Design — 공식 오픈소스 Claude Design 대안',
    description:
      'Open Design은 공식 오픈소스, 로컬 우선 Claude Design 대안입니다. Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen과 {skills}개의 조합형 스킬, {systems}개의 DESIGN.md 시스템으로 덱, 랜딩 페이지, 대시보드, 브랜드 시스템을 만듭니다.',
  },
  de: {
    title: 'Open Design — offizielle Open-Source-Alternative zu Claude Design',
    description:
      'Open Design ist die offizielle Open-Source- und Local-first-Alternative zu Claude Design. Erzeuge Decks, Landingpages, Dashboards und Brand-Systeme mit Claude Code, Codex, Cursor, Gemini, OpenCode oder Qwen — mit {skills} kombinierbaren Skills und {systems} portablen DESIGN.md-Systemen.',
  },
  fr: {
    title: "Open Design — l'alternative open source officielle à Claude Design",
    description:
      "Open Design est l'alternative officielle, open source et local-first à Claude Design. Générez des decks, landing pages, dashboards et systèmes de marque avec Claude Code, Codex, Cursor, Gemini, OpenCode ou Qwen — grâce à {skills} skills composables et {systems} systèmes DESIGN.md portables.",
  },
  ru: {
    title: 'Open Design — официальная open-source альтернатива Claude Design',
    description:
      'Open Design — официальная open-source и local-first альтернатива Claude Design. Создавайте презентации, лендинги, дашборды и бренд-системы через Claude Code, Codex, Cursor, Gemini, OpenCode или Qwen на базе {skills} skills и {systems} DESIGN.md-систем.',
  },
  es: {
    title: 'Open Design — alternativa open source oficial a Claude Design',
    description:
      'Open Design es la alternativa oficial, open source y local-first a Claude Design. Genera decks, landing pages, dashboards y sistemas de marca con Claude Code, Codex, Cursor, Gemini, OpenCode o Qwen, impulsado por {skills} skills componibles y {systems} sistemas DESIGN.md portables.',
  },
  'pt-br': {
    title: 'Open Design — alternativa open source oficial ao Claude Design',
    description:
      'Open Design é a alternativa oficial, open source e local-first ao Claude Design. Gere decks, landing pages, dashboards e sistemas de marca com Claude Code, Codex, Cursor, Gemini, OpenCode ou Qwen, usando {skills} skills combináveis e {systems} sistemas DESIGN.md portáteis.',
  },
  it: {
    title: "Open Design — l'alternativa open source ufficiale a Claude Design",
    description:
      "Open Design è l'alternativa ufficiale, open source e local-first a Claude Design. Genera deck, landing page, dashboard e sistemi di marca con Claude Code, Codex, Cursor, Gemini, OpenCode o Qwen, usando {skills} skill componibili e {systems} sistemi DESIGN.md portabili.",
  },
  vi: {
    title: 'Open Design — lựa chọn mã nguồn mở chính thức thay Claude Design',
    description:
      'Open Design là lựa chọn mã nguồn mở, local-first chính thức thay Claude Design. Tạo deck, landing page, dashboard và hệ thống thương hiệu bằng Claude Code, Codex, Cursor, Gemini, OpenCode hoặc Qwen, với {skills} skill có thể ghép và {systems} hệ DESIGN.md di động.',
  },
  pl: {
    title: 'Open Design — oficjalna open-source alternatywa dla Claude Design',
    description:
      'Open Design to oficjalna, open-source i local-first alternatywa dla Claude Design. Twórz decki, landing page, dashboardy i systemy marki z Claude Code, Codex, Cursor, Gemini, OpenCode lub Qwen, używając {skills} kompozycyjnych skills i {systems} przenośnych systemów DESIGN.md.',
  },
  id: {
    title: 'Open Design — alternatif open source resmi untuk Claude Design',
    description:
      'Open Design adalah alternatif resmi, open source, dan local-first untuk Claude Design. Buat deck, landing page, dashboard, dan sistem merek dengan Claude Code, Codex, Cursor, Gemini, OpenCode, atau Qwen, didukung {skills} skill komposable dan {systems} sistem DESIGN.md portabel.',
  },
  nl: {
    title: 'Open Design — officieel open-source alternatief voor Claude Design',
    description:
      'Open Design is het officiële open-source en local-first alternatief voor Claude Design. Maak decks, landingspagina’s, dashboards en merksystemen met Claude Code, Codex, Cursor, Gemini, OpenCode of Qwen, aangedreven door {skills} combineerbare skills en {systems} draagbare DESIGN.md-systemen.',
  },
  ar: {
    title: 'Open Design — البديل الرسمي مفتوح المصدر لـ Claude Design',
    description:
      'Open Design هو البديل الرسمي مفتوح المصدر والمحلي أولاً لـ Claude Design. أنشئ عروضاً وصفحات هبوط ولوحات بيانات وأنظمة علامة عبر Claude Code أو Codex أو Cursor أو Gemini أو OpenCode أو Qwen، مع {skills} مهارة قابلة للتركيب و {systems} نظام DESIGN.md قابل للنقل.',
  },
  tr: {
    title: "Open Design — Claude Design'ın resmi açık kaynak alternatifi",
    description:
      "Open Design, Claude Design'ın resmi, açık kaynak ve local-first alternatifidir. Claude Code, Codex, Cursor, Gemini, OpenCode veya Qwen ile deck, landing page, dashboard ve marka sistemleri üretin; {skills} birleştirilebilir skill ve {systems} taşınabilir DESIGN.md sistemiyle çalışır.",
  },
  uk: {
    title: 'Open Design — офіційна open-source альтернатива Claude Design',
    description:
      'Open Design — офіційна open-source і local-first альтернатива Claude Design. Створюйте презентації, лендинги, дашборди та бренд-системи через Claude Code, Codex, Cursor, Gemini, OpenCode або Qwen на базі {skills} skills і {systems} DESIGN.md-систем.',
  },
};

const HOME_FAQ_COPY: Record<LandingLocaleCode, HomeFaqTemplate[]> = {
  en: [
    {
      q: 'What is Open Design?',
      a: 'Open Design is the official open-source AI design workspace from the nexu-io/open-design project. It turns a local coding agent — Claude Code, Codex, Cursor, Gemini CLI, OpenCode, or Qwen — into a design engine driven by composable skills and portable DESIGN.md systems.',
    },
    {
      q: 'Is Open Design official?',
      a: 'Yes. The canonical project lives at {origin} and the source is on GitHub at {repo}. "Open Design", "OpenDesign", "open-design", and "Open Design AI" all refer to this same project.',
      official: true,
    },
    {
      q: 'How is Open Design different from Claude Design?',
      a: 'Claude Design is a hosted product tied to a single vendor. Open Design is local-first, open source under Apache-2.0, and BYOK: you bring your own agent, credentials, and DESIGN.md system.',
    },
    {
      q: 'Does Open Design run locally?',
      a: 'Yes. The desktop app, daemon, and skill runtime run on your machine. Generated artifacts land in your project directory instead of being forced through a vendor cloud.',
    },
    {
      q: 'Which coding agents does Open Design support?',
      a: 'Open Design ships 17 first-party BYOK adapters out of the box: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, Grok, Hermes, Kimi, Devin for Terminal, OpenCode, Qwen, DeepSeek, Pi, Mistral Vibe, Kiro, Kilo, and Qoder. Any adapter that speaks the same skill protocol works — switching agents is a config change, not a redesign.',
    },
    {
      q: 'Can I self-host or fork it?',
      a: 'Yes. The code is Apache-2.0. You can fork the repo, edit skills, add your own DESIGN.md systems, or run the daemon on your own machines.',
    },
    // ---- Q9+ — added after the initial 8-Q sync; non-English locales
    // will fall back to English for these entries until translators
    // catch up. Order is intentional: data-flow / cost questions first
    // (the highest evaluator concerns), then workflow / roadmap. ----
    {
      q: 'Is my data sent to Anthropic, OpenAI, or Google?',
      a: 'Only your prompt and skill context goes to whichever provider you bring keys for (BYOK). Open Design has no server of its own — the daemon talks to your provider directly. Generated artifacts land as files in your project directory, not in any vendor cloud.',
    },
    {
      q: 'Can I run Open Design without installing the CLI or desktop app?',
      a: 'Not today. Open Design is local-first by design — the minimum is a local daemon plus an agent (Claude Code, Codex, Cursor, Gemini CLI, or one of the 17 supported adapters). A hosted sandbox is on the roadmap but not the priority: artifacts in your repo beat documents in someone else\'s database.',
    },
    {
      q: 'How much does Open Design cost?',
      a: 'The product is free and Apache-2.0 — there is no Open Design subscription. You pay the API costs of whichever provider you use (Anthropic, OpenAI, Google, Mistral, xAI, Moonshot, etc.), billed directly to your account. BYOK keeps both the credentials and the spend on your side of the line.',
    },
    {
      q: 'Can I self-host Open Design on Vercel, Cloudflare, or my own server?',
      a: 'Yes. The daemon runs anywhere Node 24 runs, and the landing page is a static Astro build that deploys to Cloudflare Pages, Vercel, or Netlify as-is. Teams running shared deployments typically pin the daemon to a machine inside their network and point each developer\'s CLI at it.',
    },
    {
      q: 'How do I move my brand into Open Design?',
      a: 'Drop a screenshot or a Figma export into the web UI and ask your agent to extract a brand into a DESIGN.md file. Save that file under design-systems/<your-brand>/ in your repo; every skill then renders in that brand without re-prompting. /alternatives/claude-design/ describes the same flow in step form.',
    },
    {
      q: 'Can I switch agents without redoing my work?',
      a: 'Yes. Skills and DESIGN.md systems are agent-agnostic — the same SKILL.md file renders against Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Grok, Hermes, Qwen, or any other supported adapter. Switching agents is a config change in the daemon, not a redesign.',
    },
    {
      q: 'What\'s on the Open Design roadmap?',
      a: 'The live roadmap is at docs/roadmap.md in the GitHub repo, and weekly release notes ship through GitHub Releases. Major themes for the next quarter: more agent adapters, richer template families (3D, video, audio), and an optional shared-daemon mode for design teams.',
    },
  ],
  zh: [
    {
      q: 'Open Design 是什么？',
      a: 'Open Design 是 nexu-io/open-design 项目的官方开源 AI 设计工作台。它把本地编码 Agent（Claude Code、Codex、Cursor、Gemini CLI、OpenCode 或 Qwen）变成设计引擎，并由可组合 Skill 与可移植 DESIGN.md 系统驱动。',
    },
    {
      q: 'Open Design 是官方项目吗？',
      a: '是。官方站点是 {origin}，源代码在 GitHub：{repo}。"Open Design"、"OpenDesign"、"open-design" 和 "Open Design AI" 都指向同一个项目。',
      official: true,
    },
    {
      q: '它和 Claude Design 有什么不同？',
      a: 'Claude Design 是绑定单一厂商的云端产品。Open Design 本地优先、Apache-2.0 开源，并且 BYOK：你使用自己的 Agent、密钥和 DESIGN.md 设计系统。',
    },
    {
      q: 'Open Design 可以本地运行吗？',
      a: '可以。桌面端、daemon 和 Skill 运行时都在你的机器上运行，生成的 artifact 会落在你的项目目录里。',
    },
    {
      q: '支持哪些编码 Agent？',
      a: '支持 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Qwen，以及遵循同一 Skill 协议的其它适配器。',
    },
    {
      q: '可以自托管或 fork 吗？',
      a: '可以。代码采用 Apache-2.0 协议，你可以 fork 仓库、编辑 Skill、添加自己的 DESIGN.md 系统，或在自己的机器上运行 daemon。',
    },
  ],
  'zh-tw': [
    {
      q: 'Open Design 是什麼？',
      a: 'Open Design 是 nexu-io/open-design 專案的官方開源 AI 設計工作台。它把本地 coding agent（Claude Code、Codex、Cursor、Gemini CLI、OpenCode 或 Qwen）變成設計引擎，並由可組合 Skill 與可攜式 DESIGN.md 系統驅動。',
    },
    {
      q: 'Open Design 是官方專案嗎？',
      a: '是。官方站點是 {origin}，原始碼在 GitHub：{repo}。"Open Design"、"OpenDesign"、"open-design" 與 "Open Design AI" 都指同一個專案。',
      official: true,
    },
    {
      q: '它和 Claude Design 有什麼不同？',
      a: 'Claude Design 是綁定單一供應商的雲端產品。Open Design 本地優先、Apache-2.0 開源，並且 BYOK：你使用自己的 agent、密鑰與 DESIGN.md 設計系統。',
    },
    {
      q: 'Open Design 可以本地執行嗎？',
      a: '可以。桌面端、daemon 與 Skill runtime 都在你的機器上執行，生成的 artifact 會落在你的專案目錄。',
    },
    {
      q: '支援哪些 coding agent？',
      a: '支援 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Qwen，以及遵循同一 Skill 協議的其他 adapter。',
    },
    {
      q: '可以自架或 fork 嗎？',
      a: '可以。程式碼採 Apache-2.0，你可以 fork repo、編輯 Skill、加入自己的 DESIGN.md 系統，或在自己的機器上跑 daemon。',
    },
  ],
  ja: [
    {
      q: 'Open Design とは何ですか？',
      a: 'Open Design は nexu-io/open-design プロジェクト公式のオープンソース AI デザインワークスペースです。Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Qwen などのローカル coding agent を、スキルと DESIGN.md システムで動くデザインエンジンにします。',
    },
    {
      q: 'Open Design は公式ですか？',
      a: 'はい。公式サイトは {origin}、ソースコードは GitHub の {repo} です。"Open Design"、"OpenDesign"、"open-design"、"Open Design AI" は同じプロジェクトを指します。',
      official: true,
    },
    {
      q: 'Claude Design と何が違いますか？',
      a: 'Claude Design は単一ベンダーに紐づくホスト型製品です。Open Design はローカル優先、Apache-2.0 のオープンソース、BYOK で、自分の agent、鍵、DESIGN.md を使います。',
    },
    {
      q: 'ローカルで動きますか？',
      a: 'はい。デスクトップアプリ、daemon、スキル runtime はすべて自分のマシン上で動き、生成物はプロジェクトディレクトリに保存されます。',
    },
    {
      q: '対応している coding agent は？',
      a: 'Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Qwen と、同じ skill protocol を話す adapter に対応します。',
    },
    {
      q: 'セルフホストや fork はできますか？',
      a: 'できます。Apache-2.0 のコードなので、repo を fork し、skill を編集し、独自の DESIGN.md システムを追加できます。',
    },
  ],
  ko: [
    {
      q: 'Open Design은 무엇인가요?',
      a: 'Open Design은 nexu-io/open-design 프로젝트의 공식 오픈소스 AI 디자인 워크스페이스입니다. Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen 같은 로컬 coding agent를 조합형 skill과 DESIGN.md 시스템으로 구동되는 디자인 엔진으로 바꿉니다.',
    },
    {
      q: 'Open Design은 공식 프로젝트인가요?',
      a: '네. 공식 사이트는 {origin}이고 소스는 GitHub의 {repo}에 있습니다. "Open Design", "OpenDesign", "open-design", "Open Design AI"는 같은 프로젝트를 가리킵니다.',
      official: true,
    },
    {
      q: 'Claude Design과 무엇이 다른가요?',
      a: 'Claude Design은 단일 벤더에 묶인 호스팅 제품입니다. Open Design은 로컬 우선, Apache-2.0 오픈소스, BYOK이며 사용자의 agent, 키, DESIGN.md 시스템을 그대로 씁니다.',
    },
    {
      q: '로컬에서 실행되나요?',
      a: '네. 데스크톱 앱, daemon, skill runtime이 모두 사용자 컴퓨터에서 실행되고 생성 artifact는 프로젝트 디렉터리에 저장됩니다.',
    },
    {
      q: '어떤 coding agent를 지원하나요?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen 및 같은 skill protocol을 사용하는 adapter를 지원합니다.',
    },
    {
      q: '셀프호스팅이나 fork가 가능한가요?',
      a: '가능합니다. Apache-2.0 코드라 repo를 fork하고, skill을 편집하고, 자체 DESIGN.md 시스템을 추가할 수 있습니다.',
    },
  ],
  de: [
    {
      q: 'Was ist Open Design?',
      a: 'Open Design ist der offizielle Open-Source-AI-Design-Workspace des Projekts nexu-io/open-design. Es macht lokale Coding-Agents wie Claude Code, Codex, Cursor, Gemini CLI, OpenCode oder Qwen zu einer Design-Engine auf Basis von Skills und DESIGN.md-Systemen.',
    },
    {
      q: 'Ist Open Design offiziell?',
      a: 'Ja. Die kanonische Website ist {origin}, der Quellcode liegt auf GitHub unter {repo}. "Open Design", "OpenDesign", "open-design" und "Open Design AI" meinen dasselbe Projekt.',
      official: true,
    },
    {
      q: 'Worin unterscheidet es sich von Claude Design?',
      a: 'Claude Design ist ein gehostetes Produkt eines einzelnen Anbieters. Open Design ist local-first, Apache-2.0 Open Source und BYOK: Sie bringen Agent, Schlüssel und DESIGN.md-System selbst mit.',
    },
    {
      q: 'Läuft Open Design lokal?',
      a: 'Ja. Desktop-App, Daemon und Skill-Runtime laufen auf Ihrem Rechner. Generierte Artifacts landen in Ihrem Projektverzeichnis.',
    },
    {
      q: 'Welche Coding-Agents werden unterstützt?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen und weitere Adapter mit demselben Skill-Protokoll.',
    },
    {
      q: 'Kann ich es selbst hosten oder forken?',
      a: 'Ja. Der Code ist Apache-2.0. Sie können das Repo forken, Skills bearbeiten, eigene DESIGN.md-Systeme hinzufügen oder den Daemon selbst betreiben.',
    },
  ],
  fr: [
    {
      q: "Qu'est-ce qu'Open Design ?",
      a: "Open Design est l'espace de travail officiel et open source du projet nexu-io/open-design. Il transforme un agent local — Claude Code, Codex, Cursor, Gemini CLI, OpenCode ou Qwen — en moteur de design piloté par des skills composables et des systèmes DESIGN.md portables.",
    },
    {
      q: 'Open Design est-il officiel ?',
      a: 'Oui. Le site canonique est {origin} et le code source est sur GitHub à {repo}. "Open Design", "OpenDesign", "open-design" et "Open Design AI" désignent le même projet.',
      official: true,
    },
    {
      q: 'Quelle différence avec Claude Design ?',
      a: 'Claude Design est un produit hébergé lié à un fournisseur unique. Open Design est local-first, open source Apache-2.0 et BYOK : vous apportez votre agent, vos clés et votre système DESIGN.md.',
    },
    {
      q: 'Open Design fonctionne-t-il en local ?',
      a: 'Oui. L’app desktop, le daemon et le runtime de skills tournent sur votre machine, et les artifacts générés restent dans votre répertoire de projet.',
    },
    {
      q: 'Quels agents de coding sont supportés ?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen et les autres adaptateurs qui parlent le même protocole de skills.',
    },
    {
      q: "Puis-je l'auto-héberger ou le forker ?",
      a: 'Oui. Le code est Apache-2.0. Vous pouvez forker le repo, modifier les skills, ajouter vos systèmes DESIGN.md ou exécuter le daemon sur vos machines.',
    },
  ],
  ru: [
    {
      q: 'Что такое Open Design?',
      a: 'Open Design — официальный open-source AI design workspace проекта nexu-io/open-design. Он превращает локальный coding agent — Claude Code, Codex, Cursor, Gemini CLI, OpenCode или Qwen — в design-движок на базе composable skills и переносимых DESIGN.md-систем.',
    },
    {
      q: 'Open Design официальный?',
      a: 'Да. Канонический сайт — {origin}, исходный код — на GitHub: {repo}. "Open Design", "OpenDesign", "open-design" и "Open Design AI" обозначают один проект.',
      official: true,
    },
    {
      q: 'Чем он отличается от Claude Design?',
      a: 'Claude Design — hosted-продукт одного вендора. Open Design — local-first, Apache-2.0 open source и BYOK: вы используете своего agent, свои ключи и свою DESIGN.md-систему.',
    },
    {
      q: 'Open Design запускается локально?',
      a: 'Да. Desktop app, daemon и skill runtime работают на вашей машине, а generated artifacts сохраняются в папку проекта.',
    },
    {
      q: 'Какие coding agents поддерживаются?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen и другие adapters, которые говорят на том же skill protocol.',
    },
    {
      q: 'Можно self-host или fork?',
      a: 'Да. Код Apache-2.0. Можно fork-нуть repo, менять skills, добавлять свои DESIGN.md-системы и запускать daemon на своих машинах.',
    },
  ],
  es: [
    {
      q: '¿Qué es Open Design?',
      a: 'Open Design es el workspace oficial y open source de IA de diseño del proyecto nexu-io/open-design. Convierte un coding agent local — Claude Code, Codex, Cursor, Gemini CLI, OpenCode o Qwen — en un motor de diseño con skills componibles y sistemas DESIGN.md portables.',
    },
    {
      q: '¿Open Design es oficial?',
      a: 'Sí. El sitio canónico es {origin} y el código fuente está en GitHub en {repo}. "Open Design", "OpenDesign", "open-design" y "Open Design AI" apuntan al mismo proyecto.',
      official: true,
    },
    {
      q: '¿En qué se diferencia de Claude Design?',
      a: 'Claude Design es un producto alojado ligado a un solo proveedor. Open Design es local-first, open source Apache-2.0 y BYOK: usas tu propio agent, claves y sistema DESIGN.md.',
    },
    {
      q: '¿Open Design corre localmente?',
      a: 'Sí. La app desktop, el daemon y el runtime de skills corren en tu máquina. Los artifacts generados quedan en tu directorio de proyecto.',
    },
    {
      q: '¿Qué coding agents soporta?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen y otros adaptadores que hablen el mismo protocolo de skills.',
    },
    {
      q: '¿Puedo autoalojarlo o hacer fork?',
      a: 'Sí. El código es Apache-2.0. Puedes hacer fork del repo, editar skills, añadir sistemas DESIGN.md propios o ejecutar el daemon en tus máquinas.',
    },
  ],
  'pt-br': [
    {
      q: 'O que é Open Design?',
      a: 'Open Design é o workspace oficial, open source, de design com IA do projeto nexu-io/open-design. Ele transforma um coding agent local — Claude Code, Codex, Cursor, Gemini CLI, OpenCode ou Qwen — em um motor de design movido por skills componíveis e sistemas DESIGN.md portáteis.',
    },
    {
      q: 'Open Design é oficial?',
      a: 'Sim. O site canônico é {origin} e o código-fonte está no GitHub em {repo}. "Open Design", "OpenDesign", "open-design" e "Open Design AI" apontam para o mesmo projeto.',
      official: true,
    },
    {
      q: 'Qual a diferença para o Claude Design?',
      a: 'Claude Design é um produto hospedado preso a um fornecedor. Open Design é local-first, open source Apache-2.0 e BYOK: você traz seu agent, suas chaves e seu sistema DESIGN.md.',
    },
    {
      q: 'Open Design roda localmente?',
      a: 'Sim. O app desktop, o daemon e o runtime de skills rodam na sua máquina, e os artifacts gerados ficam no diretório do projeto.',
    },
    {
      q: 'Quais coding agents são suportados?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen e outros adaptadores que falam o mesmo protocolo de skills.',
    },
    {
      q: 'Posso auto-hospedar ou fazer fork?',
      a: 'Sim. O código é Apache-2.0. Você pode fazer fork do repo, editar skills, adicionar seus sistemas DESIGN.md ou rodar o daemon nas suas máquinas.',
    },
  ],
  it: [
    {
      q: "Cos'è Open Design?",
      a: 'Open Design è il workspace ufficiale e open source di AI design del progetto nexu-io/open-design. Trasforma un coding agent locale — Claude Code, Codex, Cursor, Gemini CLI, OpenCode o Qwen — in un motore di design guidato da skill componibili e sistemi DESIGN.md portabili.',
    },
    {
      q: 'Open Design è ufficiale?',
      a: 'Sì. Il sito canonico è {origin} e il codice sorgente è su GitHub in {repo}. "Open Design", "OpenDesign", "open-design" e "Open Design AI" indicano lo stesso progetto.',
      official: true,
    },
    {
      q: 'In cosa differisce da Claude Design?',
      a: 'Claude Design è un prodotto hosted legato a un solo vendor. Open Design è local-first, open source Apache-2.0 e BYOK: usi il tuo agent, le tue chiavi e il tuo sistema DESIGN.md.',
    },
    {
      q: 'Open Design gira in locale?',
      a: "Sì. App desktop, daemon e runtime delle skill girano sulla tua macchina. Gli artifact generati restano nella directory del progetto.",
    },
    {
      q: 'Quali coding agent supporta?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen e altri adapter che parlano lo stesso protocollo di skill.',
    },
    {
      q: 'Posso self-hostarlo o fare fork?',
      a: 'Sì. Il codice è Apache-2.0. Puoi fare fork del repo, modificare le skill, aggiungere sistemi DESIGN.md o eseguire il daemon sui tuoi server.',
    },
  ],
  vi: [
    {
      q: 'Open Design là gì?',
      a: 'Open Design là workspace thiết kế AI mã nguồn mở chính thức của dự án nexu-io/open-design. Nó biến coding agent chạy trên máy bạn — Claude Code, Codex, Cursor, Gemini CLI, OpenCode hoặc Qwen — thành engine thiết kế dựa trên skill ghép được và hệ DESIGN.md di động.',
    },
    {
      q: 'Open Design có phải dự án chính thức không?',
      a: 'Có. Trang canonical là {origin}, mã nguồn ở GitHub: {repo}. "Open Design", "OpenDesign", "open-design" và "Open Design AI" đều chỉ cùng một dự án.',
      official: true,
    },
    {
      q: 'Khác gì Claude Design?',
      a: 'Claude Design là sản phẩm hosted gắn với một nhà cung cấp. Open Design local-first, open source Apache-2.0 và BYOK: bạn dùng agent, key và hệ DESIGN.md của chính mình.',
    },
    {
      q: 'Open Design chạy local được không?',
      a: 'Có. Ứng dụng desktop, daemon và skill runtime chạy trên máy bạn. Artifact tạo ra nằm trong thư mục dự án của bạn.',
    },
    {
      q: 'Hỗ trợ coding agent nào?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen và adapter khác dùng cùng skill protocol.',
    },
    {
      q: 'Có thể self-host hoặc fork không?',
      a: 'Có. Mã nguồn Apache-2.0. Bạn có thể fork repo, sửa skill, thêm hệ DESIGN.md riêng hoặc chạy daemon trên máy của mình.',
    },
  ],
  pl: [
    {
      q: 'Czym jest Open Design?',
      a: 'Open Design to oficjalny, open-source workspace AI design projektu nexu-io/open-design. Zamienia lokalnego coding agenta — Claude Code, Codex, Cursor, Gemini CLI, OpenCode albo Qwen — w silnik designu oparty o kompozycyjne skills i przenośne systemy DESIGN.md.',
    },
    {
      q: 'Czy Open Design jest oficjalne?',
      a: 'Tak. Kanoniczna strona to {origin}, a kod źródłowy jest na GitHubie: {repo}. "Open Design", "OpenDesign", "open-design" i "Open Design AI" oznaczają ten sam projekt.',
      official: true,
    },
    {
      q: 'Czym różni się od Claude Design?',
      a: 'Claude Design to hostowany produkt jednego dostawcy. Open Design jest local-first, open source Apache-2.0 i BYOK: używasz własnego agenta, kluczy i systemu DESIGN.md.',
    },
    {
      q: 'Czy Open Design działa lokalnie?',
      a: 'Tak. Aplikacja desktop, daemon i runtime skills działają na Twojej maszynie, a wygenerowane artifacts trafiają do katalogu projektu.',
    },
    {
      q: 'Jakie coding agents są wspierane?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen i inne adaptery używające tego samego skill protocol.',
    },
    {
      q: 'Czy mogę self-hostować albo zrobić fork?',
      a: 'Tak. Kod jest Apache-2.0. Możesz forkować repo, edytować skills, dodawać własne systemy DESIGN.md lub uruchomić daemon u siebie.',
    },
  ],
  id: [
    {
      q: 'Apa itu Open Design?',
      a: 'Open Design adalah workspace AI design resmi dan open source dari proyek nexu-io/open-design. Ia mengubah coding agent lokal — Claude Code, Codex, Cursor, Gemini CLI, OpenCode, atau Qwen — menjadi mesin desain berbasis skill komposable dan sistem DESIGN.md portabel.',
    },
    {
      q: 'Apakah Open Design resmi?',
      a: 'Ya. Situs canonical ada di {origin} dan source code ada di GitHub: {repo}. "Open Design", "OpenDesign", "open-design", dan "Open Design AI" merujuk ke proyek yang sama.',
      official: true,
    },
    {
      q: 'Apa bedanya dengan Claude Design?',
      a: 'Claude Design adalah produk hosted yang terikat pada satu vendor. Open Design local-first, open source Apache-2.0, dan BYOK: Anda memakai agent, key, dan sistem DESIGN.md sendiri.',
    },
    {
      q: 'Apakah Open Design berjalan lokal?',
      a: 'Ya. Aplikasi desktop, daemon, dan skill runtime berjalan di mesin Anda. Artifact yang dibuat masuk ke direktori proyek Anda.',
    },
    {
      q: 'Coding agent apa yang didukung?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen, dan adapter lain yang memakai skill protocol yang sama.',
    },
    {
      q: 'Bisakah self-host atau fork?',
      a: 'Bisa. Kodenya Apache-2.0. Anda bisa fork repo, mengedit skill, menambah sistem DESIGN.md sendiri, atau menjalankan daemon di mesin Anda.',
    },
  ],
  nl: [
    {
      q: 'Wat is Open Design?',
      a: 'Open Design is de officiële open-source AI design workspace van het project nexu-io/open-design. Het verandert een lokale coding agent — Claude Code, Codex, Cursor, Gemini CLI, OpenCode of Qwen — in een design-engine met combineerbare skills en draagbare DESIGN.md-systemen.',
    },
    {
      q: 'Is Open Design officieel?',
      a: 'Ja. De canonieke site is {origin} en de broncode staat op GitHub: {repo}. "Open Design", "OpenDesign", "open-design" en "Open Design AI" verwijzen naar hetzelfde project.',
      official: true,
    },
    {
      q: 'Wat is het verschil met Claude Design?',
      a: 'Claude Design is een hosted product van één leverancier. Open Design is local-first, Apache-2.0 open source en BYOK: je gebruikt je eigen agent, sleutels en DESIGN.md-systeem.',
    },
    {
      q: 'Draait Open Design lokaal?',
      a: 'Ja. De desktop-app, daemon en skill runtime draaien op je eigen machine. Gegenereerde artifacts komen in je projectdirectory terecht.',
    },
    {
      q: 'Welke coding agents worden ondersteund?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen en andere adapters die hetzelfde skill protocol spreken.',
    },
    {
      q: 'Kan ik self-hosten of forken?',
      a: 'Ja. De code is Apache-2.0. Je kunt de repo forken, skills aanpassen, eigen DESIGN.md-systemen toevoegen of de daemon zelf draaien.',
    },
  ],
  ar: [
    {
      q: 'ما هو Open Design؟',
      a: 'Open Design هو مساحة عمل تصميم بالذكاء الاصطناعي رسمية ومفتوحة المصدر من مشروع nexu-io/open-design. يحوّل coding agent محلياً مثل Claude Code أو Codex أو Cursor أو Gemini CLI أو OpenCode أو Qwen إلى محرك تصميم يعمل عبر skills قابلة للتركيب وأنظمة DESIGN.md قابلة للنقل.',
    },
    {
      q: 'هل Open Design رسمي؟',
      a: 'نعم. الموقع canonical هو {origin} والمصدر على GitHub في {repo}. تشير "Open Design" و"OpenDesign" و"open-design" و"Open Design AI" إلى المشروع نفسه.',
      official: true,
    },
    {
      q: 'ما الفرق عن Claude Design؟',
      a: 'Claude Design منتج مستضاف مرتبط بمورّد واحد. Open Design محلي أولاً، مفتوح المصدر وفق Apache-2.0، وBYOK: تستخدم agent ومفاتيحك ونظام DESIGN.md الخاص بك.',
    },
    {
      q: 'هل يعمل Open Design محلياً؟',
      a: 'نعم. تطبيق سطح المكتب والdaemon وskill runtime تعمل على جهازك، والartifacts الناتجة تحفظ في مجلد مشروعك.',
    },
    {
      q: 'ما هي coding agents المدعومة؟',
      a: 'Claude Code وCodex وCursor وGemini CLI وOpenCode وQwen وأي adapter يستخدم skill protocol نفسه.',
    },
    {
      q: 'هل يمكنني الاستضافة الذاتية أو عمل fork؟',
      a: 'نعم. الكود Apache-2.0. يمكنك fork للrepo، تعديل skills، إضافة أنظمة DESIGN.md، أو تشغيل الdaemon على أجهزتك.',
    },
  ],
  tr: [
    {
      q: 'Open Design nedir?',
      a: "Open Design, nexu-io/open-design projesinin resmi açık kaynak AI design workspace'idir. Claude Code, Codex, Cursor, Gemini CLI, OpenCode veya Qwen gibi yerel coding agent'ları, birleştirilebilir skill'ler ve taşınabilir DESIGN.md sistemleriyle çalışan bir tasarım motoruna dönüştürür.",
    },
    {
      q: 'Open Design resmi mi?',
      a: 'Evet. Kanonik site {origin}, kaynak kod GitHub üzerinde {repo}. "Open Design", "OpenDesign", "open-design" ve "Open Design AI" aynı projeyi anlatır.',
      official: true,
    },
    {
      q: "Claude Design'dan farkı ne?",
      a: 'Claude Design tek bir vendor’a bağlı hosted bir üründür. Open Design local-first, Apache-2.0 açık kaynak ve BYOK’tur: kendi agent’ını, anahtarlarını ve DESIGN.md sistemini kullanırsın.',
    },
    {
      q: 'Open Design yerelde çalışır mı?',
      a: 'Evet. Desktop app, daemon ve skill runtime kendi makinenizde çalışır. Üretilen artifact’ler proje dizininize düşer.',
    },
    {
      q: 'Hangi coding agent’lar desteklenir?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen ve aynı skill protocol’ü konuşan diğer adapter’lar.',
    },
    {
      q: 'Self-host veya fork mümkün mü?',
      a: 'Evet. Kod Apache-2.0. Repo’yu fork edebilir, skill’leri düzenleyebilir, kendi DESIGN.md sistemlerinizi ekleyebilir veya daemon’ı kendi makinelerinizde çalıştırabilirsiniz.',
    },
  ],
  uk: [
    {
      q: 'Що таке Open Design?',
      a: 'Open Design — офіційний open-source AI design workspace проєкту nexu-io/open-design. Він перетворює локальний coding agent — Claude Code, Codex, Cursor, Gemini CLI, OpenCode або Qwen — на design-двигун із composable skills і переносними DESIGN.md-системами.',
    },
    {
      q: 'Open Design офіційний?',
      a: 'Так. Канонічний сайт — {origin}, вихідний код на GitHub: {repo}. "Open Design", "OpenDesign", "open-design" і "Open Design AI" означають один проєкт.',
      official: true,
    },
    {
      q: 'Чим він відрізняється від Claude Design?',
      a: 'Claude Design — hosted-продукт одного вендора. Open Design — local-first, Apache-2.0 open source і BYOK: ви використовуєте свого agent, свої ключі та свою DESIGN.md-систему.',
    },
    {
      q: 'Open Design запускається локально?',
      a: 'Так. Desktop app, daemon і skill runtime працюють на вашій машині, а generated artifacts зберігаються в папку проєкту.',
    },
    {
      q: 'Які coding agents підтримуються?',
      a: 'Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen та інші adapters, які говорять тим самим skill protocol.',
    },
    {
      q: 'Можна self-host або fork?',
      a: 'Так. Код Apache-2.0. Можна fork-нути repo, змінювати skills, додавати власні DESIGN.md-системи й запускати daemon на своїх машинах.',
    },
  ],
};

const HOME_PAGE_COPY_EN: HomePageCopy = {
  rail: {
    right: 'Open Design — Vol. 01 · Issue Nº 26 · Apache-2.0',
    left: 'Skills · Systems · Agents · BYOK · Local-first',
  },
  hero: {
    discordAria: 'Join the Open Design Discord',
    joinDiscord: 'Join Discord',
    label: 'Open-source design studio',
    issue: 'Nº 01',
    titlePrefix: 'Open-source',
    titleEmphasis: 'Claude Design,',
    titleMiddle: 'running on',
    titleSecondEmphasis: 'your own agent',
    lead: (skills, systems) =>
      `Open Design is the official, local-first alternative to Claude Design. Your existing coding agent — Claude Code · Codex · Cursor · Gemini · OpenCode · Qwen — becomes the design engine, driven by ${skills} composable skills and ${systems} portable DESIGN.md systems.`,
    star: 'Star us on GitHub',
    download: 'Download desktop',
    plate: 'Plate Nº 08',
    composedIn: 'Composed in',
    stats: [
      { strong: 'skills', text: 'shippable' },
      { strong: 'systems', text: 'portable' },
      { strong: 'CLIs', text: 'BYO agent' },
    ],
    foot: 'pnpm tools-dev · 3 commands to start',
    index: ['Detect', 'Discover', 'Direct', 'Deliver'],
  },
  official: {
    aria: 'Official Open Design sources',
    label: 'Official source',
    items: [
      { label: 'Official site', value: 'open-design.ai' },
      { label: 'Source', value: 'nexu-io/open-design' },
      { label: 'Releases', value: 'version' },
      { label: 'Download', value: 'Desktop · macOS · Win · Linux' },
      { label: 'Docs', value: 'README + /quickstart/' },
      { label: 'Community', value: 'Discord' },
    ],
  },
  about: {
    rule: 'About / Manifesto',
    volume: 'Open Design / Volume 01',
    label: 'About the studio',
    titlePrefix: 'We treat',
    titleAgent: 'your agent',
    titleMiddle: 'as a creative',
    titleCollaborator: 'collaborator,',
    titleSuffix: 'not a black box',
    lead:
      'The strongest coding agents already live on your laptop. We don’t ship one — we wire them into a skill-driven design workflow that runs locally with pnpm tools-dev, deploys the web layer to Vercel, and stays BYOK at every layer.',
    approach: 'Read our approach',
    practice: 'Research · Design · Engineering · Repeat',
    stampTop: 'Studio practice',
    stampBottom: 'Est. MMXXVI',
    sideNote: ['From model behavior', 'to visual taste, we', 'prototype the full', 'stack of creative', 'systems.'],
    caption: 'Studies in form · perception · machine imagination. (Open Design, MMXXVI)',
  },
  capabilities: {
    rule: 'Capabilities · Skills · Systems',
    surfaces: '4 surfaces / 1 loop',
    ribbon: 'OPEN DESIGN · CAPABILITIES MATRIX · OD/26',
    label: 'Capabilities',
    titlePrefix: 'Skills, systems, and surfaces',
    titleEmphasis: 'for creative',
    titleSuffix: 'intelligence',
    lead:
      'We blend human taste with whichever agent you already trust to ship interfaces, decks, and editorial pages that feel intentional, expressive, and alive.',
    cards: [
      {
        tag: 'Skills',
        title: 'Skills,\nnot plugins',
        body: (skills) =>
          `${skills} file-based SKILL.md bundles. Drop a folder in, restart the daemon, it appears.`,
        aria: 'Browse all skills on GitHub',
      },
      {
        tag: 'Systems',
        title: 'Design Systems\nas Markdown',
        body: (_skills, systems) =>
          `${systems} portable DESIGN.md systems — Linear, Vercel, Stripe, Apple, Cursor, Figma…`,
        aria: 'Browse all design systems on GitHub',
      },
      {
        tag: 'Adapters',
        title: '12 Agent\nAdapters',
        body: () =>
          'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen — auto-detected on $PATH.',
        aria: 'Read the agent adapter source on GitHub',
      },
      {
        tag: 'BYOK',
        title: 'BYOK\nat every layer',
        body: () =>
          'OpenAI-compatible proxy. DeepSeek, Groq, OpenRouter, your self-hosted vLLM — paste a baseUrl + key, ship.',
        aria: 'See BYOK setup on GitHub',
      },
    ],
  },
  labs: {
    rule: 'Labs / Skills Catalog',
    ongoing: (skills) => `05 of ${skills} ongoing`,
    label: 'Labs',
    titlePrefix: 'A living archive of',
    titleEmphasis: 'experiments',
    titleSuffix: 'in skills, decks, and machine-made form',
    pills: {
      all: 'All',
      prototype: 'Prototype',
      deck: 'Deck',
      mobile: 'Mobile',
      office: 'Office',
    },
    metaTitle: 'Ongoing experiments',
    metaBody: 'documenting ideas in flux\nbuilding intelligence\nthrough making',
    items: [
      {
        badge: 'Deck',
        title: 'Magazine Decks',
        body: 'Editorial-grade slide decks with guizang-ppt. Magazine layout, WebGL hero.',
      },
      {
        badge: 'Media',
        title: 'Synthetic Matter',
        body: 'Gpt-image-2 + Seedance + HyperFrames. Image, video, audio — same chat surface as code.',
      },
      {
        badge: 'Loop',
        title: 'Prompt Choreography',
        body: 'The interactive question form pops before a single pixel is improvised. 30s of radios beats 30min of redirects.',
      },
      {
        badge: 'Critique',
        title: 'Visual Reasoning',
        body: '5-dim self-critique gates every artifact: philosophy · hierarchy · execution · specificity · restraint.',
      },
      {
        badge: 'Runtime',
        title: 'Soft Systems',
        body: 'Sandboxed iframe preview. Streaming todos. Real-cwd filesystem. Adaptive loops between human and machine.',
      },
    ],
    foot: (skills) => `05 / ${skills} SKILLS`,
    viewLibrary: 'VIEW FULL LIBRARY →',
    openAria: (title) => `Open ${title} on GitHub`,
  },
  method: {
    rule: 'Method / Loop',
    stages: '04 stages, iterative',
    label: 'Method',
    titlePrefix: 'From',
    titleEmphasis: 'signals',
    titleSuffix: 'to systems',
    lead:
      'Every stage is iterative, visual, and research-driven — composable files, not opaque prompts.',
    steps: [
      {
        title: 'Detect',
        body: (skills, systems) =>
          `The daemon scans your $PATH for 12 coding agents and auto-loads ${skills} skills + ${systems} systems on boot.`,
      },
      {
        title: 'Discover',
        body: () =>
          'Turn 1 is a question form — surface, audience, tone, scale, brand context. Locked in 30 seconds.',
      },
      {
        title: 'Direct',
        body: () =>
          'Pick one of 5 deterministic visual directions. Palette in OKLch, font stack, layout posture cues.',
      },
      {
        title: 'Deliver',
        body: () =>
          'The agent writes to disk, you preview in a sandboxed iframe, export HTML / PDF / PPTX / ZIP / Markdown.',
      },
    ],
    footLeft: 'Skills inform everything. Files make it real.',
  },
  work: {
    rule: 'Selected Work · 2026 Catalog',
    editedBy: 'Edited by Open Design',
    label: 'Selected work',
    titlePrefix: 'Skills that turn briefs into',
    titleEmphasisA: 'memorable',
    titleMiddle: 'shippable',
    titleEmphasisB: 'artifacts',
    titleSuffix: '',
    viewAll: (skills) => `View all ${skills} skills`,
    cards: [
      {
        label: 'Featured skill',
        title: 'guizang-ppt',
        body: 'Magazine-style web PPT for product launches and pitch decks. Bundled verbatim, original LICENSE preserved.',
        metaLeft: '2026 · DECK',
        metaRight: 'DEFAULT',
      },
      {
        label: 'Companion system',
        title: 'kami',
        body: 'An editorial paper system. Warm parchment canvas, ink-blue accent, serif-led hierarchy — multilingual by design (EN · zh-CN · ja).',
        metaLeft: '2026 · PAPER',
        metaRight: 'SYSTEM',
      },
    ],
  },
  testimonial: {
    rule: 'Collaborators / Lineage',
    shoulders: 'Standing on shoulders',
    label: 'Collaborators',
    quote:
      '“Open Design helped us turn vague AI ideas into a visual system that felt sharp, believable, and genuinely new.”',
    authorName: 'Mina Kovac',
    authorTitle: 'Creative Director · North Form',
    partnersText:
      'Standing on the shoulders of teams shipping open-source design culture.',
    partnerLabels: ['Philosophy', 'Decks', 'UX', 'Terminal', 'Frames'],
    readMore: 'Read more stories',
  },
  faqSection: {
    rule: 'Frequently asked',
    answers: 'Official answers, no marketing fluff',
    label: 'Open Design 常见问题',
    titlePrefix: 'Questions about',
    titleMiddle: 'and the',
    titleSuffix: 'open-source Claude Design alternative',
  },
  cta: {
    rule: 'Contact / Conversation',
    command: 'Three commands to ship',
    label: 'Start a conversation',
    titlePrefix: 'Let’s build something',
    titleOpen: 'open',
    titleMiddle: 'and',
    titleVisual: 'visually',
    titleSuffix: 'unforgettable',
    lead:
      'Star us on GitHub, drop into the issues, or run pnpm tools-dev tonight. Three commands and the loop is yours.',
    star: 'Star on GitHub',
    issue: 'Open an issue',
    live: 'Live',
    ribbon: 'OPEN DESIGN · FIN.',
  },
  footer: {
    summary:
      'The open-source alternative to Claude Design. Built on the shoulders of huashu-design, guizang-ppt, multica-ai, and open-codesign.',
    downloadAria: 'Download the Open Design desktop app',
    download: 'Download desktop',
    columns: {
      studio: 'Studio',
      library: 'Library',
      connect: 'Connect',
      openDesign: 'Open Design',
    },
    studioLinks: ['Capabilities', 'Labs', 'Method', 'Manifesto'],
    connectLinks: ['GitHub', 'Issues', 'Contributors', 'Releases', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} Skill-Bundles`,
      systems: (systems) => `${systems} Systems`,
      templates: 'Templates',
      craft: 'Craft',
    },
    openDesignLinks: {
      official: 'Official source',
      quickstart: 'Quickstart',
      agents: 'Agents locaux',
      compare: 'Compare',
      alternative: 'Claude Design alternative',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volume 01 / Issue Nº 26',
    bottomRightA: 'Berlin / Open / Earth',
    bottomRightB: '52.5200° N · 13.4050° E',
    mega: 'Open Design.',
  },
};

const HOME_PAGE_COPY: Partial<Record<LandingLocaleCode, HomePageCopy>> = {
  en: HOME_PAGE_COPY_EN,
  zh: {
    rail: {
      right: 'Open Design — 第 01 卷 · 第 26 期 · Apache-2.0',
      left: 'Skills · 设计系统 · Agents · BYOK · 本地优先',
    },
    hero: {
      discordAria: '加入 Open Design Discord',
      joinDiscord: '加入 Discord',
      label: '开源设计工作室',
      issue: 'Nº 01',
      titlePrefix: '开源的',
      titleEmphasis: 'Claude Design',
      titleMiddle: '运行在',
      titleSecondEmphasis: '你自己的 Agent 上',
      lead: (skills, systems) =>
        `Open Design 是官方、本地优先的 Claude Design 替代方案。你现有的编码 Agent —— Claude Code · Codex · Cursor · Gemini · OpenCode · Qwen —— 会变成设计引擎，并由 ${skills} 个可组合 Skill 与 ${systems} 套可移植 DESIGN.md 系统驱动。`,
      star: '在 GitHub 点 Star',
      download: '下载桌面端',
      plate: '图版 Nº 08',
      composedIn: '由',
      stats: [
        { strong: 'Skill', text: '可交付' },
        { strong: '系统', text: '可移植' },
        { strong: 'CLI', text: '自带 Agent' },
      ],
      foot: 'pnpm tools-dev · 3 条命令启动',
      index: ['检测', '发现', '指挥', '交付'],
    },
    official: {
      aria: 'Open Design 官方来源',
      label: '官方来源',
      items: [
        { label: '官方网站', value: 'open-design.ai' },
        { label: '源码', value: 'nexu-io/open-design' },
        { label: '版本发布', value: 'version' },
        { label: '下载', value: '桌面端 · macOS · Win · Linux' },
        { label: '文档', value: 'README + /quickstart/' },
        { label: '社区', value: 'Discord' },
      ],
    },
    about: {
      rule: '关于 / 宣言',
      volume: 'Open Design / 第 01 卷',
      label: '关于工作室',
      titlePrefix: '我们把',
      titleAgent: '你的 Agent',
      titleMiddle: '当成创意',
      titleCollaborator: '协作者，',
      titleSuffix: '而不是黑盒',
      lead:
        '最强的编码 Agent 已经在你的电脑上。我们不再交付另一个封闭 Agent，而是把它们接入 Skill 驱动的设计工作流：本地用 pnpm tools-dev 运行，Web 层可部署到 Vercel，并且每一层都保持 BYOK。',
      approach: '阅读我们的做法',
      practice: '研究 · 设计 · 工程 · 循环',
      stampTop: '工作室实践',
      stampBottom: '始于 MMXXVI',
      sideNote: ['从模型行为', '到视觉品味，', '我们原型化', '完整的创意', '系统栈。'],
      caption: '形式 · 感知 · 机器想象力研究。（Open Design，MMXXVI）',
    },
    capabilities: {
      rule: '能力 · Skill · 系统',
      surfaces: '4 个表面 / 1 个循环',
      ribbon: 'OPEN DESIGN · 能力矩阵 · OD/26',
      label: '能力',
      titlePrefix: 'Skill、系统与界面',
      titleEmphasis: '服务于创意',
      titleSuffix: '智能',
      lead:
        '我们把人的品味与你已经信任的 Agent 结合起来，用来交付界面、演示文稿和编辑型页面，让产物显得有意图、有表达、也有生命力。',
      cards: [
        {
          tag: 'Skills',
          title: 'Skill，\n不是插件',
          body: (skills) =>
            `${skills} 个基于文件的 SKILL.md 包。把文件夹放进去，重启 daemon，它就会出现。`,
          aria: '在 GitHub 浏览全部 Skill',
        },
        {
          tag: 'Systems',
          title: '用 Markdown\n描述设计系统',
          body: (_skills, systems) =>
            `${systems} 套可移植 DESIGN.md 系统 —— Linear、Vercel、Stripe、Apple、Cursor、Figma……`,
          aria: '在 GitHub 浏览全部设计系统',
        },
        {
          tag: 'Adapters',
          title: '12 个 Agent\n适配器',
          body: () =>
            'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen —— 自动从 $PATH 检测。',
          aria: '阅读 Agent 适配器源码',
        },
        {
          tag: 'BYOK',
          title: '每一层\n都 BYOK',
          body: () =>
            'OpenAI 兼容代理。DeepSeek、Groq、OpenRouter、你自托管的 vLLM —— 填 baseUrl + key 就能交付。',
          aria: '在 GitHub 查看 BYOK 配置',
        },
      ],
    },
    labs: {
      rule: '实验室 / Skill 目录',
      ongoing: (skills) => `${skills} 个 Skill 中的 05 个进行中`,
      label: '实验室',
      titlePrefix: '一个持续生长的',
      titleEmphasis: '实验档案',
      titleSuffix: '覆盖 Skill、演示文稿与机器生成的形式',
      pills: {
        all: '全部',
        prototype: '原型',
        deck: '演示',
        mobile: '移动端',
        office: '办公',
      },
      metaTitle: '进行中的实验',
      metaBody: '记录仍在变化的想法\n在制作中构建智能\n让实践推动判断',
      items: [
        {
          badge: '演示',
          title: '杂志式演示文稿',
          body: '用 guizang-ppt 生成编辑级幻灯片。杂志版式，WebGL hero。',
        },
        {
          badge: '媒体',
          title: '合成物质',
          body: 'Gpt-image-2 + Seedance + HyperFrames。图像、视频、音频 —— 和代码在同一个聊天界面里。',
        },
        {
          badge: '循环',
          title: '提示词编舞',
          body: '在生成任何像素之前先弹出交互式问题表单。30 秒单选题，胜过 30 分钟来回改方向。',
        },
        {
          badge: '批评',
          title: '视觉推理',
          body: '5 维自评守住每个 artifact：理念 · 层级 · 执行 · 具体性 · 克制。',
        },
        {
          badge: '运行时',
          title: '柔性系统',
          body: '沙盒 iframe 预览、流式 todo、真实 cwd 文件系统，以及人和机器之间的自适应循环。',
        },
      ],
      foot: (skills) => `05 / ${skills} 个 SKILL`,
      viewLibrary: '查看完整库 →',
      openAria: (title) => `在 GitHub 打开 ${title}`,
    },
    method: {
      rule: '方法 / 循环',
      stages: '04 个阶段，持续迭代',
      label: '方法',
      titlePrefix: '从',
      titleEmphasis: '信号',
      titleSuffix: '到系统',
      lead: '每个阶段都是迭代式、视觉化、研究驱动的 —— 用可组合文件，而不是不透明提示词。',
      steps: [
        {
          title: '检测',
          body: (skills, systems) =>
            `daemon 会扫描你的 $PATH，寻找 12 个编码 Agent，并在启动时自动加载 ${skills} 个 Skill + ${systems} 套系统。`,
        },
        {
          title: '发现',
          body: () =>
            '第 1 轮先问问题：产物表面、受众、语气、规模、品牌上下文。30 秒锁定方向。',
        },
        {
          title: '指挥',
          body: () =>
            '从 5 个确定性的视觉方向中选择一个。OKLch 调色板、字体栈、版式姿态一起确定。',
        },
        {
          title: '交付',
          body: () =>
            'Agent 写入磁盘，你在沙盒 iframe 里预览，并导出 HTML / PDF / PPTX / ZIP / Markdown。',
        },
      ],
      footLeft: 'Skill 告诉系统该做什么。文件让结果变成真实。',
    },
    work: {
      rule: '精选作品 · 2026 目录',
      editedBy: 'Open Design 编辑',
      label: '精选作品',
      titlePrefix: '把 brief 变成',
      titleEmphasisA: '难忘',
      titleMiddle: '且可交付的',
      titleEmphasisB: 'artifact',
      titleSuffix: '的 Skill',
      viewAll: (skills) => `查看全部 ${skills} 个 Skill`,
      cards: [
        {
          label: '精选 Skill',
          title: 'guizang-ppt',
          body: '面向产品发布和融资路演的杂志式 Web PPT。原样打包，保留原始 LICENSE。',
          metaLeft: '2026 · 演示',
          metaRight: '默认',
        },
        {
          label: '配套系统',
          title: 'kami',
          body: '一个编辑纸张系统。温暖羊皮纸画布、墨蓝强调色、以衬线字体驱动的层级 —— 从设计上支持多语言（EN · zh-CN · ja）。',
          metaLeft: '2026 · 纸张',
          metaRight: '系统',
        },
      ],
    },
    testimonial: {
      rule: '协作者 / 来源脉络',
      shoulders: '站在前人的肩膀上',
      label: '协作者',
      quote: '“Open Design 帮我们把模糊的 AI 想法变成了一个视觉系统：锋利、可信，而且真的有新意。”',
      authorName: 'Mina Kovac',
      authorTitle: '创意总监 · North Form',
      partnersText: '站在那些持续交付开源设计文化的团队肩膀上。',
      partnerLabels: ['理念', '演示', 'UX', '终端', '帧'],
      readMore: '阅读更多故事',
    },
    faqSection: {
      rule: '常见问题',
      answers: '官方回答，没有营销废话',
      label: 'Open Design 常見問題',
      titlePrefix: '关于',
      titleMiddle: '以及',
      titleSuffix: 'Claude Design 开源替代方案的问题',
    },
    cta: {
      rule: '联系 / 对话',
      command: '三条命令开始交付',
      label: '开始对话',
      titlePrefix: '一起构建一些',
      titleOpen: '开放',
      titleMiddle: '而且',
      titleVisual: '视觉上',
      titleSuffix: '难忘的东西',
      lead:
        '在 GitHub 点 Star，进入 issues，或者今晚运行 pnpm tools-dev。三条命令，这个循环就属于你。',
      star: '在 GitHub 点 Star',
      issue: '提交 issue',
      live: '在线',
      ribbon: 'OPEN DESIGN · 完。',
    },
    footer: {
      summary:
        'Claude Design 的开源替代方案。站在 huashu-design、guizang-ppt、multica-ai 和 open-codesign 的肩膀上构建。',
      downloadAria: '下载 Open Design 桌面应用',
      download: '下载桌面端',
      columns: {
        studio: '工作室',
        library: '资源库',
        connect: '连接',
        openDesign: 'Open Design',
    },
    studioLinks: ['能力', '实验室', '方法', '宣言'],
    connectLinks: ['GitHub', '议题', '贡献者', '版本发布', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} 个 Skill`,
      systems: (systems) => `${systems} 套系统`,
      templates: '模板',
        craft: '工艺',
      },
      openDesignLinks: {
        official: '官方来源',
        quickstart: '快速开始',
        agents: 'Agent',
        compare: '对比',
        alternative: 'Claude Design 替代方案',
      },
      bottomLeft: 'Open Design · Apache-2.0 · 2026 / 第 01 卷 / 第 26 期',
      bottomRightA: '柏林 / 开放 / 地球',
      bottomRightB: '52.5200° N · 13.4050° E',
      mega: 'Open Design.',
    },
  },
};

HOME_PAGE_COPY['zh-tw'] = {
  ...HOME_PAGE_COPY.zh!,
  rail: {
    right: 'Open Design — 第 01 卷 · 第 26 期 · Apache-2.0',
    left: 'Skills · 設計系統 · Agents · BYOK · 本地優先',
  },
  hero: {
    ...HOME_PAGE_COPY.zh!.hero,
    label: '開源設計工作室',
    titlePrefix: '開源的',
    titleEmphasis: 'Claude Design',
    titleMiddle: '運行在',
    titleSecondEmphasis: '你自己的 Agent 上',
    lead: (skills, systems) =>
      `Open Design 是官方、本地優先的 Claude Design 替代方案。你現有的 coding agent —— Claude Code · Codex · Cursor · Gemini · OpenCode · Qwen —— 會變成設計引擎，並由 ${skills} 個可組合 Skill 與 ${systems} 套可攜式 DESIGN.md 系統驅動。`,
    star: '在 GitHub 點 Star',
    download: '下載桌面端',
    plate: '圖版 Nº 08',
    composedIn: '由',
    stats: [
      { strong: 'Skill', text: '可交付' },
      { strong: '系統', text: '可攜' },
      { strong: 'CLI', text: '自帶 Agent' },
    ],
    foot: 'pnpm tools-dev · 3 條命令啟動',
    index: ['偵測', '發現', '指揮', '交付'],
  },
  official: {
    ...HOME_PAGE_COPY.zh!.official,
    label: '官方來源',
    items: [
      { label: '官方網站', value: 'open-design.ai' },
      { label: '原始碼', value: 'nexu-io/open-design' },
      { label: '版本發布', value: 'version' },
      { label: '下載', value: '桌面端 · macOS · Win · Linux' },
      { label: '文件', value: 'README + /quickstart/' },
      { label: '社群', value: 'Discord' },
    ],
  },
  about: {
    ...HOME_PAGE_COPY.zh!.about,
    rule: '關於 / 宣言',
    volume: 'Open Design / 第 01 卷',
    label: '關於工作室',
    titlePrefix: '我們把',
    titleAgent: '你的 Agent',
    titleMiddle: '當成創意',
    titleCollaborator: '協作者，',
    titleSuffix: '而不是黑盒',
    lead:
      '最強的 coding agent 已經在你的電腦上。我們不再交付另一個封閉 Agent，而是把它們接入 Skill 驅動的設計工作流：本地用 pnpm tools-dev 執行，Web 層可部署到 Vercel，並且每一層都保持 BYOK。',
    approach: '閱讀我們的做法',
    practice: '研究 · 設計 · 工程 · 循環',
    stampBottom: '始於 MMXXVI',
    sideNote: ['從模型行為', '到視覺品味，', '我們原型化', '完整的創意', '系統棧。'],
    caption: '形式 · 感知 · 機器想像力研究。（Open Design，MMXXVI）',
  },
  capabilities: {
    ...HOME_PAGE_COPY.zh!.capabilities,
    rule: '能力 · Skill · 系統',
    ribbon: 'OPEN DESIGN · 能力矩陣 · OD/26',
    titlePrefix: 'Skill、系統與介面',
    titleEmphasis: '服務於創意',
    titleSuffix: '智能',
    lead:
      '我們把人的品味與你已經信任的 Agent 結合起來，用來交付介面、簡報與編輯型頁面，讓產物顯得有意圖、有表達、也有生命力。',
    cards: [
      {
        tag: 'Skills',
        title: 'Skill，\n不是外掛',
        body: (skills) =>
          `${skills} 個基於檔案的 SKILL.md 包。把資料夾放進去，重啟 daemon，它就會出現。`,
        aria: '在 GitHub 瀏覽全部 Skill',
      },
      {
        tag: 'Systems',
        title: '用 Markdown\n描述設計系統',
        body: (_skills, systems) =>
          `${systems} 套可攜式 DESIGN.md 系統 —— Linear、Vercel、Stripe、Apple、Cursor、Figma……`,
        aria: '在 GitHub 瀏覽全部設計系統',
      },
      {
        tag: 'Adapters',
        title: '12 個 Agent\n適配器',
        body: () =>
          'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen —— 自動從 $PATH 偵測。',
        aria: '閱讀 Agent 適配器原始碼',
      },
      {
        tag: 'BYOK',
        title: '每一層\n都 BYOK',
        body: () =>
          'OpenAI 相容代理。DeepSeek、Groq、OpenRouter、你自架的 vLLM —— 填 baseUrl + key 就能交付。',
        aria: '在 GitHub 查看 BYOK 設定',
      },
    ],
  },
  labs: {
    ...HOME_PAGE_COPY.zh!.labs,
    rule: '實驗室 / Skill 目錄',
    ongoing: (skills) => `${skills} 個 Skill 中的 05 個進行中`,
    label: '實驗室',
    titlePrefix: '一個持續生長的',
    titleEmphasis: '實驗檔案',
    titleSuffix: '涵蓋 Skill、簡報與機器生成的形式',
    pills: {
      all: '全部',
      prototype: '原型',
      deck: '簡報',
      mobile: '行動端',
      office: '辦公',
    },
    metaBody: '記錄仍在變化的想法\n在製作中構建智能\n讓實踐推動判斷',
    items: [
      {
        badge: '簡報',
        title: '雜誌式簡報',
        body: '用 guizang-ppt 生成編輯級投影片。雜誌版式，WebGL hero。',
      },
      {
        badge: '媒體',
        title: '合成物質',
        body: 'Gpt-image-2 + Seedance + HyperFrames。圖像、影片、音訊 —— 和程式碼在同一個聊天介面裡。',
      },
      {
        badge: '循環',
        title: '提示詞編舞',
        body: '在生成任何像素之前先彈出互動式問題表單。30 秒單選題，勝過 30 分鐘來回改方向。',
      },
      {
        badge: '批評',
        title: '視覺推理',
        body: '5 維自評守住每個 artifact：理念 · 層級 · 執行 · 具體性 · 克制。',
      },
      {
        badge: '執行時',
        title: '柔性系統',
        body: '沙盒 iframe 預覽、串流 todo、真實 cwd 檔案系統，以及人和機器之間的自適應循環。',
      },
    ],
    foot: (skills) => `05 / ${skills} 個 SKILL`,
    viewLibrary: '查看完整庫 →',
    openAria: (title) => `在 GitHub 打開 ${title}`,
  },
  method: {
    ...HOME_PAGE_COPY.zh!.method,
    rule: '方法 / 循環',
    stages: '04 個階段，持續迭代',
    titlePrefix: '從',
    titleEmphasis: '信號',
    titleSuffix: '到系統',
    lead: '每個階段都是迭代式、視覺化、研究驅動的 —— 用可組合檔案，而不是不透明提示詞。',
    steps: [
      {
        title: '偵測',
        body: (skills, systems) =>
          `daemon 會掃描你的 $PATH，尋找 12 個 coding agent，並在啟動時自動載入 ${skills} 個 Skill + ${systems} 套系統。`,
      },
      {
        title: '發現',
        body: () =>
          '第 1 輪先問問題：產物表面、受眾、語氣、規模、品牌上下文。30 秒鎖定方向。',
      },
      {
        title: '指揮',
        body: () =>
          '從 5 個確定性的視覺方向中選擇一個。OKLch 調色盤、字體棧、版式姿態一起確定。',
      },
      {
        title: '交付',
        body: () =>
          'Agent 寫入磁碟，你在沙盒 iframe 裡預覽，並匯出 HTML / PDF / PPTX / ZIP / Markdown。',
      },
    ],
    footLeft: 'Skill 告訴系統該做什麼。檔案讓結果變成真實。',
  },
  work: {
    ...HOME_PAGE_COPY.zh!.work,
    rule: '精選作品 · 2026 目錄',
    editedBy: 'Open Design 編輯',
    label: '精選作品',
    titlePrefix: '把 brief 變成',
    titleEmphasisA: '難忘',
    titleMiddle: '且可交付的',
    titleEmphasisB: 'artifact',
    titleSuffix: '的 Skill',
    viewAll: (skills) => `查看全部 ${skills} 個 Skill`,
    cards: [
      {
        label: '精選 Skill',
        title: 'guizang-ppt',
        body: '面向產品發布和募資簡報的雜誌式 Web PPT。原樣打包，保留原始 LICENSE。',
        metaLeft: '2026 · 簡報',
        metaRight: '預設',
      },
      {
        label: '配套系統',
        title: 'kami',
        body: '一個編輯紙張系統。溫暖羊皮紙畫布、墨藍強調色、以襯線字體驅動的層級 —— 從設計上支援多語言（EN · zh-CN · ja）。',
        metaLeft: '2026 · 紙張',
        metaRight: '系統',
      },
    ],
  },
  testimonial: {
    ...HOME_PAGE_COPY.zh!.testimonial,
    rule: '協作者 / 來源脈絡',
    shoulders: '站在前人的肩膀上',
    label: '協作者',
    quote: '“Open Design 幫我們把模糊的 AI 想法變成了一個視覺系統：鋒利、可信，而且真的有新意。”',
    authorTitle: '創意總監 · North Form',
    partnersText: '站在那些持續交付開源設計文化的團隊肩膀上。',
    partnerLabels: ['理念', '簡報', 'UX', '終端', '影格'],
    readMore: '閱讀更多故事',
  },
  faqSection: {
    ...HOME_PAGE_COPY.zh!.faqSection,
    rule: '常見問題',
    answers: '官方回答，沒有行銷廢話',
    titlePrefix: '關於',
    titleMiddle: '以及',
    titleSuffix: 'Claude Design 開源替代方案的問題',
  },
  cta: {
    ...HOME_PAGE_COPY.zh!.cta,
    rule: '聯絡 / 對話',
    command: '三條命令開始交付',
    label: '開始對話',
    titlePrefix: '一起構建一些',
    titleOpen: '開放',
    titleMiddle: '而且',
    titleVisual: '視覺上',
    titleSuffix: '難忘的東西',
    lead:
      '在 GitHub 點 Star，進入 issues，或者今晚執行 pnpm tools-dev。三條命令，這個循環就屬於你。',
    star: '在 GitHub 點 Star',
    issue: '提交 issue',
    live: '在線',
    ribbon: 'OPEN DESIGN · 完。',
  },
  footer: {
    ...HOME_PAGE_COPY.zh!.footer,
    summary:
      'Claude Design 的開源替代方案。站在 huashu-design、guizang-ppt、multica-ai 和 open-codesign 的肩膀上構建。',
    downloadAria: '下載 Open Design 桌面應用',
    download: '下載桌面端',
    columns: {
      studio: '工作室',
      library: '資源庫',
      connect: '連結',
      openDesign: 'Open Design',
    },
    studioLinks: ['能力', '實驗室', '方法', '宣言'],
    connectLinks: ['GitHub', '議題', '貢獻者', '版本發布', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} 個 Skill`,
      systems: (systems) => `${systems} 套系統`,
      templates: '模板',
      craft: '工藝',
    },
    openDesignLinks: {
      official: '官方來源',
      quickstart: '快速開始',
      agents: 'Agent',
      compare: '比較',
      alternative: 'Claude Design 替代方案',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / 第 01 卷 / 第 26 期',
    bottomRightA: '柏林 / 開放 / 地球',
  },
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const LANDING_UI_COPY: LandingUiCopy = {
  footer: {
    summary:
      'The official open-source, local-first alternative to Claude Design. Apache-2.0, BYOK at every layer.',
    catalog: 'Catalog',
    openDesign: 'Open Design',
    official: 'Official source page',
    quickstart: 'Quickstart',
    agents: 'Agents locaux',
    compare: 'Compare',
    claudeAlternative: 'Claude Design alternative',
    connect: 'Connect',
    github: 'GitHub',
    issues: 'Issues',
    contributors: 'Contributors',
    releases: 'Releases',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volume 01 / Issue Nº 26',
    bottomRight: 'Berlin / Open / Earth · 52.5200° N · 13.4050° E',
  },
  blog: {
    title: 'Blog',
    seoTitle: 'Blog — Open Design',
    description:
      'Notes to help you understand, explore, and build with Open Design — across product, guides, use cases, and community.',
    categoriesLabel: 'Blog categories',
    categories: {
      all: 'All',
      product: 'Product',
      guides: 'Guides',
      useCases: 'Use cases',
      community: 'Community',
    },
    minRead: 'min read',
    readMore: 'Read more →',
    read: 'Read →',
    backToBlog: '← Back to Blog',
    noEntries: 'No entries yet. Check back soon.',
    noPostsInCategory: 'No posts in this category yet. More field notes are coming.',
    nextStep: 'Next step',
    joinDiscord: 'Join Discord',
    viewSource: 'View source on GitHub ↗',
    cta: {
      downloadTitle: 'Download the desktop build',
      downloadBody:
        'Take the open-source design workspace for a spin, inspect the release notes on GitHub, or join our Discord for live community feedback.',
      downloadLabel: 'Download desktop ↗',
      skillsTitle: 'Run the skill workflow locally',
      skillsBody:
        'Browse the workflow library, pick a starting point, and wire it into the agent you already use. Join our Discord if you want help adapting it.',
      skillsLabel: 'Browse workflows ↗',
      repoTitle: 'See the implementation on GitHub',
      repoBody:
        'Open the repository to inspect the source, star the project, fork the workflow, or join our Discord to discuss what should land next.',
      repoLabel: 'Open repository ↗',
    },
  },
  tutorials: {
    title: 'Tutorials',
    seoTitle: 'Tutorials — Open Design',
    description:
      'Watch Open Design from the inside — getting-started walkthroughs, plugin tutorials, demos, and community deep-dives, curated from YouTube and embedded for in-page playback.',
    categoriesLabel: 'Tutorial categories',
    categories: {
      all: 'All',
      gettingStarted: 'Getting started',
      tutorial: 'Tutorials',
      demo: 'Demos',
      review: 'Reviews',
      community: 'Community',
    },
    official: 'Official',
    watch: 'Watch',
    watchCta: 'Watch →',
    watchOnYouTube: 'Watch on YouTube ↗',
    openOnYouTube: 'Open on YouTube ↗',
    backToTutorials: '← Back to Tutorials',
    viewSource: 'View source on GitHub ↗',
    noEntries: "No tutorials yet. We're curating the first batch — check back soon, or",
    suggestVideo: 'suggest a video',
    noCategory: 'No tutorials in this category yet. More are on the way.',
    thumbnailAlt: (title) => `Thumbnail for ${title}`,
    detailTitle: (title) => `${title} — Open Design Tutorials`,
    localizedTitle: (title) => title,
    localizedSummary: (_title, _author, summary) => summary,
    localizedBodyHtml: (_title, _author, summary) => `<p>${summary}</p>`,
  },
  catalog: {
    breadcrumbLabel: 'Breadcrumb',
    skills: {
      title: (count) => `Skills — ${count} composable design capabilities | Open Design`,
      description:
        'Browse the full Open Design skills catalog: 100+ file-based SKILL.md bundles spanning decks, prototypes, dashboards, mobile flows, video, and live artifacts. Each skill is a folder you drop into the daemon.',
      label: 'Catalog · Nº 01',
      heading: (count) => `Skills — ${count} composable design capabilities.`,
      lead:
        'Each skill is a single folder with one SKILL.md. Drop it in, restart the daemon, the picker shows it. Filter by surface, scenario, or platform below to find the one that matches your brief.',
      mode: 'Mode',
      scenario: 'Scenario',
      platform: 'Platform',
      featured: 'Featured',
      allAria: 'All skills',
      detailTitle: (name) => `${name} — Open Design skill`,
      detailFallbackDescription: (name) => `Open Design skill bundle: ${name}.`,
      detailLabel: 'Skill',
      featuredNumber: (rank) => `· Featured Nº ${rank}`,
      viewOnGithub: 'View on GitHub',
      upstream: 'Upstream',
      previewCaption: (slug) => `Rendered from skills/${slug}/example.html`,
      triggers: 'Triggers',
      triggersLead:
        'The picker matches these prompts to the skill. Copy one and adapt it to your brief.',
      examplePrompt: 'Example prompt',
      related: 'Related skills',
      filterTitle: (heading, count) =>
        `${heading} skills — ${count} Open Design ${heading.toLowerCase()} agents`,
      modeDescription: (heading, count) =>
        `Every Open Design skill that produces ${heading.toLowerCase()} artifacts. ${count} ready-to-run, system-aware agents — installable through the daemon, brand-locked through any DESIGN.md system.`,
      scenarioDescription: (heading, count) =>
        `Every Open Design skill in the ${heading.toLowerCase()} scenario. ${count} ready-to-run agents covering decks, prototypes, templates, and live artifacts — all brand-locked through any DESIGN.md.`,
      modeHeading: (heading, count) =>
        `${heading} — ${count} brand-grade ${heading.toLowerCase()} agents.`,
      scenarioHeading: (heading, count) =>
        `${heading} — ${count} ${heading.toLowerCase()} skills.`,
      modeLead: (label) =>
        `Filtered to od.mode: ${label}. Every skill below reads the active DESIGN.md as a system prompt, so it inherits colors, type, and spacing from any portable system you pair it with.`,
      scenarioLead: (label) =>
        `Filtered to od.scenario: ${label}. Pair any of these with a portable design system and the daemon orchestrates the rest — one prompt, one branded artifact.`,
      allSkills: (count) => `← All skills${typeof count === 'number' ? ` (${count} of total)` : ''}`,
    },
    systems: {
      title: (count) => `Design Systems — ${count} portable visual systems | Open Design`,
      description:
        'Browse the full Open Design design systems catalog: 100+ DESIGN.md token bundles spanning editorial, productivity, brand, futuristic, and minimalist systems. Pick one in the daemon top-bar and every skill renders in that visual language.',
      label: 'Catalog · Nº 02',
      heading: (count) => `Design Systems — ${count} portable visual systems.`,
      lead:
        'Each system is a single DESIGN.md token spec. Pick one in the daemon top-bar and every skill reads it as part of its system prompt — colors, type, spacing, components, all consistent.',
      category: 'Category',
      allAria: 'All systems',
      detailTitle: (name) => `${name} — Open Design design system`,
      detailFallbackDescription: (name, category) =>
        `Open Design system bundle: ${name}, ${category}.`,
      detailLabel: 'Design system',
      viewOnGithub: 'View DESIGN.md on GitHub',
      paletteSample: 'Palette sample',
      paletteLead: (count) =>
        `First ${count} hex codes lifted from the DESIGN.md color sections. The full palette and roles live in the source spec.`,
      visualTheme: 'Visual theme',
      related: (category) => `Related systems in ${category}`,
      categoryDescription: (heading, count) =>
        `Every Open Design design system tagged ${heading.toLowerCase()}. ${count} portable DESIGN.md token bundles — ready to pair with any skill in the catalog for instant brand-grade output.`,
      categoryHeading: (heading, count) =>
        `${heading} — ${count} portable visual systems.`,
      categoryLead: (label) =>
        `Filtered to category ${label}. Pick any of these in the daemon top-bar and every skill in the catalog reads its tokens — colors, type, spacing, voice — as part of its system prompt.`,
      allSystems: '← All design systems',
    },
    templates: {
      title: (count) => `Templates — ${count} ready-to-fork artifact templates | Open Design`,
      description:
        'Ready-to-fork artifact templates: refreshable Live Artifacts (Notion-style team dashboards, ops briefs) plus deck and prototype starting points. Each template ships as a fork-friendly bundle with sample data.',
      label: 'Catalog · Nº 04',
      heading: (count) => `Templates — ${count} ready-to-fork artifacts.`,
      lead:
        'Pre-wired artifact bundles with sample data and a known-good visual language. Fork the folder, swap the sample data with yours, and ship.',
      allAria: 'All templates',
      liveArtifact: 'Live Artifact',
      skillTemplate: 'Skill template',
      detailTitle: (name) => `${name} — Open Design template`,
      detailLabel: 'Template',
      forkOnGithub: 'Fork on GitHub',
      previewCaption: "Rendered from the template's seed data.",
      whatsInside: "What's in this template",
      whatsInsideLead:
        'Templates ship as forkable folders. Depending on origin, they include SKILL.md instructions, a preview example, or a template.html/data.json renderer with README notes.',
      renderer: 'the artifact renderer',
      seedData: 'seed values for offline / preview rendering',
      readme: 'connector wiring, refresh cadence, customization notes',
    },
    craft: {
      title: (count) => `Craft — ${count} brand-agnostic rendering principles | Open Design`,
      description:
        'Universal craft rules every Open Design skill can opt into: accessibility, animation discipline, color, form validation, laws of UX, RTL/Bidi, state coverage, and typography hierarchy.',
      label: 'Catalog · Nº 03',
      heading: (count) => `Craft — ${count} brand-agnostic rendering principles.`,
      lead:
        'Skills declare which craft rules they require. The agent loads the matching rules into its system prompt so quality concerns (a11y, motion, color, type) stay invariant across visual systems.',
      allAria: 'All craft principles',
      detailTitle: (name) => `${name} — Open Design craft principle`,
      detailFallbackDescription: (name) => `Open Design craft rule: ${name}.`,
      detailLabel: 'Craft principle',
      readFullRule: 'Read the full rule on GitHub',
      related: 'Other craft principles',
    },
  },
  plugins: {
    registryTitle: 'Open Design Plugins — Official and community registries',
    registryDescription: (count) =>
      `Browse ${count} Open Design plugins from official and community registries. Search installable agent-native design workflows with stable vendor/plugin IDs.`,
    directoryRailRight: 'Open Design Registry · Official · Community',
    directoryRailLeft: 'vendor/plugin-name · marketplace.json',
    topbarTitle: 'OD / REGISTRY',
    topbarSubtitle: 'Public index',
    topbarMeta: 'Official · Community · Self-hosted',
    sourceJson: 'Source JSON',
    heroLabel: 'Plugin Registry · public ecosystem',
    heroTitle: 'Browse agent-native design plugins with live previews.',
    heroBody:
      'Discover installable workflows, decks, image templates, design systems, and atomic capabilities. Each entry keeps a stable vendor/plugin ID, clear provenance, and a visual cue so browsing the registry feels closer to choosing a creative tool than reading a manifest dump.',
    browseRegistry: 'Browse registry',
    communityMarketplace: 'Community marketplace.json',
    preview: 'Registry preview',
    installableEntries: 'installable entries',
    official: 'Official',
    withPreview: 'with preview',
    surfaces: 'surfaces',
    availableFromSources: 'Available from sources',
    registryEntries: 'Registry entries',
    searchPlugins: 'Search plugins',
    searchPlaceholder: 'Search plugins, workflows, vendors...',
    filtersLabel: 'Registry filters',
    all: 'All',
    community: 'Community',
    visiblePlugins: 'visible plugins',
    openDetails: (title) => `Open ${title} details`,
    details: 'Details',
    detailTitle: (title) => `${title} — Open Design Plugin`,
    detailDescription: (description, command) => `${description} Install with ${command}.`,
    detailRailRight: (id) => `Open Design Plugin · ${id}`,
    allPlugins: 'All plugins',
    registry: 'Registry',
    deprecated: 'Deprecated',
    yanked: 'Yanked',
    installFromRegistry: 'Install from registry',
    copy: 'Copy',
    copied: 'Copied',
    select: 'Select',
    previewAndFacts: 'Plugin preview and facts',
    marketplaceJson: 'Marketplace JSON',
    sourceRepository: 'Source repository',
    homepage: 'Homepage',
    interactivePreview: 'Interactive preview',
    imagePreview: 'Image preview',
    videoPoster: 'Video poster',
    liveHtmlPreview: 'Live HTML preview',
    trustLabels: {
      official: 'Official',
      trusted: 'Trusted',
      restricted: 'Restricted',
    },
    facts: {
      pluginId: 'Plugin ID',
      version: 'Version',
      registry: 'Registry',
      mode: 'Mode',
      license: 'License',
      publisher: 'Publisher',
      notSpecified: 'Not specified',
    },
    howItResolves: 'How it resolves',
    provenance: 'Registry provenance',
    provenanceBody:
      'This entry is discovered from a marketplace catalog and resolves to the transport source below. The product can group it by source while the CLI keeps the install target stable through the vendor/plugin-name ID.',
    capabilities: 'Capabilities',
    workflowSurface: 'Workflow surface',
    directSourceFallback: 'Direct source fallback',
    examplePrompt: 'Example prompt',
    howPeopleUseIt: 'How people use it',
    examplePromptBody:
      'The registry entry includes a ready-to-run prompt seed so the plugin can be evaluated without guessing its expected workflow.',
    moreFrom: (registryName) => `More from ${registryName}`,
    related: 'Related plugins',
  },
};

const LANDING_UI_COPY_OVERRIDES: Partial<
  Record<LandingLocaleCode, DeepPartial<LandingUiCopy>>
> = {
  zh: {
    footer: {
      summary:
        '官方开源、本地优先的 Claude Design 替代方案。Apache-2.0，所有层都 BYOK。',
      catalog: '目录',
      official: '官方来源页',
      quickstart: '快速开始',
      agents: 'Agent',
      compare: '对比',
      claudeAlternative: 'Claude Design 替代方案',
      connect: '连接',
      github: 'GitHub',
      issues: '议题',
      contributors: '贡献者',
      releases: '版本发布',
      discord: 'Discord',
      rss: 'RSS',
      bottomLeft: '● Open Design · Apache-2.0 · 2026 / 第 01 卷 / 第 26 期',
      bottomRight: '柏林 / 开放 / 地球 · 52.5200° N · 13.4050° E',
    },
    blog: {
      title: '博客',
      seoTitle: '博客 — Open Design',
      description:
        '理解、探索和构建 Open Design 的笔记，覆盖产品、指南、使用场景与社区。',
      categoriesLabel: '博客分类',
      categories: {
        all: '全部',
        product: '产品',
        guides: '指南',
        useCases: '使用场景',
        community: '社区',
      },
      minRead: '分钟阅读',
      readMore: '继续阅读 →',
      read: '阅读 →',
      backToBlog: '← 返回博客',
      noEntries: '暂时还没有文章，请稍后再来。',
      noPostsInCategory: '这个分类还没有文章，更多现场笔记即将发布。',
      nextStep: '下一步',
      joinDiscord: '加入 Discord',
      viewSource: '在 GitHub 查看源码 ↗',
      cta: {
        downloadTitle: '下载桌面版本',
        downloadBody:
          '试用这个开源设计工作台，在 GitHub 查看 release notes，或加入 Discord 获取社区反馈。',
        downloadLabel: '下载桌面端 ↗',
        skillsTitle: '在本地运行 Skill 工作流',
        skillsBody:
          '浏览工作流库，选择一个起点，把它接入你已经在使用的 Agent。需要适配帮助时可以加入 Discord。',
        skillsLabel: '浏览工作流 ↗',
        repoTitle: '查看 GitHub 实现',
        repoBody:
          '打开仓库查看源码、为项目点 Star、fork 工作流，或加入 Discord 讨论下一步。',
        repoLabel: '打开仓库 ↗',
      },
    },
    tutorials: {
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
      suggestVideo: '推荐一个视频',
      noCategory: '这个分类还没有教程，更多内容正在整理。',
      thumbnailAlt: (title) => `${title} 的视频封面`,
      detailTitle: (title) => `${title} — Open Design 教程`,
      localizedTitle: (_title, author) => `Open Design 教程：${author}`,
      localizedSummary: (_title, author, category) =>
        `${author} 通过一段 ${category} 视频讲解 Open Design 的本地优先设计工作流、Skill、设计系统与可复用模板。`,
      localizedBodyHtml: (_title, author, summary) =>
        `<p>${summary}</p><h2>本地化摘要</h2><p>这段视频来自 ${author}，围绕 Open Design 的安装、能力演示、设计系统、Skill 和本地 Agent 工作流展开。页面保留原始视频来源，非英文页面使用站内 i18n 摘要，让正文不会回退成英文。</p>`,
    },
    catalog: {
      skills: {
        title: (count) => `Skill — ${count} 个可组合设计能力 | Open Design`,
        description:
          '浏览完整的 Open Design Skill 目录：100+ 个基于 SKILL.md 的文件夹，覆盖演示文稿、原型、仪表盘、移动流程、视频与实时 Artifact。每个 Skill 都是一个可放入 daemon 的文件夹。',
        label: '目录 · Nº 01',
        heading: (count) => `Skill — ${count} 个可组合设计能力。`,
        lead:
          '每个 Skill 都是一个包含 SKILL.md 的文件夹。放入目录、重启 daemon，选择器就会出现它。你可以按产物类型、场景或平台筛选，找到最匹配 brief 的工作流。',
        mode: '模式',
        scenario: '场景',
        platform: '平台',
        featured: '精选',
        allAria: '全部 Skill',
        detailTitle: (name) => `${name} — Open Design Skill`,
        detailFallbackDescription: (name) => `Open Design Skill 包：${name}。`,
        detailLabel: 'Skill',
        featuredNumber: (rank) => `· 精选 Nº ${rank}`,
        viewOnGithub: '在 GitHub 查看',
        upstream: '上游来源',
        previewCaption: (slug) => `渲染自 skills/${slug}/example.html`,
        triggers: '触发词',
        triggersLead: '选择器会用这些提示匹配 Skill。复制一个，再按你的 brief 调整。',
        examplePrompt: '示例提示词',
        related: '相关 Skill',
        filterTitle: (heading, count) =>
          `${heading} Skill — ${count} 个 Open Design ${heading.toLowerCase()} Agent`,
        modeDescription: (heading, count) =>
          `所有生成 ${heading.toLowerCase()} Artifact 的 Open Design Skill。${count} 个可直接运行、读取系统上下文的 Agent，可以通过 daemon 安装，并通过任意 DESIGN.md 系统锁定品牌。`,
        scenarioDescription: (heading, count) =>
          `${heading.toLowerCase()} 场景下的全部 Open Design Skill。${count} 个可运行 Agent，覆盖演示文稿、原型、模板与实时 Artifact，并可通过任意 DESIGN.md 锁定品牌。`,
        modeHeading: (heading, count) =>
          `${heading} — ${count} 个品牌级 ${heading.toLowerCase()} Agent。`,
        scenarioHeading: (heading, count) =>
          `${heading} — ${count} 个 ${heading.toLowerCase()} Skill。`,
        modeLead: (label) =>
          `已筛选 od.mode: ${label}。下面每个 Skill 都会把当前 DESIGN.md 作为系统提示的一部分，因此会继承你搭配的任意可移植系统的颜色、字体和间距。`,
        scenarioLead: (label) =>
          `已筛选 od.scenario: ${label}。把这些 Skill 与任意可移植设计系统配对，daemon 会完成后续编排：一个提示词，一个品牌化 Artifact。`,
        allSkills: (count) => `← 全部 Skill${typeof count === 'number' ? `（共 ${count} 个）` : ''}`,
      },
      systems: {
        title: (count) => `设计系统 — ${count} 套可移植视觉系统 | Open Design`,
        description:
          '浏览完整的 Open Design 设计系统目录：100+ 个 DESIGN.md token 包，覆盖 editorial、productivity、brand、futuristic 与 minimalist 等系统。你可以在 daemon 顶栏选择一个系统，让所有 Skill 以同一种视觉语言渲染。',
        label: '目录 · Nº 02',
        heading: (count) => `设计系统 — ${count} 套可移植视觉系统。`,
        lead:
          '每套系统都是一个 DESIGN.md token spec。在 daemon 顶栏选择后，每个 Skill 都会把它作为系统提示的一部分读取，颜色、字体、间距和组件保持一致。',
        category: '分类',
        allAria: '全部设计系统',
        detailTitle: (name) => `${name} — Open Design 设计系统`,
        detailFallbackDescription: (name, category) =>
          `Open Design 系统包：${name}，${category}。`,
        detailLabel: '设计系统',
        viewOnGithub: '在 GitHub 查看 DESIGN.md',
        paletteSample: '色板示例',
        paletteLead: (count) =>
          `从 DESIGN.md 颜色章节提取的前 ${count} 个 hex 色值。完整色板与语义角色在源规范中。`,
        visualTheme: '视觉主题',
        related: (category) => `${category} 中的相关系统`,
        categoryDescription: (heading, count) =>
          `所有标记为 ${heading.toLowerCase()} 的 Open Design 设计系统。${count} 套可移植 DESIGN.md token 包，可与目录中任意 Skill 搭配，快速得到品牌级输出。`,
        categoryHeading: (heading, count) =>
          `${heading} — ${count} 套可移植视觉系统。`,
        categoryLead: (label) =>
          `已筛选分类 ${label}。在 daemon 顶栏选择其中任意系统，目录中的所有 Skill 都会把它的 token、颜色、字体、间距和语气作为系统提示读取。`,
        allSystems: '← 全部设计系统',
      },
      templates: {
        title: (count) => `模板 — ${count} 个可 fork 的 Artifact 模板 | Open Design`,
        description:
          '可直接 fork 的 Artifact 模板：可刷新的 Live Artifact（类似 Notion 的团队仪表盘、运营简报）以及演示文稿和原型起点。每个模板都带有示例数据，适合复制改造。',
        label: '目录 · Nº 04',
        heading: (count) => `模板 — ${count} 个可 fork 的 Artifact。`,
        lead:
          '预先接好的 Artifact 包，带示例数据和已验证的视觉语言。Fork 文件夹，把示例数据换成你的数据，然后交付。',
        allAria: '全部模板',
        liveArtifact: 'Live Artifact',
        skillTemplate: 'Skill 模板',
        detailTitle: (name) => `${name} — Open Design 模板`,
        detailLabel: '模板',
        forkOnGithub: '在 GitHub fork',
        previewCaption: '由模板种子数据渲染。',
        whatsInside: '模板包含什么',
        whatsInsideLead:
          '模板是可以 fork 的文件夹，按来源包含 SKILL.md 指令、预览 example，或 template.html / data.json 渲染器与 README 连接说明。',
        renderer: 'Artifact 渲染器',
        seedData: '离线 / 预览渲染的种子值',
        readme: 'connector 接线、刷新节奏和自定义说明',
      },
      craft: {
        title: (count) => `工艺规则 — ${count} 条品牌无关渲染原则 | Open Design`,
        description:
          '每个 Open Design Skill 都可以声明要加载的通用工艺规则：无障碍、动画纪律、颜色、表单验证、UX 法则、RTL/Bidi、状态覆盖和字体层级。',
        label: '目录 · Nº 03',
        heading: (count) => `工艺规则 — ${count} 条品牌无关渲染原则。`,
        lead:
          'Skill 会声明它需要哪些工艺规则。Agent 会把匹配的规则加载进系统提示，让无障碍、动效、颜色和字体等质量要求在不同视觉系统中保持不变。',
        allAria: '全部工艺规则',
        detailTitle: (name) => `${name} — Open Design 工艺规则`,
        detailFallbackDescription: (name) => `Open Design 工艺规则：${name}。`,
        detailLabel: '工艺规则',
        readFullRule: '在 GitHub 阅读完整规则',
        related: '其他工艺规则',
      },
    },
    plugins: {
      registryTitle: 'Open Design 插件 — 官方与社区注册表',
      registryDescription: (count) =>
        `浏览来自官方与社区注册表的 ${count} 个 Open Design 插件。搜索可安装的 Agent 原生设计工作流，每个条目都有稳定的 vendor/plugin ID。`,
      directoryRailRight: 'Open Design 注册表 · 官方 · 社区',
      directoryRailLeft: 'vendor/plugin-name · marketplace.json',
      topbarTitle: 'OD / 注册表',
      topbarSubtitle: '公开索引',
      topbarMeta: '官方 · 社区 · 自托管',
      sourceJson: '源 JSON',
      heroLabel: '插件注册表 · 公共生态',
      heroTitle: '浏览带实时预览的 Agent 原生设计插件。',
      heroBody:
        '发现可安装的工作流、演示文稿、图像模板、设计系统和原子能力。每个条目保留稳定的 vendor/plugin ID、清晰来源和视觉线索，让浏览注册表更像选择创作工具，而不是阅读 manifest dump。',
      browseRegistry: '浏览注册表',
      communityMarketplace: '社区 marketplace.json',
      preview: '注册表预览',
      installableEntries: '可安装条目',
      official: '官方',
      withPreview: '带预览',
      surfaces: '表面类型',
      availableFromSources: '可用来源',
      registryEntries: '注册表条目',
      searchPlugins: '搜索插件',
      searchPlaceholder: '搜索插件、工作流、vendor...',
      filtersLabel: '注册表筛选',
      all: '全部',
      community: '社区',
      visiblePlugins: '个可见插件',
      openDetails: (title) => `打开 ${title} 详情`,
      details: '详情',
      detailTitle: (title) => `${title} — Open Design 插件`,
      detailDescription: (description, command) => `${description} 使用 ${command} 安装。`,
      detailRailRight: (id) => `Open Design 插件 · ${id}`,
      allPlugins: '全部插件',
      registry: '注册表',
      deprecated: '已弃用',
      yanked: '已下架',
      installFromRegistry: '从注册表安装',
      copy: '复制',
      copied: '已复制',
      select: '选择',
      previewAndFacts: '插件预览与信息',
      marketplaceJson: 'Marketplace JSON',
      sourceRepository: '源仓库',
      homepage: '主页',
      interactivePreview: '交互预览',
      imagePreview: '图片预览',
      videoPoster: '视频封面',
      liveHtmlPreview: 'Live HTML 预览',
      trustLabels: {
        official: '官方',
        trusted: '可信',
        restricted: '受限',
      },
      facts: {
        pluginId: '插件 ID',
        version: '版本',
        registry: '注册表',
        mode: '模式',
        license: '许可证',
        publisher: '发布方',
        notSpecified: '未指定',
      },
      howItResolves: '解析方式',
      provenance: '注册表来源',
      provenanceBody:
        '这个条目来自 marketplace catalog，并解析到下面的传输来源。产品可以按来源分组展示，而 CLI 仍通过稳定的 vendor/plugin-name ID 保持安装目标一致。',
      capabilities: '能力',
      workflowSurface: '工作流表面',
      directSourceFallback: '直接来源 fallback',
      examplePrompt: '示例提示词',
      howPeopleUseIt: '使用方式',
      examplePromptBody:
        '注册表条目包含可直接运行的提示词种子，因此无需猜测预期工作流即可评估插件。',
      moreFrom: (registryName) => `更多来自 ${registryName}`,
      related: '相关插件',
    },
  },
  'zh-tw': {
    footer: {
      summary:
        '官方開源、本地優先的 Claude Design 替代方案。Apache-2.0，每一層都 BYOK。',
      catalog: '目錄',
      official: '官方來源頁',
      quickstart: '快速開始',
      agents: 'Agent',
      compare: '比較',
      claudeAlternative: 'Claude Design 替代方案',
      connect: '連結',
      github: 'GitHub',
      issues: '議題',
      contributors: '貢獻者',
      releases: '版本發布',
      discord: 'Discord',
      rss: 'RSS',
      bottomLeft: '● Open Design · Apache-2.0 · 2026 / 第 01 卷 / 第 26 期',
      bottomRight: '柏林 / 開放 / 地球 · 52.5200° N · 13.4050° E',
    },
    blog: {
      title: '部落格',
      seoTitle: '部落格 — Open Design',
      description:
        '理解、探索與建構 Open Design 的筆記，涵蓋產品、指南、使用場景與社群。',
      categoriesLabel: '部落格分類',
      categories: {
        all: '全部',
        product: '產品',
        guides: '指南',
        useCases: '使用場景',
        community: '社群',
      },
      minRead: '分鐘閱讀',
      readMore: '繼續閱讀 →',
      read: '閱讀 →',
      backToBlog: '← 返回部落格',
      noEntries: '暫時還沒有文章，請稍後再來。',
      noPostsInCategory: '這個分類還沒有文章，更多現場筆記即將發布。',
      nextStep: '下一步',
      joinDiscord: '加入 Discord',
      viewSource: '在 GitHub 查看原始碼 ↗',
    },
    tutorials: {
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
      thumbnailAlt: (title) => `${title} 的影片封面`,
      detailTitle: (title) => `${title} — Open Design 教學`,
      localizedTitle: (_title, author) => `Open Design 教學：${author}`,
      localizedSummary: (_title, author, category) =>
        `${author} 透過一支 ${category} 影片講解 Open Design 的本地優先設計工作流、Skill、設計系統與可複用模板。`,
      localizedBodyHtml: (_title, author, summary) =>
        `<p>${summary}</p><h2>本地化摘要</h2><p>這支影片來自 ${author}，圍繞 Open Design 的安裝、能力演示、設計系統、Skill 與本地 Agent 工作流展開。頁面保留原始影片來源，非英文頁面使用站內 i18n 摘要，避免正文回退成英文。</p>`,
    },
  },
};

function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = out[key];
    if (
      baseValue &&
      value &&
      typeof baseValue === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value)
    ) {
      out[key] = mergeCopy(baseValue, value as DeepPartial<typeof baseValue>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

const HOME_PAGE_COPY_OVERRIDES: Partial<Record<LandingLocaleCode, DeepPartial<HomePageCopy>>> = {
  ja: {
    hero: {
      label: 'オープンソース・デザインスタジオ',
      titlePrefix: 'オープンソースの',
      titleMiddle: 'を',
      titleSecondEmphasis: '自分の Agent で動かす',
      lead: (skills, systems) =>
        `Open Design は公式のローカル優先 Claude Design 代替です。Claude Code、Codex、Cursor、Gemini、OpenCode、Qwen など既存の coding agent が、${skills} 個の composable skill と ${systems} 個の portable DESIGN.md system で動くデザインエンジンになります。`,
      star: 'GitHub で Star',
      download: 'デスクトップをダウンロード',
    },
    about: { label: 'スタジオについて', titlePrefix: '私たちは', titleAgent: 'あなたの Agent', titleMiddle: 'を創造的な', titleCollaborator: '共同制作者', titleSuffix: 'として扱います' },
    capabilities: { label: '機能', titlePrefix: 'Skill、System、Interface が', titleEmphasis: '創造的', titleSuffix: 'インテリジェンスを支える' },
    labs: { label: 'ラボ', titlePrefix: '成長し続ける', titleEmphasis: '実験アーカイブ', titleSuffix: '：Skill、デッキ、機械生成の形式' },
    method: { label: 'メソッド', titlePrefix: '', titleEmphasis: 'シグナル', titleSuffix: 'からシステムへ' },
    work: { label: '選定作品', titlePrefix: 'Brief を', titleEmphasisA: '記憶に残る', titleMiddle: '出荷可能な', titleEmphasisB: 'artifact', titleSuffix: 'へ変える Skill' },
    faqSection: { rule: 'FAQ', answers: '公式回答', label: 'Open Design よくある質問', titlePrefix: '', titleMiddle: 'と', titleSuffix: 'Claude Design のオープンソース代替について' },
    cta: { label: '始める', titlePrefix: '', titleOpen: 'オープン', titleMiddle: 'で', titleVisual: '視覚的に強い', titleSuffix: 'ものを一緒に作る', star: 'GitHub で Star' },
    footer: { summary: 'Claude Design のオープンソース代替。local-first、BYOK、Apache-2.0。', download: 'デスクトップをダウンロード' },
  },
  ko: {
    hero: {
      label: '오픈소스 디자인 스튜디오',
      titlePrefix: '오픈소스',
      titleMiddle: '을',
      titleSecondEmphasis: '내 Agent에서 실행',
      lead: (skills, systems) =>
        `Open Design은 공식 local-first Claude Design 대안입니다. 이미 쓰는 Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen 같은 coding agent가 ${skills}개의 조합형 skill과 ${systems}개의 portable DESIGN.md system으로 구동되는 디자인 엔진이 됩니다.`,
      star: 'GitHub에서 Star',
      download: '데스크톱 다운로드',
    },
    about: { label: '스튜디오 소개', titlePrefix: '우리는', titleAgent: '당신의 Agent', titleMiddle: '를 창의적', titleCollaborator: '협업자', titleSuffix: '로 다룹니다' },
    capabilities: { label: '기능', titlePrefix: 'Skill, System, Interface가', titleEmphasis: '창의적', titleSuffix: '지능을 움직입니다' },
    labs: { label: '랩', titlePrefix: '계속 자라는', titleEmphasis: '실험 아카이브', titleSuffix: '— Skill, deck, 생성 형식' },
    method: { label: '방법', titlePrefix: '', titleEmphasis: '신호', titleSuffix: '에서 시스템으로' },
    work: { label: '선정 작업', titlePrefix: 'Brief를', titleEmphasisA: '기억에 남는', titleMiddle: '출하 가능한', titleEmphasisB: 'artifact', titleSuffix: '로 바꾸는 Skill' },
    faqSection: { rule: 'FAQ', answers: '공식 답변', label: 'Open Design 자주 묻는 질문', titlePrefix: '', titleMiddle: '및', titleSuffix: 'Claude Design 오픈소스 대안 질문' },
    cta: { label: '시작하기', titlePrefix: '함께', titleOpen: '열린', titleMiddle: '그리고', titleVisual: '시각적으로 강한', titleSuffix: '것을 만듭니다', star: 'GitHub에서 Star' },
    footer: { summary: 'Claude Design의 오픈소스 대안. Local-first, BYOK, Apache-2.0.', download: '데스크톱 다운로드' },
  },
  de: {
    hero: {
      label: 'Open-Source-Designstudio',
      titlePrefix: 'Open-source',
      titleMiddle: 'läuft auf',
      titleSecondEmphasis: 'deinem eigenen Agent',
      lead: (skills, systems) =>
        `Open Design ist die offizielle local-first Alternative zu Claude Design. Dein vorhandener Coding-Agent — Claude Code, Codex, Cursor, Gemini, OpenCode oder Qwen — wird zur Design-Engine, gesteuert von ${skills} kombinierbaren Skills und ${systems} portablen DESIGN.md-Systemen.`,
      star: 'Auf GitHub sternen',
      download: 'Desktop herunterladen',
    },
    about: { label: 'Über das Studio', titlePrefix: 'Wir behandeln', titleAgent: 'deinen Agent', titleMiddle: 'als kreativen', titleCollaborator: 'Mitarbeiter', titleSuffix: 'statt als Blackbox' },
    capabilities: { label: 'Fähigkeiten', titlePrefix: 'Skills, Systeme und Interfaces', titleEmphasis: 'dienen kreativer', titleSuffix: 'Intelligenz' },
    labs: { label: 'Labor', titlePrefix: 'Ein wachsendes', titleEmphasis: 'Experimentarchiv', titleSuffix: 'für Skills, Decks und maschinische Formen' },
    method: { label: 'Methode', titlePrefix: 'Von', titleEmphasis: 'Signal', titleSuffix: 'zu System' },
    work: { label: 'Ausgewählte Arbeiten', titlePrefix: 'Skills, die Briefings in', titleEmphasisA: 'prägnante', titleMiddle: 'lieferbare', titleEmphasisB: 'Artifacts', titleSuffix: 'verwandeln' },
    faqSection: { rule: 'FAQ', answers: 'Offizielle Antworten', label: 'Open-Design-FAQ', titlePrefix: 'Fragen zu', titleMiddle: 'und', titleSuffix: 'der Open-Source-Alternative zu Claude Design' },
    cta: { label: 'Loslegen', titlePrefix: 'Lasst uns etwas', titleOpen: 'Offenes', titleMiddle: 'und', titleVisual: 'Visuell starkes', titleSuffix: 'bauen', star: 'Auf GitHub sternen' },
    footer: { summary: 'Die Open-Source-Alternative zu Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Desktop herunterladen' },
  },
  fr: {
    hero: {
      label: 'Studio de design open source',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, sur',
      titleSecondEmphasis: 'votre propre agent',
      lead: (skills, systems) =>
        `Open Design est l'alternative officielle, local-first, à Claude Design. Votre agent de coding — Claude Code, Codex, Cursor, Gemini, OpenCode ou Qwen — devient un moteur de design piloté par ${skills} skills composables et ${systems} systèmes DESIGN.md portables.`,
      star: 'Mettre une Star sur GitHub',
      download: 'Télécharger le desktop',
    },
    about: { label: 'À propos du studio', titlePrefix: 'Nous traitons', titleAgent: 'votre agent', titleMiddle: 'comme un', titleCollaborator: 'collaborateur créatif', titleSuffix: 'pas une boîte noire' },
    capabilities: { label: 'Capacités', titlePrefix: 'Skills, systèmes et interfaces', titleEmphasis: "servent l'intelligence", titleSuffix: 'créative' },
    labs: { label: 'Lab', titlePrefix: 'Une', titleEmphasis: "archive d'expériences", titleSuffix: 'en croissance : skills, decks et formes générées' },
    method: { label: 'Méthode', titlePrefix: 'Du', titleEmphasis: 'signal', titleSuffix: 'au système' },
    work: { label: 'Travaux choisis', titlePrefix: 'Des skills qui transforment les briefs en', titleEmphasisA: 'artifacts', titleMiddle: 'mémorables et', titleEmphasisB: 'livrables', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Réponses officielles', label: 'FAQ Open Design', titlePrefix: 'Questions sur', titleMiddle: 'et', titleSuffix: "l'alternative open source à Claude Design" },
    cta: { label: 'Commencer', titlePrefix: 'Construisons quelque chose', titleOpen: "d'ouvert", titleMiddle: 'et', titleVisual: 'visuellement mémorable', titleSuffix: '', star: 'Mettre une Star sur GitHub' },
    footer: { summary: "L'alternative open source à Claude Design. Local-first, BYOK, Apache-2.0.", download: 'Télécharger le desktop' },
  },
  ru: {
    hero: {
      label: 'Open-source дизайн-студия',
      titlePrefix: 'Open-source',
      titleMiddle: 'работает на',
      titleSecondEmphasis: 'вашем собственном Agent',
      lead: (skills, systems) =>
        `Open Design — официальная local-first альтернатива Claude Design. Ваш coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode или Qwen — становится design engine на базе ${skills} composable skills и ${systems} portable DESIGN.md systems.`,
      star: 'Поставить Star на GitHub',
      download: 'Скачать desktop',
    },
    about: { label: 'О студии', titlePrefix: 'Мы относимся к', titleAgent: 'вашему Agent', titleMiddle: 'как к творческому', titleCollaborator: 'соавтору', titleSuffix: 'а не черному ящику' },
    capabilities: { label: 'Возможности', titlePrefix: 'Skills, systems и interfaces', titleEmphasis: 'служат творческому', titleSuffix: 'интеллекту' },
    labs: { label: 'Лаборатория', titlePrefix: 'Растущий', titleEmphasis: 'архив экспериментов', titleSuffix: 'со skills, deck и машинными формами' },
    method: { label: 'Метод', titlePrefix: 'От', titleEmphasis: 'сигнала', titleSuffix: 'к системе' },
    work: { label: 'Избранные работы', titlePrefix: 'Skills превращают brief в', titleEmphasisA: 'запоминающиеся', titleMiddle: 'и готовые к отправке', titleEmphasisB: 'artifacts', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Официальные ответы', label: 'Вопросы об Open Design', titlePrefix: 'Вопросы про', titleMiddle: 'и', titleSuffix: 'open-source альтернативу Claude Design' },
    cta: { label: 'Начать', titlePrefix: 'Давайте создадим что-то', titleOpen: 'открытое', titleMiddle: 'и', titleVisual: 'визуально сильное', titleSuffix: '', star: 'Поставить Star на GitHub' },
    footer: { summary: 'Open-source альтернатива Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Скачать desktop' },
  },
  es: {
    hero: {
      label: 'Estudio de diseño open source',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, corriendo en',
      titleSecondEmphasis: 'tu propio agent',
      lead: (skills, systems) =>
        `Open Design es la alternativa oficial, local-first, a Claude Design. Tu coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode o Qwen — se convierte en motor de diseño con ${skills} skills componibles y ${systems} sistemas DESIGN.md portables.`,
      star: 'Dar Star en GitHub',
      download: 'Descargar desktop',
    },
    about: { label: 'Sobre el estudio', titlePrefix: 'Tratamos a', titleAgent: 'tu Agent', titleMiddle: 'como', titleCollaborator: 'colaborador creativo', titleSuffix: 'no como caja negra' },
    capabilities: { label: 'Capacidades', titlePrefix: 'Skills, sistemas e interfaces', titleEmphasis: 'sirven a la inteligencia', titleSuffix: 'creativa' },
    labs: { label: 'Lab', titlePrefix: 'Un', titleEmphasis: 'archivo experimental', titleSuffix: 'en crecimiento para skills, decks y formas generadas' },
    method: { label: 'Método', titlePrefix: 'De la', titleEmphasis: 'señal', titleSuffix: 'al sistema' },
    work: { label: 'Trabajos seleccionados', titlePrefix: 'Skills que convierten briefs en', titleEmphasisA: 'artifacts', titleMiddle: 'memorables y', titleEmphasisB: 'entregables', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Respuestas oficiales', label: 'FAQ de Open Design', titlePrefix: 'Preguntas sobre', titleMiddle: 'y', titleSuffix: 'la alternativa open source a Claude Design' },
    cta: { label: 'Empezar', titlePrefix: 'Construyamos algo', titleOpen: 'abierto', titleMiddle: 'y', titleVisual: 'visualmente memorable', titleSuffix: '', star: 'Dar Star en GitHub' },
    footer: { summary: 'La alternativa open source a Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Descargar desktop' },
  },
  'pt-br': {
    hero: {
      label: 'Estúdio de design open source',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, rodando no',
      titleSecondEmphasis: 'seu próprio agent',
      lead: (skills, systems) =>
        `Open Design é a alternativa oficial, local-first, ao Claude Design. Seu coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode ou Qwen — vira um motor de design com ${skills} skills componíveis e ${systems} sistemas DESIGN.md portáteis.`,
      star: 'Dar Star no GitHub',
      download: 'Baixar desktop',
    },
    about: { label: 'Sobre o estúdio', titlePrefix: 'Tratamos', titleAgent: 'seu Agent', titleMiddle: 'como', titleCollaborator: 'colaborador criativo', titleSuffix: 'não como caixa-preta' },
    capabilities: { label: 'Capacidades', titlePrefix: 'Skills, sistemas e interfaces', titleEmphasis: 'servem à inteligência', titleSuffix: 'criativa' },
    labs: { label: 'Lab', titlePrefix: 'Um', titleEmphasis: 'arquivo experimental', titleSuffix: 'em crescimento para skills, decks e formas geradas' },
    method: { label: 'Método', titlePrefix: 'Do', titleEmphasis: 'sinal', titleSuffix: 'ao sistema' },
    work: { label: 'Trabalhos selecionados', titlePrefix: 'Skills que transformam briefs em', titleEmphasisA: 'artifacts', titleMiddle: 'memoráveis e', titleEmphasisB: 'entregáveis', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Respostas oficiais', label: 'FAQ Open Design', titlePrefix: 'Perguntas sobre', titleMiddle: 'e', titleSuffix: 'a alternativa open source ao Claude Design' },
    cta: { label: 'Começar', titlePrefix: 'Vamos criar algo', titleOpen: 'aberto', titleMiddle: 'e', titleVisual: 'visualmente memorável', titleSuffix: '', star: 'Dar Star no GitHub' },
    footer: { summary: 'A alternativa open source ao Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Baixar desktop' },
  },
  it: {
    hero: {
      label: 'Studio di design open source',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, sul',
      titleSecondEmphasis: 'tuo agent',
      lead: (skills, systems) =>
        `Open Design è l'alternativa ufficiale, local-first, a Claude Design. Il tuo coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode o Qwen — diventa un motore di design con ${skills} skill componibili e ${systems} sistemi DESIGN.md portabili.`,
      star: 'Metti Star su GitHub',
      download: 'Scarica desktop',
    },
    about: { label: 'Lo studio', titlePrefix: 'Trattiamo', titleAgent: 'il tuo Agent', titleMiddle: 'come', titleCollaborator: 'collaboratore creativo', titleSuffix: 'non come black box' },
    capabilities: { label: 'Capacità', titlePrefix: 'Skill, sistemi e interfacce', titleEmphasis: "servono l'intelligenza", titleSuffix: 'creativa' },
    labs: { label: 'Lab', titlePrefix: 'Un', titleEmphasis: 'archivio sperimentale', titleSuffix: 'in crescita per skill, deck e forme generate' },
    method: { label: 'Metodo', titlePrefix: 'Dal', titleEmphasis: 'segnale', titleSuffix: 'al sistema' },
    work: { label: 'Lavori selezionati', titlePrefix: 'Skill che trasformano brief in', titleEmphasisA: 'artifact', titleMiddle: 'memorabili e', titleEmphasisB: 'pronti da consegnare', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Risposte ufficiali', label: 'FAQ Open Design', titlePrefix: 'Domande su', titleMiddle: 'e', titleSuffix: "l'alternativa open source a Claude Design" },
    cta: { label: 'Inizia', titlePrefix: 'Costruiamo qualcosa di', titleOpen: 'aperto', titleMiddle: 'e', titleVisual: 'visivamente memorabile', titleSuffix: '', star: 'Metti Star su GitHub' },
    footer: { summary: "L'alternativa open source a Claude Design. Local-first, BYOK, Apache-2.0.", download: 'Scarica desktop' },
  },
  vi: {
    hero: {
      label: 'Studio thiết kế mã nguồn mở',
      titlePrefix: 'Claude Design',
      titleMiddle: 'mã nguồn mở, chạy trên',
      titleSecondEmphasis: 'agent của bạn',
      lead: (skills, systems) =>
        `Open Design là lựa chọn chính thức, local-first, thay Claude Design. Coding agent bạn đang dùng — Claude Code, Codex, Cursor, Gemini, OpenCode hoặc Qwen — trở thành engine thiết kế với ${skills} skill có thể ghép và ${systems} hệ DESIGN.md di động.`,
      star: 'Star trên GitHub',
      download: 'Tải desktop',
    },
    about: { label: 'Về studio', titlePrefix: 'Chúng tôi xem', titleAgent: 'Agent của bạn', titleMiddle: 'là', titleCollaborator: 'cộng sự sáng tạo', titleSuffix: 'không phải hộp đen' },
    capabilities: { label: 'Năng lực', titlePrefix: 'Skill, hệ thống và giao diện', titleEmphasis: 'phục vụ trí tuệ', titleSuffix: 'sáng tạo' },
    labs: { label: 'Lab', titlePrefix: 'Một', titleEmphasis: 'kho thử nghiệm', titleSuffix: 'đang lớn lên cho skill, deck và hình thức tạo sinh' },
    method: { label: 'Phương pháp', titlePrefix: 'Từ', titleEmphasis: 'tín hiệu', titleSuffix: 'đến hệ thống' },
    work: { label: 'Tác phẩm chọn lọc', titlePrefix: 'Skill biến brief thành', titleEmphasisA: 'artifact', titleMiddle: 'đáng nhớ và', titleEmphasisB: 'có thể giao', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Câu trả lời chính thức', label: 'FAQ Open Design', titlePrefix: 'Câu hỏi về', titleMiddle: 'và', titleSuffix: 'lựa chọn mã nguồn mở thay Claude Design' },
    cta: { label: 'Bắt đầu', titlePrefix: 'Cùng tạo ra thứ', titleOpen: 'mở', titleMiddle: 'và', titleVisual: 'ấn tượng về thị giác', titleSuffix: '', star: 'Star trên GitHub' },
    footer: { summary: 'Lựa chọn mã nguồn mở thay Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Tải desktop' },
  },
  pl: {
    hero: {
      label: 'Studio designu open source',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, na',
      titleSecondEmphasis: 'Twoim agencie',
      lead: (skills, systems) =>
        `Open Design to oficjalna, local-first alternatywa dla Claude Design. Twój coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode albo Qwen — staje się silnikiem designu z ${skills} kompozycyjnymi skills i ${systems} przenośnymi systemami DESIGN.md.`,
      star: 'Daj Star na GitHubie',
      download: 'Pobierz desktop',
    },
    about: { label: 'O studiu', titlePrefix: 'Traktujemy', titleAgent: 'Twojego Agenta', titleMiddle: 'jak', titleCollaborator: 'kreatywnego współpracownika', titleSuffix: 'nie black box' },
    capabilities: { label: 'Możliwości', titlePrefix: 'Skills, systemy i interfejsy', titleEmphasis: 'służą kreatywnej', titleSuffix: 'inteligencji' },
    labs: { label: 'Lab', titlePrefix: 'Rosnące', titleEmphasis: 'archiwum eksperymentów', titleSuffix: 'dla skills, decków i form generatywnych' },
    method: { label: 'Metoda', titlePrefix: 'Od', titleEmphasis: 'sygnału', titleSuffix: 'do systemu' },
    work: { label: 'Wybrane prace', titlePrefix: 'Skills zmieniają briefy w', titleEmphasisA: 'zapadające w pamięć', titleMiddle: 'i gotowe do wysyłki', titleEmphasisB: 'artifacts', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Oficjalne odpowiedzi', label: 'FAQ Open Design', titlePrefix: 'Pytania o', titleMiddle: 'i', titleSuffix: 'open-source alternatywę dla Claude Design' },
    cta: { label: 'Zacznij', titlePrefix: 'Zbudujmy coś', titleOpen: 'otwartego', titleMiddle: 'i', titleVisual: 'wizualnie mocnego', titleSuffix: '', star: 'Daj Star na GitHubie' },
    footer: { summary: 'Open-source alternatywa dla Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Pobierz desktop' },
  },
  id: {
    hero: {
      label: 'Studio desain open source',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, berjalan di',
      titleSecondEmphasis: 'agent Anda sendiri',
      lead: (skills, systems) =>
        `Open Design adalah alternatif resmi, local-first, untuk Claude Design. Coding agent yang sudah Anda pakai — Claude Code, Codex, Cursor, Gemini, OpenCode, atau Qwen — menjadi mesin desain dengan ${skills} skill komposable dan ${systems} sistem DESIGN.md portabel.`,
      star: 'Beri Star di GitHub',
      download: 'Unduh desktop',
    },
    about: { label: 'Tentang studio', titlePrefix: 'Kami memperlakukan', titleAgent: 'Agent Anda', titleMiddle: 'sebagai', titleCollaborator: 'kolaborator kreatif', titleSuffix: 'bukan kotak hitam' },
    capabilities: { label: 'Kapabilitas', titlePrefix: 'Skill, sistem, dan antarmuka', titleEmphasis: 'melayani kecerdasan', titleSuffix: 'kreatif' },
    labs: { label: 'Lab', titlePrefix: 'Arsip', titleEmphasis: 'eksperimen', titleSuffix: 'yang terus tumbuh untuk skill, deck, dan bentuk generatif' },
    method: { label: 'Metode', titlePrefix: 'Dari', titleEmphasis: 'sinyal', titleSuffix: 'ke sistem' },
    work: { label: 'Karya pilihan', titlePrefix: 'Skill yang mengubah brief menjadi', titleEmphasisA: 'artifact', titleMiddle: 'berkesan dan', titleEmphasisB: 'siap dikirim', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Jawaban resmi', label: 'FAQ Open Design', titlePrefix: 'Pertanyaan tentang', titleMiddle: 'dan', titleSuffix: 'alternatif open source untuk Claude Design' },
    cta: { label: 'Mulai', titlePrefix: 'Mari bangun sesuatu yang', titleOpen: 'terbuka', titleMiddle: 'dan', titleVisual: 'kuat secara visual', titleSuffix: '', star: 'Beri Star di GitHub' },
    footer: { summary: 'Alternatif open source untuk Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Unduh desktop' },
  },
  nl: {
    hero: {
      label: 'Open-source designstudio',
      titlePrefix: 'Claude Design',
      titleMiddle: 'open source, draaiend op',
      titleSecondEmphasis: 'je eigen agent',
      lead: (skills, systems) =>
        `Open Design is het officiële local-first alternatief voor Claude Design. Je bestaande coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode of Qwen — wordt een design-engine met ${skills} combineerbare skills en ${systems} draagbare DESIGN.md-systemen.`,
      star: 'Star op GitHub',
      download: 'Desktop downloaden',
    },
    about: { label: 'Over de studio', titlePrefix: 'Wij behandelen', titleAgent: 'je Agent', titleMiddle: 'als creatieve', titleCollaborator: 'partner', titleSuffix: 'niet als black box' },
    capabilities: { label: 'Mogelijkheden', titlePrefix: 'Skills, systemen en interfaces', titleEmphasis: 'dienen creatieve', titleSuffix: 'intelligentie' },
    labs: { label: 'Lab', titlePrefix: 'Een groeiend', titleEmphasis: 'experimenteel archief', titleSuffix: 'voor skills, decks en machinevormen' },
    method: { label: 'Methode', titlePrefix: 'Van', titleEmphasis: 'signaal', titleSuffix: 'naar systeem' },
    work: { label: 'Geselecteerd werk', titlePrefix: 'Skills die briefings omzetten in', titleEmphasisA: 'memorabele', titleMiddle: 'en leverbare', titleEmphasisB: 'artifacts', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Officiële antwoorden', label: 'Open Design-FAQ', titlePrefix: 'Vragen over', titleMiddle: 'en', titleSuffix: 'het open-source alternatief voor Claude Design' },
    cta: { label: 'Starten', titlePrefix: 'Laten we iets', titleOpen: 'opens', titleMiddle: 'en', titleVisual: 'visueel memorabels', titleSuffix: 'bouwen', star: 'Star op GitHub' },
    footer: { summary: 'Het open-source alternatief voor Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Desktop downloaden' },
  },
  ar: {
    hero: {
      label: 'استوديو تصميم مفتوح المصدر',
      titlePrefix: 'Claude Design',
      titleMiddle: 'مفتوح المصدر يعمل على',
      titleSecondEmphasis: 'الـ Agent الخاص بك',
      lead: (skills, systems) =>
        `Open Design هو البديل الرسمي المحلي أولاً لـ Claude Design. يتحول coding agent الذي تستخدمه — Claude Code أو Codex أو Cursor أو Gemini أو OpenCode أو Qwen — إلى محرك تصميم مدفوع بـ ${skills} skills قابلة للتركيب و ${systems} أنظمة DESIGN.md قابلة للنقل.`,
      star: 'ضع Star على GitHub',
      download: 'تنزيل سطح المكتب',
    },
    about: { label: 'عن الاستوديو', titlePrefix: 'نتعامل مع', titleAgent: 'Agent الخاص بك', titleMiddle: 'كمتعاون', titleCollaborator: 'إبداعي', titleSuffix: 'وليس كصندوق أسود' },
    capabilities: { label: 'القدرات', titlePrefix: 'Skills والأنظمة والواجهات', titleEmphasis: 'تخدم الذكاء', titleSuffix: 'الإبداعي' },
    labs: { label: 'المختبر', titlePrefix: 'أرشيف', titleEmphasis: 'تجارب', titleSuffix: 'ينمو للـ skills والعروض والأشكال التوليدية' },
    method: { label: 'المنهج', titlePrefix: 'من', titleEmphasis: 'الإشارة', titleSuffix: 'إلى النظام' },
    work: { label: 'أعمال مختارة', titlePrefix: 'Skills تحول الـ brief إلى', titleEmphasisA: 'artifacts', titleMiddle: 'لا تُنسى و', titleEmphasisB: 'قابلة للتسليم', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'إجابات رسمية', label: 'أسئلة Open Design', titlePrefix: 'أسئلة حول', titleMiddle: 'و', titleSuffix: 'البديل مفتوح المصدر لـ Claude Design' },
    cta: { label: 'ابدأ', titlePrefix: 'لنبن شيئاً', titleOpen: 'مفتوحاً', titleMiddle: 'و', titleVisual: 'قوياً بصرياً', titleSuffix: '', star: 'ضع Star على GitHub' },
    footer: { summary: 'البديل مفتوح المصدر لـ Claude Design. محلي أولاً، BYOK، Apache-2.0.', download: 'تنزيل سطح المكتب' },
  },
  tr: {
    hero: {
      label: 'Açık kaynak tasarım stüdyosu',
      titlePrefix: 'Claude Design',
      titleMiddle: 'açık kaynak,',
      titleSecondEmphasis: 'kendi Agentında çalışır',
      lead: (skills, systems) =>
        `Open Design, Claude Design'ın resmi local-first alternatifidir. Zaten kullandığın coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode veya Qwen — ${skills} birleştirilebilir skill ve ${systems} taşınabilir DESIGN.md sistemiyle çalışan bir tasarım motoruna dönüşür.`,
      star: "GitHub'da Star ver",
      download: 'Desktop indir',
    },
    about: { label: 'Stüdyo hakkında', titlePrefix: 'Biz', titleAgent: 'Agentını', titleMiddle: 'yaratıcı bir', titleCollaborator: 'işbirlikçi', titleSuffix: 'olarak görürüz' },
    capabilities: { label: 'Yetenekler', titlePrefix: 'Skill, sistem ve arayüzler', titleEmphasis: 'yaratıcı', titleSuffix: 'zekaya hizmet eder' },
    labs: { label: 'Lab', titlePrefix: 'Büyüyen bir', titleEmphasis: 'deney arşivi', titleSuffix: ': skill, deck ve üretken formlar' },
    method: { label: 'Yöntem', titlePrefix: '', titleEmphasis: 'Sinyalden', titleSuffix: 'sisteme' },
    work: { label: 'Seçilmiş işler', titlePrefix: 'Briefleri', titleEmphasisA: 'akılda kalan', titleMiddle: 've teslim edilebilir', titleEmphasisB: 'artifactlara', titleSuffix: 'çeviren skilller' },
    faqSection: { rule: 'FAQ', answers: 'Resmi yanıtlar', label: 'Open Design SSS', titlePrefix: '', titleMiddle: 've', titleSuffix: "Claude Design'ın açık kaynak alternatifi hakkında sorular" },
    cta: { label: 'Başla', titlePrefix: 'Birlikte', titleOpen: 'açık', titleMiddle: 've', titleVisual: 'görsel olarak güçlü', titleSuffix: 'bir şey üretelim', star: "GitHub'da Star ver" },
    footer: { summary: "Claude Design'ın açık kaynak alternatifi. Local-first, BYOK, Apache-2.0.", download: 'Desktop indir' },
  },
  uk: {
    hero: {
      label: 'Open-source дизайн-студія',
      titlePrefix: 'Open-source',
      titleMiddle: 'працює на',
      titleSecondEmphasis: 'вашому власному Agent',
      lead: (skills, systems) =>
        `Open Design — офіційна local-first альтернатива Claude Design. Ваш coding agent — Claude Code, Codex, Cursor, Gemini, OpenCode або Qwen — стає design engine на базі ${skills} composable skills і ${systems} portable DESIGN.md systems.`,
      star: 'Поставити Star на GitHub',
      download: 'Завантажити desktop',
    },
    about: { label: 'Про студію', titlePrefix: 'Ми сприймаємо', titleAgent: 'ваш Agent', titleMiddle: 'як творчого', titleCollaborator: 'співавтора', titleSuffix: 'а не чорну скриньку' },
    capabilities: { label: 'Можливості', titlePrefix: 'Skills, systems та interfaces', titleEmphasis: 'служать творчому', titleSuffix: 'інтелекту' },
    labs: { label: 'Лабораторія', titlePrefix: 'Зростаючий', titleEmphasis: 'архів експериментів', titleSuffix: 'зі skills, deck та машинними формами' },
    method: { label: 'Метод', titlePrefix: 'Від', titleEmphasis: 'сигналу', titleSuffix: 'до системи' },
    work: { label: 'Вибрані роботи', titlePrefix: 'Skills перетворюють brief на', titleEmphasisA: 'пам’ятні', titleMiddle: 'і готові до відправки', titleEmphasisB: 'artifacts', titleSuffix: '' },
    faqSection: { rule: 'FAQ', answers: 'Офіційні відповіді', label: 'FAQ Open Design українською', titlePrefix: 'Питання про', titleMiddle: 'і', titleSuffix: 'open-source альтернативу Claude Design' },
    cta: { label: 'Почати', titlePrefix: 'Давайте створимо щось', titleOpen: 'відкрите', titleMiddle: 'і', titleVisual: 'візуально сильне', titleSuffix: '', star: 'Поставити Star на GitHub' },
    footer: { summary: 'Open-source альтернатива Claude Design. Local-first, BYOK, Apache-2.0.', download: 'Завантажити desktop' },
  },
};

const LOCALIZED_LANDING_FOOTER_COPY: Partial<
  Record<LandingLocaleCode, DeepPartial<LandingUiCopy['footer']>>
> = {
  ja: {
    summary:
      'Claude Design の公式オープンソース、ローカル優先の代替。Apache-2.0、すべての層で BYOK。',
    catalog: 'カタログ',
    official: '公式ソースページ',
    quickstart: 'クイックスタート',
    agents: 'Agent',
    compare: '比較',
    claudeAlternative: 'Claude Design の代替',
    connect: '接続',
    github: 'GitHub',
    issues: '課題',
    contributors: '貢献者',
    releases: 'リリース',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / 第 01 巻 / 第 26 号',
    bottomRight: 'ベルリン / オープン / 地球 · 52.5200° N · 13.4050° E',
  },
  ko: {
    summary:
      'Claude Design의 공식 오픈소스, 로컬 우선 대안입니다. Apache-2.0, 모든 계층에서 BYOK.',
    catalog: '카탈로그',
    official: '공식 소스 페이지',
    quickstart: '빠른 시작',
    agents: 'Agent',
    compare: '비교',
    claudeAlternative: 'Claude Design 대안',
    connect: '연결',
    github: 'GitHub',
    issues: '이슈',
    contributors: '기여자',
    releases: '릴리스',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / 01권 / 26호',
    bottomRight: '베를린 / 오픈 / 지구 · 52.5200° N · 13.4050° E',
  },
  de: {
    summary:
      'Die offizielle quelloffene, lokal zuerst gedachte Alternative zu Claude Design. Apache-2.0, BYOK auf jeder Ebene.',
    catalog: 'Katalog',
    official: 'Offizielle Quellseite',
    quickstart: 'Schnellstart',
    agents: 'Agenten',
    compare: 'Vergleich',
    claudeAlternative: 'Claude-Design-Alternative',
    connect: 'Verbinden',
    github: 'GitHub',
    issues: 'Tickets',
    contributors: 'Mitwirkende',
    releases: 'Versionen',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Band 01 / Ausgabe Nr. 26',
    bottomRight: 'Berlin / Offen / Erde · 52.5200° N · 13.4050° E',
  },
  fr: {
    summary:
      "L'alternative officielle open source et locale d'abord à Claude Design. Apache-2.0, BYOK à chaque couche.",
    catalog: 'Catalogue',
    official: 'Page source officielle',
    quickstart: 'Démarrage rapide',
    agents: 'Lokale agents',
    compare: 'Comparaison',
    claudeAlternative: 'Alternative à Claude Design',
    connect: 'Connexion',
    github: 'GitHub',
    issues: 'Tickets',
    contributors: 'Contributeurs',
    releases: 'Versions',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volume 01 / Numéro 26',
    bottomRight: 'Berlin / Ouvert / Terre · 52.5200° N · 13.4050° E',
  },
  ru: {
    summary:
      'Официальная открытая и локально ориентированная альтернатива Claude Design. Apache-2.0, BYOK на каждом уровне.',
    catalog: 'Каталог',
    official: 'Официальная страница источника',
    quickstart: 'Быстрый старт',
    agents: 'Агенты',
    compare: 'Сравнение',
    claudeAlternative: 'Альтернатива Claude Design',
    connect: 'Связь',
    github: 'GitHub',
    issues: 'Задачи',
    contributors: 'Участники',
    releases: 'Релизы',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Том 01 / Выпуск № 26',
    bottomRight: 'Берлин / Открыто / Земля · 52.5200° N · 13.4050° E',
  },
  es: {
    summary:
      'La alternativa oficial de código abierto y local-first a Claude Design. Apache-2.0, BYOK en cada capa.',
    catalog: 'Catálogo',
    official: 'Página fuente oficial',
    quickstart: 'Inicio rápido',
    agents: 'Agentes',
    compare: 'Comparación',
    claudeAlternative: 'Alternativa a Claude Design',
    connect: 'Conectar',
    github: 'GitHub',
    issues: 'Incidencias',
    contributors: 'Colaboradores',
    releases: 'Versiones',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volumen 01 / Número 26',
    bottomRight: 'Berlín / Abierto / Tierra · 52.5200° N · 13.4050° E',
  },
  'pt-br': {
    summary:
      'A alternativa oficial, de código aberto e local-first ao Claude Design. Apache-2.0, BYOK em todas as camadas.',
    catalog: 'Catálogo',
    official: 'Página oficial de origem',
    quickstart: 'Início rápido',
    agents: 'Agentes',
    compare: 'Comparação',
    claudeAlternative: 'Alternativa ao Claude Design',
    connect: 'Conectar',
    github: 'GitHub',
    issues: 'Problemas',
    contributors: 'Colaboradores',
    releases: 'Versões',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volume 01 / Edição Nº 26',
    bottomRight: 'Berlim / Aberto / Terra · 52.5200° N · 13.4050° E',
  },
  it: {
    summary:
      "L'alternativa ufficiale open source e locale-first a Claude Design. Apache-2.0, BYOK a ogni livello.",
    catalog: 'Catalogo',
    official: 'Pagina sorgente ufficiale',
    quickstart: 'Avvio rapido',
    agents: 'Agent',
    compare: 'Confronto',
    claudeAlternative: 'Alternativa a Claude Design',
    connect: 'Connessione',
    github: 'GitHub',
    issues: 'Problemi',
    contributors: 'Contributori',
    releases: 'Rilasci',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volume 01 / Numero 26',
    bottomRight: 'Berlino / Aperto / Terra · 52.5200° N · 13.4050° E',
  },
  vi: {
    summary:
      'Lựa chọn chính thức, mã nguồn mở và ưu tiên cục bộ thay Claude Design. Apache-2.0, BYOK ở mọi lớp.',
    catalog: 'Danh mục',
    official: 'Trang nguồn chính thức',
    quickstart: 'Bắt đầu nhanh',
    agents: 'Agent',
    compare: 'So sánh',
    claudeAlternative: 'Lựa chọn thay Claude Design',
    connect: 'Kết nối',
    github: 'GitHub',
    issues: 'Vấn đề',
    contributors: 'Người đóng góp',
    releases: 'Bản phát hành',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Tập 01 / Số 26',
    bottomRight: 'Berlin / Mở / Trái đất · 52.5200° N · 13.4050° E',
  },
  pl: {
    summary:
      'Oficjalna, otwartoźródłowa i lokalna alternatywa dla Claude Design. Apache-2.0, BYOK na każdej warstwie.',
    catalog: 'Katalog',
    official: 'Oficjalna strona źródłowa',
    quickstart: 'Szybki start',
    agents: 'Agenci',
    compare: 'Porównanie',
    claudeAlternative: 'Alternatywa dla Claude Design',
    connect: 'Kontakt',
    github: 'GitHub',
    issues: 'Zgłoszenia',
    contributors: 'Współtwórcy',
    releases: 'Wydania',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Tom 01 / Numer 26',
    bottomRight: 'Berlin / Otwarte / Ziemia · 52.5200° N · 13.4050° E',
  },
  id: {
    summary:
      'Alternatif resmi, sumber terbuka, dan mengutamakan lokal untuk Claude Design. Apache-2.0, BYOK di setiap lapisan.',
    catalog: 'Katalog',
    official: 'Halaman sumber resmi',
    quickstart: 'Mulai cepat',
    agents: 'Agent',
    compare: 'Perbandingan',
    claudeAlternative: 'Alternatif Claude Design',
    connect: 'Koneksi',
    github: 'GitHub',
    issues: 'Isu',
    contributors: 'Kontributor',
    releases: 'Rilis',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volume 01 / Edisi Nº 26',
    bottomRight: 'Berlin / Terbuka / Bumi · 52.5200° N · 13.4050° E',
  },
  nl: {
    summary:
      'Het officiële open-source en local-first alternatief voor Claude Design. Apache-2.0, BYOK in elke laag.',
    catalog: 'Catalogus',
    official: 'Officiële bronpagina',
    quickstart: 'Snelstart',
    agents: 'Agents',
    compare: 'Vergelijking',
    claudeAlternative: 'Claude Design-alternatief',
    connect: 'Verbinden',
    github: 'GitHub',
    issues: 'Meldingen',
    contributors: 'Bijdragers',
    releases: 'Uitgaven',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Volume 01 / Editie Nº 26',
    bottomRight: 'Berlijn / Open / Aarde · 52.5200° N · 13.4050° E',
  },
  ar: {
    summary:
      'البديل الرسمي مفتوح المصدر والمحلي أولاً لـ Claude Design. Apache-2.0 وBYOK في كل طبقة.',
    catalog: 'الفهرس',
    official: 'صفحة المصدر الرسمية',
    quickstart: 'البدء السريع',
    agents: 'الوكلاء',
    compare: 'المقارنة',
    claudeAlternative: 'بديل Claude Design',
    connect: 'التواصل',
    github: 'GitHub',
    issues: 'المسائل',
    contributors: 'المساهمون',
    releases: 'الإصدارات',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / المجلد 01 / العدد 26',
    bottomRight: 'برلين / مفتوح / الأرض · 52.5200° N · 13.4050° E',
  },
  tr: {
    summary:
      "Claude Design için resmi, açık kaynak ve yerel öncelikli alternatif. Apache-2.0, her katmanda BYOK.",
    catalog: 'Katalog',
    official: 'Resmi kaynak sayfası',
    quickstart: 'Hızlı başlangıç',
    agents: 'Agentlar',
    compare: 'Karşılaştırma',
    claudeAlternative: 'Claude Design alternatifi',
    connect: 'Bağlantı',
    github: 'GitHub',
    issues: 'Sorunlar',
    contributors: 'Katkıda bulunanlar',
    releases: 'Sürümler',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Cilt 01 / Sayı Nº 26',
    bottomRight: 'Berlin / Açık / Dünya · 52.5200° N · 13.4050° E',
  },
  uk: {
    summary:
      'Офіційна відкрита та локально орієнтована альтернатива Claude Design. Apache-2.0, BYOK на кожному рівні.',
    catalog: 'Каталог',
    official: 'Офіційна сторінка джерела',
    quickstart: 'Швидкий старт',
    agents: 'Агенти',
    compare: 'Порівняння',
    claudeAlternative: 'Альтернатива Claude Design',
    connect: "Зв'язок",
    github: 'GitHub',
    issues: 'Задачі',
    contributors: 'Учасники',
    releases: 'Релізи',
    discord: 'Discord',
    rss: 'RSS',
    bottomLeft: '● Open Design · Apache-2.0 · 2026 / Том 01 / Випуск № 26',
    bottomRight: 'Берлін / Відкрито / Земля · 52.5200° N · 13.4050° E',
  },
};

const LOCALIZED_HOME_FOOTER_COPY: Partial<
  Record<LandingLocaleCode, DeepPartial<HomePageCopy['footer']>>
> = {
  ja: {
    summary:
      'Claude Design のオープンソース代替。huashu-design、guizang-ppt、multica-ai、open-codesign の蓄積の上に構築されています。',
    downloadAria: 'Open Design デスクトップアプリをダウンロード',
    download: 'デスクトップをダウンロード',
    columns: { studio: 'スタジオ', library: 'ライブラリ', connect: '接続', openDesign: 'Open Design' },
    studioLinks: ['機能', 'ラボ', 'メソッド', 'マニフェスト'],
    connectLinks: ['GitHub', '課題', '貢献者', 'リリース', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} 個の Skill`,
      systems: (systems) => `${systems} 個の System`,
      templates: 'テンプレート',
      craft: 'クラフト',
    },
    openDesignLinks: {
      official: '公式ソース',
      quickstart: 'クイックスタート',
      agents: 'Agent',
      compare: '比較',
      alternative: 'Claude Design の代替',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / 第 01 巻 / 第 26 号',
    bottomRightA: 'ベルリン / オープン / 地球',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  ko: {
    summary:
      'Claude Design의 오픈소스 대안입니다. huashu-design, guizang-ppt, multica-ai, open-codesign의 축적 위에 구축되었습니다.',
    downloadAria: 'Open Design 데스크톱 앱 다운로드',
    download: '데스크톱 다운로드',
    columns: { studio: '스튜디오', library: '라이브러리', connect: '연결', openDesign: 'Open Design' },
    studioLinks: ['기능', '랩', '방법', '매니페스토'],
    connectLinks: ['GitHub', '이슈', '기여자', '릴리스', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills}개 Skill`,
      systems: (systems) => `${systems}개 System`,
      templates: '템플릿',
      craft: '크래프트',
    },
    openDesignLinks: {
      official: '공식 소스',
      quickstart: '빠른 시작',
      agents: 'Agent',
      compare: '비교',
      alternative: 'Claude Design 대안',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / 01권 / 26호',
    bottomRightA: '베를린 / 오픈 / 지구',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  de: {
    summary:
      'Die quelloffene Alternative zu Claude Design. Gebaut auf den Vorarbeiten von huashu-design, guizang-ppt, multica-ai und open-codesign.',
    downloadAria: 'Open-Design-Desktop-App herunterladen',
    download: 'Desktop herunterladen',
    columns: { studio: 'Studio', library: 'Bibliothek', connect: 'Verbinden', openDesign: 'Open Design' },
    studioLinks: ['Fähigkeiten', 'Labor', 'Methode', 'Manifest'],
    connectLinks: ['GitHub', 'Tickets', 'Mitwirkende', 'Versionen', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} Skills`,
      systems: (systems) => `${systems} Systeme`,
      templates: 'Vorlagen',
      craft: 'Handwerk',
    },
    openDesignLinks: {
      official: 'Offizielle Quelle',
      quickstart: 'Schnellstart',
      agents: 'Agenten',
      compare: 'Vergleich',
      alternative: 'Claude-Design-Alternative',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Band 01 / Ausgabe Nr. 26',
    bottomRightA: 'Berlin / Offen / Erde',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  fr: {
    summary:
      "L'alternative open source à Claude Design. Construite sur les travaux de huashu-design, guizang-ppt, multica-ai et open-codesign.",
    downloadAria: "Télécharger l'application desktop Open Design",
    download: 'Télécharger le desktop',
    columns: { studio: 'Studio', library: 'Bibliothèque', connect: 'Connexion', openDesign: 'Open Design' },
    studioLinks: ['Capacités', 'Lab', 'Méthode', 'Manifeste'],
    connectLinks: ['GitHub', 'Tickets', 'Contributeurs', 'Versions', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} systèmes`,
      templates: 'Modèles',
      craft: 'Règles de craft',
    },
    openDesignLinks: {
      official: 'Source officielle',
      quickstart: 'Démarrage rapide',
      agents: 'Agents locaux',
      compare: 'Comparaison',
      alternative: 'Alternative à Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volume 01 / Numéro 26',
    bottomRightA: 'Berlin / Ouvert / Terre',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  ru: {
    summary:
      'Открытая альтернатива Claude Design, созданная на основе работ huashu-design, guizang-ppt, multica-ai и open-codesign.',
    downloadAria: 'Скачать настольное приложение Open Design',
    download: 'Скачать desktop',
    columns: { studio: 'Студия', library: 'Библиотека', connect: 'Связь', openDesign: 'Open Design' },
    studioLinks: ['Возможности', 'Лаборатория', 'Метод', 'Манифест'],
    connectLinks: ['GitHub', 'Задачи', 'Участники', 'Релизы', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} систем`,
      templates: 'Шаблоны',
      craft: 'Правила craft',
    },
    openDesignLinks: {
      official: 'Официальный источник',
      quickstart: 'Быстрый старт',
      agents: 'Агенты',
      compare: 'Сравнение',
      alternative: 'Альтернатива Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Том 01 / Выпуск № 26',
    bottomRightA: 'Берлин / Открыто / Земля',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  es: {
    summary:
      'La alternativa de código abierto a Claude Design, construida sobre huashu-design, guizang-ppt, multica-ai y open-codesign.',
    downloadAria: 'Descargar la aplicación de escritorio de Open Design',
    download: 'Descargar desktop',
    columns: { studio: 'Estudio', library: 'Biblioteca', connect: 'Conectar', openDesign: 'Open Design' },
    studioLinks: ['Capacidades', 'Lab', 'Método', 'Manifiesto'],
    connectLinks: ['GitHub', 'Incidencias', 'Colaboradores', 'Versiones', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} sistemas`,
      templates: 'Plantillas',
      craft: 'Reglas craft',
    },
    openDesignLinks: {
      official: 'Fuente oficial',
      quickstart: 'Inicio rápido',
      agents: 'Agentes',
      compare: 'Comparación',
      alternative: 'Alternativa a Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volumen 01 / Número 26',
    bottomRightA: 'Berlín / Abierto / Tierra',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  'pt-br': {
    summary:
      'A alternativa de código aberto ao Claude Design, construída sobre huashu-design, guizang-ppt, multica-ai e open-codesign.',
    downloadAria: 'Baixar o aplicativo desktop do Open Design',
    download: 'Baixar desktop',
    columns: { studio: 'Estúdio', library: 'Biblioteca', connect: 'Conectar', openDesign: 'Open Design' },
    studioLinks: ['Capacidades', 'Lab', 'Método', 'Manifesto aberto'],
    connectLinks: ['GitHub', 'Problemas', 'Colaboradores', 'Versões', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} sistemas`,
      templates: 'Modelos',
      craft: 'Regras craft',
    },
    openDesignLinks: {
      official: 'Fonte oficial',
      quickstart: 'Início rápido',
      agents: 'Agentes',
      compare: 'Comparação',
      alternative: 'Alternativa ao Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volume 01 / Edição Nº 26',
    bottomRightA: 'Berlim / Aberto / Terra',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  it: {
    summary:
      "L'alternativa open source a Claude Design, costruita sulle basi di huashu-design, guizang-ppt, multica-ai e open-codesign.",
    downloadAria: "Scarica l'app desktop di Open Design",
    download: 'Scarica desktop',
    columns: { studio: 'Studio', library: 'Libreria', connect: 'Connessione', openDesign: 'Open Design' },
    studioLinks: ['Capacità', 'Lab', 'Metodo', 'Manifesto aperto'],
    connectLinks: ['GitHub', 'Problemi', 'Contributori', 'Rilasci', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skill`,
      systems: (systems) => `${systems} sistemi`,
      templates: 'Template',
      craft: 'Regole craft',
    },
    openDesignLinks: {
      official: 'Fonte ufficiale',
      quickstart: 'Avvio rapido',
      agents: 'Agent',
      compare: 'Confronto',
      alternative: 'Alternativa a Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volume 01 / Numero 26',
    bottomRightA: 'Berlino / Aperto / Terra',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  vi: {
    summary:
      'Lựa chọn mã nguồn mở thay Claude Design, xây trên nền tảng của huashu-design, guizang-ppt, multica-ai và open-codesign.',
    downloadAria: 'Tải ứng dụng desktop Open Design',
    download: 'Tải desktop',
    columns: { studio: 'Studio', library: 'Thư viện', connect: 'Kết nối', openDesign: 'Open Design' },
    studioLinks: ['Năng lực', 'Lab', 'Phương pháp', 'Tuyên ngôn'],
    connectLinks: ['GitHub', 'Vấn đề', 'Người đóng góp', 'Bản phát hành', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skill`,
      systems: (systems) => `${systems} hệ thống`,
      templates: 'Mẫu',
      craft: 'Quy tắc craft',
    },
    openDesignLinks: {
      official: 'Nguồn chính thức',
      quickstart: 'Bắt đầu nhanh',
      agents: 'Agent',
      compare: 'So sánh',
      alternative: 'Lựa chọn thay Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Tập 01 / Số 26',
    bottomRightA: 'Berlin / Mở / Trái đất',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  pl: {
    summary:
      'Otwarta alternatywa dla Claude Design, zbudowana na dorobku huashu-design, guizang-ppt, multica-ai i open-codesign.',
    downloadAria: 'Pobierz aplikację desktop Open Design',
    download: 'Pobierz desktop',
    columns: { studio: 'Studio', library: 'Biblioteka', connect: 'Kontakt', openDesign: 'Open Design' },
    studioLinks: ['Możliwości', 'Lab', 'Metoda', 'Manifest'],
    connectLinks: ['GitHub', 'Zgłoszenia', 'Współtwórcy', 'Wydania', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} systemów`,
      templates: 'Szablony',
      craft: 'Zasady craft',
    },
    openDesignLinks: {
      official: 'Oficjalne źródło',
      quickstart: 'Szybki start',
      agents: 'Agenci',
      compare: 'Porównanie',
      alternative: 'Alternatywa dla Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Tom 01 / Numer 26',
    bottomRightA: 'Berlin / Otwarte / Ziemia',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  id: {
    summary:
      'Alternatif sumber terbuka untuk Claude Design, dibangun di atas karya huashu-design, guizang-ppt, multica-ai, dan open-codesign.',
    downloadAria: 'Unduh aplikasi desktop Open Design',
    download: 'Unduh desktop',
    columns: { studio: 'Studio', library: 'Pustaka', connect: 'Koneksi', openDesign: 'Open Design' },
    studioLinks: ['Kapabilitas', 'Lab', 'Metode', 'Manifesto terbuka'],
    connectLinks: ['GitHub', 'Isu', 'Kontributor', 'Rilis', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skill`,
      systems: (systems) => `${systems} sistem`,
      templates: 'Templat',
      craft: 'Aturan craft',
    },
    openDesignLinks: {
      official: 'Sumber resmi',
      quickstart: 'Mulai cepat',
      agents: 'Agent',
      compare: 'Perbandingan',
      alternative: 'Alternatif Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volume 01 / Edisi Nº 26',
    bottomRightA: 'Berlin / Terbuka / Bumi',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  nl: {
    summary:
      'Het open-source alternatief voor Claude Design, gebouwd op het werk van huashu-design, guizang-ppt, multica-ai en open-codesign.',
    downloadAria: 'Download de Open Design desktop-app',
    download: 'Desktop downloaden',
    columns: { studio: 'Studio', library: 'Bibliotheek', connect: 'Verbinden', openDesign: 'Open Design' },
    studioLinks: ['Mogelijkheden', 'Lab', 'Methode', 'Manifest'],
    connectLinks: ['GitHub', 'Meldingen', 'Bijdragers', 'Uitgaven', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} systemen`,
      templates: 'Sjablonen',
      craft: 'Ontwerpregels',
    },
    openDesignLinks: {
      official: 'Officiële bron',
      quickstart: 'Snelstart',
      agents: 'Lokale agents',
      compare: 'Vergelijking',
      alternative: 'Claude Design-alternatief',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Volume 01 / Editie Nº 26',
    bottomRightA: 'Berlijn / Open / Aarde',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  ar: {
    summary:
      'البديل مفتوح المصدر لـ Claude Design، مبني على أعمال huashu-design وguizang-ppt وmultica-ai وopen-codesign.',
    downloadAria: 'تنزيل تطبيق Open Design لسطح المكتب',
    download: 'تنزيل سطح المكتب',
    columns: { studio: 'الاستوديو', library: 'المكتبة', connect: 'التواصل', openDesign: 'Open Design' },
    studioLinks: ['القدرات', 'المختبر', 'المنهج', 'البيان'],
    connectLinks: ['GitHub', 'المسائل', 'المساهمون', 'الإصدارات', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} مهارات`,
      systems: (systems) => `${systems} أنظمة`,
      templates: 'القوالب',
      craft: 'قواعد الصنعة',
    },
    openDesignLinks: {
      official: 'المصدر الرسمي',
      quickstart: 'البدء السريع',
      agents: 'الوكلاء',
      compare: 'المقارنة',
      alternative: 'بديل Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / المجلد 01 / العدد 26',
    bottomRightA: 'برلين / مفتوح / الأرض',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  tr: {
    summary:
      "Claude Design'ın açık kaynak alternatifi; huashu-design, guizang-ppt, multica-ai ve open-codesign çalışmalarının üzerine kuruldu.",
    downloadAria: 'Open Design desktop uygulamasını indir',
    download: 'Desktop indir',
    columns: { studio: 'Stüdyo', library: 'Kütüphane', connect: 'Bağlantı', openDesign: 'Open Design' },
    studioLinks: ['Yetenekler', 'Lab', 'Yöntem', 'Açık manifesto'],
    connectLinks: ['GitHub', 'Sorunlar', 'Katkıda bulunanlar', 'Sürümler', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skill`,
      systems: (systems) => `${systems} sistem`,
      templates: 'Şablonlar',
      craft: 'Tasarım kuralları',
    },
    openDesignLinks: {
      official: 'Resmi kaynak',
      quickstart: 'Hızlı başlangıç',
      agents: 'Agentlar',
      compare: 'Karşılaştırma',
      alternative: 'Claude Design alternatifi',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Cilt 01 / Sayı Nº 26',
    bottomRightA: 'Berlin / Açık / Dünya',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
  uk: {
    summary:
      'Відкрита альтернатива Claude Design, побудована на роботах huashu-design, guizang-ppt, multica-ai та open-codesign.',
    downloadAria: 'Завантажити настільний застосунок Open Design',
    download: 'Завантажити desktop',
    columns: { studio: 'Студія', library: 'Бібліотека', connect: "Зв'язок", openDesign: 'Open Design' },
    studioLinks: ['Можливості', 'Лабораторія', 'Метод', 'Маніфест'],
    connectLinks: ['GitHub', 'Задачі', 'Учасники', 'Релізи', 'Discord'],
    libraryLinks: {
      skills: (skills) => `${skills} skills`,
      systems: (systems) => `${systems} систем`,
      templates: 'Шаблони',
      craft: 'Правила craft',
    },
    openDesignLinks: {
      official: 'Офіційне джерело',
      quickstart: 'Швидкий старт',
      agents: 'Агенти',
      compare: 'Порівняння',
      alternative: 'Альтернатива Claude Design',
    },
    bottomLeft: 'Open Design · Apache-2.0 · 2026 / Том 01 / Випуск № 26',
    bottomRightA: 'Берлін / Відкрито / Земля',
    bottomRightB: '52.5200° N · 13.4050° E',
  },
};

type HomeFallbackText = {
  railRight: string;
  railLeft: string;
  discordAria: string;
  joinDiscord: string;
  heroLabel: string;
  heroIssue?: string;
  heroTitlePrefix: string;
  heroTitleEmphasis: string;
  heroTitleMiddle: string;
  heroTitleSecondEmphasis: string;
  heroLead: (skills: string, systems: string) => string;
  star: string;
  download: string;
  plate: string;
  composedIn: string;
  stats: [
    { strong: string; text: string },
    { strong: string; text: string },
    { strong: string; text: string },
  ];
  heroFoot: string;
  heroIndex: [string, string, string, string];
  officialAria: string;
  officialLabel: string;
  officialItems: [
    { label: string; value: string },
    { label: string; value: string },
    { label: string; value: string },
    { label: string; value: string },
    { label: string; value: string },
    { label: string; value: string },
  ];
  about: {
    rule: string;
    volume: string;
    label: string;
    titlePrefix: string;
    titleAgent: string;
    titleMiddle: string;
    titleCollaborator: string;
    titleSuffix: string;
    lead: string;
    approach: string;
    practice: string;
    stampTop: string;
    stampBottom: string;
    sideNote: [string, string, string, string, string];
    caption: string;
  };
  capabilities: {
    rule: string;
    surfaces: string;
    ribbon: string;
    label: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleSuffix: string;
    lead: string;
    cards: [
      { tag: string; title: string; body: (skills: string, systems: string) => string; aria: string },
      { tag: string; title: string; body: (skills: string, systems: string) => string; aria: string },
      { tag: string; title: string; body: (skills: string, systems: string) => string; aria: string },
      { tag: string; title: string; body: (skills: string, systems: string) => string; aria: string },
    ];
  };
  labs: {
    rule: string;
    ongoing: (skills: string) => string;
    label: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleSuffix: string;
    pills: { all: string; prototype: string; deck: string; mobile: string; office: string };
    metaTitle: string;
    metaBody: string;
    items: [
      { badge: string; title: string; body: string },
      { badge: string; title: string; body: string },
      { badge: string; title: string; body: string },
      { badge: string; title: string; body: string },
      { badge: string; title: string; body: string },
    ];
    foot: (skills: string) => string;
    viewLibrary: string;
    openAria: (title: string) => string;
  };
  method: {
    rule: string;
    stages: string;
    label: string;
    titlePrefix: string;
    titleEmphasis: string;
    titleSuffix: string;
    lead: string;
    steps: [
      { title: string; body: (skills: string, systems: string) => string },
      { title: string; body: (skills: string, systems: string) => string },
      { title: string; body: (skills: string, systems: string) => string },
      { title: string; body: (skills: string, systems: string) => string },
    ];
    footLeft: string;
  };
  work: {
    rule: string;
    editedBy: string;
    label: string;
    titlePrefix: string;
    titleEmphasisA: string;
    titleMiddle: string;
    titleEmphasisB: string;
    titleSuffix: string;
    viewAll: (skills: string) => string;
    cards: [
      { label: string; title: string; body: string; metaLeft: string; metaRight: string },
      { label: string; title: string; body: string; metaLeft: string; metaRight: string },
    ];
  };
  testimonial: {
    rule: string;
    shoulders: string;
    label: string;
    quote: string;
    authorTitle: string;
    partnersText: string;
    partnerLabels: [string, string, string, string, string];
    readMore: string;
  };
  faqSection: {
    rule: string;
    answers: string;
    label: string;
    titlePrefix: string;
    titleMiddle: string;
    titleSuffix: string;
  };
  cta: {
    rule: string;
    command: string;
    label: string;
    titlePrefix: string;
    titleOpen: string;
    titleMiddle: string;
    titleVisual: string;
    titleSuffix: string;
    lead: string;
    star: string;
    issue: string;
    live: string;
    ribbon: string;
  };
};

function homeFallbackCopy(text: HomeFallbackText): DeepPartial<HomePageCopy> {
  return {
    rail: { right: text.railRight, left: text.railLeft },
    hero: {
      discordAria: text.discordAria,
      joinDiscord: text.joinDiscord,
      label: text.heroLabel,
      issue: text.heroIssue ?? text.heroLabel,
      titlePrefix: text.heroTitlePrefix,
      titleEmphasis: text.heroTitleEmphasis,
      titleMiddle: text.heroTitleMiddle,
      titleSecondEmphasis: text.heroTitleSecondEmphasis,
      lead: text.heroLead,
      star: text.star,
      download: text.download,
      plate: text.plate,
      composedIn: text.composedIn,
      stats: text.stats,
      foot: text.heroFoot,
      index: text.heroIndex,
    },
    official: {
      aria: text.officialAria,
      label: text.officialLabel,
      items: text.officialItems,
    },
    about: text.about,
    capabilities: text.capabilities,
    labs: text.labs,
    method: text.method,
    work: text.work,
    testimonial: {
      ...text.testimonial,
      authorName: 'Mina Kovac',
    },
    faqSection: text.faqSection,
    cta: text.cta,
  };
}

const LOCALIZED_HOME_BODY_COPY: Partial<Record<LandingLocaleCode, DeepPartial<HomePageCopy>>> = {
  ja: homeFallbackCopy({
    railRight: 'Open Design — 第 01 巻 · 第 26 号 · Apache-2.0',
    railLeft: 'Skill · Design System · Agent · BYOK · ローカル優先',
    discordAria: 'Open Design Discord に参加',
    joinDiscord: 'Discord に参加',
    heroLabel: 'オープンソースのデザインスタジオ',
    heroTitlePrefix: 'オープンソースの',
    heroTitleEmphasis: 'Claude Design を',
    heroTitleMiddle: '自分の',
    heroTitleSecondEmphasis: 'Agent で動かす',
    heroLead: (skills, systems) =>
      `Open Design は Claude Design の公式ローカル優先代替です。Claude Code、Codex、Cursor、Gemini、OpenCode、Qwen など既存の coding agent が、${skills} 個の組み合わせ可能な Skill と ${systems} 個のポータブル DESIGN.md システムで動くデザインエンジンになります。`,
    star: 'GitHub で Star',
    download: 'デスクトップをダウンロード',
    plate: '図版 Nº 08',
    composedIn: '構成',
    stats: [
      { strong: 'Skill', text: '納品可能' },
      { strong: 'System', text: '移植可能' },
      { strong: 'CLI', text: '自分の Agent' },
    ],
    heroFoot: 'pnpm tools-dev · 3 コマンドで開始',
    heroIndex: ['検出', '発見', '指示', '納品'],
    officialAria: 'Open Design の公式ソース',
    officialLabel: '公式ソース',
    officialItems: [
      { label: '公式サイト', value: 'open-design.ai' },
      { label: 'ソースコード', value: 'nexu-io/open-design' },
      { label: 'リリース', value: 'version' },
      { label: 'ダウンロード', value: 'デスクトップ · macOS · Win · Linux' },
      { label: 'ドキュメント', value: 'README + /quickstart/' },
      { label: 'コミュニティ', value: 'Discord' },
    ],
    about: {
      rule: '概要 / マニフェスト',
      volume: 'Open Design / 第 01 巻',
      label: 'スタジオについて',
      titlePrefix: '私たちは',
      titleAgent: 'あなたの Agent',
      titleMiddle: 'を創造的な',
      titleCollaborator: '共同制作者',
      titleSuffix: 'として扱います',
      lead:
        '強力な coding agent はすでにあなたの laptop にあります。私たちは別の閉じた agent を出荷するのではなく、それらを Skill 駆動のデザインワークフローに接続します。ローカルでは pnpm tools-dev で動き、Web 層は Vercel に展開でき、すべての層で BYOK を保ちます。',
      approach: '私たちの方法を読む',
      practice: 'リサーチ · デザイン · エンジニアリング · 反復',
      stampTop: 'スタジオ実践',
      stampBottom: '創業 MMXXVI',
      sideNote: ['モデル挙動から', '視覚的な趣味まで', '創造システムの', '全スタックを', 'プロトタイプ化します。'],
      caption: '形 · 知覚 · 機械の想像力の研究。（Open Design, MMXXVI）',
    },
    capabilities: {
      rule: '機能 · Skill · System',
      surfaces: '4 つの表面 / 1 つのループ',
      ribbon: 'OPEN DESIGN · 機能マトリクス · OD/26',
      label: '機能',
      titlePrefix: 'Skill、System、Surface が',
      titleEmphasis: '創造的な',
      titleSuffix: '知能を支える',
      lead:
        '人間の審美眼と、あなたがすでに信頼している agent を組み合わせ、意図があり、表現力があり、生きているような UI、deck、編集ページを出荷します。',
      cards: [
        { tag: 'Skills', title: 'Skill、\nplugin ではない', body: (skills) => `${skills} 個の SKILL.md ベースの bundle。フォルダを置き、daemon を再起動すると picker に現れます。`, aria: 'GitHub で全 Skill を見る' },
        { tag: 'Systems', title: 'Design System は\nMarkdown', body: (_skills, systems) => `${systems} 個のポータブル DESIGN.md システム。Linear、Vercel、Stripe、Apple、Cursor、Figma などを再利用できます。`, aria: 'GitHub で全 Design System を見る' },
        { tag: 'Adapters', title: '12 個の Agent\nAdapter', body: () => 'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen を $PATH から自動検出します。', aria: 'Agent adapter のソースを読む' },
        { tag: 'BYOK', title: 'すべての層で\nBYOK', body: () => 'OpenAI 互換 proxy。DeepSeek、Groq、OpenRouter、自前の vLLM も baseUrl と key を貼るだけで使えます。', aria: 'BYOK 設定を見る' },
      ],
    },
    labs: {
      rule: 'ラボ / Skill カタログ',
      ongoing: (skills) => `${skills} 個中 05 個が進行中`,
      label: 'ラボ',
      titlePrefix: '成長し続ける',
      titleEmphasis: '実験アーカイブ',
      titleSuffix: 'Skill、deck、機械生成の形式',
      pills: { all: 'すべて', prototype: 'プロトタイプ', deck: 'Deck', mobile: 'モバイル', office: 'オフィス' },
      metaTitle: '進行中の実験',
      metaBody: '変化するアイデアを記録\n作りながら知能を構築\n実践で判断を磨く',
      items: [
        { badge: 'Deck', title: 'マガジン型 Deck', body: 'guizang-ppt による編集品質のスライド。マガジンレイアウトと WebGL hero を含みます。' },
        { badge: 'Media', title: '合成メディア', body: 'Gpt-image-2、Seedance、HyperFrames。画像、動画、音声を code と同じ chat surface で扱います。' },
        { badge: 'Loop', title: 'Prompt の振付', body: '1 ピクセルを描く前に質問フォームで方向を固定します。30 秒の選択が長い手戻りを防ぎます。' },
        { badge: 'Critique', title: '視覚推論', body: '理念、階層、実行、具体性、抑制の 5 次元 self-critique が artifact を守ります。' },
        { badge: 'Runtime', title: '柔らかいシステム', body: 'sandbox iframe、streaming todo、実 cwd のファイルシステム、人と機械の適応ループ。' },
      ],
      foot: (skills) => `05 / ${skills} SKILL`,
      viewLibrary: 'ライブラリ全体を見る →',
      openAria: (title) => `GitHub で ${title} を開く`,
    },
    method: {
      rule: '方法 / ループ',
      stages: '04 段階、反復型',
      label: '方法',
      titlePrefix: '',
      titleEmphasis: 'シグナル',
      titleSuffix: 'からシステムへ',
      lead: '各段階は反復的で、視覚的で、調査に基づきます。不透明な prompt ではなく、組み合わせ可能なファイルで進みます。',
      steps: [
        { title: '検出', body: (skills, systems) => `daemon が $PATH から 12 種の coding agent を探し、起動時に ${skills} 個の Skill と ${systems} 個の System を読み込みます。` },
        { title: '発見', body: () => '最初の turn は質問フォームです。表面、対象者、トーン、規模、ブランド文脈を 30 秒で固定します。' },
        { title: '指示', body: () => '5 つの決定的な visual direction から選びます。OKLch palette、font stack、layout posture が揃います。' },
        { title: '納品', body: () => 'Agent が disk に書き、sandbox iframe で preview し、HTML / PDF / PPTX / ZIP / Markdown を export します。' },
      ],
      footLeft: 'Skill が意図を決め、ファイルが結果を現実にします。',
    },
    work: {
      rule: '選定作品 · 2026 カタログ',
      editedBy: 'Open Design 編集',
      label: '選定作品',
      titlePrefix: 'brief を',
      titleEmphasisA: '記憶に残る',
      titleMiddle: '出荷可能な',
      titleEmphasisB: 'artifact',
      titleSuffix: 'へ変える Skill',
      viewAll: (skills) => `${skills} 個の Skill をすべて見る`,
      cards: [
        { label: '注目 Skill', title: 'guizang-ppt', body: 'プロダクト発表や pitch deck 向けのマガジン型 Web PPT。元の LICENSE を保ったまま同梱しています。', metaLeft: '2026 · DECK', metaRight: '標準' },
        { label: '連携 System', title: 'kami', body: '紙面編集向け System。暖かい parchment canvas、ink-blue accent、serif 主導の階層で、多言語を前提に設計されています。', metaLeft: '2026 · PAPER', metaRight: 'SYSTEM' },
      ],
    },
    testimonial: {
      rule: '協働者 / 系譜',
      shoulders: '先人の肩の上に立つ',
      label: '協働者',
      quote: '「Open Design は曖昧な AI のアイデアを、鋭く、信頼でき、本当に新しい視覚システムへ変えてくれました。」',
      authorTitle: 'クリエイティブディレクター · North Form',
      partnersText: 'オープンソースのデザイン文化を出荷してきたチームの蓄積の上に立っています。',
      partnerLabels: ['思想', 'Deck', 'UX', 'Terminal', 'Frame'],
      readMore: 'さらに読む',
    },
    faqSection: {
      rule: 'よくある質問',
      answers: '公式回答、宣伝文句なし',
      label: 'Open Design よくある質問',
      titlePrefix: '',
      titleMiddle: 'と',
      titleSuffix: 'Claude Design のオープンソース代替について',
    },
    cta: {
      rule: '連絡 / 会話',
      command: '3 コマンドで出荷',
      label: '会話を始める',
      titlePrefix: '一緒に',
      titleOpen: '開かれた',
      titleMiddle: 'そして',
      titleVisual: '視覚的に強い',
      titleSuffix: 'ものを作る',
      lead: 'GitHub で Star、issue へ参加、または今夜 pnpm tools-dev を実行してください。3 コマンドで loop が手元に来ます。',
      star: 'GitHub で Star',
      issue: 'issue を開く',
      live: '稼働中',
      ribbon: 'OPEN DESIGN · 完。',
    },
  }),
};

LOCALIZED_HOME_BODY_COPY.ko = homeFallbackCopy({
  railRight: 'Open Design — 01권 · 26호 · Apache-2.0',
  railLeft: 'Skill · 디자인 시스템 · Agent · BYOK · 로컬 우선',
  discordAria: 'Open Design Discord 참여',
  joinDiscord: 'Discord 참여',
  heroLabel: '오픈소스 디자인 스튜디오',
  heroTitlePrefix: '오픈소스',
  heroTitleEmphasis: 'Claude Design을',
  heroTitleMiddle: '내',
  heroTitleSecondEmphasis: 'Agent에서 실행',
  heroLead: (skills, systems) =>
    `Open Design은 Claude Design의 공식 로컬 우선 대안입니다. Claude Code, Codex, Cursor, Gemini, OpenCode, Qwen 같은 기존 coding agent가 ${skills}개의 조합 가능한 Skill과 ${systems}개의 portable DESIGN.md 시스템으로 움직이는 디자인 엔진이 됩니다.`,
  star: 'GitHub에서 Star',
  download: '데스크톱 다운로드',
  plate: '도판 Nº 08',
  composedIn: '구성',
  stats: [
    { strong: 'Skill', text: '납품 가능' },
    { strong: 'System', text: '이식 가능' },
    { strong: 'CLI', text: '내 Agent' },
  ],
  heroFoot: 'pnpm tools-dev · 3개 명령으로 시작',
  heroIndex: ['감지', '발견', '지시', '전달'],
  officialAria: 'Open Design 공식 출처',
  officialLabel: '공식 출처',
  officialItems: [
    { label: '공식 사이트', value: 'open-design.ai' },
    { label: '소스 코드', value: 'nexu-io/open-design' },
    { label: '릴리스', value: 'version' },
    { label: '다운로드', value: '데스크톱 · macOS · Win · Linux' },
    { label: '문서', value: 'README + /quickstart/' },
    { label: '커뮤니티', value: 'Discord' },
  ],
  about: {
    rule: '소개 / 선언',
    volume: 'Open Design / 01권',
    label: '스튜디오 소개',
    titlePrefix: '우리는',
    titleAgent: '당신의 Agent',
    titleMiddle: '를 창의적',
    titleCollaborator: '협업자',
    titleSuffix: '로 다룹니다',
    lead:
      '가장 강력한 coding agent는 이미 당신의 노트북에 있습니다. 우리는 또 하나의 닫힌 agent를 제공하지 않고, 기존 agent를 Skill 기반 디자인 워크플로에 연결합니다. 로컬에서는 pnpm tools-dev로 실행하고, 웹 레이어는 Vercel에 배포할 수 있으며, 모든 계층은 BYOK를 유지합니다.',
    approach: '방식 읽기',
    practice: '리서치 · 디자인 · 엔지니어링 · 반복',
    stampTop: '스튜디오 실천',
    stampBottom: '설립 MMXXVI',
    sideNote: ['모델 행동에서', '시각적 취향까지', '창작 시스템의', '전체 스택을', '프로토타입합니다.'],
    caption: '형태 · 지각 · 기계적 상상력 연구. (Open Design, MMXXVI)',
  },
  capabilities: {
    rule: '기능 · Skill · System',
    surfaces: '4개 표면 / 1개 루프',
    ribbon: 'OPEN DESIGN · 기능 매트릭스 · OD/26',
    label: '기능',
    titlePrefix: 'Skill, System, Surface가',
    titleEmphasis: '창의적',
    titleSuffix: '지능을 움직입니다',
    lead:
      '사람의 취향과 이미 신뢰하는 agent를 결합해 의도와 표현이 살아 있는 인터페이스, deck, 편집형 페이지를 출하합니다.',
    cards: [
      { tag: 'Skills', title: 'Skill,\nplugin이 아님', body: (skills) => `${skills}개의 SKILL.md 기반 bundle. 폴더를 넣고 daemon을 재시작하면 picker에 나타납니다.`, aria: 'GitHub에서 모든 Skill 보기' },
      { tag: 'Systems', title: '디자인 시스템은\nMarkdown', body: (_skills, systems) => `${systems}개의 portable DESIGN.md 시스템. Linear, Vercel, Stripe, Apple, Cursor, Figma 등을 재사용합니다.`, aria: 'GitHub에서 모든 디자인 시스템 보기' },
      { tag: 'Adapters', title: '12개 Agent\nAdapter', body: () => 'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen을 $PATH에서 자동 감지합니다.', aria: 'Agent adapter 소스 읽기' },
      { tag: 'BYOK', title: '모든 계층에서\nBYOK', body: () => 'OpenAI 호환 proxy. DeepSeek, Groq, OpenRouter, 자체 vLLM도 baseUrl과 key만 넣으면 사용할 수 있습니다.', aria: 'BYOK 설정 보기' },
    ],
  },
  labs: {
    rule: '랩 / Skill 카탈로그',
    ongoing: (skills) => `${skills}개 중 05개 진행 중`,
    label: '랩',
    titlePrefix: '계속 자라는',
    titleEmphasis: '실험 아카이브',
    titleSuffix: 'Skill, deck, 기계 생성 형식',
    pills: { all: '전체', prototype: '프로토타입', deck: 'Deck', mobile: '모바일', office: '오피스' },
    metaTitle: '진행 중인 실험',
    metaBody: '변하는 아이디어를 기록\n만들며 지능을 구성\n실천으로 판단을 다듬기',
    items: [
      { badge: 'Deck', title: '매거진형 Deck', body: 'guizang-ppt로 만드는 편집급 슬라이드. 매거진 레이아웃과 WebGL hero를 포함합니다.' },
      { badge: 'Media', title: '합성 미디어', body: 'Gpt-image-2, Seedance, HyperFrames. 이미지, 비디오, 오디오를 code와 같은 chat surface에서 다룹니다.' },
      { badge: 'Loop', title: 'Prompt 안무', body: '픽셀을 그리기 전에 질문 폼으로 방향을 고정합니다. 30초 선택이 긴 재작업을 줄입니다.' },
      { badge: 'Critique', title: '시각 추론', body: '철학, 위계, 실행, 구체성, 절제의 5차원 self-critique가 artifact를 지킵니다.' },
      { badge: 'Runtime', title: '유연한 시스템', body: 'sandbox iframe, streaming todo, 실제 cwd 파일 시스템, 인간과 기계의 적응 루프.' },
    ],
    foot: (skills) => `05 / ${skills} SKILL`,
    viewLibrary: '전체 라이브러리 보기 →',
    openAria: (title) => `GitHub에서 ${title} 열기`,
  },
  method: {
    rule: '방법 / 루프',
    stages: '04단계, 반복형',
    label: '방법',
    titlePrefix: '',
    titleEmphasis: '신호',
    titleSuffix: '에서 시스템으로',
    lead: '각 단계는 반복적이고 시각적이며 리서치 기반입니다. 불투명한 prompt가 아니라 조합 가능한 파일로 진행합니다.',
    steps: [
      { title: '감지', body: (skills, systems) => `daemon이 $PATH에서 12종의 coding agent를 찾고 시작 시 ${skills}개의 Skill과 ${systems}개의 System을 로드합니다.` },
      { title: '발견', body: () => '첫 turn은 질문 폼입니다. 표면, 대상, 톤, 규모, 브랜드 맥락을 30초 안에 고정합니다.' },
      { title: '지시', body: () => '5개의 결정적 visual direction 중 하나를 선택합니다. OKLch palette, font stack, layout posture가 함께 정해집니다.' },
      { title: '전달', body: () => 'Agent가 disk에 쓰고, sandbox iframe에서 preview한 뒤 HTML / PDF / PPTX / ZIP / Markdown으로 export합니다.' },
    ],
    footLeft: 'Skill이 의도를 정하고 파일이 결과를 현실로 만듭니다.',
  },
  work: {
    rule: '선정 작업 · 2026 카탈로그',
    editedBy: 'Open Design 편집',
    label: '선정 작업',
    titlePrefix: 'brief를',
    titleEmphasisA: '기억에 남는',
    titleMiddle: '출하 가능한',
    titleEmphasisB: 'artifact',
    titleSuffix: '로 바꾸는 Skill',
    viewAll: (skills) => `${skills}개 Skill 모두 보기`,
    cards: [
      { label: '주요 Skill', title: 'guizang-ppt', body: '제품 발표와 pitch deck을 위한 매거진형 Web PPT. 원본 LICENSE를 유지해 포함했습니다.', metaLeft: '2026 · DECK', metaRight: '기본' },
      { label: '연결 System', title: 'kami', body: '편집형 종이 시스템. 따뜻한 parchment canvas, ink-blue accent, serif 중심 위계로 다국어를 전제로 설계되었습니다.', metaLeft: '2026 · PAPER', metaRight: 'SYSTEM' },
    ],
  },
  testimonial: {
    rule: '협업자 / 계보',
    shoulders: '선행 작업 위에 서기',
    label: '협업자',
    quote: '“Open Design은 모호한 AI 아이디어를 날카롭고 믿을 수 있으며 실제로 새로운 시각 시스템으로 바꾸어 주었습니다.”',
    authorTitle: '크리에이티브 디렉터 · North Form',
    partnersText: '오픈소스 디자인 문화를 출하해 온 팀들의 축적 위에 서 있습니다.',
    partnerLabels: ['철학', 'Deck', 'UX', 'Terminal', 'Frame'],
    readMore: '더 읽기',
  },
  faqSection: {
    rule: '자주 묻는 질문',
    answers: '공식 답변, 마케팅 문구 없음',
    label: 'Open Design 자주 묻는 질문',
    titlePrefix: '',
    titleMiddle: '및',
    titleSuffix: 'Claude Design 오픈소스 대안에 관한 질문',
  },
  cta: {
    rule: '연락 / 대화',
    command: '3개 명령으로 출하',
    label: '대화 시작',
    titlePrefix: '함께',
    titleOpen: '열린',
    titleMiddle: '그리고',
    titleVisual: '시각적으로 강한',
    titleSuffix: '것을 만듭니다',
    lead: 'GitHub에서 Star를 누르거나 issue에 참여하거나 오늘 밤 pnpm tools-dev를 실행하세요. 3개 명령이면 loop가 당신의 것이 됩니다.',
    star: 'GitHub에서 Star',
    issue: 'issue 열기',
    live: '실행 중',
    ribbon: 'OPEN DESIGN · 끝.',
  },
});

LOCALIZED_HOME_BODY_COPY.de = homeFallbackCopy({
  railRight: 'Open Design — Band 01 · Ausgabe Nr. 26 · Apache-2.0',
  railLeft: 'Skills · Systeme · Agents · BYOK · lokal zuerst',
  discordAria: 'Open Design Discord beitreten',
  joinDiscord: 'Discord beitreten',
  heroLabel: 'Open-Source-Designstudio',
  heroTitlePrefix: 'Offenes',
  heroTitleEmphasis: 'Claude Design',
  heroTitleMiddle: 'läuft mit',
  heroTitleSecondEmphasis: 'deinem eigenen Agent',
  heroLead: (skills, systems) =>
    `Open Design ist die offizielle lokal zuerst gedachte Alternative zu Claude Design. Dein vorhandener Coding-Agent — Claude Code, Codex, Cursor, Gemini, OpenCode oder Qwen — wird zur Design-Engine mit ${skills} kombinierbaren Skills und ${systems} portablen DESIGN.md-Systemen.`,
  star: 'Auf GitHub sternen',
  download: 'Desktop herunterladen',
  plate: 'Tafel Nr. 08',
  composedIn: 'Komponiert in',
  stats: [
    { strong: 'Skills', text: 'lieferbar' },
    { strong: 'Systeme', text: 'portabel' },
    { strong: 'CLIs', text: 'eigener Agent' },
  ],
  heroFoot: 'pnpm tools-dev · Start in 3 Befehlen',
  heroIndex: ['Erkennen', 'Entdecken', 'Lenken', 'Liefern'],
  officialAria: 'Offizielle Open-Design-Quellen',
  officialLabel: 'Offizielle Quelle',
  officialItems: [
    { label: 'Offizielle Website', value: 'open-design.ai' },
    { label: 'Quellcode', value: 'nexu-io/open-design' },
    { label: 'Versionen', value: 'version' },
    { label: 'Download', value: 'Desktop · macOS · Win · Linux' },
    { label: 'Dokumentation', value: 'README + /quickstart/' },
    { label: 'Community-Bereich', value: 'Discord' },
  ],
  about: {
    rule: 'Überblick / Manifest',
    volume: 'Open Design / Band 01',
    label: 'Über das Studio',
    titlePrefix: 'Wir behandeln',
    titleAgent: 'deinen Agent',
    titleMiddle: 'als kreativen',
    titleCollaborator: 'Mitarbeiter',
    titleSuffix: 'nicht als Blackbox',
    lead:
      'Die stärksten Coding-Agents liegen bereits auf deinem Laptop. Wir liefern keinen weiteren geschlossenen Agent aus, sondern verbinden sie mit einem Skill-getriebenen Design-Workflow: lokal mit pnpm tools-dev, als Web-Layer auf Vercel deploybar und auf jeder Ebene BYOK.',
    approach: 'Unsere Methode lesen',
    practice: 'Recherche · Design · Engineering · Wiederholen',
    stampTop: 'Studiopraxis',
    stampBottom: 'Seit MMXXVI',
    sideNote: ['Vom Modellverhalten', 'bis zum visuellen Geschmack', 'prototypisieren wir', 'den ganzen Stack', 'kreativer Systeme.'],
    caption: 'Studien zu Form · Wahrnehmung · maschinischer Vorstellungskraft. (Open Design, MMXXVI)',
  },
  capabilities: {
    rule: 'Fähigkeiten · Skills · Systeme',
    surfaces: '4 Oberflächen / 1 Schleife',
    ribbon: 'OPEN DESIGN · FÄHIGKEITENMATRIX · OD/26',
    label: 'Fähigkeiten',
    titlePrefix: 'Skills, Systeme und Oberflächen',
    titleEmphasis: 'für kreative',
    titleSuffix: 'Intelligenz',
    lead:
      'Wir verbinden menschlichen Geschmack mit dem Agent, dem du bereits vertraust, um Interfaces, Decks und redaktionelle Seiten bewusst, ausdrucksstark und lebendig auszuliefern.',
    cards: [
      { tag: 'Skills', title: 'Skills,\nkeine Plugins', body: (skills) => `${skills} dateibasierte SKILL.md-Bundles. Ordner ablegen, daemon neu starten, schon erscheint er.`, aria: 'Alle Skills auf GitHub ansehen' },
      { tag: 'Systeme', title: 'Designsysteme\nals Markdown', body: (_skills, systems) => `${systems} portable DESIGN.md-Systeme — Linear, Vercel, Stripe, Apple, Cursor, Figma und mehr.`, aria: 'Alle Designsysteme auf GitHub ansehen' },
      { tag: 'Adapter', title: '12 Agent-\nAdapter', body: () => 'Claude · Codex · Gemini · Cursor · Copilot · OpenCode · Devin · Hermes · Pi · Kimi · Kiro · Qwen werden automatisch über $PATH erkannt.', aria: 'Quellcode der Agent-Adapter lesen' },
      { tag: 'BYOK', title: 'BYOK\nauf jeder Ebene', body: () => 'OpenAI-kompatibler Proxy. DeepSeek, Groq, OpenRouter oder dein eigenes vLLM: baseUrl und key eintragen, dann liefern.', aria: 'BYOK-Einrichtung ansehen' },
    ],
  },
  labs: {
    rule: 'Labor / Skill-Katalog',
    ongoing: (skills) => `05 von ${skills} laufen`,
    label: 'Labor',
    titlePrefix: 'Ein wachsendes',
    titleEmphasis: 'Experimentarchiv',
    titleSuffix: 'für Skills, Decks und maschinische Formen',
    pills: { all: 'Alle', prototype: 'Prototyp', deck: 'Deck', mobile: 'Mobil', office: 'Office' },
    metaTitle: 'Laufende Experimente',
    metaBody: 'Ideen im Wandel dokumentieren\nIntelligenz durch Machen bauen\nUrteil durch Praxis schärfen',
    items: [
      { badge: 'Deck', title: 'Magazin-Decks', body: 'Redaktionelle Folien mit guizang-ppt. Magazinlayout und WebGL-Hero inklusive.' },
      { badge: 'Medien', title: 'Synthetische Medien', body: 'Gpt-image-2, Seedance und HyperFrames. Bild, Video und Audio auf derselben Chat-Oberfläche wie Code.' },
      { badge: 'Loop', title: 'Prompt-Choreografie', body: 'Vor dem ersten Pixel fixiert ein Frageformular die Richtung. 30 Sekunden Auswahl sparen lange Korrekturschleifen.' },
      { badge: 'Kritik', title: 'Visuelles Denken', body: 'Eine 5-dimensionale Selbstkritik schützt jedes Artifact: Haltung, Hierarchie, Ausführung, Spezifität und Zurückhaltung.' },
      { badge: 'Runtime', title: 'Weiche Systeme', body: 'Sandbox-iframe, streaming todos, echtes cwd-Dateisystem und adaptive Schleifen zwischen Mensch und Maschine.' },
    ],
    foot: (skills) => `05 / ${skills} SKILL-BUNDLES`,
    viewLibrary: 'GESAMTE BIBLIOTHEK ANSEHEN →',
    openAria: (title) => `${title} auf GitHub öffnen`,
  },
  method: {
    rule: 'Methode / Schleife',
    stages: '04 Stufen, iterativ',
    label: 'Methode',
    titlePrefix: 'Von',
    titleEmphasis: 'Signalen',
    titleSuffix: 'zu Systemen',
    lead: 'Jede Stufe ist iterativ, visuell und forschungsgetrieben: kombinierbare Dateien statt undurchsichtiger Prompts.',
    steps: [
      { title: 'Erkennen', body: (skills, systems) => `Der daemon scannt $PATH nach 12 Coding-Agents und lädt beim Start ${skills} Skills plus ${systems} Systeme.` },
      { title: 'Entdecken', body: () => 'Turn 1 ist ein Frageformular: Oberfläche, Publikum, Ton, Maßstab und Markenkontext werden in 30 Sekunden fixiert.' },
      { title: 'Lenken', body: () => 'Wähle eine von 5 deterministischen visuellen Richtungen mit OKLch-Palette, Font-Stack und Layout-Haltung.' },
      { title: 'Liefern', body: () => 'Der Agent schreibt auf die Platte, du prüfst im sandbox iframe und exportierst HTML / PDF / PPTX / ZIP / Markdown.' },
    ],
    footLeft: 'Skills setzen die Absicht. Dateien machen das Ergebnis real.',
  },
  work: {
    rule: 'Ausgewählte Arbeiten · Katalog 2026',
    editedBy: 'Redaktion Open Design',
    label: 'Ausgewählte Arbeiten',
    titlePrefix: 'Skills verwandeln Briefings in',
    titleEmphasisA: 'prägnante',
    titleMiddle: 'lieferbare',
    titleEmphasisB: 'Artifacts',
    titleSuffix: '',
    viewAll: (skills) => `Alle ${skills} Skills ansehen`,
    cards: [
      { label: 'Ausgewählter Skill', title: 'guizang-ppt', body: 'Magazinartiges Web-PPT für Produktlaunches und Pitch Decks. Unverändert gebündelt, ursprüngliche LICENSE bleibt erhalten.', metaLeft: '2026 · DECK', metaRight: 'STANDARD' },
      { label: 'Begleitsystem', title: 'kami', body: 'Ein redaktionelles Papiersystem: warmer Pergamentgrund, tintenblauer Akzent, Serif-Hierarchie und mehrsprachig gedacht.', metaLeft: '2026 · PAPIER', metaRight: 'SYSTEM' },
    ],
  },
  testimonial: {
    rule: 'Mitwirkende / Herkunft',
    shoulders: 'Auf den Schultern anderer',
    label: 'Mitwirkende',
    quote: '„Open Design half uns, vage KI-Ideen in ein visuelles System zu verwandeln, das scharf, glaubwürdig und wirklich neu wirkte.“',
    authorTitle: 'Kreativdirektorin · North Form',
    partnersText: 'Wir bauen auf Teams auf, die Open-Source-Designkultur tatsächlich ausliefern.',
    partnerLabels: ['Philosophie', 'Decks', 'UX', 'Terminal', 'Frames'],
    readMore: 'Mehr Geschichten lesen',
  },
  faqSection: {
    rule: 'Häufig gefragt',
    answers: 'Offizielle Antworten, kein Marketingnebel',
    label: 'Open-Design-FAQ',
    titlePrefix: 'Fragen zu',
    titleMiddle: 'und',
    titleSuffix: 'der Open-Source-Alternative zu Claude Design',
  },
  cta: {
    rule: 'Kontakt / Gespräch',
    command: 'Drei Befehle bis zur Lieferung',
    label: 'Gespräch starten',
    titlePrefix: 'Lass uns etwas',
    titleOpen: 'Offenes',
    titleMiddle: 'und',
    titleVisual: 'Visuell starkes',
    titleSuffix: 'bauen',
    lead: 'Gib uns einen Star auf GitHub, geh in die Tickets oder starte heute Abend pnpm tools-dev. Drei Befehle und die Schleife gehört dir.',
    star: 'Auf GitHub sternen',
    issue: 'Issue öffnen',
    live: 'Live',
    ribbon: 'OPEN DESIGN · SCHLUSS.',
  },
});

const localeByCode = new Map<string, LandingLocale>(
  LANDING_LOCALES.map((locale) => [locale.code, locale]),
);

export function isLandingLocale(value: string | undefined): value is LandingLocaleCode {
  return typeof value === 'string' && localeByCode.has(value);
}

export function getLocaleDefinition(code: LandingLocaleCode): LandingLocale {
  return localeByCode.get(code)!;
}

export function getCommonCopy(locale: LandingLocaleCode): CommonCopy {
  return COMMON_COPY[locale] ?? COMMON_COPY[DEFAULT_LOCALE];
}

export function getHeaderProductMenuCopy(
  locale: LandingLocaleCode,
): HeaderProductMenuCopy {
  return HEADER_PRODUCT_MENU_COPY[locale] ?? HEADER_PRODUCT_MENU_COPY[DEFAULT_LOCALE];
}

export function getLandingUiCopy(locale: LandingLocaleCode): LandingUiCopy {
  let copy: LandingUiCopy;
  if (locale === 'zh-tw') {
    copy = mergeCopy(
      mergeCopy(LANDING_UI_COPY, LANDING_UI_COPY_OVERRIDES.zh),
      LANDING_UI_COPY_OVERRIDES['zh-tw'],
    );
  } else {
    copy = mergeCopy(LANDING_UI_COPY, LANDING_UI_COPY_OVERRIDES[locale]);
  }
  copy = mergeCopy(copy, EXTRA_LOCALIZED_LANDING_UI_COPY[locale]);
  const footerOverride = LOCALIZED_LANDING_FOOTER_COPY[locale];
  return footerOverride ? mergeCopy(copy, { footer: footerOverride }) : copy;
}

export function getHomePageCopy(locale: LandingLocaleCode): HomePageCopy {
  const exactCopy = HOME_PAGE_COPY[locale];
  if (exactCopy) return exactCopy;
  const localizedHomeBodyCopy = mergeCopy(
    LOCALIZED_HOME_BODY_COPY[locale] ?? {},
    EXTRA_LOCALIZED_HOME_BODY_COPY[locale] ?? {},
  );
  const copy = mergeCopy(
    mergeCopy(HOME_PAGE_COPY_EN, HOME_PAGE_COPY_OVERRIDES[locale]),
    localizedHomeBodyCopy,
  );
  const footerOverride = LOCALIZED_HOME_FOOTER_COPY[locale];
  return footerOverride ? mergeCopy(copy, { footer: footerOverride }) : copy;
}

export type LocalizedStringRecord = Partial<
  Record<LandingLocaleCode | string, string>
>;

export type LocalizedStringValue = string | LocalizedStringRecord | undefined;

export function getLocalizedString(
  value: LocalizedStringValue,
  locale: LandingLocaleCode,
  fallback = '',
): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (!value || typeof value !== 'object') return fallback;

  const localeDef = getLocaleDefinition(locale);
  const candidates = [
    locale,
    localeDef.htmlLang,
    localeDef.htmlLang.toLowerCase(),
    localeDef.htmlLang.replace('-', '_'),
    locale === 'zh' ? 'zh-CN' : undefined,
    locale === 'zh-tw' ? 'zh-TW' : undefined,
    locale === 'pt-br' ? 'pt-BR' : undefined,
    DEFAULT_LOCALE,
    'en-US',
    'en_US',
  ].filter((item): item is string => Boolean(item));

  for (const key of candidates) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) return text.trim();
  }

  const first = Object.values(value).find(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return first?.trim() ?? fallback;
}

export function getHomeSeo(
  locale: LandingLocaleCode,
  counts: { skills: number; systems: number },
): HomeSeoCopy {
  const copy = HOME_SEO_COPY[locale] ?? HOME_SEO_COPY[DEFAULT_LOCALE];
  return {
    title: copy.title,
    description: copy.description
      .replaceAll('{skills}', String(counts.skills))
      .replaceAll('{systems}', String(counts.systems)),
  };
}

export function getHomeFaq(
  locale: LandingLocaleCode,
  replacements: { origin: string; repo: string },
): HomeFaqEntry[] {
  const templates = HOME_FAQ_COPY[locale] ?? HOME_FAQ_COPY[DEFAULT_LOCALE];
  return templates.map((entry) => ({
    q: entry.q,
    a: entry.a
      .replaceAll('{origin}', replacements.origin)
      .replaceAll('{repo}', replacements.repo),
  }));
}

export function localePath(locale: LandingLocaleCode, pathname = '/'): string {
  const { pathname: basePathname } = stripLocaleFromPath(pathname);
  const normalized = basePathname.startsWith('/') ? basePathname : `/${basePathname}`;
  if (locale === DEFAULT_LOCALE) return normalized;
  if (normalized === '/') return `/${locale}/`;
  return `/${locale}${normalized}`;
}

export function stripLocaleFromPath(pathname = '/'): {
  locale: LandingLocaleCode;
  pathname: string;
} {
  const [rawPath = '/', suffix = ''] = pathname.split(/(?=[?#])/);
  const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const segments = normalized.split('/').filter(Boolean);
  const first = segments[0];

  if (isLandingLocale(first)) {
    const rest = segments.slice(1).join('/');
    return {
      locale: first,
      pathname: `/${rest}${rest ? '/' : ''}${suffix}`,
    };
  }

  return { locale: DEFAULT_LOCALE, pathname: `${normalized}${suffix}` };
}

export function localeFromPath(pathname = '/'): LandingLocaleCode {
  return stripLocaleFromPath(pathname).locale;
}

export function localizedHref(
  href: string,
  locale: LandingLocaleCode,
): string {
  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('od://')
  ) {
    return href;
  }

  if (href.startsWith('#')) return href;
  const [pathAndQuery = '', hash = ''] = href.split('#');
  const hashSuffix = hash ? `#${hash}` : '';
  if (pathAndQuery === '') return hashSuffix || href;
  const [path, query = ''] = pathAndQuery.split('?');
  const querySuffix = query ? `?${query}` : '';
  const localized = localePath(locale, path || '/');
  return `${localized}${querySuffix}${hashSuffix}`;
}

export function alternateLinksForPath(pathname = '/'): Array<{
  hreflang: string;
  hrefPath: string;
  locale: LandingLocale;
}> {
  const { pathname: basePathname } = stripLocaleFromPath(pathname);
  return LANDING_LOCALES.map((locale) => ({
    hreflang: locale.htmlLang,
    hrefPath: localePath(locale.code, basePathname),
    locale,
  }));
}
