/** Creation policy only. The renderer and existing project resources remain available. */
export const RETIRED_HYPERFRAMES_MESSAGE = 'This official HyperFrames content has been retired. Use Motion for new creations. Existing projects remain available.';

export const RETIRED_HYPERFRAMES_PROMPT_TEMPLATE_IDS: readonly string[] = [
  'hyperframes-app-showcase-three-phones',
  'hyperframes-brand-sizzle-reel',
  'hyperframes-data-bar-chart-race',
  'hyperframes-flight-map-route',
  'hyperframes-html-in-canvas-iphone-device',
  'hyperframes-html-in-canvas-liquid-background',
  'hyperframes-html-in-canvas-liquid-glass',
  'hyperframes-html-in-canvas-magnetic',
  'hyperframes-html-in-canvas-portal-reveal',
  'hyperframes-html-in-canvas-shatter',
  'hyperframes-html-in-canvas-text-cursor',
  'hyperframes-logo-outro-cinematic',
  'hyperframes-money-counter-hype',
  'hyperframes-product-reveal-minimal',
  'hyperframes-saas-product-promo-30s',
  'hyperframes-social-overlay-stack',
  'hyperframes-tiktok-karaoke-talking-head',
  'hyperframes-website-to-video-promo',
];

const pluginIds = new Set([
  'example-hyperframes',
  'example-video-hyperframes',
  ...RETIRED_HYPERFRAMES_PROMPT_TEMPLATE_IDS.map(id => `video-template-${id}`),
]);

export function isRetiredHyperFramesPlugin(plugin: {
  id?: string | undefined;
  sourceKind?: string | undefined;
  sourceMarketplaceId?: string | null | undefined;
  resolvedSource?: string | null | undefined;
  source?: string | undefined;
}): boolean {
  const installedOfficial = [plugin.resolvedSource, plugin.source].some(source =>
    /^github:nexu-io\/open-design(?:@[^\s]+)?\/plugins\/_official\//i.test(source ?? ''));
  return (plugin.sourceKind === 'bundled' || Boolean(installedOfficial)) && pluginIds.has(plugin.id ?? '');
}

/** Callers must also verify the resource belongs to an official root. */
export function isRetiredHyperFramesSkillId(id: string): boolean {
  return ['hyperframes', 'video-hyperframes'].some(base => id === base || id.startsWith(`${base}:`));
}

/** Only applies to the bundled prompt-template registry, not user-authored templates. */
export function isRetiredHyperFramesPromptTemplate(surface: string, id: string): boolean {
  return surface === 'video' && RETIRED_HYPERFRAMES_PROMPT_TEMPLATE_IDS.includes(id);
}
