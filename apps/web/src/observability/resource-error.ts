// Resource-loading error observer.
//
// The bubbling `error` event (registered with capture=false) catches
// thrown JS errors but NOT failed resource loads — `<script>`, `<link>`,
// `<img>`, etc. emit an `error` event that does not propagate. To pick
// those up we register a *capturing* listener on `window`. This is the
// canonical browser pattern for chunk-load failures, which we very much
// want to know about: a missing `_next/static/chunks/xxx.js` results in
// a non-functional app with no JS exception.
//
// Resource URLs are not assumed to be product-owned. Project files, generated
// artifacts, third-party media, signed query strings, and even credentials can
// all reach a resource-bearing DOM attribute. This observer therefore owns a
// strict allowlist boundary: only known product paths and Next.js chunk paths
// retain a path; every user/external resource is reduced to a route template,
// tag-derived type, extension, and origin relation.

import { reportSafetyEvent } from '../analytics/error-tracking';

const RESOURCE_TAGS = new Set([
  'SCRIPT',
  'LINK',
  'IMG',
  'IFRAME',
  'AUDIO',
  'VIDEO',
  'SOURCE',
  'TRACK',
]);

const RESOURCE_ERROR_WINDOW_MS = 60_000;
const MAX_TRACKED_RESOURCES = 128;

const PRODUCT_ASSET_ROOTS = new Set([
  'agent-icons',
  'community-templates',
  'editor-icons',
  'fonts',
  'go-plan',
  'mock-covers',
  'model-icons',
  'onboarding',
  'team-avatars',
  'upgrade',
]);

const PRODUCT_ROOT_FILES = new Set([
  'app-icon.png',
  'app-icon.svg',
  'avatar.png',
  'brand-icon.svg',
  'composer-matrix-loader.svg',
  'composer-send.mp4',
  'drafts-empty-mark.png',
  'logo-03.svg',
  'logo-mark.svg',
  'logo-scan.svg',
  'logo-tiles.svg',
  'logo.png',
  'logo.svg',
  'od-notifications-sw.js',
  'official_badge.svg',
  'remixicon.ttf',
  'remixicon.woff2',
  'startup-animation.webm',
]);

const SAFE_RESOURCE_EXTENSIONS = new Set([
  'aac', 'avif', 'bmp', 'cjs', 'css', 'csv', 'eot', 'flac', 'gif', 'htm',
  'html', 'ico', 'jpeg', 'jpg', 'js', 'json', 'm4a', 'm4v', 'md', 'mjs',
  'mov', 'mp3', 'mp4', 'ogg', 'otf', 'pdf', 'png', 'srt', 'svg', 'tsv',
  'ttf', 'txt', 'vtt', 'wav', 'webm', 'webp', 'woff', 'woff2', 'xml', 'yaml',
  'yml', 'zip',
]);

type ResourceCategory =
  | 'next_chunk'
  | 'product_asset'
  | 'user_artifact'
  | 'external_media';

interface NormalizedResource {
  category: ResourceCategory;
  normalized_resource: string;
  origin_relation: 'same_origin' | 'cross_origin' | 'opaque';
  resource_extension: string;
  resource_route: string;
  resource_type: string;
}

interface ResourceWindow {
  properties: Record<string, unknown>;
  repeatCount: number;
  timer: number;
}

let installed = false;

