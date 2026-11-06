/**
 * Coverage for `resolveModelForAgent` — the safety net that turns the
 * null model into a concrete fallback id for adapters that need an
 * explicit model when the caller did not choose one.
 *
 * The chat-run path in server.ts goes:
 *
 *   user/plugin model -> isKnownModel | sanitizeCustomModel -> resolveModelForAgent
 *
 * Explicit `model: 'default'` is intentionally preserved: for ACP runtimes,
 * it means "do not send session/set_model; use the upstream default".
 */

import { describe, expect, it } from 'vitest';

import {
  getRememberedLiveModels,
  isKnownModel,
  preferFreshLiveModels,
  rememberLiveModels,
  resolveDefaultModelFromOptions,
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

  it('preserves an explicit synthetic "default" id even when the def omits "default"', () => {
    const def = defWith(['gpt-5.4-mini', 'gpt-5.4']);
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('prefers the first remembered live model when no model was selected', () => {
    const def = defWithId('live-default-test', []);
    rememberLiveModels(def.id, [
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ]);

    expect(resolveModelForAgent(def, null)).toBe('deepseek-v3.2');
    expect(resolveModelForAgent(def, 'default')).toBe('default');
    expect(getRememberedLiveModels(def.id)).toEqual([
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ]);
  });

  it('prefers an enabled default remembered model over a disabled first catalog entry', () => {
    const def = defWithId('amr-disabled-default-test', []);
    const models = [
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false },
      { id: 'enabled-default-model', label: 'Enabled default', enabled: true, default: true },
      { id: 'enabled-model', label: 'Enabled', enabled: true },
    ];
    rememberLiveModels(def.id, models);

    expect(resolveModelForAgent(def, null)).toBe('enabled-default-model');
    expect(resolveModelForAgent(def, 'default')).toBe('default');
    expect(isKnownModel(def, 'locked-upgrade-model')).toBe(true);
    expect(getRememberedLiveModels(def.id)).toEqual(models);
  });

  it('uses the first enabled remembered model when no enabled model is marked default', () => {
    const def = defWithId('amr-disabled-first-test', []);
    rememberLiveModels(def.id, [
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false },
      { id: 'enabled-model', label: 'Enabled', enabled: true },
    ]);

    expect(resolveModelForAgent(def, null)).toBe('enabled-model');
    expect(resolveModelForAgent(def, 'default')).toBe('default');
  });

  it('isolates remembered AMR live models by environment profile scope', () => {
    const def = defWithId('amr', []);
    rememberLiveModels(def.id, [
      { id: 'prod-model', label: 'prod-model' },
    ], 'prod');
    rememberLiveModels(def.id, [
      { id: 'test-model', label: 'test-model' },
    ], 'test');

    expect(getRememberedLiveModels(def.id, 'prod')).toEqual([
      { id: 'prod-model', label: 'prod-model' },
    ]);
    expect(getRememberedLiveModels(def.id, 'test')).toEqual([
      { id: 'test-model', label: 'test-model' },
    ]);
    expect(isKnownModel(def, 'prod-model', 'prod')).toBe(true);
    expect(isKnownModel(def, 'prod-model', 'test')).toBe(false);
    expect(resolveModelForAgent(def, null, {}, 'prod')).toBe('prod-model');
    expect(resolveModelForAgent(def, null, {}, 'test')).toBe('test-model');
  });

  it('prefers remembered live models only when the fresh AMR catalog is empty', () => {
    const remembered = [
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ];
    const fresh = [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }];

    expect(preferFreshLiveModels(fresh, remembered)).toEqual(fresh);
    expect(preferFreshLiveModels([], remembered)).toEqual(remembered);
  });

  it('resolves fresh default candidates from enabled models only', () => {
    expect(resolveDefaultModelFromOptions([
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false, default: true },
      { id: 'enabled-default-model', label: 'Enabled default', enabled: true, default: true },
      { id: 'enabled-model', label: 'Enabled', enabled: true },
    ])).toBe('enabled-default-model');
    expect(resolveDefaultModelFromOptions([
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false },
      { id: 'enabled-model', label: 'Enabled' },
    ])).toBe('enabled-model');
    expect(resolveDefaultModelFromOptions([
      { id: 'locked-upgrade-model', label: 'Locked', enabled: false, default: true },
    ])).toBeNull();
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

  it('honors defaultModelEnvVar over the hardcoded fallback when no model is set', () => {
    const def: RuntimeAgentDef = {
      ...defWith(['gpt-5.4-mini']),
      defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
    };
    expect(
      resolveModelForAgent(def, null, { VELA_DEFAULT_MODEL: 'gpt-5.5' }),
    ).toBe('gpt-5.5');
    expect(
      resolveModelForAgent(def, 'default', { VELA_DEFAULT_MODEL: 'gpt-5.5' }),
    ).toBe('default');
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
