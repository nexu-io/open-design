// @vitest-environment jsdom

/**
 * Plane OPEND-2547 —— 「9:16 竖图在会话产物卡被横向容器裁掉上下区域;应保持宽高比
 * 并以 contain / 留白完整显示」。
 *
 * 修法是**只**给 image 那一档的大卡换 `object-fit`,其余四种形态一个字不动:
 *
 *  · video 卡有自己的 9/16 letterbox 布局(`.artifact-card--video`),它本来就
 *    不裁,改它等于把「这是一条竖片」那条信息抹掉;
 *  · HTML 卡根本不是 `<img>` —— 它是一块按 1440×900 排版再整体缩小的 iframe,
 *    `object-fit` 对它无意义,误伤的表现是缩放基准被改掉、卡上渲染出手机版布局;
 *  · doc 卡拿不出预览,卡面是「图标 + 文件名」,没有媒体元素可裁;
 *  · pending 卡是像素液体占位,壳仍是 `.artifact-card-mini`,竖片卡那份
 *    9/16 letterbox 必须留着。
 *
 * 还有第五种形态在**这套 CSS 之外**:执行记录里那排小缩略图(`record.module.css`
 * 的 `.shot`)。它不归 `viewer/tools.css` 管,所以这里守的是**选择器的作用域** ——
 * `contain` 必须同时要求 `.artifact-card-media` 这个类**和** `data-preview-fit`
 * 这个属性,少任何一个都不生效。少了这条,一个泛化的 `[data-preview-fit]` 或
 * 一个裸 `img` 规则就会顺着层叠爬到执行记录的缩略图上。
 *
 * 断言一律读**计算样式**,不读 CSS 文本:层叠反转在文本 diff 里看不见。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FileOpsSummary } from '../../src/components/FileOpsSummary';
import { CollabProvider } from '../../src/collab/collab-context';
import type { FileOpEntry } from '../../src/runtime/file-ops';
import { workspaceContextFixture } from '../helpers/workspace-context';

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    'tokens.css',
    'primitives.css',
    'shell.css',
    'viewer/tools.css',
  ].map((file) => readFileSync(resolve(__dirname, '../../src/styles', file), 'utf8')).join('\n');
  document.head.append(style);
});

afterEach(() => {
  cleanup();
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

function fileOpEntry(path: string, status: FileOpEntry['status'] = 'done'): FileOpEntry {
  return {
    path,
    fullPath: `/repo/${path}`,
    ops: ['write'],
    opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
    total: 1,
    status,
  };
}

function renderCards(entries: FileOpEntry[], props: Record<string, unknown> = {}) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <FileOpsSummary entries={entries} projectId={PROJECT_ID} {...props} />
    </CollabProvider>,
  );
}

const thumbOf = (card: HTMLElement) => card.querySelector<HTMLElement>('.artifact-card-thumb')!;

/* ------------------------------------------------------------------ *
 * 1 · 图片:竖图必须整张看得见
 * ------------------------------------------------------------------ */
describe('图片产物卡 · OPEND-2547', () => {
  it('竖图铺在 16:10 的卡里靠 contain 留白,不再居中裁掉上下', () => {
    renderCards([fileOpEntry('portrait-9x16.png')]);
    const card = screen.getByTestId('artifact-card-portrait-9x16.png');
    const img = card.querySelector<HTMLImageElement>('img.artifact-card-media')!;
    const style = getComputedStyle(img);

    expect(img).toHaveAttribute('data-preview-fit', 'contain');
    expect(style.objectFit, '图片卡又回到裁剪(cover)了').toBe('contain');
    // 留白是靠「铺满框 + contain」实现的:框本身不能变形,否则留白会变成拉伸。
    expect([style.position, style.width, style.height]).toEqual(['absolute', '100%', '100%']);

    const thumb = getComputedStyle(thumbOf(card));
    expect(thumb.getPropertyValue('aspect-ratio'), '卡框比例被改动,留白口径就不成立了').toBe('16 / 10');
    expect(thumb.overflow).toBe('hidden');
  });
});

/* ------------------------------------------------------------------ *
 * 2 · 视频:9/16 letterbox 的专用布局没被误伤
 * ------------------------------------------------------------------ */
describe('视频产物卡不受 OPEND-2547 影响', () => {
  it('保留自己的居中 letterbox 布局,并且不走 data-preview-fit 那条路', () => {
    renderCards([fileOpEntry('reel.mp4')]);
    const card = screen.getByTestId('artifact-card-reel.mp4');
    expect(card.className).toContain('artifact-card--video');

    const video = card.querySelector<HTMLVideoElement>('video.artifact-card-media')!;
    expect(
      video.getAttribute('data-preview-fit'),
      '视频被顺手挂上了图片那条 fit 开关,两套布局会打架',
    ).toBeNull();

    const style = getComputedStyle(video);
    expect({
      position: style.position,
      width: style.width,
      maxWidth: style.maxWidth,
      height: style.height,
      objectFit: style.objectFit,
    }).toEqual({
      position: 'relative',
      width: 'auto',
      maxWidth: '100%',
      height: '100%',
      objectFit: 'contain',
    });

    const thumb = getComputedStyle(thumbOf(card));
    expect([thumb.display, thumb.getPropertyValue('place-items')]).toEqual(['grid', 'center']);
  });
});

