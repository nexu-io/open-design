import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRunRegistry,
  type RunHandle,
  type RunRegistry,
} from '../src/critique/run-registry.js';

function makeHandle(runId: string, projectId = 'p1'): RunHandle {
  return {
    runId,
    projectId,
    abort: new AbortController(),
    startedAt: Date.now(),
  };
}

describe('RunRegistry', () => {
  let registry: RunRegistry;

  beforeEach(() => {
    registry = createRunRegistry();
  });

  // ---------------------------------------------------------------------------
  // register / get
  // ---------------------------------------------------------------------------

  it('returns null for an unregistered (projectId, runId)', () => {
    expect(registry.get('p1', 'unknown')).toBeNull();
  });

  it('register + get round-trips the handle', () => {
    const h = makeHandle('crun_01');
    registry.register(h);
    expect(registry.get('p1', 'crun_01')).toBe(h);
  });

  it('register throws on duplicate (projectId, runId)', () => {
    const h = makeHandle('crun_dup');
    registry.register(h);
    expect(() => registry.register(makeHandle('crun_dup'))).toThrow(
      /duplicate \(projectId="p1", runId="crun_dup"\)/,
    );
  });

  it('register accepts the same runId across different projects', () => {
    // The composite key is (projectId, runId), so two different projects
    // legitimately can carry runs that share an id without colliding.
    const a = makeHandle('crun_shared', 'p1');
    const b = makeHandle('crun_shared', 'p2');
    expect(() => {
      registry.register(a);
      registry.register(b);
    }).not.toThrow();
    expect(registry.get('p1', 'crun_shared')).toBe(a);
    expect(registry.get('p2', 'crun_shared')).toBe(b);
  });

  it('get does not return a handle from a different project even when the runId matches', () => {
    // Cross-project leak guard: looking up a runId that exists in project p2
    // while authenticated as p1 must return null, not p2's handle.
    const inP2 = makeHandle('crun_only_in_p2', 'p2');
    registry.register(inP2);
    expect(registry.get('p1', 'crun_only_in_p2')).toBeNull();
    expect(registry.get('p2', 'crun_only_in_p2')).toBe(inP2);
  });

  // ---------------------------------------------------------------------------
  // interrupt
  // ---------------------------------------------------------------------------

  it('interrupt returns false for an unknown (projectId, runId)', () => {
    expect(registry.interrupt('p1', 'not-there')).toBe(false);
  });

  it('interrupt fires the AbortController and returns true', () => {
    const h = makeHandle('crun_02');
    registry.register(h);
    const aborted = registry.interrupt('p1', 'crun_02', 'user_requested');
    expect(aborted).toBe(true);
    expect(h.abort.signal.aborted).toBe(true);
  });

  it('interrupt passes the reason string to the abort signal', () => {
    const h = makeHandle('crun_03');
    registry.register(h);
    registry.interrupt('p1', 'crun_03', 'test_reason');
    expect(h.abort.signal.reason).toBe('test_reason');
  });

  it('interrupt with no reason still aborts the signal', () => {
    const h = makeHandle('crun_04');
    registry.register(h);
    registry.interrupt('p1', 'crun_04');
    expect(h.abort.signal.aborted).toBe(true);
  });

  it('interrupt does not abort a same-runId handle that belongs to a different project', () => {
    // Cross-project leak guard for interrupt: a request to abort project p1's
    // runId must NOT abort project p2's handle if their ids ever collide.
    const sharedRunId = 'crun_shared_id';
    const inP1 = makeHandle(sharedRunId, 'p1');
    const inP2 = makeHandle(sharedRunId, 'p2');
    registry.register(inP1);
    registry.register(inP2);

    const aborted = registry.interrupt('p1', sharedRunId);
    expect(aborted).toBe(true);
    expect(inP1.abort.signal.aborted).toBe(true);
    expect(inP2.abort.signal.aborted).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // unregister
  // ---------------------------------------------------------------------------

  it('unregister removes the entry so get returns null', () => {
    const h = makeHandle('crun_05');
    registry.register(h);
    registry.unregister('p1', 'crun_05');
    expect(registry.get('p1', 'crun_05')).toBeNull();
  });

  it('unregister is a no-op for an unknown (projectId, runId)', () => {
    expect(() => registry.unregister('p1', 'ghost')).not.toThrow();
  });

  it('unregister keys by project too: removing p1\'s runId does not remove p2\'s same-id handle', () => {
    const sharedRunId = 'crun_shared_for_unregister';
    const inP1 = makeHandle(sharedRunId, 'p1');
    const inP2 = makeHandle(sharedRunId, 'p2');
    registry.register(inP1);
    registry.register(inP2);

    registry.unregister('p1', sharedRunId);
    expect(registry.get('p1', sharedRunId)).toBeNull();
    expect(registry.get('p2', sharedRunId)).toBe(inP2);
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  it('list returns empty array when no runs are registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('list returns a snapshot of all registered handles across projects', () => {
    const h1 = makeHandle('crun_10', 'p1');
    const h2 = makeHandle('crun_11', 'p2');
    registry.register(h1);
    registry.register(h2);
    const snap = registry.list();
    expect(snap).toHaveLength(2);
    expect(snap).toContain(h1);
    expect(snap).toContain(h2);
  });

  it('list returns a defensive copy (mutations do not affect registry)', () => {
    registry.register(makeHandle('crun_12'));
    const snap = registry.list();
    snap.splice(0);
    expect(registry.list()).toHaveLength(1);
  });

  it('list excludes unregistered handles', () => {
    registry.register(makeHandle('crun_13'));
    registry.register(makeHandle('crun_14'));
    registry.unregister('p1', 'crun_13');
    const ids = registry.list().map((h) => h.runId);
    expect(ids).not.toContain('crun_13');
    expect(ids).toContain('crun_14');
  });
});
