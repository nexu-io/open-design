// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsSection } from '../../src/components/DesignSystemsSection';
import { fetchDesignSystems, updateDesignSystemDraft } from '../../src/providers/registry';
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

  it('keeps the rename modal open with the typed title when the update fails', async () => {
    vi.mocked(updateDesignSystemDraft).mockResolvedValueOnce(null);
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    const renameButton = await screen.findByRole('button', {
      name: /Rename Acme Design System/i,
    });
    fireEvent.click(renameButton);

    const input = screen.getByDisplayValue('Acme Design System');
    fireEvent.change(input, { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    // A failed update must not close the modal; the typed title stays for retry.
    await screen.findByText(/Rename failed/i);
    expect(screen.getByDisplayValue('Acme v2')).toBeTruthy();
  });

  it('ignores a stale rename completion when a newer rename session is open', async () => {
    const editableB: DesignSystemSummary = { ...editable, id: 'user:beta', title: 'Beta System' };
    vi.mocked(fetchDesignSystems).mockResolvedValueOnce([editable, editableB, builtIn]);
    let resolveFirst!: (value: null) => void;
    vi.mocked(updateDesignSystemDraft).mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);

    // Session 1: rename Acme and submit; the PATCH stays pending.
    fireEvent.click(await screen.findByRole('button', { name: /Rename Acme Design System/i }));
    fireEvent.change(screen.getByDisplayValue('Acme Design System'), { target: { value: 'Acme v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    // Cancel Acme and open a rename for Beta before the first PATCH resolves.
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Rename Beta System/i }));
    expect(screen.getByDisplayValue('Beta System')).toBeTruthy();

    // The stale Acme request now fails; it must not touch Beta's modal.
    resolveFirst(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByDisplayValue('Beta System')).toBeTruthy();
    expect(screen.queryByText(/Rename failed/i)).toBeNull();
  });

  it('offers no Rename for built-in (read-only) design systems', async () => {
    render(<DesignSystemsSection cfg={cfg} setCfg={() => {}} />);
    await screen.findByText('Linear');
    expect(screen.queryByRole('button', { name: /Rename Linear/i })).toBeNull();
  });
});
