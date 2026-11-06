import { mkdirSync, writeFileSync, existsSync, cpSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

import { stageCatalogEntryAssets } from "./entry-assets.ts";
import { MINIMAL_WEBP, renderCardFromExternal, renderFallbackCard } from "./fallback-preview-card.ts";
import type { CatalogDocument, CatalogRecord } from "./schema.ts";

export type PreviewJob = {
  bucket: "skills" | "templates" | "plugins";
  stableId: string;
  /** Relative path inside staging dir. */
  relativePath: string;
  /** Optional file:// HTML source (example.html / index.html). */
  htmlPath?: string;
  /** In-memory HTML (fallback card). */
  htmlContent?: string;
  /** Local deterministic card used when the source requires remote resources. */
  remoteDependencyCard?: string;
  /** Ready-made image to copy (png/webp). */
  reuseFrom?: string;
  label: string;
};

export type PreviewCaptureResult = {
  bytes: Buffer;
  source: "render" | "reuse" | "fallback";
  warning?: string;
};

export type PreviewRenderer = ((job: PreviewJob) => Promise<PreviewCaptureResult>) & {
  close?: () => Promise<void>;
};

export type RenderPreviewsOptions = {
  catalog: CatalogDocument;
  repoRoot: string;
  stagingDir: string;
  /** Injected renderer; defaults to deterministic minimal-webp stub (no browser). */
  renderer?: PreviewRenderer;
  /** When true, fail if any job cannot produce bytes. Default true for pack readiness. */
  requireComplete?: boolean;
};

export type RenderPreviewsResult = {
  written: string[];
  warnings: string[];
  failed: string[];
};

/** Browser import/launch failed. Must abort the snapshot — not a per-job fallback. */
export class SystemicPreviewError extends Error {
  override name = "SystemicPreviewError";
}

function previewJobsForRecord(record: CatalogRecord, repoRoot: string, index: number): PreviewJob | null {
  if (record.type === "craft" || record.type === "system") return null;
  const previewPath = record.preview?.path;
  if (!previewPath) return null;

  if (record.type === "skill") {
    const example = join(repoRoot, "skills", record.id, "example.html");
    if (existsSync(example)) {
      return {
        bucket: "skills",
        stableId: record.id,
        relativePath: previewPath,
        htmlPath: example,
        remoteDependencyCard: renderFallbackCard(
          {
            slug: record.id,
            displayName: record.name,
            description: record.description,
            mode: record.mode,
            category: record.category,
            attribution: record.upstream,
          },
          index + 1,
        ),
        label: `skill:${record.id}`,
      };
    }
    return {
      bucket: "skills",
      stableId: record.id,
      relativePath: previewPath,
      htmlContent: renderFallbackCard(
        {
          slug: record.id,
          displayName: record.name,
          description: record.description,
          mode: record.mode,
          category: record.category,
          attribution: record.upstream,
        },
        index + 1,
      ),
      label: `skill-fallback:${record.id}`,
    };
  }

  if (record.type === "template") {
    if (record.origin === "design-template") {
      const dir = join(repoRoot, "design-templates", record.id);
      const ready = join(dir, "preview.png");
      const example = join(dir, "example.html");
      if (existsSync(ready)) {
        return {
          bucket: "templates",
          stableId: record.id,
          relativePath: previewPath,
          reuseFrom: ready,
          label: `template-reuse:${record.id}`,
        };
      }
      if (existsSync(example)) {
        return {
          bucket: "templates",
          stableId: record.id,
          relativePath: previewPath,
          htmlPath: example,
          remoteDependencyCard: renderFallbackCard(
            {
              slug: record.id,
              displayName: record.name,
              description: record.description,
              mode: record.mode,
            },
            index + 1,
          ),
          label: `template:${record.id}`,
        };
      }
      return {
        bucket: "templates",
        stableId: record.id,
        relativePath: previewPath,
        htmlContent: renderFallbackCard(
          {
            slug: record.id,
            displayName: record.name,
            description: record.description,
            mode: record.mode,
          },
          index + 1,
        ),
        label: `template-fallback:${record.id}`,
      };
    }

    const folder = record.id.replace(/^live-/, "");
    const dir = join(repoRoot, "templates/live-artifacts", folder);
    const ready = join(dir, "preview.png");
    const indexHtml = join(dir, "index.html");
    if (existsSync(ready)) {
      return {
        bucket: "templates",
        stableId: record.id,
        relativePath: previewPath,
        reuseFrom: ready,
        label: `live-reuse:${record.id}`,
      };
    }
    if (existsSync(indexHtml)) {
      return {
        bucket: "templates",
        stableId: record.id,
        relativePath: previewPath,
        htmlPath: indexHtml,
        remoteDependencyCard: renderFallbackCard(
          {
            slug: record.id,
            displayName: record.name,
            description: record.description,
          },
          index + 1,
        ),
        label: `live:${record.id}`,
      };
    }
    return {
      bucket: "templates",
      stableId: record.id,
      relativePath: previewPath,
      htmlContent: renderFallbackCard(
        {
          slug: record.id,
          displayName: record.name,
          description: record.description,
        },
        index + 1,
      ),
      label: `live-fallback:${record.id}`,
    };
  }

  if (record.type === "plugin") {
    // Remote poster/video already on CDN — still emit a local webp so the
    // snapshot is self-describing; prefer fallback card over shipping mp4.
    return {
      bucket: "plugins",
      stableId: record.id,
      relativePath: previewPath,
      htmlContent: renderCardFromExternal(
        {
          slug: record.id,
          title: record.name,
          description: record.description,
          mode: record.mode,
          category: record.scenario,
          attribution: record.authorName,
        },
        index + 1,
      ),
      label: `plugin:${record.id}`,
    };
  }

  return null;
}

/**
 * Deterministic stub renderer — always writes MINIMAL_WEBP.
 * Unit tests and environments without Playwright use this by default.
 */
export function createStubPreviewRenderer(): PreviewRenderer {
  return async (job) => {
    if (job.reuseFrom && existsSync(job.reuseFrom)) {
      return { bytes: readFileSync(job.reuseFrom), source: "reuse" };
    }
    // The stub simulates a successful render for tests that exercise packing
    // rather than browser behavior. Runtime capture failures use `fallback`
    // and are counted as failed jobs below.
    return { bytes: Buffer.from(MINIMAL_WEBP), source: "render", warning: `stub preview for ${job.label}` };
  };
}

type PlaywrightBrowser = {
  newContext(options: Record<string, unknown>): Promise<{
    addInitScript(script: { content: string }): Promise<void>;
    route(
      url: RegExp,
      handler: (route: { abort(errorCode?: string): Promise<void> }) => Promise<void>,
    ): Promise<void>;
    newPage(): Promise<{
      clock: {
        install(options: { time: string }): Promise<void>;
        pauseAt(time: string): Promise<void>;
        runFor(ms: number): Promise<void>;
      };
      setContent(html: string, options: Record<string, unknown>): Promise<void>;
      goto(url: string, options: Record<string, unknown>): Promise<unknown>;
      evaluate(fn: string): Promise<unknown>;
      waitForTimeout(ms: number): Promise<void>;
      screenshot(options: Record<string, unknown>): Promise<Buffer>;
    }>;
    close(): Promise<void>;
  }>;
  close(): Promise<void>;
};

const PREVIEW_CLOCK_START = "2026-01-01T00:00:00.000Z";
const PREVIEW_SETTLE_MS = 800;

function deterministicRandomInitScript(stableId: string): string {
  let seed = 2_166_136_261;
  for (const char of stableId) {
    seed ^= char.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16_777_619);
  }
  return `(() => {
    let state = ${seed >>> 0};
    Math.random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  })();`;
}

