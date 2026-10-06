// @vitest-environment jsdom

/**
 * 会话产物卡的**版本语义**(`specs/current/chat-artifact-versioning-design.md`
 * §3.2 / §4 / §8,加 2026-09-02 产品的两处口径更正)。
 *
 * | 产物 | 卡面 | 点击 |
 * | --- | --- | --- |
 * | HTML / 原型 / slide / 文档 | 当轮**静态首屏截图**(冻结) | 工作区**最新版本** |
 * | 图片 | 当轮**不可变真图快照**(冻结) | 工作区**最新版本** |
 *
 * 点击那一列 2026-09-02 由用户统一:「html 和图片都是,产物缩略是快照,但跳过去
 * 产物永远指向最新的」。**没有例外。**
 *
 * 「卡面是当轮、点击是最新」是**故意不一致**的,产品明确说「点击行为就是可能不
 * 一致的,预期内的」。这里守的就是这条不一致本身 —— 有人把它当 bug「修平」,
 * 卡面就会跟着 latest 漂,历史消息里那张图会变成今天的样子。
 *
 * ── 没有当轮快照的时候 ──────────────────────────────────────────────────
 * 旧会话、截图失败、desktop renderer 不在、配额满 —— 一律降级,而且**降级也是
 * 一张正常卡面**,不出占位、不写「不可用 / 失败」:
 *
 *  · HTML 系 → **live iframe 显示最新 html**;
 *  · 图片   → **当前同名文件**。
 *
 * ── 这个量法能看见缺陷吗 ────────────────────────────────────────────────
 * HTML 那条降级支要挂出 iframe 有两道前置:`useInView`(jsdom 里没有
 * IntersectionObserver,直接判 true)和一次 `HEAD` 探测成功。默认 jsdom 里
 * `fetch('/api/...')` 会抛(相对 URL 无 origin),于是根本挂不出 iframe ——
 * 这时候「降级到 live iframe」那几条会**假绿**:它测的是网络在 jsdom 里失败了。
 * 所以下面把 `fetch` 打桩成 200,让降级支真的走到底。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ArtifactCards, FileOpsSummary } from '../../src/components/FileOpsSummary';
import { CollabProvider } from '../../src/collab/collab-context';
import type { FileOpEntry } from '../../src/runtime/file-ops';
import { workspaceContextFixture } from '../helpers/workspace-context';

/*
 * 按 `src/index.css` 的**真实顺序**注入,否则量到的是浏览器默认值:
 * `.artifact-card-*` 的骨架在 `viewer/tools.css`,文档封面在 `chat.css`,
 * 而 chat.css 排在 tools.css **之前**。
 */
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    'tokens.css',
    'base.css',
    'primitives.css',
    'shell.css',
    'chat.css',
    'viewer/tools.css',
  ]
    .map((file) => readFileSync(resolve(__dirname, '../../src/styles', file), 'utf8'))
    .join('\n');
  document.head.append(style);
});

const PROJECT_ID = 'c7e3b234-2fb3-4f6e-8aae-a3a00697c476';
const raw = (name: string) => `/api/projects/${PROJECT_ID}/raw/${name}`;

const HTML_SHOT = '/api/projects/p1/chat-artifact-snapshots/snap-html-1/thumbnail';
const IMAGE_SHOT = '/api/projects/p1/chat-artifact-snapshots/snap-img-1/content';
/* 视频的当轮**首帧**。和 HTML 首屏截图走同一条 thumbnail 路 —— 都是「一张渲染出来
   的封面」,不是原件(视频原件按 2026-09-02 的容量裁决根本不进快照库)。 */
const VIDEO_SHOT = '/api/projects/p1/chat-artifact-snapshots/snap-vid-1/thumbnail';

/** 让 HTML 降级支那道 HEAD 探测**通过** —— 见文件头的假绿说明。 */
function stubHeadProbeAsReachable() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('', { status: 200 }));
}

