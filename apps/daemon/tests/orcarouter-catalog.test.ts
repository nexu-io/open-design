// OrcaRouter model catalogue: capability filtering, fail-closed multimodal
// selection, and the degraded fallback.
//
// The rules under test are the ones that decide what a user can pick. A model
// that does not declare an image input must not appear in the image-attachment
// picker, a media-only route must not appear in the chat picker, and when the
// live catalogue is unreachable the picker must show an explicitly labelled
// verified seed rather than either an empty list or fabricated live rows.
//
// Fixtures mirror the real catalogue's shape (fields observed on
// GET https://api.orcarouter.ai/v1/models) so a parser regression is caught
// here rather than at the picker.

import { describe, expect, it, vi } from 'vitest';

import {
  ORCAROUTER_VERIFIED_SEED,
  fetchOrcaRouterCatalog,
  filterOrcaRouterModels,
  modelAcceptsModalities,
  normalizeOrcaRouterCatalogPage,
  orcaRouterCatalogUrl,
  orcaRouterSeedFor,
  orcaRouterSeedModelOptions,
  resolveOrcaRouterApiBase,
  resolveOrcaRouterAuthBase,
  toOrcaRouterModelOptions,
  type OrcaRouterCatalogModel,
} from '../src/integrations/orcarouter.js';

/** One catalogue row, shaped like the live payload. */
function row(
  id: string,
  endpointTypes: string[],
  inputModalities: string[] | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    object: 'model',
    owned_by: 'custom',
    supported_endpoint_types: endpointTypes,
    ...(inputModalities === null ? {} : { architecture: { input_modalities: inputModalities } }),
    ...extra,
  };
}

// The fixture set the campaign requires: text-only, image-input chat,
// embedding, image generation, video, rerank.
const TEXT_ONLY = row('vendor/text-only', ['openai'], ['text']);
const IMAGE_CHAT = row('vendor/image-chat', ['openai', 'anthropic'], ['text', 'image', 'file']);
const AUDIO_CHAT = row('vendor/audio-chat', ['openai'], ['text', 'audio', 'image', 'video']);
const NO_MODALITY_CHAT = row('vendor/undeclared', ['openai'], null);
const EMBEDDING = row('vendor/embed', ['embeddings'], ['text']);
const IMAGE_GEN = row('vendor/image-gen', ['image-generation'], ['text']);
const VIDEO_GEN = row('vendor/video-gen', ['openai-video'], ['text']);
const RERANK = row('vendor/rerank', ['jina-rerank'], ['text']);
// A row that claims a chat endpoint AND an image endpoint. It belongs to the
// image picker and must not leak into the chat picker.
const DUAL_TAGGED = row('vendor/dual', ['openai', 'image-generation'], ['text', 'image']);

const ALL_ROWS = [
  TEXT_ONLY, IMAGE_CHAT, AUDIO_CHAT, NO_MODALITY_CHAT,
  EMBEDDING, IMAGE_GEN, VIDEO_GEN, RERANK, DUAL_TAGGED,
];

