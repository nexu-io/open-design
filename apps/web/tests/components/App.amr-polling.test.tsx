// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { navigate, type Route } from '../../src/router';
import type { AppConfig } from '../../src/types';
import { loadConfig, mergeDaemonConfig, fetchDaemonConfig } from '../../src/state/config';
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
import {
  issueStatusObservation,
  stampStatusObservation,
} from '../../src/providers/status-observation';
import { AMR_LOGIN_STATUS_EVENT } from '../../src/components/amrLoginPolling';
import {
  adoptableSnapshot,
  currentAuthoritativeLoggedIn,
  noteAuthoritativeAuthMode,
  publishSnapshot,
  resetMessageCenterSnapshot,
} from '../../src/components/message-center-snapshot';
import { currentWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';

// Settings is now a full-page route (`/settings`): App.openSettings navigates
// instead of toggling a modal flag, so the router mock must feed navigate()
// calls back into useRoute() (like the production useSyncExternalStore router)
// for the settings surface to render at all.
const homeRouteMock = { kind: 'home' as const, view: 'home' as const };
const routeListeners = new Set<() => void>();
const useRouteMock = vi.fn<() => Route>(() => homeRouteMock);

vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>('../../src/router');
  return {
    ...actual,
    navigate: vi.fn((route: unknown) => {
      useRouteMock.mockReturnValue(route as never);
      routeListeners.forEach((notify) => notify());
    }),
    useRoute: () =>
      useSyncExternalStore(
        (onChange) => {
          routeListeners.add(onChange);
          return () => routeListeners.delete(onChange);
        },
        useRouteMock,
      ),
  };
});

// The entry shell reads AMR status on its own (landing read, login poll) and
// hands what it gets to `onAmrLoginStatusChange`. Exposed here so a spec can
// push a status up the same way a child surface does.
let mockChildStatus: unknown = null;

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    agents,
    config,
    onOpenSettings,
    onAmrLoginStatusChange,
  }: {
    agents: Array<{ id: string; models?: Array<{ id: string }>; authStatus?: string }>;
    config: AppConfig;
    onOpenSettings: () => void;
    onAmrLoginStatusChange?: (status: unknown) => void;
  }) => (
    <>
      <div data-testid="amr-model">
        {agents.find((agent) => agent.id === 'amr')?.models?.[0]?.id ?? 'none'}
      </div>
      <div data-testid="config-amr-model">
        {config.agentModels?.amr?.model ?? 'none'}
      </div>
      <div data-testid="amr-profile">
        {config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE ?? 'none'}
      </div>
      <div data-testid="codex-auth">
        {agents.find((agent) => agent.id === 'codex')?.authStatus ?? 'none'}
      </div>
      <button onClick={() => onOpenSettings()}>open settings</button>
      <button
        data-testid="push-child-status"
        onClick={() => { if (mockChildStatus) onAmrLoginStatusChange?.(mockChildStatus); }}
      >
        push child status
      </button>
    </>
  ),
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
  SettingsDialog: ({
    onRefreshAgents,
    onAmrLoginStatusChange,
    onClose,
  }: {
    onRefreshAgents: (options?: { agentCliEnv?: AppConfig['agentCliEnv'] }) => void | Promise<void>;
    onAmrLoginStatusChange?: (status: {
      loggedIn: boolean;
      loginInFlight?: boolean;
      profile: string;
      user: null;
      configPath: string;
    } | null) => void;
    onClose: () => void;
  }) => (
    <>
      <button
        onClick={() =>
          void onRefreshAgents({
            agentCliEnv: {
              amr: { VELA_PROFILE: 'next-profile' },
            },
          })}
      >
        rescan agents
      </button>
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('od:amr-login-status-change'));
          onAmrLoginStatusChange?.({
            loggedIn: true,
            profile: 'default',
            user: null,
            configPath: '/tmp/amr-config.json',
          });
        }}
      >
        mark amr signed in
      </button>
      <button onClick={onClose}>close settings</button>
    </>
  ),
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
    fetchMediaProvidersFromDaemon: vi.fn().mockResolvedValue({
      status: 'ok',
      providers: null,
    }),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncMediaProvidersToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedFetchAmrModels = vi.mocked(fetchAmrModels);
