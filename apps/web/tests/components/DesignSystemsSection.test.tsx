// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsSection } from '../../src/components/DesignSystemsSection';
import { updateDesignSystemDraft } from '../../src/providers/registry';
import type { AppConfig } from '../../src/types';

const editable: DesignSystemSummary = {
  id: 'user:acme',
  title: 'Acme Design System',
  category: 'Custom',
  summary: 'Internal product system.',
  surface: 'web',
  source: 'user',
  status: 'draft',
  isEditable: true,
  updatedAt: '2026-05-13T03:19:00.000Z',
};

const builtIn: DesignSystemSummary = {
  id: 'linear',
  title: 'Linear',
  category: 'Productivity & SaaS',
  summary: 'Quiet issue-tracker system.',
  surface: 'web',
  source: 'built-in',
  status: 'published',
  isEditable: false,
};

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystems: vi.fn(async () => [editable, builtIn]),
    updateDesignSystemDraft: vi.fn(async () => ({ ...editable, title: 'Acme v2', body: '' })),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cfg = { disabledDesignSystems: [] } as unknown as AppConfig;

describe('DesignSystemsSection rename (issue #2811)', () => {
  it('renames an editable design system from Settings', async () => {
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    const renameButton = await screen.findByRole('button', {
      name: /Rename Acme Design System/i,
    });
    fireEvent.click(renameButton);

    const input = screen.getByDisplayValue('Acme Design System');
    fireEvent.change(input, { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(vi.mocked(updateDesignSystemDraft)).toHaveBeenCalledWith('user:acme', {
        title: 'Acme v2',
      });
    });
  });

  it('offers no Rename for built-in (read-only) design systems', async () => {
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);
    await screen.findByText('Linear');
    expect(screen.queryByRole('button', { name: /Rename Linear/i })).toBeNull();
  });
});
