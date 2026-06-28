export type BrandKitLocale = 'en' | 'zh-CN' | 'zh-TW';

export interface BrandKitCopy {
  lang: string;
  title: string;
  logo: string;
  typography: string;
  palette: string;
  voiceTone: string;
  imageryLayout: string;
  images: string;
  brandAssets: string;
  extracting: string;
  brandReady: string;
  lookingForLogo: string;
  noLogoFound: string;
  previewLogoAria: string;
  logoAlt: string;
  previewHeroImageAria: string;
  display: string;
  body: string;
  mono: string;
  noTypographyCaptured: string;
  typographyFallbackNote: string;
  noPaletteCaptured: string;
  noVoiceNotesCaptured: string;
  use: string;
  avoid: string;
  layoutPosture: string;
  noImageryOrLayoutCaptured: string;
  subjects: string;
  treatment: string;
  designSystem: string;
  designSystemDescription: string;
  light: string;
  dark: string;
  componentKitTitle: string;
  assetsExtracting: string;
  assetsReady: string;
  preview: string;
  viewAll: string;
  noDescription: string;
}

const EN: BrandKitCopy = {
  lang: 'en',
  title: 'Brand Kit',
  logo: 'Logo',
  typography: 'Typography',
  palette: 'Palette',
  voiceTone: 'Voice & tone',
  imageryLayout: 'Imagery & layout',
  images: 'Images',
  brandAssets: 'Brand assets',
  extracting: 'Extracting...',
  brandReady: 'Brand ready',
  lookingForLogo: 'Looking for a logo...',
  noLogoFound: 'No logo found',
  previewLogoAria: 'Preview logo',
  logoAlt: 'logo',
  previewHeroImageAria: 'Preview hero image',
  display: 'Display',
  body: 'Body',
  mono: 'Mono',
  noTypographyCaptured: 'No typography captured.',
  typographyFallbackNote: 'proprietary, shown via fallback',
  noPaletteCaptured: 'No palette captured.',
  noVoiceNotesCaptured: 'No voice notes captured.',
  use: 'Use',
  avoid: 'Avoid',
  layoutPosture: 'Layout posture',
  noImageryOrLayoutCaptured: 'No imagery or layout notes captured.',
  subjects: 'Subjects',
  treatment: 'Treatment',
  designSystem: 'Design system',
  designSystemDescription: 'Deterministic light / dark / compact tokens and a component kit derived from this one brand seed.',
  light: 'Light',
  dark: 'Dark',
  componentKitTitle: 'Component kit',
  assetsExtracting: 'Generated once extraction finishes - click any tile to preview the full page.',
  assetsReady: 'Click any tile to preview the full page; everything is colored from this one brand.',
  preview: 'Preview',
  viewAll: 'View all',
  noDescription: '',
};

const ZH_CN: BrandKitCopy = {
  ...EN,
  lang: 'zh-CN',
  title: '品牌设计体系',
  logo: '标志',
  typography: '字体',
  palette: '色板',
  voiceTone: '语气与表达',
  imageryLayout: '图像与布局',
  images: '图片',
  brandAssets: '品牌资产',
  extracting: '提取中...',
  brandReady: '设计体系已就绪',
  lookingForLogo: '正在查找标志...',
  noLogoFound: '未找到标志',
  previewLogoAria: '预览标志',
  logoAlt: '标志',
  previewHeroImageAria: '预览主图',
  display: '标题',
  body: '正文',
  mono: '等宽',
  noTypographyCaptured: '未捕获字体信息。',
  typographyFallbackNote: '专有字体，通过 fallback 展示',
  noPaletteCaptured: '未捕获色板。',
  noVoiceNotesCaptured: '未捕获语气说明。',
  use: '建议使用',
  avoid: '避免使用',
  layoutPosture: '布局姿态',
  noImageryOrLayoutCaptured: '未捕获图像或布局说明。',
  subjects: '主体',
  treatment: '处理方式',
  designSystem: '设计体系',
  designSystemDescription: '由这套品牌种子生成的确定性浅色 / 深色 / 紧凑 tokens 与组件套件。',
  light: '浅色',
  dark: '深色',
  componentKitTitle: '组件套件',
  assetsExtracting: '提取完成后生成；点击任意卡片可预览完整页面。',
  assetsReady: '点击任意卡片可预览完整页面；所有内容都由这套品牌配色生成。',
  preview: '预览',
  viewAll: '查看全部',
};

