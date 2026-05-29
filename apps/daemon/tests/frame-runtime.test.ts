import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

const frameFiles = [
  'iphone-15-pro.html',
  'android-pixel.html',
  'ipad-pro.html',
  'macbook.html',
  'browser-chrome.html',
] as const;

function frameScriptFor(frameFile: string): string {
  const html = readFileSync(
    path.join(repoRoot, 'assets', 'frames', frameFile),
    'utf8',
  );
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  if (!script?.[1]) {
    throw new Error(`Missing runtime script in ${frameFile}`);
  }
  return script[1];
}

function resolveFrameScreenSrc({
  frameFile,
  screen,
  referrer = 'http://preview.local/api/projects/project-1/raw/index.html',
}: {
  frameFile: string;
  screen: string;
  referrer?: string;
}): string {
  const frameUrl = new URL(`http://preview.local/frames/${frameFile}`);
  frameUrl.searchParams.set('screen', screen);

  let iframeSrc = 'about:blank';
  const iframe = {};
  Object.defineProperty(iframe, 'src', {
    get() {
      return iframeSrc;
    },
    set(value: string) {
      iframeSrc = new URL(value, frameUrl.href).toString();
    },
  });

  const urlText = { textContent: '' };
  const context = {
    URL,
    URLSearchParams,
    location: {
      href: frameUrl.href,
      search: frameUrl.search,
    },
    document: {
      referrer,
      getElementById(id: string) {
        if (id === 'screen') return iframe;
        if (id === 'url-text') return urlText;
        return null;
      },
    },
  };

  vm.runInNewContext(frameScriptFor(frameFile), context, {
    filename: `assets/frames/${frameFile}`,
  });

  return iframeSrc;
}

describe('shared frame runtime', () => {
  it.each(frameFiles)(
    'resolves project-relative screen paths against the embedding artifact for %s',
    (frameFile) => {
      expect(resolveFrameScreenSrc({
        frameFile,
        screen: 'screens/tablet-edition.html',
      })).toBe('http://preview.local/api/projects/project-1/raw/screens/tablet-edition.html');
    },
  );

  it.each(frameFiles)(
    'keeps root-relative screen paths rooted at the preview origin for %s',
    (frameFile) => {
      expect(resolveFrameScreenSrc({
        frameFile,
        screen: '/api/projects/project-1/raw/screens/tablet-edition.html',
      })).toBe('http://preview.local/api/projects/project-1/raw/screens/tablet-edition.html');
    },
  );

  it.each(frameFiles)(
    'keeps absolute screen URLs unchanged for %s',
    (frameFile) => {
      expect(resolveFrameScreenSrc({
        frameFile,
        screen: 'https://cdn.example.test/screens/tablet-edition.html',
      })).toBe('https://cdn.example.test/screens/tablet-edition.html');
    },
  );
});
