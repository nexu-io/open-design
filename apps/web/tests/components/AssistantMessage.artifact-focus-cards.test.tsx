// @vitest-environment jsdom

/**
 * 「这一轮显示哪些产物卡」交给 agent 决定 —— `<od-focus show="…">`。
 *
 * 产品拍的板(逐字):
 *   「这一轮显示哪些产物卡片也交给 agent 吧? 目的就是显示的精简一些并且是主要的
 *     产物,比如一个 html 可能会有 js 或 css 文件或者一堆图片文件,但最终主要的
 *     是这个 html,而不是其他杂七杂八的东西,所以让 agent 只显示这个 html」
 *   「一张都不显示那就不显示呗, 如果有重要的新创建的没给用户展示那是问题,
 *     但如果没什么重要的或者要让用户看的, 那就不展示呗没啥问题吧?」
 *
 * `show` 负责把一组权威产物收窄成主要交付物。没有 `show` 时不能把 daemon 已经
 * 归属到本轮的 `producedFiles` 清空:模型没发协议标记、旧会话还没有这个协议时,
 * 那份权威清单仍是 UI 能拿到的最强证据。只有正文猜测 / 工具写入、没有权威归属
 * 的文件仍然不兜底成卡。
 *
 * 结果面板有**两条互斥的渲染路**,两条都得收窄,否则会出现「卡片精简了、
 * 汇总行还写着 6 个文件」这种自相矛盾:
 *   · 有写 / 改工具记录时走 `FileOpsSummary`(`data-testid="file-ops-summary"`);
 *   · 没有时走 `ProducedFiles`(`data-artifact-card`)。
 *
 * 夹具照抄真机形状:`producedFiles` 里是 `ProjectFile` **对象**不是字符串;
 * `tool_use` 的 Write input 是 `{ file_path: "<绝对路径>" }`(真实录制里
 * `{"type":"tool_use","name":"Write","input":{"file_path":"/Users/…"}}`)。
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

const PROJECT_ID = 'c7e3b234-2fb3-4f6e-8aae-a3a00697c476';
const PROJECT_DIR = `/Users/elian/.od/projects/${PROJECT_ID}`;
const STARTED_AT = 1787794097356;
const ENDED_AT = 1787794110470;

function pf(name: string, kind: ProjectFile['kind'], mime: string): ProjectFile {
  return {
    name,
    path: name,
    localPath: `${PROJECT_DIR}/${name}`,
    type: 'file',
    size: 8961,
    mtime: STARTED_AT + 2_000,
    kind,
    mime,
  } as ProjectFile;
}

/** 产品原话里那一堆「杂七杂八」:一个 html + js + css + 一堆图片 */
const DELIVERABLE = pf('index.html', 'html', 'text/html; charset=utf-8');
const SIDECARS = [
  pf('styles.css', 'text', 'text/css'),
  pf('app.js', 'text', 'text/javascript'),
  pf('hero.png', 'image', 'image/png'),
  pf('logo.svg', 'image', 'image/svg+xml'),
  pf('bg.jpg', 'image', 'image/jpeg'),
];
const ALL_PRODUCED = [DELIVERABLE, ...SIDECARS];

/** 真实录制里的 Write 事件形状 */
function writeEvents(files: ProjectFile[]): ChatMessage['events'] {
  const out: NonNullable<ChatMessage['events']> = [
    { kind: 'status', label: 'starting', detail: 'claude' },
  ];
  files.forEach((file, index) => {
    const id = `toolu_01HNdFYEuHLHHAzkTkAXyu${index}`;
    out.push({
      kind: 'tool_use',
      id,
      name: 'Write',
      input: { file_path: `${PROJECT_DIR}/${file.name}` },
    } as never);
    out.push({ kind: 'tool_result', toolUseId: id, isError: false, content: 'ok' } as never);
  });
  out.push({ kind: 'text', text: '已完成，页面和配套资源都写好了。' });
  return out;
}

function turn(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '8832c4fd-ca02-4a30-8054-2ab5b7237898',
    role: 'assistant',
    content: '已完成，页面和配套资源都写好了。',
    runStatus: 'succeeded',
    startedAt: STARTED_AT,
    endedAt: ENDED_AT,
    createdAt: STARTED_AT,
    events: writeEvents(ALL_PRODUCED),
    producedFiles: ALL_PRODUCED,
    ...overrides,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <AssistantMessage
        message={message}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={ALL_PRODUCED}
        isLast
      />
    </CollabProvider>,
  );
}

