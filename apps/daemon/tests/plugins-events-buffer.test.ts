// Plan §3.II1 — plugin event ring buffer.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPluginEventBufferForTests,
  pluginEventBufferSize,
  pluginEventSnapshot,
  recordPluginEvent,
  subscribePluginEvents,
  type PluginEvent,
} from '../src/plugins/events.js';

beforeEach(() => {
  __resetPluginEventBufferForTests();
});

afterEach(() => {
  __resetPluginEventBufferForTests();
});

describe('recordPluginEvent', () => {
  it('returns the event with monotonic id + epoch ms timestamp', () => {
    const before = Date.now();
    const ev = recordPluginEvent({ kind: 'plugin.installed', pluginId: 'p' });
    const after = Date.now();
    expect(ev.id).toBe(1);
    expect(ev.kind).toBe('plugin.installed');
    expect(ev.pluginId).toBe('p');
    expect(ev.at).toBeGreaterThanOrEqual(before);
    expect(ev.at).toBeLessThanOrEqual(after + 5);
  });

  it('issues monotonically-increasing ids across multiple events', () => {
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'b' });
    recordPluginEvent({ kind: 'plugin.upgraded',    pluginId: 'a' });
    const all = pluginEventSnapshot();
    expect(all.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(all.map((e) => e.kind)).toEqual([
      'plugin.installed', 'plugin.uninstalled', 'plugin.upgraded',
    ]);
  });

  it('attaches details when supplied + omits the field otherwise', () => {
    const a = recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    const b = recordPluginEvent({ kind: 'plugin.installed', pluginId: 'b', details: { version: '1.0.0' } });
    expect(a.details).toBeUndefined();
    expect(b.details).toEqual({ version: '1.0.0' });
  });
});

describe('pluginEventSnapshot', () => {
  it('returns the full buffer when since=0 / omitted', () => {
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'b' });
    expect(pluginEventSnapshot().length).toBe(2);
    expect(pluginEventSnapshot(0).length).toBe(2);
  });

  it('returns only events strictly after `since`', () => {
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });   // id=1
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'b' }); // id=2
    recordPluginEvent({ kind: 'plugin.upgraded', pluginId: 'a' });    // id=3
    const after2 = pluginEventSnapshot(2);
    expect(after2.length).toBe(1);
    expect(after2[0]?.id).toBe(3);
  });

  it('returns a snapshot copy (mutations on the result do not leak into the buffer)', () => {
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    const snap = pluginEventSnapshot();
    snap.length = 0;
    expect(pluginEventSnapshot().length).toBe(1);
  });
});

describe('subscribePluginEvents', () => {
  it('forwards every recorded event to subscribers in order', () => {
    const seen: PluginEvent[] = [];
    const unsubscribe = subscribePluginEvents((ev) => { seen.push(ev); });
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'a' });
    expect(seen.map((e) => e.kind)).toEqual([
      'plugin.installed', 'plugin.uninstalled',
    ]);
    unsubscribe();
  });

  it('stops forwarding after unsubscribe', () => {
    const seen: PluginEvent[] = [];
    const off = subscribePluginEvents((ev) => { seen.push(ev); });
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    off();
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'b' });
    expect(seen.length).toBe(1);
  });

  it('isolates listener exceptions (a throwing subscriber does not block others)', () => {
    const a: PluginEvent[] = [];
    const b: PluginEvent[] = [];
    const offA = subscribePluginEvents(() => { throw new Error('boom'); });
    const offB = subscribePluginEvents((ev) => { b.push(ev); });
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    expect(a.length).toBe(0);
    expect(b.length).toBe(1);
    offA();
    offB();
  });
});

describe('ring buffer cap', () => {
  it('evicts oldest entries past 1000', () => {
    for (let i = 0; i < 1100; i++) {
      recordPluginEvent({ kind: 'plugin.installed', pluginId: `p${i}` });
    }
    expect(pluginEventBufferSize()).toBe(1000);
    const snap = pluginEventSnapshot();
    // The first 100 should have been evicted; the buffer's oldest
    // entry should now be id=101.
    expect(snap[0]?.id).toBe(101);
    expect(snap[snap.length - 1]?.id).toBe(1100);
  });
});
