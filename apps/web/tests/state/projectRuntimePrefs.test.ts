import { describe, expect, it } from 'vitest';

import {
  applyProjectAgentChange,
  applyProjectAgentModelChange,
  applyProjectApiModelChange,
  applyProjectApiProtocolChange,
  applyProjectModeChange,
  applyProjectSwitchToCloud,
  ensureProjectMetadataRuntimePrefs,
  resolveProjectAppConfig,
  snapshotProjectRuntimePrefs,
} from '../../src/state/projectRuntimePrefs';
import type { AppConfig } from '../../src/types';

function createBaseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    apiKey: 'sk-ant-default',
    apiProtocol: 'anthropic',
    apiVersion: '2023-06-01',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    apiProtocolConfigs: {
      anthropic: {
        apiKey: 'sk-ant-default',
        apiVersion: '2023-06-01',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        apiProviderBaseUrl: 'https://api.anthropic.com',
      },
      openai: {
        apiKey: 'sk-openai-saved',
        apiVersion: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
      },
    },
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      codex: {
        model: 'gpt-5.4',
        reasoning: 'high',
        serviceTier: 'fast',
      },
      pi: {
        model: 'zai/glm-5.3-flash',
      },
    },
    agentCliEnv: {},
    ...overrides,
  };
}

describe('projectRuntimePrefs', () => {
  it('snapshots the active runtime selection without copying API secrets', () => {
    const config = createBaseConfig();
    const prefs = snapshotProjectRuntimePrefs(config);

    expect(prefs).toEqual({
      mode: 'daemon',
      agentId: 'codex',
      agentModels: {
        codex: {
          model: 'gpt-5.4',
          reasoning: 'high',
          serviceTier: 'fast',
        },
        pi: {
          model: 'zai/glm-5.3-flash',
        },
      },
      apiProtocol: 'anthropic',
      model: 'claude-sonnet-4-5',
    });
    expect('apiKey' in prefs).toBe(false);
  });

  it('keeps project A locked to codex even after global config changes to pi', () => {
    const initialGlobal = createBaseConfig();
    const projectAPrefs = snapshotProjectRuntimePrefs(initialGlobal);

    // Later, user switches global/another project to pi with a different model.
    const mutatedGlobal = createBaseConfig({
      agentId: 'pi',
      agentModels: {
        ...initialGlobal.agentModels,
        codex: {
          model: 'gpt-5.3-codex',
          reasoning: 'low',
        },
        pi: {
          model: 'zai/glm-5.3-flash',
          reasoning: 'medium',
        },
      },
    });

    const resolvedProjectA = resolveProjectAppConfig(mutatedGlobal, projectAPrefs);

    expect(resolvedProjectA.mode).toBe('daemon');
    expect(resolvedProjectA.agentId).toBe('codex');
    expect(resolvedProjectA.agentModels?.codex).toEqual({
      model: 'gpt-5.4',
      reasoning: 'high',
      serviceTier: 'fast',
    });
  });

  it('updates per-project agent, model, reasoning, and serviceTier independently', () => {
    const config = createBaseConfig();
    let prefs = snapshotProjectRuntimePrefs(config);

    prefs = applyProjectAgentChange(prefs, config, 'pi');
    prefs = applyProjectAgentModelChange(prefs, config, 'pi', {
      model: 'zai/glm-5.3-flash',
      reasoning: 'high',
      serviceTier: '',
    });

    const resolved = resolveProjectAppConfig(config, prefs);
    expect(resolved.agentId).toBe('pi');
    expect(resolved.agentModels?.pi).toEqual({
      model: 'zai/glm-5.3-flash',
      reasoning: 'high',
      serviceTier: '',
    });
    // Original codex prefs remain intact on the project
    expect(resolved.agentModels?.codex).toEqual({
      model: 'gpt-5.4',
      reasoning: 'high',
      serviceTier: 'fast',
    });
  });

  it('hydrates API protocol credentials from global apiProtocolConfigs when a project uses API mode', () => {
    const config = createBaseConfig();
    let prefs = snapshotProjectRuntimePrefs(config);

    prefs = applyProjectModeChange(prefs, config, 'api');
    prefs = applyProjectApiProtocolChange(prefs, config, 'openai');
    prefs = applyProjectApiModelChange(prefs, config, 'gpt-5-nano');

    const resolved = resolveProjectAppConfig(config, prefs);
    expect(resolved.mode).toBe('api');
    expect(resolved.apiProtocol).toBe('openai');
    expect(resolved.apiKey).toBe('sk-openai-saved');
    expect(resolved.baseUrl).toBe('https://api.openai.com/v1');
    expect(resolved.model).toBe('gpt-5-nano');
  });

  it('switches a project to cloud (daemon + amr) via applyProjectSwitchToCloud', () => {
    const config = createBaseConfig({ mode: 'api', agentId: 'codex' });
    const nextPrefs = applyProjectSwitchToCloud(undefined, config);
    const resolved = resolveProjectAppConfig(config, nextPrefs);

    expect(resolved.mode).toBe('daemon');
    expect(resolved.agentId).toBe('amr');
  });

  it('stamps runtimePrefs onto project metadata only when missing', () => {
    const config = createBaseConfig();
    const stamped = ensureProjectMetadataRuntimePrefs(
      { kind: 'prototype', fromTrustedPicker: true },
      config,
    );
    expect(stamped.fromTrustedPicker).toBe(true);
    expect(stamped.runtimePrefs?.agentId).toBe('codex');

    const existingPrefs = { mode: 'daemon' as const, agentId: 'pi' };
    const preserved = ensureProjectMetadataRuntimePrefs(
      { kind: 'prototype', runtimePrefs: existingPrefs },
      config,
    );
    expect(preserved.runtimePrefs).toBe(existingPrefs);
  });
});
