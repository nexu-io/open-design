// @vitest-environment jsdom
import { StrictMode } from 'react';
import { buildWorkspacePermissions } from '@open-design/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AmrConcurrencyDialog } from '../../src/components/AmrConcurrencyDialog';
import { AmrBalanceDialog } from '../../src/components/AmrBalanceDialog';
import { HomeAmrBalanceGateDialogs, type HomeAmrBalanceGateBlock } from '../../src/components/HomeAmrBalanceGateDialogs';
import { AmrOwnerTopUpDialog } from '../../src/components/chat/AmrOwnerTopUpDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';
const mocks = vi.hoisted(() => ({ track: vi.fn(), context: vi.fn() }));
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track: mocks.track }) }));
vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({ context: mocks.context(), loading: false }),
  useWorkspaceBilling: () => null,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  mocks.track.mockReset();
  mocks.context.mockReturnValue(workspaceContextFixture({ workspaceId: 'home-workspace', workspaceMemberId: 'member' }));
});
function homeBlock(dialog: 'upgrade' | 'ask_owner'): HomeAmrBalanceGateBlock {
  return { reason: 'insufficient', dialog, upgradeIntent: 'pricing', resolve: vi.fn(),
    snapshot: { status: 'available', profile: 'test', user: null, balanceUsd: '0', updatedAt: null,
      fetchedAt: '2026-10-28T00:00:00Z', stale: false, source: 'daemon_cache' } };
}
function views() { return mocks.track.mock.calls.filter(([event]) => event === 'surface_view'); }
function clicks() { return mocks.track.mock.calls.filter(([event]) => event === 'ui_click'); }
it('attributes the Home funding block to before_run even when recovery requires manual Send', () => {
  render(<HomeAmrBalanceGateDialogs block={homeBlock('upgrade')} metricsConsent={false} installationId={null} />);
  expect(views()).toHaveLength(1);
  expect(views()[0]![1]).toMatchObject({ page_name: 'home', stage: 'before_run', reason: 'credit_exhausted' });
});
it.each(['acknowledge', 'close', 'escape'])('records a member Home block and its %s dismissal once', (action) => {
  const block = homeBlock('ask_owner');
  render(<StrictMode><HomeAmrBalanceGateDialogs block={block} metricsConsent={false} installationId={null} /></StrictMode>);
  expect(views()).toHaveLength(1);
  expect(views()[0]![1]).toMatchObject({ page_name: 'home', stage: 'before_run', workspace_key: 'home-workspace', workspace_role: 'member', reason: 'credit_exhausted' });
  if (action === 'acknowledge') fireEvent.click(screen.getByTestId('amr-balance-owner-dismiss'));
  else if (action === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  else fireEvent.keyDown(document, { key: 'Escape' });
  expect(block.resolve).toHaveBeenCalledExactlyOnceWith('dismiss');
  expect(clicks()).toHaveLength(1);
  expect(clicks()[0]![1]).toMatchObject({ element: 'close', block_id: views()[0]![1].block_id });
});
it('attributes a member project block to the payer rather than the ambient workspace', () => {
  render(<AmrOwnerTopUpDialog onClose={vi.fn()} stage="mid_run" workspaceContext={workspaceContextFixture({ workspaceId: 'payer', workspaceMemberId: 'payer-member' })} />);
  expect(views()[0]?.[1]).toMatchObject({ page_name: 'chat_panel', stage: 'mid_run', workspace_key: 'payer' });
});
it('uses the explicit run stage independently of the recovery action', () => {
  render(<AmrBalanceDialog reason="insufficient" balanceUsd="0" profile="test" entrySource="chat_balance_gate_upgrade"
    stage="mid_run" manualSendOnRecovery={false} metricsConsent={false} installationId={null} onClose={vi.fn()} onResolved={vi.fn()} />);
  expect(views()[0]?.[1]).toMatchObject({ stage: 'mid_run' });
});
it('does not count the inline design catalogue as a member interruption', () => {
  render(<AmrOwnerTopUpDialog inline onClose={vi.fn()} />);
  fireEvent.click(screen.getByTestId('amr-balance-owner-dismiss'));
  expect(mocks.track).not.toHaveBeenCalled();
});

it.each(['before_run', 'mid_run', 'unknown'] as const)('keeps concurrency %s on exposure, upgrade and dismissal', (stage) => {
  vi.stubGlobal('open', vi.fn());
  const context = workspaceContextFixture({ workspaceId: 'payer', workspaceMemberId: 'owner', role: 'owner',
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) });
  render(<StrictMode><AmrConcurrencyDialog branch={{ audience: 'owner', tier: 'below_max' }}
    workspaceContext={context} stage={stage} profile="local" onClose={vi.fn()} /></StrictMode>);
  expect(views()).toHaveLength(1);
  expect(views()[0]![1]).toMatchObject({ stage, reason: 'concurrency_limit', workspace_key: 'payer' });
  fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
  fireEvent.click(screen.getByTestId('amr-concurrency-close'));
  expect(clicks().map((call) => call[1])).toEqual([
    expect.objectContaining({ stage, element: 'upgrade', block_id: views()[0]![1].block_id }),
    expect.objectContaining({ stage, element: 'close', block_id: views()[0]![1].block_id }),
  ]);
});
it('does not infer a running task when historical concurrency stage is unavailable', () => {
  render(<AmrConcurrencyDialog branch={{ audience: 'owner', tier: 'max' }} workspaceContext={null} onClose={vi.fn()} />);
  expect(views()[0]![1]).toMatchObject({ stage: 'unknown' });
});