afterEach(() => {
  cleanup();
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

const htmlRef = (over: Record<string, unknown> = {}) => ({
  id: 'ref-1',
  label: 'landing.html',
  kind: 'html',
  displayPolicy: 'latest_with_static_preview',
  snapshotId: 'snap-html-1',
  thumbnailUrl: HTML_SHOT,
  snapshotState: 'ready',
  ...over,
});

const imageRef = (over: Record<string, unknown> = {}) => ({
  id: 'ref-2',
  label: 'hero.png',
  kind: 'image',
  displayPolicy: 'immutable_snapshot',
  /*
   * 故意留着这个**已作废**的字段:线上还会有宣布 `openPolicy:'snapshot'` 的
   * daemon / 旧消息。留着它,这几条断言测的才是「读取端无论如何都不交点击目标」,
   * 而不是「我把字段从夹具里删了所以分支没走到」。
   */
  openPolicy: 'snapshot',
  snapshotId: 'snap-img-1',
  snapshotUrl: IMAGE_SHOT,
  snapshotState: 'ready',
  ...over,
});

const videoRef = (over: Record<string, unknown> = {}) => ({
  id: 'ref-3',
  label: 'clip.mp4',
  kind: 'video',
  // 视频和 HTML 同一档:卡面冻结、点击最新。它**没有** snapshotUrl ——
  // 原件不进快照库,卡上那张只是首帧。
  displayPolicy: 'latest_with_static_preview',
  snapshotId: 'snap-vid-1',
  thumbnailUrl: VIDEO_SHOT,
  snapshotState: 'ready',
  ...over,
});

function renderPanel(entries: FileOpEntry[], props: Record<string, unknown> = {}) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <FileOpsSummary entries={entries} projectId={PROJECT_ID} {...props} />
    </CollabProvider>,
  );
}

const cardOf = (name: string) => screen.getByTestId(`artifact-card-${name}`);
const mediaOf = (name: string) =>
  cardOf(name).querySelector<HTMLElement>('.artifact-card-media');

/* ------------------------------------------------------------------ *
 * 1 · HTML 系:卡面是当轮快照,点击是最新
 * ------------------------------------------------------------------ */
