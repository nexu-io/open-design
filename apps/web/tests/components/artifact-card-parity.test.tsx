// @vitest-environment jsdom

/**
 * 产物卡的**两条渲染路径必须长一样**,而且要长成设计稿的样子。
 *
 * `AssistantMessage` 有两条互斥的产物面板:
 *  · 这一轮有 write/edit 工具行 → `FileOpsSummary`
 *  · 没有工具行但有产出/找回的文件 → `ProducedFiles`
 * 它们在 P0 `recvqaerXd82bE` 之后变成了「不同时出」,但**没有变成一致** ——
 * 卡面形状、按钮集合、导出行为各写了一份。
 *
 * 权威是 `docs/design/chat-panel-next.html` 组件 14(修订 `1bbdce0b06`,
 * md5 `28ea4c65…`),它的 `.cmp-ops` 散文和 `components.css` 注释就是规格:
 *  · 动作明摆在**右上角**,两枚:发布 / 导出。不收进菜单,不看第几轮。
 *  · **发布只有 HTML 产物有**;md / csv / 图片 / 视频那类右上角只剩一枚「导出」。
 *  · OPEND-2559 supersedes the old icon asymmetry: both actions carry their
 *    matching toolbar semantics (share-forward / export-download).
 *  · 没有「预览」,没有「⋯」。
 *
 * 稿子里**没有任何**「只有最后一轮才给动作」的说法。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { FileOpsSummary } from '../../src/components/FileOpsSummary';
import { RemixIcon } from '../../src/components/RemixIcon';
import { REMIX_ICON_PATHS } from '../../src/components/remix-icon-paths';
import { CollabProvider } from '../../src/collab/collab-context';
import type { ChatMessage, ProjectFile } from '../../src/types';
import type { FileOpEntry } from '../../src/runtime/file-ops';
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

  const style = document.createElement('style');
  style.textContent = [
    'tokens.css',
    'primitives.css',
    'shell.css',
    'workspace/drawer.css',
    'viewer/tools.css',
  ].map((file) => readFileSync(resolve(__dirname, '../../src/styles', file), 'utf8')).join('\n');
  document.head.append(style);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const PROJECT_ID = 'c7e3b234-2fb3-4f6e-8aae-a3a00697c476';

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

const RUN_STARTED_AT = 1787794097356;
const RUN_ENDED_AT = 1787794110470;

/**
 * 夹具照抄真机 `produced_files_json`(见
 * `AssistantMessage.produced-card-turn-scope.test.tsx` 的同一条注释):
 * `producedFiles` 的元素是 **`ProjectFile` 对象**,不是字符串 —— 塞字符串会在
 * `f.name.toLowerCase()` 上把整个会话视图炸掉。
 */
function projectFile(name: string, overrides: Partial<ProjectFile> = {}): ProjectFile {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const kind =
    ext === 'html' ? 'html'
    : ext === 'png' || ext === 'jpg' ? 'image'
    : ext === 'mp4' ? 'video'
    : ext === 'mp3' || ext === 'wav' ? 'audio'
    : 'text';
  return {
    name,
    path: name,
    localPath: `/Users/elian/.od/projects/${PROJECT_ID}/${name}`,
    type: 'file',
    size: 8961,
    mtime: RUN_STARTED_AT + 2_000,
    kind,
    mime: 'application/octet-stream',
    ...overrides,
  } as ProjectFile;
}

function fileOpEntry(path: string): FileOpEntry {
  return {
    path,
    fullPath: `/repo/${path}`,
    ops: ['write'],
    opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
    total: 1,
    status: 'done',
  };
}

