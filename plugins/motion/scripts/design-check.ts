import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Script } from 'node:vm';
import { designTokens } from './design-tokens.ts';

const root = new URL('../', import.meta.url);
const luminance = (hex: string) => {
  const values = hex.slice(1).match(/../g)!.map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
export async function checkDesign() {
  const tokens = await designTokens(true);
  assert.deepEqual(Object.keys(tokens.themes.light).sort(), Object.keys(tokens.themes.dark).sort(), 'Both themes need the same semantic colors.');
  const names = new Set([...Object.keys(tokens.shared), ...Object.keys(tokens.themes.light)].map(name => '--motion-' + name));
  for (const file of ['web/connect.css', 'web/template-gallery.css', 'studio/src/motion/theme.css', 'studio/src/motion/workspace.css', 'web/design-system/base.css', 'web/design-system/controls.css', 'web/design-system/catalog.css']) {
    const css = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, `${file}: UI colors belong in tokens.json.`);
    for (const match of css.matchAll(/var\((--motion-[\w-]+)/g)) assert.ok(names.has(match[1]), `${file}: undefined ${match[1]}`);
  }
  for (const [theme, values] of Object.entries(tokens.themes) as [string, Record<string, string>][]) {
    for (const [ink, surface] of [['text', 'panel'], ['text', 'inset'], ['muted', 'panel'], ['dim', 'panel'], ['dim', 'bg'], ['accent', 'accent-soft'], ['on-action', 'action'], ['danger', 'danger-soft'], ['warning', 'warning-soft'], ['strong', 'highlight']]) {
      const a = luminance(values[ink]), b = luminance(values[surface]);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${theme}: ${ink} on ${surface} needs 4.5:1 contrast.`);
    }
  }
  for (const file of ['theme.js', 'catalog.js']) new Script(await readFile(new URL('web/design-system/' + file, root), 'utf8'), { filename: file });
  console.log('Design token freshness, theme parity, UI color references, contrast and browser scripts passed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkDesign();
