// @vitest-environment jsdom
/**
 * 一次 `Write` 在聊天里只应该是**一行**。
 *
 * 用户在真机上看到的是另一回事:一行「写入 design-manifesto-parchment.html」底下
 * 直接摊着几十行 HTML 源码的滚动预览(原话「这又是啥啊,不应该是一个普通工具调用的
 * 样式吗? 创建 xxx?」)。
 *
 * 那块东西**不是**执行记录里的工具行,是 `AssistantMessage` 在壳外另起的一张流式
 * 代码卡(`LiveCodeBox`):它读的是还没落库的半截工具入参 —— daemon 的
 * `tool_input_delta`(`claude-stream.ts:619`)把 `input_json_delta` 原样转出来,
 * `ProjectView` 按 tool id 累成字符串喂给它。所以它**只在流式期间存在**,
 * `tool_use` 一落库就换成执行记录里那一行,刷新页面也不会再出现。
 *
 * 依据:
 *  · `specs/current/chat-panel-feedback.md:422`(N4,用户当场裁决)——
 *    「Write 类工具应该只落**一行**(「写入 <文件名>」),不该把文件内容摊成代码块」
 *  · `specs/current/chat-panel-next.md:413`(D3)——「工具调用**无「执行中」档**,跑完才落行」
 *  · `specs/current/chat-panel-next.md:754`(B8)——「渲染时 tool_use 没有配对 tool_result 的不出行」
 *  · 被推翻的是 `specs/current/chat-panel-next.md:674` 接入时的临时安排
 *    (「位置不对但能力不丢」)——「不丢」现在由 N4 明确否掉。
 *
 * 红测证据(改之前跑过):把 `liveToolInput` 喂进 `AssistantMessage`,DOM 里出现
 * `[data-testid="live-code-box"]`,头是「写入 / design-manifesto-parchment.html」,
 * 身子是整份 HTML 源码的 `<pre>` —— 与用户截图逐格对得上。
 * 修好之后那条断言**没法再写**:喂进去的通道本身被删了,所以下面第三条改成
 * 守「通道不许回来」,前两条守「该有的样子」。
 *
 * 反面守卫:**带底色的正文块本身不是错的** —— 跑命令的终端输出就该有底色
 * (`chat-panel-next.md:995`、B13 / D19)。修 Write 不能顺手把终端那一档也弄没。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../../src/types';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

function activateExecutionRecord(container: HTMLElement): void {
  const summary = container.querySelector<HTMLElement>('.assistant-flow > details > summary');
  if (!summary) throw new Error('执行记录壳没有渲染出来');
  fireEvent.click(summary);
}

/** 文件正文里塞一句只会出现在源码里的话,用它判断「源码有没有被摊出来」 */
const SOURCE_MARKER = 'PARCHMENT_SOURCE_LEAKED';
const FILE_SOURCE = [
  '<!doctype html>',
  '<html lang="zh-CN">',
  '  <head><title>Design manifesto</title></head>',
  `  <body><h1>${SOURCE_MARKER}</h1></body>`,
  '</html>',
].join('\n');

const FILE_PATH = '/repo/design-manifesto-parchment.html';

function message(events: AgentEvent[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'succeeded',
    ...overrides,
  };
}

/** vitest 的 root 是 `apps/web`,源码按它取 */
const readSrc = (relative: string): string =>
  readFileSync(resolve(process.cwd(), 'src', relative), 'utf8');

