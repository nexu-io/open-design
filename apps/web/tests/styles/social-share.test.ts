// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const socialShareCss = readFileSync(
  resolve(process.cwd(), 'src/styles/social-share.css'),
  'utf8',
);
const primitivesCss = readFileSync(
  resolve(process.cwd(), 'src/styles/primitives.css'),
  'utf8',
);

describe('social share button alignment', () => {
  it('normalises <button> and <a> share targets so they render identically', () => {
    const style = document.createElement('style');
    style.textContent = `${primitivesCss}\n${socialShareCss}`;
    document.head.appendChild(style);

    const button = document.createElement('button');
    button.className = 'social-share-button social-share-button--instagram';
    const anchor = document.createElement('a');
    anchor.className = 'social-share-button social-share-button--x';
    document.body.append(button, anchor);

    const buttonStyle = getComputedStyle(button);
    const anchorStyle = getComputedStyle(anchor);

    // The global button primitive sets height: 36px; the share button
    // must override it so button-based targets (Instagram, Xiaohongshu)
    // don't end up taller than anchor-based ones.
    expect(buttonStyle.height).not.toBe('36px');

    // Content alignment must match: the button primitive centers content,
    // but share buttons left-align like anchors.
    expect(buttonStyle.justifyContent).toBe(anchorStyle.justifyContent);
    expect(buttonStyle.justifyContent).toBe('flex-start');

    // Font-weight and line-height must match so button text doesn't look
    // heavier or tighter than anchor text.
    expect(buttonStyle.fontWeight).toBe(anchorStyle.fontWeight);
    expect(buttonStyle.lineHeight).toBe(anchorStyle.lineHeight);

    // The active press transform from the button primitive must be
    // neutralised so buttons don't shift on click while anchors stay put.
    expect(buttonStyle.transform).toBe('none');

    button.remove();
    anchor.remove();
    style.remove();
  });

  it('locks the icon container to a fixed size to prevent glyph drift', () => {
    const style = document.createElement('style');
    style.textContent = `${primitivesCss}\n${socialShareCss}`;
    document.head.appendChild(style);

    const icon = document.createElement('span');
    icon.className = 'social-share-button__icon';
    document.body.appendChild(icon);

    const iconStyle = getComputedStyle(icon);

    // Fixed 18×18 container so different glyph widths (e.g. instagram-line
    // vs book-open-line for xiaohongshu) don't cause horizontal drift.
    expect(iconStyle.width).toBe('18px');
    expect(iconStyle.height).toBe('18px');

    icon.remove();
    style.remove();
  });
});
