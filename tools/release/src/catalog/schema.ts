/** Catalog snapshot schema (schemaVersion 1). Product-owned contract for landing. */

export const CATALOG_SCHEMA_VERSION = 1 as const;

export type CatalogRecordType = "skill" | "system" | "craft" | "template" | "plugin";

export type SkillKind = "instruction" | "template";

export type TemplateOrigin = "design-template" | "live-artifact";

/** Locale → field map carried so landing need not re-read monorepo sources. */
export type CatalogI18nPayload = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export type CatalogPreviewRef = {
  /** Relative path inside the snapshot, e.g. `previews/skills/foo.webp`. */
  path?: string;
  /** Runnable entry point bundled with the immutable snapshot. */
  entryPath?: string;
  /** Remote CDN poster (plugins with authored/baked poster). */
  remotePoster?: string;
  /** Remote CDN video (plugins with authored/baked video). Not packed into snapshot. */
  remoteVideo?: string;
  /** Hold/pan split ms for baked hover clips. */
  holdMs?: number;
  previewType?: string;
};

export type CatalogSkillRecord = {
  id: string;
  type: "skill";
  name: string;
  description: string;
  sourceUrl: string;
  body: string;
  kind: SkillKind;
  triggers: ReadonlyArray<string>;
  mode?: string;
  platform?: string;
  scenario?: string;
  category?: string;
  featured?: number;
  upstream?: string;
  examplePrompt?: string;
  preview?: CatalogPreviewRef;
  i18n?: CatalogI18nPayload;
};

export type CatalogSystemTokenType =
  | "color"
  | "dimension"
  | "shadow"
  | "fontFamily"
  | "number"
  | "duration"
  | "cubicBezier";

export type CatalogSystemToken = {
  name: string;
  value: string;
  type: CatalogSystemTokenType;
  layer: string;
};

export type CatalogSystemTokenGroupId =
  | "surface"
  | "text"
  | "border"
  | "accent"
  | "semantic"
  | "fonts"
  | "type"
  | "spacing"
  | "radius"
  | "elevation"
  | "focus"
  | "motion"
  | "layout"
  | "other";

export type CatalogSystemTokenGroup = {
  id: CatalogSystemTokenGroupId;
  tokens: ReadonlyArray<CatalogSystemToken>;
};

export type CatalogSystemPreviewTheme = {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  accentOn: string;
  fontDisplay: string;
  fontBody: string;
  radius: string;
};

/** Structured design-tokens.json payload (mirrors landing system-tokens.ts). */
export type CatalogSystemTokens = {
  total: number;
  grade: string | null;
  groups: ReadonlyArray<CatalogSystemTokenGroup>;
  theme: CatalogSystemPreviewTheme | null;
};

export type CatalogSystemRecord = {
  id: string;
  type: "system";
  name: string;
  description: string;
  sourceUrl: string;
  body: string;
  category: string;
  tagline: string;
  atmosphere: string;
  palette: ReadonlyArray<string>;
  preview?: CatalogPreviewRef;
  /** Locale code → full DESIGN body markdown. */
  bodiesI18n?: Readonly<Record<string, string>>;
  /** Structured tokens from design-tokens.json when present. */
  tokens?: CatalogSystemTokens;
  i18n?: CatalogI18nPayload;
};

export type CatalogCraftRecord = {
  id: string;
  type: "craft";
  name: string;
  description: string;
  sourceUrl: string;
  body: string;
  summary: string;
  i18n?: CatalogI18nPayload;
};

export type CatalogTemplateRecord = {
  id: string;
  type: "template";
  name: string;
  description: string;
  sourceUrl: string;
  body: string;
  origin: TemplateOrigin;
  mode?: string;
  platform?: string;
  scenario?: string;
  featured?: number;
  detailHref: string;
  preview?: CatalogPreviewRef;
  i18n?: CatalogI18nPayload;
};

export type CatalogPluginRecord = {
  id: string;
  type: "plugin";
  name: string;
  description: string;
  sourceUrl: string;
  /** Plugins do not ship markdown body in the catalog. */
  body: string;
  slug: string;
  bucket: string;
  tags: ReadonlyArray<string>;
  authorName?: string;
  authorUrl?: string;
  homepage?: string;
  mode?: string;
  scenario?: string;
  platform?: string;
  surface?: string;
  kind?: string;
  detailSlug: string;
  detailHref: string;
  /**
   * When false, discovery hubs should hide the entry (atoms).
   * Detail routes still resolve. Default/undefined means discoverable.
   */
  discoverable?: boolean;
  preview?: CatalogPreviewRef;
  titleI18n?: Readonly<Record<string, string>>;
  descriptionI18n?: Readonly<Record<string, string>>;
};

export type CatalogRecord =
  | CatalogSkillRecord
  | CatalogSystemRecord
  | CatalogCraftRecord
  | CatalogTemplateRecord
  | CatalogPluginRecord;

export type CatalogDocument = {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  sourceCommit: string;
  generatedAt: string;
  records: CatalogRecord[];
};

export type CatalogProvenance = {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  sourceCommit: string;
  generatedAt: string;
  exporterVersion: string;
  bundleSha256: string;
  recordCounts: Record<string, number>;
};

export function catalogRecordCounts(records: readonly { type: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }
  return counts;
}

export type CatalogLatestPointer = {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  sourceCommit: string;
  /** Source timestamp retained for provenance and operator inspection. */
  sourceCommittedAt: string;
  /** Monotonic git ancestry count used to order commits sharing a timestamp. */
  sourceCommitGeneration: number;
  bundleUrl: string;
  sha256: string;
  publishedAt: string;
  github?: Record<string, unknown>;
};

export const CATALOG_PREFIX = "catalog/v1";
export const CATALOG_LATEST_KEY = `${CATALOG_PREFIX}/latest.json`;

export function catalogSnapshotPrefix(sourceCommit: string): string {
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error(`sourceCommit must be a full 40-char hex sha; got ${sourceCommit}`);
  }
  return `${CATALOG_PREFIX}/${sourceCommit.toLowerCase()}`;
}

export function previewRelativePath(
  bucket: "skills" | "templates" | "plugins",
  stableId: string,
): string {
  return `previews/${bucket}/${stableId}.webp`;
}

/** Public landing detail path for a record (used for route uniqueness checks). */
export function catalogPublicRoute(record: CatalogRecord): string | null {
  switch (record.type) {
    case "skill":
      return `/skills/${record.id}/`;
    case "system":
      return `/systems/${record.id}/`;
    case "craft":
      return `/craft/${record.id}/`;
    case "template":
      return record.detailHref || `/templates/${record.id}/`;
    case "plugin":
      return record.detailHref || `/plugins/${record.detailSlug}/`;
    default:
      return null;
  }
}

export function catalogIdentityKey(type: CatalogRecordType, id: string): string {
  return `${type}:${id}`;
}