describe('HTML 产物卡 · 有当轮快照', () => {
  it('卡面渲染快照 <img>,而不是活 iframe', async () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('landing.html')], { artifactRefs: [htmlRef()] });

    await waitFor(() => expect(mediaOf('landing.html')).not.toBeNull());
    const shot = mediaOf('landing.html')!;
    expect(shot.tagName).toBe('IMG');
    expect(shot.getAttribute('src')).toBe(HTML_SHOT);
    expect(
      cardOf('landing.html').querySelector('iframe'),
      '有当轮快照还挂着活 iframe:历史卡会跟着工作区最新版本漂移',
    ).toBeNull();
  });

  it('卡面冻结,但点击仍然打开工作区最新版本 —— 这条不一致是预期内的', async () => {
    stubHeadProbeAsReachable();
    const onRequestOpenFile = vi.fn();
    renderPanel([fileOpEntry('landing.html')], {
      artifactRefs: [htmlRef()],
      onRequestOpenFile,
    });

    await waitFor(() => expect(mediaOf('landing.html')).not.toBeNull());
    fireEvent.click(screen.getByTestId('artifact-card-open-landing.html'));

    expect(onRequestOpenFile).toHaveBeenCalledTimes(1);
    /*
     * 钉的是**实参个数**,不是「没带快照」。否定式断言在这里是废的:多一个可选
     * 参数就会让 `not.toHaveBeenCalledWith(name)` 恒真,那条断言永远不会红。
     */
    expect(onRequestOpenFile.mock.calls[0]).toHaveLength(1);
    expect(onRequestOpenFile.mock.calls[0]).toEqual(['landing.html']);
  });

  it('快照占的是和 live iframe 同一个盒子 —— 换的只是卡面的实现', async () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('landing.html')], { artifactRefs: [htmlRef()] });
    await waitFor(() => expect(mediaOf('landing.html')).not.toBeNull());

    const thumb = getComputedStyle(
      cardOf('landing.html').querySelector<HTMLElement>('.artifact-card-thumb')!,
    );
    expect(thumb.getPropertyValue('aspect-ratio')).toBe('16 / 10');
    expect(thumb.overflow).toBe('hidden');

    // 首屏截图按 1440×900 抓,和 16:10 的卡面同比 —— 铺满,不裁不留边。
    const shot = getComputedStyle(mediaOf('landing.html')!);
    expect([shot.position, shot.width, shot.height, shot.objectFit]).toEqual([
      'absolute',
      '100%',
      '100%',
      'cover',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * 2 · HTML 系:没有当轮快照 → live iframe 显示最新
 * ------------------------------------------------------------------ */
describe('HTML 产物卡 · 没有当轮快照(旧会话 / 截图失败 / 配额满)', () => {
  it('降级成 live iframe 显示最新 html', async () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('landing.html')]);

    const frame = await waitFor(() => {
      const found = cardOf('landing.html').querySelector<HTMLIFrameElement>('iframe');
      expect(found, '没有快照时卡面既不是 iframe 也不是别的东西').not.toBeNull();
      return found!;
    });
    expect(frame.getAttribute('src')).toBe(raw('landing.html'));
  });

  it('快照还没写完 / 失败 / 旧会话,都走同一条降级支,而且不写任何失败文案', async () => {
    for (const state of ['pending', 'failed', 'legacy_unavailable']) {
      stubHeadProbeAsReachable();
      renderPanel([fileOpEntry('landing.html')], {
        artifactRefs: [htmlRef({ snapshotState: state })],
      });

      await waitFor(() =>
        expect(cardOf('landing.html').querySelector('iframe')).not.toBeNull(),
      );
      /*
       * 产品原话:「不允许退回不就一个错误文案显示在上面了?这感觉更奇怪呢」。
       * 降级是一张正常卡面,不是一句错误提示。
       */
      expect(cardOf('landing.html').textContent ?? '').not.toMatch(
        /失败|不可用|错误|无法|unavailable|failed|error/i,
      );
      cleanup();
      vi.restoreAllMocks();
    }
  });
});

/* ------------------------------------------------------------------ *
 * 3 · 图片:卡面和点击都认那张快照
 * ------------------------------------------------------------------ */
describe('图片产物卡 · 有当轮快照', () => {
  it('卡面读快照,不读工作区当前同名文件', () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('hero.png')], { artifactRefs: [imageRef()] });

    const img = mediaOf('hero.png')!;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe(IMAGE_SHOT);
    // 竖图仍然完整显示,不被 16:10 的框裁掉上下(OPEND-2547)。
    expect(img.getAttribute('data-preview-fit')).toBe('contain');
  });

  /*
   * 用户 2026-09-02:「html 和图片都是,产物缩略是快照,但跳过去产物永远指向最新的」。
   *
   * 在这之前这里断言的是相反的事(点击开快照 tab)。那条链路当时之所以没在产品里
   * 显形,只是因为宿主的 `onRequestOpenFile` 只收一个参数、把第二个悄悄丢了 ——
   * 看起来像个待修的 bug,接上去正好做出用户否掉的行为。所以现在钉的是**实参个数**。
   */
  it('点击打开工作区最新文件,一个快照身份都不交出去', () => {
    stubHeadProbeAsReachable();
    const onRequestOpenFile = vi.fn();
    renderPanel([fileOpEntry('hero.png')], {
      artifactRefs: [imageRef()],
      onRequestOpenFile,
    });

    fireEvent.click(screen.getByTestId('artifact-card-open-hero.png'));
    expect(onRequestOpenFile.mock.calls[0]).toHaveLength(1);
    expect(onRequestOpenFile.mock.calls[0]).toEqual(['hero.png']);
  });

  it('导出下的也是卡面上那一版', () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('hero.png')], { artifactRefs: [imageRef()] });

    const link = screen.getByTestId('artifact-card-export-hero.png');
    expect(link.getAttribute('href')).toBe(IMAGE_SHOT);
    expect(link.getAttribute('download')).toBe('hero.png');
  });

  it('同名图片被下一轮覆盖后,两条消息各显示各的那一张', () => {
    stubHeadProbeAsReachable();
    const { unmount } = renderPanel([fileOpEntry('hero.png')], {
      artifactRefs: [imageRef()],
    });
    expect(mediaOf('hero.png')!.getAttribute('src')).toBe(IMAGE_SHOT);
    unmount();

    const later = '/api/projects/p1/chat-artifact-snapshots/snap-img-2/content';
    renderPanel([fileOpEntry('hero.png')], {
      artifactRefs: [imageRef({ snapshotId: 'snap-img-2', snapshotUrl: later })],
    });
    expect(mediaOf('hero.png')!.getAttribute('src')).toBe(later);
  });
});

