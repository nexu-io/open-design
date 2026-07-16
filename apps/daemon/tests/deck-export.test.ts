import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildScreenshotPdf,
  buildScreenshotPptx,
  buildDeckRenderInput,
  decodeSlideDataUrls,
  readSlideFiles,
} from '../src/deck-export.js';

// 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

// 1x1 JPEG.
const JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==';

describe('decodeSlideDataUrls', () => {
  it('decodes base64 PNG data URLs into tagged buffers', () => {
    const img = decodeSlideDataUrls([PNG_DATA_URL])[0]!;
    expect(Buffer.isBuffer(img.buffer)).toBe(true);
    expect(img.jpeg).toBe(false);
    // PNG magic number.
    expect(img.buffer.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('decodes base64 JPEG data URLs and tags them as jpeg', () => {
    const img = decodeSlideDataUrls([JPEG_DATA_URL])[0]!;
    expect(img.jpeg).toBe(true);
    // JPEG SOI marker.
    expect(img.buffer.subarray(0, 2).toString('hex')).toBe('ffd8');
  });

  it('rejects a non-image data URL', () => {
    expect(() => decodeSlideDataUrls(['data:text/plain;base64,aGk='])).toThrow();
  });

  it('rejects a value that is not a data URL', () => {
    expect(() => decodeSlideDataUrls(['not-a-data-url'])).toThrow();
  });
});

describe('readSlideFiles', () => {
  let dir = '';
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'od-slide-files-'));
    await writeFile(path.join(dir, 'slide-0.png'), Buffer.from(PNG_BASE64, 'base64'));
    await writeFile(
      path.join(dir, 'slide-1.jpeg'),
      Buffer.from(JPEG_DATA_URL.split(',')[1]!, 'base64'),
    );
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reads files into tagged buffers (jpeg flag from extension)', async () => {
    const [png, jpeg] = await readSlideFiles([
      path.join(dir, 'slide-0.png'),
      path.join(dir, 'slide-1.jpeg'),
    ]);
    expect(png!.jpeg).toBe(false);
    expect(png!.buffer.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(jpeg!.jpeg).toBe(true);
    expect(jpeg!.buffer.subarray(0, 2).toString('hex')).toBe('ffd8');
  });

  it('throws when a path is empty', async () => {
    await expect(readSlideFiles([''])).rejects.toThrow();
  });

  it('throws when a file does not exist', async () => {
    await expect(readSlideFiles([path.join(dir, 'missing.png')])).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('buildDeckRenderInput', () => {
  it('injects a deck-stage fallback runtime before desktop rendering', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-deck-render-input-'));
    const projectId = 'project-1';
    const projectDir = path.join(projectsRoot, projectId);
    mkdirSync(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'broken-deck.html'),
      `<!doctype html>
<html>
  <body>
    <deck-stage width="1920" height="1080">
      <section class="slide">One</section>
      <section class="slide">Two</section>
    </deck-stage>
    <script>
    /**
     * Original runtime was truncated while documenting a speaker notes tag.
     * Example marker: <script type="application/json" id="speaker-notes">
    []
    </script>
  </body>
</html>`,
    );

    try {
      const request = await buildDeckRenderInput({
        daemonUrl: 'http://127.0.0.1:60636',
        deck: true,
        fileName: 'broken-deck.html',
        projectId,
        projectsRoot,
      });

      expect(request.input.html).toContain('data-od-deck-stage-fallback');
      expect(request.input.html).toContain("window.customElements.define('deck-stage'");
      expect(request.input.html).toContain("type: 'od:slide-state'");
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true });
    }
  });

  it('uses supplied sourceHtml for version exports instead of reading the current file', async () => {
    const projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-deck-render-input-'));
    const projectId = 'project-1';
    const projectDir = path.join(projectsRoot, projectId);
    mkdirSync(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'deck.html'), '<html><body>Current deck</body></html>');

    try {
      const request = await buildDeckRenderInput({
        daemonUrl: 'http://127.0.0.1:60636',
        deck: true,
        fileName: 'deck.html',
        projectId,
        projectsRoot,
        sourceHtml: '<html><body>Historical deck version</body></html>',
      });

      expect(request.input.html).toContain('Historical deck version');
      expect(request.input.html).not.toContain('Current deck');
      expect(request.input.baseHref).toBe('http://127.0.0.1:60636/api/projects/project-1/raw/');
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true });
    }
  });
});

describe('buildScreenshotPptx', () => {
  it('produces a non-empty OOXML (zip) document with one slide per image', async () => {
    const pngs = decodeSlideDataUrls([PNG_DATA_URL, PNG_DATA_URL]);
    const out = await buildScreenshotPptx(pngs, { title: 'Test Deck' });
    expect(out.length).toBeGreaterThan(0);
    // .pptx is a ZIP container — starts with the local file header "PK".
    expect(out.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  // Reads the slide-size aspect (cx/cy) from a .pptx buffer's presentation.xml.
  async function pptxSlideAspect(buf: Buffer): Promise<number> {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('ppt/presentation.xml')!.async('string');
    const m = /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xml);
    if (!m) throw new Error('no sldSz in presentation.xml');
    return Number(m[1]) / Number(m[2]);
  }

  it('defaults to a 16:9 slide layout', async () => {
    const out = await buildScreenshotPptx(decodeSlideDataUrls([PNG_DATA_URL]));
    expect(await pptxSlideAspect(out)).toBeCloseTo(16 / 9, 2);
  });

  it('follows a non-16:9 deck aspect (4:3) instead of forcing 16:9', async () => {
    const out = await buildScreenshotPptx(decodeSlideDataUrls([PNG_DATA_URL]), { aspect: 4 / 3 });
    expect(await pptxSlideAspect(out)).toBeCloseTo(4 / 3, 2);
  });

  it('follows a portrait deck aspect (9:16)', async () => {
    const out = await buildScreenshotPptx(decodeSlideDataUrls([PNG_DATA_URL]), { aspect: 9 / 16 });
    expect(await pptxSlideAspect(out)).toBeCloseTo(9 / 16, 2);
  });

  it('throws when there are no slides', async () => {
    await expect(buildScreenshotPptx([])).rejects.toThrow(/no slides/i);
  });
});

describe('buildScreenshotPdf', () => {
  it('produces a %PDF document', async () => {
    const pngs = decodeSlideDataUrls([PNG_DATA_URL]);
    const out = await buildScreenshotPdf(pngs);
    expect(out.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('normalizes page size to points (not raw capture pixels, so DPR cannot bloat it)', async () => {
    const pngs = decodeSlideDataUrls([PNG_DATA_URL]); // a 1x1 px image
    const out = await buildScreenshotPdf(pngs);
    const doc = await PDFDocument.load(out);
    const { width, height } = doc.getPage(0).getSize();
    // aspect 1 => normalized 960x960 pt (PowerPoint-ish), NOT the 1x1 pixel size.
    expect(Math.round(width)).toBe(960);
    expect(Math.round(height)).toBe(960);
  });

  it('throws when there are no slides', async () => {
    await expect(buildScreenshotPdf([])).rejects.toThrow(/no slides/i);
  });
});
