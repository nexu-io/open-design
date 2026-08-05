import { describe, expect, it } from 'vitest';
import { createProjectEventRegistry } from '../../src/runtimes/project-events.js';

describe('project event registry', () => {
  it('emits to every subscriber for a project', () => {
    const registry = createProjectEventRegistry();
    const seen: unknown[] = [];
    registry.sinks.set('project-1', new Set([
      (payload) => seen.push(['first', payload]),
      (payload) => seen.push(['second', payload]),
    ]));

    expect(registry.emit('project-1', { type: 'conversation-created' })).toBe(true);
    expect(seen).toHaveLength(2);
  });

  it('removes throwing subscribers and reports delivery when any sink was present', () => {
    const registry = createProjectEventRegistry();
    const seen: unknown[] = [];
    registry.sinks.set('project-1', new Set([
      () => { throw new Error('closed stream'); },
      (payload) => seen.push(payload),
    ]));

    expect(registry.emit('project-1', { type: 'live_artifact' })).toBe(true);
    expect(seen).toHaveLength(1);
    expect(registry.sinks.get('project-1')).toHaveLength(1);
  });

  it('returns false without a project or subscribers', () => {
    const registry = createProjectEventRegistry();

    expect(registry.emit(undefined, { type: 'ignored' })).toBe(false);
    expect(registry.emit('missing', { type: 'ignored' })).toBe(false);
  });
});
