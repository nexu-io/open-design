import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Header } from '../app/_components/header.tsx';

const headerSource = readFileSync(
  new URL('../app/_components/header.tsx', import.meta.url),
  'utf8',
);
const stylesSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

const counts = { skills: 100, systems: 10, templates: 20, craft: 5 };
const render = (locale: 'zh' | 'zh-tw' | 'en') =>
  renderToStaticMarkup(createElement(Header, { counts, github: { starsLabel: '83K+' }, locale }));

test('header action cluster carries icon-only community + X links, no text pill', () => {
  const zh = render('zh');
  assert.match(zh, /class="nav-social-link"[^>]*href="https:\/\/od\.kokiai\.net\/community\/website"[^>]*aria-label="加入飞书群"/);
  assert.match(zh, /class="nav-community-qr-card"/);
  assert.match(zh, /src="\/launch-week\/feishu-mark\.png"/);
  assert.match(zh, /群内每周发放 Credits/);
  assert.match(zh, /src="\/community\/feishu-group-qr\.png"/);
  assert.match(zh, /aria-label="X"/);

  const zhTw = render('zh-tw');
  assert.match(zhTw, /aria-label="加入飛書群"/);

  const en = render('en');
  assert.match(en, /class="nav-social-link"[^>]*href="https:\/\/discord\.gg\/[^"]+"[^>]*aria-label="Join Discord"/);
  // Non-Chinese locales get the perk card without the Feishu QR image.
  assert.match(en, /nav-community-qr-card/);
  assert.doesNotMatch(en, /nav-community-qr-img/);
  assert.match(en, /Weekly credit drops inside/);

  assert.doesNotMatch(headerSource, /benefits/);
  assert.match(stylesSource, /\.nav-community-entry:hover \.nav-community-qr-card/);
});

test('Discord / Feishu no longer duplicate inside the Community dropdown', () => {
  const en = render('en');
  assert.doesNotMatch(en, /<span class="dropdown-name">Discord<\/span>/);
  assert.doesNotMatch(en, /<span class="dropdown-name">Feishu<\/span>/);
});

test('condensed header keeps the floating capsule treatment', () => {
  assert.match(
    stylesSource,
    /\.site-chrome\.is-condensed \.nav\s*\{[^}]*margin:\s*14px auto 0;[^}]*border-radius:\s*999px;/s,
  );
});

test('header row stays intact from phones to desktop', async (t) => {
  // ≤640px: the secondary icon cluster leaves the bar so the shrinkable brand
  // is never squeezed to 0px; Download stays in the bar at every width.
  assert.match(
    stylesSource,
    /@media \(max-width: 640px\)[\s\S]*?\.nav-side \.nav-social\s*\{\s*display:\s*none;/,
  );

  // Inline a same-ratio stand-in for the brand lockup so the brand measures a
  // real width in the fixture (a broken <img> would measure 0 regardless of CSS).
  const logo =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="225" height="83"><rect width="225" height="83" fill="#000"/></svg>');
  const jaHeader = renderToStaticMarkup(
    createElement(Header, { counts, github: { starsLabel: '83K+' }, locale: 'ja' }),
  ).replace('/logo-lockup.svg', logo);

  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
  t.after(() => browser.close());
  const page = await (await browser.newContext({ viewport: { width: 1367, height: 900 } })).newPage();
  await page.setContent(
    `<!doctype html><html lang="ja"><head><style>${stylesSource}</style></head><body><div class="site-chrome is-condensed">${jaHeader}</div></body></html>`,
  );

  const readLayout = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    return page.evaluate(`(() => {
      const inner = document.querySelector('.nav-inner');
      const toggle = document.querySelector('.nav-toggle');
      const brand = document.querySelector('.nav-inner > .brand');
      const social = document.querySelector('.nav-side .nav-social');
      const download = document.querySelector('.nav-side .nav-cta.ghost');
      if (!inner || !toggle || !brand || !social || !download) throw new Error('header layout fixture is incomplete');
      const isVisible = (element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
      };
      const innerRect = inner.getBoundingClientRect();
      const rowChildren = Array.from(inner.querySelectorAll(':scope > *, :scope > .nav-side > *')).filter(
        (element) => isVisible(element) && getComputedStyle(element).position !== 'absolute',
      );
      const rowFits = rowChildren.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= innerRect.left - 1 && rect.right <= innerRect.right + 1;
      });
      return {
        brandWidth: brand.getBoundingClientRect().width,
        socialVisible: isVisible(social),
        downloadVisible: isVisible(download),
        rowFits,
        toggleVisible: isVisible(toggle),
      };
    })()`);
  };

  const desktop = await readLayout(1367);
  assert.equal(desktop.toggleVisible, false);
  assert.equal(desktop.socialVisible, true);
  assert.equal(desktop.downloadVisible, true);
  assert.equal(desktop.rowFits, true);

  const compact = await readLayout(1081);
  assert.equal(compact.toggleVisible, true);
  assert.equal(compact.socialVisible, true);
  assert.equal(compact.downloadVisible, true);
  assert.equal(compact.rowFits, true);

  for (const width of [320, 375, 420]) {
    const phone = await readLayout(width);
    assert.equal(phone.toggleVisible, true, `${width}: hamburger`);
    assert.equal(phone.socialVisible, false, `${width}: icon cluster hidden`);
    assert.equal(phone.downloadVisible, true, `${width}: Download stays in the bar`);
    assert.ok(phone.brandWidth >= 60, `${width}: brand collapsed to ${phone.brandWidth}px`);
    assert.equal(phone.rowFits, true, `${width}: row overflows`);
  }
});
