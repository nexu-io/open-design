/**
 * OD Next handheld device shell ("phone frame") resolution.
 *
 * The prototype task profile ships three presentation shells as package
 * resources (iPhone, Android, platform-neutral). Open Design resolves which
 * one a task wants from two sources only — the project's platform metadata and
 * the user's own words — and never from the model's judgement: a missed
 * resolution still leaves every shell staged on disk for the rule card to point
 * at, while a resolved one additionally quotes the selected shell into the
 * stable request context so the Build cannot "forget to read" it.
 *
 * Pure: no filesystem, no daemon state. The daemon owns staging and the
 * run-finish observation.
 */

export type OdNextDevicePlatformV1 = 'ios' | 'android' | 'mobile-neutral';

export type OdNextDevicePlatformSourceV1 = 'request-text' | 'project-metadata';

export interface OdNextDevicePlatformResolutionV1 {
  platform: OdNextDevicePlatformV1;
  resolvedFrom: OdNextDevicePlatformSourceV1;
}

/** Project-relative directory the daemon stages the shells into. */
export const OD_NEXT_DEVICE_FRAME_ROOT = '.od-frames' as const;

/** Shell file per platform, as staged under {@link OD_NEXT_DEVICE_FRAME_ROOT}. */
export const OD_NEXT_DEVICE_FRAME_FILES: Readonly<Record<OdNextDevicePlatformV1, string>> = {
  ios: 'iphone.html',
  android: 'android.html',
  'mobile-neutral': 'neutral.html',
};

export const OD_NEXT_DEVICE_PLATFORMS: ReadonlyArray<OdNextDevicePlatformV1> = [
  'ios',
  'android',
  'mobile-neutral',
];

/** Attribute every shipped shell carries on its outermost handset element. */
export const OD_NEXT_DEVICE_SHELL_MARKER = 'data-phone-shell' as const;

/**
 * Structure-only layout primitives the prototype profile ships beside the
 * shells. Staged under the same root and quoted as the `layout-primitives`
 * fact, so the Build composes stacked text, truncation, rails, and screen
 * chrome from classes that already behave instead of re-deriving them.
 */
export const OD_NEXT_LAYOUT_PRIMITIVES_FILE = 'layout.css' as const;
export const OD_NEXT_LAYOUT_PRIMITIVES_MARKER = 'OD-LAYOUT-PRIMITIVES v1' as const;

/** Every file name the daemon may stage under {@link OD_NEXT_DEVICE_FRAME_ROOT}. */
export const OD_NEXT_MANAGED_RESOURCE_FILES: ReadonlyArray<string> = [
  ...Object.values(OD_NEXT_DEVICE_FRAME_FILES),
  OD_NEXT_LAYOUT_PRIMITIVES_FILE,
];

/** Basename of a task resource when it is one the daemon stages, else null. */
export function odNextManagedResourceName(resourcePath: string): string | null {
  const basename = resourcePath.split('/').pop() ?? '';
  return OD_NEXT_MANAGED_RESOURCE_FILES.includes(basename) ? basename : null;
}

/** The layout primitives stylesheet out of the task profile's resources, if shipped. */
export function selectOdNextLayoutPrimitivesCss(
  taskResources: ReadonlyArray<{ path: string; text: string }> | null | undefined,
): string | null {
  for (const resource of taskResources ?? []) {
    if ((resource.path.split('/').pop() ?? '') === OD_NEXT_LAYOUT_PRIMITIVES_FILE && resource.text.trim()) {
      return resource.text;
    }
  }
  return null;
}

export type OdNextLayoutPrimitivesPresenceV1 = 'verbatim' | 'modified' | 'linked' | 'absent';

