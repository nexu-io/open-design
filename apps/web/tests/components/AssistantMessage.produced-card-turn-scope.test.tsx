// @vitest-environment jsdom

/**
 * 产物卡的**出现时机** —— 只认「这一轮真的产出过」。
 *
 * 真机复现(2026-08-27,会话 `9a3a2f75-8f19-4906-9c47-c0e9547ab1a5`):用户只发了
 * 一句「你好」。这一轮**一个工具都没调**,daemon 给出的 `producedFiles` 是空数组,
 * 可回答里复述了上一轮的成果 ——
 *   「我已经为你创建了一份 Kami 羊皮纸单页文档(`design-manifesto-parchment.html`)」
 * —— 于是那份**上一轮**写的文件被正文里的这句话「找」了回来,底下压出一张整块的
 * 产物预览卡(带发布 / 导出)。用户当场指认:「按理说只有本轮增量的文件才会有呢」。
 *
 * 下面三条一起钉住这条不变量,缺一条都会让「什么都不渲染」这种回归蒙混过关:
 *  1. 打招呼那一轮 —— 一张卡都不许有;
 *  2. 同一份文件的 mtime 落在本轮跑的窗口里(这一轮真写了)—— 卡照出;
 *  3. daemon 把它算进 `producedFiles` —— 卡照出。
 *
 * 夹具全部照抄真机记录:`produced_files_json` 里的 `ProjectFile` 是**对象**,
 * 不是字符串(塞字符串会在 `f.name.toLowerCase()` 上炸掉整个会话视图)。
 *
 * 三条夹具都带一枚 `<od-focus show="…">`,**包括打招呼那一条**。产物卡改成
 * 「声明出来的」之后,不带声明的回合本来就一张卡都没有 —— 那样第 1 条会变成
 * 恒真,把它要论证的「本轮没产出」整个空过。声明照发、卡仍然不出,才说明拦住
 * 它的是轮次归属,不是缺一枚声明。
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

const ARTIFACT_NAME = 'design-manifesto-parchment.html';

// 打招呼那一轮的真实区间(真机:started 1787794097356 / ended 1787794110470)
const GREETING_STARTED_AT = 1787794097356;
const GREETING_ENDED_AT = 1787794110470;
// 上一轮写这份文件的落盘时间 —— 比这一轮早约 38 分钟,窗口外
const EARLIER_TURN_MTIME = 1787791794819.7522;

// 真机 `produced_files_json` 里那条记录,原样抄下来
function parchmentFile(mtime: number): ProjectFile {
  return {
    name: ARTIFACT_NAME,
    path: ARTIFACT_NAME,
    localPath: `/Users/elian/.od/projects/c7e3b234-2fb3-4f6e-8aae-a3a00697c476/${ARTIFACT_NAME}`,
    type: 'file',
    size: 8961,
    mtime,
    kind: 'html',
    mime: 'text/html; charset=utf-8',
    artifactKind: 'html',
  } as ProjectFile;
}

// 真机回答原文(events_json 里的 text 事件)
const GREETING_REPLY = [
  '你好！👋',
  '',
  `我已经为你创建了一份 Kami 羊皮纸单页文档（\`${ARTIFACT_NAME}\`），带有暖羊皮纸底、墨蓝单色 accent、编辑级排印，以及一个 SVG 示意占位区。`,
  '',
  '接下来你想做什么？',
].join('\n');

function greetingTurn(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '8832c4fd-ca02-4a30-8054-2ab5b7237898',
    role: 'assistant',
    content: GREETING_REPLY,
    runStatus: 'succeeded',
    startedAt: GREETING_STARTED_AT,
    endedAt: GREETING_ENDED_AT,
    createdAt: GREETING_STARTED_AT,
    // 一个 tool_use 都没有 —— 这一轮只是打了个招呼
    events: [
      { kind: 'status', label: 'starting', detail: 'claude' },
      { kind: 'thinking', text: '用户只是说了"你好"。这是一个问候。' },
      { kind: 'text', text: GREETING_REPLY },
      // agent 声明「这份文件值一张卡」。它是否真的出卡,仍由轮次归属说了算。
      { kind: 'artifact_focus', show: [ARTIFACT_NAME] },
    ] as ChatMessage['events'],
    // daemon 的权威结论:这一轮什么都没产出
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage, projectFiles: ProjectFile[]) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="c7e3b234-2fb3-4f6e-8aae-a3a00697c476"
        projectFiles={projectFiles}
        isLast
      />
    </CollabProvider>,
  );
}

describe('artifact card turn scope', () => {
  it('gives a bare greeting no artifact card, even when its prose names an earlier turn的文件', () => {
    renderTurn(greetingTurn(), [parchmentFile(EARLIER_TURN_MTIME)]);

    // 先证明这条消息**确实渲染出来了** —— 否则下面三条 null 断言是空过的
    expect(screen.getByText(/接下来你想做什么/)).toBeTruthy();

    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="produced-files"]')).toBeNull();
    expect(screen.queryByTestId('file-ops-summary')).toBeNull();
  });

  it('still cards the file when this turn is the one that wrote it (mtime inside the run)', () => {
    // 同一条消息、同一份正文,只把落盘时间挪进本轮窗口 —— 卡必须回来
    renderTurn(greetingTurn(), [parchmentFile(GREETING_STARTED_AT + 2_000)]);

    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
    expect(screen.getByTestId(`artifact-card-${ARTIFACT_NAME}`)).toBeTruthy();
  });

  it('still cards the file when the daemon attributed it to this turn', () => {
    const file = parchmentFile(EARLIER_TURN_MTIME);
    renderTurn(greetingTurn({ producedFiles: [file] }), [file]);

    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
    expect(screen.getByTestId(`artifact-card-${ARTIFACT_NAME}`)).toBeTruthy();
  });
});
