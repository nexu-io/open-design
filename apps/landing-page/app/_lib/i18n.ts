export type Locale =
  | 'en'
  | 'id'
  | 'de'
  | 'zh-CN'
  | 'zh-TW'
  | 'pt-BR'
  | 'es-ES'
  | 'ru'
  | 'fa'
  | 'ar'
  | 'ja'
  | 'ko'
  | 'pl'
  | 'hu'
  | 'fr'
  | 'uk'
  | 'tr'
  | 'th'
  | 'it';

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALES: Locale[] = [
  'en',
  'id',
  'de',
  'zh-CN',
  'zh-TW',
  'pt-BR',
  'es-ES',
  'ru',
  'fa',
  'ar',
  'ja',
  'ko',
  'pl',
  'hu',
  'fr',
  'uk',
  'tr',
  'th',
  'it',
];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'pt-BR': 'Português (Brasil)',
  'es-ES': 'Español (España)',
  ru: 'Русский',
  fa: 'فارسی',
  ar: 'العربية',
  ja: '日本語',
  ko: '한국어',
  pl: 'Polski',
  hu: 'Magyar',
  fr: 'Français',
  uk: 'Українська',
  tr: 'Türkçe',
  th: 'ภาษาไทย',
  it: 'Italiano',
};

export const LOCALE_OG: Record<Locale, string> = {
  en: 'en_US',
  id: 'id_ID',
  de: 'de_DE',
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW',
  'pt-BR': 'pt_BR',
  'es-ES': 'es_ES',
  ru: 'ru_RU',
  fa: 'fa_IR',
  ar: 'ar_AR',
  ja: 'ja_JP',
  ko: 'ko_KR',
  pl: 'pl_PL',
  hu: 'hu_HU',
  fr: 'fr_FR',
  uk: 'uk_UA',
  tr: 'tr_TR',
  th: 'th_TH',
  it: 'it_IT',
};

export const RTL_LOCALES = new Set<Locale>(['ar', 'fa']);

type Copy = {
  navSkills: string;
  navSystems: string;
  navTemplates: string;
  navCraft: string;
  navBlog: string;
  navContact: string;
  download: string;
  star: string;
  live: string;
  catalog: string;
  connect: string;
  issues: string;
  releases: string;
  contact: string;
  footerPitch: string;
  blog: string;
  all: string;
  product: string;
  guides: string;
  useCases: string;
  community: string;
  readMore: string;
  backToBlog: string;
  nextStep: string;
  joinDiscord: string;
  viewSource: string;
  skillsTitle: string;
  systemsTitle: string;
  templatesTitle: string;
  craftTitle: string;
  pluginsTitle: string;
  browseRegistry: string;
  viewOnGithub: string;
  relatedSkills: string;
  triggers: string;
  examplePrompt: string;
  mode: string;
  scenario: string;
  platform: string;
  category: string;
  breadcrumbLabel: string;
  minRead: string;
};

const en: Copy = {
  navSkills: 'Skills',
  navSystems: 'Systems',
  navTemplates: 'Templates',
  navCraft: 'Craft',
  navBlog: 'Blog',
  navContact: 'Contact',
  download: 'Download',
  star: 'Star',
  live: 'Live',
  catalog: 'Catalog',
  connect: 'Connect',
  issues: 'Issues',
  releases: 'Releases',
  contact: 'Contact',
  footerPitch:
    'The open-source alternative to Claude Design. Apache-2.0, local-first, BYOK at every layer.',
  blog: 'Blog',
  all: 'All',
  product: 'Product',
  guides: 'Guides',
  useCases: 'Use cases',
  community: 'Community',
  readMore: 'Read more',
  backToBlog: 'Back to Blog',
  nextStep: 'Next step',
  joinDiscord: 'Join Discord',
  viewSource: 'View source on GitHub',
  skillsTitle: 'Skills',
  systemsTitle: 'Design Systems',
  templatesTitle: 'Templates',
  craftTitle: 'Craft',
  pluginsTitle: 'Plugins',
  browseRegistry: 'Browse registry',
  viewOnGithub: 'View on GitHub',
  relatedSkills: 'Related skills',
  triggers: 'Triggers',
  examplePrompt: 'Example prompt',
  mode: 'Mode',
  scenario: 'Scenario',
  platform: 'Platform',
  category: 'Category',
  breadcrumbLabel: 'Breadcrumb',
  minRead: 'min read',
};

