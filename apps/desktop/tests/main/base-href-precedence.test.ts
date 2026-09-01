import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

const rendererState = vi.hoisted(() => ({ loadedUrls: [] as string[] }));

vi.mock('electron', () => {
  const image = {
    getSize: () => ({ height: 1, width: 1 }),
    toBitmap: () => Buffer.alloc(4),
    toJPEG: () => Buffer.from('jpeg'),
    toPNG: () => Buffer.from('png'),
  };

  class BrowserWindow {
    readonly webContents = {
      capturePage: async () => image,
      debugger: {
        attach: () => {
          throw new Error('debugger unavailable in renderer-base test');
        },
        detach: () => undefined,
        sendCommand: async () => undefined,
      },
      executeJavaScript: async (source: string): Promise<unknown> => {
        if (source.includes("document.querySelectorAll('.slide")) return 0;
        if (source.includes('document.documentElement.scrollHeight')) return 1;
        if (source === 'window.devicePixelRatio || 1') return 1;
        return true;
      },
      on: () => undefined,
      // Real Electron webContents is an EventEmitter; the renderer's document
      // load waits on `once('dom-ready')`. The stub's loadURL resolves
      // immediately, so a no-op is faithful here — the load simply never has a
      // dom-ready to race against.
      once: () => undefined,
      printToPDF: async () => Buffer.from('pdf'),
      setWindowOpenHandler: () => undefined,
    };

    async loadURL(url: string): Promise<void> {
      rendererState.loadedUrls.push(url);
    }

    destroy(): void {}
    getContentSize(): [number, number] { return [1440, 900]; }
    isDestroyed(): boolean { return false; }
    setContentSize(): void {}
    setOpacity(): void {}
    showInactive(): void {}
  }

  return {
    BrowserWindow,
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    nativeImage: { createFromBitmap: () => image },
  };
});

import { exportArtifact } from '../../src/main/artifact-export.js';
import { renderDeckSlides } from '../../src/main/deck-capture.js';

const execFileP = promisify(execFile);
const desktopRoot = fileURLToPath(new URL('../..', import.meta.url));
const legacyBaseHref = 'https://external.invalid/legacy/';
const scopedBaseHref = 'http://127.0.0.1:43123/preview/export-scope/';
const sourceHtml = `<!doctype html>
<html>
  <head>
    <base href="${legacyBaseHref}">
    <link rel="stylesheet" href="styles/x.css">
  </head>
  <body>
    <img src="assets/hero.png" alt="">
  </body>
</html>`;

type BaseResolution = {
  readonly baseURI: string;
  readonly imageSrc: string;
  readonly stylesheetHref: string;
};

afterEach(() => {
  rendererState.loadedUrls.length = 0;
});

describe('scoped renderer base precedence', () => {
  it('uses the scoped base for deck-capture CSS and images when HTML already has an external base', async () => {
    // Given: a deck-capture request whose source document already declares another base.
    const input = {
      baseHref: scopedBaseHref,
      deck: true,
      html: sourceHtml,
    };

    // When: deck-capture builds and loads its renderer document.
    const result = await renderDeckSlides(input);

    // Then: Electron Chromium proves the scoped base controls every relative renderer asset.
    const resolution = await probeLoadedDocument(singleLoadedUrl());
    expect(result).toMatchObject({ errorCode: 'NO_SLIDES', ok: false });
    expect(resolution).toEqual(expectedResolution());
  }, 30_000);

  it('uses the scoped base for artifact-export CSS and images when HTML already has an external base', async () => {
    // Given: an artifact-export request whose source document already declares another base.
    const input = {
      baseHref: scopedBaseHref,
      deck: false,
      format: 'image',
      html: sourceHtml,
      imageFormat: 'png',
      title: 'Existing base precedence',
    } as const;

    // When: artifact-export builds and loads its renderer document.
    const result = await exportArtifact(input);

    try {
      // Then: Electron Chromium proves the scoped base controls every relative renderer asset.
      const resolution = await probeLoadedDocument(singleLoadedUrl());
      expect(result.ok).toBe(true);
      expect(resolution).toEqual(expectedResolution());
    } finally {
      if (result.path) await rm(dirname(result.path), { force: true, recursive: true });
    }
  }, 30_000);
});

function singleLoadedUrl(): string {
  expect(rendererState.loadedUrls).toHaveLength(1);
  const url = rendererState.loadedUrls[0];
  if (!url) throw new Error('renderer did not load a document');
  return url;
}

function expectedResolution(): BaseResolution {
  return {
    baseURI: scopedBaseHref,
    imageSrc: new URL('assets/hero.png', scopedBaseHref).href,
    stylesheetHref: new URL('styles/x.css', scopedBaseHref).href,
  };
}

async function probeLoadedDocument(url: string): Promise<BaseResolution> {
  const probeDir = await mkdtemp(join(tmpdir(), 'od-electron-base-probe-'));
  const urlFile = join(probeDir, 'url.txt');
  await writeFile(join(probeDir, 'package.json'), '{"main":"main.cjs"}\n');
  await writeFile(urlFile, url);
  await writeFile(join(probeDir, 'main.cjs'), `
const { app, BrowserWindow } = require('electron');
const { readFile } = require('node:fs/promises');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadURL(await readFile(process.env.OD_BASE_PROBE_URL_FILE, 'utf8'));
  const result = await window.webContents.executeJavaScript(\`({
    baseURI: document.baseURI,
    imageSrc: document.querySelector('img').src,
    stylesheetHref: document.querySelector('link[rel="stylesheet"]').href,
  })\`, true);
  process.stdout.write('OD_BASE_PROBE:' + JSON.stringify(result) + '\\n');
  window.destroy();
  app.quit();
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\\n');
  app.exit(1);
});
`);

  try {
    const electronRelativePath = (await readFile(
      join(desktopRoot, 'node_modules', 'electron', 'path.txt'),
      'utf8',
    )).trim();
    const electronPath = join(desktopRoot, 'node_modules', 'electron', 'dist', electronRelativePath);
    const electronArgs = [probeDir, '--no-sandbox', '--disable-gpu'];
    const command = process.platform === 'linux' ? 'xvfb-run' : electronPath;
    const args = process.platform === 'linux' ? ['-a', electronPath, ...electronArgs] : electronArgs;
    const env: NodeJS.ProcessEnv = { ...process.env, OD_BASE_PROBE_URL_FILE: urlFile };
    delete env.ELECTRON_RUN_AS_NODE;
    const { stdout } = await execFileP(command, args, { env, timeout: 20_000 });
    const marker = stdout.split(/\r?\n/).find((line) => line.startsWith('OD_BASE_PROBE:'));
    if (!marker) throw new Error(`Electron renderer probe returned no result: ${stdout}`);
    return parseBaseResolution(JSON.parse(marker.slice('OD_BASE_PROBE:'.length)));
  } finally {
    await rm(probeDir, { force: true, recursive: true });
  }
}

function parseBaseResolution(value: unknown): BaseResolution {
  if (
    typeof value !== 'object'
    || value === null
    || !('baseURI' in value)
    || typeof value.baseURI !== 'string'
    || !('imageSrc' in value)
    || typeof value.imageSrc !== 'string'
    || !('stylesheetHref' in value)
    || typeof value.stylesheetHref !== 'string'
  ) {
    throw new Error('Electron renderer probe returned an invalid result');
  }
  return {
    baseURI: value.baseURI,
    imageSrc: value.imageSrc,
    stylesheetHref: value.stylesheetHref,
  };
}
