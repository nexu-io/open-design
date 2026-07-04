import type { InputFieldSpec } from '@open-design/contracts';
import type { Locale } from './types';

type PluginChromeKey =
  | 'about'
  | 'applying'
  | 'assets'
  | 'atoms'
  | 'author'
  | 'by'
  | 'capabilities'
  | 'capabilitiesHint'
  | 'claudePlugins'
  | 'closeDetails'
  | 'closeEsc'
  | 'connectors'
  | 'contextBundles'
  | 'contextBundlesHint'
  | 'contribute'
  | 'copy'
  | 'copied'
  | 'craft'
  | 'defaultPrefix'
  | 'designSpecOnly'
  | 'designSystem'
  | 'details'
  | 'detailsAria'
  | 'developerDetails'
  | 'examplePrefix'
  | 'exampleQuery'
  | 'exampleQueryHint'
  | 'genuiSurfaces'
  | 'genuiSurfacesHint'
  | 'homepage'
  | 'image'
  | 'inputs'
  | 'inputsHint'
  | 'installed'
  | 'license'
  | 'marketplaceId'
  | 'mcpServers'
  | 'moreWaysTo'
  | 'onFailurePrefix'
  | 'openContributePage'
  | 'openIssueOnGithub'
  | 'optional'
  | 'origin'
  | 'path'
  | 'persistsAt'
  | 'pinnedRef'
  | 'pluginInfo'
  | 'primary'
  | 'repeat'
  | 'required'
  | 'source'
  | 'spec'
  | 'skills'
  | 'trust'
  | 'untilPrefix'
  | 'version'
  | 'video'
  | 'audio'
  | 'workflow'
  | 'workflowHint';

const EN_PLUGIN_CHROME: Record<PluginChromeKey, string> = {
  about: 'About',
  applying: 'Applying…',
  assets: 'Assets',
  atoms: 'Atoms',
  author: 'Author',
  by: 'by',
  capabilities: 'Capabilities',
  capabilitiesHint: 'Permissions the plugin requests when applied.',
  claudePlugins: 'Claude plugins',
  closeDetails: 'Close details',
  closeEsc: 'Close (Esc)',
  connectors: 'Connectors',
  contextBundles: 'Context bundles',
  contextBundlesHint:
    'Skills, design systems, MCP servers and other refs the plugin will pull in at apply time.',
  contribute: 'Contribute',
  copy: 'Copy',
  copied: 'Copied',
  craft: 'Craft',
  defaultPrefix: 'default:',
  designSpecOnly:
    'This plugin ships only the design spec — open Plugin info to read DESIGN.md.',
  designSystem: 'Design system',
  details: 'details',
  detailsAria: '{title} details',
  developerDetails: 'Developer details',
  examplePrefix: 'e.g.',
  exampleQuery: 'Example query',
  exampleQueryHint: 'Inserted into the prompt textarea when you apply this plugin.',
  genuiSurfaces: 'GenUI surfaces',
  genuiSurfacesHint: 'Interactive prompts the plugin may surface during a run.',
  homepage: 'Homepage',
  image: 'Image',
  inputs: 'Inputs',
  inputsHint: 'Variables substituted into the example query at apply time.',
  installed: 'Installed',
  license: 'License',
  marketplaceId: 'Marketplace ID',
  mcpServers: 'MCP servers',
  moreWaysTo: 'More ways to {label}',
  onFailurePrefix: 'on failure:',
  openContributePage: 'Open the contribute page',
  openIssueOnGithub: 'Open an issue on GitHub',
  optional: 'Optional',
  origin: 'Origin',
  path: 'Path',
  persistsAt: 'persists at',
  pinnedRef: 'Pinned ref',
  pluginInfo: 'Plugin info',
  primary: 'primary',
  repeat: 'repeat',
  required: 'required',
  source: 'Source',
  spec: 'Spec',
  skills: 'Skills',
  trust: 'Trust',
  untilPrefix: 'until:',
  version: 'Version',
  video: 'Video',
  audio: 'Audio',
  workflow: 'Workflow',
  workflowHint:
    'Pipeline stages run in order. Atoms inside a stage run sequentially unless the stage repeats.',
};

const ZH_PLUGIN_CHROME: Partial<Record<PluginChromeKey, string>> = {
  about: '简介',
  applying: '正在应用…',
  assets: '资产',
  atoms: 'Atoms',
  author: '作者',
  by: '作者',
  capabilities: '能力',
  capabilitiesHint: '插件应用时请求的权限。',
  claudePlugins: 'Claude 插件',
  closeDetails: '关闭详情',
  closeEsc: '关闭（Esc）',
  connectors: '连接器',
  contextBundles: '上下文包',
  contextBundlesHint: '插件应用时会拉取的技能、设计体系、MCP 服务和其他引用。',
  contribute: '贡献',
  copy: '复制',
  copied: '已复制',
  craft: '工艺规则',
  defaultPrefix: '默认：',
  designSpecOnly:
    '这个插件只提供设计规范，请打开插件信息查看 DESIGN.md。',
  designSystem: '设计体系',
  details: '详情',
  detailsAria: '{title} 详情',
  developerDetails: '开发者详情',
  examplePrefix: '例如：',
  exampleQuery: '示例请求',
  exampleQueryHint: '应用这个插件时会插入到提示词输入框。',
  genuiSurfaces: 'GenUI 界面',
  genuiSurfacesHint: '插件运行过程中可能展示的交互式提示。',
  homepage: '主页',
  image: '图片',
  inputs: '输入项',
  inputsHint: '应用时会替换到示例请求里的变量。',
  installed: '安装时间',
  license: '许可证',
  marketplaceId: '市场 ID',
  mcpServers: 'MCP 服务',
  moreWaysTo: '更多使用方式：{label}',
  onFailurePrefix: '失败时：',
  openContributePage: '打开贡献页面',
  openIssueOnGithub: '在 GitHub 打开 issue',
  optional: '可选',
  origin: '来源',
  path: '路径',
  persistsAt: '持久化到',
  pinnedRef: '固定引用',
  pluginInfo: '插件信息',
  primary: '主',
  repeat: '重复',
  required: '必填',
  source: '来源',
  spec: '规范',
  skills: '技能',
  trust: '信任',
  untilPrefix: '直到：',
  version: '版本',
  video: '视频',
  audio: '音频',
  workflow: '工作流',
  workflowHint: '流水线阶段会按顺序运行；阶段内的 atoms 默认顺序执行，除非该阶段设置了重复。',
};

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

export function localizePluginChrome(
  locale: Locale,
  key: PluginChromeKey,
  vars: Record<string, string | number> = {},
): string {
  const phrase =
    locale === 'zh-CN'
      ? ZH_PLUGIN_CHROME[key] ?? EN_PLUGIN_CHROME[key]
      : EN_PLUGIN_CHROME[key];
  return phrase.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
