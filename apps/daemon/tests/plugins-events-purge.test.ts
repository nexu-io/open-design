// Plan §3.NN1 — purgePluginEventBuffer().

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPluginEventBufferForTests,
  pluginEventBufferSize,
  pluginEventSnapshot,
  purgePluginEventBuffer,
  recordPluginEvent,
  subscribePluginEvents,
} from '../src/plugins/events.js';

beforeEach(() => __resetPluginEventBufferForTests());
afterEach(() => __resetPluginEventBufferForTests());

describe('purgePluginEventBuffer', () => {
  it('returns zero-shape on an already-empty buffer', () => {
    const result = purgePluginEventBuffer();
    expect(result.purged).toBe(0);
    expect(result.firstId).toBeNull();
    expect(result.lastId).toBeNull();
    expect(result.preNextId).toBe(1);
  });

  it('records pre-purge id range + count, then empties the buffer', () => {
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'b' });
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'a' });
    expect(pluginEventBufferSize()).toBe(3);

    const result = purgePluginEventBuffer();
    expect(result.purged).toBe(3);
    expect(result.firstId).toBe(1);
    expect(result.lastId).toBe(3);
    expect(result.preNextId).toBe(4);
    expect(pluginEventBufferSize()).toBe(0);
    expect(pluginEventSnapshot()).toEqual([]);
  });

  it('purge resets nextId so the buffer restarts from id=1', () => {
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'b' });
    purgePluginEventBuffer();
    const next = recordPluginEvent({ kind: 'plugin.installed', pluginId: 'c' });
    expect(next.id).toBe(1);
  });

  it('subscribers cleared on purge; new subscribers see post-purge events', () => {
    const seen: number[] = [];
    const off = subscribePluginEvents((ev) => seen.push(ev.id));
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    expect(seen).toEqual([1]);
    purgePluginEventBuffer();
    // Purge calls the buffer's reset() which also clears subscribers
    // (see PluginEventBuffer.reset). New events post-purge re-issue
    // ids from 1 and the now-disconnected subscriber stays silent.
    off();
    const seenAfter: number[] = [];
    const offAfter = subscribePluginEvents((ev) => seenAfter.push(ev.id));
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'b' });
    expect(seenAfter).toEqual([1]);
    offAfter();
  });
});
