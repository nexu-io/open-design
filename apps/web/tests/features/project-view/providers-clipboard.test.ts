// @vitest-environment jsdom
//
// The Continue-in-CLI clipboard transport delegates to the shared
// copy-to-clipboard helper; pin the delegation with a real Clipboard API
// mock (jsdom does not implement `navigator.clipboard` by default).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyTextToClipboard } from '../../../src/providers/project-view/clipboard';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe('copyTextToClipboard transport', () => {
  it('resolves true when the Clipboard API write succeeds', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    expect(await copyTextToClipboard('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back and resolves false when the Clipboard API rejects and execCommand is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
      configurable: true,
    });
    const originalExecCommand = document.execCommand;
    // @ts-expect-error jsdom does not implement execCommand
    document.execCommand = undefined;
    try {
      expect(await copyTextToClipboard('hello')).toBe(false);
    } finally {
      document.execCommand = originalExecCommand;
    }
  });
});
