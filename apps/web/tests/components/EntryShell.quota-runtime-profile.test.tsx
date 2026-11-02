// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntryShell } from '../../src/components/EntryShell';
import { resetWorkspaceDirectoryCache, WorkspaceTopRightAccountCluster } from '../../src/components/EntryNavRail';
import { RAIL_OPEN_STORAGE_KEY } from '../../src/components/entryRailBridge';
import { resetTeamProjectsCache, resetWorkspaceBillingCache, resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { I18nProvider } from '../../src/i18n';
import type { VelaLoginStatus } from '../../src/providers/daemon';
import { setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';
import type { AppConfig } from '../../src/types';
import { workspaceContextFixture, workspaceDirectoryFixture } from '../helpers/workspace-context';

const context = workspaceContextFixture({ workspaceId: 'odlocal-plus', workspaceMemberId: 'owner', role: 'owner', planId: 'team_plus' });
const origin = 'http://127.0.0.1:52677';
const status: VelaLoginStatus = { loggedIn: true, profile: 'local', consoleOrigin: origin, user: null, configPath: '' };
const config: AppConfig = {
  mode: 'daemon', agentId: 'amr', agentModels: { amr: { model: 'glm-5' } },
  apiProtocol: 'anthropic', apiProtocolConfigs: {}, apiKey: '', baseUrl: '', model: '',
  skillId: null, designSystemId: null, theme: 'system',
};
const agent = { id: 'amr', name: 'OpenDesign AMR', bin: 'amr', available: true, models: [{ id: 'glm-5', label: 'GLM 5' }] };

function shell(snapshot: VelaLoginStatus | null, cliProfile?: string) {
  return <I18nProvider initial="zh-CN"><EntryShell
    skills={[]} designTemplates={[]} designSystems={[]} projects={[]} templates={[]} promptTemplates={[]}
    defaultDesignSystemId={null} connectors={[]} connectorsLoading={false}
    config={cliProfile ? { ...config, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: cliProfile } } } : config}
    agents={[agent]} daemonLive amrRegistrationStatus={snapshot}
    onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
    onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onConfigPersist={vi.fn()}
    onRefreshAgents={() => [agent]} onCreateProject={vi.fn()}
    onBeginProjectCreation={() => ({ projectId: 'optimistic', rollback: () => undefined })}
    onAmrBalanceGateBlockChange={vi.fn()} onCreatePluginShareProject={vi.fn()}
    onImportClaudeDesign={vi.fn()} onOpenProject={vi.fn()} onOpenLiveArtifact={vi.fn()}
    onDeleteProject={vi.fn()} onRenameProject={vi.fn()} onChangeDefaultDesignSystem={vi.fn()}
    onPersistComposioKey={vi.fn()} onOpenSettings={vi.fn()} onCompleteOnboarding={vi.fn()}
  /></I18nProvider>;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(window, 'open').mockReturnValue(null);
  resetWorkspaceContextCache(); resetWorkspaceBillingCache(); resetTeamProjectsCache(); resetWorkspaceDirectoryCache();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/workspace/context') return Response.json({ context });
    if (url === '/api/workspace/directory') return Response.json(workspaceDirectoryFixture([context]));
    if (url.startsWith('/api/workspace/billing?')) return Response.json({ summary: null, workspaceBalance: {
      workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      billingScopeVersion: 2, balanceUsd: '24', expiresAt: null, updatedAt: null,
    } });
    if (url === '/api/integrations/vela/status') return Response.json(status);
    if (url === '/api/workspace/projects/team') return Response.json({ projects: [] });
    if (url === '/api/plugins') return Response.json({ plugins: [] });
    if (url === '/api/mcp/servers') return Response.json({ servers: [] });
    if (url === '/api/community/discord' || url === '/api/github/open-design') return Response.json({ stale: true });
    return Response.json({});
  }));
  setRuntimeAmrConsoleOrigin('https://stale.example.invalid');
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear();
  resetCoalescedGet(); resetWorkspaceContextCache(); resetWorkspaceBillingCache(); resetTeamProjectsCache(); resetWorkspaceDirectoryCache();
  setRuntimeAmrConsoleOrigin(null);
});

async function openQuota() {
  fireEvent.pointerEnter(await screen.findByTestId('entry-top-right-credits'));
  // Positive evidence that the scoped D4 quota card, with the shared balance, rendered.
  await waitFor(() => expect(screen.getByRole('region', { name: '按量额度' }).textContent).toContain('$24.00'));
}
function expectLinks(base: string) {
  fireEvent.click(screen.getByRole('button', { name: '升级' }));
  expect(window.open).toHaveBeenLastCalledWith(`${base}/dashboard?workspaceId=odlocal-plus&source=open_design&billing=plan`, '_blank', 'noopener,noreferrer');
  // Navigation closes the popover; reopen the same card for the balance action.
  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
  fireEvent.click(screen.getByRole('button', { name: '查看余额' }));
  expect(window.open).toHaveBeenLastCalledWith(`${base}/dashboard?workspaceId=odlocal-plus&source=open_design`, '_blank', 'noopener,noreferrer');
}

it('SAFE-004 no CLI env: both quota links follow the daemon status snapshot and its updates', async () => {
  expect(config.agentCliEnv).toBeUndefined();
  const mounted = render(shell(status));
  await openQuota();
  expectLinks(origin);
  mounted.rerender(shell({ ...status, profile: 'feature-test', consoleOrigin: 'https://next.example.invalid' }));
  await openQuota();
  expectLinks('https://next.example.invalid');
});

it('SAFE-004 daemon prod outranks stale CLI local and pins both quota links', async () => {
  render(shell({ ...status, profile: 'prod' }, 'local'));
  await openQuota();
  expectLinks('https://open-design.ai/cloud');
});

it('SAFE-004 without a status snapshot the existing CLI local fallback still works', async () => {
  setRuntimeAmrConsoleOrigin(origin);
  render(shell(null, 'local'));
  await openQuota();
  expectLinks(origin);
});

function projectQuota(snapshot: VelaLoginStatus | null) {
  return <I18nProvider initial="zh-CN"><WorkspaceTopRightAccountCluster
    workspaceContextOverride={context} amrLoggedIn amrAccountPlan="plus"
    workspaceQuotaStatus={snapshot}
  /></I18nProvider>;
}

it.each(['local', 'test', 'feature-test'])('SAFE-004 project wrapper keeps %s quota links on the daemon origin', async profile => {
  render(projectQuota({ ...status, profile }));
  await openQuota();
  expectLinks(origin);
});

it('SAFE-004 project wrapper follows daemon status updates and keeps prod pinned', async () => {
  const mounted = render(projectQuota(status));
  await openQuota();
  expectLinks(origin);
  mounted.rerender(projectQuota({ ...status, profile: 'feature-test', consoleOrigin: 'https://next.example.invalid' }));
  await openQuota();
  expectLinks('https://next.example.invalid');
  mounted.rerender(projectQuota({ ...status, profile: 'prod' }));
  await openQuota();
  expectLinks('https://open-design.ai/cloud');
});

it('SAFE-004 project wrapper without a daemon snapshot keeps the production fallback', async () => {
  render(projectQuota(null));
  await openQuota();
  expectLinks('https://open-design.ai/cloud');
});
