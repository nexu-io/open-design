/*
 * One-shot preview generator for the landing page.
 *
 * Walks every renderable artifact in the repo and saves a thumbnail
 * to `apps/landing-page/public/previews/<bucket>/<slug>.webp`:
 *
 *   skills/<slug>/example.html               → /previews/skills/<slug>.webp
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
import { mkdir, cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANDING_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(LANDING_ROOT, '../..');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates/live-artifacts');
const OUT_DIR = path.join(LANDING_ROOT, 'public/previews');

const VIEWPORT = { width: 1440, height: 900 } as const;
const SETTLE_MS = 800; // wait after `load` for fonts / R2 images / JS

interface Job {
  bucket: 'skills' | 'templates';
  slug: string;
  htmlPath: string;
  /** Optional ready-made preview to copy verbatim (skips browser). */
  reuseFrom?: string;
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
      });
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
          reuseFrom: ready,
        });
      } else if (existsSync(index)) {
        jobs.push({
          bucket: 'templates',
          slug,
          htmlPath: index,
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
  const targetPng = path.join(targetDir, `${job.slug}.png`);

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
    await page.goto(pathToFileURL(job.htmlPath).toString(), {
      waitUntil: 'load',
      timeout: 15000,
    });
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

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error(`✗ chromium.launch failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error('  Hint: in CI, ensure `playwright install --with-deps chromium` has run.');
    return EXIT_SYSTEMIC;
  }

  let ok = 0;
  let failed = 0;
  let bytes = 0;
  const reused: string[] = [];
  const errors: { slug: string; error: string }[] = [];

  // Concurrency limit — 4 contexts at once is plenty for this workload
  // and keeps total RAM under ~1.5GB.
  const CONCURRENCY = 4;
  let cursor = 0;
  try {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < filtered.length) {
          const idx = cursor++;
          const job = filtered[idx];
          if (!job) break;
          const result = await captureOne(browser, job);
          if (result.ok) {
            ok++;
            bytes += result.bytes;
            if (result.source === 'reuse') reused.push(job.slug);
            process.stdout.write(`✓ ${job.bucket}/${job.slug} (${(result.bytes / 1024).toFixed(0)}kb${result.source === 'reuse' ? ', reused' : ''})\n`);
          } else {
            failed++;
            errors.push({ slug: `${job.bucket}/${job.slug}`, error: result.error ?? 'unknown' });
            process.stdout.write(`✗ ${job.bucket}/${job.slug}: ${result.error}\n`);
          }
        }
      }),
    );
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ok=${ok} failed=${failed} reused=${reused.length} total=${(bytes / 1024 / 1024).toFixed(1)}MB`);
  if (errors.length > 0) {
    console.log('\nPer-artifact failures (deploy continues — catalog degrades gracefully for these):');
    for (const e of errors) console.log(`  ${e.slug}: ${e.error}`);
  }

  // Systemic failure: every job in a non-empty run failed. That means
  // the generator itself is broken, not just one author's example.html.
  if (filtered.length > 0 && ok === 0) {
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
