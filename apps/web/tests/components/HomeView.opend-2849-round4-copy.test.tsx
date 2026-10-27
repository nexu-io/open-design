// @vitest-environment jsdom
/**
 * OPEND-2849 第四轮 · 首页发送失败的两句话(zh-CN 逐字对齐产品稿)。
 *
 * - S03「任何请求返回未登录」:首页建项目被 daemon 以 AMR_AUTH_REQUIRED 拒绝。
 *   daemon 把「从没登录」和「登录过期」归成同一个码,首页分不出来,所以用 S03 那格
 *   (标题「Open Design 尚未登录」—— 两种情况都成立),不用 S17a「登录已失效」。
 * - S28a「本地服务断开」:建项目的请求根本没到 daemon(传输层失败)。
 *
 * 首页这条错误是一个文本块(`white-space: pre-line`),标题和正文各占一行。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({ context: null, loading: false, failure: 'unsupported' as const }),
  };
});

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { ProjectCreateError } from '../../src/state/projects';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

function renderHome(onSubmit: (payload: unknown) => Promise<boolean> | void) {
  writeHomeGuideStage('done');
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
  return render(
    <I18nProvider initial="zh-CN">
      <HomeView projects={[]} onSubmit={onSubmit} onOpenProject={() => undefined} />
    </I18nProvider>,
  );
}

async function submitAndReadAlert(onSubmit: (payload: unknown) => Promise<boolean> | void): Promise<string[]> {
  renderHome(onSubmit);
  await screen.findByTestId('home-hero-input');
  setHomeHeroPrompt('做一个落地页');
  fireEvent.click(await screen.findByTestId('home-hero-submit'));
  const alert = await screen.findByRole('alert');
  return (alert.textContent ?? '').split('\n');
}

describe('首页发送失败文案(OPEND-2849 第四轮)', () => {
  it('S03:建项目返回 AMR_AUTH_REQUIRED → 「Open Design 尚未登录」+ 正文', async () => {
    const lines = await submitAndReadAlert(vi.fn().mockRejectedValue(
      new ProjectCreateError('AMR sign-in is required.', 401, 'AMR_AUTH_REQUIRED', false, 'request-1'),
    ));
    expect(lines).toEqual(['Open Design 尚未登录', '请先登录，以便查看项目和继续对话。']);
  });

  it('S28a:请求没到 daemon → 「本地连接已断开」+ 正文', async () => {
    const lines = await submitAndReadAlert(vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(lines).toEqual([
      '本地连接已断开',
      '暂时无法连接这台电脑上的 Open Design 服务，请重启客户端。',
    ]);
  });
});
