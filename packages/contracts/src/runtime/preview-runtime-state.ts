export const PREVIEW_RUNTIME_STATE_VERSION = 1 as const;

export const PREVIEW_RUNTIME_STATE_LIMITS = {
  maxElements: 3500,
  maxRoots: 64,
  maxRootHtmlLength: 2 * 1024 * 1024,
  maxBodyHtmlLength: 2 * 1024 * 1024,
  maxAttributes: 64,
  maxAttributeNameLength: 128,
  maxAttributeValueLength: 20_000,
  maxHashLength: 4096,
  maxTagLength: 32,
  maxPathLength: 64,
  maxPathIndex: 100_000,
  maxIdentityLength: 4096,
  maxValueLength: 100_000,
} as const;

export type PreviewRuntimeStateEntry = {
  path: number[];
  tag: string;
  id?: string;
  odId?: string;
  attrs: Record<string, string>;
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  scrollLeft?: number;
  scrollTop?: number;
};

export type PreviewRuntimeStateRoot = {
  path: number[];
  tag: string;
  id?: string;
  odId?: string;
  html: string;
};

export type PreviewRuntimeState = {
  version: typeof PREVIEW_RUNTIME_STATE_VERSION;
  hash: string;
  bodyHtml?: string | null;
  roots?: PreviewRuntimeStateRoot[];
  htmlAttrs: Record<string, string>;
  bodyAttrs: Record<string, string>;
  entries: PreviewRuntimeStateEntry[];
};

function isPreviewRuntimeAttributeMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxAttributes
    && entries.every(([name, attrValue]) => (
      name.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxAttributeNameLength
      && typeof attrValue === 'string'
      && attrValue.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxAttributeValueLength
    ));
}

function isPreviewRuntimePath(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxPathLength
    && value.every((index) => (
      Number.isInteger(index)
      && index >= 0
      && index <= PREVIEW_RUNTIME_STATE_LIMITS.maxPathIndex
    ));
}

function hasValidPreviewRuntimeIdentity(value: unknown): value is string | undefined {
  return value === undefined || (
    typeof value === 'string'
    && value.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxIdentityLength
  );
}

export function isPreviewRuntimeState(value: unknown): value is PreviewRuntimeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Partial<PreviewRuntimeState>;
  if (
    state.version !== PREVIEW_RUNTIME_STATE_VERSION
    || typeof state.hash !== 'string'
    || state.hash.length > PREVIEW_RUNTIME_STATE_LIMITS.maxHashLength
    || (state.bodyHtml !== undefined && state.bodyHtml !== null && (
      typeof state.bodyHtml !== 'string'
      || state.bodyHtml.length > PREVIEW_RUNTIME_STATE_LIMITS.maxBodyHtmlLength
    ))
    || (state.roots !== undefined && (
      !Array.isArray(state.roots)
      || state.roots.length > PREVIEW_RUNTIME_STATE_LIMITS.maxRoots
      || state.roots.reduce((total, root) => total + (
        root && typeof root === 'object' && typeof root.html === 'string'
          ? root.html.length
          : PREVIEW_RUNTIME_STATE_LIMITS.maxRootHtmlLength + 1
      ), 0) > PREVIEW_RUNTIME_STATE_LIMITS.maxRootHtmlLength
      || !state.roots.every((root) => (
        !!root
        && typeof root === 'object'
        && typeof root.tag === 'string'
        && root.tag.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxTagLength
        && isPreviewRuntimePath(root.path)
        && hasValidPreviewRuntimeIdentity(root.id)
        && hasValidPreviewRuntimeIdentity(root.odId)
        && typeof root.html === 'string'
      ))
    ))
    || !isPreviewRuntimeAttributeMap(state.htmlAttrs)
    || !isPreviewRuntimeAttributeMap(state.bodyAttrs)
    || !Array.isArray(state.entries)
    || state.entries.length > PREVIEW_RUNTIME_STATE_LIMITS.maxElements
  ) {
    return false;
  }
  return state.entries.every((entry) => (
    !!entry
    && typeof entry === 'object'
    && typeof entry.tag === 'string'
    && entry.tag.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxTagLength
    && isPreviewRuntimePath(entry.path)
    && hasValidPreviewRuntimeIdentity(entry.id)
    && hasValidPreviewRuntimeIdentity(entry.odId)
    && isPreviewRuntimeAttributeMap(entry.attrs)
    && (entry.value === undefined || (
      typeof entry.value === 'string'
      && entry.value.length <= PREVIEW_RUNTIME_STATE_LIMITS.maxValueLength
    ))
    && (entry.checked === undefined || typeof entry.checked === 'boolean')
    && (entry.selectedIndex === undefined || Number.isInteger(entry.selectedIndex))
    && (entry.scrollLeft === undefined || Number.isFinite(entry.scrollLeft))
    && (entry.scrollTop === undefined || Number.isFinite(entry.scrollTop))
  ));
}
