import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanCreatorMediaRoot } from '../src/creator-media/scanner.js';

let rootPath = '';

beforeEach(async () => {
  rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-creator-media-'));
  await Promise.all([
    fsp.writeFile(path.join(rootPath, 'frame.jpg'), 'image'),
    fsp.writeFile(path.join(rootPath, 'clip.mp4'), 'video'),
    fsp.writeFile(path.join(rootPath, 'notes.txt'), 'skip'),
    fsp.mkdir(path.join(rootPath, '.hidden')),
  ]);
  await fsp.writeFile(path.join(rootPath, '.hidden', 'hidden.png'), 'hidden');
});

afterEach(async () => {
  await fsp.rm(rootPath, { recursive: true, force: true });
});

describe('scanCreatorMediaRoot', () => {
  it('indexes supported images and videos while skipping unsupported and hidden files', async () => {
    const result = await scanCreatorMediaRoot(rootPath);

    expect(result.discovered.map((asset) => asset.fileName).sort()).toEqual(['clip.mp4', 'frame.jpg']);
    expect(result.discovered.map((asset) => asset.kind).sort()).toEqual(['image', 'video']);
    expect(result.discovered.every((asset) => asset.relativePath === asset.fileName)).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
