// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { AmrBalanceDialog } from '../../src/components/AmrBalanceDialog';
import { AmrOwnerTopUpDialog } from '../../src/components/chat/AmrOwnerTopUpDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';

vi.mock('../../src/collab/useWorkspaceContext', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>(),
  useWorkspaceContext: () => ({ context: null, loading: false }),
  useWorkspaceBilling: () => null,
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('open-design:locale', 'zh-CN');
  localStorage.setItem('open-design:locale-source', 'manual');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

// Frozen client section r506, 2026-10-20: F07/F10 share the same limit
// family as F04/F06. These DOM contracts complement the browser cascade
// tests; jsdom cannot establish rendered colors, spacing or geometry.
describe('frozen client funding dialogs', () => {
  it('F07 shows all four approved Cloud benefits', () => {
    render(<I18nProvider><AmrBalanceDialog
      reason="insufficient" balanceUsd="0" profile="local"
      entrySource="chat_balance_gate_upgrade"
      workspaceContext={workspaceContextFixture({
        workspaceId: 'frozen-f07', workspaceMemberId: 'frozen-owner',
        workspaceType: 'team', role: 'owner', planId: null,
      })}
      metricsConsent={false} installationId={null}
      onClose={vi.fn()} onResolved={vi.fn()}
    /></I18nProvider>);
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      '无需复杂配置，海量 SOTA 模型任选',
      '邀请成员免费加入，共享额度',
      '支持多模态图像创作，图文一站生成',
      '作品一键发布上线，链接随时分享',
    ]);
  });

  it('F10 uses the frozen owner-contact sentence without inserting a name', () => {
    render(<I18nProvider><AmrOwnerTopUpDialog ownerName="张三" onClose={vi.fn()} /></I18nProvider>);
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '当前团队额度不足，请联系团队空间所有者充值或升级订阅。',
    );
    expect(screen.queryByText('张三')).toBeNull();
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['', '知道了']);
  });

  it('F10 moves keyboard focus inside, traps Tab, and restores the opener on Escape', () => {
    function FundingNotice(): React.JSX.Element {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open funding notice</button>
        {open ? <AmrOwnerTopUpDialog onClose={() => setOpen(false)} /> : null}
      </>;
    }
    render(<I18nProvider><FundingNotice /></I18nProvider>);
    const opener = screen.getByRole('button', { name: 'Open funding notice' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const acknowledge = screen.getByRole('button', { name: '知道了' });
    acknowledge.focus();
    fireEvent.keyDown(acknowledge, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
