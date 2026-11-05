import { afterEach, expect, it, vi } from 'vitest';
import { publishProjectFilePublic } from '../../src/providers/registry';

afterEach(() => { vi.unstubAllGlobals(); });

const receipt = { slug: 'stable', filePath: 'index.html', versionId: 'v1', version: 1, publishedAt: 1, entryPath: 'index.html' };

it.each([
  [{ slug: 'stable' }, {}],
  [{ slug: 'stable', version: '2', publishedAt: -1 }, {}],
  [{ slug: 'stable', version: 3, publishedAt: 'bad' }, { publicationObservation: { share_version: 3 } }],
  [{ slug: 'stable', version: 0, publishedAt: 0 }, { publicationObservation: { published_at: 0 } }],
])('optional receipt metadata never changes the business request or readiness: %j', async (observedReceipt, observation) => {
  const request = vi.fn(async () => Response.json({
    status: 'published', receipt: observedReceipt, url: 'https://viewer.example.test/s',
  }));
  vi.stubGlobal('fetch', request);
  await expect(publishProjectFilePublic('p', 'index.html')).resolves.toEqual({
    slug: 'stable', url: 'https://viewer.example.test/s', ...observation,
  });
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/projects/p/files/index.html/publish-public', { method: 'POST' });
});

it.each([
  [{ status: 'published', receipt, url: 'https://viewer.example.test/s', madeTeamVisible: true }, { slug: 'stable', url: 'https://viewer.example.test/s' }],
  [{ status: 'published', receipt, url: 'https://viewer.example.test/s' }, { slug: 'stable', url: 'https://viewer.example.test/s' }],
  [{ status: 'published', receipt, url: 'https://viewer.example.test/s', madeTeamVisible: 'yes' }, { slug: 'stable', url: 'https://viewer.example.test/s' }],
])('does not turn publication response feedback into project visibility', async (body, expected) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })));
  await expect(publishProjectFilePublic('p', 'index.html')).resolves.toEqual({
    ...expected, publicationObservation: { share_version: 1, published_at: 1 },
  });
});
