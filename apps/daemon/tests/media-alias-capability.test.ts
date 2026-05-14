/**
 * Regression coverage for the lefarcen + codex P2 on PR #1309: when a
 * user aliases a registered catalog id to a custom wire-name via
 * `OD_MEDIA_MODEL_ALIASES` or media-config.json's `aliases` map, the
 * dispatcher must still apply the model-FAMILY behaviour the catalog
 * id implies (DALL-E response_format, dall-e-3 hd quality,
 * gpt-4o-mini-tts instructions, etc.) and only swap the value that
 * goes into the provider's `body.model` field.
 *
 * The test stubs fetch and asserts on the request body for an
 * aliased dall-e-3 -> azure-custom-deployment call. Before the fix
 * ctx.model was overwritten with the alias, so the
 * `startsWith('dall-e-')` and `=== 'dall-e-3'` branches stopped
 * firing and the body was missing both response_format and the hd
 * quality flag — exactly the regression codex described.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';

describe('media alias preserves catalog-keyed capability branching (#1309 review)', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalEnvAliases = process.env.OD_MEDIA_MODEL_ALIASES;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-media-alias-cap-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OPENAI_API_KEY = 'sk-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    if (originalEnvAliases == null) {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
    } else {
      process.env.OD_MEDIA_MODEL_ALIASES = originalEnvAliases;
    }
    if (originalOpenAIKey == null) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
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

  async function writeStoredConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('alias dall-e-3 -> custom-deployment still sends dall-e-3 response_format + hd quality', async () => {
    await writeStoredConfig({
      providers: {},
      aliases: { 'dall-e-3': 'azure-dalle3-deployment' },
    });

    let capturedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'dall-e-3',
      prompt: 'A watercolor shiba inu under cherry blossoms',
      aspect: '1:1',
      output: 'aliased.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedBody).not.toBeNull();
    // Wire name swap landed — the provider receives the alias.
    expect(capturedBody!.model).toBe('azure-dalle3-deployment');
    // Capability branches keyed on the catalog id continue to fire.
    expect(capturedBody!.response_format).toBe('b64_json');
    expect(capturedBody!.quality).toBe('hd');
    // providerNote reflects what was actually sent, so a user
    // inspecting the result sees the wire name.
    expect(result.providerNote).toContain('azure-dalle3-deployment');
    expect(result.providerNote).not.toContain('dall-e-3');
  });

  it('alias gpt-4o-mini-tts -> custom-deployment still attaches style instructions', async () => {
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'gpt-4o-mini-tts': 'custom-tts-deployment',
    });

    let capturedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      // Speech endpoints return raw audio bytes, not JSON.
      return new Response(Buffer.from([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      audioKind: 'speech',
      model: 'gpt-4o-mini-tts',
      prompt: 'Hello there.',
      // gpt-4o-mini-tts accepts free-form speaking style in `voice`
      // when the value isn't a known OpenAI voice id. The dispatcher
      // routes that string into `body.instructions` ONLY when the
      // model branch fires.
      voice: 'warm and slow',
      output: 'aliased.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.model).toBe('custom-tts-deployment');
    // Capability branch keyed on the catalog id continues to fire
    // even though the wire-level model is the alias — the
    // gpt-4o-mini-tts-specific instructions field is still attached.
    expect(capturedBody!.instructions).toBe('warm and slow');
    expect(result.providerNote).toContain('custom-tts-deployment');
  });
});
