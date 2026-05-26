/*
 * One-shot preview generator for the landing page.
 *
 * Walks every renderable artifact in the repo and saves a thumbnail
 * to `apps/landing-page/public/previews/<bucket>/<slug>.webp`:
 *
 *   skills/<slug>/example.html               → /previews/skills/<slug>.webp
 *   design-templates/<slug>/example.html     → /previews/templates/<slug>.webp
 *   templates/live-artifacts/<slug>/index.html → /previews/templates/live-<slug>.webp
 *   templates/live-artifacts/<slug>/preview.png → reused verbatim where it exists
 *
 * Run with: `pnpm --filter @open-design/landing-page previews`
 *
 * Outputs are intentionally NOT committed by this script — the caller
 * decides whether to commit (small, deterministic) or upload to R2
 * (lighter repo, faster CDN). The catalog data layer auto-detects
 * presence at build time so missing previews degrade silently.
 *
 * Defaults: 1440×900 viewport, captured viewport-only (no full-page
 * scroll) at scale=1, then converted to 1280-wide WebP at quality 80
 * by the `sharp` post-processor below.
 */
import { chromium, type Browser } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, cp, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  loadSkillCardMeta,
  renderFallbackCard,
  renderCardFromExternal,
  type SkillCardMeta,
} from './fallback-preview-card.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANDING_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(LANDING_ROOT, '../..');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const DESIGN_TEMPLATES_DIR = path.join(REPO_ROOT, 'design-templates');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates/live-artifacts');
const BUNDLED_PLUGINS_DIR = path.join(REPO_ROOT, 'plugins/_official');
// Buckets we walk under `plugins/_official/`. Order = registry walk order;
// per-bucket previews land at `out/plugins/<manifest-id>.png` regardless.
const BUNDLED_BUCKETS = [
  'examples',
  'image-templates',
  'video-templates',
  'scenarios',
  'design-systems',
] as const;
const OUT_DIR = path.join(LANDING_ROOT, 'public/previews');
const LANDING_PACKAGE_JSON = path.join(LANDING_ROOT, 'package.json');
const MANIFEST_PATH = path.join(OUT_DIR, '.manifest.json');

const VIEWPORT = { width: 1440, height: 900 } as const;
const NAVIGATION_TIMEOUT_MS = 30000;
const SETTLE_MS = 800; // wait after `load` for fonts / R2 images / JS
const PREVIEW_GENERATOR_VERSION = '2026-05-22-incremental-1';
const MANIFEST_VERSION = 1;

interface Job {
  bucket: 'skills' | 'templates' | 'plugins';
  slug: string;
  htmlPath: string;
  sourceRoot: string;
  /** Optional ready-made preview to copy verbatim (skips browser). */
  reuseFrom?: string;
  /**
   * When set, the renderer screenshots this in-memory HTML instead of
   * navigating to `htmlPath`. Used by the fallback-card path for skills
   * that ship a SKILL.md but no runnable demo. `htmlPath` still points
   * at SKILL.md so the source-hash machinery picks up edits.
   */
  htmlContent?: string;
}

interface PreviewManifestEntry {
  bucket: Job['bucket'];
  slug: string;
  sourceHash: string;
  output: string;
  bytes: number;
}

interface PreviewManifest {
  version: number;
  generatorHash: string;
  entries: Record<string, PreviewManifestEntry>;
}

