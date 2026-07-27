import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pagePath = new URL('../app/pages/codex-slides/index.astro', import.meta.url);

test('keeps the wide studio gallery within narrow containers', async () => {
  const page = await readFile(pagePath, 'utf8');
  const wideGalleryRule = page.match(/\.ha-showcase-wide\s*\{(?<body>[^}]*)\}/);

  assert.ok(wideGalleryRule?.groups?.body, 'expected the .ha-showcase-wide CSS rule');
  assert.match(
    wideGalleryRule.groups.body,
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*420px\),\s*1fr\)\);/,
  );
});