describe('Write 只落一行(N4 / D3)', () => {
  it('Write 跑完只落一行:动词 + 文件名 + 改动量,没有源码', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        projectId="project-1"
        /* 文件名按钮要成立得凑齐两样:一个打开回调,和「这个路径属于当前项目」的
           正面证据(产品 2026-08-27:读取的文件一律不做链接,写 / 改要正面取证 ——
           `runtime/chat/record-file-open.ts`)。原来这两样一样都没给也照样能捞到
           一颗按钮,因为 `FileButton` 无论如何都吐 `<button>`,只是不挂 onClick。
           这一条测的是「Write 只落一行」,所以两样都给足,让那句断言测得到它
           本来要测的东西 —— 顺带守住「写 / 改这一档没被一起拆掉」。 */
        projectResolvedDir="/repo"
        onRequestOpenFile={() => {}}
        streaming={false}
        message={message([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Write',
            input: { file_path: FILE_PATH, content: FILE_SOURCE },
          },
          {
            kind: 'tool_result',
            toolUseId: 'tool-1',
            content: `File created successfully at: ${FILE_PATH}`,
            isError: false,
          },
        ])}
      />,
    );

    activateExecutionRecord(container);
    const body = container.querySelector<HTMLElement>('.assistant-flow > details > div');
    expect(body).not.toBeNull();
    /* 一行,不是一行 + 一块代码 */
    expect(body?.children.length).toBe(1);
    expect(body?.textContent ?? '').toContain('新建');
    expect(screen.getByRole('button', { name: '打开 design-manifesto-parchment.html' })).toBeTruthy();
    /* 5 行正文 → +5 −0 */
    expect(body?.textContent ?? '').toContain('+5');
    expect(container.textContent ?? '').not.toContain(SOURCE_MARKER);
  });

  it('还在流、结果没回来的 Write 一行都不落(D3)', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        projectId="project-1"
        streaming
        message={message(
          [
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: FILE_PATH, content: FILE_SOURCE },
            },
          ],
          { endedAt: undefined, runStatus: 'running' },
        )}
      />,
    );

    expect(container.querySelector('[data-testid="live-code-box"]')).toBeNull();
    expect(container.textContent ?? '').not.toContain(SOURCE_MARKER);
  });

  it('工具入参不再有通向流式代码卡的通道(N4 推翻了 chat-panel-next.md:674)', () => {
    /*
     * 这一条守的是**通道**,不是某一次渲染:喂料的 `liveToolInput` 链路
     * (ProjectView 累料 → ChatPane 穿透 → AssistantMessage 落成 `live-tool` 块)
     * 整条删掉了,所以前两条用例已经没有办法把源码喂进来。
     * 谁要把它接回来,得先在这里给出理由 —— 而不是悄悄多出一张卡。
     *
     * `StreamingCodeCard` 本体留着:还没闭合的 `<artifact type="text/html">`
     * 仍然要走它,否则半截 HTML 会当 markdown 正文漏出来(见 ProseBlock)。
     */
    const assistant = readSrc('components/AssistantMessage.tsx');
    expect(assistant).not.toContain('live-tool');
    expect(assistant).not.toContain('LiveCodeBox');
    expect(assistant).not.toContain('liveToolInput');
    expect(readSrc('components/ChatPane.tsx')).not.toContain('liveToolInput');
    expect(readSrc('components/ProjectView.tsx')).not.toContain('liveToolInput');
    /* <artifact> 那条流式通道**不动** */
    expect(assistant).toContain('StreamingCodeCard');
  });

  it('反面守卫:跑命令的终端输出照旧带正文块', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        projectId="project-1"
        streaming={false}
        message={message([
          {
            kind: 'tool_use',
            id: 'tool-9',
            name: 'Bash',
            input: { command: 'pnpm guard', description: '跑一遍 guard' },
          },
          {
            kind: 'tool_result',
            toolUseId: 'tool-9',
            content: '✓ guard passed\n✓ 12 files checked',
            isError: false,
          },
        ])}
      />,
    );

    activateExecutionRecord(container);
    fireEvent.click(screen.getByText('跑一遍 guard').closest('summary')!);
    const body = container.querySelector<HTMLElement>('.assistant-flow > details > div');
    expect(body?.textContent ?? '').toContain('pnpm guard');
    expect(body?.textContent ?? '').toContain('guard passed');
  });
});