/**
 * Isolated Playwright renderer. Import/launch failures are systemic and throw.
 * Individual example.html failures still return fallback bytes + warning.
 */
type PlaywrightModule = {
  chromium: { launch(options: { headless: boolean }): Promise<PlaywrightBrowser> };
};

type ImportedPlaywrightModule = Partial<PlaywrightModule> & {
  default?: PlaywrightModule;
};

export type PlaywrightPreviewRendererOptions = {
  /** Test seam. Defaults to resolving the optional `playwright` package. */
  importPlaywright?: () => Promise<ImportedPlaywrightModule>;
};

function unwrapPlaywrightModule(module: ImportedPlaywrightModule): PlaywrightModule {
  if (module.chromium) return { chromium: module.chromium };
  if (module.default?.chromium) return module.default;
  throw new Error("playwright module does not export chromium");
}

async function importPlaywrightPackage(): Promise<PlaywrightModule> {
  // Optional peer: playwright is not a hard runtime dep of tools-release.
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve("playwright");
    return unwrapPlaywrightModule(
      (await import(pathToFileURL(resolved).href)) as ImportedPlaywrightModule,
    );
  } catch {
    const importer = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<ImportedPlaywrightModule>;
    return unwrapPlaywrightModule(await importer("playwright"));
  }
}