/* ------------------------------------------------------------------ *
 * 3 · HTML:缩放基准仍是 1440×900,不是被 object-fit 接管
 * ------------------------------------------------------------------ */
describe('HTML 产物卡不受 OPEND-2547 影响', () => {
  it('卡面不是媒体元素,缩略图仍走桌面视口缩放那条路', () => {
    renderCards([fileOpEntry('landing.html')]);
    const card = screen.getByTestId('artifact-card-landing.html');

    expect(card.querySelector('img, video'), 'HTML 卡出现了媒体元素').toBeNull();
    expect(card.querySelector('[data-preview-fit]')).toBeNull();

    // 封面帧的规格是「1440×900 排版 + 整体缩小」。把它误改成 object-fit 那一套,
    // 卡上就会渲染出手机版布局(2026-08-28 量过:505px 视口)。
    const frame = document.createElement('iframe');
    frame.className = 'artifact-card-frame';
    thumbOf(card).append(frame);
    const style = getComputedStyle(frame);
    expect([style.width, style.height, style.position]).toEqual(['1440px', '900px', 'absolute']);
    expect(style.transform).toContain('1440px');
    frame.remove();
  });
});

/* ------------------------------------------------------------------ *
 * 4 · 文档卡:没有预览图可裁
 * ------------------------------------------------------------------ */
describe('文档产物卡不受 OPEND-2547 影响', () => {
  it('卡面是图标 + 文件名,不是媒体元素', () => {
    renderCards([fileOpEntry('plan.md')]);
    const card = screen.getByTestId('artifact-card-plan.md');
    expect(card.querySelector('.artifact-card-doc'), '文档卡丢了它的图标封面').not.toBeNull();
    expect(card.querySelector('img, video')).toBeNull();
    expect(card.querySelector('[data-preview-fit]')).toBeNull();
    expect(card.querySelector('.artifact-card-doc-name')).toHaveTextContent('plan.md');
  });
});

/* ------------------------------------------------------------------ *
 * 5 · pending:占位壳仍守着竖片的 9/16
 * ------------------------------------------------------------------ */
describe('还在写的产物卡不受 OPEND-2547 影响', () => {
  it('图片 pending 是像素液体占位,不是一块灰,也没有媒体元素可裁', () => {
    renderCards([fileOpEntry('portrait-9x16.png', 'running')], { turnIsLive: true });
    const card = screen.getByTestId('artifact-card-portrait-9x16.png');
    expect(card.className).toContain('is-pending');

    const mini = card.querySelector<HTMLElement>('.artifact-card-mini.is-loading');
    expect(mini, 'pending 卡丢了像素液体占位壳').not.toBeNull();
    expect(card.querySelector('img, video')).toBeNull();
    // 产品 2026-08-26:「任何产物卡片加载期间不能用灰色卡片代替」
    expect(getComputedStyle(mini!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('视频 pending 的占位壳仍是 9/16,而不是被拉成整框', () => {
    renderCards([fileOpEntry('reel.mp4', 'running')], { turnIsLive: true });
    const card = screen.getByTestId('artifact-card-reel.mp4');
    const mini = card.querySelector<HTMLElement>('.artifact-card-mini.is-loading')!;
    const style = getComputedStyle(mini);
    expect([style.getPropertyValue('aspect-ratio'), style.width, style.height])
      .toEqual(['9 / 16', 'auto', '100%']);
  });
});

/* ------------------------------------------------------------------ *
 * 6 · 作用域:contain 不许爬到执行记录那排小缩略图上
 * ------------------------------------------------------------------ *
 * 执行记录里的 `.shot` 归 `chat/primitives/record.module.css` 管,不在这套样式表
 * 里。这里能证明的、也必须证明的是:`viewer/tools.css` 的这条规则**同时**要求
 * `.artifact-card-media` 类和 `data-preview-fit` 属性,任缺其一都不生效 ——
 * 所以它没有能力顺着层叠爬到别的缩略图上。
 */
describe('contain 规则的作用域', () => {
  it('只带属性、不带产物卡类的图片不受影响(默认 fill)', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<img data-preview-fit="contain" data-testid="foreign-thumb" />',
    );
    const node = screen.getByTestId('foreign-thumb');
    expect(
      getComputedStyle(node).objectFit,
      'contain 规则泛化到了产物卡以外的缩略图',
    ).toBe('fill');
    node.remove();
  });

  it('只带产物卡类、不带属性的媒体仍是 cover(反向对照:规则确实存在且需要显式选择)', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<img class="artifact-card-media" data-testid="opt-out-thumb" />',
    );
    const node = screen.getByTestId('opt-out-thumb');
    expect(getComputedStyle(node).objectFit).toBe('cover');
    node.remove();
  });
});
