// @ts-nocheck
// HTML → PDF → PPTX converter.
//
// Pipeline:
//   1. Playwright opens the HTML deck file, waits for fonts/images/WebGL,
//      captures canvas frames as PNG data URIs, injects them as slide
//      background fallbacks (Chromium print engine blanks out WebGL
//      canvases in @media print), then exports multi-page PDF.
//   2. LibreOffice converts PDF → PPTX via --infilter="impress_pdf_import"
//      with 300 DPI import resolution (default is only 96).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

const execFileP = promisify(execFile);

// CSS injected into the page before PDF export to ensure every slide
// is visible as a separate page under @media print.
const PDF_PRINT_CSS = `
@media print {
  @page {
    size: 20in 11.25in;
    margin: 0;
  }
  html, body {
    width: 20in !important;
    height: auto !important;
    overflow: visible !important;
    /* Override dark body backgrounds — the canvas snapshot or
       slide-level backgrounds provide the actual visual background.
       Without this, dark backgrounds bleed through where canvas/print
       engine blanks out elements. */
    background: #ffffff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Kill horizontal scroll-snap layout — stack slides vertically */
  #deck {
    width: 20in !important;
    height: auto !important;
    position: static !important;
    transform: none !important;
    inset: auto !important;
    display: block !important;
    overflow: visible !important;
    flex-wrap: nowrap !important;
  }
  /* All slides visible, stacked vertically, one per page */
  .slide, section.slide {
    display: flex !important;
    flex: 0 0 11.25in !important;
    width: 20in !important;
    height: 11.25in !important;
    min-height: 11.25in !important;
    max-height: 11.25in !important;
    page-break-after: always;
    position: relative !important;
    overflow: hidden !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .slide:last-child {
    page-break-after: auto;
  }
  /* Hide only nav dots & keyboard hint — keep chrome/foot as content */
  #nav, #hint, .deck-counter, .deck-hint, .deck-nav {
    display: none !important;
  }
}
`;

// LibreOffice binary paths
const LIBREOFFICE_PATHS = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
  '/usr/bin/soffice',
  '/snap/bin/libreoffice.soffice',
  'soffice',
];

