// @vitest-environment jsdom
//
// Issue #8097: the New Project dialog lost its rail entry point. #5517's rail
// redesign deleted the `entry-nav-new-project` control while `EntryShell` kept
// passing `onNewProject` (with its `new_project_plus` ui_click) down to
// `EntryNavRail` — dead wiring, and the dialog became reachable only through
// the `/projects` deep link. These specs lock the restored entry:
//
//   - the rail renders the item exactly once per identity state, as the FIRST
//     item of the second destination group (`entry-nav-rail__team-section`),
//     directly above 全部项目 / `entry-nav-drafts`;
//   - clicking it runs `onNewProject`, and `newProjectDisabled` disables it;
//   - through the real EntryShell wiring, the click opens the new-project
//     modal and fires the `new_project_plus` ui_click.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  };
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    ...overrides,
  } as AppConfig;
}

const signedInContext = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canInviteMembers: false, canViewWorkspaceSettings: false },
} as unknown as WorkspaceCollabContext;

function renderRail(
  context: WorkspaceCollabContext | null,
  overrides: Partial<React.ComponentProps<typeof EntryNavRail>> = {},
) {
  const onNewProject = vi.fn();
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={onNewProject}
        open
        context={context}
        {...overrides}
      />
    </I18nProvider>,
  );
  return onNewProject;
}

function renderHomeSignedOut() {
  window.history.replaceState(null, '', '/');
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig({
      agentId: 'claude-code',
      agentModels: { 'claude-code': { model: 'sonnet' } },
    }),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onCreateProject: vi.fn(),
    onBeginProjectCreation: () => ({ projectId: 'optimistic-project', rollback: () => undefined }),
    onAmrBalanceGateBlockChange: () => undefined,
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
  };

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  analyticsMocks.track.mockReset();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('EntryNavRail new project entry (#8097)', () => {
  it.each([
    ['signed in', signedInContext],
    ['signed out', null],
  ] as const)('renders the item once %s, first in the second group above All Projects', (_label, context) => {
    renderRail(context);

    const items = screen.getAllByTestId('entry-nav-new-project');
    expect(items).toHaveLength(1);

    // Second destination group, not the Home/Community group above it.
    const group = items[0]!.closest('.entry-nav-rail__team-section');
    expect(group).not.toBeNull();

    // Directly above 全部项目 / 项目 (`entry-nav-drafts`) — the first item of
    // the group, so the action reads as the head of the destination list.
    const groupButtons = Array.from(group!.querySelectorAll('.entry-nav-rail__btn'));
    expect(groupButtons[0]).toBe(items[0]);
    expect(groupButtons[1]?.getAttribute('data-testid')).toBe('entry-nav-drafts');
  });

  it('runs onNewProject when the item is clicked', () => {
    const onNewProject = renderRail(null);

    fireEvent.click(screen.getByTestId('entry-nav-new-project'));

    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it('disables the item when newProjectDisabled is set', () => {
    const onNewProject = renderRail(signedInContext, { newProjectDisabled: true });

    const button = screen.getByTestId('entry-nav-new-project');
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);
    expect(onNewProject).not.toHaveBeenCalled();
  });
});

describe('EntryShell rail new project entry (#8097)', () => {
  it('opens the new project modal from the signed-out rail and tracks new_project_plus', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/community/discord')) {
        return jsonResponse({
          inviteCode: 'mHAjSMV6gz',
          inviteUrl: 'https://discord.gg/mHAjSMV6gz',
          onlineCount: 0,
          memberCount: 0,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      if (url.endsWith('/api/github/open-design')) {
        return jsonResponse({
          repo: 'nexu-io/open-design',
          stargazers_count: 0,
          fetchedAt: Date.now(),
          stale: false,
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const props = renderHomeSignedOut();

    fireEvent.click(await screen.findByTestId('entry-nav-new-project'));

    await waitFor(() => {
      expect(screen.getByTestId('new-project-modal')).toBeTruthy();
    });
    expect(screen.getByTestId('new-project-panel')).toBeTruthy();
    expect(props.onCreateProject).not.toHaveBeenCalled();
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({
        page_name: 'home',
        area: 'nav',
        element: 'new_project_plus',
      }),
      undefined,
    );
  });
});
