import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { optional, required } from "../storage/common.ts";
import { resolveRepoRoot } from "./export-catalog.ts";
import {
  createPlaywrightPreviewRenderer,
  createStubPreviewRenderer,
  renderCatalogPreviews,
} from "./render-previews.ts";
import type { CatalogDocument } from "./schema.ts";
import { assertValidCatalog } from "./validate.ts";

export async function renderCatalogPreviewsFromEnv(): Promise<void> {
  const stagingDir = resolve(required("CATALOG_STAGING_DIR"));
  const catalogPath = join(stagingDir, "catalog.json");
  if (!existsSync(catalogPath)) {
    throw new Error(`catalog.json missing; run export-catalog first (${catalogPath})`);
  }
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogDocument;
  assertValidCatalog(catalog);

  const mode = optional("CATALOG_PREVIEW_RENDERER", "playwright");
  const renderer =
    mode === "stub" ? createStubPreviewRenderer() : createPlaywrightPreviewRenderer();

  const result = await renderCatalogPreviews({
    catalog,
    repoRoot: resolveRepoRoot(),
    stagingDir,
    renderer,
    requireComplete: true,
  });

  for (const warning of result.warnings) {
    console.warn(`warning: ${warning}`);
  }
  console.log(
    `rendered previews written=${result.written.length} failed=${result.failed.length} warnings=${result.warnings.length}`,
  );
  if (result.failed.length > 0) {
    throw new Error(`incomplete preview bundle: failed ${result.failed.join(", ")}`);
  }
}
