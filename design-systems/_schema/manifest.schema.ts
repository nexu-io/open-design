/* ─────────────────────────────────────────────────────────────────────────
 * design-systems/_schema/manifest.schema.ts
 *
 * Canonical contract for an Open Design Design System Project.
 *
 * `DESIGN.md` remains the prose source that agents read. The project
 * manifest is the stable discovery layer around it: picker / daemon /
 * importer code can find the canonical design prose, compiled tokens,
 * optional component fixtures, and optional preview/assets directories
 * without guessing from folder contents.
 *
 * PR1 deliberately defines the contract without changing runtime
 * discovery. Existing DESIGN.md-only systems stay valid; this schema is
 * enforced only for folders that choose to ship `manifest.json`.
 * ─────────────────────────────────────────────────────────────────── */

export const DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION = "od-design-system-project/v1" as const;

export type DesignSystemProjectSource =
  | {
      readonly type: "bundled";
      /** Human-readable origin, e.g. upstream repo/package, when known. */
      readonly origin?: string;
    }
  | {
      readonly type: "local";
      /** Absolute path selected by the user at import time. */
      readonly path: string;
      readonly importedAt?: string;
    }
  | {
      readonly type: "github";
      readonly url: string;
      readonly branch?: string;
      readonly commit?: string;
      readonly importedAt?: string;
    };

export type DesignSystemProjectFiles = {
  /**
   * Canonical design prose for agent prompts. V1 keeps this fixed so
   * DESIGN.md-only fallback and project manifests share the same source.
   */
  readonly design: "DESIGN.md";
  /**
   * Canonical compiled token stylesheet. New project manifests require
   * it; legacy folders without a manifest may still be DESIGN.md-only.
   */
  readonly tokens: "tokens.css";
  /**
   * Optional standalone component fixture. First-class in the contract,
   * but optional for MVP imports and prose-only brands.
   */
  readonly components?: "components.html";
};

export type DesignSystemProjectManifest = {
  readonly schemaVersion: typeof DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION;
  /** Folder slug and stable picker id. Must match /^[a-z0-9-]+$/. */
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description?: string;
  readonly source: DesignSystemProjectSource;
  readonly files: DesignSystemProjectFiles;
  /** Optional static assets root. V1 fixes the directory name. */
  readonly assetsDir?: "assets";
  /** Optional preview root. V1 fixes the directory name. */
  readonly previewDir?: "preview";
};

export type DesignSystemManifestValidationResult =
  | { readonly ok: true; readonly manifest: DesignSystemProjectManifest }
  | { readonly ok: false; readonly errors: readonly string[] };

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "id",
  "name",
  "category",
  "description",
  "source",
  "files",
  "assetsDir",
  "previewDir",
]);

const ALLOWED_SOURCE_KEYS: Record<DesignSystemProjectSource["type"], ReadonlySet<string>> = {
  bundled: new Set(["type", "origin"]),
  local: new Set(["type", "path", "importedAt"]),
  github: new Set(["type", "url", "branch", "commit", "importedAt"]),
};

const ALLOWED_FILES_KEYS = new Set(["design", "tokens", "components"]);

export function parseDesignSystemProjectManifest(
  raw: string,
): DesignSystemManifestValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [`manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  return validateDesignSystemProjectManifest(value);
}

export function validateDesignSystemProjectManifest(
  value: unknown,
): DesignSystemManifestValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["manifest must be a JSON object"] };
  }

  rejectUnknownKeys(errors, "$", value, ALLOWED_TOP_LEVEL_KEYS);

  expectLiteral(errors, "$.schemaVersion", value.schemaVersion, DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION);
  expectSlug(errors, "$.id", value.id);
  expectNonEmptyString(errors, "$.name", value.name);
  expectNonEmptyString(errors, "$.category", value.category);
  if (value.description !== undefined) expectNonEmptyString(errors, "$.description", value.description);

  validateSource(errors, value.source);
  validateFiles(errors, value.files);

  if (value.assetsDir !== undefined) expectLiteral(errors, "$.assetsDir", value.assetsDir, "assets");
  if (value.previewDir !== undefined) expectLiteral(errors, "$.previewDir", value.previewDir, "preview");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: value as DesignSystemProjectManifest };
}

function validateSource(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("$.source must be an object");
    return;
  }

  const type = value.type;
  if (type !== "bundled" && type !== "local" && type !== "github") {
    errors.push("$.source.type must be one of bundled, local, github");
    return;
  }

  rejectUnknownKeys(errors, "$.source", value, ALLOWED_SOURCE_KEYS[type]);

  if (type === "bundled") {
    if (value.origin !== undefined) expectNonEmptyString(errors, "$.source.origin", value.origin);
    return;
  }

  if (type === "local") {
    expectNonEmptyString(errors, "$.source.path", value.path);
    if (value.importedAt !== undefined) expectIsoDateTime(errors, "$.source.importedAt", value.importedAt);
    return;
  }

  expectNonEmptyString(errors, "$.source.url", value.url);
  if (value.branch !== undefined) expectNonEmptyString(errors, "$.source.branch", value.branch);
  if (value.commit !== undefined) expectNonEmptyString(errors, "$.source.commit", value.commit);
  if (value.importedAt !== undefined) expectIsoDateTime(errors, "$.source.importedAt", value.importedAt);
}

function validateFiles(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("$.files must be an object");
    return;
  }

  rejectUnknownKeys(errors, "$.files", value, ALLOWED_FILES_KEYS);
  expectLiteral(errors, "$.files.design", value.design, "DESIGN.md");
  expectLiteral(errors, "$.files.tokens", value.tokens, "tokens.css");
  if (value.components !== undefined) {
    expectLiteral(errors, "$.files.components", value.components, "components.html");
  }
}

function rejectUnknownKeys(
  errors: string[],
  pathLabel: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${pathLabel}.${key} is not part of the v1 design-system project schema`);
  }
}

function expectLiteral(
  errors: string[],
  pathLabel: string,
  value: unknown,
  expected: string,
): void {
  if (value !== expected) errors.push(`${pathLabel} must be ${JSON.stringify(expected)}`);
}

function expectNonEmptyString(errors: string[], pathLabel: string, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${pathLabel} must be a non-empty string`);
  }
}

function expectSlug(errors: string[], pathLabel: string, value: unknown): void {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    errors.push(`${pathLabel} must be a lowercase slug matching /^[a-z0-9]+(?:-[a-z0-9]+)*$/`);
  }
}

function expectIsoDateTime(errors: string[], pathLabel: string, value: unknown): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`${pathLabel} must be an ISO-like datetime string`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
