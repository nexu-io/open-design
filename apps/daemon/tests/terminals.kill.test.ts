import { describe, expect, it, vi } from 'vitest';

import { killTerminalPty } from '../src/terminals.js';

describe('terminal PTY termination', () => {
  it('omits unsupported signals when killing a Windows ConPTY session', () => {
    const kill = vi.fn();

    killTerminalPty({ kill }, 'SIGTERM', 'win32');

    expect(kill).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledWith();
  });

  it('forwards the requested signal on POSIX', () => {
    const kill = vi.fn();

    killTerminalPty({ kill }, 'SIGTERM', 'darwin');

    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });
});