function ids(models: readonly OrcaRouterCatalogModel[]): string[] {
  return models.map((m) => m.id);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OrcaRouter catalogue filtering', () => {
  const parsed = normalizeOrcaRouterCatalogPage({ data: ALL_ROWS });

  it('parses the catalogue envelope and keeps every well-formed row', () => {
    expect(ids(parsed)).toHaveLength(ALL_ROWS.length);
  });

  it('preserves the vendor/model namespace verbatim', () => {
    const withNamespace = normalizeOrcaRouterCatalogPage({
      data: [row('openai/gpt-5.5', ['openai'], ['text'])],
    });
    // Namespaced ids must survive untouched — no normalization, no stripping.
    expect(withNamespace[0]!.id).toBe('openai/gpt-5.5');
  });

  it('drops malformed rows instead of surfacing half-models', () => {
    const rows = normalizeOrcaRouterCatalogPage({
      data: [null, 'nope', { id: '' }, { id: '   ' }, { object: 'model' }, row('ok/model', ['openai'], ['text'])],
    });
    expect(ids(rows)).toEqual(['ok/model']);
  });

  it('tolerates a bare array as well as the enveloped form', () => {
    expect(ids(normalizeOrcaRouterCatalogPage(ALL_ROWS))).toHaveLength(ALL_ROWS.length);
  });

  it('chat: keeps text-capable routes and excludes the media-only ones', () => {
    const chat = filterOrcaRouterModels(parsed, 'chat');
    expect(ids(chat)).toContain('vendor/text-only');
    expect(ids(chat)).toContain('vendor/image-chat');
    // Fail closed on a model advertising no chat endpoint type.
    expect(ids(chat)).not.toContain('vendor/image-gen');
    expect(ids(chat)).not.toContain('vendor/video-gen');
    expect(ids(chat)).not.toContain('vendor/embed');
    expect(ids(chat)).not.toContain('vendor/rerank');
  });

  it('chat: a media-generation tag disqualifies a row even when it also claims openai', () => {
    const chat = filterOrcaRouterModels(parsed, 'chat');
    expect(ids(chat)).not.toContain('vendor/dual');
  });

  it('chat: a row that declares no modality at all is still a valid text route', () => {
    const chat = filterOrcaRouterModels(parsed, 'chat');
    expect(ids(chat)).toContain('vendor/undeclared');
  });

  it('multimodal: only models that explicitly declare the modality survive', () => {
    const vision = filterOrcaRouterModels(parsed, 'chat', ['image']);
    expect(ids(vision)).toContain('vendor/image-chat');
    expect(ids(vision)).toContain('vendor/audio-chat');
    // Fail closed: text-only and undeclared-modality rows are excluded.
    expect(ids(vision)).not.toContain('vendor/text-only');
    expect(ids(vision)).not.toContain('vendor/undeclared');
  });

  it('multimodal: audio and video requirements narrow further, and never widen', () => {
    expect(ids(filterOrcaRouterModels(parsed, 'chat', ['audio'])))
      .toEqual(['vendor/audio-chat']);
    expect(ids(filterOrcaRouterModels(parsed, 'chat', ['video'])))
      .toEqual(['vendor/audio-chat']);
    expect(ids(filterOrcaRouterModels(parsed, 'chat', ['image', 'audio', 'video'])))
      .toEqual(['vendor/audio-chat']);
  });

  it('embedding / image / video / rerank each match their own endpoint type', () => {
    expect(ids(filterOrcaRouterModels(parsed, 'embedding'))).toEqual(['vendor/embed']);
    expect(ids(filterOrcaRouterModels(parsed, 'image'))).toEqual(['vendor/image-gen', 'vendor/dual']);
    expect(ids(filterOrcaRouterModels(parsed, 'video'))).toEqual(['vendor/video-gen']);
    expect(ids(filterOrcaRouterModels(parsed, 'rerank'))).toEqual(['vendor/rerank']);
  });

  it('de-duplicates repeated ids', () => {
    const duplicated = normalizeOrcaRouterCatalogPage({
      data: [row('vendor/same', ['openai'], ['text']), row('vendor/same', ['openai'], ['text'])],
    });
    expect(ids(filterOrcaRouterModels(duplicated, 'chat'))).toEqual(['vendor/same']);
  });

  it('modelAcceptsModalities fails closed on a model with no declared modalities', () => {
    const [undeclared] = normalizeOrcaRouterCatalogPage({ data: [NO_MODALITY_CHAT] });
    expect(modelAcceptsModalities(undeclared!, ['image'])).toBe(false);
    // Nothing required means nothing to violate.
    expect(modelAcceptsModalities(undeclared!, [])).toBe(true);
  });
});

describe('OrcaRouter catalogue URL', () => {
  it('asks for the capability filter on the inference origin', () => {
    expect(orcaRouterCatalogUrl('https://api.orcarouter.ai/v1', 'chat'))
      .toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect(orcaRouterCatalogUrl('https://api.orcarouter.ai/v1', 'embedding'))
      .toBe('https://api.orcarouter.ai/v1/models?capability=embedding');
    expect(orcaRouterCatalogUrl('https://api.orcarouter.ai/v1', 'image'))
      .toBe('https://api.orcarouter.ai/v1/models?capability=image');
  });

  it('reads the unfiltered page for capabilities with no server-side filter', () => {
    expect(orcaRouterCatalogUrl('https://api.orcarouter.ai/v1', 'video'))
      .toBe('https://api.orcarouter.ai/v1/models');
    expect(orcaRouterCatalogUrl('https://api.orcarouter.ai/v1', 'rerank'))
      .toBe('https://api.orcarouter.ai/v1/models');
  });
});

