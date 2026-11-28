import { afterEach, describe, expect, it } from 'vitest';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { appendOpenCodeConnectionTestFlags } from '../../src/runtimes/opencode-permissions.js';

// The connection smoke test runs a one-off `opencode run` against the user's
// real CLI. 1.x isolated it with `--pure`; 2.x removed that flag, so the
// isolation stack becomes `--archived` (keeps the session out of the user's
// session list) on top of the `--standalone` server the buildArgs helper adds.
// mimo is a fork that still speaks `--pure` and must be untouched.
afterEach(() => {
  agentCapabilities.delete('opencode');
  agentCapabilities.delete('mimo');
});

describe('opencode connection-test isolation flags', () => {
  it('v2 dialect: no --pure; the smoke session is archived and titled instead', () => {
    agentCapabilities.set('opencode', { skipPermissions: '--auto', archivedSessions: true });
    const args: string[] = [];
    appendOpenCodeConnectionTestFlags(args, 'opencode');
    expect(args).toEqual(['--archived', '--title', 'Connection test']);
  });

  it('mimo keeps the unconditional --pure isolation it has today', () => {
    const args: string[] = [];
    appendOpenCodeConnectionTestFlags(args, 'mimo');
    expect(args).toContain('--pure');
    expect(args).toContain('--title');
    expect(args).not.toContain('--archived');
  });

  it('unprobed opencode keeps --pure (1.x status quo)', () => {
    const args: string[] = [];
    appendOpenCodeConnectionTestFlags(args, 'opencode');
    expect(args).toContain('--pure');
    expect(args).toContain('--title');
  });

  it('does not duplicate flags already present in argv', () => {
    agentCapabilities.set('opencode', { skipPermissions: '--auto', archivedSessions: true });
    const args: string[] = ['--title', 'Connection test'];
    appendOpenCodeConnectionTestFlags(args, 'opencode');
    expect(args.filter((arg) => arg === '--title')).toHaveLength(1);
    expect(args.filter((arg) => arg === 'Connection test')).toHaveLength(1);
  });
});