/** 有工具行的那一轮 —— 走 `FileOpsSummary`。 */
function toolOpTurn(names: string[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  const events: unknown[] = [{ kind: 'status', label: 'starting', detail: 'claude' }];
  for (const [index, name] of names.entries()) {
    events.push({
      kind: 'tool_use',
      id: `toolu_${index}`,
      name: 'Write',
      input: { file_path: `/Users/elian/.od/projects/${PROJECT_ID}/${name}`, content: 'x' },
    });
    events.push({ kind: 'tool_result', id: `toolu_${index}`, content: 'ok' });
  }
  events.push({ kind: 'text', text: '做完了。' });
  // 产物卡是 agent 声明出来的(`<od-focus show="…">`),两条路都一样 —— 这一组
  // 讲的是「同一批文件在两条路上长得一不一样」,所以两边都把它声明出来。
  events.push({ kind: 'artifact_focus', show: [...names] });
  return {
    id: 'msg-tool-ops',
    role: 'assistant',
    content: '做完了。',
    runStatus: 'succeeded',
    startedAt: RUN_STARTED_AT,
    endedAt: RUN_ENDED_AT,
    createdAt: RUN_STARTED_AT,
    events: events as ChatMessage['events'],
    producedFiles: names.map((name) => projectFile(name)),
    ...overrides,
  } as ChatMessage;
}

/** 没有工具行、只有产出的那一轮 —— 走 `ProducedFiles` 那条回退支。 */
function producedOnlyTurn(names: string[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-produced-only',
    role: 'assistant',
    content: '做完了。',
    runStatus: 'succeeded',
    startedAt: RUN_STARTED_AT,
    endedAt: RUN_ENDED_AT,
    createdAt: RUN_STARTED_AT,
    events: [
      { kind: 'status', label: 'starting', detail: 'claude' },
      { kind: 'text', text: '做完了。' },
      { kind: 'artifact_focus', show: [...names] },
    ] as ChatMessage['events'],
    producedFiles: names.map((name) => projectFile(name)),
    ...overrides,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage, extra: Record<string, unknown> = {}) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <AssistantMessage
        message={message}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={(message.producedFiles ?? []) as ProjectFile[]}
        isLast
        {...extra}
      />
    </CollabProvider>,
  );
}

/** 一张卡上的动作按钮 id,按渲染顺序 —— 两条路径要给出同一串。 */
function actionIdsOn(card: HTMLElement): string[] {
  return Array.from(card.querySelectorAll('.artifact-card-act')).map(
    (node) => node.getAttribute('data-testid') ?? '?',
  );
}