export function installResourceErrorObserver(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined') return () => undefined;
  installed = true;

  const windows = new Map<string, ResourceWindow>();

  const closeWindow = (key: string, entry: ResourceWindow): void => {
    if (windows.get(key) !== entry) return;
    windows.delete(key);
    window.clearTimeout(entry.timer);
    if (entry.repeatCount === 0) return;
    reportResourceEvent(entry.properties, 'repeat_summary', entry.repeatCount);
  };

  const flushWindows = (): void => {
    for (const [key, entry] of [...windows]) closeWindow(key, entry);
  };

  const startWindow = (
    key: string,
    properties: Record<string, unknown>,
  ): void => {
    if (windows.size >= MAX_TRACKED_RESOURCES) {
      const oldestKey = windows.keys().next().value as string | undefined;
      if (oldestKey != null) {
        const oldest = windows.get(oldestKey);
        if (oldest) closeWindow(oldestKey, oldest);
      }
    }

    const entry: ResourceWindow = {
      properties,
      repeatCount: 0,
      timer: 0,
    };
    entry.timer = window.setTimeout(() => {
      closeWindow(key, entry);
    }, RESOURCE_ERROR_WINDOW_MS);
    windows.set(key, entry);
    reportResourceEvent(properties, 'first', 0);
  };

  const listener = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!RESOURCE_TAGS.has(target.tagName)) return;
    const src = readSrc(target);
    if (src == null) return;
    const tag = target.tagName.toLowerCase();
    const resource = normalizeResource(src, tag);
    const properties: Record<string, unknown> = {
      ...resource,
      tag,
      // crossorigin / async / defer are useful signals for diagnosing
      // chunk-load problems that depend on CDN cache + SW interaction.
      async_attr: target.getAttribute('async') != null ? true : false,
      defer_attr: target.getAttribute('defer') != null ? true : false,
      crossorigin_mode: normalizeCrossorigin(target.getAttribute('crossorigin')),
    };
    const key = resourceWindowKey(src, tag);
    const entry = windows.get(key);
    if (entry) {
      entry.repeatCount += 1;
      return;
    }
    startWindow(key, properties);
  };

  // A later successful load closes the failure window. This avoids carrying a
  // stale repeat count into a future, independent failure after recovery.
  const loadListener = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!RESOURCE_TAGS.has(target.tagName)) return;
    const src = readSrc(target);
    if (src == null) return;
    const tag = target.tagName.toLowerCase();
    const resource = normalizeResource(src, tag);
    const key = resourceWindowKey(src, tag);
    const entry = windows.get(key);
    if (entry) closeWindow(key, entry);
  };

  // capture=true is required — resource error events do not bubble.
  window.addEventListener('error', listener, /*useCapture=*/ true);
  document.addEventListener('load', loadListener, /*useCapture=*/ true);
  window.addEventListener('pagehide', flushWindows);

  return () => {
    window.removeEventListener('error', listener, /*useCapture=*/ true);
    document.removeEventListener('load', loadListener, /*useCapture=*/ true);
    window.removeEventListener('pagehide', flushWindows);
    flushWindows();
    installed = false;
  };
}

function reportResourceEvent(
  properties: Record<string, unknown>,
  eventKind: 'first' | 'repeat_summary',
  repeatCount: number,
): void {
  reportSafetyEvent(
    'client_resource_error',
    {
      ...properties,
      event_kind: eventKind,
      repeat_count: repeatCount,
    },
    { currentUrlOverride: safeCurrentUrl() },
  );
}

function normalizeResource(rawUrl: string, tag: string): NormalizedResource {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, window.location.href);
  } catch {
    return privateResource('invalid', tag);
  }

  const type = resourceType(tag);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return privateResource('opaque', tag);
  }
  const extension = resourceExtension(parsed.pathname);

  if (parsed.origin !== window.location.origin) {
    return {
      category: 'external_media',
      normalized_resource: `external:${type}${extension ? `.${extension}` : ''}`,
      origin_relation: 'cross_origin',
      resource_extension: extension,
      resource_route: 'external',
      resource_type: type,
    };
  }

  if (parsed.pathname.startsWith('/_next/static/chunks/')) {
    const chunkId = safeNextChunkId(parsed.pathname);
    return {
      category: 'next_chunk',
      normalized_resource: `next:${chunkId}`,
      origin_relation: 'same_origin',
      resource_extension: extension,
      resource_route: '/_next/static/chunks/:chunk',
      resource_type: type,
    };
  }

  const productRoute = productAssetRoute(parsed.pathname);
  if (productRoute) {
    return {
      category: 'product_asset',
      normalized_resource:
        `${productRoute}:${type}${extension ? `.${extension}` : ''}`,
      origin_relation: 'same_origin',
      resource_extension: extension,
      resource_route: productRoute,
      resource_type: type,
    };
  }

  const route = userArtifactRoute(parsed.pathname);
  return {
    category: 'user_artifact',
    normalized_resource: `${route}${extension ? `.${extension}` : ''}`,
    origin_relation: 'same_origin',
    resource_extension: extension,
    resource_route: route,
    resource_type: type,
  };
}

// This identity never leaves the browser. Keep it separate from the scrubbed,
// low-cardinality telemetry value so distinct private resources do not share a
// retry/recovery window merely because they have the same route template.
function resourceWindowKey(rawUrl: string, tag: string): string {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    const identity = parsed.origin === 'null'
      ? parsed.href
      : `${parsed.origin}${parsed.pathname}`;
    return `${tag}\0${identity}`;
  } catch {
    return `${tag}\0${rawUrl}`;
  }
}

