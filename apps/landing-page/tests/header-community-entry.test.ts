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

const ukrainianHeader = renderToStaticMarkup(
  createElement(Header, {
    counts: { skills: 100, systems: 10, templates: 20, craft: 5 },
    github: { starsLabel: '83K+' },
    locale: 'uk',
    localeSwitcher: {
      label: 'Змінити мову',
      prefix: '',
      shortLabel: 'UK',
      options: [
        {
          code: 'uk',
          href: '/uk/',
          htmlLang: 'uk',
          label: 'Українська',
        },
      ],
    },
  }),
);

test('community entry moves into the drawer without overflowing long localized labels', () => {
  assert.match(
    headerSource,
    /<li className='nav-community-mobile-entry'>[\s\S]*?className='nav-community-mobile-cta'[\s\S]*?className='nav-community-mobile-benefits'/,
  );
  assert.match(headerSource, /cta: 'Приєднатися до Discord'/);
  assert.match(stylesSource, /\.nav-community-mobile-entry\s*\{\s*display:\s*none;/);
  assert.match(
    stylesSource,
    /@media \(max-width: 1366px\)[\s\S]*?\.nav-side \.nav-community-entry\s*\{\s*display:\s*none;\s*\}[\s\S]*?\.nav-links \.nav-community-mobile-entry\s*\{[^}]*display:\s*grid;/,
  );
  assert.match(
    stylesSource,
    /\.nav-links \.nav-community-mobile-cta\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s,
  );
});

test('longest-label community entry stays inside the rendered header at its boundary widths', async (t) => {
  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
  t.after(() => browser.close());

  const context = await browser.newContext({ viewport: { width: 1081, height: 900 } });
  const page = await context.newPage();
  await page.setContent(
    `<!doctype html><html lang="uk"><head><style>${stylesSource}</style></head><body><div class="site-chrome is-condensed">${ukrainianHeader}</div></body></html>`,
  );

  const readLayout = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(`document.querySelector('header.nav').classList.add('is-open')`);
    await page.waitForTimeout(250);
    return page.evaluate(`(() => {
      const nav = document.querySelector('header.nav');
      const inner = document.querySelector('.nav-inner');
      const toggle = document.querySelector('.nav-toggle');
      const desktopEntry = document.querySelector('.nav-side .nav-community-entry');
      const drawerEntry = document.querySelector('.nav-community-mobile-entry');
      if (!nav || !inner || !toggle || !desktopEntry || !drawerEntry) {
        throw new Error('header layout fixture is incomplete');
      }

      const isVisible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
      };
      const innerRect = inner.getBoundingClientRect();
      const rowChildren = Array.from(inner.children).filter((element) => {
        return isVisible(element) && getComputedStyle(element).position !== 'absolute';
      });
      const rowRects = rowChildren
        .map((element) => element.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
      const rowFits =
        rowRects.every((rect) => rect.left >= innerRect.left - 1 && rect.right <= innerRect.right + 1) &&
        rowRects.every((rect, index) => index === 0 || rowRects[index - 1].right <= rect.left + 1);

      return {
        desktopEntryVisible: isVisible(desktopEntry),
        drawerEntryText: drawerEntry.innerText,
        drawerEntryVisible: isVisible(drawerEntry),
        rowFits,
        toggleVisible: isVisible(toggle),
      };
    })()`);
  };

  const compact = await readLayout(1081);
  assert.equal(compact.toggleVisible, true);
  assert.equal(compact.desktopEntryVisible, false);
  assert.equal(compact.drawerEntryVisible, true);
  assert.match(compact.drawerEntryText, /Приєднатися до Discord/);
  assert.equal(compact.rowFits, true);

  const desktop = await readLayout(1367);
  assert.equal(desktop.toggleVisible, false);
  assert.equal(desktop.desktopEntryVisible, true);
  assert.equal(desktop.drawerEntryVisible, false);
  assert.equal(desktop.rowFits, true);
});
