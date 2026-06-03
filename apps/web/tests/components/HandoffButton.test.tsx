// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HostEditor, HostEditorsResponse } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider, type Locale } from '../../src/i18n';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

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
  it('keeps the header trigger as an icon-sized split control', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.app .handoff-split');
    expect(css).toContain('border: 1px solid transparent;');
    expect(css).toContain('.app .handoff-trigger');
    expect(css).toContain('width: 32px;');
    expect(css).toContain('height: 30px;');
    expect(css).toContain('.app .handoff-caret');
    expect(css).toContain('width: 24px;');
  });

  it('localizes the primary handoff label', async () => {
    stubEditors([{ id: 'finder', label: 'Finder', available: true }]);

    renderLocalized('en');

    const trigger = await screen.findByTestId('handoff-trigger');
    expect(trigger.getAttribute('title')).toBe('Open in Finder');
    expect(trigger.querySelector('.handoff-trigger-label')?.classList.contains('sr-only')).toBe(true);
  });

  it('localizes the unavailable editor section', async () => {
    stubEditors([
      { id: 'finder', label: 'Finder', available: true },
      { id: 'cursor', label: 'Cursor', available: false },
    ]);

    renderLocalized('zh-CN');

    fireEvent.click(await screen.findByTestId('handoff-caret'));

    expect((await screen.findAllByText('未安装')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('handoff-menu-item-cursor').getAttribute('title'))
      .toBe('Cursor - 未在 $PATH 中检测到');
  });
});
