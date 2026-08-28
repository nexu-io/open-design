// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkingDirPicker } from '../../src/components/WorkingDirPicker';

function renderPicker(props: Partial<React.ComponentProps<typeof WorkingDirPicker>> = {}) {
  return render(
    <WorkingDirPicker
      workingDir={null}
      recentDirs={[]}
      onPickDirectory={() => undefined}
      onSelectRecent={() => undefined}
      {...props}
    />,
  );
}

describe('WorkingDirPicker manual path entry', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render "Type a path…" when onSubmitPath is omitted', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    expect(screen.queryByTestId('working-dir-manual')).toBeNull();
  });

  it('renders "Type a path…" and submits a trimmed path', async () => {
    const onSubmitPath = vi.fn().mockResolvedValue({ ok: true });
    renderPicker({ onSubmitPath });

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-manual'));

    const input = screen.getByTestId('working-dir-manual-input');
    fireEvent.change(input, { target: { value: '  /repos/my-app  ' } });
    fireEvent.click(screen.getByTestId('working-dir-manual-submit'));

    await waitFor(() => {
      expect(onSubmitPath).toHaveBeenCalledWith('/repos/my-app');
    });
  });

  it('shows an inline error and keeps the panel open on failure', async () => {
    const onSubmitPath = vi.fn().mockResolvedValue({
      ok: false,
      message: "That folder doesn't exist on the server.",
    });
    renderPicker({ onSubmitPath });

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-manual'));
    fireEvent.change(screen.getByTestId('working-dir-manual-input'), {
      target: { value: '/does/not/exist' },
    });
    fireEvent.click(screen.getByTestId('working-dir-manual-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('working-dir-manual-error').textContent).toBe(
        "That folder doesn't exist on the server.",
      );
    });
    // Panel stays open and in manual mode so the user can correct the path.
    expect(screen.getByTestId('working-dir-manual-input')).toBeTruthy();
  });

  it('closes the whole panel on success', async () => {
    const onSubmitPath = vi.fn().mockResolvedValue({ ok: true });
    renderPicker({ onSubmitPath });

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    fireEvent.click(screen.getByTestId('working-dir-manual'));
    fireEvent.change(screen.getByTestId('working-dir-manual-input'), {
      target: { value: '/repos/my-app' },
    });
    fireEvent.click(screen.getByTestId('working-dir-manual-submit'));

    await waitFor(() => {
      expect(screen.queryByTestId('working-dir-panel')).toBeNull();
    });
  });
});
