// Plan §3.KK2 — summarisePluginEvents() pure roll-up.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPluginEventBufferForTests,
  pluginEventSnapshot,
  recordPluginEvent,
  summarisePluginEvents,
} from '../src/plugins/events.js';

beforeEach(() => __resetPluginEventBufferForTests());
afterEach(() => __resetPluginEventBufferForTests());

describe('summarisePluginEvents', () => {
  it('returns zero-shape for an empty list', () => {
    const stats = summarisePluginEvents([]);
    expect(stats.total).toBe(0);
    expect(stats.byKind).toEqual({});
    expect(stats.byPluginId).toEqual({});
    expect(stats.oldestAt).toBeNull();
    expect(stats.newestAt).toBeNull();
    expect(stats.firstId).toBeNull();
    expect(stats.lastId).toBeNull();
  });

  it('counts byKind across the buffer', () => {
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'b' });
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'a' });
    const stats = summarisePluginEvents(pluginEventSnapshot());
    expect(stats.byKind).toEqual({
      'plugin.installed':   2,
      'plugin.uninstalled': 1,
    });
  });

  it('counts byPluginId, skipping empty plugin ids (e.g. marketplace events)', () => {
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'b' });
    recordPluginEvent({ kind: 'plugin.marketplace-refreshed', pluginId: '' });
    const stats = summarisePluginEvents(pluginEventSnapshot());
    expect(stats.byPluginId).toEqual({ a: 2, b: 1 });
  });

  it('records oldestAt + newestAt + id range', () => {
    recordPluginEvent({ kind: 'plugin.installed', pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.upgraded', pluginId: 'a' });
    const stats = summarisePluginEvents(pluginEventSnapshot());
    expect(stats.firstId).toBe(1);
    expect(stats.lastId).toBe(2);
    expect(stats.oldestAt).toBeLessThanOrEqual(stats.newestAt!);
    expect(stats.total).toBe(2);
  });

  it('roll-up over a filtered slice respects the input order', () => {
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.uninstalled', pluginId: 'a' });
    recordPluginEvent({ kind: 'plugin.installed',   pluginId: 'b' });
    const onlyA = pluginEventSnapshot().filter((e) => e.pluginId === 'a');
    const stats = summarisePluginEvents(onlyA);
    expect(stats.total).toBe(2);
    expect(stats.byKind).toEqual({
      'plugin.installed':   1,
      'plugin.uninstalled': 1,
    });
  });
});
