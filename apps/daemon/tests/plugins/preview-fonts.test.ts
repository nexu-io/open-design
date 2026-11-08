import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inlinePluginPreviewFonts } from '../../src/routes/plugins/preview-fonts.js';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), 'od-preview-font-'));
  await mkdir(path.join(folder, 'plugin', 'preview', 'assets'), { recursive: true });
  await writeFile(path.join(folder, 'plugin', 'preview', 'assets', 'font.ttf'), 'original font bytes');
  await writeFile(path.join(folder, 'private.ttf'), 'private bytes');
});
afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

describe('opaque-origin plugin preview fonts', () => {
  const style = (url: string) => `<style>@font-face{font-family:Original;src:url('${url}')}</style>`;
  it('embeds original bytes while preserving other assets and authored scripts', async () => {
    const html = style('assets/font.ttf?v=1') + '<style>body{background:url(assets/image.png)}</style><script>const font="assets/font.ttf";</script>';
    const result = await inlinePluginPreviewFonts(html, path.join(folder, 'plugin'), 'preview');
    expect(result).toContain(`url("data:font/ttf;base64,${Buffer.from('original font bytes').toString('base64')}")`);
    expect(result).toContain('background:url(assets/image.png)');
    expect(result).toContain('const font="assets/font.ttf"');
  });
  it('rejects traversal, encoded traversal, external URLs and missing files', async () => {
    for (const url of ['../../private.ttf', '%2e%2e/%2e%2e/private.ttf', 'https://example.org/font.ttf', '//example.org/font.ttf', 'missing.ttf']) {
      expect(await inlinePluginPreviewFonts(style(url), path.join(folder, 'plugin'), 'preview')).toBe(style(url));
    }
  });
  it('rejects symlinked fonts and directories', async () => {
    await symlink(path.join(folder, 'private.ttf'), path.join(folder, 'plugin', 'preview', 'assets', 'link.ttf'));
    await symlink(folder, path.join(folder, 'plugin', 'preview', 'linked'));
    for (const url of ['assets/link.ttf', 'linked/private.ttf']) {
      expect(await inlinePluginPreviewFonts(style(url), path.join(folder, 'plugin'), 'preview')).toBe(style(url));
    }
  });
});
