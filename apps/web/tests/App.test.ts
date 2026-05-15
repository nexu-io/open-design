import { describe, expect, it, vi } from 'vitest';

import {
  buildPersistedConfig,
  isAutosaveDraftOnlyChange,
  persistComposioConfigChange,
  resolveBackNavigation,
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

describe('resolveBackNavigation (issue #1789)', () => {
  // The in-app Back chevron used to push `{ kind: 'home', view: 'home' }`
  // unconditionally, which (a) ignored the actual history stack and (b)
  // hardcoded the Home tab even when the user entered the project from
  // /projects, /design-systems, /tasks, etc. The helper now decides
  // between popping browser history and a hard navigation fallback so
  // both behaviors stay covered as the entry surfaces grow.

  it('pops browser history when a prior in-app entry exists', () => {
    expect(
      resolveBackNavigation({ historyState: { od: 'project' }, historyLength: 4 }),
    ).toEqual({ action: 'pop' });
  });

  it('falls back to the home view on a fresh deep-link with no history', () => {
    expect(
      resolveBackNavigation({ historyState: null, historyLength: 1 }),
    ).toEqual({ action: 'navigate', route: { kind: 'home', view: 'home' } });
  });

  it('treats a history length of 1 with no state as a deep-link fallback', () => {
    // Some browsers report `length: 1` for the very first entry even when
    // navigated to programmatically; without a history state object there
    // is nothing to pop back to, so the fallback must fire.
    expect(
      resolveBackNavigation({ historyState: null, historyLength: 1 }).action,
    ).toBe('navigate');
  });

  it('prefers history.back() whenever a state object is present, even at length 1', () => {
    // SPAs that called pushState before the user clicked Back will have a
    // non-null state at the current entry — pop honors that real entry
    // rather than overwriting it with a fresh push to /.
    expect(
      resolveBackNavigation({ historyState: { od: 'home/projects' }, historyLength: 1 })
        .action,
    ).toBe('pop');
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
