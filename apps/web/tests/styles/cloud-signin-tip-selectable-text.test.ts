import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for 飞书 rec "失败之后，然后再点击左下角的这个登录注册的卡片，
// 就没有办法唤起浏览器了" — screen recording showed the card's own label text
// getting highlighted (text-selection) on click, and the component's React
// state never advanced past idle: no spinner, no browser tab, nothing.
//
// This is standard browser behavior, not a React/vela bug: when a
// mousedown→mouseup gesture produces a non-collapsed text selection, the
// browser suppresses the `click` event entirely, so `onClick`'s `begin()`
// call never runs. `.entry-local-mode-tip` wraps its label in plain <strong>/
// <p> text nodes with no `user-select: none`, so any click with a hair of
// drag (a real click made while screen-recording, or just an imprecise
// click) can select text instead of registering as a click.

const css = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

function cssDeclarations(source: string, selector: string): string {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

describe('CloudSignInTip card selectability', () => {
  it('disables text selection so a click cannot be swallowed as a text-select drag', () => {
    const block = cssDeclarations(css, '.entry-local-mode-tip');
    expect(block).toMatch(/user-select:\s*none/);
  });
});
