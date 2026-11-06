// @vitest-environment jsdom
// OPEND-3205 App-owned Cloud configuration receipt; real HTTP persistence.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { Route } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  fetchMediaProvidersFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgents,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';
import {
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';

const PROJECT_ROUTE: Route = {
  kind: 'project' as const,
  projectId: 'project-1',
  conversationId: null,
  fileName: null,
};
const useRouteMock = vi.fn<() => Route>(() => PROJECT_ROUTE);
const useProjectRouteWorkspaceContextMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

vi.mock('../../src/collab/useProjectRouteWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/collab/useProjectRouteWorkspaceContext')
  >();
  return {
    ...actual,
    useProjectRouteWorkspaceContext: useProjectRouteWorkspaceContextMock,
  };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div>Entry view</div>,
}));

vi.mock('../../src/components/ProjectView', () => ({
  // This seam isolates App's real configuration owner and real syncConfigToDaemon.
  // Until the new receipt callback is wired, exercise the exact existing pair of
  // App callbacks used by the old production Cloud action. Neither path stubs
  // persistence or supplies its own successful result.
  ProjectView: (props: {
    config: AppConfig;
    onModeChange: (mode: AppConfig['mode']) => void;
    onAgentChange: (agentId: string) => void;
    onSwitchToCloud?: () => Promise<void>;
  }) => {
    const [receipt, setReceipt] = useState('idle');
    return <>
      <output data-testid="configuration">{props.config.mode}:{props.config.agentId}</output>
      <output data-testid="receipt">{receipt}</output>
      <button onClick={() => props.onAgentChange('claude')}>Select another local agent</button>
      <button onClick={async () => {
        setReceipt('pending');
        try {
          if (props.onSwitchToCloud) await props.onSwitchToCloud();
          else {
            props.onModeChange('daemon');
            await props.onAgentChange('amr');
          }
          setReceipt('success');
        } catch {
          setReceipt('error');
        }
      }}>Request Cloud configuration</button>
    </>;
  },
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  openWorkspaceTab: vi.fn(),
  WorkspaceTabsBar: () => null,
}));

vi.mock('../../src/components/MemoryToast', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/MemoryToast')>(
    '../../src/components/MemoryToast',
  );
  return {
    ...actual,
    MemoryToast: () => null,
  };
});

