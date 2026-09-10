// OrcaRouter provider registration across the BYOK surfaces.
//
// These are the "is it actually wired up" assertions. OrcaRouter must be a
// first-class named provider everywhere the UI enumerates protocols, and the
// two authentication entries must both exist — a single entry that sometimes
// asks for a key and sometimes opens a browser is the failure mode the spec
// calls out.

import { describe, expect, it } from 'vitest';

import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_LABELS,
  API_PROTOCOL_TABS,
  DEFAULT_BASE_URL_BY_PROTOCOL,
  FIXED_ORIGIN_GATEWAYS,
  SUGGESTED_MODELS_BY_PROTOCOL,
  isFixedOriginGateway,
  resolveFixedOriginBaseUrl,
} from '../../src/state/apiProtocols';
import { BYOK_PROVIDER_PRESETS, KNOWN_PROVIDERS } from '../../src/state/config';
import { API_PROTOCOL_AGENT_IDS } from '../../src/utils/byokProvider';
import { supportedModels } from '../../src/components/NewProjectPanel';
import { IMAGE_MODELS, VIDEO_MODELS } from '../../src/media/models';
import { isOpenAICompatible } from '../../src/providers/openai-compatible';

describe('OrcaRouter BYOK protocol registration', () => {
  it('appears as a selectable protocol tab', () => {
    const tab = API_PROTOCOL_TABS.find((entry) => entry.id === 'orcarouter');
    expect(tab).toBeDefined();
    expect(tab?.title).toBe('OrcaRouter');
  });

  it('has a display label, key placeholder, and default base URL in every map', () => {
    expect(API_PROTOCOL_LABELS.orcarouter).toBe('OrcaRouter');
    expect(API_KEY_PLACEHOLDERS.orcarouter).toBe('sk-orca-...');
    // The INFERENCE origin. Auth is a different host entirely.
    expect(DEFAULT_BASE_URL_BY_PROTOCOL.orcarouter).toBe('https://api.orcarouter.ai/v1');
  });

  it('pins inference to its canonical origin, whatever the field holds', () => {
    // OrcaRouter is a fixed-origin gateway: the second origin in this
    // integration is the AUTH host, and exposing a free-form base URL here is
    // exactly how a user ends up aiming inference at it. Self-hosting is done
    // through the daemon's ORCA_API_BASE_URL / ORCA_BASE_URL overrides, not by
    // typing a host into this form.
    expect(isFixedOriginGateway('orcarouter')).toBe(true);
    expect(FIXED_ORIGIN_GATEWAYS.has('orcarouter')).toBe(true);
    expect(resolveFixedOriginBaseUrl('orcarouter', '')).toBe('https://api.orcarouter.ai/v1');
    expect(resolveFixedOriginBaseUrl('orcarouter', 'https://stale.example.com/v1'))
      .toBe('https://api.orcarouter.ai/v1');
  });

  it('is registered as a known provider preset with the seed catalog', () => {
    const preset = KNOWN_PROVIDERS.find((entry) => entry.label === 'OrcaRouter');
    expect(preset?.protocol).toBe('orcarouter');
    expect(preset?.baseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(preset?.preferredModels).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-v4-pro',
      'orcarouter/auto',
    ]);
    // The console link is the page that also revokes issued keys.
    expect(preset?.apiKeyConsoleLink?.url).toContain('orcarouter.ai');
  });

  it('is offered as a BYOK quick-fill preset', () => {
    const byok = BYOK_PROVIDER_PRESETS.find((entry) => entry.id === 'orcarouter');
    expect(byok).toBeDefined();
    expect(byok?.protocol).toBe('orcarouter');
    expect(byok?.preferredModels.length).toBeGreaterThan(0);
  });

  it('has an agent identity for the assistant-message attribution path', () => {
    expect(API_PROTOCOL_AGENT_IDS.orcarouter).toBe('orcarouter-api');
  });

  it('is offered with the cold-start seed before any request is made', () => {
    // The static list is a fallback, never presented as the live catalogue — but
    // it must be non-empty so a first-run picker is usable during an outage.
    expect(SUGGESTED_MODELS_BY_PROTOCOL.orcarouter.length).toBeGreaterThan(0);
    expect(SUGGESTED_MODELS_BY_PROTOCOL.orcarouter).toContain('orcarouter/auto');
  });

  it('routes through the OpenAI-compatible adapter', () => {
    expect(isOpenAICompatible('orcarouter/auto', 'https://api.orcarouter.ai/v1')).toBe(true);
    expect(isOpenAICompatible('openai/gpt-5.5', 'https://api.orcarouter.ai/v1')).toBe(true);
  });
});

describe('OrcaRouter media surfaces', () => {
  it('is selectable in the New Project image picker', () => {
    // The regression the previous OrcaRouter PR shipped with: catalog entries
    // present but filtered out of the picker by a hard-coded provider set.
    const models = supportedModels('image', IMAGE_MODELS);
    expect(models.some((model) => model.provider === 'orcarouter')).toBe(true);
  });

  it('is selectable in the New Project video picker', () => {
    const models = supportedModels('video', VIDEO_MODELS);
    expect(models.some((model) => model.provider === 'orcarouter')).toBe(true);
  });

  it('offers catalogue-prefixed ids that the daemon can strip to a wire id', () => {
    const rows = IMAGE_MODELS.filter((model) => model.provider === 'orcarouter');
    expect(rows.length).toBeGreaterThan(0);
    for (const model of rows) expect(model.id.startsWith('orcarouter/')).toBe(true);
  });
});
