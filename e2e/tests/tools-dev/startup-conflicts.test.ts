// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { isToolsDevPortConflict } from '@/vitest/tools-dev';

describe('tools-dev startup conflict detection', () => {
  test('classifies port and namespace startup collisions as retryable', () => {
    expect(isToolsDevPortConflict(new Error('listen EADDRINUSE: address already in use 127.0.0.1:30123'))).toBe(true);
    expect(
      isToolsDevPortConflict(
        new Error(
          'daemon is already running in namespace e2e-orbit-run-123 at http://127.0.0.1:36695; stop it or choose another namespace',
        ),
      ),
    ).toBe(true);
    expect(isToolsDevPortConflict(new Error('daemon exited before readiness'))).toBe(false);
  });
});
