import type { InputFieldSpec } from '@open-design/contracts';
import type { Locale } from './types';

const ZH_INPUT_LABELS: Record<string, string> = {
  'Artifact kind': '产物类型',
  Fidelity: '保真度',
  Audience: '目标受众',
  'Design system': '设计体系',
  Template: '模板',
  'Deck type': '幻灯片类型',
  Topic: '主题',
  'Slide count': '页数',
  'Speaker notes': '演讲者备注',
  'Media kind': '媒体类型',
  Model: '模型',
  Ratio: '比例',
  Subject: '主体',
  Style: '风格',
  Aspect: '画幅比例',
  'Aspect ratio': '画幅比例',
  Format: '格式',
  Duration: '时长',
  Prompt: '提示词',
  Text: '文本',
  'Audio type': '音频类型',
  Voice: '声音',
  'Audio/captions': '音频 / 字幕',
  Product: '产品',
  'Motion style': '运动风格',
};

const ZH_DISPLAY_VALUES: Record<string, string> = {
  'Select…': '请选择…',
  'Choose file…': '选择文件…',
  image: '图片',
  video: '视频',
  audio: '音频',
  'web prototype': '网页原型',
  wireframe: '线框稿',
  'high-fidelity': '高保真',
  'product evaluators': '产品评估者',
  'the active project design system': '当前项目的设计体系',
  'the bundled web prototype seed': '内置网页原型种子',
  'pitch deck': '路演幻灯片',
  'product overview': '产品概览幻灯片',
  'study deck': '学习型幻灯片',
  'strategy deck': '策略幻灯片',
  'sales deck': '销售幻灯片',
  "the user's brief": '用户的需求说明',
  'decision makers': '决策者',
  'include speaker notes': '包含演讲者备注',
  'no speaker notes': '不包含演讲者备注',
  'a polished product concept': '一个精致的产品概念',
  'a short product reveal': '一支简短的产品揭幕短片',
  'an HTML-driven motion composition': '一段由 HTML 驱动的动态构图',
  'a concise audio identity for a product': '一段简洁的产品音频识别',
  'a crisp product notification sound': '清脆的产品提示音',
  'cinematic, high-quality, on-brand': '电影感、高质量、符合品牌调性',
  'polished, kinetic, on-brand': '精致、有动势、符合品牌调性',
  'clear, polished, modern': '清晰、精致、现代',
  speech: '语音',
  sfx: '音效',
  Speech: '语音',
  'Sound effect': '音效',
  'No template': '无模板',
  '3d-stone-staircase-evolution-infographic': '3D 石阶演化信息图',
  '3D Stone Staircase Evolution Infographic': '3D 石阶演化信息图',
  'anime-martial-arts-battle-illustration': '动漫武术对决插画',
  'Anime Martial Arts Battle Illustration': '动漫武术对决插画',
  'e-commerce-live-stream-ui-mockup': '电商直播界面样机',
  'E-commerce Live Stream UI Mockup': '电商直播界面样机',
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': '动漫格斗游戏截图：龙牙队长对战风炼心',
  'Game Screenshot - Anime Fighting Game: Captain Ryuuga vs Kaze Renshin': '动漫格斗游戏截图：龙牙队长对战风炼心',
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': '三国 ARPG 截图：关羽斩颜良',
  'Game Screenshot - Three Kingdoms ARPG: Guan Yu Slaying Yan Liang': '三国 ARPG 截图：关羽斩颜良',
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': '三国 ARPG 截图：吕布辕门射戟',
  "Game Screenshot - Three Kingdoms ARPG: Lü Bu's Yuanmen Archery": '三国 ARPG 截图：吕布辕门射戟',
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': '三国 ARPG 截图：赵云长坂坡救主',
  "Game Screenshot - Three Kingdoms ARPG: Zhao Yun's Cradle Escape at Changbanpo": '三国 ARPG 截图：赵云长坂坡救主',
  'game-ui-ancient-china-open-world-mmo-hud': '古风开放世界 MMO 游戏 HUD',
  'Game UI - Ancient China Open-World MMO HUD': '古风开放世界 MMO 游戏 HUD',
  'illustrated-city-food-map': '城市美食插画地图',
  'Illustrated City Food Map': '城市美食插画地图',
  'illustration-crayon-kid-drawing-rework': '蜡笔童画重绘插画',
  'Illustration - Crayon Kid-Drawing Rework': '蜡笔童画重绘插画',
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': '宅舞编舞拆解信息图（极乐净土 16 格）',
  'Infographic - Otaku Dance Choreography Breakdown (Gokuraku Jodo, 16 Panels)': '宅舞编舞拆解信息图（极乐净土 16 格）',
  'momotaro-explainer-slide-in-hybrid-style': '混合风桃太郎讲解幻灯片',
  'Momotaro Explainer Slide in Hybrid Style': '混合风桃太郎讲解幻灯片',
  '3d-animated-boy-building-lego': '3D 动画男孩搭乐高',
  '3D Animated Boy Building Lego': '3D 动画男孩搭乐高',
  'a-decade-of-refinement-glow-up': '十年精修焕变',
  'A Decade of Refinement Glow-Up': '十年精修焕变',
  'ancient-guardian-dragon-rescue': '古代守护龙救援',
  'Ancient Guardian Dragon Rescue': '古代守护龙救援',
  'ancient-indian-kingdom-fpv-video': '古印度王国 FPV 视频',
  'Ancient Indian Kingdom FPV Video': '古印度王国 FPV 视频',
  'animation-transfer-and-camera-tracking-prompt': '动画迁移与镜头跟踪提示词',
  'Animation transfer and camera tracking prompt': '动画迁移与镜头跟踪提示词',
  'beat-synced-outfit-transformation-dance': '卡点换装舞蹈',
  'Beat-Synced Outfit Transformation Dance': '卡点换装舞蹈',
  'character-intro-motion-graphics-sequence': '角色介绍动态图形序列',
  'Character Intro Motion Graphics Sequence': '角色介绍动态图形序列',
  'cinematic-birthday-celebration-sequence': '电影感生日庆祝序列',
  'Cinematic Birthday Celebration Sequence': '电影感生日庆祝序列',
  'cinematic-dragon-interaction-flight': '电影感飞龙互动与飞行',
  'Cinematic Dragon Interaction & Flight': '电影感飞龙互动与飞行',
  'cinematic-east-asian-woman-hand-dance': '电影感东亚女性手势舞',
  'Cinematic East Asian Woman Hand Dance': '电影感东亚女性手势舞',
  'cinematic-emotional-face-close-up': '电影感情绪面部特写',
  'Cinematic Emotional Face Close-up': '电影感情绪面部特写',
  'cinematic-marine-biologist-exploration': '电影感海洋生物学家探索',
  'Cinematic Marine Biologist Exploration': '电影感海洋生物学家探索',
  'hyperframes-html-in-canvas-iphone-device': 'HyperFrames HTML 画布：3D iPhone 与 MacBook 产品演示',
  'HyperFrames HTML-in-Canvas: 3D iPhone + MacBook Product Demo': 'HyperFrames HTML 画布：3D iPhone 与 MacBook 产品演示',
  'hyperframes-html-in-canvas-text-cursor': 'HyperFrames HTML 画布：电影感文字光标揭示',
  'HyperFrames HTML-in-Canvas: Cinematic Text Cursor Reveal': 'HyperFrames HTML 画布：电影感文字光标揭示',
  'hyperframes-html-in-canvas-shatter': 'HyperFrames HTML 画布：玻璃碎裂片尾',
  'HyperFrames HTML-in-Canvas: Glass Shatter Outro': 'HyperFrames HTML 画布：玻璃碎裂片尾',
  'hyperframes-html-in-canvas-liquid-background': 'HyperFrames HTML 画布：液态背景主视觉',
  'HyperFrames HTML-in-Canvas: Liquid Background Hero': 'HyperFrames HTML 画布：液态背景主视觉',
  'hyperframes-html-in-canvas-liquid-glass': 'HyperFrames HTML 画布：液态玻璃落地页揭示',
  'HyperFrames HTML-in-Canvas: Liquid Glass Landing Reveal': 'HyperFrames HTML 画布：液态玻璃落地页揭示',
  'hyperframes-html-in-canvas-magnetic': 'HyperFrames HTML 画布：磁场可视化',
  'HyperFrames HTML-in-Canvas: Magnetic Field Visualisation': 'HyperFrames HTML 画布：磁场可视化',
  'hyperframes-html-in-canvas-portal-reveal': 'HyperFrames HTML 画布：门户揭示仪表盘',
  'HyperFrames HTML-in-Canvas: Portal Reveal Dashboard': 'HyperFrames HTML 画布：门户揭示仪表盘',
  'hyperframes-money-counter-hype': 'HyperFrames：0 到 1 万美元金额计数动效（9:16）',
  'HyperFrames: $0 → $10K Money Counter Hype (9:16)': 'HyperFrames：0 到 1 万美元金额计数动效（9:16）',
  'hyperframes-app-showcase-three-phones': 'HyperFrames：12 秒 App 展示，三台悬浮手机',
  'HyperFrames: 12-Second App Showcase — Three Floating Phones': 'HyperFrames：12 秒 App 展示，三台悬浮手机',
  'hyperframes-brand-sizzle-reel': 'HyperFrames：30 秒品牌高燃短片',
  'HyperFrames: 30-Second Brand Sizzle Reel': 'HyperFrames：30 秒品牌高燃短片',
  'hyperframes-saas-product-promo-30s': 'HyperFrames：30 秒 SaaS 产品宣传片（Linear 风格）',
  'HyperFrames: 30-Second SaaS Product Promo (Linear-style)': 'HyperFrames：30 秒 SaaS 产品宣传片（Linear 风格）',
  'hyperframes-logo-outro-cinematic': 'HyperFrames：4 秒电影感标志片尾',
  'HyperFrames: 4-Second Cinematic Logo Outro': 'HyperFrames：4 秒电影感标志片尾',
  'product reveal': '产品揭幕',
  'captioned short': '带字幕短片',
  'logo outro': '标志片尾',
  'audio-reactive visual': '音频响应视觉',
  'scene transition sequence': '场景转场序列',
  'minimal premium motion': '极简高级动效',
  'no audio or captions unless requested': '除非特别要求，否则不添加音频或字幕',
  '5 seconds': '5 秒',
  '3s': '3 秒',
  '5s': '5 秒',
  '8s': '8 秒',
  '10s': '10 秒',
  '15s': '15 秒',
  '30s': '30 秒',
  '60s': '60 秒',
  '120s': '120 秒',
  'minimal reveal': '极简揭幕',
  'kinetic typography': '动态字体',
  'data pulse': '数据脉冲',
};

