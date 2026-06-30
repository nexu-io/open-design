// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesignSystemSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  designSystemStaticUrl: (id: string, filePath: string) => `/design-systems/${id}/${filePath}`,
  fetchDesignSystem: vi.fn(),
  fetchProjectFileText: vi.fn(),
  openExternalUrl: vi.fn(),
  projectRawUrl: (projectId: string, filePath: string) => `/raw/${projectId}/${filePath}`,
}));

import { DesignSystemPicker } from '../../src/components/DesignSystemPicker';
import { I18nProvider, type Locale } from '../../src/i18n';
import {
  fetchDesignSystem,
  fetchProjectFileText,
} from '../../src/providers/registry';

const fetchDesignSystemMock = vi.mocked(fetchDesignSystem);
const fetchProjectFileTextMock = vi.mocked(fetchProjectFileText);

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
    body: [
      `# ${id === 'clay' ? 'Clay' : 'Editorial Noir'}`,
      '',
      id === 'clay' ? 'Friendly tactile product UI.' : 'High-contrast editorial system.',
      '',
      '## Typography',
      id === 'clay' ? '- Display: Fraunces' : '- Display: Playfair Display',
      '- Body: Inter',
      '',
      '## Color Palette',
      id === 'clay' ? '- Warm Paper #f4efe7' : '- Ink #111111',
      id === 'clay' ? '- Charcoal #25211d' : '- Bone #f7f0e8',
    ].join('\n'),
    swatches: id === 'clay' ? ['#f4efe7', '#25211d'] : ['#111111', '#f7f0e8'],
  }));
  fetchProjectFileTextMock.mockResolvedValue(null);
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
      expect(fetchDesignSystemMock).toHaveBeenCalledWith('noir');
    });
    expect(await screen.findByTestId('project-ds-picker-preview-kit-view')).toBeTruthy();
    expect(screen.getByText('High-contrast editorial system.')).toBeTruthy();
    expect(screen.queryByTestId('project-ds-picker-preview-frame')).toBeNull();
  });

  it('updates the preview target on hover and opens the expanded kit preview', async () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('project-ds-picker-trigger'));
    await screen.findByTestId('project-ds-picker-preview-kit-view');

    fireEvent.mouseEnter(screen.getByTestId('project-ds-picker-option-clay'));
    await waitFor(() => {
      expect(fetchDesignSystemMock).toHaveBeenCalledWith('clay');
    });
    expect(screen.getByText('Friendly tactile product UI.')).toBeTruthy();

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
