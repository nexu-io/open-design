// @vitest-environment jsdom

// Regression guard for the reduced-motion gate on the motion/react layer.
//
// The CSS `@media (prefers-reduced-motion: reduce)` block only disables CSS
// keyframes/transitions; the dialogs, toasts and popovers that animate through
// motion/react need their own gate. `App` wraps the tree in
// `<MotionConfig reducedMotion="user">`, which makes motion honor the OS
// `prefers-reduced-motion` preference (transform/spring variants drop, opacity
// is kept). Real animation behavior can't be observed here because the test
// suite aliases `motion/react` to a stub, so this asserts the wiring contract:
// the App root mounts a MotionConfig configured with `reducedMotion="user"`.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig } from '../../src/types';
import {
  daemonIsLive,
  fetchAgents,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
} from '../../src/state/config';

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => ({ kind: 'home' as const, view: 'home' as const }),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div>Entry view</div>,
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <div>Project view</div>,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => <div role="dialog" aria-label="Settings dialog" />,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgents: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
  };
});

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

beforeEach(() => {
  vi.mocked(daemonIsLive).mockResolvedValue(true);
  vi.mocked(fetchAgents).mockResolvedValue([]);
  vi.mocked(fetchSkills).mockResolvedValue([]);
  vi.mocked(fetchDesignSystems).mockResolvedValue([]);
  vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
  vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
  vi.mocked(listProjects).mockResolvedValue([]);
  vi.mocked(listTemplates).mockResolvedValue([]);
  vi.mocked(fetchDaemonConfig).mockResolvedValue({});
  vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
  vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
  vi.mocked(saveConfig).mockImplementation(() => {});
  vi.mocked(syncConfigToDaemon).mockResolvedValue(undefined);
  vi.mocked(syncComposioConfigToDaemon).mockResolvedValue(true);
  vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('reduced-motion gate for the motion/react layer', () => {
  it('wraps the app in MotionConfig reducedMotion="user"', async () => {
    render(<App />);

    const config = await waitFor(() => screen.getByTestId('motion-config'));
    expect(config.getAttribute('data-reduced-motion')).toBe('user');
  });
});
