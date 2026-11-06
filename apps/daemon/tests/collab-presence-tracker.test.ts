import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollabPresenceTracker } from '../src/collab/presence-tracker.js';

let clock = 0;
const now = () => clock;

beforeEach(() => {
  clock = 1_000;
});

function ids(members: { memberId: string }[]): string[] {
  return members.map((member) => member.memberId).sort();
}

describe('CollabPresenceTracker', () => {
  it('lists members that have recently heartbeat', () => {
    const tracker = new CollabPresenceTracker({ ttlMs: 100, now });
    tracker.heartbeat('p1', { memberId: 'm1', role: 'owner' });
    tracker.heartbeat('p1', { memberId: 'm2', role: 'member' });
    expect(ids(tracker.present('p1'))).toEqual(['m1', 'm2']);
    expect(tracker.present('other')).toEqual([]);
  });

  it('drops a member whose heartbeat aged past the TTL', () => {
    const tracker = new CollabPresenceTracker({ ttlMs: 100, now });
    tracker.heartbeat('p1', { memberId: 'm1' });
    clock += 99;
    expect(ids(tracker.present('p1'))).toEqual(['m1']); // still inside TTL
    clock += 2; // now 101ms since heartbeat, past TTL
    expect(tracker.present('p1')).toEqual([]);
  });

  it('keeps a member present as long as they keep heartbeating', () => {
    const tracker = new CollabPresenceTracker({ ttlMs: 100, now });
    tracker.heartbeat('p1', { memberId: 'm1' });
    clock += 90;
    tracker.heartbeat('p1', { memberId: 'm1' }); // refresh
    clock += 90; // 90ms since the refresh — still present despite 180ms total
    expect(ids(tracker.present('p1'))).toEqual(['m1']);
  });

  it('removes a member immediately on explicit leave', () => {
    const tracker = new CollabPresenceTracker({ ttlMs: 10_000, now });
    tracker.heartbeat('p1', { memberId: 'm1' });
    tracker.heartbeat('p1', { memberId: 'm2' });
    tracker.leave('p1', 'm1');
    expect(ids(tracker.present('p1'))).toEqual(['m2']);
  });

  it('does not let an old client leave remove a replacement session', () => {
    const tracker = new CollabPresenceTracker({ ttlMs: 10_000, now });
    tracker.heartbeat('p1', { memberId: 'm1' }, 'old-client');
    tracker.heartbeat('p1', { memberId: 'm1' }, 'replacement-client');

    tracker.leave('p1', 'm1', 'old-client');

    expect(ids(tracker.present('p1'))).toEqual(['m1']);
    tracker.leave('p1', 'm1', 'replacement-client');
    expect(tracker.present('p1')).toEqual([]);
  });

  it('fires onChange on join and leave, but not on a refresh heartbeat', () => {
    const onChange = vi.fn();
    const tracker = new CollabPresenceTracker({ ttlMs: 10_000, now, onChange });

    tracker.heartbeat('p1', { memberId: 'm1' }); // join
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(ids(onChange.mock.calls[0]![0].present)).toEqual(['m1']);

    tracker.heartbeat('p1', { memberId: 'm1' }); // refresh — no membership change
    expect(onChange).toHaveBeenCalledTimes(1);

    tracker.heartbeat('p1', { memberId: 'm2' }); // join
    expect(onChange).toHaveBeenCalledTimes(2);

    tracker.leave('p1', 'm1'); // leave
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(ids(onChange.mock.calls[2]![0].present)).toEqual(['m2']);
  });

  it('ignores a leave for an unknown member', () => {
    const onChange = vi.fn();
    const tracker = new CollabPresenceTracker({ ttlMs: 10_000, now, onChange });
    tracker.leave('p1', 'ghost');
    expect(onChange).not.toHaveBeenCalled();
  });
});
