// @vitest-environment jsdom

/**
 * Regression coverage for OPEND-2249 — "用户在项目会话中新建设计系统时，不应跳出会话，
 * 返回按钮应能回到原会话，避免任务中断".
 *
 * The `/design-systems/create` page is reachable from several surfaces: the
 * Design systems tab, the composer's design-system picker, the Library, a home
 * card — and, per the report, the project canvas' 新建设计体系 button while a
 * conversation is running. App.tsx wired the page's Back control to a fixed
 * `navigate({ kind: 'home', view: 'design-systems' })`, so whichever surface
 * opened the page, Back always dumped the user on the Design systems tab and
 * abandoned the conversation they were in the middle of.
 *
 * Back must step back to the surface that opened the page, and still land on
 * the Design systems tab when there is no in-app layer behind it.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { navigate } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
import { fetchDaemonConfig, loadConfig, mergeDaemonConfig } from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { fetchAmrModels, fetchVelaLoginStatus } from '../../src/providers/daemon';
import { listProjects, listTemplates } from '../../src/state/projects';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

// The real router is deliberately NOT mocked: this spec is about which history
// layer Back lands on, which only the real pushState/popstate bookkeeping can
// answer.

vi.mock('../../src/components/DesignSystemFlow', () => ({
  DesignSystemCreationFlow: ({ onBack }: { onBack: () => void }) => (
    <button type="button" data-testid="ds-create-back" onClick={onBack}>
      Back
    </button>
  ),
  DesignSystemDetailView: () => <div data-testid="ds-detail-view" />,
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div data-testid="entry-view">Entry view</div>,
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <div data-testid="project-view">Project view</div>,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('../../src/components/AmrArtifactUpgradeGate', () => ({
  AmrArtifactUpgradeGate: () => null,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>(
    '../../src/providers/daemon',
  );
  return {
    ...actual,
    fetchAmrModels: vi.fn(),
    fetchVelaLoginStatus: vi.fn(),
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
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchMediaProvidersFromDaemon: vi.fn().mockResolvedValue({ status: 'ok', providers: null }),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncMediaProvidersToDaemon: vi.fn().mockResolvedValue(undefined),
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

const project: Project = {
  id: 'project-1',
  name: 'Web Prototype',
  skillId: null,
  designSystemId: null,
  customInstructions: '',
  createdAt: 1,
  updatedAt: 1,
  workspaceId: null,
};

const CONVERSATION_PATH = '/projects/project-1/conversations/conversation-1';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function flushNavigation(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function openCreatePageAndGoBack(): Promise<void> {
  await act(async () => {
    navigate({ kind: 'design-system-create' });
  });
  await waitFor(() => expect(window.location.pathname).toBe('/design-systems/create'));
  const back = await screen.findByTestId('ds-create-back');
  fireEvent.click(back);
}

describe('design-system create page — Back destination', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    resetCoalescedGet();
    resetWorkspaceContextCache();
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgentsStream).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(listProjects).mockResolvedValue([project]);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(fetchDaemonConfig).mockResolvedValue({});
    vi.mocked(fetchAmrModels).mockResolvedValue({
      source: 'preset',
      refreshing: false,
      models: [],
    });
    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({
      loggedIn: false,
      loginInFlight: false,
      profile: 'prod',
      user: null,
      configPath: '/tmp/amr-config.json',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/workspace/directory')) {
          return jsonResponse(workspaceDirectoryFixture([]));
        }
        return jsonResponse({});
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    window.history.replaceState(null, '', '/');
  });

  it('returns to the project conversation the user opened it from', async () => {
    await act(async () => {
      navigate({
        kind: 'project',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        fileName: null,
      });
    });
    await flushNavigation();
    expect(window.location.pathname).toBe(CONVERSATION_PATH);

    render(<App />);
    await screen.findByTestId('project-view');

    await openCreatePageAndGoBack();

    // The conversation is mid-task; Back must put the user back in it rather
    // than dumping them on the Design systems tab.
    await waitFor(() => expect(window.location.pathname).toBe(CONVERSATION_PATH));
    await screen.findByTestId('project-view');
  });

  it('still returns to the Design systems tab for the standalone entry', async () => {
    await act(async () => {
      navigate({ kind: 'home', view: 'design-systems' });
    });
    await flushNavigation();
    expect(window.location.pathname).toBe('/design-systems');

    render(<App />);
    await screen.findByTestId('entry-view');

    await openCreatePageAndGoBack();

    await waitFor(() => expect(window.location.pathname).toBe('/design-systems'));
  });

  it('falls back to the Design systems tab when the page was deep-linked', async () => {
    window.history.replaceState(null, '', '/design-systems/create');

    render(<App />);
    const back = await screen.findByTestId('ds-create-back');
    fireEvent.click(back);

    await waitFor(() => expect(window.location.pathname).toBe('/design-systems'));
  });
});
