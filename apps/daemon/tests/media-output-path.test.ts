// Red-spec for issue #6336: the media generator resolves the caller's
// `output` field through sanitizeName(), which replaces "/" with "_".
// Path-bearing outputs (e.g. "assets/hero.png") were therefore flattened
// to "assets_hero.png" and landed at the project root instead of inside
// the project's assets/ subdirectory. The fix routes path-bearing outputs
// through sanitizePath() (which sanitizes each segment and preserves the
// directory separator) while bare filenames continue using sanitizeName()
// for byte-level sanity. This file pins that contract.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const TEST_MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

async function withStubbedFetch(
  handler: (call: FetchCall) => Promise<Response> | Response,
  run: () => Promise<void>,
): Promise<void> {
  const calls: FetchCall[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler({ url, init });
  }) as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function minimaxPngResponse(): Response {
  const bytes = Buffer.from(PNG_BASE64, 'base64');
  return new Response(
    JSON.stringify({
      data: { image_base64: [bytes.toString('base64')] },
      base_resp: { status_code: 0, status_msg: 'success' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('media generator output path resolution (#6336)', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let projectId: string;

  const realFetch = globalThis.fetch;
  const originalMinimaxApiKey = process.env.OD_MINIMAX_API_KEY;
  const originalImageBaseUrl = process.env.OD_MINIMAX_IMAGE_BASE_URL;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-media-output-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    projectId = 'demo';
    await mkdir(projectsRoot, { recursive: true });
    process.env.OD_MINIMAX_API_KEY = 'minimax-test-key';
    process.env.OD_MINIMAX_IMAGE_BASE_URL = TEST_MINIMAX_DEFAULT_BASE_URL;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMinimaxApiKey == null) {
      delete process.env.OD_MINIMAX_API_KEY;
    } else {
      process.env.OD_MINIMAX_API_KEY = originalMinimaxApiKey;
    }
    if (originalImageBaseUrl == null) {
      delete process.env.OD_MINIMAX_IMAGE_BASE_URL;
    } else {
      process.env.OD_MINIMAX_IMAGE_BASE_URL = originalImageBaseUrl;
    }
    await rm(root, { recursive: true, force: true });
  });

  async function waitForFile(filePath: string, timeoutMs = 2000): Promise<Buffer> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const buf = await readFile(filePath);
        if (buf.length > 0) return buf;
      } catch {
        // not yet
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for file at ${filePath}`);
  }

  it('lands a path-bearing output under the requested subdirectory', async () => {
    const expected = path.join(projectsRoot, projectId, 'assets', 'hero.png');
    await mkdir(path.dirname(expected), { recursive: true });

    await withStubbedFetch(
      () => minimaxPngResponse(),
      async () => {
        const task = await generateMedia({
          projectRoot,
          projectsRoot,
          projectId,
          surface: 'image',
          model: 'minimax-image-01',
          prompt: 'cinematic hero',
          output: 'assets/hero.png',
        });
        await task;
      },
    );

    const buf = await waitForFile(expected);
    // The PNG magic header must match the bytes the stub returned.
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // The flattened "assets_hero.png" must NOT exist.
    const flattened = path.join(projectsRoot, projectId, 'assets_hero.png');
    await expect(readFile(flattened).then(() => true, () => false)).resolves.toBe(false);
  });

  it('keeps bare filenames flattened by sanitizeName', async () => {
    const expected = path.join(projectsRoot, projectId, 'hero.png');
    await withStubbedFetch(
      () => minimaxPngResponse(),
      async () => {
        const task = await generateMedia({
          projectRoot,
          projectsRoot,
          projectId,
          surface: 'image',
          model: 'minimax-image-01',
          prompt: 'cinematic hero',
          output: 'hero.png',
        });
        await task;
      },
    );

    const buf = await waitForFile(expected);
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('rejects a path-traversal attempt with a friendly error', async () => {
    let captured: Error | null = null;
    await withStubbedFetch(
      () => minimaxPngResponse(),
      async () => {
        try {
          await generateMedia({
            projectRoot,
            projectsRoot,
            projectId,
            surface: 'image',
            model: 'minimax-image-01',
            prompt: 'attempt escape',
            output: '../../etc/passwd',
          });
        } catch (err) {
          captured = err as Error;
        }
      },
    );

    expect(captured).not.toBeNull();
    expect(captured!.message).toMatch(/invalid output path/);
    // And no file should have been created at the project root.
    const escaped = path.join(projectsRoot, projectId, 'etc', 'passwd');
    await expect(readFile(escaped).then(() => true, () => false)).resolves.toBe(false);
  });

  it('falls back to the auto-generated filename when output is omitted', async () => {
    let writtenPath: string | null = null;
    const realReaddir = (await import('node:fs/promises')).readdir;
    const originalReaddir = realReaddir;
    // Poll for the auto-generated file under the project root.
    await withStubbedFetch(
      () => minimaxPngResponse(),
      async () => {
        const task = await generateMedia({
          projectRoot,
          projectsRoot,
          projectId,
          surface: 'image',
          model: 'minimax-image-01',
          prompt: 'cinematic hero',
        });
        await task;
      },
    );
    const projectDir = path.join(projectsRoot, projectId);
    for (let i = 0; i < 20 && !writtenPath; i++) {
      const entries = await realReaddir(projectDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.png')) {
          writtenPath = path.join(projectDir, entry.name);
          break;
        }
      }
      if (!writtenPath) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    expect(writtenPath).not.toBeNull();
    expect(originalReaddir).toBe(realReaddir);
  });
});