/* ------------------------------------------------------------------ *
 * 4 · 图片:旧会话没有快照 → 显示当前文件,不加占位
 * ------------------------------------------------------------------ */
describe('图片产物卡 · 没有当轮快照(旧会话)', () => {
  it('显示当前同名文件,点击也开当前文件', () => {
    stubHeadProbeAsReachable();
    const onRequestOpenFile = vi.fn();
    renderPanel([fileOpEntry('hero.png')], { onRequestOpenFile });

    const img = mediaOf('hero.png')!;
    expect(img.getAttribute('src')).toBe(raw('hero.png'));

    fireEvent.click(screen.getByTestId('artifact-card-open-hero.png'));
    expect(onRequestOpenFile.mock.calls[0]).toHaveLength(1);
    expect(onRequestOpenFile.mock.calls[0]).toEqual(['hero.png']);
  });

  it('不出占位、不写任何「历史图片不可用」', () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('hero.png')]);

    const card = cardOf('hero.png');
    expect(card.querySelector('.artifact-card-mini')).toBeNull();
    expect(card.textContent ?? '').not.toMatch(
      /失败|不可用|错误|无法|unavailable|failed|error/i,
    );
  });
});

/* ------------------------------------------------------------------ *
 * 4b · 视频:卡面是当轮**首帧**,元素仍然是 <video>
 * ------------------------------------------------------------------ */
describe('视频产物卡 · 当轮首帧', () => {
  it('首帧挂在 poster 上,src 仍指向工作区当前文件', () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('clip.mp4')], { artifactRefs: [videoRef()] });

    const media = mediaOf('clip.mp4')!;
    /*
     * 元素身份是**这条断言的正文**,不是顺带检查的。
     * 用户 2026-09-02 只拍了「先显示首帧」,并且明说「具体的视频产物卡片样式我再
     * 问问同事」—— 把 `<video>` 换成 `<img>` 就是替他把版式那一半也拍了。
     */
    expect(media.tagName).toBe('VIDEO');
    // 卡面:当轮那一帧。文件被下一轮覆盖也不跟着变 —— 这就是冻结。
    expect(media.getAttribute('poster')).toBe(VIDEO_SHOT);
    // 点击 / 播放:仍然是工作区最新那一份(和 HTML、图片同一条规则)。
    expect(media.getAttribute('src')).toBe(raw('clip.mp4'));
  });

  it('同名视频被下一轮覆盖后,两条消息各显示各的首帧', () => {
    stubHeadProbeAsReachable();
    const { unmount } = renderPanel([fileOpEntry('clip.mp4')], {
      artifactRefs: [videoRef()],
    });
    expect(mediaOf('clip.mp4')!.getAttribute('poster')).toBe(VIDEO_SHOT);
    unmount();

    const later = '/api/projects/p1/chat-artifact-snapshots/snap-vid-2/thumbnail';
    renderPanel([fileOpEntry('clip.mp4')], {
      artifactRefs: [videoRef({ snapshotId: 'snap-vid-2', thumbnailUrl: later })],
    });
    expect(mediaOf('clip.mp4')!.getAttribute('poster')).toBe(later);
  });

  it('没有当轮首帧时回落成今天的行为,不出占位、不写失败文案', () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('clip.mp4')]);

    const media = mediaOf('clip.mp4')!;
    expect(media.tagName).toBe('VIDEO');
    // 抽帧失败 / 旧会话:让浏览器自己去画当前文件的第一帧,就是今天的样子。
    expect(media.getAttribute('poster')).toBeNull();
    expect(media.getAttribute('src')).toBe(raw('clip.mp4'));

    const card = cardOf('clip.mp4');
    expect(card.querySelector('.artifact-card-mini')).toBeNull();
    expect(card.textContent ?? '').not.toMatch(
      /失败|不可用|错误|无法|unavailable|failed|error/i,
    );
  });
});

