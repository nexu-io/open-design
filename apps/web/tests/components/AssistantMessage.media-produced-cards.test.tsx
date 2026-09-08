// @vitest-environment jsdom

/**
 * 媒体产物(音频 / 视频)在 ChatPanel 里到底出不出卡 —— Plane OPEND-2608 / 2609。
 *
 * 这两单是同一天由 QA 在 Beta 0.21.1-beta.7 上开的,结论却不一样:
 *  · 2609(音频):`produced_files_json`、`trace_object_files_json`、
 *    `telemetry_finalized_at` **全都已经落库**,右侧能放 MP3,左侧仍然没有卡。
 *    单子自己下的判断是「问题位于 ChatPanel 的产物展示 / 卡片映射链路」。
 *  · 2608(视频):同样没有卡,但 `produced_files_json` / `trace_object_files_json`
 *    / `telemetry_finalized_at` **都是 null** —— 单子自己下的判断是「运行结束后的
 *    消息产物归档 / 异步 finalization 未完成」。
 *
 * 这一组测试只回答**渲染层**那一半:给定一条已经把产物元数据落全了的
 * assistant message,卡到底画不画。它是分层的证据 —— 如果这里全绿,2609 说的
 * 「卡片映射链路」就不成立,而 2608 剩下的那一半(归档)就只能在持久化那一层复现。
 *
 * 夹具照抄单子里的定位证据,不自己编:
 *  · greeting-autumn-cn.mp3 —— 49,620 bytes,MIME `audio/mpeg`
 *  · nb-runner-reveal-5s.mp4 —— 1,895,240 bytes,MIME `video/mp4`
 * `produced_files_json` 里的元素是 **`ProjectFile` 对象**(同
 * `AssistantMessage.produced-card-turn-scope.test.tsx` 的那条注释),塞字符串会在
 * `f.name.toLowerCase()` 上炸掉整个会话视图。
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { CollabProvider } from '../../src/collab/collab-context';
import type { ChatMessage, ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const PROJECT_ID = 'cff92082-572f-4016-8ba0-ff4422891bd2';
const RUN_STARTED_AT = 1787900000000;
const RUN_ENDED_AT = RUN_STARTED_AT + 166_000;

function projectCollabValue() {
  return {
    workspaceContext: workspaceContextFixture({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    }),
    workspaceContextLoading: false,
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'allowed' as const,
    isOwner: false,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
  };
}

const AUDIO_FILE: ProjectFile = {
  name: 'greeting-autumn-cn.mp3',
  path: 'greeting-autumn-cn.mp3',
  localPath: `/Users/elian/.od/projects/${PROJECT_ID}/greeting-autumn-cn.mp3`,
  type: 'file',
  size: 49_620,
  mtime: RUN_STARTED_AT + 20_000,
  kind: 'audio',
  mime: 'audio/mpeg',
} as ProjectFile;

const VIDEO_FILE: ProjectFile = {
  name: 'nb-runner-reveal-5s.mp4',
  path: 'nb-runner-reveal-5s.mp4',
  localPath: `/Users/elian/.od/projects/${PROJECT_ID}/nb-runner-reveal-5s.mp4`,
  type: 'file',
  size: 1_895_240,
  mtime: RUN_STARTED_AT + 160_000,
  kind: 'video',
  mime: 'video/mp4',
} as ProjectFile;

/**
 * 一轮媒体生成 —— 它**有正文**(「音频已生成」这类完成文案)和「下一步建议」,
 * 但**没有 Write / Edit 工具行**:文件是媒体任务写进去的,不是 agent 用工具写的。
 *
 * 这一点很要命:`inferProducedFilesFromTurn` 见到正文 block 就整个放弃推断
 * (`AssistantMessage.tsx` 里那条 `blocks.some(kind === 'text')` 闸),所以媒体轮
 * 的产物卡**只能**来自落库的 `producedFiles`,没有任何本地兜底。
 */
