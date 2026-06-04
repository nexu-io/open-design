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
 * PR0 for the import-project structure also defines optional index fields
 * for richer imported systems (`USAGE.md`, preview pages, source evidence,
 * and a rebuildable component manifest cache). These fields are structural
 * only in PR0: guards validate their paths and JSON shape, but runtime
 * behavior remains unchanged until later PRs consume them.
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
    }
  | {
      readonly type: "shadcn";
      /** Original user-supplied reference (CLI shorthand or item URL). */
      readonly reference: string;
      /** Resolved registry-item JSON URL that was fetched. */
      readonly registryUrl?: string;
      /** Registry item name within the source registry. */
      readonly item?: string;
      /** Registry homepage, when advertised by registry.json. */
      readonly homepage?: string;
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

export type DesignSystemProjectImportMode = "normalized" | "hybrid" | "verbatim";

export type DesignSystemProjectCraft = {
  readonly applies: readonly string[];
  readonly suggested: readonly string[];
  readonly exemptions: readonly string[];
};

export type DesignSystemProjectFont = {
  readonly family: string;
  readonly file: string;
  readonly weight?: number | string;
  readonly style?: string;
};

export type DesignSystemProjectPreviewPage = {
  readonly path: string;
  readonly role?: string;
  readonly title?: string;
};

export type DesignSystemProjectPreview = {
  readonly dir: string;
  readonly pages: readonly DesignSystemProjectPreviewPage[];
};

export type DesignSystemProjectSourceFiles = {
  readonly scanned?: string;
  readonly evidence?: string;
  readonly tokens?: string;
  readonly snippets?: string;
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
  /** Optional legacy preview root. V1 fixes the directory name. */
  readonly previewDir?: "preview";
  /** Optional agent-facing router for richer imported packages. */
  readonly usage?: string;
  /** Optional rebuildable cache derived from components.html + tokens.css. */
  readonly componentsManifest?: string;
  /** Importer mode metadata. Defaults to hybrid for imported packages. */
  readonly importMode?: DesignSystemProjectImportMode;
  /** Optional craft metadata consumed by prompt assembly and guard checks. */
  readonly craft?: DesignSystemProjectCraft;
  /** Optional webfont files copied into the package. */
  readonly fonts?: readonly DesignSystemProjectFont[];
  /** Optional indexed preview pages for pull-channel and human review. */
  readonly preview?: DesignSystemProjectPreview;
  /** Optional imported-source evidence indexes. */
  readonly sourceFiles?: DesignSystemProjectSourceFiles;
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
  "usage",
  "componentsManifest",
  "importMode",
  "craft",
  "fonts",
  "preview",
  "sourceFiles",
]);

const ALLOWED_SOURCE_KEYS: Record<DesignSystemProjectSource["type"], ReadonlySet<string>> = {
  bundled: new Set(["type", "origin"]),
  local: new Set(["type", "path", "importedAt"]),
  github: new Set(["type", "url", "branch", "commit", "importedAt"]),
  shadcn: new Set(["type", "reference", "registryUrl", "item", "homepage", "importedAt"]),
};

const ALLOWED_FILES_KEYS = new Set(["design", "tokens", "components"]);
const ALLOWED_CRAFT_KEYS = new Set(["applies", "suggested", "exemptions"]);
const ALLOWED_FONT_KEYS = new Set(["family", "file", "weight", "style"]);
const ALLOWED_PREVIEW_KEYS = new Set(["dir", "pages"]);
const ALLOWED_PREVIEW_PAGE_KEYS = new Set(["path", "role", "title"]);
const ALLOWED_SOURCE_FILES_KEYS = new Set(["scanned", "evidence", "tokens", "snippets"]);

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
  if (value.usage !== undefined) expectSafeRelativePath(errors, "$.usage", value.usage);
  if (value.componentsManifest !== undefined) {
    expectSafeRelativePath(errors, "$.componentsManifest", value.componentsManifest);
  }
  if (value.importMode !== undefined) validateImportMode(errors, value.importMode);
  if (value.craft !== undefined) validateCraft(errors, value.craft);
  if (value.fonts !== undefined) validateFonts(errors, value.fonts);
  if (value.preview !== undefined) validatePreview(errors, value.preview);
  if (value.sourceFiles !== undefined) validateSourceFiles(errors, value.sourceFiles);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: value as DesignSystemProjectManifest };
}

