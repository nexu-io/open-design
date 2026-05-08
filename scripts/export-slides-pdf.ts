/// <reference lib="dom" />
/**
 * Slide HTML → vector PDF exporter
 *
 * Usage:
 *   node --experimental-strip-types scripts/export-slides-pdf.ts <slide.html> [output.pdf]
 *
 * Requirements: Playwright Chromium, pdf-lib (declared in root devDependencies)
 *
 * Strategy:
 *   1. Trust the deck's @media print rules first. Many decks already define
 *      `@page { size: ... }` and `.slide { page-break-after: always }`, so a
 *      single page.pdf() call yields a clean per-slide PDF. If the resulting
 *      page count equals the slide count, that's the result.
 *   2. Fallback: per-slide screen-mode capture. Navigate the deck via its own
 *      JS conventions (active / is-active class, #deck transform), isolate the
 *      current slide, and call page.pdf() with explicit 1920×1080 dimensions.
 *      Merge the per-slide PDFs with pdf-lib.
 *
 * Vector benefits:
 *   Text, SVG, and CSS borders stay vector — sharp at any print resolution.
 *   Canvas/WebGL is rasterized by Chromium internally.
 */

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const htmlArg = process.argv[2];
if (!htmlArg) {
  console.error('Usage: pnpm --filter @open-design/e2e export-pdf <slide.html> [output.pdf]');
  process.exit(1);
}

// pnpm sets INIT_CWD to the directory where the user ran the command.
// Fall back to process.cwd() when run directly with node.
const baseCwd = process.env['INIT_CWD'] ?? process.cwd();
const htmlPath = resolve(baseCwd, htmlArg);
const outputPath = process.argv[3]
  ? resolve(baseCwd, process.argv[3])
  : join(dirname(htmlPath), basename(htmlPath, '.html') + '.pdf');

console.log(`Source : ${htmlPath}`);
console.log(`Output : ${outputPath}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

// Let fonts and any WebGL shaders finish initializing
await page.waitForTimeout(1500);

const total: number = await page.evaluate(() =>
  document.querySelectorAll('.slide').length,
);

if (total === 0) {
  console.error('No .slide elements found — is this a valid slide HTML file?');
  await browser.close();
  process.exit(1);
}

console.log(`Slides  : ${total}`);

// ── Strategy 1: trust the deck's @media print rules ─────────────────────────
//
// page.pdf() defaults to print media. preferCSSPageSize honours the deck's
// @page declaration when present. We still pass width/height as a fallback
// for decks without @page rules.
console.log('Trying print-CSS pass...');
const directBytes = await page.pdf({
  printBackground: true,
  preferCSSPageSize: true,
  width: '1920px',
  height: '1080px',
});
const directDoc = await PDFDocument.load(directBytes);
const directPages = directDoc.getPageCount();

if (directPages === total) {
  console.log(`Print CSS produced ${directPages} pages — using direct output.`);
  writeFileSync(outputPath, await directDoc.save());
  await browser.close();
  console.log(`PDF saved: ${total} pages → ${outputPath}`);
  console.log(`\nDone → ${outputPath}`);
  process.exit(0);
}

console.log(
  `Print CSS produced ${directPages} pages (expected ${total}). Falling back to per-slide capture...`,
);

// ── Strategy 2: per-slide screen-mode capture ───────────────────────────────

await page.emulateMedia({ media: 'screen' });

const merged = await PDFDocument.create();

for (let i = 0; i < total; i++) {
  await page.evaluate((idx: number) => {
    const deck = document.getElementById('deck') as HTMLElement | null;
    const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'));

    // Disable CSS transition so the jump is instant
    if (deck) deck.style.transition = 'none';

    // Pattern A: horizontal-scroll deck (#deck translateX)
    if (deck && deck.style.width && deck.style.width.includes('vw')) {
      deck.style.transform = `translateX(${-idx * 100}vw)`;
    }

    // Patterns B/C: class-toggle decks (.active or .is-active)
    slides.forEach((s, si) => {
      const on = si === idx;
      s.classList.toggle('active', on);
      s.classList.toggle('is-active', on);
    });

    // Sync body theme class used by some decks
    const el = slides[idx];
    if (el) {
      const th =
        (el as HTMLElement).dataset['theme'] ??
        (el.classList.contains('light') ? 'light' : 'dark');
      document.body.classList.toggle('light-bg', th === 'light');
    }

    // Isolate the active slide so page.pdf() emits exactly one 1920×1080 page.
    if (deck) {
      deck.style.transform = 'none';
      deck.style.width = '100vw';
    }
    slides.forEach((s, si) => {
      s.style.display = si === idx ? '' : 'none';
    });
  }, i);

  // One frame of paint time
  await page.waitForTimeout(120);

  const pdfBytes = await page.pdf({
    width: '1920px',
    height: '1080px',
    printBackground: true,
    pageRanges: '1',
  });

  const slidePdf = await PDFDocument.load(pdfBytes);
  const [copied] = await merged.copyPages(slidePdf, [0]);
  merged.addPage(copied);

  process.stdout.write(`\r  slide ${String(i + 1).padStart(3)}/${total}`);
}

process.stdout.write('\n');
console.log('All slides captured. Writing PDF...');
await browser.close();

writeFileSync(outputPath, await merged.save());

console.log(`PDF saved: ${total} pages → ${outputPath}`);
console.log(`\nDone → ${outputPath}`);
