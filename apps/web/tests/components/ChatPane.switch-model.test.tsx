// @vitest-environment jsdom
/**
 * ⚠️ **OPEND-2807 把〔更换模型〕从报错卡上撤掉了。**
 *
 * 工单「[ChatPanel] 错误卡片未还原设计样式,应该只有三个按钮」+ 用户
 * 「别分那么多情况了」,按失败类型分档的对症动作整块不再上卡。
 * **代价**:模型下线这一档从此只剩一颗会得到同样结果的〔重试〕(Cloud)或
 * 〔切换到 Cloud〕(BYOK),与设计原则四直接冲突 —— 已写进 PR 描述与决策表。
 *
 * 下面第一节改成钉「它确实不上卡了」;第二节(文案不许和落点打架)保留 ——
 * 那一条守的是字典里那句话,和按钮在不在无关。
 *
 * 以下是这份文件原本的红测意图,留作来历:
 *
 * 红测(E3):〔更换模型〕要**直接打开模型选择器**,不是把人送进设置面板。
 *
 * 权威是交付稿自己的话(`docs/design/run-errors/error-ux-design.md:130`,S08):
 * 「更换模型直接打开模型选择器,**选完自动重跑**;切到 Open Design 智能体后自动重跑。」
 *
 * 之前记在 `chat-panel-feedback.md` 里的理由是**错的** —— 那条写着「项目页里没有
 * 模型选择器,所以只能落设置」,可 `ProjectView` 一直挂着 `AvatarMenu`,composer
 * 那颗触发器点开就是内联的模型列表(2026-08-27 在真机上点开确认过)。
 *
 * 这一层只钉「按下去发生了什么」:开选择器、而且**不**打开设置。
 * 「选完自动重跑」那一半在 ProjectView 那层,由 `ProjectView.switch-model-rerun` 钉。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

const translate = (key: string) => key;
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

afterEach(() => cleanup());

/**
 * 模型下线 —— 这一档的动作就是〔更换模型〕(`amr-guidance` 的 switch-model)。
 *
 * ⚠️ 2026-09-08:`agentId` 从 `claude` 换成 `amr`,**这一节要钉的落点判据没改**。
 * 用户裁决「有〔切换到 Cloud〕一律只显示切换至 Cloud」之后,阶梯那一颗在
 * BYOK / 本地 CLI 的卡上整块不画;〔更换模型〕仍然存在,只是唯一能观察到它的
 * 是**已经跑在 Cloud 上**的 run —— 而那恰恰也是「模型下线」最常出现的地方
 * (`AMR_MODEL_UNAVAILABLE` 在 agent-agnostic 表里,两侧都命中同一张卡)。
 */
function modelGoneTurn(): ChatMessage[] {
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
          detail: 'The selected model is no longer available.',
          code: 'AMR_MODEL_UNAVAILABLE',
        },
      ],
    } as unknown as ChatMessage,
  ];
}

function renderPane(extra: Record<string, unknown>) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={modelGoneTurn()}
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

describe('OPEND-2807 · 〔更换模型〕不再上报错卡', () => {
  it('模型下线的卡上没有〔更换模型〕,也不会去开选择器或设置', () => {
    const onSwitchModel = vi.fn();
    const onOpenSettings = vi.fn();
    const { container } = renderPane({ onSwitchModel, onOpenSettings, onRetry: vi.fn() });

    expect(
      container.querySelector('[data-testid="chat-error-switch-model"]'),
      'OPEND-2807 之后这一颗不该再上卡',
    ).toBeNull();
    expect(onSwitchModel).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('卡上就是那三颗 —— 这一轮跑在 Cloud 上,所以第三颗是〔重试〕', () => {
    const { container } = renderPane({ onSwitchModel: vi.fn(), onRetry: vi.fn() });

    const footer = container.querySelector('[data-user-action-footer="true"]');
    expect(footer).toBeTruthy();
    expect(
      Array.from(footer!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'chat-error-contact-support',
      'chat-error-export-logs',
      'chat-error-retry',
    ]);
  });
});

describe('E3 · 卡上的话不许和按钮的落点打架', () => {
  /**
   * 按钮改成就地开选择器之后,原来那句「请**在设置中**切换到其他可用模型后重试」
   * 就成了假话 —— 它指的路和按下去发生的事不是一回事。真机上先照出来的正是这个。
   *
   * ⚠️ OPEND-2807 之后按钮整个不上卡了,于是**又有了一处文案与落点的错配**:
   * 正文仍写着「更换模型后重试」,而卡上已经没有换模型的入口。
   * 卡片标题 / 正文归另一单(按产品文档逐格核对)统一处理,这里只记一笔,不动手。
   */
  it('no longer sends the reader to Settings in words', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../src/i18n/locales');
    const zh = readFileSync(join(dir, 'zh-CN.ts'), 'utf8');
    const en = readFileSync(join(dir, 'en.ts'), 'utf8');
    const line = (src: string) =>
      src.split('\n').find((l) => l.includes('chat.runError.modelUnavailableMessage')) ?? '';
    expect(line(zh), '中文还在指路设置').not.toMatch(/设置/);
    expect(line(en), 'English still points at Settings').not.toMatch(/Settings/);
  });
});
