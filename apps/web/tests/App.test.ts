import { describe, expect, it, vi } from 'vitest';

import {
  buildPersistedConfig,
  isAutosaveDraftOnlyChange,
  persistComposioConfigChange,
  resolveSettingsCloseConfig,
  shouldSyncMediaProvidersOnSave,
} from '../src/App';
import type { AppConfig } from '../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('persistComposioConfigChange', () => {
  it('does not update local saved state when the daemon save fails', async () => {
    await expect(
      persistComposioConfigChange(
        baseConfig,
        { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        vi.fn(async () => false),
      ),
    ).rejects.toThrow('Composio config save failed');
  });

  it('normalizes the saved Composio key after a successful daemon save', async () => {
    await expect(
      persistComposioConfigChange(
        baseConfig,
        { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        vi.fn(async () => true),
      ),
    ).resolves.toMatchObject({
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '_key',
      },
    });
  });
});

describe('shouldSyncMediaProvidersOnSave', () => {
  it('keeps bootstrap-style empty media maps from syncing by default', () => {
    expect(shouldSyncMediaProvidersOnSave({})).toBe(false);
  });

  it('syncs an explicit empty media map when the user save should force a clear', () => {
    expect(shouldSyncMediaProvidersOnSave({}, { force: true })).toBe(true);
  });
});

describe('buildPersistedConfig', () => {
  it('preserves onboarding completion when a stale autosave snapshot says false', () => {
    expect(
      buildPersistedConfig(
        { ...baseConfig, onboardingCompleted: false },
        { ...baseConfig, onboardingCompleted: true },
      ),
    ).toMatchObject({ onboardingCompleted: true });
  });
});

describe('isAutosaveDraftOnlyChange', () => {
  const savedComposio: AppConfig = {
    ...baseConfig,
    composio: { apiKey: '', apiKeyConfigured: true, apiKeyTail: 'beef' },
  };

  it('treats an in-flight Composio API key edit as draft-only', () => {
    const typing: AppConfig = {
      ...savedComposio,
      composio: { ...savedComposio.composio, apiKey: '111' },
    };
    expect(isAutosaveDraftOnlyChange(typing, savedComposio)).toBe(true);
  });

  it('flags a real change (non-draft field) as persist-worthy', () => {
    const flipped: AppConfig = { ...savedComposio, model: 'claude-opus-4-7' };
    expect(isAutosaveDraftOnlyChange(flipped, savedComposio)).toBe(false);
  });

  it('flags apiKeyConfigured / tail flips as persist-worthy', () => {
    const cleared: AppConfig = {
      ...savedComposio,
      composio: { apiKey: '', apiKeyConfigured: false, apiKeyTail: '' },
    };
    expect(isAutosaveDraftOnlyChange(cleared, savedComposio)).toBe(false);
  });

  it('returns true for an identical snapshot (no-op autosave tick)', () => {
    expect(isAutosaveDraftOnlyChange(savedComposio, savedComposio)).toBe(true);
  });
});

describe('resolveSettingsCloseConfig', () => {
  it('marks onboarding complete without discarding the latest persisted draft', () => {
    expect(
      resolveSettingsCloseConfig(
        {
          ...baseConfig,
          onboardingCompleted: false,
          orbit: { enabled: false, time: '09:00', templateSkillId: 'stale-template' },
        },
        {
          ...baseConfig,
          onboardingCompleted: false,
          orbit: { enabled: true, time: '11:30', templateSkillId: 'fresh-template' },
        },
      ),
    ).toMatchObject({
      onboardingCompleted: true,
      orbit: { enabled: true, time: '11:30', templateSkillId: 'fresh-template' },
    });
  });
});
