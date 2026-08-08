// @vitest-environment jsdom

// Acceptance defect #100: handing a project off to an editor or a CLI agent is
// an async operation — the daemon spawns the editor, or we build and write the
// CLI prompt to the clipboard — but the control gave no in-flight feedback. It
// just sat there until the result arrived, which reads as "clicking did
// nothing". Every handoff control now swaps its icon for the shared spinner
// while its own action is pending, so the click is always acknowledged.
//
// The invariant these lock in: the control that was clicked shows a spinner
// (`.icon-spin`, the canonical `<Icon name="spinner" />`) for exactly as long as
// its own handoff promise is outstanding, then returns to its resting icon.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider } from '../../src/i18n';
import type { HostEditorsResponse } from '@open-design/contracts';

const fetchHostEditors = vi.fn<() => Promise<HostEditorsResponse>>();
const openProjectInEditor = vi.fn();
const copyToClipboard = vi.fn();

vi.mock('../../src/providers/registry', () => ({
  fetchHostEditors: () => fetchHostEditors(),
  openProjectInEditor: (...args: unknown[]) => openProjectInEditor(...args),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboard(...args),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  fetchHostEditors.mockReset();
  openProjectInEditor.mockReset();
  copyToClipboard.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const oneEditor: HostEditorsResponse = {
  platform: 'darwin',
  editors: [{ id: 'vscode', label: 'VS Code', available: true }],
};

describe('HandoffButton loading feedback (#100)', () => {
  it('spins the primary trigger while the editor launch is in flight', async () => {
    fetchHostEditors.mockResolvedValue(oneEditor);
    const gate = deferred<void>();
    openProjectInEditor.mockReturnValue(gate.promise);

    render(
      <I18nProvider initial="en">
        <HandoffButton projectId="p1" projectDir="/tmp/p1" />
      </I18nProvider>,
    );

    const trigger = await screen.findByTestId('handoff-trigger');
    expect(trigger.querySelector('.icon-spin')).toBeNull();

    fireEvent.click(trigger);

    // The click is acknowledged immediately with an in-flight spinner.
    await waitFor(() => expect(trigger.querySelector('.icon-spin')).not.toBeNull());
    expect(openProjectInEditor).toHaveBeenCalledWith('p1', 'vscode', null);

    // Once the launch settles, the spinner is gone.
    gate.resolve();
    await waitFor(() => expect(trigger.querySelector('.icon-spin')).toBeNull());
  });

  it('spins a CLI agent card while its prompt copy is in flight', async () => {
    fetchHostEditors.mockResolvedValue(oneEditor);
    const gate = deferred<boolean>();
    copyToClipboard.mockReturnValue(gate.promise);

    render(
      <I18nProvider initial="en">
        <HandoffButton projectId="p1" projectDir="/tmp/p1" />
      </I18nProvider>,
    );

    // Open the picker (the split trigger launches the editor, the caret opens
    // the menu) and switch to the CLI / agents tab.
    fireEvent.click(await screen.findByTestId('handoff-caret'));
    fireEvent.click(screen.getByText('Copy for CLI'));

    const claude = await screen.findByTestId('handoff-cli-item-claude');
    expect(claude.querySelector('.icon-spin')).toBeNull();

    fireEvent.click(claude);

    await waitFor(() => expect(claude.querySelector('.icon-spin')).not.toBeNull());
    expect(copyToClipboard).toHaveBeenCalled();

    gate.resolve(true);
    await waitFor(() => expect(claude.querySelector('.icon-spin')).toBeNull());
  });
});
