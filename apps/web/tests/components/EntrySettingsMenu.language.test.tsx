// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntrySettingsMenu } from '../../src/components/EntrySettingsMenu';
import { I18nProvider, type Locale } from '../../src/i18n';
import type { AppConfig } from '../../src/types';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track }) };
});

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: null,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    theme: 'system',
    ...overrides,
  } as AppConfig;
}

function renderMenu(locale: Locale = 'en') {
  return render(
    <I18nProvider initial={locale}>
      <EntrySettingsMenu
        config={baseConfig()}
        onOpenSettings={vi.fn()}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  track.mockClear();
  globalThis.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('EntrySettingsMenu language picker a11y', () => {
  it.each(['zh-CN', 'zh-TW'] as const)('%s offers Feishu without Discord counts or presence requests', (locale) => {
    renderMenu(locale);
    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));
    const link = screen.getByRole('menuitem', { name: locale === 'zh-CN' ? '加入飞书群' : '加入飛書群' });
    expect(link.getAttribute('href')).toBe('https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=a38j32fc-756c-4d02-846b-53356fee12a7');
    expect(link.textContent).toBe(locale === 'zh-CN' ? '加入飞书群' : '加入飛書群');
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/api/community/discord'))).toHaveLength(0);
    fireEvent.click(link);
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ element: 'join_feishu', area: 'settings_popover' }), undefined);
    expect(track.mock.calls.filter(([, props]) => props?.element === 'join_feishu')).toHaveLength(1);
  });

  it('updates the destination immediately when changing English to Chinese and back', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ onlineCount: 123, memberCount: 456 })) as typeof fetch;
    renderMenu();
    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));
    await screen.findByText('123 online');
    expect(screen.getByRole('menuitem', { name: /Join Discord/ }).getAttribute('href')).toBe('https://discord.gg/mHAjSMV6gz');

    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '简体中文' }));
    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));
    expect(screen.getByRole('menuitem', { name: '加入飞书群' }).getAttribute('data-community-platform')).toBe('feishu');
    expect(screen.queryByText('123 online')).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: '简体中文' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }));
    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Join Discord/ }).getAttribute('data-community-platform')).toBe('discord'));
    expect(screen.getByText('123 online')).not.toBeNull();
  });

  it('keeps one consistent menu model and hides the collapsed locale list from a11y/focus', () => {
    const { container } = renderMenu();
    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));

    // The picker trigger participates in the surrounding role="menu" popover as
    // a menuitem that opens a submenu — not a listbox combobox.
    const langTrigger = container.querySelector(
      '.entry-settings-menu__select-trigger',
    ) as HTMLElement;
    expect(langTrigger.getAttribute('role')).toBe('menuitem');
    expect(langTrigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(langTrigger.getAttribute('aria-expanded')).toBe('false');

    // No mixed listbox/option ARIA — locale choices are menuitemradios.
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.querySelector('[role="option"]')).toBeNull();
    const panel = container.querySelector(
      '.entry-settings-menu__select-panel',
    ) as HTMLElement;
    expect(panel.getAttribute('role')).toBe('menu');
    const radios = panel.querySelectorAll('[role="menuitemradio"]');
    expect(radios.length).toBeGreaterThan(1);
    expect(
      Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);

    // Collapsed: the list is inert, so the options stay out of the a11y tree
    // and the tab order even though they remain mounted for the animation.
    const list = container.querySelector(
      '.entry-settings-menu__select-list',
    ) as HTMLElement;
    expect(list.hasAttribute('inert')).toBe(true);

    // Opening flips aria-expanded and lifts inert.
    fireEvent.click(langTrigger);
    expect(langTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(list.hasAttribute('inert')).toBe(false);
  });
});
