import { afterEach, expect, it, vi } from 'vitest';
import { publishProjectFilePublic } from '../../src/providers/registry';

afterEach(() => { vi.unstubAllGlobals(); });

const receipt = { slug: 'stable', filePath: 'index.html', versionId: 'v1', version: 1, publishedAt: 1, entryPath: 'index.html' };

it.each([
  [{ status: 'published', receipt, url: 'https://viewer.example.test/s', madeTeamVisible: true }, { slug: 'stable', url: 'https://viewer.example.test/s', madeTeamVisible: true }],
  [{ status: 'published', receipt, url: 'https://viewer.example.test/s' }, { slug: 'stable', url: 'https://viewer.example.test/s' }],
  [{ status: 'published', receipt, url: 'https://viewer.example.test/s', madeTeamVisible: 'yes' }, { slug: 'stable', url: 'https://viewer.example.test/s' }],
])('carries only an explicit madeTeamVisible from the publish response', async (body, expected) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })));
  await expect(publishProjectFilePublic('p', 'index.html')).resolves.toEqual(expected);
});
