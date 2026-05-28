/**
 * Coverage for `resolveModelForAgent` — the safety net that turns the
 * synthetic `'default'` / null model into a concrete fallback id for
 * adapters whose CLI cannot accept "default" (e.g. AMR / vela, which
 * requires an explicit `session/set_model` before `session/prompt` and
 * has no notion of a CLI-side saved default).
 *
 * The chat-run path in server.ts goes:
 *
 *   user/plugin model -> isKnownModel | sanitizeCustomModel -> resolveModelForAgent
 *
 * so the substitution kicks in even when a plugin or stored chat state
 * sends `model: 'default'` (or omits the field). Without this, AMR turns
 * fail in production with `session/set_model must be called before
 * session/prompt`.
 */

import { describe, expect, it } from 'vitest';

import {
  rememberLiveModels,
  resolveModelForAgent,
} from '../../src/runtimes/models.js';
import type { RuntimeAgentDef } from '../../src/runtimes/types.js';

function defWith(fallbackIds: string[]): RuntimeAgentDef {
  return {
    id: 'test',
    name: 'Test',
    bin: 'test',
    versionArgs: ['--version'],
    fallbackModels: fallbackIds.map((id) => ({ id, label: id })),
    buildArgs: () => [],
    streamFormat: 'acp-json-rpc',
  };
}

function defWithId(id: string, fallbackIds: string[]): RuntimeAgentDef {
  return {
    ...defWith(fallbackIds),
    id,
  };
}

describe('resolveModelForAgent', () => {
  it('substitutes the first concrete fallback when the resolved model is null and the def has no "default" option', () => {
    const def = defWith(['gpt-5.4-mini', 'gpt-5.4']);
    expect(resolveModelForAgent(def, null)).toBe('gpt-5.4-mini');
  });

  it('substitutes when the resolved model is the synthetic "default" id and the def omits "default"', () => {
    const def = defWith(['gpt-5.4-mini', 'gpt-5.4']);
    expect(resolveModelForAgent(def, 'default')).toBe('gpt-5.4-mini');
  });

  it('prefers the first remembered live model when the def cannot accept the synthetic default model', () => {
    const def = defWithId('live-default-test', []);
    rememberLiveModels(def.id, [
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ]);

    expect(resolveModelForAgent(def, null)).toBe('deepseek-v3.2');
    expect(resolveModelForAgent(def, 'default')).toBe('deepseek-v3.2');
  });

  it('keeps common default-capable defs untouched even when live models are remembered', () => {
    const def = defWithId('live-default-capable-test', ['default', 'sonnet']);
    rememberLiveModels(def.id, [
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
    ]);

    expect(resolveModelForAgent(def, null)).toBe(null);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('leaves the resolved model alone when the def lists "default" itself (the common case for hermes/devin/kimi)', () => {
    const def = defWith(['default', 'sonnet']);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
    expect(resolveModelForAgent(def, null)).toBe(null);
  });

  it('leaves real model ids untouched even when the def omits "default"', () => {
    const def = defWith(['gpt-5.4-mini']);
    expect(resolveModelForAgent(def, 'gpt-5.4')).toBe('gpt-5.4');
  });

  it('returns the original value when fallbackModels is empty (no substitution possible)', () => {
    const def = defWith([]);
    expect(resolveModelForAgent(def, null)).toBe(null);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('honors defaultModelEnvVar over the hardcoded fallback when the env var is set', () => {
    const def: RuntimeAgentDef = {
      ...defWith(['gpt-5.4-mini']),
      defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
    };
    expect(
      resolveModelForAgent(def, null, { VELA_DEFAULT_MODEL: 'gpt-5.5' }),
    ).toBe('gpt-5.5');
    expect(
      resolveModelForAgent(def, 'default', { VELA_DEFAULT_MODEL: 'gpt-5.5' }),
    ).toBe('gpt-5.5');
  });

  it('falls back to the static list when defaultModelEnvVar is set but the env var is empty / missing', () => {
    const def: RuntimeAgentDef = {
      ...defWith(['gpt-5.4-mini']),
      defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
    };
    expect(resolveModelForAgent(def, null, {})).toBe('gpt-5.4-mini');
    expect(
      resolveModelForAgent(def, null, { VELA_DEFAULT_MODEL: '   ' }),
    ).toBe('gpt-5.4-mini');
  });

  it('does NOT use the env override when the user already picked a real model', () => {
    const def: RuntimeAgentDef = {
      ...defWith(['gpt-5.4-mini']),
      defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
    };
    expect(
      resolveModelForAgent(def, 'gpt-5.4-fast', { VELA_DEFAULT_MODEL: 'gpt-5.5' }),
    ).toBe('gpt-5.4-fast');
  });
});
