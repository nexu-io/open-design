import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { auditDeckLayout } from '@/playwright/deck-layout-audit';

describe('deck layout audit clipping', () => {
  let browser: Browser;
  let workDir: string;
  let artifactPath: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    workDir = await mkdtemp(path.join(tmpdir(), 'deck-layout-audit-'));
    artifactPath = path.join(workDir, 'clipping-fixture.html');
    await writeFile(artifactPath, clippingFixture, 'utf8');
  });

  afterAll(async () => {
    await browser?.close();
    await rm(workDir, { recursive: true, force: true });
  });

  test.each([
    {
      label: 'partial',
      candidateCount: 1,
      visibleRect: expect.objectContaining({ width: expect.any(Number) }),
    },
    {
      label: 'complete',
      candidateCount: 0,
      visibleRect: null,
    },
  ])(
    'reports $label clipping and only collision-checks visible text',
    async ({ label, candidateCount, visibleRect }) => {
      const page = await browser.newPage({
        deviceScaleFactor: 1,
        viewport: { width: 1920, height: 1080 },
      });
      try {
        await page.goto(pathToFileURL(artifactPath).href, {
          waitUntil: 'domcontentloaded',
        });
        const report = await auditDeckLayout(page, {
          artifactPath,
          outputDir: path.join(workDir, label),
          slideLabel: label,
        });
        const slide = report.slides.find((candidate) => candidate.label === label);
        const clippedIssues = slide?.issues.filter(
          (issue) => issue.type === 'clipped-text',
        );

        expect(slide?.candidateCount).toBe(candidateCount);
        expect(clippedIssues).toHaveLength(1);
        expect(clippedIssues?.[0]?.visibleRect).toEqual(visibleRect);
        expect(report.summary.clippedTextCount).toBe(2);
      } finally {
        await page.close();
      }
    },
  );
});

const clippingFixture = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; }
      .deck-stage { position: relative; width: 1920px; height: 1080px; }
      .slide { position: absolute; inset: 0; display: none; }
      .slide.active { display: block; }
      .clip {
        position: absolute;
        top: 100px;
        left: 100px;
        width: 160px;
        height: 48px;
        overflow: hidden;
      }
      .copy {
        margin: 0;
        width: max-content;
        font: 32px/40px Arial, sans-serif;
        white-space: nowrap;
      }
      .complete .copy { transform: translateX(200px); }
    </style>
  </head>
  <body>
    <main class="deck-stage">
      <section class="slide active" data-screen-label="partial">
        <div class="clip"><p class="copy">Partially clipped headline</p></div>
      </section>
      <section class="slide" data-screen-label="complete">
        <div class="clip complete"><p class="copy">Completely clipped headline</p></div>
      </section>
    </main>
  </body>
</html>`;