async function findLibreOffice(): Promise<string | null> {
  for (const p of LIBREOFFICE_PATHS) {
    try {
      if (!path.isAbsolute(p)) {
        const { stdout } = await execFileP('which', [p], { timeout: 3000 });
        if (stdout.trim()) return stdout.trim();
        continue;
      }
      statSync(p);
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

interface ConvertOptions {
  htmlPath: string;
  outputPath: string;
  aspectRatio?: '16:9' | '4:3';
  width?: number;
  onProgress?: (slide: number, total: number) => void;
}

interface ConvertResult {
  path: string;
  slideCount: number;
  sizeBytes: number;
}

export async function convertHtmlToPptx(opts: ConvertOptions): Promise<ConvertResult> {
  const {
    htmlPath,
    outputPath,
    aspectRatio = '16:9',
    width = 1920,
    onProgress,
  } = opts;

  const height = aspectRatio === '4:3' ? Math.round(width * 3 / 4) : 1080;
  const pdfPath = outputPath.replace(/\.pptx$/i, '.pdf');

  // ---- Step 1: HTML → PDF via Playwright ----
  const { chromium } = await import('playwright');

  // Try to use an existing Chrome channel first (faster, no download needed),
  // then fall back to headless Playwright Chromium.
  let browser: Awaited<ReturnType<typeof chromium['launch']>>;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage({
    viewport: { width, height },
  });

  let slideCount = 0;

  try {
    const fileUrl = `file://${htmlPath}`;
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 30_000 });

    // Wait for Google Fonts, external images, and WebFont rendering
    await page.evaluate(() => {
      if (document.fonts && document.fonts.ready) {
        return document.fonts.ready;
      }
      return Promise.resolve();
    });

    // Wait for all images to finish loading
    await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return Promise.all(
        images.filter(img => !img.complete).map(
          img => new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
        )
      );
    });

    // Capture WebGL/Canvas frames before print — Chromium blanks out
    // <canvas> elements in @media print mode. We snapshot the current frame
    // and inject it as a background-image fallback on each slide.
    const canvasBgStyle = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      if (canvases.length === 0) return '';
      // Find the primary background canvas (largest one)
      let primary = canvases[0];
      for (const c of canvases) {
        if (c.width * c.height > primary.width * primary.height) primary = c;
      }
      try {
        const dataUrl = primary.toDataURL('image/png', 1.0);
        return `background-image: url('${dataUrl}') !important;`;
      } catch {
        return '';
      }
    });

    // Inject print CSS
    await page.addStyleTag({ content: PDF_PRINT_CSS });

    // Inject canvas snapshot as slide background if WebGL was detected.
    // CRITICAL: inject into .slide::before (not ::after) because:
    //   - Magazine-style decks use .slide::before as the semi-transparent
    //     overlay on top of a fixed canvas background. When print blanks
    //     the canvas, .slide::before has nothing to sit on top of and the
    //     dark body background bleeds through.
    //   - Replacing .slide::before with the canvas PNG snapshot restores
    //     the intended background while preserving content readability.
    if (canvasBgStyle) {
      await page.addStyleTag({ content: `
        @media print {
          .slide::before {
            content: '';
            position: absolute;
            inset: 0;
            ${canvasBgStyle}
            background-size: cover;
            background-position: center;
            z-index: 0;
            pointer-events: none;
          }
          /* Ensure slide content sits above the background image */
          .slide > * {
            position: relative;
            z-index: 1;
          }
        }
      ` });
    }

    // Give CSS + layout one tick to settle
    await page.waitForTimeout(800);

    // Count slides
    slideCount = await page.evaluate(() => {
      const slides = document.querySelectorAll('.slide');
      return slides.length;
    });

    if (slideCount === 0) {
      throw new Error('No slide elements found in HTML. Expected <section class="slide"> elements.');
    }

    if (onProgress) onProgress(0, slideCount);

    // Export PDF — @media print ensures one page per slide
    await page.pdf({
      path: pdfPath,
      width: '20in',
      height: '11.25in',
      printBackground: true,
      preferCSSPageSize: true,
    });

    for (let i = 1; i <= slideCount; i++) {
      if (onProgress) onProgress(i, slideCount);
    }
  } finally {
    await browser.close();
  }

  // ---- Step 2: PDF → PPTX via LibreOffice with impress_pdf_import ----
  const soffice = await findLibreOffice();
  if (!soffice) {
    throw new Error(
      'LibreOffice not found. Install it: brew install libreoffice (macOS) or ' +
      'sudo apt install libreoffice (Linux).'
    );
  }

  const outputDir = path.dirname(outputPath);

  try {
    await execFileP(soffice, [
      '--headless',
      '--infilter=impress_pdf_import',
      '--convert-to', 'pptx',
      '--outdir', outputDir,
      pdfPath,
    ], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PDFIMPORT_RESOLUTION_DPI: '600',
      },
    });
  } catch (err: any) {
    throw new Error(
      `LibreOffice conversion failed: ${err?.message || err}. ` +
      `Command: ${soffice} --headless --infilter=impress_pdf_import --convert-to pptx --outdir ${outputDir} ${pdfPath}`
    );
  }

  // LibreOffice outputs <basename>.pptx in the output dir
  const pdfBasename = path.basename(pdfPath, '.pdf');
  const libreOfficeOutput = path.join(outputDir, `${pdfBasename}.pptx`);

  if (libreOfficeOutput !== outputPath) {
    const { rename } = await import('node:fs/promises');
    try {
      await rename(libreOfficeOutput, outputPath);
    } catch {
      try {
        statSync(outputPath);
      } catch {
        throw new Error(`LibreOffice created ${libreOfficeOutput} but could not rename to ${outputPath}`);
      }
    }
  }

  // Clean up intermediate PDF
  try {
    await unlink(pdfPath);
  } catch {
    // Ignore cleanup failure
  }

  // Verify output
  const stats = statSync(outputPath);

  return {
    path: outputPath,
    slideCount,
    sizeBytes: stats.size,
  };
}

// Check if LibreOffice is available
export async function isLibreOfficeAvailable(): Promise<boolean> {
  return (await findLibreOffice()) !== null;
}
