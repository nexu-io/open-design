// Phase 6 entry slice — figma-extract atom impl.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runFigmaExtract } from '../src/plugins/atoms/figma-extract.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-figma-extract-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const fixtureFile = {
  document: {
    id:   '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '1:1', name: 'Page', type: 'CANVAS',
        children: [
          {
            id: '2:1', name: 'Hero',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 1280, height: 720 },
            cornerRadius: 12,
            fills: [{ type: 'SOLID', color: { r: 0.357, g: 0.553, b: 0.937 } }],
            children: [
              {
                id: '3:1', name: 'Title', type: 'TEXT',
                characters: 'Hello world',
                absoluteBoundingBox: { x: 24, y: 24, width: 200, height: 48 },
                fills: [{ type: 'SOLID', color: { r: 0.067, g: 0.067, b: 0.067 } }],
              },
              {
                id: '3:2', name: 'BG card', type: 'RECTANGLE',
                fills: [{ type: 'GRADIENT_LINEAR' }],
                absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
              },
            ],
          },
        ],
      },
    ],
  },
  version: '1234',
  lastModified: '2026-05-09T00:00:00Z',
};

const stubFetch = (response: { ok?: boolean; status?: number; statusText?: string; body?: unknown; text?: string }) => {
  return vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      statusText: response.statusText ?? 'OK',
      headers: { get: () => null },
      json: async () => response.body ?? {},
      text: async () => response.text ?? '',
    } as unknown as Response;
  });
};

