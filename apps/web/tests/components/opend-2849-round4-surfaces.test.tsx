// @vitest-environment jsdom
/**
 * OPEND-2849 第四轮:把以下格的**渲染结果**对齐产品《报错文案｜精简版》(zh-CN 逐字)。
 *
 * - S04 发送前·Open Design 智能体没登录(余额闸门弹窗 signed_out)
 * - S06 发送前·额度不足(有充值权限的弹窗 / 无充值权限成员的弹窗)
 * - S15 运行中·额度不足(升级卡归零那一档,个人 / 无充值权限成员)
 * - S24a 仍有待办未完成 · S24c 用户主动停止(回合状态行:标题 + 正文)
 * - S31c 下载更新失败(更新弹窗)
 * - S32a 登录时浏览器没打开(激活提示:标题 + 正文,登录页链接保留)
 * - S09a 限流·自动重试(流水尾部那一行)
 *
 * 每一格都断言「原有的按钮 / 功能还在」—— 只换文字,不删东西。
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  OpenDesignHostUpdaterOpenDialogListener,
  OpenDesignHostUpdaterStatusSnapshot,
} from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { AmrBalanceDialog } from '../../src/components/AmrBalanceDialog';
import { AmrAccountControl } from '../../src/components/AmrLoginPill';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { AmrOwnerTopUpDialog } from '../../src/components/chat/AmrOwnerTopUpDialog';
import { Reconnect } from '../../src/components/chat/Reconnect';
import { UpgradeCard } from '../../src/components/chat/UpgradeCard';
import { UpdateDialog } from '../../src/components/UpdateDialog';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { I18nProvider } from '../../src/i18n';
import type { AgentEvent, ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

let restoreHost: (() => void) | null = null;
afterEach(() => {
  cleanup();
  restoreHost?.();
  restoreHost = null;
  vi.unstubAllGlobals();
  resetWorkspaceContextCache();
});

const zh = (ui: React.ReactElement) => render(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

function stubQuietFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 404 })));
}

describe('S04 / S06 发送前弹窗', () => {
  it('S04 未登录:标题「Open Design 尚未登录」+ 正文,登录按钮保留', () => {
    stubQuietFetch();
    zh(
      <AmrBalanceDialog
        reason="signed_out"
        balanceUsd={null}
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );
    const dialog = screen.getByTestId('amr-balance-dialog');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe('Open Design 尚未登录');
    expect(within(dialog).getByText('请先登录，以便查看项目和继续对话。')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '立即登录' })).toBeTruthy();
  });

  it('S06 有充值权限:标题「可用额度不足」+ 正文(不带余额),权益列表与按钮保留', () => {
    stubQuietFetch();
    zh(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
    );
    const dialog = screen.getByTestId('amr-balance-dialog');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe('可用额度不足');
    expect(within(dialog).getByText('当前额度不足，请充值或升级套餐后再试。')).toBeTruthy();
    expect(dialog.textContent).not.toContain('$0.00');
    expect(within(dialog).getByText('OpenDesign Cloud 为你提供')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '暂不需要' })).toBeTruthy();
  });

  it('S06 无充值权限成员:标题「团队额度不足」+ 正文,按钮保留(有/无所有者名字同一句)', () => {
    for (const ownerName of ['Alice', null]) {
      zh(<AmrOwnerTopUpDialog inline onClose={() => {}} ownerName={ownerName} />);
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('团队额度不足');
      const body = screen.getByText('当前团队额度不足，请联系团队管理员充值或升级订阅。');
      expect(body).toBeTruthy();
      expect(screen.getByTestId('amr-balance-owner-dismiss')).toBeTruthy();
      cleanup();
    }
  });
});

describe('S15 运行中额度不足(升级卡归零那一档)', () => {
  const why = () => {
    const p = screen.getByTestId('chat-upgrade-card').querySelector('p');
    if (!p) throw new Error('no why paragraph');
    return p;
  };

  it('个人:标题 + 正文,剩余额度与〔升级〕保留', () => {
    zh(<UpgradeCard balanceUsd={0} pausedAudience="owner" onUpgrade={() => {}} />);
    expect(why().textContent).toBe('额度不足，任务已暂停当前额度不足，请充值或升级套餐后再试。');
    expect(within(why()).getByText('额度不足，任务已暂停')).toBeTruthy();
    expect(within(why()).getByText('当前额度不足，请充值或升级套餐后再试。')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: /升级/ })).toBeTruthy();
  });

  it('无充值权限成员:团队标题 + 正文', () => {
    zh(<UpgradeCard balanceUsd={0} pausedAudience="member" onUpgrade={() => {}} />);
    expect(within(why()).getByText('团队额度不足，任务已暂停')).toBeTruthy();
    expect(within(why()).getByText('当前团队额度不足，请联系团队管理员充值或升级订阅。')).toBeTruthy();
  });

  it('余额偏低那一档不动', () => {
    zh(<UpgradeCard balanceUsd={3.2} pausedAudience="owner" onUpgrade={() => {}} />);
    expect(why().textContent).toBe('余额可能撑不完下一个任务 —— 中途用尽会停在半成品上');
  });
});

function todoTurn(): ChatMessage {
  const events: AgentEvent[] = [
    {
      kind: 'tool_use',
      id: 'todo-1',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Draft layout', status: 'completed' },
          { content: 'Build components', status: 'in_progress', activeForm: 'Building components' },
          { content: 'Run QA', status: 'pending' },
        ],
      },
    },
  ];
  return { id: 'assistant-1', role: 'assistant', content: '', events, startedAt: 1_000, endedAt: 3_000 };
}

describe('S24 回合状态行', () => {
  it('S24a 仍有待办未完成:标题「任务尚未完成」+ 正文带实际未完成项数', () => {
    zh(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={todoTurn()}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );
    expect(screen.getByTestId('assistant-label').textContent).toBe('任务尚未完成');
    expect(screen.getByTestId('assistant-label-detail').textContent).toBe('本次任务仍有 2 项内容未完成。');
  });

  it('S24c 用户主动停止:标题「任务已停止」+ 正文', () => {
    zh(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          id: 'assistant-stop',
          role: 'assistant',
          content: 'partial answer',
          runStatus: 'canceled',
          events: [{ kind: 'text', text: 'partial answer' }],
          startedAt: 1_000,
          endedAt: 3_000,
        } as ChatMessage}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );
    expect(screen.getByTestId('assistant-label').textContent).toBe('任务已停止');
    expect(screen.getByTestId('assistant-label-detail').textContent).toBe('本次运行已按你的操作停止。');
  });
});

describe('S32a 登录时浏览器没打开', () => {
  it('标题 + 正文,登录页链接保留', () => {
    zh(
      <AmrAccountControl
        status="signing-in"
        compact
        activationUrl="https://app.vela.example/device?user_code=AB12-CD34"
        browserOpenFailed
        onSignIn={vi.fn()}
      />,
    );
    expect(screen.getByText('无法打开登录页面')).toBeTruthy();
    expect(screen.getByText('浏览器未能自动打开，请重新尝试登录。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开登录页' })).toBeTruthy();
  });
});

describe('S09a 限流·自动重试', () => {
  it('因限流重试时说「模型服务请求繁忙」+ 正文', () => {
    zh(<Reconnect attempt={1} max={1} reason="agent-retry" retryCause="rate_limit" />);
    const row = screen.getByTestId('chat-reconnect');
    expect(within(row).getByText('模型服务请求繁忙')).toBeTruthy();
    expect(
      within(row).getByText('当前使用该模型服务的请求较多，已达到供应商的请求频率上限，请稍后再试，或者切换其他模型。'),
    ).toBeTruthy();
    expect(row.textContent).not.toContain('正在重试');
  });

  it('其他原因的重试仍是「正在重试」', () => {
    zh(<Reconnect attempt={1} max={1} reason="agent-retry" />);
    expect(screen.getByTestId('chat-reconnect').textContent).toContain('正在重试');
  });
});

function updaterStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    capabilities: { canApplyInPlace: true, canDownload: true, canOpenInstaller: false, requiresManualInstall: false },
    channel: 'beta',
    currentVersion: '1.2.3',
    enabled: true,
    mode: 'js-incremental',
    platform: 'darwin',
    state: 'idle',
    supported: true,
    ...overrides,
  };
}

describe('S31c 下载更新失败', () => {
  it('更新弹窗:标题行「更新下载未完成」+ 正文', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const failed = updaterStatus({
      availableVersion: '1.2.4',
      error: { code: 'download-failed', message: 'socket hang up' },
      state: 'error',
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          check: vi.fn(async () => failed),
          download: vi.fn(async () => failed),
          status: vi.fn(async () => failed),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });
    zh(<UpdateDialog />);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });
    const dialog = await screen.findByRole('dialog');
    const status = dialog.querySelector('#update-dialog-status') as HTMLElement;
    await waitFor(() => expect(status.textContent).toContain('请确认网络连接正常后再试'));
    expect(status.textContent?.split('\n')).toEqual(['更新下载未完成', '请确认网络连接正常后再试。']);
    expect(dialog.textContent).not.toContain('socket hang up');
  });

  it('检查失败仍是「检查更新失败」', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const failed = updaterStatus({ error: { code: 'metadata-unreachable', message: 'ETIMEDOUT' }, state: 'error' });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          check: vi.fn(async () => failed),
          download: vi.fn(async () => failed),
          status: vi.fn(async () => failed),
          subscribeOpenDialog: vi.fn((listener) => {
            openDialogListener = listener;
            return vi.fn();
          }),
        },
      },
    });
    zh(<UpdateDialog />);
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });
    const dialog = await screen.findByRole('dialog');
    const status = dialog.querySelector('#update-dialog-status') as HTMLElement;
    await waitFor(() => expect(status.textContent).toContain('检查更新失败'));
  });
});
