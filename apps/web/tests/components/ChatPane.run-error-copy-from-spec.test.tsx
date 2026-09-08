// @vitest-environment jsdom
/**
 * 报错卡的文案**必须逐字等于产品文档**,而不是研发自拟的近义句。
 *
 * 权威源是飞书《运行报错场景文案》(docx `S1Ucd1frUo7opCxGLbRcj3XTnvh`)。
 * 每一格在文档里有三样东西:`原文时机`、`原文提示`(草稿,带按钮)、以及表格里的
 * **`润色标题` + `润色正文`**。只有后两列是终稿 —— S30 那张卡此前抄的是「原文提示」
 * 那一栏,所以这份测试钉的是**润色列**,一个字都不许差。
 *
 * 判据走渲染出来的**可观察文本**(标题那一行 + `chat-run-error-description`),
 * 不碰 CSS 类名,也不碰映射表内部的 key 名 —— 换 key 名不该让这份测试变红,
 * 改一个字必须让它变红。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { ChatMessage } from '../../src/types';

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

function failedTurn(code: string, failureDetail?: string): ChatMessage[] {
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
      // Cloud 上的 run:出口不变式会摘掉「切到 Cloud」那颗 CTA,
      // 卡面只剩这一格自己的标题与正文,正是这份测试要读的东西。
      agentId: 'amr',
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: 'upstream said something in English',
          code,
          ...(failureDetail ? { failureDetail } : {}),
        },
      ],
    } as unknown as ChatMessage,
  ];
}

function renderFailure(code: string, failureDetail?: string) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={failedTurn(code, failureDetail)}
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
      onRetry={vi.fn()}
      onOpenSettings={vi.fn()}
      onSwitchModel={vi.fn()}
    />,
  );
}

/** 文档里那一格的终稿:`润色标题` + `润色正文`。 */
interface SpecCell {
  /** 场景编号 + 文档里那一行「场景内的情况」。 */
  readonly label: string;
  readonly code: string;
  readonly failureDetail?: string;
  readonly title: string;
  readonly body: string;
}

const SPEC_CELLS: readonly SpecCell[] = [
  {
    label: 'S07 · 模型不可用',
    code: 'AMR_MODEL_UNAVAILABLE',
    title: '当前模型不可用',
    body: '请选择其他可用模型后再试。',
  },
  {
    label: 'S13 · 模型能力不支持(model_not_supported)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'model_not_supported',
    title: '当前模型不支持此任务',
    body: '该模型不支持任务所需的功能，请更换模型后再试。',
  },
  {
    label: 'S13 · 模型能力不支持(model_disabled)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'model_disabled',
    title: '当前模型不支持此任务',
    body: '该模型不支持任务所需的功能，请更换模型后再试。',
  },
  {
    label: 'S13 · 模型能力不支持(local_model_not_loaded)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'local_model_not_loaded',
    title: '当前模型不支持此任务',
    body: '该模型不支持任务所需的功能，请更换模型后再试。',
  },
  {
    label: 'S12 · 等待超时(timeout)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'timeout',
    title: '等待回复超时',
    body: '长时间未收到 AI 的新回复，本次运行已停止，请稍后再试。',
  },
  {
    label: 'S12 · 等待超时(inactivity_timeout)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'inactivity_timeout',
    title: '等待回复超时',
    body: '长时间未收到 AI 的新回复，本次运行已停止，请稍后再试。',
  },
  {
    label: 'S22 · Open Design 自己的 bug',
    code: 'AGENT_RUNTIME_DEF_INVALID',
    title: 'Open Design 运行异常',
    body: '请尝试重新生成，或更换模型后重试。如果问题持续出现，请联系支持。',
  },
  {
    label: 'S23 · 跑完了但没生成文件',
    code: 'ARTIFACT_NOT_FOUND',
    title: '暂无可预览的文件',
    body: '本次任务没有可预览的文件，请补充需要生成的内容后再试。',
  },
  {
    label: 'S30 · 地区不支持(certificate_failure)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'certificate_failure',
    title: '当前地区暂不支持此服务',
    body: '暂不支持当前网络所在地区，请尝试切换网络后再试。',
  },
  {
    label: 'S30 · 地区不支持(proxy_configuration)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'proxy_configuration',
    title: '当前地区暂不支持此服务',
    body: '暂不支持当前网络所在地区，请尝试切换网络后再试。',
  },
  {
    label: 'S30 · 地区不支持(network_configuration)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'network_configuration',
    title: '当前地区暂不支持此服务',
    body: '暂不支持当前网络所在地区，请尝试切换网络后再试。',
  },
  {
    label: 'S30 · 地区不支持(host_policy_block)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'host_policy_block',
    title: '当前地区暂不支持此服务',
    body: '暂不支持当前网络所在地区，请尝试切换网络后再试。',
  },
  {
    label: 'S30 · 地区不支持(local_storage_failure)',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'local_storage_failure',
    title: '当前地区暂不支持此服务',
    body: '暂不支持当前网络所在地区，请尝试切换网络后再试。',
  },
];

describe('报错卡文案 = 飞书文档的润色列(逐字)', () => {
  for (const cell of SPEC_CELLS) {
    it(`${cell.label} 的标题是文档原文`, () => {
      renderFailure(cell.code, cell.failureDetail);
      expect(screen.getByTestId('chat-run-error-card')).toBeTruthy();
      expect(screen.getByText(cell.title)).toBeTruthy();
    });

    it(`${cell.label} 的正文是文档原文`, () => {
      renderFailure(cell.code, cell.failureDetail);
      expect(screen.getByTestId('chat-run-error-description').textContent).toBe(cell.body);
    });
  }
});

describe('这些格子不许再落到兜底句上', () => {
  for (const cell of SPEC_CELLS) {
    it(`${cell.label} 不出「这次没能顺利完成」`, () => {
      renderFailure(cell.code, cell.failureDetail);
      expect(screen.queryByText(/这次没能顺利完成/)).toBeNull();
    });
  }
});