const ZH_PLACEHOLDERS: Record<string, string> = {
  'SaaS landing page': 'SaaS 落地页',
  'startup founders evaluating an AI CRM': '正在评估 AI CRM 的创业者',
  'OpenAI, Linear, shadcn, or custom brand notes': 'OpenAI、Linear、shadcn 或自定义品牌说明',
  'marketing homepage, dashboard, docs page': '营销首页、仪表盘、文档页',
  'AI operations platform for modern support teams': '面向现代客服团队的 AI 运营平台',
  'Series A investors': 'A 轮投资人',
  'Swiss, Linear, editorial, or active project design system': '瑞士风、Linear、编辑风，或当前项目设计体系',
  'A neon-lit dashboard with floating glass cards': '一块霓虹灯照亮、漂浮玻璃卡片组成的仪表盘',
  'cinematic, soft volumetric light': '电影感、柔和体积光',
  'a premium AI note-taking app': '一款高端 AI 笔记应用',
  'minimal premium, soft side light, restrained motion': '极简高级、柔和侧光、克制动效',
  'muted, TTS narration, captions from transcript': '静音、TTS 旁白，或根据转写生成字幕',
  'Describe the sound effect': '描述这个音效',
  'Text to turn into audio': '要转成音频的文本',
  'Loading configured ElevenLabs voices...': '正在加载已配置的 ElevenLabs 声音...',
};

