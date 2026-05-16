// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';

const PLUGIN_ROW = {
  id: 'localized-plugin',
  title: 'Localized Plugin',
  version: '1.0.0',
  trust: 'trusted' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/localized',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/localized',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'localized-plugin',
    title: 'Localized Plugin',
    version: '1.0.0',
    description: 'A localized fixture',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: {
          en: 'Make a {{topic}} brief.',
          'zh-CN': '生成一份关于 {{topic}} 的简报。',
        },
      },
      inputs: [{ name: 'topic', type: 'string', default: '设计系统' }],
    },
  },
};

const APPLY_RESULT = {
  ok: true,
  query: '生成一份关于 {{topic}} 的简报。',
  contextItems: [],
  inputs: [{ name: 'topic', type: 'string', default: '设计系统' }],
  assets: [],
  mcpServers: [],
  trust: 'trusted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-1',
    pluginId: 'localized-plugin',
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

describe('HomeView plugin i18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('adds the plugin card Use action as context without hydrating the query', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN_ROW] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="zh-CN">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await waitFor(() => screen.getByTestId('plugins-home-use-localized-plugin')));

    expect(screen.getByTestId('home-hero-context-plugin-localized-plugin')).toBeTruthy();
    expect((await screen.findByTestId('home-hero-input') as HTMLTextAreaElement).value).toBe('');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
  });

  it('hydrates the Home prompt with the localized plugin query', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN_ROW] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify(APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="zh-CN">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await waitFor(() => screen.getByTestId('plugins-home-use-menu-localized-plugin')));
    fireEvent.click(screen.getByTestId('plugins-home-use-with-query-localized-plugin'));

    const input = await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect((input as HTMLTextAreaElement).value).toBe('生成一份关于 设计系统 的简报。');
      expect((input as HTMLTextAreaElement).selectionStart).toBe('生成一份关于 设计系统 的简报。'.length);
      expect((input as HTMLTextAreaElement).selectionEnd).toBe('生成一份关于 设计系统 的简报。'.length);
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/apply'))).toBe(false);
  });
});
