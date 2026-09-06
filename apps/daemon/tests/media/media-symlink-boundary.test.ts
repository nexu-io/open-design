import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeAIHubMixGenerateVideo } from '../../src/byok-tools.js';
import { generateMedia } from '../../src/media/index.js';

// Regression tests for issue nexu-io/open-design#6779: project-local
// reference-image readers (media/index.ts resolveProjectImage and
// byok-tools.ts fileToImagePart / resolveAIHubMixReferenceImage /
// newestProjectImagePart) performed a *lexical* containment check and then
// stat / readFile / copyFile, which follow symlinks. A project-local symlink
// whose canonical target is outside the project escaped the boundary, letting
// an outside file's size and bytes leak into a generation request.
//
// The boundary invariant under test: the canonical (realpath'd) target of any
// project reference-image read must stay inside the project directory, and it
// must be enforced BEFORE any stat / readFile / copyFile touches the target.

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';

describe('media reference-image symlink boundary (issue #6779)', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let projectDir: string;
  const realFetch = globalThis.fetch;
  const originalMinimaxApiKey = process.env.OD_MINIMAX_API_KEY;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-symlink-boundary-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    process.env.OD_MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
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
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  const minimaxArgs = (overrides: Record<string, unknown> = {}) => ({
    projectRoot,
    projectsRoot,
    projectId: 'project-1',
    surface: 'image' as const,
    model: 'minimax-image-01',
    prompt: 'probe',
    output: 'probe.png',
    ...overrides,
  });

  it('rejects a project symlink whose target is outside the project before reading the target', async () => {
    await writeConfig({ providers: { minimax: {} } });

    // Outside target, > MAX_IMAGE_BYTES (16 MiB). If the boundary leaks, the
    // observable symptom is the outside file's size ("--image too large")
    // instead of a project-boundary rejection — proving stat() reached it.
    const outsideDir = path.join(root, 'outside');
    await mkdir(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, 'secret.png');
    await writeFile(outsideFile, Buffer.alloc(16 * 1024 * 1024 + 1, 0x42));

    // Lexically inside the project: <projectDir>/external.png
    await symlink(outsideFile, path.join(projectDir, 'external.png'));

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // The boundary must reject BEFORE stat/readFile touch the target.
    await expect(
      generateMedia(minimaxArgs({ image: './external.png' })),
    ).rejects.toThrow(/outside the project directory|escape the project|via symlink/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a project symlink escape on the in-chat AIHubMix generate_video reference path', async () => {
    // Distinctive bytes so we can prove the OUTSIDE content reached the wire.
    const secretBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef]);
    const secretB64 = secretBytes.toString('base64');
    const outsideDir = path.join(root, 'outside');
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(outsideDir, 'secret.png'), secretBytes);
    // Symlink inside the project's files dir, named like a normal upload.
    await symlink(path.join(outsideDir, 'secret.png'), path.join(projectDir, 'external.png'));

    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-probe' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-probe') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      {
        prompt: 'animate',
        model: 'aihubmix-happyhorse-1.0-i2v',
        image_url: '/api/projects/project-1/files/external.png',
      },
      {
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        upstreamApiKey: 'ahm-byok-key',
        upstreamBaseUrl: 'https://aihubmix.com/v1',
        videoPollIntervalMs: 1,
      },
    );

    // Boundary invariant: outside bytes must NOT reach the provider. On a
    // proper rejection no submit happens at all, so submitBody stays null.
    expect(result.ok).toBe(false);
    expect(submitBody).toBeNull();
    expect(submitBody?.input?.media?.[0]?.url ?? '').not.toContain(secretB64);
  });

  it('rejects a newestProjectImagePart fallback that would read an outside symlink target', async () => {
    // Distinctive outside bytes; a leak would put them on the wire.
    const secretBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef]);
    const secretB64 = secretBytes.toString('base64');
    const outsideDir = path.join(root, 'outside');
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(outsideDir, 'secret.png'), secretBytes);
    // The ONLY image in the project dir is an escape symlink.
    await symlink(path.join(outsideDir, 'secret.png'), path.join(projectDir, 'external.png'));

    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-fallback' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-fallback') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    // No image_url: the code falls back to newestProjectImagePart, which must
    // skip the escaping symlink and find no usable reference.
    const result = await executeAIHubMixGenerateVideo(
      {
        prompt: 'animate',
        model: 'aihubmix-happyhorse-1.0-i2v',
      },
      {
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        upstreamApiKey: 'ahm-byok-key',
        upstreamBaseUrl: 'https://aihubmix.com/v1',
        videoPollIntervalMs: 1,
      },
    );

    // Boundary invariant: the escaping fallback candidate must not leak outside
    // bytes; the i2v model then correctly reports no reference found.
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/needs a reference image/);
    expect(submitBody).toBeNull();
    expect(submitBody?.input?.media?.[0]?.url ?? '').not.toContain(secretB64);
  });

  it('control: accepts a byok in-project symlink reference whose target stays inside the project', async () => {
    // Distinctive in-project bytes — the submit body must carry THESE, and
    // never an outside secret.
    const insideBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
    const insideB64 = insideBytes.toString('base64');
    const inside = path.join(projectDir, 'inside.png');
    await writeFile(inside, insideBytes);
    await symlink(inside, path.join(projectDir, 'link.png'));

    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-ctrl' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-ctrl') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      {
        prompt: 'animate',
        model: 'aihubmix-happyhorse-1.0-i2v',
        image_url: '/api/projects/project-1/files/link.png',
      },
      {
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        upstreamApiKey: 'ahm-byok-key',
        upstreamBaseUrl: 'https://aihubmix.com/v1',
        videoPollIntervalMs: 1,
      },
    );

    // Legitimate in-project symlink reference resolves and reaches the wire.
    expect(result.ok).toBe(true);
    expect(submitBody.input.media[0].type).toBe('first_frame');
    expect(submitBody.input.media[0].url).toMatch(/^data:image\/png;base64,/);
    expect(submitBody.input.media[0].url).toContain(insideB64);
  });

  it('control: missing image_url file falls back to the newest in-project image (no hard error)', async () => {
    // A real in-project PNG: the fallback target newestProjectImagePart should
    // pick up when the named reference is missing.
    const insideBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xaa, 0xbb, 0xcc]);
    const insideB64 = insideBytes.toString('base64');
    await writeFile(path.join(projectDir, 'inside.png'), insideBytes);

    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-missing' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-missing') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Stale image_url naming a file that does not exist inside the project: not
    // a boundary violation, so it must degrade to the pre-existing
    // newestProjectImagePart fallback instead of a hard ENOENT error.
    const result = await executeAIHubMixGenerateVideo(
      {
        prompt: 'animate',
        model: 'aihubmix-happyhorse-1.0-i2v',
        image_url: '/api/projects/project-1/files/missing.png',
      },
      {
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        upstreamApiKey: 'ahm-byok-key',
        upstreamBaseUrl: 'https://aihubmix.com/v1',
        videoPollIntervalMs: 1,
      },
    );

    expect(result.ok).toBe(true);
    expect(submitBody.input.media[0].type).toBe('first_frame');
    expect(submitBody.input.media[0].url).toMatch(/^data:image\/png;base64,/);
    expect(submitBody.input.media[0].url).toContain(insideB64);
  });

  it('control: rejects an oversized real project file as --image too large', async () => {
    await writeConfig({ providers: { minimax: {} } });
    await writeFile(path.join(projectDir, 'big.png'), Buffer.alloc(16 * 1024 * 1024 + 1, 0x42));
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      generateMedia(minimaxArgs({ image: './big.png' })),
    ).rejects.toThrow(/--image too large \(16777217 bytes; max 16777216\)/);
  });

  it('control: accepts a project symlink whose target is inside the project', async () => {
    await writeConfig({ providers: { minimax: {} } });
    const inside = path.join(projectDir, 'inside.png');
    await writeFile(inside, Buffer.from(PNG_BASE64, 'base64'));
    await symlink(inside, path.join(projectDir, 'link.png'));

    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.subject_reference).toEqual([{
        type: 'character',
        image_file: expect.stringMatching(/^data:image\/png;base64,/),
      }]);
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(minimaxArgs({ image: './link.png' }));
    expect(result.providerId).toBe('minimax');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('control: rejects a plainly-lexical outside path before any read', async () => {
    await writeConfig({ providers: { minimax: {} } });
    const outsideFile = path.join(root, 'outside-secret.png');
    await writeFile(outsideFile, Buffer.from(PNG_BASE64, 'base64'));
    // The dispatch must never reach fetch on a boundary violation.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia(minimaxArgs({ image: outsideFile })),
    ).rejects.toThrow(/outside the project directory/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