const ZH_TEMPLATE_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['使用这个插件完成以下任务：', ''],
  ['HTML deck', 'HTML 幻灯片'],
  [
    'Build a {{fidelity}} {{artifactKind}} for {{audience}}. Use {{designSystem}} as the design-system direction and start from {{template}}. Single self-contained HTML file built by copying the seed `assets/template.html` and pasting section layouts from `references/layouts.md`.',
    '为 {{audience}} 构建一个{{fidelity}}{{artifactKind}}。设计系统方向使用 {{designSystem}}，从 {{template}} 开始。复制 `assets/template.html` 种子并从 `references/layouts.md` 粘贴版面，输出单文件 HTML。',
  ],
  [
    'Create a {{slideCount}}-slide {{deckType}} for {{audience}} about {{topic}}. Speaker notes: {{speakerNotes}}. Use {{designSystem}} as the design-system direction. Build a single-file horizontal-swipe HTML deck by copying `assets/template.html` and pasting slide layouts from `references/layouts.md`.',
    '为 {{audience}} 创建 {{slideCount}} 页{{deckType}}，主题是 {{topic}}。演讲者备注：{{speakerNotes}}。设计系统方向使用 {{designSystem}}。复制 `assets/template.html` 并从 `references/layouts.md` 粘贴版面，构建单文件横向滑动 HTML 幻灯片。',
  ],
  [
    'Generate a {{mediaKind}} of {{subject}}. Style: {{style}}. Aspect: {{aspect}}. Use the media-* atom that matches the project kind, then wrap the result in a live artifact for preview. Iterate on the critique signal until it converges.',
    '生成{{mediaKind}}：{{subject}}。风格：{{style}}。画幅：{{aspect}}。使用与项目类型匹配的 media-* 原子能力，并把结果包装成实时制品用于预览。根据评审信号持续迭代，直到结果收敛。',
  ],
  [
    'Create a {{duration}}-second {{format}} HyperFrames composition for {{subject}}. Aspect: {{aspect}}. Visual style: {{style}}. Audio/captions: {{audioPlan}}. Use the HyperFrames HTML workflow, deterministic timelines, and the referenced motion guides.',
    '为 {{subject}} 创建一个 {{duration}}的 {{format}} HyperFrames 作品。画幅：{{aspect}}。视觉风格：{{style}}。音频/字幕：{{audioPlan}}。使用 HyperFrames HTML 工作流、确定性时间线和引用的运动指南。',
  ],
  [
    'Create a {{duration}} HyperFrames launch composition for {{product}} with {{motionStyle}} motion.',
    '为 {{product}} 创建一个 {{duration}} 的 HyperFrames 发布动效，运动风格为 {{motionStyle}}。',
  ],
  [
    'Create a premium product-studio image using {{designSystem}}: elegant composition, refined lighting, restrained color, rich material detail, and commercial campaign-level polish. Render with {{model}} at {{ratio}} in {{resolution}} resolution.',
    '使用 {{designSystem}} 创建高级产品工作室图片：优雅构图、精致光影、克制色彩、丰富材质细节，并达到商业广告级质感。使用 {{model}}，以 {{ratio}}、{{resolution}} 分辨率渲染。',
  ],
  [
    'Create a premium product-studio video using {{designSystem}}: cinematic product pacing, elegant motion, refined lighting, and a polished launch-film feel. Render with {{model}} at {{ratio}} for {{duration}} seconds in {{resolution}} resolution.',
    '使用 {{designSystem}} 创建高级产品工作室视频：电影感产品节奏、优雅动效、精致光影和发布片质感。使用 {{model}}，以 {{ratio}}、时长 {{duration}}、{{resolution}} 分辨率渲染。',
  ],
  [
    'Create a premium product-studio HyperFrames video at {{ratio}} for {{duration}} seconds: refined kinetic typography, elegant transitions, restrained motion language, and studio-grade timing.',
    '创建 {{ratio}}、时长 {{duration}} 的高级产品工作室 HyperFrames 视频：精致动态字体、优雅转场、克制动效语言和工作室级节奏。',
  ],
  [
    'Create premium product-studio audio from {{prompt}} using {{model}} for {{duration}} seconds: crisp, elegant, memorable, and brand-ready.',
    '使用 {{model}}，根据 {{prompt}} 创建时长 {{duration}}的高级产品工作室音频：清脆、优雅、易记，适合品牌使用。',
  ],
  [
    'Create premium product-studio audio from {{text}} using {{model}} for {{duration}} seconds with {{voice}}: polished, restrained, clear, and brand-ready.',
    '使用 {{model}} 和 {{voice}}，把 {{text}} 转成时长 {{duration}}的高级产品工作室音频：精致、克制、清晰，适合品牌使用。',
  ],
  [
    'Create premium product-studio audio from {{text}} using {{model}} for {{duration}} seconds: polished, restrained, clear, and brand-ready.',
    '使用 {{model}}，把 {{text}} 转成时长 {{duration}}的高级产品工作室音频：精致、克制、清晰，适合品牌使用。',
  ],
  [
    'Create an image using {{template}}, with {{model}} at {{ratio}}.',
    '使用 {{template}} 和 {{model}}，以 {{ratio}} 生成图片。',
  ],
  [
    'Create a video using {{template}}, with {{model}} at {{ratio}} for {{duration}} seconds.',
    '使用 {{template}} 和 {{model}}，以 {{ratio}} 生成时长 {{duration}}的视频。',
  ],
  [
    'Create a HyperFrames video using {{template}} at {{ratio}} for {{duration}} seconds.',
    '使用 {{template}}，以 {{ratio}} 创建时长 {{duration}}的 HyperFrames 视频。',
  ],
  [
    'Create {{audioType}} audio from {{prompt}} using {{model}} for {{duration}} seconds.',
    '使用 {{model}}，根据 {{prompt}} 创建时长 {{duration}}的{{audioType}}音频。',
  ],
  [
    'Create {{audioType}} audio from {{text}} using {{model}} for {{duration}} seconds with {{voice}}.',
    '使用 {{model}} 和 {{voice}}，把 {{text}} 转成时长 {{duration}}的{{audioType}}音频。',
  ],
  [
    'Create {{audioType}} audio from {{text}} using {{model}} for {{duration}} seconds.',
    '使用 {{model}}，把 {{text}} 转成时长 {{duration}}的{{audioType}}音频。',
  ],
  [
    'Generate a {{artifactKind}} for {{audience}} on {{topic}}. Use the discovery → plan → generate → critique loop and stop when the critique score converges or the iteration ceiling is hit.',
    '为 {{audience}} 生成一个{{artifactKind}}，主题是 {{topic}}。使用“发现 → 规划 → 生成 → 评审”循环，在评审分数收敛或达到迭代上限时停止。',
  ],
];

