// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HostEditor, HostEditorsResponse } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider, type Locale } from '../../src/i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function stubEditors(editors: HostEditor[], platform: HostEditorsResponse['platform'] = 'darwin') {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (String(input) === '/api/editors') {
      return new Response(JSON.stringify({ editors, platform }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${String(input)}`);
  }));
}

function renderLocalized(locale: Locale) {
  render(
    <I18nProvider initial={locale}>
      <HandoffButton projectId="project-1" />
    </I18nProvider>,
  );
}

describe('HandoffButton i18n', () => {
  it('localizes the primary handoff label', async () => {
    stubEditors([{ id: 'finder', label: 'Finder', available: true }]);

    renderLocalized('en');

    const trigger = await screen.findByTestId('handoff-trigger');
    expect(trigger.getAttribute('title')).toBe('Hand off to Finder');
    expect(trigger.textContent).toContain('Hand off to Finder');
  });

  it('localizes the unavailable editor section', async () => {
    stubEditors([
      { id: 'finder', label: 'Finder', available: true },
      { id: 'cursor', label: 'Cursor', available: false },
    ]);

    renderLocalized('zh-CN');

    fireEvent.click(await screen.findByTestId('handoff-caret'));

    expect(await screen.findByText('未安装')).toBeTruthy();
    expect(screen.getByTestId('handoff-menu-item-cursor').getAttribute('title'))
      .toBe('Cursor - 未在 $PATH 中检测到');
  });
});
