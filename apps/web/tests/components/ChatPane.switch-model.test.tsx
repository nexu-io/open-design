// @vitest-environment jsdom
/**
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

/** 模型下线 —— 这一档的主动作就是〔更换模型〕(`amr-guidance` 的 switch-model) */
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
      agentId: 'claude',
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

describe('E3 · 〔更换模型〕的落点', () => {
  it('opens the model picker instead of sending the user to Settings', () => {
    const onSwitchModel = vi.fn();
    const onOpenSettings = vi.fn();
    const { container } = renderPane({ onSwitchModel, onOpenSettings, onRetry: vi.fn() });

    const button = container.querySelector<HTMLButtonElement>('[data-testid="chat-error-switch-model"]');
    expect(button, '这一档应该给一颗〔更换模型〕').toBeTruthy();
    fireEvent.click(button!);

    expect(onSwitchModel, '稿子要的是「直接打开模型选择器」').toHaveBeenCalledTimes(1);
    // 带上是哪一轮 —— 选完模型要重跑的就是它(和 onRetry 同一副形状)
    expect(onSwitchModel.mock.calls[0]?.[0]).toMatchObject({ id: 'assistant-1' });
    expect(onOpenSettings, '不该再把人丢进设置面板').not.toHaveBeenCalled();
  });

  it('still falls back to Settings when no picker is wired', () => {
    // 首页之类没有内联选择器的宿主:退回设置,总好过按了没反应。
    const onOpenSettings = vi.fn();
    const { container } = renderPane({ onOpenSettings, onRetry: vi.fn() });
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-testid="chat-error-switch-model"]')!);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });
});

describe('E3 · 卡上的话不许和按钮的落点打架', () => {
  /**
   * 按钮改成就地开选择器之后,原来那句「请**在设置中**切换到其他可用模型后重试」
   * 就成了假话 —— 它指的路和按下去发生的事不是一回事。真机上先照出来的正是这个。
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
