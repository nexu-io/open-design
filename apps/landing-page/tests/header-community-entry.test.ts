import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Header } from '../app/_components/header.tsx';

const headerSource = readFileSync(
  new URL('../app/_components/header.tsx', import.meta.url),
  'utf8',
);
const stylesSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

const counts = { skills: 100, systems: 10, templates: 20, craft: 5 };
const render = (locale: 'zh' | 'zh-tw' | 'en' | 'uk') =>
  renderToStaticMarkup(
    createElement(Header, { counts, github: { starsLabel: '83K+' }, locale }),
  );

test('community entry is a plain word: Feishu group (zh / zh-tw) with a hover QR, Discord elsewhere', () => {
  const zh = render('zh');
  assert.match(zh, /class="nav-community-cta"[^>]*data-community-platform="feishu"[^>]*>飞书群</);
  assert.match(zh, /class="nav-community-qr-card"/);
  assert.match(zh, /src="\/community\/feishu-group-qr\.png"/);

  const zhTw = render('zh-tw');
  assert.match(zhTw, />飛書群</);
  assert.match(zhTw, /class="nav-community-qr-card"/);

  const en = render('en');
  assert.match(en, /class="nav-community-cta"[^>]*data-community-platform="discord"[^>]*>Discord</);
  assert.doesNotMatch(en, /nav-community-qr-card/);

  // No persistent benefit list, no framed pill, no header language switcher.
  assert.doesNotMatch(headerSource, /benefits/);
  assert.doesNotMatch(zh, /locale-switch/);
  assert.doesNotMatch(stylesSource, /\.nav-community-cta\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(stylesSource, /\.nav-community-entry:hover \.nav-community-qr-card/);
});

test('Discord / Feishu no longer duplicate inside the Community dropdown', () => {
  const en = render('en');
  assert.doesNotMatch(en, /<span class="dropdown-name">Discord<\/span>/);
  assert.doesNotMatch(en, /<span class="dropdown-name">Feishu<\/span>/);
});

test('community entry moves into the drawer at compact widths', async (t) => {
  assert.match(stylesSource, /\.nav-community-mobile-entry\s*\{\s*display:\s*none;/);
  assert.match(
    stylesSource,
    /@media \(max-width: 1366px\)[\s\S]*?\.nav-side \.nav-community-entry\s*\{\s*display:\s*none;\s*\}[\s\S]*?\.nav-links \.nav-community-mobile-entry\s*\{[^}]*display:\s*grid;/,
  );

  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
  t.after(() => browser.close());

  const context = await browser.newContext({ viewport: { width: 1081, height: 900 } });
  const page = await context.newPage();
  await page.setContent(
    `<!doctype html><html lang="uk"><head><style>${stylesSource}</style></head><body><div class="site-chrome is-condensed">${render('uk')}</div></body></html>`,
  );

  const readLayout = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(`document.querySelector('header.nav').classList.add('is-open')`);
    await page.waitForTimeout(250);
    return page.evaluate(`(() => {
      const toggle = document.querySelector('.nav-toggle');
      const desktopEntry = document.querySelector('.nav-side .nav-community-entry');
      const drawerEntry = document.querySelector('.nav-community-mobile-entry');
      if (!toggle || !desktopEntry || !drawerEntry) throw new Error('header layout fixture is incomplete');
      const isVisible = (element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
      };
      return {
        desktopEntryVisible: isVisible(desktopEntry),
        drawerEntryText: drawerEntry.innerText,
        drawerEntryVisible: isVisible(drawerEntry),
        toggleVisible: isVisible(toggle),
      };
    })()`);
  };

  const compact = await readLayout(1081);
  assert.equal(compact.toggleVisible, true);
  assert.equal(compact.desktopEntryVisible, false);
  assert.equal(compact.drawerEntryVisible, true);
  assert.match(compact.drawerEntryText, /Discord/);

  const desktop = await readLayout(1367);
  assert.equal(desktop.toggleVisible, false);
  assert.equal(desktop.desktopEntryVisible, true);
  assert.equal(desktop.drawerEntryVisible, false);
});