export function localizePluginInputLabel(locale: Locale, field: InputFieldSpec): string {
  const label = field.label ?? field.name;
  return locale === 'zh-CN' ? ZH_INPUT_LABELS[label] ?? label : label;
}

export function localizePluginPlaceholder(
  locale: Locale,
  value: string | undefined,
  fallback: string = '',
): string {
  const placeholder = value ?? fallback;
  if (locale !== 'zh-CN') return placeholder;
  return ZH_PLACEHOLDERS[placeholder] ?? ZH_DISPLAY_VALUES[placeholder] ?? placeholder;
}

export function localizePluginDisplayValue(locale: Locale, value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return locale === 'zh-CN' ? ZH_DISPLAY_VALUES[text] ?? text : text;
}

function localizePluginTemplateValue(locale: Locale, key: string, value: unknown): string {
  if (locale === 'zh-CN' && key === 'duration') {
    const text = String(value);
    if (/^\d+(?:\.\d+)?$/.test(text)) return `${text} 秒`;
  }
  return localizePluginDisplayValue(locale, value);
}

export function localizePluginInputValues(
  locale: Locale,
  values: Record<string, unknown>,
  fields: InputFieldSpec[] = [],
): Record<string, unknown> {
  if (locale !== 'zh-CN') return values;
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'string' || typeof value === 'number'
        ? localizePluginTemplateInputValue(locale, key, value, fieldByName.get(key))
        : value,
    ]),
  );
}