function privateResource(
  route: string,
  tag: string,
): NormalizedResource {
  const type = resourceType(tag);
  return {
    category: 'user_artifact',
    normalized_resource: `${route}:${type}`,
    origin_relation: 'opaque',
    resource_extension: '',
    resource_route: route,
    resource_type: type,
  };
}

function safeNextChunkId(pathname: string): string {
  const basename = pathname.split('/').at(-1) ?? '';
  if (basename.length > 120) return 'unknown';
  const match = basename.match(/(?:^|-)([a-f0-9]{6,64})\.(js|css)$/i);
  if (!match?.[1] || !match[2]) return 'unknown';
  return `${match[1].toLowerCase()}.${match[2].toLowerCase()}`;
}

function productAssetRoute(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === '_next' && segments[1] === 'static') {
    return '/_next/static/:asset';
  }
  if (segments.length === 1 && PRODUCT_ROOT_FILES.has(segments[0]!)) {
    return '/:product_asset';
  }
  const root = segments[0];
  return root && PRODUCT_ASSET_ROOTS.has(root) ? `/${root}/:asset` : null;
}

function userArtifactRoute(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'api' && segments[1] === 'projects' && segments[2]) {
    if (segments[3] === 'raw') return '/api/projects/:project_id/raw/:file';
    if (segments[3] === 'files') return '/api/projects/:project_id/files/:file';
    if (segments[3] === 'preview') return '/api/projects/:project_id/preview/:file';
    return '/api/projects/:project_id/:resource';
  }
  if (segments[0] === 'api' && segments[1] === 'live-artifacts') {
    return '/api/live-artifacts/:artifact_id/:resource';
  }
  if (segments[0] === 'api' && segments[1] === 'design-systems') {
    return '/api/design-systems/:design_system_id/:resource';
  }
  if (segments[0] === 'api' && segments[1] === 'artifacts') {
    return '/api/artifacts/:resource';
  }
  if (segments[0] === 'artifacts') return '/artifacts/:resource';
  if (segments[0] === 'frames') return '/frames/:resource';
  return '/same-origin/:resource';
}

function resourceExtension(pathname: string): string {
  let basename = pathname.split('/').at(-1) ?? '';
  try {
    basename = decodeURIComponent(basename);
  } catch {
    // A malformed escape is still private; it simply has no extension.
  }
  const candidate = basename.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase();
  if (!candidate) return '';
  return SAFE_RESOURCE_EXTENSIONS.has(candidate) ? candidate : 'other';
}

function resourceType(tag: string): string {
  switch (tag) {
    case 'script': return 'script';
    case 'link': return 'style';
    case 'img': return 'image';
    case 'iframe': return 'frame';
    case 'audio': return 'audio';
    case 'video': return 'video';
    case 'source': return 'source';
    case 'track': return 'track';
    default: return 'other';
  }
}

function normalizeCrossorigin(value: string | null): string {
  if (value == null) return 'unset';
  const normalized = value.toLowerCase();
  if (normalized === '' || normalized === 'anonymous') return 'anonymous';
  if (normalized === 'use-credentials') return 'use-credentials';
  return 'invalid';
}

function safeCurrentUrl(): string {
  const { origin, pathname } = window.location;
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'projects' && segments[1]) {
    let route = '/projects/:project_id';
    if (segments[2] === 'conversations' && segments[3]) {
      route += '/conversations/:conversation_id';
      if (segments[4] === 'files') route += '/files/:file';
    } else if (segments[2] === 'files') {
      route += '/files/:file';
    }
    return `${origin}${route}`;
  }
  if (segments[0] === 'design-systems' && segments[1] && segments[1] !== 'create') {
    return `${origin}/design-systems/:design_system_id`;
  }
  if (segments[0] === 'collab-demo' && segments[1]) {
    return `${origin}/collab-demo/:project_id`;
  }
  return origin;
}

function readSrc(el: Element): string | null {
  // <link> uses href; everything else uses src.
  const value =
    el instanceof HTMLLinkElement ? el.href :
    el instanceof HTMLScriptElement ? el.src :
    el instanceof HTMLImageElement ? el.src :
    el instanceof HTMLIFrameElement ? el.src :
    el instanceof HTMLSourceElement ? el.src :
    el instanceof HTMLTrackElement ? el.src :
    el instanceof HTMLMediaElement ? el.src :
    el.getAttribute('src') ?? el.getAttribute('href');
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}
