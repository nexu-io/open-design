import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StockSearchConfigError, imageSize, stockSearch, subjectScore } from '../src/media/stock-search.js';

// Minimal JPEG: SOI + SOF0 declaring 1200x800.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00]);

type Route = (url: string) => { status?: number; json?: unknown; body?: Buffer } | undefined;

function fakeFetch(route: Route, seen: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    const hit = route(url);
    if (!hit) return new Response('not found', { status: 404 });
    if (hit.body) return new Response(new Uint8Array(hit.body), { status: hit.status ?? 200 });
    return new Response(JSON.stringify(hit.json ?? {}), { status: hit.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const pexelsPhoto = (id: number, alt: string) => ({
  id, alt, url: `https://www.pexels.com/photo/${id}/`, photographer: 'Ann', photographer_url: 'https://www.pexels.com/@ann',
  src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` },
});

describe('od media stock-search', () => {
  let cwd: string;
  beforeEach(async () => { cwd = await mkdtemp(path.join(os.tmpdir(), 'od-stock-')); });
  afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

  it('downloads the candidate whose alt names the subject, not a people-led photo that mentions it', async () => {
    const seen: string[] = [];
    const report = await stockSearch({
      cwd,
      env: { PEXELS_API_KEY: 'k' },
      slots: [{ id: 'Frames', query: 'eyeglasses frame', width: 900 }],
      fetch: fakeFetch((url) => {
        if (url.startsWith('https://api.pexels.com/')) return { json: { photos: [
          pexelsPhoto(1, 'Elderly woman reading a book while wearing eyeglasses'),
          pexelsPhoto(2, 'Black eyeglasses frame on a pink background'),
        ] } };
        if (url.startsWith('https://images.pexels.com/photos/2/')) return { body: JPEG };
        return undefined;
      }, seen),
    });
    expect(report.providers).toEqual(['pexels']);
    expect(report.slots[0]).toMatchObject({
      id: 'Frames', status: 'ok', provider: 'pexels', path: 'assets/stock/frames.jpg',
      width: 1200, height: 800, alt: 'Black eyeglasses frame on a pink background',
    });
    expect(seen).toContain('https://images.pexels.com/photos/2/pexels-photo-2.jpeg?auto=compress&cs=tinysrgb&w=900');
    const credits = JSON.parse(await readFile(path.join(cwd, 'assets/stock/credits.json'), 'utf8'));
    expect(credits[0]).toMatchObject({ path: 'assets/stock/frames.jpg', license: expect.stringContaining('Pexels License') });
  });

  it('falls back to Pixabay when Pexels has no matching photo', async () => {
    const report = await stockSearch({
      cwd,
      env: { PEXELS_API_KEY: 'k', PIXABAY_API_KEY: 'p' },
      slots: [{ id: 'tofu', query: 'mapo tofu' }],
      fetch: fakeFetch((url) => {
        if (url.startsWith('https://api.pexels.com/')) return { json: { photos: [pexelsPhoto(3, 'City skyline at night')] } };
        if (url.startsWith('https://pixabay.com/api/')) return { json: { hits: [{
          pageURL: 'https://pixabay.com/photos/mapo-tofu-1/', tags: 'mapo tofu, tofu, food', user: 'bo', user_id: 7,
          webformatURL: 'https://cdn.pixabay.com/photo/a_640.jpg', largeImageURL: 'https://cdn.pixabay.com/photo/a_1280.jpg',
        }] } };
        if (url === 'https://cdn.pixabay.com/photo/a_1280.jpg') return { body: JPEG };
        return undefined;
      }),
    });
    expect(report.slots[0]).toMatchObject({ status: 'ok', provider: 'pixabay', alt: 'mapo tofu, tofu, food' });
  });

  it('reports a missing key as a configuration error instead of searching', async () => {
    await expect(stockSearch({ cwd, env: {}, slots: [{ id: 'a', query: 'x' }] })).rejects.toBeInstanceOf(StockSearchConfigError);
  });

  it('marks slots that start after the budget as budget_exceeded', async () => {
    let clock = 0;
    const report = await stockSearch({
      cwd,
      env: { PEXELS_API_KEY: 'k' },
      budgetMs: 10,
      concurrency: 1,
      now: () => clock,
      slots: [{ id: 'a', query: 'noodles bowl' }, { id: 'b', query: 'noodles soup' }],
      fetch: fakeFetch((url) => {
        clock += 20;
        if (url.startsWith('https://api.pexels.com/')) return { json: { photos: [pexelsPhoto(4, 'Noodles in a bowl')] } };
        return { body: JPEG };
      }),
    });
    expect(report.slots.map((s) => s.status)).toEqual(['ok', 'budget_exceeded']);
  });

  it('scores subject-led alt text above incidental mentions and keeps people when asked for', () => {
    expect(subjectScore('eyeglasses frame', 'Black eyeglasses frame on a table')).toBeGreaterThan(
      subjectScore('eyeglasses frame', 'Woman wearing eyeglasses reading'),
    );
    expect(subjectScore('woman wearing eyeglasses', 'Woman wearing eyeglasses reading')).toBeGreaterThan(0);
    expect(subjectScore('eyeglasses frame', 'Sunset over the sea')).toBe(0);
    expect(subjectScore('眼镜框', 'Elderly woman wearing glasses')).toBe(0);
    expect(imageSize(JPEG)).toEqual({ width: 1200, height: 800 });
  });
});