function validateSource(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("$.source must be an object");
    return;
  }

  const type = value.type;
  if (type !== "bundled" && type !== "local" && type !== "github" && type !== "shadcn") {
    errors.push("$.source.type must be one of bundled, local, github, shadcn");
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

  if (type === "github") {
    expectNonEmptyString(errors, "$.source.url", value.url);
    if (value.branch !== undefined) expectNonEmptyString(errors, "$.source.branch", value.branch);
    if (value.commit !== undefined) expectNonEmptyString(errors, "$.source.commit", value.commit);
    if (value.importedAt !== undefined) expectIsoDateTime(errors, "$.source.importedAt", value.importedAt);
    return;
  }

  // shadcn registry import.
  expectNonEmptyString(errors, "$.source.reference", value.reference);
  if (value.registryUrl !== undefined) expectNonEmptyString(errors, "$.source.registryUrl", value.registryUrl);
  if (value.item !== undefined) expectNonEmptyString(errors, "$.source.item", value.item);
  if (value.homepage !== undefined) expectNonEmptyString(errors, "$.source.homepage", value.homepage);
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

function validateImportMode(errors: string[], value: unknown): void {
  if (value !== "normalized" && value !== "hybrid" && value !== "verbatim") {
    errors.push("$.importMode must be one of normalized, hybrid, verbatim");
  }
}

function validateCraft(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("$.craft must be an object");
    return;
  }

  rejectUnknownKeys(errors, "$.craft", value, ALLOWED_CRAFT_KEYS);
  expectSlugArray(errors, "$.craft.applies", value.applies);
  expectSlugArray(errors, "$.craft.suggested", value.suggested);
  expectSlugArray(errors, "$.craft.exemptions", value.exemptions);
}

function validateFonts(errors: string[], value: unknown): void {
  if (!Array.isArray(value)) {
    errors.push("$.fonts must be an array");
    return;
  }

  value.forEach((font, index) => {
    const pathLabel = `$.fonts[${index}]`;
    if (!isRecord(font)) {
      errors.push(`${pathLabel} must be an object`);
      return;
    }

    rejectUnknownKeys(errors, pathLabel, font, ALLOWED_FONT_KEYS);
    expectNonEmptyString(errors, `${pathLabel}.family`, font.family);
    expectSafeRelativePath(errors, `${pathLabel}.file`, font.file);
    if (font.weight !== undefined && typeof font.weight !== "number" && typeof font.weight !== "string") {
      errors.push(`${pathLabel}.weight must be a number or string`);
    }
    if (font.style !== undefined) expectNonEmptyString(errors, `${pathLabel}.style`, font.style);
  });
}

function validatePreview(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("$.preview must be an object");
    return;
  }

  rejectUnknownKeys(errors, "$.preview", value, ALLOWED_PREVIEW_KEYS);
  expectSafeRelativePath(errors, "$.preview.dir", value.dir);
  if (!Array.isArray(value.pages)) {
    errors.push("$.preview.pages must be an array");
    return;
  }

  value.pages.forEach((page, index) => {
    const pathLabel = `$.preview.pages[${index}]`;
    if (!isRecord(page)) {
      errors.push(`${pathLabel} must be an object`);
      return;
    }

    rejectUnknownKeys(errors, pathLabel, page, ALLOWED_PREVIEW_PAGE_KEYS);
    expectSafeRelativePath(errors, `${pathLabel}.path`, page.path);
    if (page.role !== undefined) expectNonEmptyString(errors, `${pathLabel}.role`, page.role);
    if (page.title !== undefined) expectNonEmptyString(errors, `${pathLabel}.title`, page.title);
  });
}

function validateSourceFiles(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push("$.sourceFiles must be an object");
    return;
  }

  rejectUnknownKeys(errors, "$.sourceFiles", value, ALLOWED_SOURCE_FILES_KEYS);
  for (const key of ALLOWED_SOURCE_FILES_KEYS) {
    const sourcePath = value[key];
    if (sourcePath !== undefined) expectSafeRelativePath(errors, `$.sourceFiles.${key}`, sourcePath);
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

function expectSlugArray(errors: string[], pathLabel: string, value: unknown): void {
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be an array of lowercase slugs`);
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry)) {
      errors.push(`${pathLabel}[${index}] must be a lowercase slug matching /^[a-z0-9]+(?:-[a-z0-9]+)*$/`);
    }
  });
}

function expectSafeRelativePath(errors: string[], pathLabel: string, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${pathLabel} must be a non-empty relative path`);
    return;
  }

  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\")) {
    errors.push(`${pathLabel} must be a safe relative path`);
    return;
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    errors.push(`${pathLabel} must be a safe relative path without empty, "." or ".." segments`);
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