/** 这次渲染里所有产物卡的「文件名 → 动作列表」快照。 */
function cardSnapshot(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const card of Array.from(
    document.querySelectorAll<HTMLElement>('[data-artifact-card]'),
  )) {
    const id = card.getAttribute('data-testid') ?? '?';
    out[id.replace(/^artifact-card-/, '')] = actionIdsOn(card);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 1 · 动作不看第几轮(设计稿里没有 isLast 这一档)
 * ------------------------------------------------------------------ */
describe('产物卡的动作不按轮次发放', () => {
  it('把发布 / 导出留在**历史轮次**的 HTML 卡上', () => {
    const onArtifactShare = vi.fn();
    const onArtifactDownload = vi.fn();
    renderTurn(producedOnlyTurn(['landing.html']), {
      isLast: false,
      onArtifactShare,
      onArtifactDownload,
    });

    // 先证明这条消息真的渲染出了卡 —— 否则下面两条断言是空过的
    const card = screen.getByTestId('artifact-card-landing.html');
    expect(card).toBeTruthy();

    expect(
      within(card).queryByTestId('artifact-card-publish-landing.html'),
      '历史轮次的 HTML 卡丢了「发布」—— 稿子里没有 isLast 这一档',
    ).toBeTruthy();
    expect(
      within(card).queryByTestId('artifact-card-export-landing.html'),
      '历史轮次的卡丢了「导出」',
    ).toBeTruthy();
  });

  it('最后一轮当然也还在(反向对照:不许靠「一律不发」蒙混)', () => {
    renderTurn(producedOnlyTurn(['landing.html']), {
      onArtifactShare: vi.fn(),
      onArtifactDownload: vi.fn(),
    });
    const card = screen.getByTestId('artifact-card-landing.html');
    expect(within(card).queryByTestId('artifact-card-publish-landing.html')).toBeTruthy();
    expect(within(card).queryByTestId('artifact-card-export-landing.html')).toBeTruthy();
  });

  it('非 HTML 卡在任何轮次都只有一枚「导出」(grid 32)', () => {
    renderTurn(producedOnlyTurn(['poster.png']), {
      isLast: false,
      onArtifactShare: vi.fn(),
      onArtifactDownload: vi.fn(),
    });
    const card = screen.getByTestId('artifact-card-poster.png');
    expect(within(card).queryByTestId('artifact-card-publish-poster.png')).toBeNull();
    expect(within(card).queryByTestId('artifact-card-export-poster.png')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * 2 · 两条路径给出同一副卡
 * ------------------------------------------------------------------ */
describe('两条产物面板路径给出同一副卡', () => {
  const NAMES = ['landing.html', 'notes.md', 'poster.png', 'theme.mp3'];

  it('同一批文件,有工具行和没工具行渲染出同样的卡与同样的动作', () => {
    const first = renderTurn(toolOpTurn(NAMES), {
      onArtifactShare: vi.fn(),
      onArtifactDownload: vi.fn(),
    });
    // 走的确实是 `FileOpsSummary` 那条支
    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    const viaToolOps = cardSnapshot();
    const audioViaToolOps = !!document.querySelector('[data-testid="file-ops-audio"]');
    first.unmount();

    renderTurn(producedOnlyTurn(NAMES), {
      onArtifactShare: vi.fn(),
      onArtifactDownload: vi.fn(),
    });
    const viaProduced = cardSnapshot();
    const audioViaProduced = !!document.querySelector('[data-testid="file-ops-audio"]');

    // 先证明两边都真的画了东西
    expect(Object.keys(viaToolOps).length, '工具行那条支一张卡都没画').toBeGreaterThan(0);
    expect(Object.keys(viaProduced).length, '产出回退那条支一张卡都没画').toBeGreaterThan(0);

    expect(viaProduced).toEqual(viaToolOps);
    expect(audioViaProduced, '两条支对音频的处理不一致').toBe(audioViaToolOps);
  });
});

/* ------------------------------------------------------------------ *
 * 3 · 图片卡展示完整画面，且不改变视频 / HTML 的专用预览
 * ------------------------------------------------------------------ */
describe('产物卡缩略图适配', () => {
  it('图片卡声明完整画面适配，视频与 HTML 仍走各自的专用预览', () => {
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[
            fileOpEntry('portrait.png'),
            fileOpEntry('portrait.mp4'),
            fileOpEntry('landing.html'),
          ]}
          projectId={PROJECT_ID}
        />
      </CollabProvider>,
    );

    const imageCard = screen.getByTestId('artifact-card-portrait.png');
    const videoCard = screen.getByTestId('artifact-card-portrait.mp4');
    const htmlCard = screen.getByTestId('artifact-card-landing.html');

    expect(imageCard.querySelector('img')?.getAttribute('data-preview-fit')).toBe('contain');
    expect(videoCard.querySelector('video')).toBeTruthy();
    expect(videoCard.querySelector('[data-preview-fit]')).toBeNull();
    expect(htmlCard.querySelector('img, video')).toBeNull();
    expect(htmlCard.querySelector('[data-preview-fit]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 4 · 音频永远是那条胶囊,不套卡壳
 * ------------------------------------------------------------------ */
describe('音频产物', () => {
  it('在**没有工具行**的那条支上也画成胶囊,不是一张 doc 卡', () => {
    renderTurn(producedOnlyTurn(['theme.mp3']), {
      onArtifactShare: vi.fn(),
      onArtifactDownload: vi.fn(),
    });

    expect(
      document.querySelector('[data-testid="file-ops-audio"] audio'),
      '产出回退那条支没用组件 24 的胶囊画音频',
    ).toBeTruthy();
    expect(
      document.querySelector('[data-artifact-card][data-testid="artifact-card-theme.mp3"]'),
      '又把音频套回大卡片里了',
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 5 · Plane OPEND-2559: 分享 / 导出都带各自的语义图标
 * ------------------------------------------------------------------ */
describe('动作胶囊的字形', () => {
  it('「分享」使用与右上角一致的 share-forward 图标,「导出」保留下载图标', () => {
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('landing.html')]}
          projectId={PROJECT_ID}
          onPublish={vi.fn()}
          onExport={vi.fn()}
        />
      </CollabProvider>,
    );

    const publish = screen.getByTestId('artifact-card-publish-landing.html');
    const exportAct = screen.getByTestId('artifact-card-export-landing.html');
    const shareIcon = publish.querySelector('svg');
    expect(shareIcon, '「分享」没有补上与右上角一致的语义图标').toBeTruthy();
    expect(shareIcon).toHaveAttribute('aria-hidden', 'true');
    expect(shareIcon).toHaveAttribute('width', '12');
    expect(shareIcon).toHaveAttribute('height', '12');
    expect(shareIcon?.querySelector('path')).toHaveAttribute(
      'd',
      REMIX_ICON_PATHS['share-forward-line'],
    );
    expect(publish).toHaveAttribute('aria-haspopup', 'menu');
    expect(publish).toHaveTextContent('Share');

    // 反向对照:导出仍必须有它自己的图标,不能为了“统一”改成同一枚字形。
    expect(exportAct.querySelector('svg'), '「导出」丢了原有下载图标').toBeTruthy();
  });

  it('与右上角文件操作按钮使用同一套紧凑尺寸', () => {
    render(
      <div className="app">
        <div className="ws-tabs-actions">
          <button
            type="button"
            className="chrome-action chrome-action-secondary chrome-action-with-label chrome-action-text-only chrome-action-unified chrome-action-dark"
            data-testid="reference-file-export"
          >
            <RemixIcon name="download-line" size={15} />
            <span>Export</span>
          </button>
        </div>
        <CollabProvider value={projectCollabValue()}>
          <FileOpsSummary
            entries={[fileOpEntry('landing.html')]}
            projectId={PROJECT_ID}
            onPublish={vi.fn()}
            onExport={vi.fn()}
          />
        </CollabProvider>
      </div>,
    );

    const reference = getComputedStyle(screen.getByTestId('reference-file-export'));
    const artifact = getComputedStyle(screen.getByTestId('artifact-card-export-landing.html'));
    // OPEND-2560 only supersedes the old pill's outer height: it must match
    // the compact file-toolbar action. Internal spacing/type remains the
    // PR7170 artifact specification rather than inheriting toolbar styling.
    //
    // 先把参照物钉死再比:两边同时算出 `auto` 的话 `toBe(reference.height)` 会
    // 恒真,这条断言就成了一句空话。28px 来自 `workspace/drawer.css` 的
    // `.app .ws-tabs-actions .chrome-action`,也就是截图里被圈住的那一组。
    expect(reference.height, '参照的右上角按钮没有量到高度,下面那条比较是空的').toBe('28px');
    expect(artifact.height).toBe('28px');
    expect(artifact.height).toBe(reference.height);
    expect(artifact.minHeight).toBe('28px');
    expect({
      paddingBlock: [artifact.paddingTop, artifact.paddingBottom],
      paddingInline: [artifact.paddingLeft, artifact.paddingRight],
      fontSize: artifact.fontSize,
      fontWeight: artifact.fontWeight,
      lineHeight: artifact.lineHeight,
      gap: artifact.gap,
    }).toEqual({
      paddingBlock: ['4px', '4px'],
      paddingInline: ['8px', '8px'],
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: 'normal',
      gap: '6px',
    });

    const artifactIcon = getComputedStyle(screen.getByTestId('artifact-card-export-landing.html').querySelector('svg')!);
    expect([artifactIcon.width, artifactIcon.height]).toEqual(['12px', '12px']);

    const actions = getComputedStyle(
      screen.getByTestId('artifact-card-export-landing.html').parentElement!,
    );
    expect([
      actions.top,
      actions.getPropertyValue('inset-inline-end'),
      actions.gap,
    ]).toEqual(['8px', '8px', '4px']);
  });

  /*
   * PR #7170 `components.css` 把动作浮层整块改了:12px 边距收到 8px、实底
   * `#353535` 换成半透明玻璃 + 背景模糊 + 内描边,并补了一条不支持 backdrop-filter
   * 时的兜底。逐条量**计算样式**,不 diff CSS 文本 —— 层叠反转在文本里看不见,
   * 而这块浮层压在 `primitives.css` 的裸 `button` 规则上面,本来就是要抢层叠的。
   */
  it('动作浮层逐条对齐最新设计稿(玻璃底 / 模糊 / 内描边 / 药丸圆角)', () => {
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('landing.html')]}
          projectId={PROJECT_ID}
          onRequestOpenFile={vi.fn()}
          onPublish={vi.fn()}
          onExport={vi.fn()}
        />
      </CollabProvider>,
    );

    const act = getComputedStyle(screen.getByTestId('artifact-card-export-landing.html'));
    expect({
      display: act.display,
      alignItems: act.alignItems,
      borderRadius: act.borderRadius,
      background: act.backgroundColor,
      color: act.color,
      backdropFilter: act.getPropertyValue('backdrop-filter'),
      boxShadow: act.boxShadow,
      whiteSpace: act.whiteSpace,
      textDecoration: act.textDecorationLine || act.textDecoration,
    }).toEqual({
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-pill)',
      background: 'rgba(18, 18, 18, 0.6)',
      color: 'rgb(255, 255, 255)',
      backdropFilter: 'blur(var(--glass-regular-blur)) saturate(140%)',
      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, #fff 16%, transparent), 0 2px 8px rgb(0 0 0 / 12%)',
      whiteSpace: 'nowrap',
      textDecoration: 'none',
    });

    // 动作可达性:整张卡是「打开」的热区,动作那一排必须压在它**上面**,
    // 否则两枚胶囊点下去只会打开文件。
    const cardEl = screen.getByTestId('artifact-card-landing.html');
    const openLayer = getComputedStyle(cardEl.querySelector('.artifact-card-open')!);
    const actsLayer = getComputedStyle(cardEl.querySelector('.artifact-card-acts')!);
    expect(Number(actsLayer.zIndex)).toBeGreaterThan(Number(openLayer.zIndex));
    // 而且它只占右上角一小块 —— 不是铺满整张卡把预览挡掉。
    expect(actsLayer.position).toBe('absolute');
    expect(actsLayer.bottom === 'auto' || actsLayer.bottom === '').toBe(true);

    // 卡壳与缩略图的圆角仍走共享 radius 令牌 —— 没有人往这块塞裸 16px。
    const card = getComputedStyle(cardEl);
    const thumb = getComputedStyle(cardEl.querySelector('.artifact-card-thumb')!);
    expect(card.borderRadius).toBe('var(--radius-lg)');
    expect(thumb.borderRadius).toBe('calc(var(--radius) - 1px)');
  });
});

/* ------------------------------------------------------------------ *
 * 6 · 导出:单格式直接下载,多格式才把菜单交给预览区
 * ------------------------------------------------------------------ */
describe('导出行为', () => {
  it('单格式产物(md)点「导出」直接下载,不弹任何东西', () => {
    const onExport = vi.fn();
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('notes.md')]}
          projectId={PROJECT_ID}
          onExport={onExport}
        />
      </CollabProvider>,
    );

    const act = screen.getByTestId('artifact-card-export-notes.md');
    expect(act.tagName, 'md 的导出应该就是一条下载链接').toBe('A');
    expect(act.getAttribute('download')).toBe('notes.md');
    fireEvent.click(act);
    expect(onExport, 'md 不该绕道预览区的导出菜单').not.toHaveBeenCalled();
  });

  it('单格式产物(png)同样直接下载', () => {
    const onExport = vi.fn();
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('poster.png')]}
          projectId={PROJECT_ID}
          onExport={onExport}
        />
      </CollabProvider>,
    );

    const act = screen.getByTestId('artifact-card-export-poster.png');
    expect(act.tagName).toBe('A');
    expect(act.getAttribute('download')).toBe('poster.png');
    expect(onExport).not.toHaveBeenCalled();
  });

  it('多格式产物(html)是按钮,点它把菜单交给预览区(反向对照)', () => {
    const onExport = vi.fn();
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('landing.html')]}
          projectId={PROJECT_ID}
          onExport={onExport}
        />
      </CollabProvider>,
    );

    const act = screen.getByTestId('artifact-card-export-landing.html');
    expect(act.tagName, 'html 的导出要开菜单,所以是按钮不是链接').toBe('BUTTON');
    expect(act.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(act);
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * 7 · 卡上两枚都**复用预览区那两块菜单**,自己不另画
 * ------------------------------------------------------------------ *
 * 产品 2026-08-27 看到卡上自制的窄浮层之后当场推翻:
 *   「为啥这个发布弹窗是这样的?? 为啥不直接复用现在那个分享弹窗??」
 *   「导出这个样式也不对呢, 为啥不直接复用?」
 *
 * 所以卡上**不再有自己的菜单**。两枚胶囊只做一件事:把「在哪儿开」告诉预览区,
 * 由预览区把它**本来那块**菜单开在这枚按钮旁边。位置那条口径不变:
 *   「都直接显示在卡片导出发布的按钮附近,动态根据上下空间判断是显示在按钮
 *     上面还是下面」。
 *
 * 稿子对「发布点下去之后长什么样」仍旧一个字没写(全稿 24 个组件里「发布」只在
 * 组件 14 的卡上出现过一次)—— 现在由产品指定了,答案是「就用现在那块」。
 */
describe('卡上的两枚胶囊复用预览区的菜单', () => {
  function renderHtmlCard(overrides: Record<string, unknown> = {}) {
    return render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('landing.html')]}
          projectId={PROJECT_ID}
          onPublish={vi.fn()}
          onExport={vi.fn()}
          {...overrides}
        />
      </CollabProvider>,
    );
  }

  it('卡上不再自造发布菜单 —— 点一下就把「在哪儿开」交出去', () => {
    const onPublish = vi.fn();
    renderHtmlCard({ onPublish });

    const act = screen.getByTestId('artifact-card-publish-landing.html');
    expect(act).toHaveTextContent('Share');
    fireEvent.click(act);

    // 自制的那枚窄浮层必须消失
    expect(
      screen.queryByTestId('artifact-publish-popover'),
      '卡上还留着自造的发布菜单',
    ).toBeNull();
    // 交出去的是「哪份产物 + 锚在哪枚按钮上」
    expect(onPublish).toHaveBeenCalledTimes(1);
    const [name, anchorId] = onPublish.mock.calls[0] as [string, string];
    expect(name).toBe('landing.html');
    expect(anchorId, '没有把锚点交出去,预览区无从知道开在哪儿').toBeTruthy();
    // 锚点必须能在文档里找回来 —— 菜单是几百毫秒之后才挂上的
    expect(document.querySelector(`[data-artifact-anchor="${anchorId}"]`)).toBe(act);
  });

  it('卡上也不再自造导出格式菜单', () => {
    const onExport = vi.fn();
    renderHtmlCard({ onExport });

    const act = screen.getByTestId('artifact-card-export-landing.html');
    fireEvent.click(act);

    expect(
      screen.queryByTestId('artifact-export-popover'),
      '卡上还留着自造的导出菜单',
    ).toBeNull();
    expect(onExport).toHaveBeenCalledTimes(1);
    const [name, anchorId] = onExport.mock.calls[0] as [string, string];
    expect(name).toBe('landing.html');
    expect(document.querySelector(`[data-artifact-anchor="${anchorId}"]`)).toBe(act);
  });

  it('两枚锚点互不相同 —— 否则发布会开到导出那枚上', () => {
    const onPublish = vi.fn();
    const onExport = vi.fn();
    renderHtmlCard({ onPublish, onExport });
    fireEvent.click(screen.getByTestId('artifact-card-publish-landing.html'));
    fireEvent.click(screen.getByTestId('artifact-card-export-landing.html'));
    expect(onPublish.mock.calls[0]?.[1]).not.toBe(onExport.mock.calls[0]?.[1]);
  });

  it('前后两轮产出同名文件时,第二轮按钮仍有独立锚点', () => {
    const firstPublish = vi.fn();
    const secondPublish = vi.fn();
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('landing.html')]}
          projectId={PROJECT_ID}
          onPublish={firstPublish}
        />
        <FileOpsSummary
          entries={[fileOpEntry('landing.html')]}
          projectId={PROJECT_ID}
          onPublish={secondPublish}
        />
      </CollabProvider>,
    );

    const [firstButton, secondButton] = screen.getAllByTestId('artifact-card-publish-landing.html');
    fireEvent.click(firstButton!);
    fireEvent.click(secondButton!);

    const firstAnchorId = firstPublish.mock.calls[0]?.[1] as string;
    const secondAnchorId = secondPublish.mock.calls[0]?.[1] as string;
    expect(secondAnchorId).not.toBe(firstAnchorId);
    expect(document.querySelector(`[data-artifact-anchor="${secondAnchorId}"]`)).toBe(secondButton);
  });

  it('单格式产物照旧直接下载,压根不惊动预览区(反向对照)', () => {
    const onExport = vi.fn();
    render(
      <CollabProvider value={projectCollabValue()}>
        <FileOpsSummary
          entries={[fileOpEntry('notes.md')]}
          projectId={PROJECT_ID}
          onExport={onExport}
        />
      </CollabProvider>,
    );
    const act = screen.getByTestId('artifact-card-export-notes.md');
    expect(act.tagName).toBe('A');
    fireEvent.click(act);
    expect(onExport).not.toHaveBeenCalled();
  });
});
