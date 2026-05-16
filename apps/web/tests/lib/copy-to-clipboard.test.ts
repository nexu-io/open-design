// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyToClipboard } from '../../src/lib/copy-to-clipboard';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('copyToClipboard', () => {
  it('calls navigator.clipboard.writeText once and returns true on the canonical path', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const ok = await copyToClipboard('hello world');

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('falls back to execCommand("copy") and returns its boolean when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('insecure context'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    // jsdom 29 omits document.execCommand; install a writable stand-in
    // before spying so the fallback branch can run under the test env.
    const execCommand = vi.fn((command: string) => command === 'copy');
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommand,
    });

    try {
      const ok = await copyToClipboard('fallback path');
      expect(ok).toBe(true);
      expect(execCommand).toHaveBeenCalledWith('copy');
    } finally {
      Reflect.deleteProperty(document, 'execCommand');
    }
  });
});
