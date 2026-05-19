// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const systems: DesignSystemSummary[] = [
  {
    id: 'user:acme',
    title: 'Acme Design System',
    category: 'Custom',
    summary: 'Internal product system.',
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    updatedAt: '2026-05-13T03:19:00.000Z',
  },
  {
    id: 'linear',
    title: 'Linear',
    category: 'Productivity & SaaS',
    summary: 'Quiet issue-tracker system.',
    surface: 'web',
    source: 'built-in',
    status: 'published',
    isEditable: false,
  },
];

describe('DesignSystemsTab', () => {
  it('surfaces user-created design systems in the gallery', () => {
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onPreview={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Acme Design System')).toBeTruthy();
    expect(screen.getByText('Linear')).toBeTruthy();
  });

  it('routes create and open actions to the dedicated design-system flow', () => {
    const onCreate = vi.fn();
    const onOpenSystem = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onPreview={() => {}}
        onCreate={onCreate}
        onOpenSystem={onOpenSystem}
      />,
    );

    fireEvent.click(screen.getByText('Create'));
    expect(onCreate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText('Edit'));
    expect(onOpenSystem).toHaveBeenCalledWith('user:acme');
  });
});
