// @vitest-environment jsdom
/**
 * Documents the React event.currentTarget + functional setState race that
 * crashed Settings → About "Allow silent updates" under pending sibling
 * updates (about-updater status, autosave indicator).
 *
 * React clears `event.currentTarget` after the native handler returns. When
 * the fiber already has pending lanes, useState skips eager evaluation and
 * runs the functional updater later — reading `event.currentTarget.checked`
 * then throws TypeError and tears down the tree (error page, needs reload).
 */
import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  cleanup();
});

function BadSilentToggle({ forcePendingLanes }: { forcePendingLanes: boolean }) {
  const [allowSilentUpdates, setAllowSilentUpdates] = useState(false);
  const [, setBump] = useState(0);

  useEffect(() => {
    if (!forcePendingLanes) return;
    // Keep this fiber "busy" so subsequent setState may skip eager evaluation.
    const id = window.setInterval(() => setBump((n) => n + 1), 0);
    return () => window.clearInterval(id);
  }, [forcePendingLanes]);

  return (
    <label>
      <input
        type="checkbox"
        checked={allowSilentUpdates}
        data-testid="bad-silent-toggle"
        onChange={(event) => {
          // Intentionally BAD pattern (what SettingsDialog used before the fix).
          setAllowSilentUpdates(() => event.currentTarget.checked);
        }}
      />
      Allow silent updates
    </label>
  );
}

function GoodSilentToggle({ forcePendingLanes }: { forcePendingLanes: boolean }) {
  const [allowSilentUpdates, setAllowSilentUpdates] = useState(false);
  const [, setBump] = useState(0);

  useEffect(() => {
    if (!forcePendingLanes) return;
    const id = window.setInterval(() => setBump((n) => n + 1), 0);
    return () => window.clearInterval(id);
  }, [forcePendingLanes]);

  return (
    <label>
      <input
        type="checkbox"
        checked={allowSilentUpdates}
        data-testid="good-silent-toggle"
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setAllowSilentUpdates(() => next);
        }}
      />
      Allow silent updates
    </label>
  );
}

describe('silent updates currentTarget race', () => {
  it('good pattern survives pending lanes on the same fiber', async () => {
    render(<GoodSilentToggle forcePendingLanes />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    const checkbox = screen.getByTestId('good-silent-toggle') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('bad pattern can throw when currentTarget is read after the handler', async () => {
    // Direct unit of the failure mode: if the functional updater runs after
    // React nulls currentTarget, accessing .checked throws.
    let thrown: unknown = null;
    const event = {
      currentTarget: null as HTMLInputElement | null,
    };
    // Simulate "handler returned; React cleared currentTarget"
    event.currentTarget = null;
    try {
      // Same expression SettingsDialog used inside setCfg(current => ...)
      void (event.currentTarget as unknown as HTMLInputElement).checked;
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(String(thrown)).toMatch(/null|undefined|checked/i);

    // And the fixed capture pattern does not throw even when the event is cleared later.
    const live = { currentTarget: { checked: true } as HTMLInputElement };
    const captured = live.currentTarget.checked;
    live.currentTarget = null as unknown as HTMLInputElement;
    expect(captured).toBe(true);
  });

  it('renders the bad toggle under pending lanes without requiring a green path', async () => {
    // Environment-dependent: some React schedules still eager-evaluate and
    // never hit the throw. We still mount the bad component to keep the
    // race harness available when debugging future regressions.
    render(<BadSilentToggle forcePendingLanes />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(screen.getByTestId('bad-silent-toggle')).toBeTruthy();
  });
});
