// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pluginRailCss = readFileSync(
  resolve(process.cwd(), 'src/styles/viewer/plugin-rail.css'),
  'utf8',
);
const primitivesCss = readFileSync(
  resolve(process.cwd(), 'src/styles/primitives.css'),
  'utf8',
);

describe('plugin share menu layout', () => {
  it('left-aligns button and anchor actions on the same content column', () => {
    const style = document.createElement('style');
    style.textContent = `${primitivesCss}\n${pluginRailCss}`;
    document.head.appendChild(style);

    const buttonItem = document.createElement('button');
    buttonItem.className = 'plugin-share-item';
    const anchorItem = document.createElement('a');
    anchorItem.className = 'plugin-share-item';
    document.body.append(buttonItem, anchorItem);

    expect(getComputedStyle(buttonItem).justifyContent).toBe('flex-start');
    expect(getComputedStyle(anchorItem).justifyContent).toBe('flex-start');

    buttonItem.remove();
    anchorItem.remove();
    style.remove();
  });
});
