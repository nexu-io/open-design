// @vitest-environment jsdom

import { installMockOpenDesignHost } from '@open-design/host/testing';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkingDirPill } from '../../src/components/WorkingDirPill';

let restoreHost: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restoreHost?.();
  restoreHost = null;
  vi.restoreAllMocks();
});

describe('WorkingDirPill', () => {
  it('shows a visible fallback instead of silently doing nothing in web builds', async () => {
    render(
      <WorkingDirPill
        projectId="project-1"
        resolvedDir="/Users/example/open-design/project-1"
      />,
    );

    fireEvent.click(screen.getByTestId('working-dir-pill-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in file manager' }));

    expect(
      await screen.findByText('Open this project in the desktop app to show the folder.'),
    ).toBeTruthy();
    expect(screen.getByTestId('working-dir-pill-menu')).toBeTruthy();
  });

  it('opens the project directory through the desktop host bridge', async () => {
    const openPath = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: {
        shell: {
          openPath,
        },
      },
    });

    render(
      <WorkingDirPill
        projectId="project-1"
        resolvedDir="/Users/example/open-design/project-1"
      />,
    );

    fireEvent.click(screen.getByTestId('working-dir-pill-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in file manager' }));

    await waitFor(() => {
      expect(openPath).toHaveBeenCalledWith('project-1');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('working-dir-pill-menu')).toBeNull();
    });
  });
});
