import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const framesDir = path.join(repoRoot, 'assets', 'frames');

const FRAME_FILES = [
  'iphone-15-pro.html',
  'android-pixel.html',
  'ipad-pro.html',
  'macbook.html',
  'browser-chrome.html',
] as const;

function extractFrameScript(htmlPath: string): string {
  const html = readFileSync(htmlPath, 'utf8');
  const matches = html.matchAll(/<script>([\s\S]*?)<\/script>/g);
  for (const m of matches) {
    const body = m[1];
    if (body != null && (body.includes("qs.get('screen')") || body.includes('qs.get("screen")'))) {
      return body;
    }
  }
  throw new Error(`No screen= script block found in ${htmlPath}`);
}

interface MockElement {
  id: string;
  src: string;
  textContent: string;
}

function makeElement(id: string): MockElement {
  return { id, src: 'about:blank', textContent: '' };
}

interface RunOptions {
  search: string;
  href: string;
  referrer?: string;
}

interface RunResult {
  iframeSrc: string;
}

function runFrame(htmlPath: string, opts: RunOptions): RunResult {
  const script = extractFrameScript(htmlPath);
  const screenEl = makeElement('screen');
  const urlEl = makeElement('url-text');
  const elements: Record<string, MockElement> = {
    screen: screenEl,
    'url-text': urlEl,
  };
  const documentMock = {
    getElementById: (id: string): MockElement | null => elements[id] ?? null,
    referrer: opts.referrer ?? '',
  };
  const locationMock = { search: opts.search, href: opts.href };
  const sandbox: Record<string, unknown> = {
    document: documentMock,
    location: locationMock,
    window: { location: locationMock, document: documentMock },
    URLSearchParams,
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { iframeSrc: screenEl.src };
}

describe('assets/frames/<device>.html ?screen= resolution (#2234)', () => {
  describe.each(FRAME_FILES)('%s', (file) => {
    const htmlPath = path.join(framesDir, file);

    it('resolves a project-relative screen path against document.referrer', () => {
      const result = runFrame(htmlPath, {
        search: '?screen=screens/foo.html',
        href: `http://localhost/frames/${file}?screen=screens/foo.html`,
        referrer: 'http://localhost/api/projects/abc/raw/index.html',
      });
      expect(result.iframeSrc).toBe('http://localhost/api/projects/abc/raw/screens/foo.html');
    });

    it('keeps a root-relative screen path resolving to the same path', () => {
      const result = runFrame(htmlPath, {
        search: '?screen=/api/projects/abc/raw/screens/foo.html',
        href: `http://localhost/frames/${file}?screen=/api/projects/abc/raw/screens/foo.html`,
        referrer: 'http://localhost/api/projects/abc/raw/index.html',
      });
      const pathname = result.iframeSrc.startsWith('http')
        ? new URL(result.iframeSrc).pathname
        : result.iframeSrc;
      expect(pathname).toBe('/api/projects/abc/raw/screens/foo.html');
    });

    it('keeps an absolute screen URL unchanged', () => {
      const result = runFrame(htmlPath, {
        search: '?screen=https://example.com/inner.html',
        href: `http://localhost/frames/${file}?screen=https://example.com/inner.html`,
        referrer: 'http://localhost/api/projects/abc/raw/index.html',
      });
      expect(result.iframeSrc).toBe('https://example.com/inner.html');
    });

    it('falls back to the frame URL when document.referrer is empty', () => {
      const result = runFrame(htmlPath, {
        search: '?screen=screens/foo.html',
        href: `http://localhost/frames/${file}?screen=screens/foo.html`,
        referrer: '',
      });
      expect(result.iframeSrc).toBe('http://localhost/frames/screens/foo.html');
    });

    it('leaves iframe.src untouched when no screen param is provided', () => {
      const result = runFrame(htmlPath, {
        search: '',
        href: `http://localhost/frames/${file}`,
        referrer: 'http://localhost/api/projects/abc/raw/index.html',
      });
      expect(result.iframeSrc).toBe('about:blank');
    });
  });
});
