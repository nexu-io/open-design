// Red-spec for the media `output` subdirectory bug (#6336): when the caller
// supplied `output` with a subdirectory (e.g. `assets/foo.png`), the route
// routed the name through `sanitizeName()`, which collapses `/` to `_`. The
// resulting filename (`assets_foo.png`) was written at the project root
// instead of under the project's `assets/` subdirectory — breaking the
// `<img src="assets/foo.png">` relative-path workflow the agent helpers rely
// on.
//
// The fix routes a caller-supplied `output` through `sanitizePath()`, which
// validates the relative path (rejecting `..`, absolute paths, control chars)
// and PRESERVES the directory separator. The auto-generated fallback from
// `autoOutputName()` is always a bare filename, so it stays on `sanitizeName()`.
//
// These tests pin that contract for the MiniMax image surface; the underlying
// `sanitizePath` semantics are pinned in `project-upload-subdir-path.test.ts`.

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const TEST_MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io';

describe('media generate output subdirectory path handling', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalMinimaxApiKey = process.env.OD_MINIMAX_API_KEY;
  const originalImageBaseUrl = process.env.OD_MINIMAX_IMAGE_BASE_URL;
  const originalMediaModelAliases = process.env.OD_MEDIA_MODEL_ALIASES;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-media-out-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_MINIMAX_IMAGE_BASE_URL;
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    process.env.OD_MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMinimaxApiKey == null) {
      delete process.env.OD_MINIMAX_API_KEY;
    } else {
      process.env.OD_MINIMAX_API_KEY = originalMinimaxApiKey;
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
    if (originalImageBaseUrl == null) {
      delete process.env.OD_MINIMAX_IMAGE_BASE_URL;
    } else {
      process.env.OD_MINIMAX_IMAGE_BASE_URL = originalImageBaseUrl;
    }
    if (originalMediaModelAliases == null) {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
    } else {
      process.env.OD_MEDIA_MODEL_ALIASES = originalMediaModelAliases;
    }
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  function installMinimaxFetchMock() {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_MINIMAX_DEFAULT_BASE_URL}/v1/image_generation`);
      expect(init?.method).toBe('POST');
      return new Response(
        JSON.stringify({
          base_resp: { status_code: 0, status_msg: 'success' },
          data: { image_base64: [PNG_BASE64] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('writes the file under the subdirectory when output has a path prefix', async () => {
    await writeConfig({ providers: { minimax: {} } });
    installMinimaxFetchMock();

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'a cute cartoon bear',
      aspect: '16:9',
      output: 'assets/foo.png',
    });

    // The reported name keeps the caller-supplied subdirectory, so the
    // project's relative-path helpers (`<img src="assets/foo.png">`) match.
    expect(result.name).toBe('assets/foo.png');

    // The actual file lands under <projectRoot>/assets/foo.png, not the
    // flattened `assets_foo.png` at the project root.
    const bytes = await readFile(
      path.join(projectsRoot, 'project-1', 'assets', 'foo.png'),
    );
    expect(bytes.length).toBeGreaterThan(0);

    // And the flattened name is NOT written to the project root.
    await expect(
      readFile(path.join(projectsRoot, 'project-1', 'assets_foo.png')),
    ).rejects.toThrow();
  });

  it('still writes a bare filename to the project root when output has no path', async () => {
    await writeConfig({ providers: { minimax: {} } });
    installMinimaxFetchMock();

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'a cute cartoon bear',
      aspect: '16:9',
      output: 'foo.png',
    });

    expect(result.name).toBe('foo.png');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'foo.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('normalizes a leading ./ prefix to a bare filename', async () => {
    await writeConfig({ providers: { minimax: {} } });
    installMinimaxFetchMock();

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'a cute cartoon bear',
      aspect: '16:9',
      output: './foo.png',
    });

    expect(result.name).toBe('foo.png');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'foo.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('rejects a path traversal attempt in output', async () => {
    await writeConfig({ providers: { minimax: {} } });
    installMinimaxFetchMock();

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'minimax-image-01',
        prompt: 'a cute cartoon bear',
        aspect: '16:9',
        output: '../../etc/passwd',
      }),
    ).rejects.toThrow();
  });

  it('still auto-generates a bare filename when output is omitted', async () => {
    await writeConfig({ providers: { minimax: {} } });
    installMinimaxFetchMock();

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'a cute cartoon bear',
      aspect: '16:9',
    });

    // The auto-generated name is a bare filename at the project root.
    const file = path.join(projectsRoot, 'project-1', result.name);
    const bytes = await readFile(file);
    expect(bytes.length).toBeGreaterThan(0);
    // Sanity: the auto name should not contain a path separator.
    expect(result.name).not.toMatch(/[\\/]/);
  });

  it('rejects a subdirectory that is a symlink to outside the project', async () => {
    // Symlink-escape regression (PR #6339 review): a project subdirectory
    // set up as a symlink to a path outside the project root would let a
    // caller-supplied `output` follow the link and write the generated
    // file outside the sandbox. `resolveSafeReal()` realpath()s the
    // candidate target and re-validates against the realpath of the
    // project dir, so the symlinked subdirectory is rejected with
    // EPATHESCAPE before any bytes are written.
    await writeConfig({ providers: { minimax: {} } });
    installMinimaxFetchMock();

    // Lay out: <projectsRoot>/project-1/assets -> <root>/outside-target
    const outsideTarget = path.join(root, 'outside-target');
    await mkdir(outsideTarget, { recursive: true });
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    const linkPath = path.join(projectDir, 'assets');
    try {
      await symlink(outsideTarget, linkPath, 'dir');
    } catch (err) {
      // Some sandboxed CI runners run without symlink permission. Skip
      // the regression case if so; the test still type-checks.
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS') {
        return;
      }
      throw err;
    }

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'minimax-image-01',
        prompt: 'a cute cartoon bear',
        aspect: '16:9',
        output: 'assets/foo.png',
      }),
    ).rejects.toThrow();

    // Nothing landed in the outside target.
    await expect(readFile(path.join(outsideTarget, 'foo.png'))).rejects.toThrow();
  });
});
