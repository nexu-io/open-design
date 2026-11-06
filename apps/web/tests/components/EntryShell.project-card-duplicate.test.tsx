// @vitest-environment jsdom
//
// OPEND-2686 (QA 2026-09-15 addendum): the Personal projects (/drafts) card
// "more" menu offered only Rename / Delete. `RecentProjectsStrip` already
// renders a Duplicate item between the two whenever it is handed an
// `onDuplicate` — the rail row (F1, #7878) and the 项目 DesignsTab both wire
// the shell's `onDuplicateProject` through — but the two strip mounts in
// `EntryShell` (drafts and all-projects) never passed it, so the item silently
// stayed out of the card menu.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig, Project } from '../../src/types';
import {
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

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

function teamContext(): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    displayName: 'Ma Shu',
  };
}

function cliAgent(): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
  };
}

function baseConfig(): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'claude-code',
    agentModels: { 'claude-code': { model: 'sonnet' } },
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    theme: 'system',
  } as unknown as AppConfig;
}

function renderAt(path: string, overrides: Partial<React.ComponentProps<typeof EntryShell>> = {}) {
  window.history.replaceState(null, '', path);
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
    config: baseConfig(),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onCreateProject: vi.fn(() => Promise.resolve(true)),
    onBeginProjectCreation: () => ({ projectId: 'optimistic-project', rollback: () => undefined }),
    onAmrBalanceGateBlockChange: () => undefined,
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onDuplicateProject: vi.fn(async () => {}),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );
  return props;
}

async function openCardMenu(): Promise<HTMLElement> {
  const strip = await screen.findByTestId('recent-projects-strip');
  fireEvent.click(within(strip).getByRole('button', { name: 'More actions' }));
  return within(strip).getByRole('menu');
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  vi.unstubAllGlobals();
});

describe('OPEND-2686 — project card menu offers Duplicate project', () => {
  const localProject: Project = {
    id: 'local-project',
    name: 'Local project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
  };

  it('lists Rename / Duplicate project / Delete on a Personal projects card and hands the id to the shell', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ context: null, projects: [], plugins: [] })) as typeof fetch;
    const props = renderAt('/drafts', { projects: [localProject] });

    const menu = await openCardMenu();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(
      ['Rename', 'Duplicate project', 'Delete'],
    );

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicate project' }));
    expect(props.onDuplicateProject).toHaveBeenCalledWith('local-project');
  });

  it('offers the same Duplicate project item on an 全部项目 card the member created', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: teamContext() });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'team-project',
            ownerMemberId: 'wm-1',
            sharedAt: '2026-09-01T00:00:00.000Z',
            name: 'Team project',
            updatedAt: Date.now(),
          }],
        });
      }
      if (pathname.endsWith('/files')) return jsonResponse({ files: [] });
      return jsonResponse({});
    }) as typeof fetch;
    const props = renderAt('/all-projects', {
      projects: [{
        id: 'team-project',
        name: 'Team project',
        skillId: null,
        designSystemId: null,
        workspaceId: 'ws-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    });

    const menu = await openCardMenu();
    const duplicate = within(menu).getByRole('menuitem', { name: 'Duplicate project' }) as HTMLButtonElement;
    expect(duplicate.disabled).toBe(false);
    const labels = within(menu).getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(labels.indexOf('Duplicate project')).toBe(labels.indexOf('Rename') + 1);
    expect(labels.indexOf('Duplicate project')).toBeLessThan(labels.indexOf('Delete'));

    fireEvent.click(duplicate);
    expect(props.onDuplicateProject).toHaveBeenCalledWith('team-project');
  });
});
