import type { LandingLocaleCode } from './i18n';

export interface DownloadPromptCopy {
  eyebrow: string;
  title: string;
  body: string;
  benefits: readonly [string, string, string];
  primary: string;
  secondary: string;
  platformNote: string;
  closeLabel: string;
}

const COPY: Partial<Record<LandingLocaleCode, DownloadPromptCopy>> = {
  en: {
    eyebrow: 'OpenDesign Desktop',
    title: 'One design system. Every output unmistakably your brand',
    body: 'Inside the full Vibe Design Workspace, use the same brand rules across websites, slide decks, interactive prototypes, dashboards, images, and HTML video. Connect Codex, Claude Code, Cursor, and other coding agents already on your computer, then create locally for free.',
    benefits: [
      'Web, slides, prototypes, dashboards, images, and video',
      '140+ design systems, plus the full template and skill library',
      'Connect local Codex and 21+ coding agents · Free to use',
    ],
    primary: 'Download free',
    secondary: 'Keep browsing',
    platformNote: 'Available for macOS and Windows',
    closeLabel: 'Close download prompt',
  },
  zh: {
    eyebrow: 'OpenDesign 桌面客户端',
    title: '一套设计系统，让每一次创作都保持品牌一致',
    body: '在完整的 Vibe Design Workspace 中，用同一套品牌规则生成网页、PPT、可交互原型、数据看板、图像与 HTML 视频。连接本地 Codex、Claude Code、Cursor 等编程助手，即可免费创作。',
    benefits: [
      '覆盖网页、PPT、原型、数据看板、图像与视频',
      '140+ 设计系统，以及完整模板与技能库',
      '连接本地 Codex 与 21+ 款编程助手 · 免费使用',
    ],
    primary: '免费下载',
    secondary: '继续浏览',
    platformNote: '支持 macOS 与 Windows',
    closeLabel: '关闭下载提示',
  },
  ja: {
    eyebrow: 'OpenDesign デスクトップ版',
    title: 'ひとつのデザインシステムで、すべての制作物をブランドらしく',
    body: '完全な Vibe Design Workspace で、同じブランドルールを Web サイト、スライド、操作できるプロトタイプ、ダッシュボード、画像、HTML 動画に展開できます。ローカルの Codex、Claude Code、Cursor などを接続して無料で制作しましょう。',
    benefits: [
      'Web、スライド、プロトタイプ、ダッシュボード、画像、動画',
      '140+ のデザインシステムと完全なテンプレート／スキルライブラリ',
      'ローカル Codex と 21+ のコーディングエージェントを接続 · 無料',
    ],
    primary: '無料ダウンロード',
    secondary: '閲覧を続ける',
    platformNote: 'macOS と Windows に対応',
    closeLabel: 'ダウンロード案内を閉じる',
  },
  ko: {
    eyebrow: 'OpenDesign 데스크톱',
    title: '하나의 디자인 시스템으로 모든 결과물에 브랜드 일관성을',
    body: '완전한 Vibe Design Workspace에서 하나의 브랜드 규칙을 웹사이트, 슬라이드, 인터랙티브 프로토타입, 대시보드, 이미지, HTML 영상에 적용하세요. 로컬 Codex, Claude Code, Cursor 등을 연결해 무료로 제작할 수 있습니다.',
    benefits: [
      '웹, 슬라이드, 프로토타입, 대시보드, 이미지, 영상',
      '140개+ 디자인 시스템과 전체 템플릿·스킬 라이브러리',
      '로컬 Codex 및 21개+ 코딩 에이전트 연결 · 무료',
    ],
    primary: '무료 다운로드',
    secondary: '계속 둘러보기',
    platformNote: 'macOS, Windows 지원',
    closeLabel: '다운로드 안내 닫기',
  },
  de: {
    eyebrow: 'OpenDesign Desktop',
    title: 'Ein Designsystem. Jeder Output unverkennbar deine Marke',
    body: 'Im vollständigen Vibe Design Workspace gelten dieselben Markenregeln für Websites, Slides, interaktive Prototypen, Dashboards, Bilder und HTML-Videos. Verbinde Codex, Claude Code, Cursor und weitere lokale Coding-Agents und gestalte kostenlos.',
    benefits: [
      'Web, Slides, Prototypen, Dashboards, Bilder und Video',
      '140+ Designsysteme plus die vollständige Vorlagen- und Skill-Bibliothek',
      'Lokales Codex und 21+ Coding-Agents verbinden · Kostenlos',
    ],
    primary: 'Kostenlos herunterladen',
    secondary: 'Weiter ansehen',
    platformNote: 'Für macOS und Windows',
    closeLabel: 'Download-Hinweis schließen',
  },
  fr: {
    eyebrow: 'OpenDesign Desktop',
    title: 'Un seul design system. Votre marque, cohérente partout',
    body: 'Dans le Vibe Design Workspace complet, appliquez les mêmes règles de marque aux sites, slides, prototypes interactifs, dashboards, images et vidéos HTML. Connectez Codex, Claude Code, Cursor et vos autres agents de code locaux, puis créez gratuitement.',
    benefits: [
      'Sites, slides, prototypes, dashboards, images et vidéos',
      'Plus de 140 design systems et la bibliothèque complète de modèles et skills',
      'Codex local et plus de 21 agents de code · Gratuit',
    ],
    primary: 'Télécharger gratuitement',
    secondary: 'Continuer à explorer',
    platformNote: 'Disponible sur macOS et Windows',
    closeLabel: 'Fermer l’invitation au téléchargement',
  },
  ru: {
    eyebrow: 'OpenDesign для компьютера',
    title: 'Одна дизайн-система. Единый образ бренда во всех материалах',
    body: 'В полном Vibe Design Workspace одни и те же правила бренда работают для сайтов, слайдов, интерактивных прототипов, дашбордов, изображений и HTML-видео. Подключите локальные Codex, Claude Code, Cursor и другие кодинг-агенты и создавайте бесплатно.',
    benefits: [
      'Сайты, слайды, прототипы, дашборды, изображения и видео',
      'Более 140 дизайн-систем и полная библиотека шаблонов и навыков',
      'Локальный Codex и более 21 кодинг-агента · Бесплатно',
    ],
    primary: 'Скачать бесплатно',
    secondary: 'Продолжить просмотр',
    platformNote: 'Для macOS и Windows',
    closeLabel: 'Закрыть предложение скачать приложение',
  },
  es: {
    eyebrow: 'OpenDesign Desktop',
    title: 'Un sistema de diseño. Tu marca, coherente en cada resultado',
    body: 'En el Vibe Design Workspace completo, aplica las mismas reglas de marca a sitios web, presentaciones, prototipos interactivos, dashboards, imágenes y vídeo HTML. Conecta Codex, Claude Code, Cursor y otros agentes de código locales y crea gratis.',
    benefits: [
      'Web, presentaciones, prototipos, dashboards, imágenes y vídeo',
      'Más de 140 sistemas de diseño y la biblioteca completa de plantillas y skills',
      'Codex local y más de 21 agentes de código · Gratis',
    ],
    primary: 'Descargar gratis',
    secondary: 'Seguir explorando',
    platformNote: 'Disponible para macOS y Windows',
    closeLabel: 'Cerrar la invitación de descarga',
  },
  'pt-br': {
    eyebrow: 'OpenDesign Desktop',
    title: 'Um design system. Sua marca consistente em tudo',
    body: 'No Vibe Design Workspace completo, aplique as mesmas regras de marca a sites, apresentações, protótipos interativos, dashboards, imagens e vídeos HTML. Conecte Codex, Claude Code, Cursor e outros agentes de código locais e crie de graça.',
    benefits: [
      'Sites, apresentações, protótipos, dashboards, imagens e vídeo',
      'Mais de 140 design systems e a biblioteca completa de templates e skills',
      'Codex local e mais de 21 agentes de código · Grátis',
    ],
    primary: 'Baixar grátis',
    secondary: 'Continuar explorando',
    platformNote: 'Disponível para macOS e Windows',
    closeLabel: 'Fechar convite de download',
  },
  it: {
    eyebrow: 'OpenDesign Desktop',
    title: 'Un solo design system. Il tuo brand, coerente ovunque',
    body: 'Nel Vibe Design Workspace completo, applica le stesse regole di brand a siti, presentazioni, prototipi interattivi, dashboard, immagini e video HTML. Collega Codex, Claude Code, Cursor e gli altri agenti di coding locali e crea gratis.',
    benefits: [
      'Siti, presentazioni, prototipi, dashboard, immagini e video',
      'Oltre 140 design system e la libreria completa di template e skill',
      'Codex locale e oltre 21 agenti di coding · Gratis',
    ],
    primary: 'Scarica gratis',
    secondary: 'Continua a esplorare',
    platformNote: 'Disponibile per macOS e Windows',
    closeLabel: 'Chiudi l’invito al download',
  },
  tr: {
    eyebrow: 'OpenDesign Masaüstü',
    title: 'Tek tasarım sistemi. Her çıktıda tutarlı bir marka',
    body: 'Tam Vibe Design Workspace içinde aynı marka kurallarını web sitelerine, sunumlara, etkileşimli prototiplere, panolara, görsellere ve HTML videolara uygulayın. Yerel Codex, Claude Code, Cursor ve diğer kodlama ajanlarını bağlayıp ücretsiz üretin.',
    benefits: [
      'Web, sunum, prototip, pano, görsel ve video',
      '140+ tasarım sistemi ve eksiksiz şablon ile beceri kitaplığı',
      'Yerel Codex ve 21+ kodlama ajanını bağlayın · Ücretsiz',
    ],
    primary: 'Ücretsiz indir',
    secondary: 'Gezinmeye devam et',
    platformNote: 'macOS ve Windows için',
    closeLabel: 'İndirme önerisini kapat',
  },
};

export function getDownloadPromptCopy(locale: LandingLocaleCode): DownloadPromptCopy {
  return COPY[locale] ?? COPY.en!;
}