const mockedFetchVelaLoginStatus = vi.mocked(fetchVelaLoginStatus);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
const mockedNavigate = vi.mocked(navigate);

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function advanceTestClock(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('App AMR polling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useRouteMock.mockReturnValue(homeRouteMock);
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        version: '1.0.0',
        models: [],
      },
    ]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedFetchVelaLoginStatus.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedFetchDaemonConfig.mockResolvedValue({});
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'remote-a', label: 'remote-a' }],
      });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('leaves the sign-in boundary to the surfaces that own it', async () => {
    // Every shipped sign-in owner already calls `notifyWorkspaceContextRefresh`
    // — `CloudSignInTip.finishSignedIn`, `EntryShell.pollAmrLoginCompletion` and
    // its onboarding helper, `AmrLoginPill`. Announcing the boundary here as
    // well advances the generation TWICE for one login and dispatches two
    // differently keyed refreshes, so a subscriber like the message centre
    // clears and resyncs twice — the duplicate work this PR exists to remove.
    //
    // Signing in and signing out are covered without this branch anyway: both
    // move the authoritative auth mode, and the message centre subscribes to
    // that. The case nothing covers is account -> account, where the auth mode
    // is true on both sides, and that is the only case this branch is for.
    resetMessageCenterSnapshot();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    const signedOut = { loggedIn: false, loginInFlight: false, profile: 'local' };
    const signedIn = {
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'account-a', email: 'a@example.com' },
      configPath: '/tmp/amr-config.json',
    };
    let current: unknown = signedOut;
    mockedFetchVelaLoginStatus.mockImplementation(async () => (
      stampStatusObservation({ ...(current as object) }, issueStatusObservation()) as never
    ));

    render(<App />);
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(false));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const generationWhileSignedOut = currentWorkspaceAccountGeneration();

    current = signedIn;
    await act(async () => {
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(true));

    expect(currentWorkspaceAccountGeneration()).toBe(generationWhileSignedOut);
  });

  it('retires the previous account\'s message-centre cache on a direct account switch', async () => {
    // A signed-in account A -> signed-in account B switch is a supported shape:
    // `deriveTabIdentityScope` identifies the account by `user.id`, then email,
    // then profile, precisely so a tab can be reset across one. It happens with
    // no sign-out — a `vela login` in a terminal is enough — so `loggedIn` is
    // true on both sides of it.
    //
    // Nothing fired the account boundary for that. The workspace generation
    // moves on sign-in, sign-out and a profile switch only, and the authority
    // this PR publishes is a boolean, so neither noticed. Everything the
    // message centre partitions by that boundary — the settled snapshot, a
    // joinable in-flight run, the mounted rows, a stale continuation — stayed
    // eligible, and a remount inside the 10s window could show account A's
    // targeted rows, unread badge and announcement under account B.
    resetMessageCenterSnapshot();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    const accountA = {
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'account-a', email: 'a@example.com' },
      configPath: '/tmp/amr-config.json',
    };
    const accountB = { ...accountA, user: { id: 'account-b', email: 'b@example.com' } };
    let current: unknown = accountA;
    mockedFetchVelaLoginStatus.mockImplementation(async () => (
      stampStatusObservation({ ...(current as object) }, issueStatusObservation()) as never
    ));

    render(<App />);
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

    // Account A's rows land in the shared cache.
    publishSnapshot({
      at: Date.now(),
      accountGeneration: currentWorkspaceAccountGeneration(),
      locale: 'zh-CN',
      loggedIn: true,
      messages: [],
      readIds: new Set(['account-a-row']),
      pendingReadIds: new Set(),
    });
    expect(adoptableSnapshot('zh-CN')).not.toBeNull();

    // The credential switches to account B. Still signed in throughout.
    current = accountB;
    await act(async () => {
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(adoptableSnapshot('zh-CN')).toBeNull();
  });

  it('retires the previous account\'s cache when an identity-less credential switches account', async () => {
    // Same boundary as the sibling above, on the shape that carries no identity
    // to compare. An env-backed session is authenticated with `user: null`, so
    // both sides of a switch that only rewrites the Settings-backed env derive
    // the same profile — and the profile is a CLI environment, not an account.
    // The credential digest is what separates them, which is the reason the
    // daemon returns it.
    resetMessageCenterSnapshot();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    const envAccountA = {
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: null,
      credentialRevision: 'revision-a',
      configPath: '/tmp/amr-config.json',
    };
    const envAccountB = { ...envAccountA, credentialRevision: 'revision-b' };
    let current: unknown = envAccountA;
    mockedFetchVelaLoginStatus.mockImplementation(async () => (
      stampStatusObservation({ ...(current as object) }, issueStatusObservation()) as never
    ));

    render(<App />);
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

    publishSnapshot({
      at: Date.now(),
      accountGeneration: currentWorkspaceAccountGeneration(),
      locale: 'zh-CN',
      loggedIn: true,
      messages: [],
      readIds: new Set(['env-account-a-row']),
      pendingReadIds: new Set(),
    });
    expect(adoptableSnapshot('zh-CN')).not.toBeNull();

    current = envAccountB;
    await act(async () => {
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(adoptableSnapshot('zh-CN')).toBeNull();
  });

  it('keeps the authoritative auth mode signed out when the message centre observed the end first', async () => {
    // `applyAmrLoginStatus` is not the only publisher of the authority:
    // `MessageCenter.sync` reads the auth mode itself and publishes what it got.
    // Ordering the two publishers separately does not order them against EACH
    // OTHER — a stamped app request issued while signed in could still land
    // after the message centre had already observed and published the end of
    // the session, and take the authority back to signed-in.
    resetMessageCenterSnapshot();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    const signedIn = {
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'user-1', email: 'user-1@example.com' },
      configPath: '/tmp/amr-config.json',
    };
    let releaseStale: (() => void) | null = null;
    let holdNext = false;
    let call = 0;
    // Held by flag rather than by call index: settling the app issues several
    // status reads of its own, and holding one of those means holding a request
    // from an effect instance that has already been cancelled — which drops the
    // response for a reason that has nothing to do with ordering.
    mockedFetchVelaLoginStatus.mockImplementation(async () => {
      call += 1;
      const observation = issueStatusObservation();
      if (holdNext) {
        holdNext = false;
        await new Promise<void>((resolve) => { releaseStale = resolve; });
      }
      return stampStatusObservation({ ...signedIn }, observation) as never;
    });

    render(<App />);
    // Settle first: `daemonLive` flipping re-runs the effect, and its
    // `cancelled` flag would drop the held response for a reason that has
    // nothing to do with ordering.
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

    // The latest app request goes out while the session is still valid, and is
    // held. Nothing app-side is issued after it, so only the message centre's
    // publication is newer.
    const callsBeforeHold = call;
    holdNext = true;
    await act(async () => {
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(releaseStale).not.toBeNull();
    expect(call).toBe(callsBeforeHold + 1);

    // The message centre reads the auth mode and publishes the end of the
    // session — this is exactly the call `MessageCenter.sync` makes.
    noteAuthoritativeAuthMode(false, issueStatusObservation());
    expect(currentAuthoritativeLoggedIn()).toBe(false);

    // The older app request finally answers signed-in.
    await act(async () => {
      releaseStale!();
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(currentAuthoritativeLoggedIn()).toBe(false);
  });

  it('keeps the authoritative auth mode signed out when a child surface pushes an older status', async () => {
    // The entry shell and the settings card read status on their own and hand
    // what they get to `onAmrLoginStatusChange`, bypassing anything the app
    // effect does to order its OWN reads. A child read issued while signed in
    // can therefore be pushed up after the app has already accepted a newer
    // signed-out answer, flipping the authority back and re-authorising the
    // message-centre pull the sign-out was meant to refuse.
    //
    // Which is why the order is taken where the request is issued and checked
    // where it is published, rather than per reader: a future reader only has
    // to hand the status on.
    resetMessageCenterSnapshot();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    // Issued FIRST — while the session was still valid — and held by the child.
    const childObservation = issueStatusObservation();
    mockChildStatus = stampStatusObservation({
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'user-1', email: 'user-1@example.com' },
      configPath: '/tmp/amr-config.json',
    }, childObservation);

    // Issued second, and applied: the session has ended.
    mockedFetchVelaLoginStatus.mockImplementation(async () => {
      const observation = issueStatusObservation();
      return stampStatusObservation(
        { loggedIn: false, loginInFlight: false, profile: 'local' },
        observation,
      ) as never;
    });

    render(<App />);
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(false));

    // The child finally pushes what it read before the sign-out.
    await act(async () => {
      fireEvent.click(screen.getByTestId('push-child-status'));
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(currentAuthoritativeLoggedIn()).toBe(false);
    mockChildStatus = null;
  });

  it('keeps the authoritative auth mode signed out when an older signed-in status resolves last', async () => {
    // The status effect starts overlapping `fetchVelaLoginStatus()` calls — the
    // initial run, the login-status event, focus and visibility all call the
    // same `sync` — and until now only unmount could stop a response from being
    // applied. So an older signed-in response could land after a newer
    // signed-out one and re-publish `signed-in` as authoritative.
    //
    // That matters because the message centre now treats this value as the
    // truth about the session: a pull answered before the sign-out is rejected
    // by comparing against it, and flipping it back re-authorises exactly the
    // pull that was meant to be refused. The producer has to be ordered for the
    // consumer's guard to mean anything.
    resetMessageCenterSnapshot();
    // `clearAllMocks` does not drain a `mockResolvedValueOnce` queue, so a spec
    // that leaves entries behind shifts the next one's catalog. This spec has
    // no interest in the model poll: give it one stable answer instead.
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });
    const signedIn = {
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'user-1', email: 'user-1@example.com' },
      configPath: '/tmp/amr-config.json',
    };
    const signedOut = { loggedIn: false, loginInFlight: false, profile: 'local' };

    let releaseStale: (() => void) | null = null;
    let call = 0;
    // The mock stands in for the provider, so it takes the issue order the
    // provider takes — before the await, which is the whole point of the order.
    mockedFetchVelaLoginStatus.mockImplementation(async () => {
      call += 1;
      const observation = issueStatusObservation();
      if (call === 2) {
        // Issued before the sign-out is observed; answered after it.
        await new Promise<void>((resolve) => { releaseStale = resolve; });
        return stampStatusObservation({ ...signedIn }, observation) as never;
      }
      if (call >= 3) return stampStatusObservation({ ...signedOut }, observation) as never;
      return stampStatusObservation({ ...signedIn }, observation) as never;
    });

    render(<App />);
    // Let the app settle so the remaining calls come from ONE effect instance —
    // `daemonLive` flipping re-runs it, and its `cancelled` flag would drop the
    // held response for reasons that have nothing to do with ordering.
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

    // A status request goes out and is held on the wire.
    await act(async () => {
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(releaseStale).not.toBeNull();

    // A newer one goes out and answers signed-out.
    await act(async () => {
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(currentAuthoritativeLoggedIn()).toBe(false));

    // The older request finally answers signed-in.
    await act(async () => {
      releaseStale!();
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(currentAuthoritativeLoggedIn()).toBe(false);
  });

  it('keeps polling AMR models until the remote catalog replaces the preset list', async () => {
    vi.useFakeTimers();
    render(<App />);

    await advanceTestClock(0);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);

    await advanceTestClock(1_999);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    await advanceTestClock(1);

    expect(screen.getByTestId('amr-model').textContent).toBe('remote-a');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
  });

  it('refreshes AMR status and model catalog when returning from an external upgrade flow', async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'locked-model', label: 'locked-model', enabled: false }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'unlocked-model', label: 'unlocked-model', enabled: true }],
      });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: null,
      configPath: '/tmp/amr-config.json',
      account: { plan: 'pro' },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('locked-model');
    });

    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(mockedFetchVelaLoginStatus).toHaveBeenCalledWith({ refresh: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('unlocked-model');
    });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('returns every authenticated surface to onboarding when Cloud auth definitively expires', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      mode: 'daemon',
      agentId: 'amr',
    });
    useRouteMock.mockReturnValue({
      kind: 'project',
      projectId: 'project-with-expired-auth',
      conversationId: null,
      fileName: null,
    });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'expired-user', email: 'expired@example.com' },
      configPath: '/tmp/amr-config.json',
      sessionState: 'reauth_required',
      credentialRevision: 'expired-revision',
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith(
        { kind: 'home', view: 'onboarding' },
        { replace: true },
      );
    });
  });

  it('starts AMR preset polling before the agent probe resolves', { timeout: 10_000 }, async () => {
    let resolveAgents!: (value: Array<{
      id: string;
      name: string;
      bin: string;
      available: boolean;
      version: string;
      models: Array<{ id: string; label: string }>;
    }>) => void;
    mockedFetchAgentsStream.mockReturnValue(
      new Promise((resolve) => {
        resolveAgents = resolve;
      }),
    );
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'preset',
      refreshing: true,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });
    resolveAgents([
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        version: '1.0.0',
        models: [],
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
    });
  });

  it('rescans agents on window focus so external CLI auth changes are detected', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'preset',
      refreshing: false,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    });
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'codex',
          name: 'Codex CLI',
          bin: 'codex',
          available: true,
          version: 'codex-cli 9.9.9',
          authStatus: 'missing',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'codex',
          name: 'Codex CLI',
          bin: 'codex',
          available: true,
          version: 'codex-cli 9.9.9',
          authStatus: 'ok',
          models: [],
        },
      ]);

    try {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('codex-auth').textContent).toBe('missing');
      });

      fireEvent(window, new Event('focus'));
      expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        nowSpy.mockReturnValue(10_001);
        fireEvent(window, new Event('focus'));
        expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('codex-auth').textContent).toBe('ok');
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('restarts AMR polling after sign-in when preset refresh previously stopped on a remote error', async () => {
    vi.useFakeTimers();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        remoteError: 'remote unavailable',
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'remote-a', label: 'remote-a' }],
      });

    render(<App />);

    await advanceTestClock(0);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');

    await advanceTestClock(1_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');

    await advanceTestClock(1_500);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      profile: 'default',
      user: null,
      configPath: '/tmp/amr-config.json',
    });

    fireEvent.click(screen.getByText('open settings'));
    expect(screen.getByText('mark amr signed in')).toBeTruthy();
    fireEvent.click(screen.getByText('mark amr signed in'));
    await advanceTestClock(0);

    // Settings is a full-page route now; return home so the EntryView
    // mock (which renders the amr-model probe) is mounted again.
    fireEvent.click(screen.getByText('close settings'));
    await advanceTestClock(0);

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('amr-model').textContent).toBe('remote-a');
  });

  it('does not restart AMR model polling for repeated signed-in status snapshots', async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('open settings'));
    await waitFor(() => {
      expect(screen.getByText('mark amr signed in')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('mark amr signed in'));
    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText('mark amr signed in'));
    fireEvent.click(screen.getByText('mark amr signed in'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('stops polling after the preset retry budget is exhausted when remote never arrives', async () => {
    vi.useFakeTimers();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockImplementation(async () => ({
      source: 'preset',
      refreshing: true,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    }));

    render(<App />);

    await advanceTestClock(0);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    await advanceTestClock(10_000);

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(11);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');

    await advanceTestClock(1_500);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(11);
  });

  it('does not merge stale AMR remote models over a rescan with new agent env', async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'old-remote', label: 'old-remote' }],
    });
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'new-probe', label: 'new-probe' }],
        },
      ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('old-remote');
    });

    fireEvent.click(screen.getByText('open settings'));

    await waitFor(() => {
      expect(screen.getByText('rescan agents')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('rescan agents'));

    // Settings is a full-page route now; return home so the EntryView
    // mock (which renders the amr-model probe) is mounted again.
    fireEvent.click(screen.getByText('close settings'));

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('new-probe');
    });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
  });

  it('refreshes renderer config and clears stale AMR models after a desktop app-config change event', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      agentModels: { amr: { model: 'old-remote', reasoning: 'default' } },
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'prod' },
      },
    });
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'old-remote', label: 'old-remote' }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'local-remote', label: 'local-remote' }],
      });
    mockedFetchDaemonConfig
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        agentCliEnv: {
          amr: { OPEN_DESIGN_AMR_PROFILE: 'local' },
        },
      });
    mockedMergeDaemonConfig.mockImplementation((local, daemon) => ({
      ...local,
      agentCliEnv: daemon?.agentCliEnv ?? local.agentCliEnv,
    }));
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'local-probe', label: 'local-probe' }],
        },
      ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('old-remote');
    });
    await waitFor(() => {
      expect(screen.getByTestId('config-amr-model').textContent).toBe('old-remote');
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-profile').textContent).toBe('prod');
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    const workspaceDirectoryReadsBefore = fetchMock.mock.calls.filter(([input]) =>
      input.toString().includes('/api/workspace/directory')).length;

    fireEvent(window, new CustomEvent('open-design:app-config-changed'));

    await waitFor(() => {
      expect(screen.getByTestId('amr-profile').textContent).toBe('local');
    });
    await waitFor(() => {
      expect(screen.getByTestId('config-amr-model').textContent).toBe('none');
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('local-remote');
    });
    await waitFor(() => {
      expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) =>
        input.toString().includes('/api/workspace/directory')).length,
      ).toBeGreaterThan(workspaceDirectoryReadsBefore);
    });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('ignores stale in-flight AMR model polls after a desktop app-config change restarts polling', async () => {
    const oldRemotePoll = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    const localRemotePoll = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'prod' },
      },
    });
    mockedFetchDaemonConfig
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        agentCliEnv: {
          amr: { OPEN_DESIGN_AMR_PROFILE: 'local' },
        },
      });
    mockedMergeDaemonConfig.mockImplementation((local, daemon) => ({
      ...local,
      agentCliEnv: daemon?.agentCliEnv ?? local.agentCliEnv,
    }));
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockReturnValueOnce(oldRemotePoll.promise)
      .mockReturnValueOnce(localRemotePoll.promise);
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'local-probe', label: 'local-probe' }],
        },
      ]);

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });

    fireEvent(window, new CustomEvent('open-design:app-config-changed'));

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    });

    localRemotePoll.resolve({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'local-remote', label: 'local-remote' }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('amr-profile').textContent).toBe('local');
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('local-remote');
    });

    oldRemotePoll.resolve({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'old-remote', label: 'old-remote' }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('local-remote');
    });
  });
});
