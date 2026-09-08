// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: null,
      loading: false,
      failure: 'unsupported' as const,
    }),
  };
});

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';

async function renderMissingImageScenario(locale: 'en' | 'zh-CN') {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));

  render(
    <I18nProvider initial={locale}>
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );

  const trigger = await screen.findByTestId('home-hero-template-trigger');
  await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByTestId('home-hero-template-wedge-image'));
  return screen.findByRole('alert');
}

describe('HomeView missing bundled scenario error', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('explains the missing scenario and recovery step in Chinese while retaining its id', async () => {
    const alert = await renderMissingImageScenario('zh-CN');
    expect(alert.textContent).toBe(
      '内置场景“od-media-generation”未安装。请重新安装 OpenDesign，以恢复默认插件。',
    );
    expect(alert.textContent).not.toContain('Bundled scenario');
  });

  it('preserves the existing English guidance and diagnostic scenario id', async () => {
    const alert = await renderMissingImageScenario('en');
    expect(alert.textContent).toBe(
      'Bundled scenario "od-media-generation" is not installed. Reinstall the daemon to restore the default plugin set.',
    );
  });
});