const copyOverrides: Partial<Record<Locale, Partial<Copy>>> = {
  id: {
    navSkills: 'Skill',
    navSystems: 'Sistem',
    navTemplates: 'Templat',
    navCraft: 'Craft',
    navBlog: 'Blog',
    navContact: 'Kontak',
    download: 'Unduh',
    star: 'Beri bintang',
    catalog: 'Katalog',
    connect: 'Terhubung',
    readMore: 'Baca lagi',
    backToBlog: 'Kembali ke Blog',
    joinDiscord: 'Gabung Discord',
    viewOnGithub: 'Lihat di GitHub',
  },
  de: {
    navSkills: 'Skills',
    navSystems: 'Systeme',
    navTemplates: 'Vorlagen',
    navCraft: 'Handwerk',
    navBlog: 'Blog',
    navContact: 'Kontakt',
    download: 'Herunterladen',
    star: 'Stern',
    catalog: 'Katalog',
    connect: 'Verbinden',
    readMore: 'Weiterlesen',
    backToBlog: 'Zurück zum Blog',
    joinDiscord: 'Discord beitreten',
    viewOnGithub: 'Auf GitHub ansehen',
  },
  'zh-CN': {
    navSkills: '技能',
    navSystems: '设计系统',
    navTemplates: '模板',
    navCraft: '工艺',
    navBlog: '博客',
    navContact: '联系',
    download: '下载',
    star: '收藏',
    live: '在线',
    catalog: '目录',
    connect: '连接',
    issues: '议题',
    releases: '版本',
    contact: '联系',
    footerPitch: 'Claude Design 的开源替代品。Apache-2.0、本地优先、每一层都 BYOK。',
    blog: '博客',
    all: '全部',
    product: '产品',
    guides: '指南',
    useCases: '用例',
    community: '社区',
    readMore: '继续阅读',
    backToBlog: '返回博客',
    nextStep: '下一步',
    joinDiscord: '加入 Discord',
    viewSource: '在 GitHub 查看源码',
    skillsTitle: '技能',
    systemsTitle: '设计系统',
    templatesTitle: '模板',
    craftTitle: '工艺',
    pluginsTitle: '插件',
    browseRegistry: '浏览注册表',
    viewOnGithub: '在 GitHub 查看',
    relatedSkills: '相关技能',
    triggers: '触发词',
    examplePrompt: '示例提示词',
    mode: '模式',
    scenario: '场景',
    platform: '平台',
    category: '分类',
    breadcrumbLabel: '面包屑',
    minRead: '分钟阅读',
  },
  'zh-TW': {
    navSkills: '技能',
    navSystems: '設計系統',
    navTemplates: '範本',
    navCraft: '工藝',
    navBlog: '部落格',
    navContact: '聯絡',
    download: '下載',
    star: '收藏',
    catalog: '目錄',
    connect: '連結',
    readMore: '繼續閱讀',
    backToBlog: '返回部落格',
    joinDiscord: '加入 Discord',
    viewOnGithub: '在 GitHub 查看',
  },
  ja: {
    navSkills: 'スキル',
    navSystems: 'システム',
    navTemplates: 'テンプレート',
    navCraft: 'クラフト',
    navBlog: 'ブログ',
    navContact: '連絡先',
    download: 'ダウンロード',
    star: 'スター',
    catalog: 'カタログ',
    connect: '接続',
    readMore: '続きを読む',
    backToBlog: 'ブログへ戻る',
    joinDiscord: 'Discord に参加',
    viewOnGithub: 'GitHub で見る',
  },
  ko: {
    navSkills: '스킬',
    navSystems: '시스템',
    navTemplates: '템플릿',
    navCraft: '크래프트',
    navBlog: '블로그',
    navContact: '문의',
    download: '다운로드',
    star: '스타',
    catalog: '카탈로그',
    connect: '연결',
    readMore: '더 읽기',
    backToBlog: '블로그로 돌아가기',
  },
  fr: {
    navSkills: 'Compétences',
    navSystems: 'Systèmes',
    navTemplates: 'Modèles',
    navCraft: 'Artisanat',
    navBlog: 'Blog',
    navContact: 'Contact',
    download: 'Télécharger',
    star: 'Étoile',
    catalog: 'Catalogue',
    connect: 'Connecter',
    readMore: 'Lire la suite',
    backToBlog: 'Retour au blog',
  },
  'es-ES': {
    navSkills: 'Skills',
    navSystems: 'Sistemas',
    navTemplates: 'Plantillas',
    navCraft: 'Oficio',
    navBlog: 'Blog',
    navContact: 'Contacto',
    download: 'Descargar',
    star: 'Estrella',
    catalog: 'Catálogo',
    connect: 'Conectar',
    readMore: 'Leer más',
    backToBlog: 'Volver al blog',
  },
  'pt-BR': {
    navSkills: 'Skills',
    navSystems: 'Sistemas',
    navTemplates: 'Modelos',
    navCraft: 'Craft',
    navBlog: 'Blog',
    navContact: 'Contato',
    download: 'Baixar',
    star: 'Estrela',
    catalog: 'Catálogo',
    connect: 'Conectar',
    readMore: 'Ler mais',
    backToBlog: 'Voltar ao blog',
  },
  ru: {
    navSkills: 'Навыки',
    navSystems: 'Системы',
    navTemplates: 'Шаблоны',
    navCraft: 'Мастерство',
    navBlog: 'Блог',
    navContact: 'Контакты',
    download: 'Скачать',
    star: 'Звезда',
    catalog: 'Каталог',
    connect: 'Связь',
    readMore: 'Читать дальше',
    backToBlog: 'Назад к блогу',
  },
  ar: {
    navSkills: 'المهارات',
    navSystems: 'الأنظمة',
    navTemplates: 'القوالب',
    navCraft: 'الحرفة',
    navBlog: 'المدونة',
    navContact: 'تواصل',
    download: 'تنزيل',
    star: 'نجمة',
    catalog: 'الفهرس',
    connect: 'تواصل',
    readMore: 'اقرأ المزيد',
    backToBlog: 'العودة إلى المدونة',
  },
  fa: {
    navSkills: 'مهارت‌ها',
    navSystems: 'سیستم‌ها',
    navTemplates: 'قالب‌ها',
    navCraft: 'کیفیت ساخت',
    navBlog: 'وبلاگ',
    navContact: 'تماس',
    download: 'دانلود',
    star: 'ستاره',
    catalog: 'کاتالوگ',
    connect: 'ارتباط',
    readMore: 'ادامه مطلب',
    backToBlog: 'بازگشت به وبلاگ',
  },
  pl: { navSkills: 'Umiejętności', navSystems: 'Systemy', navTemplates: 'Szablony', navCraft: 'Rzemiosło', download: 'Pobierz', readMore: 'Czytaj więcej' },
  hu: { navSkills: 'Készségek', navSystems: 'Rendszerek', navTemplates: 'Sablonok', navCraft: 'Mesterség', download: 'Letöltés', readMore: 'Tovább' },
  uk: { navSkills: 'Навички', navSystems: 'Системи', navTemplates: 'Шаблони', navCraft: 'Майстерність', download: 'Завантажити', readMore: 'Читати далі' },
  tr: { navSkills: 'Yetenekler', navSystems: 'Sistemler', navTemplates: 'Şablonlar', navCraft: 'Zanaat', download: 'İndir', readMore: 'Devamını oku' },
  th: { navSkills: 'สกิล', navSystems: 'ระบบ', navTemplates: 'เทมเพลต', navCraft: 'งานฝีมือ', download: 'ดาวน์โหลด', readMore: 'อ่านต่อ' },
  it: { navSkills: 'Skill', navSystems: 'Sistemi', navTemplates: 'Template', navCraft: 'Craft', download: 'Scarica', readMore: 'Leggi di più' },
};

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && (LOCALES as string[]).includes(value));
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function getCopy(locale: Locale): Copy {
  return { ...en, ...(copyOverrides[locale] ?? {}) };
}