describe('runFigmaExtract — happy paths', () => {
  it('walks the Figma document into a flat tree with parents + boxes', async () => {
    const fetchFn = stubFetch({ body: fixtureFile });
    const report = await runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/Whatever',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(report.tree).toHaveLength(5); // doc + canvas + hero + title + rect
    const hero = report.tree.find((n) => n.id === '2:1');
    expect(hero?.parent).toBe('1:1');
    expect(hero?.box?.w).toBe(1280);
    expect(hero?.fill).toBe('#5b8def');
    const title = report.tree.find((n) => n.id === '3:1');
    expect(title?.text).toBe('Hello world');
    expect(title?.fill).toBe('#111111');
  });

  it('lifts tokens (color + radius + spacing) into a design-extract-shaped bag', async () => {
    const fetchFn = stubFetch({ body: fixtureFile });
    const report = await runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/Whatever',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const colorValues = report.tokens.colors.map((t) => t.value);
    expect(colorValues).toEqual(expect.arrayContaining(['#5b8def', '#111111']));
    expect(report.tokens.radius.map((t) => t.value)).toContain('12px');
    expect(report.tokens.spacing.length).toBeGreaterThan(0);
  });

  it('persists figma/{tree.json, tokens.json, meta.json} under cwd', async () => {
    const fetchFn = stubFetch({ body: fixtureFile });
    await runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/Whatever',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const tree   = JSON.parse(await readFile(path.join(cwd, 'figma', 'tree.json'), 'utf8'));
    const tokens = JSON.parse(await readFile(path.join(cwd, 'figma', 'tokens.json'), 'utf8'));
    const meta   = JSON.parse(await readFile(path.join(cwd, 'figma', 'meta.json'), 'utf8'));
    expect(Array.isArray(tree)).toBe(true);
    expect(meta.fileKey).toBe('ABC123');
    expect(meta.version).toBe('1234');
    expect(meta.lastModified).toBe('2026-05-09T00:00:00Z');
    expect(meta.atomDigest.length).toBe(40);
    expect(meta.unsupportedNodes.length).toBeGreaterThan(0); // gradient
    expect(typeof tokens.colors[0]?.value).toBe('string');
  });

  it('records gradient + image fills in meta.unsupportedNodes', async () => {
    const fetchFn = stubFetch({ body: fixtureFile });
    const report = await runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/Whatever',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const unsup = report.meta.unsupportedNodes.find((u) => u.id === '3:2');
    expect(unsup).toBeDefined();
    expect(unsup?.reason).toMatch(/GRADIENT_LINEAR/);
  });

  it('uses fileKey directly when supplied (skipping URL parsing)', async () => {
    const fetchFn = stubFetch({ body: fixtureFile });
    const report = await runFigmaExtract({
      cwd,
      fileKey: 'XYZ789',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(report.meta.fileKey).toBe('XYZ789');
    // First call URL contains the key.
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('XYZ789'),
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    );
  });
});

describe('runFigmaExtract — asset rasterisation', () => {
  // Fixture with two non-text leaf nodes (3:2 + 3:3) so the asset
  // candidate set is multi-id. The base fixtureFile only has one
  // (3:2 — a RECTANGLE with a gradient fill).
  const assetFixture = {
    document: {
      id: '0:0', name: 'Document', type: 'DOCUMENT',
      children: [{
        id: '1:1', name: 'Page', type: 'CANVAS',
        children: [{
          id: '2:1', name: 'Hero', type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 1280, height: 720 },
          children: [
            { id: '3:2', name: 'Card 1', type: 'RECTANGLE',
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
              fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
            },
            { id: '3:3', name: 'Card 2', type: 'RECTANGLE',
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
              fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }],
            },
          ],
        }],
      }],
    },
  };

  // Multi-call stub: returns a different response per invocation.
  const sequenceFetch = (responses: Array<{ ok?: boolean; status?: number; statusText?: string; body?: unknown; binary?: Buffer; text?: string }>) => {
    let idx = 0;
    return vi.fn(async (_url: string) => {
      const r = responses[Math.min(idx, responses.length - 1)];
      idx++;
      if (!r) throw new Error('test stub: no response queued');
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: r.statusText ?? 'OK',
        headers: { get: () => null },
        json: async () => r.body ?? {},
        text: async () => r.text ?? '',
        arrayBuffer: async () => r.binary ? r.binary.buffer.slice(r.binary.byteOffset, r.binary.byteOffset + r.binary.byteLength) : new ArrayBuffer(0),
      } as unknown as Response;
    });
  };

  it('downloads assets per leaf node when offlineAssets=false', async () => {
    const fetchFn = sequenceFetch([
      { body: assetFixture },
      { body: { images: { '3:2': 'https://cdn/a.svg', '3:3': 'https://cdn/b.svg' } } },
      { binary: Buffer.from('<svg>a</svg>') },
      { binary: Buffer.from('<svg>b</svg>') },
    ]);
    const report = await runFigmaExtract({
      cwd: cwd,
      fileUrl: 'https://figma.com/file/ABC123/x',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
      offlineAssets: false,
    });
    const assets = (await readdir(path.join(cwd, 'figma', 'assets'))).sort();
    expect(assets).toEqual(['3:2.svg', '3:3.svg']);
    expect(report.meta.unsupportedNodes.find((u) => u.id === '3:2' && u.type === 'asset')).toBeUndefined();
  });

  it('records per-id download issues without aborting the run', async () => {
    const fetchFn = sequenceFetch([
      { body: assetFixture },
      { body: { images: { '3:2': null, '3:3': 'https://cdn/b.svg' } } },
      { binary: Buffer.from('<svg>b</svg>') },
    ]);
    const report = await runFigmaExtract({
      cwd: cwd,
      fileUrl: 'https://figma.com/file/ABC123/x',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
      offlineAssets: false,
    });
    const issues = report.meta.unsupportedNodes.filter((u) => u.type === 'asset');
    expect(issues.find((i) => i.id === '3:2')?.reason).toMatch(/no download URL/);
    const assets = await readdir(path.join(cwd, 'figma', 'assets'));
    expect(assets).toEqual(['3:3.svg']);
  });

  it('skips assets above assetMaxBytes', async () => {
    const fetchFn = sequenceFetch([
      { body: assetFixture },
      { body: { images: { '3:2': 'https://cdn/big.svg', '3:3': 'https://cdn/small.svg' } } },
      { binary: Buffer.alloc(8 * 1024) },
      { binary: Buffer.from('<svg>x</svg>') },
    ]);
    const report = await runFigmaExtract({
      cwd: cwd,
      fileUrl: 'https://figma.com/file/ABC123/x',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
      offlineAssets: false,
      assetMaxBytes: 1024,
    });
    const skipped = report.meta.unsupportedNodes.find((u) => u.id === '3:2' && u.type === 'asset');
    expect(skipped?.reason).toMatch(/asset-too-large/);
    const assets = await readdir(path.join(cwd, 'figma', 'assets'));
    expect(assets).toEqual(['3:3.svg']);
  });

  it('keeps assets/ empty when offlineAssets=true (default)', async () => {
    const fetchFn = sequenceFetch([{ body: fixtureFile }]);
    await runFigmaExtract({
      cwd: cwd,
      fileUrl: 'https://figma.com/file/ABC123/x',
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const assets = await readdir(path.join(cwd, 'figma', 'assets'));
    expect(assets).toEqual([]);
  });
});

describe('runFigmaExtract — error paths', () => {
  it('throws when neither fileUrl nor fileKey resolves', async () => {
    await expect(runFigmaExtract({
      cwd,
      fileUrl: 'https://example.com/not-figma',
      token: 'tok',
      fetchFn: stubFetch({}) as unknown as typeof fetch,
    })).rejects.toThrow(/missing fileKey/);
  });

  it('throws when token is missing', async () => {
    await expect(runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/X',
      token: '',
      fetchFn: stubFetch({}) as unknown as typeof fetch,
    })).rejects.toThrow(/missing OAuth token/);
  });

  it('surfaces non-2xx responses with the upstream status text', async () => {
    const fetchFn = stubFetch({ ok: false, status: 403, statusText: 'Forbidden', text: 'invalid token' });
    await expect(runFigmaExtract({
      cwd,
      fileUrl: 'https://figma.com/file/ABC123/X',
      token: 'expired',
      fetchFn: fetchFn as unknown as typeof fetch,
    })).rejects.toThrow(/403/);
  });
});