export function localizePluginBriefTemplate(locale: Locale, template: string | null): string | null {
  if (template === null || locale !== 'zh-CN') return template;
  let next = template;
  for (const [from, to] of ZH_TEMPLATE_REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  return next;
}

export function renderLocalizedPluginBriefTemplate(
  locale: Locale,
  template: string,
  inputs: Record<string, unknown>,
  fields: InputFieldSpec[] = [],
): string {
  const localizedTemplate = localizePluginBriefTemplate(locale, template) ?? template;
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  return localizedTemplate.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key) => {
    if (key in inputs) {
      const value = inputs[key];
      if (value === undefined || value === null || value === '') return full;
      return localizePluginTemplateInputValue(locale, key, value, fieldByName.get(key));
    }
    return full;
  });
}

function localizePluginTemplateInputValue(
  locale: Locale,
  key: string,
  value: unknown,
  field: InputFieldSpec | undefined,
): string {
  if (locale === 'zh-CN' && field?.type === 'select' && Array.isArray(field.options)) {
    const raw = String(value);
    const label = optionLabelMap(field)[raw];
    if (label) return localizePluginDisplayValue(locale, label);
  }
  return localizePluginTemplateValue(locale, key, value);
}

export function rawPluginValueFromLocalizedDisplay(
  locale: Locale,
  field: InputFieldSpec,
  value: string,
): string | null {
  if (locale !== 'zh-CN' || !Array.isArray(field.options)) return null;
  const trimmed = value.trim();
  const optionLabels = optionLabelMap(field);
  for (const option of field.options) {
    const label = optionLabels[option];
    const candidates = [
      option,
      label,
      localizePluginDisplayValue(locale, option),
      label ? localizePluginDisplayValue(locale, label) : undefined,
      localizePluginTemplateValue(locale, field.name, option),
      label ? localizePluginTemplateValue(locale, field.name, label) : undefined,
    ];
    if (candidates.some((candidate) => candidate !== undefined && String(candidate).trim() === trimmed)) {
      return option;
    }
  }
  return null;
}

function optionLabelMap(field: InputFieldSpec): Record<string, string> {
  const labels = (field as { optionLabels?: unknown }).optionLabels;
  return labels && typeof labels === 'object' && !Array.isArray(labels)
    ? labels as Record<string, string>
    : {};
}
