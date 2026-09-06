// @vitest-environment jsdom

/**
 * W92 · 子目录里的产物,卡片点了打不开、封面永远画不出来。
 *
 * ── 现场(2026-09-02 真机,web `127.0.0.1:17573` / daemon `127.0.0.1:17456`)──
 * 项目 `78ff635a-9bbf-4555-8dc7-ec0290028b53` 的一轮回答产出:
 *
 *   DESIGN.md  README.md  SKILL.md  colors_and_type.css
 *   assets/README.md  context/provenance.md  examples/source-index.html
 *
 * 拿 daemon 直接量,`/raw/` 的判据干净利落:
 *
 *   DESIGN.md                   200
 *   SKILL.md                    200
 *   provenance.md               404   ← 卡片交出去的
 *   context/provenance.md       200   ← 文件实际在这
 *   source-index.html           404   ← 卡片交出去的
 *   examples/source-index.html  200   ← 文件实际在这
 *
 * 在根目录的能开、在子目录的全 404。用户报的那四张卡里三张恰好在根,所以
 * 看起来「有的能开」—— 那是巧合,不是部分正常。
 *
 * ── 根因 ────────────────────────────────────────────────────────────────
 * `runtime/file-ops.ts` 的 `deriveFileOps` 把 agent 给的绝对路径截成**基名**
 * (`path: basename(fullPath)`),而右侧工作区是按**项目相对路径**开 tab 的
 * (`requestOpenFile` → `FileWorkspace` 拿 `ProjectFile.name` 匹配,daemon
 * `GET /files` 给的就是 `context/provenance.md` 这种形状)。基名开不出来:
 * tab 建不起来,活动 tab 静默回落到「设计文件」,没有任何提示。
 *
 * 同一个基名还被**四个消费者**共用,所以一处截断、四处中招:
 *   ① 点开        → `onOpen(item.name)`
 *   ② 卡面封面    → `projectFileUrl(projectId, item.name)`,404 ⇒ 灰卡
 *   ③ 导出 / 分享 → 同一个 `item.name`
 *   ④ 去重        → 两个 `README.md` 被并成一张卡,`assets/` 那份彻底消失
 *
 * ── 这条测试的量法 ──────────────────────────────────────────────────────
 * 事件、文件清单、`resolvedDir` 全部照抄上面那条真实记录(那一轮 run 被取消,
 * 所以 `producedFiles` 是 undefined —— 走的正是 `pickPrimaryArtifacts` 兜底
 * 那条支)。断言只认「项目相对路径」这一个事实,不认基名。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { CollabProvider } from '../../../src/collab/collab-context';
import type { ChatMessage, ProjectFile } from '../../../src/types';
import { workspaceContextFixture } from '../../helpers/workspace-context';

const PROJECT_ID = '78ff635a-9bbf-4555-8dc7-ec0290028b53';
const RESOLVED_DIR = `/Users/elian/.od-chatpanel-preview/projects/${PROJECT_ID}`;
const TURN_STARTED_AT = 1788364410000;

/** 真实那一轮 agent 写过的七个文件(绝对路径,原样) */
const WRITTEN = [
  'DESIGN.md',
  'README.md',
  'SKILL.md',
  'assets/README.md',
  'colors_and_type.css',
  'context/provenance.md',
  'examples/source-index.html',
] as const;

/** daemon `GET /api/projects/:id/files` 的真实形状:`name` 就是项目相对路径 */
const PROJECT_FILES: ProjectFile[] = [
  ...WRITTEN,
  'context/source-context.md',
].map((name) => ({
  name,
  path: name,
  localPath: `${RESOLVED_DIR}/${name}`,
  type: 'file',
  size: 1322,
  mtime: TURN_STARTED_AT + 2_000,
  kind: name.endsWith('.html') ? 'html' : name.endsWith('.css') ? 'code' : 'text',
  mime: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8',
  ...(name.endsWith('.html')
    ? { artifactKind: 'html' as const }
    : name.endsWith('.md')
      ? { artifactKind: 'markdown-document' as const }
      : {}),
})) as ProjectFile[];

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

/**
 * jsdom 里相对 URL 的 `fetch` 会抛,不打桩的话 HTML 卡的降级 iframe 根本挂不
 * 出来,「封面地址错了」那条会假绿成「网络在 jsdom 里失败了」。顺带把每次探测
 * 的地址记下来 —— 灰卡的真凭实据就是这个地址 404。
 */
function stubHeadProbe(): { probed: () => string[] } {
  const seen: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : String((input as Request)?.url ?? input);
    if ((init?.method ?? 'GET').toUpperCase() === 'HEAD') seen.push(url);
    return new Response('', { status: 200 });
  });
  return { probed: () => seen };
}

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