export function createPlaywrightPreviewRenderer(
  options: PlaywrightPreviewRendererOptions = {},
): PreviewRenderer {
  let browserPromise: Promise<PlaywrightBrowser> | null = null;

  async function getBrowser(): Promise<PlaywrightBrowser> {
    if (!browserPromise) {
      browserPromise = (async () => {
        try {
          const playwright = options.importPlaywright
            ? unwrapPlaywrightModule(await options.importPlaywright())
            : await importPlaywrightPackage();
          return await playwright.chromium.launch({ headless: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new SystemicPreviewError(
            `systemic preview failure: playwright browser launch failed: ${message}`,
            { cause: error },
          );
        }
      })();
    }
    try {
      return await browserPromise;
    } catch (error) {
      if (error instanceof SystemicPreviewError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SystemicPreviewError(
        `systemic preview failure: playwright browser launch failed: ${message}`,
        { cause: error },
      );
    }
  }

  const renderer: PreviewRenderer = async (job) => {
    if (job.reuseFrom && existsSync(job.reuseFrom)) {
      try {
        const raw = readFileSync(job.reuseFrom);
        const webp = await sharp(raw).webp({ quality: 80 }).toBuffer();
        return { bytes: webp, source: "reuse" };
      } catch (error) {
        return {
          bytes: Buffer.from(MINIMAL_WEBP),
          source: "fallback",
          warning: `reuse failed for ${job.label}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    const browser = await getBrowser();
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      });
      try {
        let blockedRemoteResource = false;
        // Commit-addressed previews may only consume file/data/blob resources.
        // Mutable CDNs would make a rerun of the same commit produce new bytes.
        await context.route(/^https?:\/\//iu, async (route) => {
          blockedRemoteResource = true;
          await route.abort("blockedbyclient");
        });
        await context.addInitScript({ content: deterministicRandomInitScript(job.stableId) });
        const page = await context.newPage();
        await page.clock.install({ time: PREVIEW_CLOCK_START });
        await page.clock.pauseAt(PREVIEW_CLOCK_START);
        if (job.htmlContent) {
          await page.setContent(job.htmlContent, { waitUntil: "load", timeout: 30_000 });
          await page.evaluate("document.fonts.ready");
        } else if (job.htmlPath) {
          await page.goto(pathToFileURL(resolve(job.htmlPath)).toString(), {
            waitUntil: "load",
            timeout: 30_000,
          });
        } else {
          throw new Error("preview job has neither htmlPath nor htmlContent");
        }
        let initialRenderError: unknown;
        try {
          await page.clock.runFor(PREVIEW_SETTLE_MS);
        } catch (error) {
          if (!blockedRemoteResource) throw error;
          initialRenderError = error;
        }
        let warning: string | undefined;
        if (blockedRemoteResource) {
          if (!job.remoteDependencyCard) {
            throw new Error(
              `blocked HTTP(S) dependency while rendering deterministic preview ${job.label}`,
            );
          }
          blockedRemoteResource = false;
          await page.setContent(job.remoteDependencyCard, { waitUntil: "load", timeout: 30_000 });
          await page.evaluate("document.fonts.ready");
          await page.clock.runFor(PREVIEW_SETTLE_MS);
          if (blockedRemoteResource) {
            throw new Error(
              `deterministic replacement card requested HTTP(S) resources for ${job.label}`,
            );
          }
          const reason = initialRenderError instanceof Error
            ? ` after source error: ${initialRenderError.message}`
            : "";
          warning = `rendered local deterministic card for remote-dependent preview ${job.label}${reason}`;
        }
        const png = await page.screenshot({
          type: "png",
          animations: "disabled",
          fullPage: false,
          clip: { x: 0, y: 0, width: 1440, height: 900 },
        });
        const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
        return {
          bytes: webp,
          source: "render",
          warning,
        };
      } finally {
        await context.close();
      }
    } catch (error) {
      return {
        bytes: Buffer.from(MINIMAL_WEBP),
        source: "fallback",
        warning: `preview failed for ${job.label}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  renderer.close = async () => {
    const pending = browserPromise;
    browserPromise = null;
    if (!pending) return;
    try {
      const browser = await pending;
      await browser.close();
    } catch {
      // Launch errors are surfaced by the render call; cleanup must not mask them.
    }
  };

  return renderer;
}

/**
 * Render previews into the snapshot staging directory.
 * Incomplete output (missing files for required paths) fails when requireComplete.
 */
export async function renderCatalogPreviews(options: RenderPreviewsOptions): Promise<RenderPreviewsResult> {
  const renderer = options.renderer ?? createStubPreviewRenderer();
  const requireComplete = options.requireComplete !== false;
  const written: string[] = [];
  const warnings: string[] = [];
  const failed: string[] = [];

  try {
    stageCatalogEntryAssets({
      catalog: options.catalog,
      repoRoot: options.repoRoot,
      stagingDir: options.stagingDir,
    });

    const jobs: PreviewJob[] = [];
    options.catalog.records.forEach((record, index) => {
      const job = previewJobsForRecord(record, options.repoRoot, index);
      if (job) jobs.push(job);
    });

    let okCount = 0;
    for (const job of jobs) {
      const target = join(options.stagingDir, job.relativePath);
      mkdirSync(dirname(target), { recursive: true });
      try {
        const result = await renderer(job);
        if (result.warning) warnings.push(result.warning);
        writeFileSync(target, result.bytes);
        if (result.bytes.length === 0) {
          failed.push(job.label);
          continue;
        }
        if (result.source === "fallback") {
          failed.push(job.label);
          continue;
        }
        written.push(job.relativePath);
        okCount += 1;
      } catch (error) {
        if (error instanceof SystemicPreviewError) throw error;
        failed.push(job.label);
        warnings.push(
          `systemic preview error for ${job.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Still write fallback so partial inspection is possible, but pack will fail.
        writeFileSync(target, MINIMAL_WEBP);
      }
    }

    if (jobs.length > 0 && okCount === 0) {
      throw new Error(`systemic preview failure: all ${jobs.length} preview job(s) failed`);
    }

    if (requireComplete) {
      for (const job of jobs) {
        const target = join(options.stagingDir, job.relativePath);
        if (!existsSync(target)) {
          throw new Error(`incomplete preview bundle: missing ${job.relativePath}`);
        }
      }
      if (failed.length > 0) {
        throw new Error(`incomplete preview bundle: failed ${failed.join(", ")}`);
      }
    }

    if (failed.length > 0 && failed.length === jobs.length) {
      throw new Error(`systemic preview failure: ${failed.join(", ")}`);
    }

    return { written, warnings, failed };
  } finally {
    await renderer.close?.();
  }
}

/** Copy helper kept for callers that already have a png on disk. */
export function copyPreviewAsset(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
