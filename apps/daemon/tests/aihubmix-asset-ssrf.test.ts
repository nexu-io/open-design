import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertAndFetchExternalAsset } from '../src/connectionTest.js';
import {
  executeAIHubMixGenerateVideo,
  executeAIHubMixGenerateImage,
} from '../src/byok-tools.js';

// Regression guard for the BLOCKING SSRF reviews on PR #3583: every AIHubMix
// asset download (chat video / chat image / media image / media video) routes
// the upstream-controlled URL through `assertAndFetchExternalAsset`, which
// validates the literal host AND pins `redirect: 'error'`. Without the pinned
// redirect, a validated public URL could 302 the daemon into 169.254.169.254 /
// RFC1918 space (and leak our Bearer/APP-Code to the hop target). These tests
// lock both halves of that invariant.

describe('assertAndFetchExternalAsset', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
  });

  it('throws on a literal internal/metadata host and never reaches fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      assertAndFetchExternalAsset('http://169.254.169.254/latest/meta-data', {}),
    ).rejects.toThrow();
    // The host is rejected at validation time — the download is never issued.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pins redirect:"error" and overrides any caller-supplied redirect', async () => {
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: RequestInit) => new Response('ok', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // 8.8.8.8 is a public literal IP, so it passes the SSRF host guard without
    // a DNS round-trip (keeps the test hermetic).
    await assertAndFetchExternalAsset('http://8.8.8.8/asset.png', {
      // A caller mistakenly asking to follow redirects must be overridden.
      redirect: 'follow',
      headers: { 'x-test': '1' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.redirect).toBe('error');
    // Other caller init is preserved.
    expect(init.headers).toMatchObject({ 'x-test': '1' });
  });
});

describe('AIHubMix asset downloads pin redirect:"error"', () => {
  let root: string;
  let projectsRoot: string;
  const PROJECT_ID = 'test-project';
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-aihubmix-ssrf-'));
    projectsRoot = path.join(root, 'projects');
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  });

  const baseCtx = () => ({
    projectRoot: root,
    projectsRoot,
    projectId: PROJECT_ID,
    upstreamApiKey: 'ahm-byok-key',
    upstreamBaseUrl: 'https://aihubmix.com/v1',
    // Keep tests fast — 1 ms between polls instead of the production interval.
    videoPollIntervalMs: 1,
  });

  it('chat video download (executeAIHubMixGenerateVideo) sets redirect:"error"', async () => {
    const mp4Bytes = Buffer.from([0x00, 0x00, 0x00, 0x18]);
    let downloadInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'vid-ssrf' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/vid-ssrf') {
        return new Response(
          JSON.stringify({
            status: 'completed',
            video_url: 'https://cdn.example.test/video/done.mp4',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://cdn.example.test/video/done.mp4') {
        downloadInit = init;
        return new Response(mp4Bytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(true);
    expect(downloadInit?.redirect).toBe('error');
  });

  it('chat image download (executeAIHubMixGenerateImage) sets redirect:"error"', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    let downloadInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/images/generations') {
        return new Response(
          JSON.stringify({ data: [{ url: 'https://cdn.example.test/img/out.png' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://cdn.example.test/img/out.png') {
        downloadInit = init;
        return new Response(pngBytes, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Force an OpenAI-family model so the executor takes the /images/generations
    // + url-download branch (not the Gemini-native inline-bytes branch).
    const result = await executeAIHubMixGenerateImage(
      { prompt: 'a cat', model: 'aihubmix-gpt-image-1' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(downloadInit?.redirect).toBe('error');
  });
});
