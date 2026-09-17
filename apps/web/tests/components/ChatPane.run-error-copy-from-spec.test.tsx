// @vitest-environment jsdom
/**
 * 报错卡的文案**必须逐字等于产品文档**,而不是研发自拟的近义句。
 *
 * 基础权威源是飞书《运行报错场景文案》(docx `S1Ucd1frUo7opCxGLbRcj3XTnvh`)。
 * S30 正文按产品后续批准稿 `L7ukd6xcqoWpo2xJzKdcDPctnvh`（revision 96）更新。
 * 每一格在文档里有三样东西:`原文时机`、`原文提示`(草稿,带按钮)、以及表格里的
 * **`润色标题` + `润色正文`**。只有后两列是终稿,所以这份测试钉的是**润色列**,
 * 一个字都不许差。
 *
 * 反过来也成立:**文档里没写的格,不许自拟,也不许拿邻格的话去凑**。文件末尾
 * 那个 S30 的 describe 钉的就是这一半 —— 那一格的润色行只适用于「地区不支持」,
 * 套到本机磁盘 / 系统策略失败上就成了错误诊断。
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

function failedTurn(code: string, failureDetail?: string, rawDetail = 'upstream said something in English'): ChatMessage[] {
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
          detail: rawDetail,
          code,
          ...(failureDetail ? { failureDetail } : {}),
        },
      ],
    } as unknown as ChatMessage,
  ];
}

function renderFailure(code: string, failureDetail?: string, rawDetail?: string) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={failedTurn(code, failureDetail, rawDetail)}
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
    label: 'S30 · 上游明确拒绝当前地区',
    code: 'AGENT_EXECUTION_FAILED',
    failureDetail: 'region_not_supported',
    title: '当前地区暂不支持此服务',
    body: '服务商暂不向你所在的地区提供服务，当前任务无法继续。',
  },
  // Only the dedicated daemon detail uses S30's region row. The five unrelated
  // environment causes below use their separate approved copy and retain their actions.
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

/**
 * S30 · 一次本机失败不许被说成「你所在的地区不支持」。
 *
 * 产品文档 S30 的场景名是「公司网络 / 代理 / 证书」,`原文时机` 列了三个成因
 * (地区不支持 / 证书校验失败 / 代理不可达),但 `润色标题` + `润色正文` 那张表
 * **只写了一行**,而且那一行的「场景内的情况」写死是**「地区不支持」**。
 *
 * web 把这张卡发给五个 detail,判据取自 `clientEnvironmentFailureDetail`
 * (`apps/daemon/src/run-failure-classification.ts`)—— 一个都不是地区拦截:
 *
 *   host_policy_block      Windows Application Control / AppLocker 拦住二进制启动
 *   local_storage_failure  本机 SQLite/WAL 读写失败(磁盘,不是网络)
 *   certificate_failure    TLS 信任链被拒(多半是公司中间盒)
 *   proxy_configuration    代理设置本身不对
 *   network_configuration  连接压根没建起来(ENOTFOUND / ECONNREFUSED / EHOSTUNREACH)
 *
 * 决定性的一条:daemon **有**地区拦截的判据,但它不在这五格里 —— 上游那句
 * `Country, region, or territory not supported` 命中 `isUpstreamClientErrorText`,
 * 现在细分到 `failure_detail: 'region_not_supported'`；普通上游 403 保持原分类。
 *
 * 所以不变量不是「S30 的字长什么样」,而是:**卡面不许对这五格给出地区拦截的
 * 诊断和处置**。对一次磁盘 I/O 失败说「暂不支持当前网络所在地区,请尝试切换
 * 网络后再试」,既是错误诊断,给的处置也一点用没有 —— 这正是把含糊的旧文案
 * 换成明确的错话时会发生的净劣化。
 */
const CLIENT_ENVIRONMENT_CELLS: readonly { detail: string; body: string }[] = [
  { detail: 'local_storage_failure', body: '文件无法写入磁盘。请确认有足够的剩余空间，且有权限保存到当前文件夹。' },
  { detail: 'host_policy_block', body: 'Windows 阻止了程序启动，请检查系统的安全设置。' },
  { detail: 'certificate_failure', body: '连接服务时未通过安全验证，请尝试更换网络。' },
  { detail: 'proxy_configuration', body: '当前设置的代理无法连接，请确认代理已开启、设置正确后再试。' },
  { detail: 'network_configuration', body: '暂时无法访问服务，请检查网络连接后再试。' },
];

/** 地区拦截专有的说法。任何一条出现在这五格上都是错误诊断。 */
const REGIONAL_DIAGNOSIS = [/地区/, /切换网络/];

describe('S30 · 够不上「地区拦截」的成因,不许被说成地区不支持', () => {
  for (const { detail, body } of CLIENT_ENVIRONMENT_CELLS) {
    it(`${detail} 的卡面不出现地区拦截的诊断或处置`, () => {
      const { container } = renderFailure('AGENT_EXECUTION_FAILED', detail);

      // 整张卡都查,标题和正文都不许出现。
      const card = container.querySelector('[data-testid="chat-run-error-card"]');
      expect(card, '这一格应该有自己的报错卡').toBeTruthy();
      for (const phrase of REGIONAL_DIAGNOSIS) {
        expect(card!.textContent ?? '').not.toMatch(phrase);
      }
    });

    it(`${detail} 的正文逐字使用补充文档为该成因批准的文案`, () => {
      renderFailure('AGENT_EXECUTION_FAILED', detail);
      // 正向的一半:摘掉地区文案之后,卡面仍然说得出这一格到底出了什么事,
      // 而不是退回一句谁都适用的空话。
      expect(screen.getByTestId('chat-run-error-description').textContent).toBe(body);
    });
  }

  it('五格的成因各说各的,没有被合并成同一句话', () => {
    const bodies = CLIENT_ENVIRONMENT_CELLS.map(({ detail }) => {
      renderFailure('AGENT_EXECUTION_FAILED', detail);
      const body = screen.getByTestId('chat-run-error-description').textContent ?? '';
      cleanup();
      return body;
    });
    expect(new Set(bodies).size).toBe(CLIENT_ENVIRONMENT_CELLS.length);
  });
});


describe('S30 · region copy follows the structured verdict, not raw English', () => {
  it('does not reinterpret a generic old-daemon 403 detail in the UI', () => {
    renderFailure(
      'AGENT_EXECUTION_FAILED',
      'upstream_client_error',
      'Country, region, or territory not supported',
    );
    const card = screen.getByTestId('chat-run-error-card');
    expect(card.textContent).not.toContain('当前地区暂不支持此服务');
    expect(card.textContent).not.toContain('服务商暂不向你所在的地区提供服务，当前任务无法继续。');
  });
});