/**
 * 结果面板上**用户实际看得到的那一组文件名**。
 *
 * 故意不区分「卡片」和「行」:`FileOpsSummary` 内部会把可预览的产物画成卡、
 * 其余画成行,这个划分是它自己的实现细节(而且正在被另一条分支重构)。
 * 这一组测试钉的是「显示了哪些文件」,所以取两者的并集 —— 内部怎么分栏改了
 * 也照样成立。
 */
function resultPanelNames(): string[] {
  const names = new Set<string>();
  for (const node of document.querySelectorAll('[data-artifact-card]')) {
    const id = node.getAttribute('data-testid') ?? '';
    if (id.startsWith('artifact-card-')) names.add(id.slice('artifact-card-'.length));
  }
  for (const node of document.querySelectorAll('[data-testid^="file-ops-row-"]')) {
    const id = node.getAttribute('data-testid') ?? '';
    if (id.startsWith('file-ops-row-') && !id.startsWith('file-ops-row-open-')) {
      names.add(id.slice('file-ops-row-'.length));
    }
  }
  return [...names].sort();
}

function focusEvent(show: string[]): NonNullable<ChatMessage['events']>[number] {
  return { kind: 'artifact_focus', show } as never;
}

describe('agent 声明的 show,决定这一轮出哪些卡', () => {
  /*
   * 反面 / 正面成对出现。少了「不发标记」那一条,把实现改成「永远只出第一张卡」
   * 也能让下面几条全绿。
   */
  it('不发标记 —— 保留 daemon 归属到本轮的权威产物', () => {
    renderTurn(turn());
    expect(resultPanelNames()).toEqual(ALL_PRODUCED.map((file) => file.name).sort());
  });

  /*
   * 「不声明就一张卡都没有」在真机上活不下来:W10 量出来只改已有文件的轮次声明率
   * 只有 22–25%(新建文件的轮次是 100%),于是大量轮次一张卡都不出 —— OPEND-2550
   * 的现场。产品裁决(方案 C):兜底,但只端主产物。
   *
   * 判据在 `pickPrimaryArtifacts`:页面 / 文档压过图片,`.js` `.css` `.svg`
   * `.json` 这类依赖永远不出卡。所以这一轮六个文件里只剩 index.html —— 既不是
   * 六张卡(标记就是为了消掉这个),也不是零张卡。
   */
  it('没有 daemon 产物归属、也没声明 —— 兜底只端主产物', () => {
    renderTurn(turn({ producedFiles: [] }));
    expect(resultPanelNames()).toEqual(['index.html']);
  });

  /*
   * 反面:图片不是永远的配角。少了这一条,把兜底写成「只留 html」也能全绿。
   */
  it('这一轮只出图 —— 图就是主产物', () => {
    const images = [
      pf('poster-a.png', 'image', 'image/png'),
      pf('poster-b.png', 'image', 'image/png'),
    ];
    renderTurn(turn({ producedFiles: [], events: writeEvents(images) }));
    expect(resultPanelNames()).toEqual(['poster-a.png', 'poster-b.png']);
  });

  /*
   * 明确不做「改了 app.js 就去找引用它的 index.html」:那要读本轮之外的文件,
   * 而宿主契约禁止把卡指向本轮没产出的文件。这一轮到底有多常见,靠
   * `run_finished.wrote_only_dependencies` 去量,不靠这里先开口子。
   */
  it('本轮只写了依赖文件 —— 一张卡都不出,不去本轮之外找宿主页面', () => {
    const deps = [pf('styles.css', 'text', 'text/css'), pf('app.js', 'text', 'text/javascript')];
    renderTurn(turn({ producedFiles: [], events: writeEvents(deps) }));
    expect(resultPanelNames()).toEqual([]);
  });

  it('声明只显示那个 html —— 汇总行里就只剩它一条', () => {
    renderTurn(turn({ events: [...(writeEvents(ALL_PRODUCED) ?? []), focusEvent(['index.html'])] }));
    expect(resultPanelNames()).toEqual(['index.html']);
  });

  it('声明两个交付物 —— 就出这两条,配套资源不出', () => {
    renderTurn(
      turn({
        producedFiles: [...ALL_PRODUCED, pf('report.md', 'text', 'text/markdown')],
        events: [...(writeEvents(ALL_PRODUCED) ?? []), focusEvent(['index.html', 'report.md'])],
      }),
    );
    expect(resultPanelNames()).toEqual(['index.html', 'report.md']);
  });

  /*
   * 打错字比不声明还多出六张卡,那条悬崖是说不通的:声明了什么就出什么,
   * 一个都对不上就一个都不出。
   */
  it('声明的全都对不上 —— 一张卡都不出', () => {
    renderTurn(
      turn({ events: [...(writeEvents(ALL_PRODUCED) ?? []), focusEvent(['nothing-here.html'])] }),
    );
    expect(resultPanelNames()).toEqual([]);
  });

  it('声明里混了一个没产出的文件 —— 只留下真产出的那个,不会凭空多一张卡', () => {
    renderTurn(
      turn({
        events: [...(writeEvents(ALL_PRODUCED) ?? []), focusEvent(['index.html', 'never-written.html'])],
      }),
    );
    expect(resultPanelNames()).toEqual(['index.html']);
  });

  it('一轮发了两枚 —— 按字段取最后一枚', () => {
    renderTurn(
      turn({
        events: [
          ...(writeEvents(ALL_PRODUCED) ?? []),
          focusEvent(['styles.css']),
          focusEvent(['index.html']),
        ],
      }),
    );
    expect(resultPanelNames()).toEqual(['index.html']);
  });

  /* `open` 只负责预览目标;它不能把 daemon 的权威清单当作不存在。 */
  it('只声明 open、没声明 show —— 仍保留权威产物', () => {
    renderTurn(
      turn({
        events: [
          ...(writeEvents(ALL_PRODUCED) ?? []),
          { kind: 'artifact_focus', open: 'index.html' } as never,
        ],
      }),
    );
    expect(resultPanelNames()).toEqual(ALL_PRODUCED.map((file) => file.name).sort());
  });
});

