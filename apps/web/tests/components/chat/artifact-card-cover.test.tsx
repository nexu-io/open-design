// @vitest-environment jsdom
/**
 * 产物卡要出缩略图 —— 在**项目路由里**也要出。
 *
 * 踩的坑:卡的封面复用了首页项目网格那套 `HtmlProjectCoverFrame`,
 * 而那套挂在一个全局的缩略图加载闸上;`App.tsx` 里写着
 * `if (route.kind === 'project') suspendThumbnailLoads()` ——
 * 进项目就把闸挂起,免得背景里几十张封面跟前台抢连接(同一个 HTTP/1.1 六连接的事)。
 *
 * 可聊天就活在项目路由里,产物卡**自己就是前台主内容**、一轮也就一两张。
 * 继承那条挂起的结果是:iframe 永远拿不到 slot,卡面永远是一块灰的。
 * 交付稿里灰色 `.mini` 是**空态占位**,真实状态该是截图(稿子用 `.mod-s1..s4` 挂了真 JPEG)。
 *
 * 所以这一条钉的是:闸挂起时,产物卡照样挂 iframe。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { FileOpsSummary } from '../../../src/components/FileOpsSummary';
import { resumeThumbnailLoads, suspendThumbnailLoads } from '../../../src/lib/thumbnail-load-gate';
import type { FileOpEntry } from '../../../src/runtime/file-ops';

const entry = (path: string): FileOpEntry => ({
  path,
  fullPath: `/repo/${path}`,
  ops: ['write'],
  opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
  total: 1,
  status: 'done',
});

beforeEach(() => {
  // 封面挂 iframe 之前会先 HEAD 验一下文件在不在
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
});

afterEach(() => {
  cleanup();
  resumeThumbnailLoads();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('产物卡的封面', () => {
  it('项目路由把缩略图闸挂起时,产物卡照样出缩略图', async () => {
    suspendThumbnailLoads();   // App.tsx 进项目时做的事
    render(<FileOpsSummary entries={[entry('relatorio.html')]} projectId="proj-1" />);

    const card = screen.getByTestId('artifact-card-relatorio.html');
    await waitFor(() => {
      expect(card.querySelector('iframe'), '卡面还是灰的:封面 iframe 没挂上').not.toBeNull();
    });
  });

  it.each([[1920, 1080], [1080, 1920], [1080, 1080], [4000, 1000], [1000, 4000]])('Motion %i×%i 保持动画和指定封面,画布尺寸不改变卡片外框', async (width, height) => {
    const motionPreview = { width, height, duration: 15, posterTime: 13.5, sourcePath: 'index.html', videoPath: 'film.mp4' };
    const artifactRefs = ['index.html', 'film.mp4'].map((label) => ({
      label, kind: label.endsWith('.html') ? 'html' : 'video',
      displayPolicy: 'latest_with_static_preview', snapshotState: 'ready',
      thumbnailUrl: '/frozen-cover.jpg', motionPreview,
    }));
    render(<FileOpsSummary entries={[entry('index.html'), entry('film.mp4')]} projectId="proj-1" artifactRefs={artifactRefs} />);
    const html = screen.getByTestId('artifact-card-index.html');
    const video = screen.getByTestId('artifact-card-film.mp4');
    await waitFor(() => expect(html.querySelector('iframe')).not.toBeNull());
    const iframe = html.querySelector('iframe')!;
    expect(new URL(iframe.src).searchParams.get('odMotionThumbnail')).toBe('1');
    expect(iframe.dataset.odActive).toBe('true');
    expect(iframe.style.height).toBe(`${1440 * height / width}px`);
    expect(iframe.style.getPropertyValue('--artifact-frame-height')).toBe(`${1440 * height / width}px`);
    expect(html.querySelector('img')).toBeNull();
    expect(video.querySelector('video')?.getAttribute('poster')).toBe('/frozen-cover.jpg');
    expect((html.firstElementChild as HTMLElement).style.aspectRatio).toBe('');
    expect((video.firstElementChild as HTMLElement).style.aspectRatio).toBe('');
  });

  it('旧会话与更新后的源文件按实时画布缩放,收到尺寸后外框仍然不跳动', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200, headers: { 'x-od-motion-output': 'video' } })));
    const motionPreview = { width: 1920, height: 1080, duration: 15, posterTime: 13.5, sourcePath: 'index.html', videoPath: 'film.mp4' };
    const { rerender } = render(<FileOpsSummary entries={[entry('index.html'), entry('film.mp4')]} projectId="proj-1" />);
    const html = screen.getByTestId('artifact-card-index.html');
    await waitFor(() => expect(html.querySelector('iframe')).not.toBeNull());
    const iframe = html.querySelector('iframe')!;
    act(() => window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'od:motion-preview-request', id: 'live-portrait', width: 1080, height: 1920 },
    })));
    await waitFor(() => expect(iframe.style.height).toBe('2560px'));
    rerender(<FileOpsSummary entries={[entry('index.html'), entry('film.mp4')]} projectId="proj-1" artifactRefs={[{
      label: 'index.html', displayPolicy: 'latest_with_static_preview', snapshotState: 'ready', motionPreview,
    }]} />);
    expect(iframe.style.height).toBe('2560px');
    expect((html.firstElementChild as HTMLElement).style.aspectRatio).toBe('');
    expect((screen.getByTestId('artifact-card-film.mp4').firstElementChild as HTMLElement).style.aspectRatio).toBe('');
  });

  it('普通 HTML 仍使用当轮静态封面', () => {
    render(<FileOpsSummary entries={[entry('index.html')]} projectId="proj-1" artifactRefs={[{
      label: 'index.html', displayPolicy: 'latest_with_static_preview', snapshotState: 'ready', thumbnailUrl: '/frozen-cover.jpg',
    }]} />);
    const html = screen.getByTestId('artifact-card-index.html');
    expect(html.querySelector('img')?.getAttribute('src')).toBe('/frozen-cover.jpg');
    expect(html.querySelector('img')?.getAttribute('data-preview-fit')).toBeNull();
    expect(html.querySelector('iframe')).toBeNull();
  });

  it('普通 HTML 的实时封面不添加动效参数,实际文件优先于旧动效元数据', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200, headers: { 'x-od-motion-output': 'html' } })));
    render(<FileOpsSummary entries={[entry('index.html')]} projectId="proj-1" artifactRefs={[{
      label: 'index.html', displayPolicy: 'latest_with_static_preview', snapshotState: 'ready',
      motionPreview: { width: 1920, height: 1080, duration: 15, posterTime: 1, sourcePath: 'index.html', videoPath: 'film.mp4' },
    }]} />);
    const card = screen.getByTestId('artifact-card-index.html');
    await waitFor(() => expect(card.querySelector('iframe')).not.toBeNull());
    const iframe = card.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe('/api/projects/proj-1/raw/index.html');
    expect(iframe.hasAttribute('data-od-active')).toBe(false);
    expect(iframe.style.height).toBe('');
  });
});
