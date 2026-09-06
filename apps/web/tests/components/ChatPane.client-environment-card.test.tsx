// @vitest-environment jsdom
/**
 * S30 · 环境类报错卡**渲染出来**长什么样。
 *
 * 上一层(`tests/runtime/run-failure-action-certificate.test.ts`)钉的是映射:
 * 五个 detail 都解析成 `open-settings` + `secondaryRetry`。这一层钉的是卡面 ——
 * 主按钮真的画了〔去设置〕、点下去落到设置 → 本地 CLI(`execution` 那一节,
 * 「高级:代理与自定义路径」就折叠在里面),重试还在但不是主按钮,
 * 而且正文把 `{供应商}` 和那对括号里的成因都填上了。
 *
 * 用真的 zh-CN 词典而不是「返回 key」的假 `t`:S30 要验的正是那句话本身,
 * 返回 key 的话插值有没有发生根本看不出来。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { ChatMessage } from '../../src/types';

// `Dict` 是逐条列举的字面量键,没有索引签名 —— 断言成 `Record<string, …>`
// 会被 tsc 当成不相干的两个类型拦下(TS2352)。按 `keyof` 取才是它自己的读法,
// 顺带保住「拼错的 key 在编译期就该被看见」这件事;运行时取不到再退回 key。
const translate = (key: string, vars?: Record<string, string | number>) => {
  const raw = zhCN[key as keyof typeof zhCN] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
};
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

afterEach(() => cleanup());

/** 同事真机上撞到的那一格:opencode 的证书报错原样传到 daemon 并被命名。 */
function certificateFailureTurn(): ChatMessage[] {
  return [
    { id: 'user-1', role: 'user', content: 'Build it', createdAt: 0 },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: 1,
      endedAt: 2,
      runId: 'run-1',
      runStatus: 'failed',
      agentId: 'amr',
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: 'unknown certificate verification error',
          code: 'AGENT_EXECUTION_FAILED',
          failureDetail: 'certificate_failure',
        },
      ],
    } as unknown as ChatMessage,
  ];
}

function renderPane(extra: Record<string, unknown>) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={certificateFailureTurn()}
      streaming={false}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={[{ id: 'conv-1', title: 'c', createdAt: 0, updatedAt: 0 }] as never}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={{} as never}
      error={null}
      {...extra}
    />,
  );
}

describe('S30 · 环境类报错卡的按钮', () => {
  it('主按钮是〔去设置〕,落到设置 → 本地 CLI 那一节', () => {
    const onOpenSettings = vi.fn();
    const { container } = renderPane({ onOpenSettings, onRetry: vi.fn() });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-error-open-settings"]',
    );
    expect(button, 'S30 要一颗〔去设置〕').toBeTruthy();
    expect(button!.textContent).toContain('去设置');
    // 「高级:代理与自定义路径」那个折叠块渲染在 activeSection === 'execution' 里,
    // 它填的 configuredEnv 在 runtimes/env.ts 优先级最高 —— 这就是唯一的落点。
    fireEvent.click(button!);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  /**
   * 重试**留着**,但它不是这张卡的主动作 —— 主动作是〔去设置〕。
   *
   * ⚠️ 已知差一步:`secondaryRetry` 这一家(S30 之外还有 S15 充值、S04 授权、
   * S17)今天都把重试画成 `variant="primary"`,所以卡上会出现两颗 primary、
   * 而且重试在最右。这是这四档共用的那一行的既有行为,不是 S30 引进的;
   * 要真正「降为次按钮」得动那一行,超出这次的范围,单列待拍板。
   * 这里只钉当下为真的部分:两颗都在,〔去设置〕在左。
   */
  it('重试还在,但主动作是〔去设置〕—— 上游那句话里混着一类真·网络抖动', () => {
    const { container } = renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });

    const group = container.querySelector('[data-testid="chat-error-open-settings"]')
      ?.parentElement;
    expect(group, '两颗动作应该在同一组里').toBeTruthy();
    const ids = Array.from(group!.querySelectorAll('button')).map((b) =>
      b.getAttribute('data-testid'),
    );
    expect(ids, '设计是故意保留重试的').toContain('chat-error-retry');
    expect(ids[0]).toBe('chat-error-open-settings');
  });

  it('不推「切到 Open Design 智能体」—— 公司网络在那条路上一样在', () => {
    const { container } = renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });
    expect(container.querySelector('.amr-guidance')).toBeNull();
  });
});

describe('S30 · 环境类报错卡的文案', () => {
  it('卡面就是 S30 那一句,{供应商} 和成因都填好了', () => {
    renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });

    expect(screen.getByText('网络环境不对')).toBeTruthy();
    // 括号里是这一格自己的成因,不是五格一个说法。
    expect(
      screen.getByText(/看起来走了代理或公司网络，.+拒绝了请求（证书校验失败）。/),
    ).toBeTruthy();
    expect(screen.getByText(/换一个网络出口，或在设置里调整代理。/)).toBeTruthy();
  });

  it('卡上不再出现「任务执行失败」这句什么都没说的兜底', () => {
    renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });
    expect(screen.queryByText('任务执行失败')).toBeNull();
  });

  it('也不再把上游那串英文原文摊在卡面上', () => {
    const { container } = renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });
    expect(container.textContent).not.toContain('unknown certificate verification error');
  });
});
