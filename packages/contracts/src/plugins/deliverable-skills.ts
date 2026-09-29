export const DELIVERABLE_SKILL_CATALOG_VERSION = '2.0.0';

/** Main deliverable catalog. Describes outputs; never a machine-plan admission gate. */
export const DELIVERABLE_SKILL_IDS = [
  'prototype', 'ppt', 'document', 'image', 'web-clone',
  'hyperframes', 'webgl', 'live-artifact', 'video', 'audio',
] as const;
export type DeliverableSkillId = typeof DELIVERABLE_SKILL_IDS[number];

export const DELIVERABLE_PRODUCTION_ROUTES = [
  'prototype-html', 'ppt-html', 'document-html', 'media-image', 'image-html',
  'web-clone-html', 'hyperframes-html', 'webgl-html', 'live-artifact', 'media-video', 'media-audio',
] as const;
export type DeliverableProductionRoute = typeof DELIVERABLE_PRODUCTION_ROUTES[number];

export interface DeliverableSkillDefinition {
  id: DeliverableSkillId;
  title: string;
  description: string;
  version: string;
  routes: readonly { id: DeliverableProductionRoute; kind: string; extensions: readonly string[] }[];
}
export const DELIVERABLE_SKILLS: readonly DeliverableSkillDefinition[] = [
  { id: 'prototype', title: '原型', description: '网页、应用界面、交互流程；交付可操作 HTML。', routes: [{ id: 'prototype-html', kind: 'prototype', extensions: ['html'] }] },
  { id: 'ppt', title: '幻灯片', description: '汇报与演示；交付 HTML 幻灯片，产品提供 PDF/PPTX 导出。', routes: [{ id: 'ppt-html', kind: 'presentation', extensions: ['html'] }] },
  { id: 'document', title: '文档', description: '报告、说明书、长文；交付排版 HTML 文档，不承诺 DOCX。', routes: [{ id: 'document-html', kind: 'document', extensions: ['html'] }] },
  { id: 'image', title: '图片', description: '图片文件使用媒体生成；明确要求可编辑排版源码时使用 HTML。', routes: [{ id: 'media-image', kind: 'image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }, { id: 'image-html', kind: 'source', extensions: ['html'] }] },
  { id: 'web-clone', title: '网站复刻', description: '参考指定网址或截图重建网页，保留来源与授权边界。', routes: [{ id: 'web-clone-html', kind: 'prototype', extensions: ['html'] }] },
  { id: 'hyperframes', title: 'HyperFrames', description: '可编辑时间线动画 HTML 源码；需要实际 MP4 时另声明 video 交付物。', routes: [{ id: 'hyperframes-html', kind: 'source', extensions: ['html'] }] },
  { id: 'webgl', title: 'WebGL', description: 'GPU、着色器、交互 3D；交付可实时运行的 HTML。', routes: [{ id: 'webgl-html', kind: 'interactive', extensions: ['html'] }] },
  { id: 'live-artifact', title: '实时产物', description: '可刷新数据看板；调用现有注册接口生成预览，保留真实来源。', routes: [{ id: 'live-artifact', kind: 'live', extensions: ['html'] }] },
  { id: 'video', title: '视频', description: '可播放的视频文件；媒体生成或声明的动画渲染完成后交付 MP4。', routes: [{ id: 'media-video', kind: 'video', extensions: ['mp4'] }] },
  { id: 'audio', title: '音频', description: '配音、音乐、音效；通过媒体接口交付真实音频文件。', routes: [{ id: 'media-audio', kind: 'audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }] },
].map((skill) => ({ ...skill, version: '3.0.0' })) as readonly DeliverableSkillDefinition[];

export function renderDeliverableSkillCatalog(skillRoot: string): string {
  return DELIVERABLE_SKILLS.map((skill) =>
    `- ${skill.id} (${skill.title}, v${skill.version}): ${skill.description} 读取 ${skillRoot}/${skill.id}.md；制作方式：${skill.routes.map((route) => `${route.id} / kind=${route.kind} / ${route.extensions.join(',')}`).join('；')}`,
  ).join('\n');
}
