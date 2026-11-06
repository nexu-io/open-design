import { describe, expect, it } from 'vitest';

import { launchAgentInSystemTerminal } from '../../src/runtimes/terminal-launch.js';

describe('launchAgentInSystemTerminal', () => {
  // Surfaces a `system-terminal launch is not supported on ${platform}`
  // reason on unsupported platforms so the chat's auth banner can fall
  // back to the text-only guidance instead of throwing. Pins the
  // shape the web side asserts on (`{ ok: false, reason: string }`).
  it('rejects unsupported platforms with a structured failure', async () => {
    // `aix` is one of Node's `process.platform` values but not one any
    // OD user would actually run on. A typo'd / future platform should
    // surface the same shape.
    const result = await launchAgentInSystemTerminal('agy', 'aix');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.platform).toBe('aix');
    expect(result.reason).toContain('not supported');
    expect(result.reason).toContain('aix');
  });
});
