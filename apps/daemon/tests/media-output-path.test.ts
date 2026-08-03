// Red-spec for issue #6336: the media generator resolves the caller's
// `output` field through sanitizeName(), which replaces "/" with "_".
// Path-bearing outputs (e.g. "assets/hero.png") were therefore flattened
// to "assets_hero.png" and landed at the project root instead of inside
// the project's assets/ subdirectory. The fix routes path-bearing outputs
// through sanitizePath() (which sanitizes each segment and preserves the
// directory separator) while bare filenames continue using sanitizeName()
// for byte-level sanity. This file pins that contract.

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const TEST_MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io';

async function withStubbedFetch<T>(
  handler: (call: { url: string; init: Parameters<typeof fetch>[1] | undefined }) => Promise<Response> | Response,
  run: () => Promise<T>,
): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input.toString();
    return handler({ url, init });
  }) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function minimaxPngResponse(): Response {
  const bytes = Buffer.from(PNG_BASE64, 'base64');
  return minimaxBytesResponse(bytes);
}

function minimaxJpegResponse(): Response {
  // Minimal valid JPEG file: 0xFF 0xD8 0xFF (SOI + APP0 marker start) + 0xE0
  // (JFIF APP0 marker) + 16 bytes of zero padding + 0xFF 0xD9 (EOI).
  // This is enough for sniffImageExt to identify it as JPEG and let the
  // call site rewrite finalOut's extension to .jpg.
  const bytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  return minimaxBytesResponse(bytes);
}

function minimaxBytesResponse(bytes: Buffer): Response {
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
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-media-output-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    projectId = 'demo';
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
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
    if (originalMediaConfigDir == null) {
      delete process.env.OD_MEDIA_CONFIG_DIR;
    } else {
      process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    }
    if (originalDataDir == null) {
      delete process.env.OD_DATA_DIR;
    } else {
      process.env.OD_DATA_DIR = originalDataDir;
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

  it('preserves a dotted parent directory when the provider supplies the extension', async () => {
    const expected = path.join(
      projectsRoot,
      projectId,
      'assets.v2',
      'hero.png',
    );

    const result = await withStubbedFetch(
      () => minimaxPngResponse(),
      async () => generateMedia({
        projectRoot,
        projectsRoot,
        projectId,
        surface: 'image',
        model: 'minimax-image-01',
        prompt: 'dotted parent directory',
        output: 'assets.v2/hero',
      }),
    );

    expect(result.name).toBe('assets.v2/hero.png');
    const buf = await waitForFile(expected);
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    const truncated = path.join(projectsRoot, projectId, 'assets.png');
    await expect(
      readFile(truncated).then(
        () => true,
        () => false,
      ),
    ).resolves.toBe(false);
  });

  it('refuses to write through a symlinked subdirectory that escapes the project', async () => {
    // External directory the symlink will point at.
    const outsideDir = path.join(root, 'outside');
    await mkdir(outsideDir, { recursive: true });

    // Create the project directory up-front so we can plant a symlink
    // inside it; ensureProject() inside generateMedia() will then find
    // an existing dir and the call is a no-op (we can plant the symlink).
    const projectDir = path.join(projectsRoot, projectId);
    await mkdir(projectDir, { recursive: true });
    const assetsLink = path.join(projectDir, 'assets');
    await symlink(outsideDir, assetsLink, 'dir');

    // The path-lexical sanitizer is happy (no "../" in the input), but
    // the symlink-aware project-confined resolver must reject the
    // resolved real path which is `<outsideDir>/hero.png` instead of
    // `<projectDir>/assets/hero.png`.
    const externalTarget = path.join(outsideDir, 'hero.png');
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
            output: 'assets/hero.png',
          });
        } catch (err) {
          captured = err as Error;
        }
      },
    );

    expect(captured).not.toBeNull();
    expect(captured!.message).toMatch(/invalid output path/);
    // Crucially: the external directory must NOT have been written to.
    await expect(
      readFile(externalTarget).then(
        () => true,
        () => false,
      ),
    ).resolves.toBe(false);
  });

  it('refuses a symlink escape introduced by the provider extension rewrite', async () => {
    // External directory with a pre-existing real file there; the
    // symlink at the leaf points at this real file, so resolveSafeReal
    // and a follow-up realpath check on the leaf both have something
    // concrete to walk to.
    const outsideDir = path.join(root, 'outside-rewrite');
    await mkdir(outsideDir, { recursive: true });
    const outsideJpg = path.join(outsideDir, 'hero.jpg');
    await writeFile(outsideJpg, 'preexisting external content');

    // Plant <project>/assets/hero.jpg as a symlink to the external
    // file. The caller asks for .png, but the response sniff detects
    // the body as JPEG (FF D8 FF) so suggestedExt becomes .jpg and
    // the call site rewrites finalOut to "assets/hero.jpg" after
    // the first symlink check has already passed. The re-validation
    // step in the call site must catch the leaf symlink.
    const projectDir = path.join(projectsRoot, projectId);
    await mkdir(projectDir, { recursive: true });
    const jpgLink = path.join(projectDir, 'assets', 'hero.jpg');
    await mkdir(path.dirname(jpgLink), { recursive: true });
    await symlink(outsideJpg, jpgLink, 'file');

    const jpegStubResponse = minimaxJpegResponse();

    let captured: Error | null = null;
    let calledFetch = false;
    await withStubbedFetch(
      () => {
        calledFetch = true;
        return jpegStubResponse;
      },
      async () => {
        try {
          await generateMedia({
            projectRoot,
            projectsRoot,
            projectId,
            surface: 'image',
            model: 'minimax-image-01',
            prompt: 'attempt escape via extension rewrite',
            output: 'assets/hero.png',
          });
        } catch (err) {
          captured = err as Error;
        }
      },
    );

    expect(calledFetch).toBe(true);
    expect(captured).not.toBeNull();
    expect(captured!.message).toMatch(/invalid output path/);
    // The external file must NOT have been overwritten with provider
    // bytes. If the call site catches the leaf symlink, the original
    // "preexisting external content" remains intact.
    const content = await readFile(outsideJpg, 'utf-8');
    expect(content).toBe('preexisting external content');
  });
});