describe('另一条渲染路:没有写 / 改工具记录时的产物卡', () => {
  // 没有 tool_use 就没有 fileOps,`summaryArtifactOps` 为空,面板改走 ProducedFiles
  const noToolEvents = [
    { kind: 'status', label: 'starting', detail: 'claude' },
    { kind: 'text', text: '已完成。' },
  ] as ChatMessage['events'];

  it('不发标记 —— 没有工具记录也保留 daemon 的权威产物', () => {
    renderTurn(turn({ events: noToolEvents }));
    expect(resultPanelNames()).toEqual(ALL_PRODUCED.map((file) => file.name).sort());
    expect(document.querySelector('[data-testid="file-ops-summary"]')).toBeTruthy();
  });

  it('声明只显示那个 html —— 只出一张卡,而且就是它', () => {
    renderTurn(
      turn({ events: [...(noToolEvents ?? []), focusEvent(['index.html'])] as never }),
    );
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
    expect(screen.getByTestId('artifact-card-index.html')).toBeTruthy();
  });

  it('声明的全都对不上 —— 一张卡都不出', () => {
    renderTurn(
      turn({ events: [...(noToolEvents ?? []), focusEvent(['nope.html'])] as never }),
    );
    expect(document.querySelectorAll('[data-artifact-card]').length).toBe(0);
  });
});

describe('标记本身永远不进正文', () => {
  it('旧对话里落库的裸标记,渲染时也要剥掉', () => {
    const leaked = [
      '已完成。',
      '<od-focus key="c07a83a9bc73cbd6" open="index.html" show="index.html"/>',
      '页面已经写好了。',
    ].join('\n');
    renderTurn(turn({ content: leaked, events: [{ kind: 'text', text: leaked }] as never }));
    const shown = document.body.textContent ?? '';
    expect(shown).not.toContain('od-focus');
    expect(shown).not.toContain('c07a83a9bc73cbd6');
    expect(shown).not.toContain('open=');
    // 剥的是壳,不是字
    expect(shown).toContain('已完成。');
    expect(shown).toContain('页面已经写好了。');
  });

  it('长得像标记但不是的,一个字都不许动', () => {
    const innocent = '我们讨论了 `<od-focused>` 这种多一截的写法,以及 a<b 和 5 < 7。';
    renderTurn(turn({ content: innocent, events: [{ kind: 'text', text: innocent }] as never }));
    const shown = document.body.textContent ?? '';
    expect(shown).toContain('<od-focused>');
    expect(shown).toContain('5 < 7');
  });
});
