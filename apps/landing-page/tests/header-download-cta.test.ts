import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const headerPath = new URL('../app/_components/header.tsx', import.meta.url);
const enhancerPath = new URL('../app/_components/header-enhancer.astro', import.meta.url);
const homePagePath = new URL('../app/pages/index.astro', import.meta.url);
const downloadPagePath = new URL('../app/pages/download/index.astro', import.meta.url);
const infoCopyPath = new URL('../app/info-page-i18n.ts', import.meta.url);

function runMobileNoticeGate(
  page: string,
  options: { userAgent: string; platform: string; maxTouchPoints: number; narrow: boolean },
) {
  const start = page.indexOf("      const ua = (navigator.userAgent || '').toLowerCase();");
  const endMarker = "      narrowViewport.addEventListener('change', syncMobileNotice);";
  const end = page.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'mobile notice gate not found');
  const script = page.slice(start, end + endMarker.length);

  const notice = { hidden: true };
  let matches = options.narrow;
  const listeners: Array<() => void> = [];
  const mediaQuery = {
    get matches() { return matches; },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'change') listeners.push(listener);
    },
  };
  const window = { matchMedia: () => mediaQuery };
  const navigator = {
    userAgent: options.userAgent,
    platform: options.platform,
    maxTouchPoints: options.maxTouchPoints,
  };
  const document = { querySelector: () => notice };

  // eslint-disable-next-line no-new-func
  new Function('window', 'navigator', 'document', script)(window, navigator, document);

  return {
    notice,
    setNarrow(value: boolean) {
      matches = value;
      for (const listener of listeners) listener();
    },
  };
}

describe('landing header account and download entry', () => {
  it('keeps the nav download-page CTA and removes the signed-out login entry', async () => {
    const header = await readFile(headerPath, 'utf8');

    assert.match(header, /href=\{href\('\/download\/'\)\}/);
    assert.match(header, /data-download-placement='nav'/);
    assert.doesNotMatch(header, /data-amr-signin|className='nav-signin'/);
    assert.match(header, /data-amr-menu hidden/);
    assert.match(header, /data-amr-console-link/);
  });

  it('silently reveals the avatar for an existing session without wiring login', async () => {
    const enhancer = await readFile(enhancerPath, 'utf8');
    const homePage = await readFile(homePagePath, 'utf8');

    for (const source of [enhancer, homePage]) {
      assert.match(source, /fetchSession\(\)\.then\(\(user\) =>/);
      assert.match(source, /if \(user\) showSignedIn\(user\)/);
      assert.doesNotMatch(source, /sign_in_click|data-amr-signin|od-cloud-login|window\.open\(/);
    }
  });
});

describe('mobile download-page guidance', () => {
  it('shows a desktop-download notice only after mobile-device detection', async () => {
    const page = await readFile(downloadPagePath, 'utf8');
    const copy = await readFile(infoCopyPath, 'utf8');

    assert.match(page, /data-dl-mobile-notice hidden/);
    assert.match(page, /android\|iphone\|ipad\|ipod\|mobile/);
    assert.match(page, /navigator\.maxTouchPoints > 1 && \/mac\/\.test\(devicePlatform\)/);
    assert.match(page, /const narrowViewport = window\.matchMedia\('\(max-width: 767px\)'\)/);
    assert.match(page, /mobileNotice\.hidden = !\(isMobileDevice \|\| narrowViewport\.matches\)/);
    assert.match(page, /narrowViewport\.addEventListener\('change', syncMobileNotice\)/);
    assert.match(copy, /Open Design 是桌面客户端，请在电脑上下载。/);
  });

  it('treats iPadOS desktop-mode Safari as a mobile device', async () => {
    const page = await readFile(downloadPagePath, 'utf8');
    const gate = runMobileNoticeGate(page, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      narrow: false,
    });

    assert.equal(gate.notice.hidden, false);
  });

  it('keeps the notice synchronized when the viewport crosses the mobile breakpoint', async () => {
    const page = await readFile(downloadPagePath, 'utf8');
    const gate = runMobileNoticeGate(page, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      narrow: false,
    });

    assert.equal(gate.notice.hidden, true);
    gate.setNarrow(true);
    assert.equal(gate.notice.hidden, false);
    gate.setNarrow(false);
    assert.equal(gate.notice.hidden, true);
  });
});
