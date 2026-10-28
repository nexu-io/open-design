// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import { isOpenDesignHostAvailable, pickHostWorkingDir } from '@open-design/host';
import { openFolderDialog } from '../../src/providers/registry';

vi.mock('@open-design/host', async () => {
  const actual = await vi.importActual<typeof import('@open-design/host')>('@open-design/host');
  return {
    ...actual,
    isOpenDesignHostAvailable: vi.fn(),
    pickHostWorkingDir: vi.fn(),
  };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    openFolderDialog: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
  };
});

const mockedIsHostAvailable = vi.mocked(isOpenDesignHostAvailable);
const mockedPickHostWorkingDir = vi.mocked(pickHostWorkingDir);
const mockedOpenFolderDialog = vi.mocked(openFolderDialog);

function renderHome() {
  return render(
    <HomeView
      projects={[]}
      onSubmit={() => undefined}
      onOpenProject={() => undefined}
    />,
  );
}

describe('HomeView working-dir picker host fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedOpenFolderDialog.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  // Regression for the "host unavailable + desktop gate active" case. When the
  // desktop host is present but cannot mint a working-dir token (mixed-version
  // upgrade where the preload lacks project.pickWorkingDir, or a host error),
  // we must NOT fall back to the browser folder dialog: that path yields a raw
  // path with no host token, so the later working-dir POST would be rejected by
  // the desktop auth gate and surface as a confusing late create-time failure.
  it('surfaces the host error instead of falling back to the browser dialog when the host pick fails', async () => {
    mockedIsHostAvailable.mockReturnValue(true);
    mockedPickHostWorkingDir.mockResolvedValue({
      ok: false,
      reason: 'host build does not support pickWorkingDir',
    });

    renderHome();

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't open the folder picker/i)).toBeTruthy();
    });
    expect(mockedOpenFolderDialog).not.toHaveBeenCalled();
  });

  // The pure web path (no desktop host) has no token gate, so the raw browser
  // folder path is the expected input and the dialog fallback is correct.
  it('uses the browser folder dialog on the pure web path', async () => {
    mockedIsHostAvailable.mockReturnValue(false);
    mockedOpenFolderDialog.mockResolvedValue('/Users/me/web-folder');

    renderHome();

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(mockedOpenFolderDialog).toHaveBeenCalledTimes(1);
    });
    expect(mockedPickHostWorkingDir).not.toHaveBeenCalled();
  });

  // An explicit cancel of the host picker must not pop a second dialog.
  it('does not fall back to the browser dialog when the user cancels the host picker', async () => {
    mockedIsHostAvailable.mockReturnValue(true);
    mockedPickHostWorkingDir.mockResolvedValue({ ok: false, canceled: true });

    renderHome();

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(mockedPickHostWorkingDir).toHaveBeenCalledTimes(1);
    });
    expect(mockedOpenFolderDialog).not.toHaveBeenCalled();
  });

  // A headless daemon (systemd unit without WAYLAND_DISPLAY/DISPLAY) fails
  // zenity before any dialog appears; the daemon maps that to a 500, and
  // openFolderDialog rethrows. The pure web path must surface the error
  // instead of treating it as a silent user cancel.
  it('surfaces the error when the web folder dialog fails on the pure web path', async () => {
    mockedIsHostAvailable.mockReturnValue(false);
    mockedOpenFolderDialog.mockRejectedValue(
      new Error('Could not open folder picker: (zenity:123): Gtk-WARNING **: Failed to open display'),
    );

    renderHome();

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-pick'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't open the folder picker/i)).toBeTruthy();
    });
  });

  // The Add menu's "Link local code" row rides the same picker; it must not
  // fail silently either (it used to look like a dead button).
  it('surfaces the error when Link local code fails on the pure web path', async () => {
    mockedIsHostAvailable.mockReturnValue(false);
    mockedOpenFolderDialog.mockRejectedValue(
      new Error('Could not open folder picker: (zenity:123): Gtk-WARNING **: Failed to open display'),
    );

    renderHome();

    fireEvent.click(screen.getByTestId('home-hero-plus-trigger'));
    fireEvent.click(screen.getByTestId('composer-plus-local-code'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't open the folder picker/i)).toBeTruthy();
    });
  });
});