export function normalizePath(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return path.endsWith('/') ? path : `${path}/`;
}

export function stripLocale(pathname: string): { locale: Locale; path: string; hadLocale: boolean } {
  const normalized = normalizePath(pathname);
  const [, first, ...rest] = normalized.split('/');
  if (isLocale(first)) {
    const path = normalizePath(`/${rest.join('/')}`);
    return { locale: first, path, hadLocale: true };
  }
  return { locale: DEFAULT_LOCALE, path: normalized, hadLocale: false };
}

export function localePath(
  pathname: string,
  locale: Locale,
  options: { prefixDefault?: boolean } = {},
): string {
  const path = stripLocale(pathname).path;
  if (locale === DEFAULT_LOCALE && !options.prefixDefault) return path;
  return normalizePath(`/${locale}${path === '/' ? '' : path}`);
}

/**
 * Build the hreflang alternates for a path.
 *
 * The default locale (English) keeps the unprefixed URL — both
 * `hreflang="en"` and `hreflang="x-default"` point at `/skills/`,
 * NOT `/en/skills/`. We do not generate `/en/...` routes at build
 * time, so emitting `/en/skills/` here would create a dangling
 * hreflang target and a duplicate-canonical signal for Google.
 */
export function alternateLinks(pathname: string) {
  const path = stripLocale(pathname).path;
  return [
    { hreflang: 'x-default', href: path },
    ...LOCALES.map((locale) => ({
      hreflang: locale,
      href: localePath(path, locale),
    })),
  ];
}

/**
 * Locales that get their own URL prefix at build time. The default
 * locale stays at the unprefixed canonical to avoid duplicate
 * content between `/skills/` and `/en/skills/`.
 */
export const PREFIXED_LOCALES: Locale[] = LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE,
);

export function localizedDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function localizeCategory(category: string, locale: Locale): string {
  const copy = getCopy(locale);
  const normalized = category.toLowerCase();
  if (normalized === 'product') return copy.product;
  if (normalized === 'guides') return copy.guides;
  if (normalized === 'use cases') return copy.useCases;
  if (normalized === 'community') return copy.community;
  return category;
}
