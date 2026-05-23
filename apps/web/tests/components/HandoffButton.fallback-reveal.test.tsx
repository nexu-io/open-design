// @vitest-environment jsdom

// Regression for the zero-editors fallback: when no editor is detected, the
// fallback button must perform a real reveal (open the project folder via the
// daemon's open-in catalogue: finder / explorer / file-manager) rather than a
// no-op that advertises an action it never runs.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider } from '../../src/i18n';
import type { HostEditorsResponse } from '@open-design/contracts';

const fetchHostEditors = vi.fn<() => Promise<HostEditorsResponse>>();
const openProjectInEditor = vi.fn();

vi.mock('../../src/providers/registry', () => ({
  fetchHostEditors: () => fetchHostEditors(),
  openProjectInEditor: (...args: unknown[]) => openProjectInEditor(...args),
}));

afterEach(() => {
  cleanup();
  fetchHostEditors.mockReset();
  openProjectInEditor.mockReset();
});

describe('HandoffButton zero-editors fallback', () => {
  it('opens the project folder in the OS file manager via the daemon', async () => {
    // No *available* editor (one detected-but-unavailable entry keeps us past
    // the loading short-circuit and into the fallback branch).
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [{ id: 'vscode', label: 'VS Code', available: false }],
    });
    openProjectInEditor.mockResolvedValue(undefined);

    render(
      <I18nProvider initial="en">
        <HandoffButton projectId="p1" />
      </I18nProvider>,
    );

    const fallback = (await screen.findByText('Finder')).closest('button') as HTMLButtonElement;
    fireEvent.click(fallback);

    await waitFor(() => expect(openProjectInEditor).toHaveBeenCalledWith('p1', 'finder'));
  });
});