function normalizeCss(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * How a delivered document carries the layout primitives: the block copied
 * byte-for-byte (whitespace aside), copied but altered, linked from the staged
 * file, or not at all. An observation, not a gate — it tells the rollout
 * whether a model tier reproduces a ~50-line block faithfully enough for
 * inlining, or whether the rule card should point at `<link>` instead.
 */
export function detectOdNextLayoutPrimitives(
  html: string | null | undefined,
  primitivesCss: string | null | undefined,
): OdNextLayoutPrimitivesPresenceV1 {
  if (typeof html !== 'string' || html.length === 0) return 'absent';
  const open = `/* ${OD_NEXT_LAYOUT_PRIMITIVES_MARKER}`;
  const close = `/* /${OD_NEXT_LAYOUT_PRIMITIVES_MARKER} */`;
  const start = html.indexOf(open);
  const end = start >= 0 ? html.indexOf(close, start) : -1;
  if (start >= 0 && end > start) {
    if (typeof primitivesCss !== 'string') return 'modified';
    const shipped = primitivesCss.slice(primitivesCss.indexOf(open), primitivesCss.indexOf(close) + close.length);
    const delivered = html.slice(start, end + close.length);
    return normalizeCss(delivered) === normalizeCss(shipped) ? 'verbatim' : 'modified';
  }
  if (new RegExp(`<link[^>]+href=["'][^"']*${OD_NEXT_DEVICE_FRAME_ROOT}/${OD_NEXT_LAYOUT_PRIMITIVES_FILE}["']`).test(html)) {
    return 'linked';
  }
  return 'absent';
}

// Platform vocabulary across English and Chinese briefs. Explicit platforms
// are deliberately narrow: "苹果" alone also names a company and "pixel" alone
// is a unit, so both need an app/handset companion word before they count.
const IOS_SIGNAL =
  /\b(?:ios|swiftui|uikit|app store)\b|iphone|苹果\s*(?:手机|app|应用)/i;
const ANDROID_SIGNAL =
  /\b(?:android|jetpack compose|apk|harmonyos|harmony os|material (?:design|you|3)|google pixel|pixel\s?\d+|samsung galaxy|galaxy s\d+)\b|安卓|鸿蒙/i;
// A phone app named without a platform. "移动端" and "手机端" count on their
// own: losing the shell on a real mobile brief costs more than quoting one
// shell into a brief that turns out to be a responsive site.
const MOBILE_APP_SIGNAL =
  /\b(?:mobile|phone|smartphone|handheld)[- ]?(?:app|application)s?\b|\bmobile[- ]first app\b|\bnative app\b|手机\s*(?:app|应用|端|软件)|移动(?:端|应用|\s*app)/i;
// Explicit non-phone surfaces veto the platform-less class only; a brief that
// names iOS or Android still wants that handset.
const NON_PHONE_SURFACE_SIGNAL =
  /\bresponsive\b|响应式|自适应|\bdesktop\b|桌面/i;

/**
 * Classify the user's own words into a device platform, or null when the
 * brief does not name a phone app.
 */
export function detectOdNextDevicePlatformFromText(
  ...texts: Array<string | null | undefined>
): OdNextDevicePlatformV1 | null {
  const joined = texts
    .filter((text): text is string => typeof text === 'string' && text.length > 0)
    .join('\n');
  if (!joined) return null;
  if (IOS_SIGNAL.test(joined)) return 'ios';
  if (ANDROID_SIGNAL.test(joined)) return 'android';
  if (MOBILE_APP_SIGNAL.test(joined) && !NON_PHONE_SURFACE_SIGNAL.test(joined)) {
    return 'mobile-neutral';
  }
  return null;
}

interface DevicePlatformMetadataLike {
  platform?: string | null | undefined;
  platformTargets?: ReadonlyArray<string> | null | undefined;
}

const NON_PHONE_PROJECT_PLATFORMS = new Set([
  'responsive',
  'web-desktop',
  'tablet',
  'desktop-app',
]);

/**
 * Combine the project's platform metadata with the text classification.
 *
 * Precedence: an explicit platform in the user's words (iOS / Android) wins
 * over everything; then explicit mobile metadata (the Home "Mobile app" chip
 * stamps both mobile targets, which reads as platform-neutral); then the
 * platform-less text class, unless the project explicitly targets a non-phone
 * surface. Anything else is null — no shell is quoted and the rule card's
 * "no shell" row applies.
 */
export function resolveOdNextDevicePlatform(input: {
  metadata?: DevicePlatformMetadataLike | null | undefined;
  textPlatform?: OdNextDevicePlatformV1 | null | undefined;
}): OdNextDevicePlatformResolutionV1 | null {
  const textPlatform = input.textPlatform ?? null;
  if (textPlatform === 'ios' || textPlatform === 'android') {
    return { platform: textPlatform, resolvedFrom: 'request-text' };
  }
  const metadata = input.metadata ?? null;
  const declared = new Set<string>();
  if (typeof metadata?.platform === 'string') declared.add(metadata.platform);
  for (const target of metadata?.platformTargets ?? []) {
    if (typeof target === 'string') declared.add(target);
  }
  const wantsIos = declared.has('mobile-ios');
  const wantsAndroid = declared.has('mobile-android');
  if (wantsIos && !wantsAndroid) {
    return { platform: 'ios', resolvedFrom: 'project-metadata' };
  }
  if (wantsAndroid && !wantsIos) {
    return { platform: 'android', resolvedFrom: 'project-metadata' };
  }
  if (wantsIos && wantsAndroid) {
    return { platform: 'mobile-neutral', resolvedFrom: 'project-metadata' };
  }
  if (textPlatform === 'mobile-neutral') {
    const explicitlyNonPhone = [...declared].some((value) => NON_PHONE_PROJECT_PLATFORMS.has(value));
    if (!explicitlyNonPhone) {
      return { platform: 'mobile-neutral', resolvedFrom: 'request-text' };
    }
  }
  return null;
}

/** Project-relative path of the staged shell for a platform. */
export function odNextDeviceFramePath(platform: OdNextDevicePlatformV1): string {
  return `${OD_NEXT_DEVICE_FRAME_ROOT}/${OD_NEXT_DEVICE_FRAME_FILES[platform]}`;
}

/** Basename → platform, for matching package resources to shells. */
export function odNextDevicePlatformForResource(resourcePath: string): OdNextDevicePlatformV1 | null {
  const basename = resourcePath.split('/').pop() ?? '';
  for (const platform of OD_NEXT_DEVICE_PLATFORMS) {
    if (OD_NEXT_DEVICE_FRAME_FILES[platform] === basename) return platform;
  }
  return null;
}

export interface OdNextDeviceFrameContextV2 {
  platform: OdNextDevicePlatformV1;
  resolvedFrom: OdNextDevicePlatformSourceV1;
  /** Project-relative path of the selected shell. */
  shell: string;
  /** Every staged shell, so a Build can still switch platform on new evidence. */
  availableShells: string[];
  /** Source of the selected shell, quoted into the stable request context. */
  shellHtml: string;
}

/**
 * Pick the selected shell out of the task profile's resources.
 *
 * Returns null when the profile ships no shell for the platform — the fact is
 * then omitted rather than emitted with an empty body.
 */
export function selectOdNextDeviceFrameContextV2(input: {
  resolution: OdNextDevicePlatformResolutionV1 | null | undefined;
  taskResources: ReadonlyArray<{ path: string; text: string }> | null | undefined;
}): OdNextDeviceFrameContextV2 | null {
  if (!input.resolution) return null;
  const shells = new Map<OdNextDevicePlatformV1, string>();
  for (const resource of input.taskResources ?? []) {
    const platform = odNextDevicePlatformForResource(resource.path);
    if (platform && resource.text.trim().length > 0) shells.set(platform, resource.text);
  }
  const shellHtml = shells.get(input.resolution.platform);
  if (!shellHtml) return null;
  return {
    platform: input.resolution.platform,
    resolvedFrom: input.resolution.resolvedFrom,
    shell: odNextDeviceFramePath(input.resolution.platform),
    availableShells: OD_NEXT_DEVICE_PLATFORMS
      .filter((platform) => shells.has(platform))
      .map(odNextDeviceFramePath)
      .sort(),
    shellHtml,
  };
}

/**
 * Does a delivered document carry a shipped handset shell? Both the outer
 * marker and the inner content slot must be present — a document that kept
 * the attribute but dropped the scroll container has lost the shell contract.
 */
export function hasOdNextDeviceShell(html: string | null | undefined): boolean {
  if (typeof html !== 'string' || html.length === 0) return false;
  return new RegExp(`\\s${OD_NEXT_DEVICE_SHELL_MARKER}(?:[\\s=>])`).test(html)
    && /class\s*=\s*["'][^"']*\bphone-content\b/.test(html);
}
