import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('header action cluster carries icon-only community + X links, no text pill, no language switcher', () => {
  const zh = render('zh');
  assert.match(zh, /class="nav-social-link"[^>]*href="https:\/\/od\.kokiai\.net\/community\/website"[^>]*aria-label="加入飞书群"/);
  assert.match(zh, /class="nav-community-qr-card"/);
  assert.match(zh, /src="\/community\/feishu-group-qr\.png"/);
  assert.match(zh, /aria-label="X"/);
  assert.doesNotMatch(zh, /locale-switch/);

  const zhTw = render('zh-tw');
  assert.match(zhTw, /aria-label="加入飛書群"/);

  const en = render('en');
  assert.match(en, /class="nav-social-link"[^>]*href="https:\/\/discord\.gg\/[^"]+"[^>]*aria-label="Join Discord"/);
  assert.doesNotMatch(en, /nav-community-qr-card/);

  assert.doesNotMatch(headerSource, /benefits/);
  assert.match(stylesSource, /\.nav-community-entry:hover \.nav-community-qr-card/);
});

test('Discord / Feishu no longer duplicate inside the Community dropdown', () => {
  const en = render('en');
  assert.doesNotMatch(en, /<span class="dropdown-name">Discord<\/span>/);
  assert.doesNotMatch(en, /<span class="dropdown-name">Feishu<\/span>/);
});

test('condensed header is a full-bleed flush-top bar, not a floating capsule', () => {
  assert.match(
    stylesSource,
    /\.site-chrome\.is-condensed \.nav\s*\{[^}]*margin:\s*0 auto;[^}]*width:\s*100%;[^}]*border-radius:\s*0;/s,
  );
});
