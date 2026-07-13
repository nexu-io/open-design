// Unit coverage for the shared invariant behind #5468: cancelRunsOwnedBy must
// terminate exactly the still-active runs owned by a scope (project or
// conversation) and leave everything else alone. The conversation DELETE path
// is exercised end-to-end in delete-cancels-active-runs.test.ts; this locks the
// project scope and the terminal/foreign-scope edges against a real run service.

import { describe, expect, it, vi } from 'vitest';

import { cancelRunsOwnedBy } from '../src/routes/project/cancel-owned-runs.js';
import { createChatRunService } from '../src/runtimes/runs.js';

function makeRunService() {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

describe('cancelRunsOwnedBy (#5468)', () => {
  it('cancels active runs owned by a project and leaves other projects alone', async () => {
    const runs = makeRunService();
    const mine = runs.create({ projectId: 'p1', conversationId: 'c1' });
    const other = runs.create({ projectId: 'p2', conversationId: 'c2' });

    await cancelRunsOwnedBy(runs, { projectId: 'p1' });

    expect(mine.status).toBe('canceled');
    expect(other.status).not.toBe('canceled');
    expect(runs.list({ projectId: 'p1', status: 'active' })).toEqual([]);
    expect(runs.list({ projectId: 'p2', status: 'active' })).toHaveLength(1);
  });

  it('cancels active runs owned by a conversation only', async () => {
    const runs = makeRunService();
    const mine = runs.create({ projectId: 'p1', conversationId: 'c1' });
    const sibling = runs.create({ projectId: 'p1', conversationId: 'c2' });

    await cancelRunsOwnedBy(runs, { conversationId: 'c1' });

    expect(mine.status).toBe('canceled');
    expect(sibling.status).not.toBe('canceled');
  });

  it('is a no-op when the scope owns no active runs', async () => {
    const runs = makeRunService();
    const already = runs.create({ projectId: 'p1', conversationId: 'c1' });
    await runs.cancel(already);
    expect(already.status).toBe('canceled');

    // Should not throw and should not resurrect or re-cancel anything.
    await expect(cancelRunsOwnedBy(runs, { projectId: 'p1' })).resolves.toBeUndefined();
    expect(runs.list({ projectId: 'p1', status: 'active' })).toEqual([]);
  });
});
