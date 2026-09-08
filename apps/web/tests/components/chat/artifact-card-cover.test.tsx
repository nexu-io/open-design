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
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
});