const ZH_TW: BrandKitCopy = {
  ...ZH_CN,
  lang: 'zh-TW',
  title: '品牌設計系統',
  logo: '標誌',
  typography: '字體',
  palette: '色票',
  voiceTone: '語氣與表達',
  imageryLayout: '圖像與版面',
  brandAssets: '品牌資產',
  extracting: '擷取中...',
  brandReady: '設計系統已就緒',
  lookingForLogo: '正在尋找標誌...',
  noLogoFound: '未找到標誌',
  previewLogoAria: '預覽標誌',
  logoAlt: '標誌',
  previewHeroImageAria: '預覽主視覺',
  display: '標題',
  body: '內文',
  mono: '等寬',
  noTypographyCaptured: '未擷取字體資訊。',
  typographyFallbackNote: '專有字體，透過 fallback 顯示',
  noPaletteCaptured: '未擷取色票。',
  noVoiceNotesCaptured: '未擷取語氣說明。',
  use: '建議使用',
  avoid: '避免使用',
  layoutPosture: '版面姿態',
  noImageryOrLayoutCaptured: '未擷取圖像或版面說明。',
  subjects: '主體',
  treatment: '處理方式',
  designSystem: '設計系統',
  designSystemDescription: '由這套品牌種子生成的確定性淺色 / 深色 / 緊湊 tokens 與元件套件。',
  light: '淺色',
  dark: '深色',
  componentKitTitle: '元件套件',
  assetsExtracting: '擷取完成後生成；點擊任一卡片可預覽完整頁面。',
  assetsReady: '點擊任一卡片可預覽完整頁面；所有內容都由這套品牌配色生成。',
  viewAll: '查看全部',
};

export function normalizeBrandKitLocale(locale?: string | null): BrandKitLocale {
  const normalized = locale?.trim();
  if (!normalized) return 'en';
  const lower = normalized.toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-TW';
  if (lower === 'zh-cn' || lower === 'zh-hans' || lower === 'zh') return 'zh-CN';
  return 'en';
}

export function brandKitCopy(locale?: string | null): BrandKitCopy {
  switch (normalizeBrandKitLocale(locale)) {
    case 'zh-CN':
      return ZH_CN;
    case 'zh-TW':
      return ZH_TW;
    default:
      return EN;
  }
}

export function localizedBrandKitAssetDefs(locale?: string | null): Array<{
  kind: string;
  label: string;
  desc: string;
  href: string;
}> {
  switch (normalizeBrandKitLocale(locale)) {
    case 'zh-CN':
      return [
        { kind: 'landing', label: '落地页', desc: 'Hero、功能区和 CTA - 品牌的网站门面', href: 'system/artifacts/landing.html' },
        { kind: 'deck', label: '演示文稿', desc: '16:9 幻灯片，支持键盘导航', href: 'system/artifacts/deck.html' },
        { kind: 'poster', label: '海报', desc: '印刷风关键视觉海报', href: 'system/artifacts/poster.html' },
        { kind: 'email', label: '邮件', desc: '兼容性优先的表格布局 HTML 邮件', href: 'system/artifacts/email.html' },
        { kind: 'newsletter', label: 'Newsletter', desc: '多故事邮件摘要', href: 'system/artifacts/newsletter.html' },
        { kind: 'form', label: '表单页', desc: '品牌化注册 / 联系表单', href: 'system/artifacts/form.html' },
      ];
    case 'zh-TW':
      return [
        { kind: 'landing', label: '落地頁', desc: 'Hero、功能區和 CTA - 品牌的網站門面', href: 'system/artifacts/landing.html' },
        { kind: 'deck', label: '簡報', desc: '16:9 投影片，支援鍵盤導覽', href: 'system/artifacts/deck.html' },
        { kind: 'poster', label: '海報', desc: '印刷風關鍵視覺海報', href: 'system/artifacts/poster.html' },
        { kind: 'email', label: '郵件', desc: '相容性優先的表格版 HTML 郵件', href: 'system/artifacts/email.html' },
        { kind: 'newsletter', label: 'Newsletter', desc: '多故事郵件摘要', href: 'system/artifacts/newsletter.html' },
        { kind: 'form', label: '表單頁', desc: '品牌化註冊 / 聯絡表單', href: 'system/artifacts/form.html' },
      ];
    default:
      return [
        { kind: 'landing', label: 'Landing page', desc: "Hero, features, CTA - the brand's web face", href: 'system/artifacts/landing.html' },
        { kind: 'deck', label: 'Pitch deck', desc: '16:9 slides with keyboard navigation', href: 'system/artifacts/deck.html' },
        { kind: 'poster', label: 'Poster', desc: 'Print-style key-art poster', href: 'system/artifacts/poster.html' },
        { kind: 'email', label: 'Email', desc: 'Bulletproof table-layout HTML email', href: 'system/artifacts/email.html' },
        { kind: 'newsletter', label: 'Newsletter', desc: 'Multi-story email digest', href: 'system/artifacts/newsletter.html' },
        { kind: 'form', label: 'Form page', desc: 'Signup / contact form, brand-styled', href: 'system/artifacts/form.html' },
      ];
  }
}
