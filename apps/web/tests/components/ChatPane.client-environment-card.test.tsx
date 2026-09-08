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
  /*
   * ⚠️ origin/main 这两条钉的是〔去设置〕：主按钮是它、重试排在它右边。
   *
   * OPEND-2807(「错误卡片…应该只有三个按钮」+ 用户「别分那么多情况了」)
   * 把按失败类型分档的对症动作整块撤出报错卡,〔去设置〕也在其中。
   * 这一轮跑在 `amr` 上,所以第三颗是〔重试〕。
   *
   * ⚠️ **代价**:S30 从此在卡上没有「去设置改代理 / 证书」的入口,
   * 那是这一类失败唯一真正能解决问题的动作。已写进 PR 描述与决策表。
   * 这里把现状钉死,免得它悄悄变回来、也免得再多出第四颗。
   */
  it('OPEND-2807:三颗按钮,〔去设置〕不再上卡', () => {
    const onOpenSettings = vi.fn();
    const { container } = renderPane({ onOpenSettings, onRetry: vi.fn() });

    expect(
      container.querySelector('[data-testid="chat-error-open-settings"]'),
      'OPEND-2807 之后卡上不该再有〔去设置〕',
    ).toBeNull();
    const footer = container.querySelector('[data-user-action-footer="true"]');
    expect(footer).toBeTruthy();
    expect(
      Array.from(footer!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'chat-error-contact-support',
      'chat-error-export-logs',
      'chat-error-retry',
    ]);
    expect(onOpenSettings).not.toHaveBeenCalled();
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
