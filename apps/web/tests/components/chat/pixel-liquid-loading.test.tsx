// @vitest-environment jsdom
/**
 * 「还没出来的格子不许是一块静止的灰」——产品 2026-08-26。
 *
 * 范围就两处:① 生图行里还没出的那几格;② 产物卡还在写的时候。
 * 两处原来都是纯灰底(产物卡还多一层呼吸 opacity),现在都换成设计稿那套像素液体。
 *
 * **这个文件量不到画面**:jsdom 没有 2D 上下文、没有布局,canvas 在这里是个空壳。
 * 所以只钉挂载与生命周期 —— 载体挂没挂上、该挂的挂了、不该挂的没挂、
 * 看不见时进没进循环、卸载后有没有从调度器上摘干净。
 * 画面对不对只能真浏览器看。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { ArtifactCards, FileOpsSummary } from '../../../src/components/FileOpsSummary';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { liquidScheduler } from '../../../src/runtime/pixel-liquid-scheduler';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const gen = (path: string) => JSON.stringify({ status: 'succeeded', path });
const failed = () => JSON.stringify({ status: 'failed', error: { code: 'provider_missing' } });

/** 四张里出了一张、砸了一张,还有两张没回来 */
function partiallyGeneratedShell(): ShellData {
  const events: PersistedAgentEvent[] = [
    {
      kind: 'tool_use',
      id: 'g1',
      name: 'Bash',
      input: { command: 'od media generate a && od media generate b && od media generate c && od media generate d' },
      startedAt: 0,
    },
    { kind: 'tool_result', toolUseId: 'g1', content: [gen('a.png'), failed()].join('\n'), isError: false },
  ];
  const shell = buildTurnBlocks({ events, runStatus: 'running' }).find(
    (block): block is ShellData => block.kind === 'shell',
  );
  if (!shell) throw new Error('没有生成执行记录壳');
  return shell;
}

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalIntersectionObserver: typeof globalThis.IntersectionObserver | undefined;

/** 永不触发的 IntersectionObserver:模拟「挂在屏幕外」 */
class NeverIntersecting {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  // jsdom 没有 2D 上下文。这里给一个「什么方法都吞掉」的替身:除了
  // `createImageData` 要真给一块字节流,其余一律 no-op —— 同一棵树里还有
  // 别的 canvas(执行记录行首那颗 Orb),它要的方法不该由这个文件逐个列举。
  const stubContext = new Proxy(
    {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(4, w * h * 4)),
      }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => stubContext,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  originalIntersectionObserver = globalThis.IntersectionObserver;
  vi.stubGlobal('IntersectionObserver', NeverIntersecting);
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (originalIntersectionObserver) {
    vi.stubGlobal('IntersectionObserver', originalIntersectionObserver);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(liquidScheduler.stats().registered, '有实例没从调度器上摘干净').toBe(0);
});

describe('生图行 · 还没出来的格子', () => {
  it('未出的格子挂的是动画载体,不是一块灰', () => {
    const { container } = render(<ExecutionShell shell={partiallyGeneratedShell()} />);

    const liquids = container.querySelectorAll('canvas[data-testid="pixel-liquid"]');
    // 四格:1 出好、1 砸了、2 还没出来
    expect(liquids.length).toBe(2);
    for (const canvas of liquids) {
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('出好的格子和失败格都不挂动画 —— 它们不是 loading', () => {
    const { container } = render(<ExecutionShell shell={partiallyGeneratedShell()} />);

    const cells = [...container.querySelectorAll('[data-image-cell]')];
    expect(cells.length).toBe(4);
    const withLiquid = cells.filter((cell) => cell.querySelector('canvas[data-testid="pixel-liquid"]'));
    expect(withLiquid.map((cell) => cell.getAttribute('data-image-cell'))).toEqual(['loading', 'loading']);
  });

  it('未出的格子给屏幕阅读器留了一句状态', () => {
    render(<ExecutionShell shell={partiallyGeneratedShell()} />);
    expect(screen.getAllByRole('status').some((node) => node.textContent === '配图生成中')).toBe(true);
  });
});

describe('产物卡 · 还在写的时候', () => {
  it('pending 的卡挂动画载体', () => {
    const { container } = render(
      <ArtifactCards items={[{ name: 'poster.png', kind: 'image', pending: true }]} projectId="p1" />,
    );
    expect(container.querySelector('canvas[data-testid="pixel-liquid"]')).not.toBeNull();
  });

  it('doc 档的卡不受影响 —— 它是「本来就没缩略图」,不是「还没加载出来」', () => {
    const { container } = render(
      <ArtifactCards items={[{ name: '交付说明.md', kind: 'doc' }]} projectId="p1" />,
    );
    expect(container.querySelector('.artifact-card-doc')).not.toBeNull();
    expect(container.querySelector('canvas[data-testid="pixel-liquid"]')).toBeNull();
  });

  it('已经出图的卡不挂动画', () => {
    const { container } = render(
      <ArtifactCards items={[{ name: 'poster.png', kind: 'image' }]} projectId="p1" />,
    );
    expect(container.querySelector('canvas[data-testid="pixel-liquid"]')).toBeNull();
  });
});

describe('性能与降级', () => {
  it('屏幕外的格子只落一帧,不进循环', () => {
    render(<ExecutionShell shell={partiallyGeneratedShell()} />);
    const stats = liquidScheduler.stats();
    expect(stats.registered).toBe(2);
    expect(stats.animating).toBe(0);
    expect(stats.ticking).toBe(false);
  });

  it('卸载时从调度器上摘掉', () => {
    const view = render(<ExecutionShell shell={partiallyGeneratedShell()} />);
    expect(liquidScheduler.stats().registered).toBe(2);
    view.unmount();
    expect(liquidScheduler.stats().registered).toBe(0);
  });

  it('prefers-reduced-motion 下只画静止的一帧,压根不进调度器', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    );

    const { container } = render(<ExecutionShell shell={partiallyGeneratedShell()} />);
    expect(container.querySelectorAll('canvas[data-liquid="static"]').length).toBe(2);
    expect(liquidScheduler.stats().registered).toBe(0);
  });
});

describe('轮次结束之后不许还是 loading', () => {
  /*
   * `entry.status === 'running'` 的判据是「有 `tool_use` 配不到 `tool_result`」。
   * 轮次结束之后这只说明那条 result **丢了**,不说明还在写 —— 挂一张永远转下去的
   * loading 卡是在撒谎。
   *
   * 分叉出来的会话里尤其明显:seeded 副本会被刻意丢掉 `runStatus`(那是**源会话**
   * 那次 run 的指针),于是没有任何东西宣布这一轮结束了,卡片就一直绿着。
   * 用户真机指认:「fork 后的会话,怎么产物卡片一直是那个绿色的 loading 了」。
   */
  const runningEntry = [{ path: 'a.html', ops: ['write'], status: 'running' } as never];

  it('轮次还在跑:是 loading', () => {
    const { container } = render(
      <FileOpsSummary
        entries={runningEntry}
        projectFileNames={new Set(['a.html'])}
        projectId="p1"
        turnIsLive
      />,
    );
    expect(container.querySelector('.is-pending')).not.toBeNull();
  });

  it('轮次已结束:同一份数据不再是 loading', () => {
    const { container } = render(
      <FileOpsSummary
        entries={runningEntry}
        projectFileNames={new Set(['a.html'])}
        projectId="p1"
        turnIsLive={false}
      />,
    );
    expect(container.querySelector('.is-pending')).toBeNull();
  });
});
