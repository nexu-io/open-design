// @vitest-environment jsdom
/**
 * OPEND-2625:音频 / 视频的媒体行不许长成生图行。
 *
 * 真机(Beta 0.21.1-beta.7,Media generation 项目)上,一次
 * `od media generate --surface audio --model minimax-tts` 在执行记录里写的是
 * `Generating illustrations · 1 images`,而且那一格摆的是 `<img src=…mp3>` ——
 * 浏览器加载不动,于是给用户一枚破图,读起来像「生成失败了」。
 *
 * 这条测的是**渲染层的分派**:行上已经写明 `surface`(见
 * `tests/runtime/chat/media-surface-dispatch.test.ts`),组件必须照着它换
 * 文案、图标和计数单位,并且**不许再拿 `<img>` 去装音频 / 视频**。
 *
 * 「不许用 `<img>` 装音频」不是审美意见:`AudioArtifact.tsx` 早就在仓库里,
 * 音频产物的渲染组件一直存在 —— 缺的只是让这一行知道自己是音频。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ImageRow } from '../../../src/components/chat/primitives/ImageRow';
import type { ImageRow as ImageRowData } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

/** 全部出完、没失败 —— 收成一行的那一档(D34 的第二形态) */
const settled = (over: Partial<ImageRowData> = {}): ImageRowData => ({
  kind: 'image',
  id: 'media-batch:b1',
  surface: 'image',
  total: 1,
  done: 1,
  failed: 0,
  thumbs: ['cover.png'],
  cells: [{ taskId: 'm1', status: 'done', path: 'cover.png' }],
  pending: false,
  elapsedMs: 4200,
  ...over,
});

/** 还在出 —— 大格那一档(D34 的第一形态) */
const live = (over: Partial<ImageRowData> = {}): ImageRowData => ({
  kind: 'image',
  id: 'media-batch:b1',
  surface: 'image',
  total: 2,
  done: 1,
  failed: 0,
  thumbs: ['cover.png'],
  cells: [
    { taskId: 'm1', status: 'done', path: 'cover.png' },
    { taskId: 'm2', status: 'pending' },
  ],
  pending: true,
  elapsedMs: 3000,
  ...over,
});

const show = (row: ImageRowData): ReactElement => (
  <I18nProvider initial="en">
    <ImageRow row={row} imageSrc={(p) => `/raw/${p}`} onOpenImage={vi.fn()} />
  </I18nProvider>
);

describe('OPEND-2625 · 媒体行按真实类型渲染', () => {
  it('图片仍然照旧:文案是插图,格子是 <img>', () => {
    const { container } = render(show(settled()));
    expect(container.textContent).toContain('Generating illustrations');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('音频不许写成「Generating illustrations」', () => {
    const { container } = render(show(settled({
      surface: 'audio',
      thumbs: ['line.mp3'],
      cells: [{ taskId: 'm1', status: 'done', path: 'line.mp3' }],
    })));
    expect(container.textContent).not.toContain('Generating illustrations');
    expect(container.textContent).not.toContain('images');
  });

  it('音频不许被当成图片去加载 —— 破图就是从这儿来的', () => {
    const { container } = render(show(settled({
      surface: 'audio',
      thumbs: ['line.mp3'],
      cells: [{ taskId: 'm1', status: 'done', path: 'line.mp3' }],
    })));
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('视频不许写成「Generating illustrations」,也不许走 <img>', () => {
    const { container } = render(show(settled({
      surface: 'video',
      thumbs: ['shot.mp4'],
      cells: [{ taskId: 'm1', status: 'done', path: 'shot.mp4' }],
    })));
    expect(container.textContent).not.toContain('Generating illustrations');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('大格那一档同样分派:进行中的音频批不写插图,已出的那格不走 <img>', () => {
    const { container } = render(show(live({
      surface: 'audio',
      thumbs: ['line.mp3'],
      cells: [
        { taskId: 'm1', status: 'done', path: 'line.mp3' },
        { taskId: 'm2', status: 'pending' },
      ],
    })));
    expect(container.textContent).not.toContain('Generating illustrations');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('三类的行标题两两不同 —— 不是把三种都翻成同一句话', () => {
    const titleOf = (surface: ImageRowData['surface']): string => {
      const { container, unmount } = render(show(settled({ surface })));
      const name = container.querySelector<HTMLElement>('[class*="name"]');
      const text = name?.textContent ?? '';
      unmount();
      return text;
    };
    const titles = [titleOf('image'), titleOf('audio'), titleOf('video')];
    expect(new Set(titles).size).toBe(3);
    expect(titles.every((s) => s.trim().length > 0)).toBe(true);
  });
});
