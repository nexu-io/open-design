// @vitest-environment jsdom
//
// The generic clipboard helper has two branches: the happy path through
// `navigator.clipboard.writeText`, and the sandboxed fallback that appends a
// transient hidden <input>, selects it, and calls `document.execCommand('copy')`
// when the async clipboard API rejects. These pin both, plus the fallback's own
// throw propagating (the only rejection the contract allows).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyToClipboard } from '../../../src/runtime/clipboard';

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes through navigator.clipboard on the happy path', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await copyToClipboard('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
    // Fallback never ran, so no transient input was appended or left behind.
    expect(execCommand).not.toHaveBeenCalled();
    expect(document.querySelector('input')).toBeNull();
  });

  it('falls back to a transient input + execCommand when the clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    let selectedValue: string | null = null;
    let inputPresentDuringCopy = false;
    const execCommand = vi.fn((command: string) => {
      // The transient input must still be in the DOM (and selected) at the
      // moment the copy command fires, then removed afterward.
      const input = document.querySelector('input');
      inputPresentDuringCopy = command === 'copy' && input !== null;
      selectedValue = input?.value ?? null;
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await copyToClipboard('sandboxed text');

    expect(writeText).toHaveBeenCalledWith('sandboxed text');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(inputPresentDuringCopy).toBe(true);
    expect(selectedValue).toBe('sandboxed text');
    // The transient input is cleaned up after the fallback completes.
    expect(document.querySelector('input')).toBeNull();
  });

  it('rejects when the fallback itself throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('execCommand unavailable');
      }),
    });

    await expect(copyToClipboard('boom')).rejects.toThrow('execCommand unavailable');
  });
});
