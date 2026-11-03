// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceQuotaPopover } from '../../src/components/WorkspaceQuotaPopover';
import type { WorkspaceQuotaView } from '../../src/collab/workspace-quota-view';
import { I18nProvider } from '../../src/i18n';
import { setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';
import { workspaceContextFixture } from '../helpers/workspace-context';

const origin = 'http://127.0.0.1:52677';
const context = workspaceContextFixture({ workspaceId: 'odlocal-plus', workspaceMemberId: 'owner', role: 'owner' });
const view: WorkspaceQuotaView = {
  tier: 'plus', planKnown: true, sharedBilling: true, loading: false, balanceUsd: '24', planStatus: null,
  windows: null, breakdown: null, modelRestriction: null,
};

beforeEach(() => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  // The snapshot must win even after another reader changed the global fallback.
  setRuntimeAmrConsoleOrigin('https://stale.example.invalid');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setRuntimeAmrConsoleOrigin(null); });

it.each(['local', 'test', 'feature-test'])('SAFE-004 %s uses the status origin for Upgrade and balance', profile => {
  render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={context} view={view}
    profile={profile} consoleOrigin={`${origin}/`} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '升级' }));
  expect(window.open).toHaveBeenLastCalledWith(
    `${origin}/dashboard?workspaceId=odlocal-plus&source=open_design&billing=plan`, '_blank', 'noopener,noreferrer');
  fireEvent.click(screen.getByRole('button', { name: '查看余额' }));
  expect(window.open).toHaveBeenLastCalledWith(
    `${origin}/dashboard?workspaceId=odlocal-plus&source=open_design`, '_blank', 'noopener,noreferrer');
});

it.each(['prod', undefined, null, '', 'unknown'])('SAFE-004 profile %s stays pinned to production despite consoleOrigin', profile => {
  render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={context} view={view}
    profile={profile} consoleOrigin={origin} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '升级' }));
  expect(window.open).toHaveBeenLastCalledWith(
    'https://open-design.ai/cloud/dashboard?workspaceId=odlocal-plus&source=open_design&billing=plan', '_blank', 'noopener,noreferrer');
  fireEvent.click(screen.getByRole('button', { name: '查看余额' }));
  expect(window.open).toHaveBeenLastCalledWith(
    'https://open-design.ai/cloud/dashboard?workspaceId=odlocal-plus&source=open_design', '_blank', 'noopener,noreferrer');
});

it('SAFE-004 Max recharge keeps the recharge intent on the same status origin', () => {
  render(<I18nProvider initial="zh-CN"><WorkspaceQuotaPopover context={context} view={{ ...view, tier: 'max' }}
    profile="local" consoleOrigin={origin} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '充值' }));
  expect(window.open).toHaveBeenLastCalledWith(
    `${origin}/dashboard?workspaceId=odlocal-plus&source=open_design&billing=recharge`, '_blank', 'noopener,noreferrer');
});
