// Red spec for the presence CLI spawn budget.
//
// Presence heartbeat/list/leave are high-frequency lease traffic: the web
// client beats every 10 seconds and every beat spawns a `vela collab presence
// …` child process. Without a wall-clock budget a wedged CLI (hung network,
// stalled auth refresh) piles up unbounded child processes while the client
// keeps beating. Presence spawns must carry an explicit `timeoutMs`; the
// lower-frequency member/comment commands keep their existing unbounded
// behavior.

import { describe, expect, it, vi } from 'vitest';

const { runVelaCommandMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
}));

vi.mock('../src/integrations/vela-command.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/integrations/vela-command.js')>()),
  runVelaCommand: runVelaCommandMock,
}));

import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';

describe('vela CLI presence command timeout', () => {
  it('bounds every presence spawn with a positive timeoutMs', async () => {
    runVelaCommandMock.mockReset();
    runVelaCommandMock.mockResolvedValue('{"viewers":[]}');
    const client = createVelaCliCollabClient();

    await client.heartbeatPresence('p1', { member: { memberId: 'm1' } }, 'w1');
    await client.listPresence('p1', 'w1');
    await client.leavePresence('p1', { memberId: 'm1' }, 'w1');

    expect(runVelaCommandMock).toHaveBeenCalledTimes(3);
    for (const [args, options] of runVelaCommandMock.mock.calls) {
      expect(args[0]).toBe('collab');
      expect(args[1]).toBe('presence');
      expect(options?.timeoutMs).toBeGreaterThan(0);
      expect(options?.timeoutMs).toBeLessThanOrEqual(30_000);
    }
  });
});