/** 真实记录:七行 `Write`,`file_path` 是 agent 给的绝对路径 */
function writeTurn(): ChatMessage {
  const events: unknown[] = [{ kind: 'status', label: 'starting', detail: 'codex' }];
  WRITTEN.forEach((name, index) => {
    const id = `toolu_w92_${index}`;
    events.push({
      kind: 'tool_use',
      id,
      name: 'Write',
      input: { file_path: `${RESOLVED_DIR}/${name}` },
    });
    events.push({ kind: 'tool_result', toolUseId: id, isError: false, content: 'ok' });
  });
  return {
    id: 'home-auto-send-0veytybyqf4oa-assistant',
    role: 'assistant',
    content: '做好了。',
    // 真实那条记录:run 被取消,所以 daemon 没结算出 producedFiles。
    runStatus: 'canceled',
    startedAt: TURN_STARTED_AT,
    endedAt: TURN_STARTED_AT + 680_000,
    createdAt: TURN_STARTED_AT,
    events: events as ChatMessage['events'],
  } as ChatMessage;
}

function renderTurn(props: Record<string, unknown> = {}) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <AssistantMessage
        message={writeTurn()}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={PROJECT_FILES}
        projectResolvedDir={RESOLVED_DIR}
        isLast
        {...props}
      />
    </CollabProvider>,
  );
}

const flush = async (hops = 12): Promise<void> => {
  for (let i = 0; i < hops; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe('W92 · 产物卡持有的必须是能唯一定位到文件的项目相对路径', () => {
  it('子目录里的文档,点开交出去的是 context/provenance.md,不是基名', async () => {
    stubHeadProbe();
    const onRequestOpenFile = vi.fn();
    renderTurn({ onRequestOpenFile });
    await flush();

    const open = screen.getByTestId('artifact-card-open-context/provenance.md');
    fireEvent.click(open);

    // 钉实参个数:多一个可选参数会让 `not.toHaveBeenCalledWith` 恒真。
    expect(onRequestOpenFile.mock.calls[0]).toHaveLength(1);
    expect(onRequestOpenFile.mock.calls[0]).toEqual(['context/provenance.md']);
  });

  it('子目录里的 HTML,卡面探的是 examples/source-index.html(裸名那条 404,就是灰卡)', async () => {
    const { probed } = stubHeadProbe();
    renderTurn();
    await flush();

    await waitFor(() => {
      expect(
        probed().some((url) => url.includes('/raw/examples/source-index.html')),
      ).toBe(true);
    });
    expect(
      probed().some((url) => /\/raw\/source-index\.html(\?|$)/.test(url)),
      '卡面还在探裸名,那个地址 daemon 回 404 —— 文档永远画不出来,卡面停在加载态',
    ).toBe(false);

    const frame = screen
      .getByTestId('artifact-card-examples/source-index.html')
      .querySelector('iframe');
    expect(frame?.getAttribute('src') ?? '').toContain('/raw/examples/source-index.html');
  });

  it('同名文件各成一张卡,各自开自己那一份', async () => {
    stubHeadProbe();
    const onRequestOpenFile = vi.fn();
    renderTurn({ onRequestOpenFile });
    await flush();

    fireEvent.click(screen.getByTestId('artifact-card-open-README.md'));
    expect(onRequestOpenFile.mock.calls.at(-1)).toEqual(['README.md']);

    fireEvent.click(screen.getByTestId('artifact-card-open-assets/README.md'));
    expect(onRequestOpenFile.mock.calls.at(-1)).toEqual(['assets/README.md']);
  });

  it('单格式产物的〔导出〕下的也是子目录那一份', async () => {
    stubHeadProbe();
    renderTurn();
    await flush();

    const link = screen.getByTestId(
      'artifact-card-export-context/provenance.md',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href') ?? '').toContain('/raw/context/provenance.md');
    expect(link.getAttribute('download')).toBe('context/provenance.md');
  });

  it('多格式产物的〔分享〕/〔导出〕交出去的也是子目录那一份,且没被整卡的打开按钮吞掉', async () => {
    stubHeadProbe();
    const onRequestOpenFile = vi.fn();
    const onArtifactShare = vi.fn();
    const onArtifactDownload = vi.fn();
    renderTurn({ onRequestOpenFile, onArtifactShare, onArtifactDownload });
    await flush();

    fireEvent.click(screen.getByTestId('artifact-card-publish-examples/source-index.html'));
    fireEvent.click(screen.getByTestId('artifact-card-export-examples/source-index.html'));

    expect(onArtifactShare.mock.calls[0]?.[0]).toBe('examples/source-index.html');
    expect(onArtifactDownload.mock.calls[0]?.[0]).toBe('examples/source-index.html');
    expect(
      onRequestOpenFile,
      '整卡那枚全尺寸打开按钮把角落两颗动作键的点击吞了',
    ).not.toHaveBeenCalled();
  });

  it('反向对照:根目录的产物一个字都没变', async () => {
    stubHeadProbe();
    const onRequestOpenFile = vi.fn();
    renderTurn({ onRequestOpenFile });
    await flush();

    for (const name of ['DESIGN.md', 'SKILL.md']) {
      fireEvent.click(screen.getByTestId(`artifact-card-open-${name}`));
      expect(onRequestOpenFile.mock.calls.at(-1)).toEqual([name]);
    }
  });

  it('反向对照:依赖件(.css)照旧不出卡', async () => {
    stubHeadProbe();
    renderTurn();
    await flush();

    expect(screen.queryByTestId('artifact-card-colors_and_type.css')).toBeNull();
  });
});