describe('OrcaRouter origins', () => {
  it('defaults to the documented public origins', () => {
    expect(resolveOrcaRouterAuthBase({})).toBe('https://www.orcarouter.ai');
    expect(resolveOrcaRouterApiBase({})).toBe('https://api.orcarouter.ai/v1');
  });

  it('honours explicit per-origin overrides over the shared fallback', () => {
    expect(resolveOrcaRouterAuthBase({
      ORCA_BASE_URL: 'https://shared.example.com',
      ORCA_AUTH_BASE_URL: 'https://auth.example.com',
    })).toBe('https://auth.example.com');
    expect(resolveOrcaRouterApiBase({
      ORCA_BASE_URL: 'https://shared.example.com',
      ORCA_API_BASE_URL: 'https://api.example.com',
    })).toBe('https://api.example.com/v1');
  });

  it('uses the shared fallback for a single-origin self-hosted deployment', () => {
    expect(resolveOrcaRouterAuthBase({ ORCA_BASE_URL: 'https://one.example.com' }))
      .toBe('https://one.example.com');
    expect(resolveOrcaRouterApiBase({ ORCA_BASE_URL: 'https://one.example.com' }))
      .toBe('https://one.example.com/v1');
  });

  it('never derives one origin from the other', () => {
    // An auth override must not move the inference origin, and vice versa —
    // this is the mistake that sends credentials to the wrong host.
    expect(resolveOrcaRouterApiBase({ ORCA_AUTH_BASE_URL: 'https://auth.example.com' }))
      .toBe('https://api.orcarouter.ai/v1');
    expect(resolveOrcaRouterAuthBase({ ORCA_API_BASE_URL: 'https://api.example.com' }))
      .toBe('https://www.orcarouter.ai');
  });

  it('does not double up the /v1 segment on an API override', () => {
    expect(resolveOrcaRouterApiBase({ ORCA_API_BASE_URL: 'https://api.example.com/v1' }))
      .toBe('https://api.example.com/v1');
  });

  it('requires https for a remote origin and allows http only on loopback', () => {
    expect(() => resolveOrcaRouterApiBase({ ORCA_API_BASE_URL: 'http://api.example.com' }))
      .toThrow(/https/i);
    expect(resolveOrcaRouterApiBase({ ORCA_API_BASE_URL: 'http://127.0.0.1:8080' }))
      .toBe('http://127.0.0.1:8080/v1');
    expect(resolveOrcaRouterAuthBase({ ORCA_AUTH_BASE_URL: 'http://localhost:9000' }))
      .toBe('http://localhost:9000');
    expect(() => resolveOrcaRouterAuthBase({ ORCA_AUTH_BASE_URL: 'http://user:pw@x.example.com' }))
      .toThrow(/credentials/i);
  });
});

describe('OrcaRouter live discovery', () => {
  it('reads the catalogue with the caller-supplied key and returns filtered rows', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: ALL_ROWS }));
    const result = await fetchOrcaRouterCatalog({
      apiKey: 'sk-orca-fake', capability: 'chat', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.models.map((m) => m.id)).not.toContain('vendor/image-gen');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-orca-fake');
  });

  it('applies the multimodal filter when the caller requires one', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: ALL_ROWS }));
    const result = await fetchOrcaRouterCatalog({
      apiKey: 'sk-orca-fake', capability: 'chat', requiredModalities: ['image'],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.models.map((m) => m.id)).toEqual(['vendor/image-chat', 'vendor/audio-chat']);
  });

  it('bounds the item count so a huge catalogue cannot exhaust memory', async () => {
    const huge = Array.from({ length: 5000 }, (_, i) =>
      row(`vendor/m${i}`, ['openai'], ['text']));
    const fetchImpl = vi.fn(async () => jsonResponse({ data: huge }));
    const result = await fetchOrcaRouterCatalog({
      apiKey: 'k', capability: 'chat', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.models.length).toBeLessThanOrEqual(2000);
  });

  it('rejects an oversized response body', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(5 * 1024 * 1024), { status: 200 }));
    const result = await fetchOrcaRouterCatalog({
      apiKey: 'k', capability: 'chat', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.degradedReason).toMatch(/size bound/i);
  });

  it('reports transport and status failures instead of throwing', async () => {
    const unauthorized = vi.fn(async () => jsonResponse({ error: 'nope' }, 401));
    const bad = await fetchOrcaRouterCatalog({
      apiKey: 'k', capability: 'chat', fetchImpl: unauthorized as unknown as typeof fetch,
    });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(401);
    expect(bad.models).toEqual([]);

    const throwing = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const network = await fetchOrcaRouterCatalog({
      apiKey: 'k', capability: 'chat', fetchImpl: throwing as unknown as typeof fetch,
    });
    expect(network.ok).toBe(false);
    expect(network.degradedReason).toBeTruthy();

    const notJson = vi.fn(async () => new Response('<html>', { status: 200 }));
    const html = await fetchOrcaRouterCatalog({
      apiKey: 'k', capability: 'chat', fetchImpl: notJson as unknown as typeof fetch,
    });
    expect(html.ok).toBe(false);
    expect(html.degradedReason).toMatch(/not JSON/i);
  });

  it('redacts the key from a failure reason', async () => {
    const secret = 'sk-orca-redactmeplease0000000000000000';
    const throwing = vi.fn(async () => { throw new Error(`connect failed for ${secret}`); });
    const result = await fetchOrcaRouterCatalog({
      apiKey: secret, capability: 'chat', fetchImpl: throwing as unknown as typeof fetch,
    });
    expect(result.degradedReason).not.toContain(secret);
  });

  it('does not merge the seed into a successful live response', async () => {
    // A live catalogue that contains exactly one model must yield exactly that
    // model — mixing in unverified rows is how a picker offers models the
    // account cannot call.
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [row('vendor/only', ['openai'], ['text'])],
    }));
    const result = await fetchOrcaRouterCatalog({
      apiKey: 'k', capability: 'chat', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.models.map((m) => m.id)).toEqual(['vendor/only']);
    for (const seeded of ORCAROUTER_VERIFIED_SEED) {
      expect(result.models.map((m) => m.id)).not.toContain(seeded.id);
    }
  });
});

