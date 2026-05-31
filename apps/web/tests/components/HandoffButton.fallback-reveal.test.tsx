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
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [],
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

  it('surfaces a daemon spawn failure inline so the fallback is not a silent no-op', async () => {
    // The production caller (`ProjectView`) mounts `<HandoffButton projectId={…} />`
    // with no `onRequestRevealInFinder` callback, so a rejected
    // `openProjectInEditor` would otherwise leave users with a CTA that
    // advertises Finder/Explorer/File Manager but does nothing visible.
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [],
    });
    openProjectInEditor.mockRejectedValue(new Error('daemon refused: ENOENT'));

    render(
      <I18nProvider initial="en">
        <HandoffButton projectId="p1" />
      </I18nProvider>,
    );

    const fallback = (await screen.findByText('Finder')).closest('button') as HTMLButtonElement;
    fireEvent.click(fallback);

    const errorEl = await screen.findByTestId('handoff-fallback-error');
    expect(errorEl.textContent).toContain('daemon refused: ENOENT');
  });
});
