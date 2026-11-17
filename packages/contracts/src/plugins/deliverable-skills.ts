export const DELIVERABLE_SKILL_CATALOG_VERSION = '2.2.9';

/** Main deliverable catalog. Describes outputs; never a machine-plan admission gate. */
export const DELIVERABLE_SKILL_IDS = [
  'prototype', 'ppt', 'document', 'image', 'web-clone',
  'motion-design', 'hyperframes', 'webgl', 'live-artifact', 'video', 'audio',
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
  { id: 'prototype', title: 'Prototype', description: 'Websites, application interfaces, and interaction flows; excludes reference-page recreation, source-backed refreshable views, manuals, presentations, and other outputs selected only because they use HTML.', version: '3.1.9', routes: [{ id: 'prototype-html', kind: 'prototype', extensions: ['html'] }] },
  { id: 'ppt', title: 'Presentation', description: 'Reports and presentations delivered as HTML slides, including slide layout and navigation without a separate prototype Skill; the product provides PDF/PPTX export.', version: '3.1.0', routes: [{ id: 'ppt-html', kind: 'presentation', extensions: ['html'] }] },
  { id: 'document', title: 'Document', description: 'Reports, manuals, and long-form content delivered as formatted HTML documents; do not promise DOCX.', version: '3.1.1', routes: [{ id: 'document-html', kind: 'document', extensions: ['html'] }] },
  { id: 'image', title: 'Image', description: 'Use media generation for image files; use HTML only when editable layout source is explicitly requested.', version: '3.1.1', routes: [{ id: 'media-image', kind: 'image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }, { id: 'image-html', kind: 'source', extensions: ['html'] }] },
  { id: 'web-clone', title: 'Web Clone', description: 'Recreate a specified reference page from a URL, screenshot, supplied HTML, or source code, preserving requested structure and behavior plus source attribution and authorization boundaries.', version: '3.1.1', routes: [{ id: 'web-clone-html', kind: 'prototype', extensions: ['html'] }] },
  { id: 'motion-design', title: 'Motion Design', description: 'Default for video-making requests without an explicit video model or production method: deliver editable HTML and local assets plus a rendered MP4. Independently requested pointer/scroll-driven motion delivers interactive HTML. The HyperFrames renderer is an implementation dependency, not another main Skill.', version: '3.2.0', routes: [{ id: 'hyperframes-html', kind: 'source', extensions: ['html'] }, { id: 'media-video', kind: 'video', extensions: ['mp4'] }] },
  { id: 'hyperframes', title: 'HyperFrames', description: 'Independently requested editable timeline-animation HTML source, not an internal renderer composition for MP4; a request for both editable source and MP4 also selects video.', version: '3.1.0', routes: [{ id: 'hyperframes-html', kind: 'source', extensions: ['html'] }] },
  { id: 'webgl', title: 'WebGL', description: 'GPU, shaders, and interactive 3D delivered as real-time HTML.', version: '3.1.1', routes: [{ id: 'webgl-html', kind: 'interactive', extensions: ['html'] }] },
  { id: 'live-artifact', title: 'Live Artifact', description: 'Views that refresh from local JSON or connected data, including task lists and dashboards; register the actual source, then refresh the same artifact without rebuilding its template.', version: '3.1.5', routes: [{ id: 'live-artifact', kind: 'live', extensions: ['html'] }] },
  { id: 'video', title: 'Video', description: 'Video made with the explicitly required video-generation model or production method; preserve that selection and report unavailable capabilities without substituting Motion. Unspecified video-making requests use motion-design.', version: '3.1.6', routes: [{ id: 'media-video', kind: 'video', extensions: ['mp4'] }] },
  { id: 'audio', title: 'Audio', description: 'Narration, music, and sound effects delivered as actual audio files through media interfaces.', version: '3.1.3', routes: [{ id: 'media-audio', kind: 'audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }] },
];

export function renderDeliverableSkillCatalog(skillRoot: string): string {
  return DELIVERABLE_SKILLS.map((skill) =>
    `- ${skill.id} (${skill.title}, v${skill.version}): ${skill.description} Read ${skillRoot}/${skill.id}.md; production routes: ${skill.routes.map((route) => `${route.id} / kind=${route.kind} / ${route.extensions.join(',')}`).join('; ')}`,
  ).join('\n');
}