function mediaTurn(
  opts: { producedFiles?: ProjectFile[] | undefined; focusShow?: string[] | undefined },
): ChatMessage {
  /*
   * 正文**故意不提文件名** —— 真机就是这样(OPEND-2598 逐字:「成功回复在左侧
   * ChatPanel 中只显示"图片已生成"」)。这条很要紧:正文里一旦出现文件名,
   * `recoverLinkedProjectFilesFromContent` 会把项目里的同名文件捞回来当产物,
   * 于是卡片靠「正文提过」而不是靠「已归档」画出来 —— 那样这一组测试证明的
   * 就不是归档链路了。
   */
  const events: unknown[] = [
    { kind: 'status', label: 'starting', detail: 'claude' },
    { kind: 'text', text: DONE_PROSE },
  ];
  if (opts.focusShow) events.push({ kind: 'artifact_focus', show: [...opts.focusShow] });
  const message: Record<string, unknown> = {
    id: 'msg-media',
    role: 'assistant',
    content: DONE_PROSE,
    runStatus: 'succeeded',
    startedAt: RUN_STARTED_AT,
    endedAt: RUN_ENDED_AT,
    createdAt: RUN_STARTED_AT,
    events: events as ChatMessage['events'],
  };
  if (opts.producedFiles !== undefined) message.producedFiles = opts.producedFiles;
  return message as unknown as ChatMessage;
}

const DONE_PROSE = '已生成。接下来你想做什么？';

function renderTurn(message: ChatMessage, projectFiles: ProjectFile[]) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <AssistantMessage
        message={message}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={projectFiles}
        isLast
      />
    </CollabProvider>,
  );
}

describe('OPEND-2609 · 音频产物已归档时,消息底部要出音频胶囊', () => {
  it('落库的 producedFiles 带 mp3、agent 也声明了 show —— 胶囊必须在', () => {
    renderTurn(
      mediaTurn({ producedFiles: [AUDIO_FILE], focusShow: [AUDIO_FILE.name] }),
      [AUDIO_FILE],
    );

    // 先证明这条消息真的渲染出来了,否则下面的断言是空过的
    expect(screen.getByText(/已生成/)).toBeTruthy();
    expect(
      document.querySelector('[data-testid="file-ops-audio"] audio'),
      '音频产物没画成组件 24 的胶囊',
    ).toBeTruthy();
  });

  it('模型没发 show 时,daemon 的权威 producedFiles 仍然要出胶囊', () => {
    renderTurn(mediaTurn({ producedFiles: [AUDIO_FILE] }), [AUDIO_FILE]);

    expect(screen.getByText(/已生成/)).toBeTruthy();
    expect(
      document.querySelector('[data-testid="file-ops-audio"] audio'),
      '没有 show 声明的那一轮把已归档的音频丢了',
    ).toBeTruthy();
  });
});

describe('OPEND-2608 · 视频产物已归档时,消息底部要出视频卡', () => {
  it('落库的 producedFiles 带 mp4 —— 视频卡必须在,且只有「导出」没有「发布」', () => {
    renderTurn(
      mediaTurn({ producedFiles: [VIDEO_FILE], focusShow: [VIDEO_FILE.name] }),
      [VIDEO_FILE],
    );

    const card = screen.getByTestId(`artifact-card-${VIDEO_FILE.name}`);
    expect(card.querySelector('video'), '视频卡没有画视频预览').toBeTruthy();
    expect(
      screen.queryByTestId(`artifact-card-publish-${VIDEO_FILE.name}`),
      '视频卡不该有 HTML 专属的「发布」(2608 验收标准)',
    ).toBeNull();
  });

  /**
   * 这一条钉住**归档缺失时渲染层救不回来**这件事 —— 也就是 2608 真机那条记录的
   * 形状:`produced_files_json` 是 null,事件流里只有 `artifact_focus`,文件确实
   * 躺在项目里。渲染层刻意不从正文 / mtime 猜产物(那会把上一轮的旧文件冒充成
   * 本轮产物,`AssistantMessage.produced-card-turn-scope.test.tsx` 钉过),
   * 所以这里没有卡是**正确的渲染行为**,缺陷在上游的持久化。
   *
   * 它在这里是为了防止有人日后「顺手」在渲染层加一条 mtime 兜底当作 2608 的修复。
   */
  it('producedFiles 没落库时渲染层不该凭空造卡(缺陷在归档,不在渲染)', () => {
    renderTurn(
      mediaTurn({ producedFiles: undefined, focusShow: [VIDEO_FILE.name] }),
      [VIDEO_FILE],
    );

    expect(screen.getByText(/已生成/)).toBeTruthy();
    expect(screen.queryByTestId(`artifact-card-${VIDEO_FILE.name}`)).toBeNull();
  });
});
