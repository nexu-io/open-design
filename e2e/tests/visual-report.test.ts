import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { PNG } from 'pngjs';

import {
  assertPngPixels,
  compareCase,
  diffBoxesFromMask,
  drawBox,
  isChangedVisualDiff,
  mergeDiffBoxes,
  padBox,
  type DiffBox,
} from '../scripts/visual-report.js';

describe('visual report PNG sizing', () => {
  test('rejects normalized diff canvases that exceed the pixel ceiling', () => {
    expect(() => assertPngPixels(4_000, 900, 'main.png')).not.toThrow();
    expect(() => assertPngPixels(900, 4_000, 'pr.png')).not.toThrow();
    expect(() => assertPngPixels(4_000, 4_000, 'main.png vs pr.png normalized diff canvas')).toThrow(
      /maximum allowed is 4000000 pixels/,
    );
  });

  test('malformed screenshots fail one case without preventing later valid cases', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'visual-report-'));
    try {
      const outputDir = path.join(workDir, 'output');
      const goodPath = path.join(workDir, 'visual-good.png');
      const badPath = path.join(workDir, 'visual-bad.png');
      const pngBuffer = PNG.sync.write(createFilledPng(2, 2));
      await writeFile(goodPath, pngBuffer);
      await writeFile(badPath, Buffer.from('not-a-png'));

      const r2 = {
        bucket: 'visual-bucket',
        publicOrigin: 'https://example.invalid',
        client: {} as never,
      };
      const ops = {
        putFile: async () => {},
        findBaseline: async () => ({ sha: 'a'.repeat(40), key: 'baseline/visual-good.png', behindBy: 0 }),
        downloadObject: async (_r2: unknown, _key: string, outputPath: string) => {
          await mkdir(path.dirname(outputPath), { recursive: true });
          await writeFile(outputPath, pngBuffer);
        },
        writeDiffPng: async (_mainPath: string, prPath: string, diffPath: string) => {
          await mkdir(path.dirname(diffPath), { recursive: true });
          await writeFile(diffPath, await readFile(prPath));
          return { diffPixels: 0, totalPixels: 4 };
        },
      };

      const malformed = await compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-bad', path: badPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        ops,
      );
      const valid = await compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-good', path: goodPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        ops,
      );

      expect(malformed.status).toBe('failed');
      expect(malformed.name).toBe('visual-bad');
      expect(valid).toMatchObject({
        name: 'visual-good',
        status: 'unchanged',
        prUrl: 'https://example.invalid/visual-regression/pr-12/34/pr/visual-good.png',
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('required R2 failures propagate instead of returning a failed case', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'visual-report-'));
    try {
      const outputDir = path.join(workDir, 'output');
      const goodPath = path.join(workDir, 'visual-good.png');
      const pngBuffer = PNG.sync.write(createFilledPng(2, 2));
      await writeFile(goodPath, pngBuffer);

      const r2 = {
        bucket: 'visual-bucket',
        publicOrigin: 'https://example.invalid',
        client: {} as never,
      };

      await expect(compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-good', path: goodPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        {
          putFile: async () => {},
          findBaseline: async () => ({ sha: 'a'.repeat(40), key: 'baseline/visual-good.png', behindBy: 0 }),
          downloadObject: async () => {
            throw new Error('download failed');
          },
          writeDiffPng: async () => ({ diffPixels: 0, totalPixels: 4 }),
        },
      )).rejects.toThrow('download failed');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('missing screenshot files propagate instead of returning a failed case', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'visual-report-'));
    try {
      const outputDir = path.join(workDir, 'output');
      const missingPath = path.join(workDir, 'visual-missing.png');

      const r2 = {
        bucket: 'visual-bucket',
        publicOrigin: 'https://example.invalid',
        client: {} as never,
      };

      await expect(compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-missing', path: missingPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        {
          putFile: async () => {},
          findBaseline: async () => null,
          downloadObject: async () => {
            throw new Error('download should not run');
          },
          writeDiffPng: async () => {
            throw new Error('diff should not run');
          },
        },
      )).rejects.toThrow(/ENOENT|no such file/i);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('malformed screenshots without a baseline fail before any PR upload', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'visual-report-'));
    try {
      const outputDir = path.join(workDir, 'output');
      const badPath = path.join(workDir, 'visual-bad.png');
      await writeFile(badPath, Buffer.from('not-a-png'));

      const uploadedKeys: string[] = [];
      const r2 = {
        bucket: 'visual-bucket',
        publicOrigin: 'https://example.invalid',
        client: {} as never,
      };

      const result = await compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-bad', path: badPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        {
          putFile: async (_r2: unknown, key: string) => {
            uploadedKeys.push(key);
          },
          findBaseline: async () => null,
          downloadObject: async () => {
            throw new Error('download should not run');
          },
          writeDiffPng: async () => {
            throw new Error('diff should not run');
          },
        },
      );

      expect(result).toMatchObject({
        name: 'visual-bad',
        status: 'failed',
      });
      expect(uploadedKeys).toEqual([]);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('treats tiny pixel diffs as unchanged visual noise', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'visual-report-'));
    try {
      const outputDir = path.join(workDir, 'output');
      const goodPath = path.join(workDir, 'visual-good.png');
      const pngBuffer = PNG.sync.write(createFilledPng(2, 2));
      await writeFile(goodPath, pngBuffer);

      const r2 = {
        bucket: 'visual-bucket',
        publicOrigin: 'https://example.invalid',
        client: {} as never,
      };

      const result = await compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-good', path: goodPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        {
          putFile: async () => {},
          findBaseline: async () => ({ sha: 'a'.repeat(40), key: 'baseline/visual-good.png', behindBy: 0 }),
          downloadObject: async (_r2: unknown, _key: string, outputPath: string) => {
            await mkdir(path.dirname(outputPath), { recursive: true });
            await writeFile(outputPath, pngBuffer);
          },
          writeDiffPng: async (_mainPath: string, prPath: string, diffPath: string) => {
            await mkdir(path.dirname(diffPath), { recursive: true });
            await writeFile(diffPath, await readFile(prPath));
            return { diffPixels: 32, totalPixels: 1_600 };
          },
        },
      );

      expect(result).toMatchObject({
        name: 'visual-good',
        status: 'unchanged',
        diffPixels: 32,
        diffPixelRatio: 0.02,
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('uses the absolute visual diff floor as the changed-case classifier', async () => {
    expect(isChangedVisualDiff(499, 0.5)).toBe(false);
    expect(isChangedVisualDiff(500, 0.0001)).toBe(true);
    expect(isChangedVisualDiff(25_000, 0.0267)).toBe(true);
  });

  test('huge-dimension PNG headers fail before decode and upload', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'visual-report-'));
    try {
      const outputDir = path.join(workDir, 'output');
      const badPath = path.join(workDir, 'visual-huge.png');
      await writeFile(badPath, createHugeHeaderPng(100_000, 100_000));

      const uploadedKeys: string[] = [];
      const r2 = {
        bucket: 'visual-bucket',
        publicOrigin: 'https://example.invalid',
        client: {} as never,
      };

      const result = await compareCase(
        {
          r2,
          prNumber: '12',
          runId: '34',
          headSha: 'b'.repeat(40),
          visualCase: { name: 'visual-huge', path: badPath },
          candidateShas: ['c'.repeat(40)],
          outputDir,
        },
        {
          putFile: async (_r2: unknown, key: string) => {
            uploadedKeys.push(key);
          },
          findBaseline: async () => null,
          downloadObject: async () => {
            throw new Error('download should not run');
          },
          writeDiffPng: async () => {
            throw new Error('diff should not run');
          },
        },
      );

      expect(result).toMatchObject({
        name: 'visual-huge',
        status: 'failed',
        error: expect.stringMatching(/maximum allowed is 4000000 pixels/),
      });
      expect(uploadedKeys).toEqual([]);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

describe('visual diff box extraction', () => {
  test('returns one box for a single contiguous region', () => {
    const mask = createMask(6, 5, [[1, 1], [2, 1], [2, 2], [3, 2]]);

    expect(diffBoxesFromMask(mask)).toEqual([{ minX: 1, minY: 1, maxX: 3, maxY: 2 }]);
  });

  test('returns distinct boxes for disjoint regions', () => {
    const mask = createMask(7, 5, [[0, 1], [1, 1], [5, 3], [5, 4]]);

    expect(diffBoxesFromMask(mask)).toEqual([
      { minX: 0, minY: 1, maxX: 1, maxY: 1 },
      { minX: 5, minY: 3, maxX: 5, maxY: 4 },
    ]);
  });

  test('returns no boxes for an empty mask', () => {
    expect(diffBoxesFromMask(createMask(3, 3, []))).toEqual([]);
  });

  test('collapses to the overall bounding box when region count exceeds the cap', () => {
    const pixels = Array.from({ length: 2_001 }, (_, index) => [index * 2, 0] as const);

    expect(diffBoxesFromMask(createMask(4_001, 1, pixels))).toEqual([{ minX: 0, minY: 0, maxX: 4_000, maxY: 0 }]);
  });
});

describe('visual diff box merging and drawing', () => {
  test('merges nearby regions into one box', () => {
    const boxes: DiffBox[] = [
      { minX: 1, minY: 1, maxX: 2, maxY: 2 },
      { minX: 12, minY: 1, maxX: 13, maxY: 2 },
    ];

    expect(mergeDiffBoxes(boxes, 10)).toEqual([{ minX: 1, minY: 1, maxX: 13, maxY: 2 }]);
  });

  test('keeps boxes separate when they are just beyond the merge distance', () => {
    const boxes: DiffBox[] = [
      { minX: 1, minY: 1, maxX: 2, maxY: 2 },
      { minX: 15, minY: 1, maxX: 16, maxY: 2 },
    ];

    expect(mergeDiffBoxes(boxes, 12)).toEqual(boxes);
  });

  test('pads boxes within image bounds', () => {
    expect(padBox({ minX: 2, minY: 3, maxX: 4, maxY: 5 }, 6, 8, 10)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 7,
      maxY: 9,
    });
  });

  test('draws a clamped stroke around the box', () => {
    const png = new PNG({ width: 4, height: 4 });

    drawBox(png, { minX: 1, minY: 1, maxX: 2, maxY: 2 }, 3);

    expect(redPixels(png).sort()).toEqual([
      '1,1',
      '1,2',
      '2,1',
      '2,2',
    ]);
  });
});

function createMask(width: number, height: number, pixels: ReadonlyArray<readonly [number, number]>): PNG {
  const png = new PNG({ width, height });
  for (const [x, y] of pixels) {
    const index = (png.width * y + x) << 2;
    png.data[index] = 255;
    png.data[index + 1] = 0;
    png.data[index + 2] = 0;
    png.data[index + 3] = 255;
  }
  return png;
}

function createFilledPng(width: number, height: number): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (png.width * y + x) << 2;
      png.data[index] = 12;
      png.data[index + 1] = 34;
      png.data[index + 2] = 56;
      png.data[index + 3] = 255;
    }
  }
  return png;
}

function createHugeHeaderPng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

function redPixels(png: PNG): string[] {
  const pixels: string[] = [];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) << 2;
      if (
        png.data[index] === 255
        && png.data[index + 1] === 0
        && png.data[index + 2] === 0
        && png.data[index + 3] === 255
      ) {
        pixels.push(`${x},${y}`);
      }
    }
  }
  return pixels;
}
