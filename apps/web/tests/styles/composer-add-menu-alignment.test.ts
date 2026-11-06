import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// OPEND-3085: the Add menu trigger and the composer tags follow the Demo
// (`877980fb17`) on both the home hero and the project composer.

function readCss(relative: string): string {
  return readFileSync(new URL(`../../src/styles/${relative}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css)) !== null) {
    // Split on top-level commas only, so `:is(a, b) c` stays one selector.
    const selectors = (match[1] ?? '').split(/,(?![^(]*\))/).map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

const plusMenu = readCss('home/plus-menu.css');
const chat = readCss('chat.css');
const pluginRail = readCss('viewer/plugin-rail.css');

describe('Add menu trigger', () => {
  it('is the same 36px disc on the home foot row and in the project composer row', () => {
    const disc = cssDeclarations(plusMenu, ':is(.home-hero__foot-left, .composer-row) .plus-menu__trigger');
    expect(disc).toMatch(/(?:^|[;\n])\s*width:\s*36px\s*;/);
    expect(disc).toMatch(/(?:^|[;\n])\s*height:\s*36px\s*;/);
    expect(disc).toMatch(/(?:^|[;\n])\s*min-width:\s*36px\s*;/);
    expect(disc).toMatch(/(?:^|[;\n])\s*min-height:\s*36px\s*;/);
    expect(disc).toMatch(/border-radius:\s*var\(--radius-circular/);
    expect(disc).toMatch(/background:\s*var\(--bg-panel\)/);
    // The old home-only selector must not linger beside the shared one.
    expect(plusMenu).not.toMatch(/(?:^|[,\n])\s*\.home-hero__foot-left \.plus-menu__trigger\s*\{/);
  });

  it('carries no design-toolbox flyout styling any more', () => {
    expect(plusMenu).not.toContain('composer-design-toolbox-menu');
  });

  it('stacks the plugin preview under the list in the contained flyout', () => {
    const flyout = cssDeclarations(plusMenu, '.plus-menu__popup--flyout-contained .plus-menu__flyout--plugins');
    expect(flyout).toMatch(/(?:^|[;\n])\s*width:\s*auto\s*;/);
    expect(flyout).toMatch(/(?:^|[;\n])\s*overflow-y:\s*auto\s*;/);
    const pane = cssDeclarations(plusMenu, '.plus-menu__popup--flyout-contained .plus-menu__plugin-pane');
    expect(pane).toMatch(/flex-direction:\s*column/);
    expect(pane).toMatch(/(?:^|[;\n])\s*flex:\s*0 0 auto\s*;/);
    const main = cssDeclarations(plusMenu, '.plus-menu__popup--flyout-contained .plus-menu__plugin-main');
    expect(main).toMatch(/(?:^|[;\n])\s*flex:\s*0 0 auto\s*;/);
    expect(main).toMatch(/(?:^|[;\n])\s*min-width:\s*0\s*;/);
    const preview = cssDeclarations(plusMenu, '.plus-menu__popup--flyout-contained .plus-menu__preview');
    expect(preview).toMatch(/(?:^|[;\n])\s*flex:\s*0 0 auto\s*;/);
  });
});

describe('composer tags', () => {
  it('lets the inline @ mention grow to its text with a 4px inset', () => {
    const mention = cssDeclarations(chat, '.composer-inline-mention');
    expect(mention).toMatch(/(?:^|[;\n])\s*height:\s*auto\s*;/);
    expect(mention).toMatch(/(?:^|[;\n])\s*padding:\s*4px\s*;/);
    expect(mention).not.toMatch(/height:\s*19px/);
  });

  it('gives every staged chip variant above the composer the same 4px inset', () => {
    const chip = cssDeclarations(chat, '.composer-shell .staged-chip');
    expect(chip).toMatch(/(?:^|[;\n])\s*height:\s*auto\s*;/);
    expect(chip).toMatch(/(?:^|[;\n])\s*padding:\s*4px\s*;/);
  });

  it('insets the applied-plugin context chip like the other tags', () => {
    const chip = cssDeclarations(pluginRail, '.composer-shell .context-chip-strip__chip');
    expect(chip).toMatch(/(?:^|[;\n])\s*padding:\s*4px\s*;/);
    const body = cssDeclarations(pluginRail, '.composer-shell .context-chip-strip__body');
    expect(body).toMatch(/(?:^|[;\n])\s*padding:\s*0\s*;/);
  });
});
