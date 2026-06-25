// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesignSystemSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchDesignSystem: vi.fn(),
  fetchDesignSystemPreview: vi.fn(),
  fetchDesignSystemShowcase: vi.fn(),
}));

import { DesignSystemPicker } from '../../src/components/DesignSystemPicker';
import { I18nProvider, type Locale } from '../../src/i18n';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../../src/providers/registry';

const fetchDesignSystemMock = vi.mocked(fetchDesignSystem);
const fetchDesignSystemPreviewMock = vi.mocked(fetchDesignSystemPreview);
const fetchDesignSystemShowcaseMock = vi.mocked(fetchDesignSystemShowcase);

const designSystems: DesignSystemSummary[] = [
  {
    id: 'clay',
    title: 'Clay',
    summary: 'Friendly tactile product UI.',
    category: 'Product',
    swatches: ['#f4efe7', '#25211d'],
  },
  {
    id: 'noir',
    title: 'Editorial Noir',
    summary: 'High-contrast editorial system.',
    category: 'Editorial',
    swatches: ['#111111', '#f7f0e8'],
  },
];

beforeEach(() => {
  fetchDesignSystemMock.mockImplementation(async (id) => ({
    id,
    title: id === 'clay' ? 'Clay' : 'Editorial Noir',
    summary: id === 'clay' ? 'Friendly tactile product UI.' : 'High-contrast editorial system.',
    category: id === 'clay' ? 'Product' : 'Editorial',
    body: `# ${id}`,
  }));
  fetchDesignSystemPreviewMock.mockResolvedValue('<html><body><h1>Preview</h1></body></html>');
  fetchDesignSystemShowcaseMock.mockResolvedValue('<html><body><h1>Showcase</h1></body></html>');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DesignSystemPicker', () => {
  function renderPicker(
    props: Partial<ComponentProps<typeof DesignSystemPicker>> = {},
    locale: Locale = 'zh-CN',
  ) {
    return render(
      <I18nProvider initial={locale}>
        <DesignSystemPicker
          designSystems={designSystems}
          selectedId="noir"
          onChange={vi.fn()}
          {...props}
        />
      </I18nProvider>,
    );
  }

  it('checks the active project design system and previews it by default', async () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));

    const activeOption = await screen.findByTestId('project-ds-picker-option-noir');
    expect(activeOption.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('project-ds-picker-option-noir-check')).toBeTruthy();

    await waitFor(() => {
      expect(fetchDesignSystemPreviewMock).toHaveBeenCalledWith('noir');
    });
    expect(await screen.findByTestId('project-ds-picker-preview-frame')).toBeTruthy();
  });

  it('updates the preview target on hover and opens the fullscreen preview', async () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    await screen.findByTestId('project-ds-picker-preview-frame');

    fireEvent.mouseEnter(screen.getByTestId('project-ds-picker-option-clay'));
    await waitFor(() => {
      expect(fetchDesignSystemPreviewMock).toHaveBeenCalledWith('clay');
    });

    fireEvent.click(await screen.findByTestId('project-ds-picker-preview-expand'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('Clay').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('selects a design system option with keyboard activation', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    const option = await screen.findByTestId('project-ds-picker-option-clay');
    option.focus();
    fireEvent.keyDown(option, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('clay');
  });

  it('selects the no-design-system option with keyboard activation', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    const option = (await screen.findAllByRole('option'))[0];
    if (!option) throw new Error('Expected the no-design-system option to render');
    option.focus();
    fireEvent.keyDown(option, { key: ' ' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('uses localized picker copy', async () => {
    renderPicker({}, 'fr');

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));

    // Category chips were removed from the list/preview per design; only the
    // surrounding picker copy needs to localize.
    expect(screen.getByPlaceholderText('Rechercher des systèmes de design')).toBeTruthy();
    expect(screen.getByText('Aucun système de design')).toBeTruthy();
  });
});