const RELATIVE_ASSET_PATTERN = /(?:src|href|poster)\s*=\s*["']([^"']+)["']|url\((['"]?)([^'"\)]+)\2\)/g;

function jobKey(job: Pick<Job, 'bucket' | 'slug'>): string {
  return `${job.bucket}/${job.slug}`;
}

function outputPathFor(job: Pick<Job, 'bucket' | 'slug'>): string {
  return path.join(OUT_DIR, job.bucket, `${job.slug}.png`);
}

function outputRelativePathFor(job: Pick<Job, 'bucket' | 'slug'>): string {
  return `${job.bucket}/${job.slug}.png`;
}

function normalizeForHash(value: string): string {
  return value.split(path.sep).join('/');
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}

async function hashDirectory(rootDir: string): Promise<string> {
  const hash = createHash('sha256');

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === '.DS_Store' || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = normalizeForHash(path.relative(rootDir, fullPath));
      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}\n`);
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      hash.update(`file:${relativePath}\n`);
      hash.update(await readFile(fullPath));
    }
  }

  await walk(rootDir);
  return hash.digest('hex');
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function relativeAssetPaths(source: string): string[] {
  const matches = new Set<string>();
  for (const match of source.matchAll(RELATIVE_ASSET_PATTERN)) {
    const raw = match[1] ?? match[3];
    if (!raw) {
      continue;
    }

    const specifier = raw.split('#', 1)[0]?.split('?', 1)[0]?.trim();
    if (!specifier || (!specifier.startsWith('./') && !specifier.startsWith('../'))) {
      continue;
    }

    matches.add(specifier);
  }

  return [...matches].sort((left, right) => left.localeCompare(right));
}

async function hashExtraDependencyRoots(
  job: Job,
  directoryHashes: Map<string, string>,
): Promise<string> {
  const extraRoots = new Set<string>();
  if (existsSync(job.htmlPath)) {
    const source = await readFile(job.htmlPath, 'utf8');
    const baseDir = path.dirname(job.htmlPath);

    for (const specifier of relativeAssetPaths(source)) {
      const resolvedPath = path.resolve(baseDir, specifier);
      if (isWithinRoot(job.sourceRoot, resolvedPath) || !existsSync(resolvedPath)) {
        continue;
      }

      const stats = await stat(resolvedPath);
      extraRoots.add(stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath));
    }
  }

  if (job.reuseFrom && !isWithinRoot(job.sourceRoot, job.reuseFrom) && existsSync(job.reuseFrom)) {
    const stats = await stat(job.reuseFrom);
    extraRoots.add(stats.isDirectory() ? job.reuseFrom : path.dirname(job.reuseFrom));
  }

  const hash = createHash('sha256');
  for (const root of [...extraRoots].sort((left, right) => left.localeCompare(right))) {
    let dependencyHash = directoryHashes.get(root);
    if (!dependencyHash) {
      dependencyHash = await hashDirectory(root);
      directoryHashes.set(root, dependencyHash);
    }
    hash.update(`${normalizeForHash(path.relative(REPO_ROOT, root))}:${dependencyHash}\n`);
  }
  return hash.digest('hex');
}

async function sourceHashForJob(job: Job, directoryHashes: Map<string, string>): Promise<string> {
  let baseHash = directoryHashes.get(job.sourceRoot);
  if (!baseHash) {
    baseHash = await hashDirectory(job.sourceRoot);
    directoryHashes.set(job.sourceRoot, baseHash);
  }

  const hash = createHash('sha256');
  // Fallback-card jobs encode their input in `htmlContent` (template
  // output for SKILL.md frontmatter). Folding it into the source hash
  // means a template tweak invalidates only the 96 fallbacks, not the
  // expensive real-demo screenshots that don't depend on it.
  if (job.htmlContent) hash.update(job.htmlContent);
  hash.update(baseHash);
  hash.update(await hashExtraDependencyRoots(job, directoryHashes));
  return hash.digest('hex');
}

async function generatorHash(): Promise<string> {
  const hash = createHash('sha256');
  hash.update(await readFile(fileURLToPath(import.meta.url)));
  hash.update(await readFile(LANDING_PACKAGE_JSON));
  hash.update(
    JSON.stringify({
      PREVIEW_GENERATOR_VERSION,
      VIEWPORT,
      NAVIGATION_TIMEOUT_MS,
      SETTLE_MS,
      outputType: 'png',
      deviceScaleFactor: 2,
      clip: VIEWPORT,
    }),
  );
  return hash.digest('hex');
}

async function loadManifest(expectedGeneratorHash: string): Promise<PreviewManifest> {
  if (!existsSync(MANIFEST_PATH)) {
    return { version: MANIFEST_VERSION, generatorHash: expectedGeneratorHash, entries: {} };
  }

  try {
    const parsed = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Partial<PreviewManifest>;
    if (
      parsed.version !== MANIFEST_VERSION ||
      parsed.generatorHash !== expectedGeneratorHash ||
      !parsed.entries ||
      typeof parsed.entries !== 'object'
    ) {
      return { version: MANIFEST_VERSION, generatorHash: expectedGeneratorHash, entries: {} };
    }
    return {
      version: MANIFEST_VERSION,
      generatorHash: expectedGeneratorHash,
      entries: parsed.entries,
    };
  } catch {
    return { version: MANIFEST_VERSION, generatorHash: expectedGeneratorHash, entries: {} };
  }
}

async function saveManifest(manifest: PreviewManifest): Promise<void> {
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function removeIfExists(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    return;
  }
  await unlink(filePath);
}

/**
 * Skills without a runnable `example.html` — pure SKILL.md instruction
 * skills like `copywriting`, `creative-director`, `competitive-ads-extractor`.
 * We synthesize a typographic editorial card and screenshot it so the
 * catalog row stops falling back to a blank diagonal-stripe placeholder.
 *
 * The card's Nº matches the row's position WITHIN the instruction
 * section (1..N over instruction skills only, sorted by featured asc
 * then alphabetical). That keeps card numbering stable with what the
 * catalog renders on `/skills/instructions/` and the Instructions
 * section of `/skills/`.
 */
async function buildFallbackCardJobs(): Promise<Job[]> {
  const skillJobs = await buildFallbackCardJobsFor({
    sourceRoot: SKILLS_DIR,
    bucket: 'skills',
    hasRunnableDemo: (slug) => existsSync(path.join(SKILLS_DIR, slug, 'example.html')),
  });

  // Some `design-templates/<slug>/` ship neither example.html nor a
  // ready-made preview.png — typically instruction-style design briefs
  // misfiled under `design-templates/` instead of `skills/`. Without
  // this, the catalog row falls back to the diagonal-stripe placeholder
  // on `/plugins/templates/`. Treat them like instruction skills and
  // synthesize the same editorial card.
  const designTemplateJobs = await buildFallbackCardJobsFor({
    sourceRoot: DESIGN_TEMPLATES_DIR,
    bucket: 'templates',
    hasRunnableDemo: (slug) =>
      existsSync(path.join(DESIGN_TEMPLATES_DIR, slug, 'example.html')) ||
      existsSync(path.join(DESIGN_TEMPLATES_DIR, slug, 'preview.png')),
  });

  return [...skillJobs, ...designTemplateJobs];
}

async function buildFallbackCardJobsFor(args: {
  sourceRoot: string;
  bucket: 'skills' | 'templates';
  hasRunnableDemo: (slug: string) => boolean;
}): Promise<Job[]> {
  const allSlugs: string[] = [];
  for (const entry of await readdir(args.sourceRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) allSlugs.push(entry.name);
  }

  const fallbackSlugs = allSlugs.filter((slug) => !args.hasRunnableDemo(slug));

  const metas = fallbackSlugs
    .map((slug) => loadSkillCardMeta(args.sourceRoot, slug))
    .filter((m): m is SkillCardMeta => m !== null);

  // Match `_lib/catalog.ts` → `getSkillRecords` sort: featured (∞ if
  // unset) ascending, then alphabetical. Numbering is per-bucket so a
  // given source folder's fallback cards stay in sync with the route
  // that lists them (`/plugins/skills/` for skills, `/plugins/templates/`
  // for design-templates).
  metas.sort((a, b) => {
    const af = a.featured ?? Number.POSITIVE_INFINITY;
    const bf = b.featured ?? Number.POSITIVE_INFINITY;
    if (af !== bf) return af - bf;
    return a.slug.localeCompare(b.slug);
  });

  const jobs: Job[] = [];
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i]!;
    const slugDir = path.join(args.sourceRoot, meta.slug);
    jobs.push({
      bucket: args.bucket,
      slug: meta.slug,
      htmlPath: path.join(slugDir, 'SKILL.md'),
      sourceRoot: slugDir,
      htmlContent: renderFallbackCard(meta, i + 1),
    });
  }
  return jobs;
}

/**
 * Bundled plugins (`plugins/_official/<bucket>/<slug>/open-design.json`)
 * are the daemon's canonical plugin registry, and the in-app Plugins
 * home reads from here. The marketing site's `/plugins/...` routes
 * mirror the same data, so every bundled entry that doesn't ship a
 * remote `od.preview.poster` URL needs a locally generated thumb so
 * catalog rows never fall back to the diagonal-stripe placeholder.
 *
 * Three preview paths, in priority order:
 *   1. Manifest already carries `od.preview.poster` (R2/CDN URL) — we
 *      don't generate anything; the route's <img src> points straight
 *      at the remote URL. Caller is expected to skip these.
 *   2. Manifest carries `od.preview.entry` pointing at a local
 *      `example.html` — Playwright screenshots that file in-place,
 *      treating the slug folder as the asset root so relative
 *      `./assets/...` resolves correctly.
 *   3. Neither — synthesize the typographic fallback card from the
 *      manifest's `title`/`description`/`mode`/`scenario`/`tags`. Same
 *      visual as the SKILL.md fallback, just sourced from JSON.
 *
 * Output filename is the manifest `name` (e.g.
 * `image-template-3d-stone-staircase-evolution-infographic.png`) so
 * `<img src="/previews/plugins/<manifest-id>.png">` resolves directly.
 */
async function buildBundledPluginJobs(): Promise<Job[]> {
  if (!existsSync(BUNDLED_PLUGINS_DIR)) return [];

  const jobs: Job[] = [];
  // Track per-bucket index for the fallback card's Nº.
  const fallbackIndexByBucket = new Map<string, number>();

  for (const bucket of BUNDLED_BUCKETS) {
    const bucketDir = path.join(BUNDLED_PLUGINS_DIR, bucket);
    if (!existsSync(bucketDir)) continue;
    const entries = await readdir(bucketDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const slugDir = path.join(bucketDir, entry.name);
      const manifestPath = path.join(slugDir, 'open-design.json');
      if (!existsSync(manifestPath)) continue;

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
          string,
          unknown
        >;
      } catch {
        continue;
      }

      // Filter atoms (infrastructure) — they don't need a thumbnail.
      const od = (raw.od ?? {}) as Record<string, unknown>;
      if (od.kind === 'atom') continue;

      const manifestId = typeof raw.name === 'string' ? raw.name : entry.name;

      // Path 1: manifest ships a poster URL → no local generation.
      const preview = (od.preview ?? {}) as Record<string, unknown>;
      if (typeof preview.poster === 'string' && preview.poster.length > 0) {
        continue;
      }

      // Path 2: manifest ships a local entry HTML.
      const entryRel = typeof preview.entry === 'string' ? preview.entry : null;
      if (entryRel) {
        const entryAbs = path.resolve(slugDir, entryRel);
        if (existsSync(entryAbs)) {
          jobs.push({
            bucket: 'plugins',
            slug: manifestId,
            htmlPath: entryAbs,
            sourceRoot: slugDir,
          });
          continue;
        }
      }

      // Path 3: synthesize a fallback card from manifest fields.
      const idx = (fallbackIndexByBucket.get(bucket) ?? 0) + 1;
      fallbackIndexByBucket.set(bucket, idx);
      jobs.push({
        bucket: 'plugins',
        slug: manifestId,
        htmlPath: manifestPath,
        sourceRoot: slugDir,
        htmlContent: renderCardFromExternal(
          {
            slug: manifestId,
            title: typeof raw.title === 'string' ? raw.title : manifestId,
            description:
              typeof raw.description === 'string' ? raw.description : '',
            mode: typeof od.mode === 'string' ? od.mode : undefined,
            category: typeof od.scenario === 'string' ? od.scenario : undefined,
            attribution:
              typeof (raw.author as Record<string, unknown> | undefined)?.name ===
              'string'
                ? ((raw.author as Record<string, unknown>).name as string)
                : undefined,
          },
          idx,
        ),
      });
    }
  }

  return jobs;
}

async function discoverJobs(): Promise<Job[]> {
  const jobs: Job[] = [];

  const skillEntries = await readdir(SKILLS_DIR, { withFileTypes: true });
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const example = path.join(SKILLS_DIR, entry.name, 'example.html');
    if (existsSync(example)) {
      jobs.push({
        bucket: 'skills',
        slug: entry.name,
        htmlPath: example,
        sourceRoot: path.join(SKILLS_DIR, entry.name),
      });
    }
  }

  // Synthesize cards for every other SKILL.md so the catalog never
  // shows a bare diagonal-stripe placeholder when the agent has nothing
  // demo-able to render.
  jobs.push(...(await buildFallbackCardJobs()));

  // Bundled-plugin manifests under `plugins/_official/`. Renders local
  // example.html where present, falls back to the same typographic
  // card the SKILL.md path uses otherwise. Manifests with a remote
  // `od.preview.poster` URL are skipped — the catalog page points
  // straight at the CDN URL.
  jobs.push(...(await buildBundledPluginJobs()));

  if (existsSync(DESIGN_TEMPLATES_DIR)) {
    const designTemplateEntries = await readdir(DESIGN_TEMPLATES_DIR, { withFileTypes: true });
    for (const entry of designTemplateEntries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(DESIGN_TEMPLATES_DIR, entry.name);
      const example = path.join(dir, 'example.html');
      const ready = path.join(dir, 'preview.png');
      if (existsSync(ready)) {
        jobs.push({
          bucket: 'templates',
          slug: entry.name,
          htmlPath: example,
          sourceRoot: dir,
          reuseFrom: ready,
        });
      } else if (existsSync(example)) {
        jobs.push({
          bucket: 'templates',
          slug: entry.name,
          htmlPath: example,
          sourceRoot: dir,
        });
      }
    }
  }

  if (existsSync(TEMPLATES_DIR)) {
    const templateEntries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
    for (const entry of templateEntries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(TEMPLATES_DIR, entry.name);
      const index = path.join(dir, 'index.html');
      const ready = path.join(dir, 'preview.png');
      const slug = `live-${entry.name}`;
      if (existsSync(ready)) {
        jobs.push({
          bucket: 'templates',
          slug,
          htmlPath: index,
          sourceRoot: dir,
          reuseFrom: ready,
        });
      } else if (existsSync(index)) {
        jobs.push({
          bucket: 'templates',
          slug,
          htmlPath: index,
          sourceRoot: dir,
        });
      }
    }
  }

  return jobs;
}

async function captureOne(browser: Browser, job: Job): Promise<{
  ok: boolean;
  bytes: number;
  source: 'reuse' | 'render';
  error?: string;
}> {
  const targetDir = path.join(OUT_DIR, job.bucket);
  await mkdir(targetDir, { recursive: true });
  const targetPng = outputPathFor(job);

  if (job.reuseFrom) {
    await cp(job.reuseFrom, targetPng);
    const s = await stat(targetPng);
    return { ok: true, bytes: s.size, source: 'reuse' };
  }

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  try {
    if (job.htmlContent) {
      // In-memory render path (fallback cards). `setContent` resolves
      // before `<link rel="stylesheet">` finishes, so explicitly wait
      // for `load` and `document.fonts.ready` — without this the
      // screenshot captures a flash of unstyled serif glyphs.
      await page.setContent(job.htmlContent, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.evaluate(() => document.fonts.ready);
    } else {
      await page.goto(pathToFileURL(job.htmlPath).toString(), {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    }
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({
      path: targetPng,
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    const s = await stat(targetPng);
    return { ok: true, bytes: s.size, source: 'render' };
  } catch (err) {
    return {
      ok: false,
      bytes: 0,
      source: 'render',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await ctx.close();
  }
}

// Exit codes used by main():
//   0 — at least one preview was produced (or there was nothing to do).
//   1 — discovery / browser launch failure, OR every job in a non-empty
//       run failed (systemic issue — workflows must surface this).
//
// Per-artifact failures alone do NOT exit non-zero. A single broken
// `example.html` should never block a deploy that successfully renders
// the other 100+ previews. CI workflows therefore do NOT need
// `continue-on-error: true` on this step — a non-zero exit here means
// something is genuinely wrong and the build should stop.
const EXIT_OK = 0;
const EXIT_SYSTEMIC = 1;

async function main(): Promise<number> {
  let jobs: Job[];
  try {
    jobs = await discoverJobs();
  } catch (err) {
    console.error(`✗ discoverJobs failed: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_SYSTEMIC;
  }

  // Allow a single arg `--only=<substring>` to subset for fast iteration.
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const filtered = only ? jobs.filter((j) => j.slug.includes(only)) : jobs;

  console.log(`Generating ${filtered.length} previews → ${path.relative(REPO_ROOT, OUT_DIR)}/`);

  if (filtered.length === 0) {
    // Nothing to do — empty repo, or `--only=` matched nothing. Exit
    // clean so CI doesn't fail a deploy that legitimately has no
    // previews to render (e.g., on an early scaffold where no skill
    // ships an `example.html` yet).
    return EXIT_OK;
  }

  await mkdir(OUT_DIR, { recursive: true });

  const currentGeneratorHash = await generatorHash();
  const previousManifest = await loadManifest(currentGeneratorHash);
  const nextManifest: PreviewManifest = {
    version: MANIFEST_VERSION,
    generatorHash: currentGeneratorHash,
    entries: only ? { ...previousManifest.entries } : {},
  };

  if (!only) {
    const currentJobKeys = new Set(jobs.map((job) => jobKey(job)));
    for (const [key, entry] of Object.entries(previousManifest.entries)) {
      if (!currentJobKeys.has(key)) {
        await removeIfExists(path.join(OUT_DIR, entry.output));
      }
    }
  }

  const directoryHashes = new Map<string, string>();
  const sourceHashes = new Map<string, string>();
  for (const job of filtered) {
    sourceHashes.set(jobKey(job), await sourceHashForJob(job, directoryHashes));
  }

  const skipped: string[] = [];
  const pending: Job[] = [];
  let skippedBytes = 0;

  for (const job of filtered) {
    const key = jobKey(job);
    const sourceHash = sourceHashes.get(key);
    if (!sourceHash) {
      pending.push(job);
      continue;
    }

    const existing = previousManifest.entries[key];
    const outputPath = outputPathFor(job);
    if (
      existing &&
      existing.sourceHash === sourceHash &&
      existing.output === outputRelativePathFor(job) &&
      existsSync(outputPath)
    ) {
      const outputStats = await stat(outputPath);
      if (outputStats.size > 0) {
        skipped.push(key);
        skippedBytes += outputStats.size;
        nextManifest.entries[key] = {
          ...existing,
          bytes: outputStats.size,
        };
        continue;
      }
    }

    await removeIfExists(outputPath);
    pending.push(job);
  }

  const reuseJobs = pending.filter((job) => job.reuseFrom);
  const renderJobs = pending.filter((job) => !job.reuseFrom);

  let ok = 0;
  let failed = 0;
  let bytes = skippedBytes;
  const reused: string[] = [];
  const errors: { slug: string; error: string }[] = [];

  for (const key of skipped) {
    process.stdout.write(`↷ ${key} (cached)\n`);
  }

  for (const job of reuseJobs) {
    const result = await captureOne(undefined as never, job);
    const key = jobKey(job);
    const sourceHash = sourceHashes.get(key);
    if (result.ok && sourceHash) {
      ok++;
      bytes += result.bytes;
      reused.push(job.slug);
      nextManifest.entries[key] = {
        bucket: job.bucket,
        slug: job.slug,
        sourceHash,
        output: outputRelativePathFor(job),
        bytes: result.bytes,
      };
      process.stdout.write(`✓ ${job.bucket}/${job.slug} (${(result.bytes / 1024).toFixed(0)}kb, reused)\n`);
    } else {
      failed++;
      errors.push({ slug: key, error: result.error ?? 'unknown' });
      process.stdout.write(`✗ ${key}: ${result.error}\n`);
    }
  }

  if (renderJobs.length > 0) {
    let browser: Browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.error(`✗ chromium.launch failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error('  Hint: in CI, ensure `playwright install --with-deps chromium` has run.');
      return EXIT_SYSTEMIC;
    }

    // Concurrency limit — 4 contexts at once is plenty for this workload
    // and keeps total RAM under ~1.5GB.
    const CONCURRENCY = 4;
    let cursor = 0;
    try {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (cursor < renderJobs.length) {
            const idx = cursor++;
            const job = renderJobs[idx];
            if (!job) break;
            const result = await captureOne(browser, job);
            const key = jobKey(job);
            const sourceHash = sourceHashes.get(key);
            if (result.ok && sourceHash) {
              ok++;
              bytes += result.bytes;
              nextManifest.entries[key] = {
                bucket: job.bucket,
                slug: job.slug,
                sourceHash,
                output: outputRelativePathFor(job),
                bytes: result.bytes,
              };
              process.stdout.write(`✓ ${job.bucket}/${job.slug} (${(result.bytes / 1024).toFixed(0)}kb)\n`);
            } else {
              failed++;
              errors.push({ slug: key, error: result.error ?? 'unknown' });
              process.stdout.write(`✗ ${key}: ${result.error}\n`);
            }
          }
        }),
      );
    } finally {
      await browser.close();
    }
  }

  await saveManifest(nextManifest);

  console.log(`\nDone. ok=${ok} skipped=${skipped.length} failed=${failed} reused=${reused.length} total=${(bytes / 1024 / 1024).toFixed(1)}MB`);
  if (errors.length > 0) {
    console.log('\nPer-artifact failures (deploy continues — catalog degrades gracefully for these):');
    for (const e of errors) console.log(`  ${e.slug}: ${e.error}`);
  }

  // Systemic failure: every job in a non-empty run failed. That means
  // the generator itself is broken, not just one author's example.html.
  if (filtered.length > 0 && ok + skipped.length === 0) {
    console.error(
      `\n✗ All ${filtered.length} preview job(s) failed — treating as systemic.`,
    );
    return EXIT_SYSTEMIC;
  }

  return EXIT_OK;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(EXIT_SYSTEMIC);
  });
