import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SITEMAP_CHUNK_NAMES,
  SITEMAP_ENTRY_LIMIT,
  sitemapChunkNameForPath,
} from '../app/_lib/sitemap-routing.ts';
import { extractSitemapLocations } from '../scripts/blog-indexing/lib.ts';

test('groups logical routes into stable sitemap chunks', () => {
  assert.equal(SITEMAP_ENTRY_LIMIT, 10_000);
  assert.deepEqual(SITEMAP_CHUNK_NAMES, [
    'agents',
    'alternatives',
    'blog',
    'community',
    'craft',
    'plugins',
    'solutions',
    'stories',
    'tutorials',
  ]);

  assert.equal(sitemapChunkNameForPath('/blog/post/'), 'blog');
  assert.equal(sitemapChunkNameForPath('/solutions/design-system/'), 'solutions');
  assert.equal(sitemapChunkNameForPath('/plugins/apple-design/'), 'plugins');
  assert.equal(sitemapChunkNameForPath('/about/'), 'pages');
  assert.equal(sitemapChunkNameForPath('/'), 'pages');
});

test('extracts sitemap locations from both index and URL-set XML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://open-design.ai/sitemap-blog-0.xml</loc></sitemap>
      <sitemap><loc>https://open-design.ai/sitemap-blog-1.xml</loc></sitemap>
    </sitemapindex>`;

  assert.deepEqual(extractSitemapLocations(xml), [
    'https://open-design.ai/sitemap-blog-0.xml',
    'https://open-design.ai/sitemap-blog-1.xml',
  ]);
});
