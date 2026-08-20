import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Header } from '../app/_components/header.tsx';

const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const headerSource = readFileSync(
  new URL('../app/_components/header.tsx', import.meta.url),
  'utf8',
);
const stylesSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

const counts = { skills: 100, systems: 10, templates: 20, craft: 5 };
const renderHeader = (locale: 'zh' | 'en') =>
  renderToStaticMarkup(createElement(Header, { counts, github: { starsLabel: '83K+' }, locale }));

test('header carries no community entry and no language switcher', () => {
  for (const locale of ['zh', 'en'] as const) {
    const html = renderHeader(locale);
    assert.doesNotMatch(html, /data-community-cta/);
    assert.doesNotMatch(html, /locale-switch/);
    assert.doesNotMatch(html, /<span class="dropdown-name">(Discord|Feishu)<\/span>/);
  }
  assert.doesNotMatch(headerSource, /benefits/);
  assert.doesNotMatch(stylesSource, /nav-community/);
});

test('community entry sits beside the hero download CTA: Feishu + QR for zh / zh-tw, Discord elsewhere', () => {
  assert.match(pageSource, /className='hero-community-cta'[\s\S]*?data-community-cta/);
  assert.match(pageSource, /usesFeishuCommunity = locale === 'zh' \|\| locale === 'zh-tw'/);
  assert.match(pageSource, /cta: '加入飞书群'/);
  assert.match(pageSource, /cta: '加入飛書群'/);
  assert.match(pageSource, /cta: 'Join Discord'/);
  assert.match(pageSource, /src='\/community\/feishu-group-qr\.png'/);
  assert.match(stylesSource, /\.hero-community:hover \.hero-community-qr-card/);
  assert.match(stylesSource, /\.hero-community-cta\s*\{[^}]*height:\s*64px/s);
});