/* ------------------------------------------------------------------ *
 * 5 · 卡片按名字配 ref
 * ------------------------------------------------------------------ */
describe('refs 与卡片的配对', () => {
  it('一轮里 HTML 和图片卡面各认各的快照,点击都走最新', async () => {
    stubHeadProbeAsReachable();
    const onRequestOpenFile = vi.fn();
    renderPanel([fileOpEntry('landing.html'), fileOpEntry('hero.png')], {
      artifactRefs: [htmlRef(), imageRef()],
      onRequestOpenFile,
    });

    await waitFor(() => expect(mediaOf('landing.html')).not.toBeNull());
    expect(mediaOf('landing.html')!.getAttribute('src')).toBe(HTML_SHOT);
    expect(mediaOf('hero.png')!.getAttribute('src')).toBe(IMAGE_SHOT);

    fireEvent.click(screen.getByTestId('artifact-card-open-landing.html'));
    fireEvent.click(screen.getByTestId('artifact-card-open-hero.png'));
    // 卡面两张各认各的快照(上面两行),点击两张都只交文件名 —— 一个参数。
    expect(onRequestOpenFile.mock.calls).toEqual([['landing.html'], ['hero.png']]);
  });

  it('ref 配不上任何一张卡时不影响这一轮的卡片', async () => {
    stubHeadProbeAsReachable();
    renderPanel([fileOpEntry('landing.html')], {
      artifactRefs: [htmlRef({ label: 'somewhere/else.html' })],
    });

    await waitFor(() =>
      expect(cardOf('landing.html').querySelector('iframe')).not.toBeNull(),
    );
    expect(mediaOf('landing.html')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 6 · 直接喂 items 的入口(宿主拿到 refs 之后自己拼卡片时走这条)
 * ------------------------------------------------------------------ */
describe('ArtifactCards 直接接收快照字段', () => {
  it('coverUrl / snapshotUrl 直接决定卡面,不再回头读工作区文件', () => {
    stubHeadProbeAsReachable();
    render(
      <CollabProvider value={projectCollabValue()}>
        <ArtifactCards
          items={[
            { name: 'deck.html', kind: 'html', coverUrl: HTML_SHOT },
            // 只给 snapshotUrl:卡面就该由它定。快照 id 已经不是卡片的入参了 ——
            // 「点开走快照」那条路整条撤掉之后,卡片再也拿不到、也不需要那个 id。
            { name: 'poster.png', kind: 'image', snapshotUrl: IMAGE_SHOT },
          ]}
          projectId={PROJECT_ID}
        />
      </CollabProvider>,
    );

    expect(mediaOf('deck.html')!.getAttribute('src')).toBe(HTML_SHOT);
    expect(cardOf('deck.html').querySelector('iframe')).toBeNull();
    expect(mediaOf('poster.png')!.getAttribute('src')).toBe(IMAGE_SHOT);
  });
});