describe('OrcaRouter verified seed', () => {
  it('covers the documented cold-start set', () => {
    expect(ORCAROUTER_VERIFIED_SEED.map((m) => m.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-v4-pro',
      'orcarouter/auto',
    ]);
  });

  it('keeps the verified reasoning ladder on openai/gpt-5.5', () => {
    const gpt = ORCAROUTER_VERIFIED_SEED.find((m) => m.id === 'openai/gpt-5.5');
    expect(gpt?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('keeps input-modality metadata so live discovery does not narrow capabilities', () => {
    const gpt = ORCAROUTER_VERIFIED_SEED.find((m) => m.id === 'openai/gpt-5.5');
    expect(gpt?.inputModalities).toContain('image');
    const flash = ORCAROUTER_VERIFIED_SEED.find((m) => m.id === 'google/gemini-3.5-flash');
    expect(flash?.inputModalities).toEqual(expect.arrayContaining(['image', 'audio', 'video']));
    // And the text-only row stays text-only.
    const deepseek = ORCAROUTER_VERIFIED_SEED.find((m) => m.id === 'deepseek/deepseek-v4-pro');
    expect(deepseek?.inputModalities).toEqual(['text']);
  });

  it('is filtered by the same rules as live rows', () => {
    // Every seed row is a chat route...
    expect(orcaRouterSeedFor('chat')).toHaveLength(ORCAROUTER_VERIFIED_SEED.length);
    // ...but only the ones that declare an image input serve the vision picker.
    const vision = orcaRouterSeedFor('chat', ['image']).map((m) => m.id);
    expect(vision).toContain('openai/gpt-5.5');
    expect(vision).not.toContain('deepseek/deepseek-v4-pro');
    // And none of them pretend to be an image-generation route.
    expect(orcaRouterSeedFor('image')).toHaveLength(0);
  });

  it('projects onto the shared model-option shape the pickers consume', () => {
    const options = orcaRouterSeedModelOptions('chat');
    const gpt = options.find((o) => o.id === 'openai/gpt-5.5');
    expect(gpt?.reasoningOptions?.map((r) => r.id)).toEqual(['low', 'medium', 'high', 'xhigh']);
    // Metadata survives the projection; an option is not just an id.
    const opus = options.find((o) => o.id === 'anthropic/claude-opus-4.8');
    expect(opus?.metadata?.contextWindowTokens).toBe(1_000_000);
  });

  it('projects live rows with pricing and context window intact', () => {
    const richRow = row('vendor/text-only', ['openai'], ['text'], {
      context_length: 128000,
      pricing: { prompt_per_million: '3.5', completion_per_million: '12' },
    });
    const options = toOrcaRouterModelOptions(
      normalizeOrcaRouterCatalogPage({ data: [richRow] }),
      { data: [richRow] },
    );
    expect(options[0]!.metadata?.contextWindowTokens).toBe(128000);
    expect(options[0]!.inputPriceUsdPerMillion).toBe(3.5);
    expect(options[0]!.outputPriceUsdPerMillion).toBe(12);
  });

  it('does not invent pricing when the catalogue omits it', () => {
    const options = toOrcaRouterModelOptions(
      normalizeOrcaRouterCatalogPage({ data: [TEXT_ONLY] }),
      { data: [TEXT_ONLY] },
    );
    expect(options[0]!.inputPriceUsdPerMillion).toBeUndefined();
    expect(options[0]!.label).toBe('vendor/text-only');
  });
});