vi.mock('../../src/components/PrivacyConsentModal', () => ({
  PrivacyConsentModal: () => null,
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
    fetchDesignTemplates: vi.fn(),
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
    fetchComposioConfigFromDaemon: vi.fn(),
    fetchDaemonConfig: vi.fn(),
    fetchMediaProvidersFromDaemon: vi.fn(),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(actual.saveConfig),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
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
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
  privacyDecisionAt: 1778244000000,
};

const project: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: null,
  designSystemId: null,
  customInstructions: '',
  createdAt: 1,
  updatedAt: 1,
  workspaceId: 'ws-project',
};

const PROJECT_DIRECTORY_ITEM: WorkspaceDirectoryItem = {
  workspaceId: 'ws-project',
  workspaceMemberId: 'wm-project',
  workspaceName: 'Project Workspace',
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const AMBIENT_DIRECTORY_ITEM: WorkspaceDirectoryItem = {
  workspaceId: 'ws-ambient',
  workspaceMemberId: 'wm-ambient',
  workspaceName: 'Ambient Workspace',
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const PROJECT_WORKSPACE_CONTEXT: WorkspaceCollabContext = {
  ...PROJECT_DIRECTORY_ITEM,
  displayName: 'Project Nova',
  billingState: 'active',
  planId: 'pro',
  providerMode: 'platform_credits',
  seatSummary: {
    seatLimit: 0,
    usedSeats: 0,
    availableSeats: 0,
    isSeatFull: false,
  },
  permissions: {
    canManageMembers: false,
    canManageBilling: true,
    canInviteMembers: false,
    canManageAutoRecharge: true,
    canShareProjects: false,
    canWriteSyncedFiles: false,
    canViewWorkspaceSettings: false,
    canManageSharedResources: false,
  },
  workspaceSettingsUrl: 'https://cloud.example/settings?workspaceId=ws-project',
};

const AMBIENT_WORKSPACE_CONTEXT: WorkspaceCollabContext = {
  ...PROJECT_WORKSPACE_CONTEXT,
  ...AMBIENT_DIRECTORY_ITEM,
  displayName: 'Ambient Bea',
  workspaceSettingsUrl: 'https://cloud.example/settings?workspaceId=ws-ambient',
};

const PROJECT_BILLING_RESPONSE = {
  summary: {
    workspaceId: 'ws-project',
    membershipTier: 'pro',
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '12.34',
    subscriptionStatus: 'active',
    availableActions: [],
  },
  workspaceBalance: {
    billingScopeVersion: 2,
    workspaceId: 'ws-project',
    workspaceMemberId: 'wm-project',
    balanceUsd: '12.34',
  },
};

const AMBIENT_BILLING_RESPONSE = {
  ...PROJECT_BILLING_RESPONSE,
  summary: {
    ...PROJECT_BILLING_RESPONSE.summary,
    workspaceId: 'ws-ambient',
    balanceUsd: '98.76',
  },
  workspaceBalance: {
    ...PROJECT_BILLING_RESPONSE.workspaceBalance,
    workspaceId: 'ws-ambient',
    workspaceMemberId: 'wm-ambient',
    balanceUsd: '98.76',
  },
};

function stubFetchByUrl() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = url.includes('/api/workspace/directory')
        ? { items: [PROJECT_DIRECTORY_ITEM, AMBIENT_DIRECTORY_ITEM] }
        : url.includes('/api/workspace/context')
          ? { context: AMBIENT_WORKSPACE_CONTEXT }
          : url.includes('/api/workspace/billing')
            ? url.includes('workspaceId=ws-project')
              ? PROJECT_BILLING_RESPONSE
              : AMBIENT_BILLING_RESPONSE
            : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

function controlledResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('App OPEND-3205 Cloud persistence receipt', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetWorkspaceDirectoryCache();
    useRouteMock.mockReturnValue(PROJECT_ROUTE);
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgents).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(listProjects).mockResolvedValue([project]);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(fetchDaemonConfig).mockResolvedValue({});
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
    vi.mocked(fetchMediaProvidersFromDaemon).mockResolvedValue({ status: 'ok', providers: {} });
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: PROJECT_WORKSPACE_CONTEXT,
      loading: false,
      retry: vi.fn(),
    });
    stubFetchByUrl();
    window.history.replaceState(null, '', '/projects/project-1');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetWorkspaceDirectoryCache();
  });


  it.each([['successful persistence', 200], ['rejected persistence', 503]] as const)(
    'does not acknowledge or select Cloud before %s completes', async (_label, status) => {
      render(<App />);
      const button = await screen.findByRole('button', { name: 'Request Cloud configuration' });
      expect(screen.getByTestId('configuration')).toHaveTextContent('api:codex');
      const response = controlledResponse();
      const existingFetch = globalThis.fetch;
      const requests: RequestInit[] = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url === '/api/app-config' && init?.method === 'PUT') {
          requests.push(init);
          return response.promise;
        }
        return existingFetch(input, init);
      }));
      vi.mocked(saveConfig).mockClear();
      try {
        await act(async () => { fireEvent.click(button); });
        await waitFor(() => expect(requests).toHaveLength(1));
        expect(JSON.parse(String(requests[0]!.body))).toEqual(expect.objectContaining({ agentId: 'amr' }));
        expect(screen.getByTestId('configuration')).toHaveTextContent('api:codex');
        expect(screen.getByTestId('receipt')).toHaveTextContent('pending');
        expect(vi.mocked(saveConfig).mock.calls.some(([config]) => config.agentId === 'amr')).toBe(false);

        await act(async () => { response.resolve(new Response('{}', { status })); });
        await waitFor(() => expect(screen.getByTestId('receipt')).toHaveTextContent(status === 200 ? 'success' : 'error'));
        expect(screen.getByTestId('configuration')).toHaveTextContent(status === 200 ? 'daemon:amr' : 'api:codex');
        expect(vi.mocked(saveConfig).mock.calls.some(([config]) => config.agentId === 'amr' && config.mode === 'daemon')).toBe(status === 200);
        expect(requests).toHaveLength(1);
      } finally {
        // Resolve even when the baseline's optimistic update fails first.
        await act(async () => { response.resolve(new Response('{}', { status })); });
      }
    },
  );
  it('keeps the previous local mode after a real localStorage failure', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: 'Request Cloud configuration' });
    expect(screen.getByTestId('configuration')).toHaveTextContent('api:codex');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    storageWrite.mockImplementationOnce(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    try {
      await act(async () => { fireEvent.click(button); });
      await waitFor(() => expect(screen.getByTestId('receipt')).toHaveTextContent('error'));
      expect(screen.getByTestId('configuration')).toHaveTextContent('api:codex');
      // The next normal App-owned selection must not inherit the rejected
      // Cloud mode from a prematurely updated latestPersistedConfigRef.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Select another local agent' }));
      });
      expect(screen.getByTestId('configuration')).toHaveTextContent('api:claude');
    } finally {
      storageWrite.mockRestore();
    }
  });

});
