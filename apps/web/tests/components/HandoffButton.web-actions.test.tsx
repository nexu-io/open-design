// @vitest-environment jsdom

// #787 — container/Web degraded hand-off surface. When the daemon reports
// `canRevealFolder: false` (headless / --serve-web / sandbox / no opener),
// the local Open Folder affordances must disappear and the web-native
// alternatives (Copy Path / Download / Remote Open) must take their place.
// `canRevealFolder: true` — and, for older daemons, an absent field — keeps
// the existing local desktop behavior byte-for-byte.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider } from '../../src/i18n';
import type { HostEditorsResponse } from '@open-design/contracts';

const fetchHostEditors = vi.fn<() => Promise<HostEditorsResponse>>();
const openProjectInEditor = vi.fn();
const copyToClipboard = vi.fn();
const downloadProjectArchive = vi.fn();

vi.mock('../../src/providers/registry', () => ({
  fetchHostEditors: () => fetchHostEditors(),
  openProjectInEditor: (...args: unknown[]) => openProjectInEditor(...args),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboard(...args),
}));

vi.mock('../../src/runtime/exports', () => ({
  downloadProjectArchive: (...args: unknown[]) => downloadProjectArchive(...args),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  fetchHostEditors.mockReset();
  openProjectInEditor.mockReset();
  copyToClipboard.mockReset();
  downloadProjectArchive.mockReset();
});

const PROJECT_DIR = '/data/open-design/projects/p1';

function renderButton(opts: { onOpenInWebFiles?: () => void } = {}) {
  return render(
    <I18nProvider initial="en">
      <HandoffButton
        projectId="p1"
        projectName="Landing"
        projectDir={PROJECT_DIR}
        onOpenInWebFiles={opts.onOpenInWebFiles}
      />
    </I18nProvider>,
  );
}

describe('HandoffButton container/Web degraded surface (#787)', () => {
  it('replaces the folder-opener fallback with Copy Path / Download / Remote Open and never posts open-in', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'linux',
      editors: [],
      canRevealFolder: false,
    });
    copyToClipboard.mockResolvedValue(true);
    downloadProjectArchive.mockResolvedValue(true);
    const onOpenInWebFiles = vi.fn();

    renderButton({ onOpenInWebFiles });

    const trigger = await screen.findByTestId('handoff-web-actions-trigger');
    // No local Open Folder affordance survives.
    expect(screen.queryByText('File Manager')).toBeNull();
    expect(screen.queryByText('Finder')).toBeNull();

    fireEvent.click(trigger);
    const menu = await screen.findByTestId('handoff-web-actions-menu');
    expect(menu).toBeTruthy();

    fireEvent.click(screen.getByTestId('handoff-web-action-copy-path'));
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(PROJECT_DIR));

    fireEvent.click(screen.getByTestId('handoff-web-action-download'));
    await waitFor(() =>
      expect(downloadProjectArchive).toHaveBeenCalledWith({
        projectId: 'p1',
        fallbackTitle: 'Landing',
      }),
    );

    fireEvent.click(screen.getByTestId('handoff-web-action-remote-open'));
    expect(onOpenInWebFiles).toHaveBeenCalledTimes(1);

    expect(openProjectInEditor).not.toHaveBeenCalled();
  });

  it('hides folder openers from the dropdown and swaps the path row for the three web actions', async () => {
    // The heuristic blind spot inverted at the UI layer: xdg-open probed as
    // available inside a container must still be hidden once the daemon says
    // canRevealFolder=false — launching it would spawn on the daemon host.
    fetchHostEditors.mockResolvedValue({
      platform: 'linux',
      editors: [
        { id: 'file-manager', label: 'File Manager', available: true },
        { id: 'cursor', label: 'Cursor', available: true },
      ],
      canRevealFolder: false,
    });
    const onOpenInWebFiles = vi.fn();

    renderButton({ onOpenInWebFiles });

    fireEvent.click(await screen.findByTestId('handoff-caret'));
    await screen.findByTestId('handoff-menu');

    expect(screen.queryByTestId('handoff-menu-item-file-manager')).toBeNull();
    expect(screen.getByTestId('handoff-menu-item-cursor')).toBeTruthy();
    expect(screen.getByTestId('handoff-web-action-copy-path')).toBeTruthy();
    expect(screen.getByTestId('handoff-web-action-download')).toBeTruthy();
    expect(screen.getByTestId('handoff-web-action-remote-open')).toBeTruthy();
  });

  it('keeps the local folder-opener fallback when canRevealFolder is true', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [],
      canRevealFolder: true,
    });
    openProjectInEditor.mockResolvedValue(undefined);

    renderButton();

    const fallback = (await screen.findByText('Finder')).closest('button') as HTMLButtonElement;
    expect(screen.queryByTestId('handoff-web-actions-trigger')).toBeNull();
    fireEvent.click(fallback);
    await waitFor(() => expect(openProjectInEditor).toHaveBeenCalledWith('p1', 'finder'));
  });

  it('treats an older daemon without the field as revealable (compat default)', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [],
    } as unknown as HostEditorsResponse);

    renderButton();

    expect((await screen.findByText('Finder')).closest('button')).toBeTruthy();
    expect(screen.queryByTestId('handoff-web-actions-trigger')).toBeNull();
  });
});
