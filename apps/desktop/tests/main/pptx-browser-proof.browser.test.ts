import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as playwrightElectron, type ElectronApplication } from '@playwright/test';
import JSZip from 'jszip';
import { expect, test } from 'vitest';

import {
  cjkPromotedFontFamily,
  hasSingleVisualTextLine,
  runDomToPptx,
  visualLineBreakOffsets,
} from '../../src/main/deck-capture.js';

const repoRoot = resolve(process.cwd(), '../..');
const electronExecutable = createRequire(import.meta.url)('electron') as string;

test(
  'preserves CSS-wrapped CJK visual lines as PPTX breaks',
  async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'open-design-pptx-proof-'));
    const mainPath = join(tempDir, 'main.cjs');
    await writeFile(
      mainPath,
      `const { app, BrowserWindow } = require('electron');
let mainWindow;
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ show: false });
  return mainWindow.loadURL('about:blank');
});
`,
      'utf8',
    );

    let electronApp: ElectronApplication | undefined;
    try {
      electronApp = await playwrightElectron.launch({
        executablePath: electronExecutable,
        args: [mainPath],
      });
      const page = await electronApp.firstWindow();
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.setContent(`
        <style>
          html, body { margin: 0; width: 1600px; height: 900px; background: white; }
          .slide { position: relative; width: 1600px; height: 900px; overflow: hidden; background: white; }
          h1 { margin: 80px; width: 900px; font: 700 140px/1.02 Arial, sans-serif; }
        </style>
        <section class="slide">
          <h1>设计🚀没有换行符但依靠宽度自动换行并保留视觉布局</h1>
        </section>
      `);
      await page.addScriptTag({
        path: resolve(repoRoot, 'apps/desktop/vendor/dom-to-pptx/dom-to-pptx.bundle.js'),
      });

      const result = await page.evaluate(
        async ({ cjkSource, lineSource, offsetSource, exportSource }) => {
          const heading = document.querySelector('h1')!;
          const headingStyle = getComputedStyle(heading);
          const headingRange = document.createRange();
          headingRange.selectNodeContents(heading);
          const before = {
            childNodes: heading.childNodes.length,
            fontSize: headingStyle.fontSize,
            lineHeight: headingStyle.lineHeight,
            whiteSpace: headingStyle.whiteSpace,
            writingMode: headingStyle.writingMode,
            rects: Array.from(headingRange.getClientRects()).map((rect) => ({
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            })),
          };
          headingRange.detach();
          const execute = new Function(`
            const cjkPromotedFontFamily = ${cjkSource};
            const hasSingleVisualTextLine = ${lineSource};
            const visualLineBreakOffsets = ${offsetSource};
            return (${exportSource})(".slide");
          `);
          const output = await execute();
          return {
            before,
            output,
            visualBreaks: document.querySelectorAll('[data-od-pptx-visual-break]').length,
          };
        },
        {
          cjkSource: cjkPromotedFontFamily.toString(),
          lineSource: hasSingleVisualTextLine.toString(),
          offsetSource: visualLineBreakOffsets.toString(),
          exportSource: runDomToPptx.toString(),
        },
      );

      expect(result.output.error).toBeUndefined();
      expect(result.output.b64).toBeTruthy();
      expect(result.visualBreaks, JSON.stringify(result.before)).toBeGreaterThan(0);

      const zip = await JSZip.loadAsync(Buffer.from(result.output.b64, 'base64'));
      const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string');
      expect(slideXml).toBeTruthy();
      expect(slideXml?.match(/<a:p>/g)?.length ?? 0).toBeGreaterThan(1);
      expect(slideXml?.match(/<a:t>/g)?.length ?? 0).toBeGreaterThan(1);
    } finally {
      await electronApp?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  },
  30_000,
);
