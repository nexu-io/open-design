import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parsePreviewRuntimeMessage } from '@open-design/contracts/runtime/preview-runtime';
import {
  PREVIEW_RUNTIME_BOOTSTRAP_MARKER,
  buildPreviewRuntimeBootstrap,
} from '../../src/http/preview-runtime-bootstrap.js';

const identity = {
  sessionId: 'session-1',
  documentVersion: '100:200',
};

describe('preview runtime bootstrap', () => {
  it('escapes inline identity data and rejects unbounded identities', () => {
    const bootstrap = buildPreviewRuntimeBootstrap({
      sessionId: 'session-<unsafe>',
      documentVersion: identity.documentVersion,
    });
    expect(bootstrap).toContain(PREVIEW_RUNTIME_BOOTSTRAP_MARKER);
    expect(bootstrap).toContain('session-\\u003cunsafe>');
    expect(bootstrap).not.toContain('session-<unsafe>');
    expect(() => buildPreviewRuntimeBootstrap({
      sessionId: '',
      documentVersion: identity.documentVersion,
    })).toThrow(TypeError);
    expect(() => buildPreviewRuntimeBootstrap({
      ...identity,
      availableCapabilities: ['scroll'],
      modules: [
        { capabilities: ['scroll'], source: "register('scroll',function(){return {};});" },
        { capabilities: ['scroll'], source: "register('scroll',function(){return {};});" },
      ],
    })).toThrow(/must be unique/u);
    expect(() => buildPreviewRuntimeBootstrap({
      ...identity,
      availableCapabilities: ['scroll'],
      modules: [{ capabilities: ['scroll'], source: '</script>' }],
    })).toThrow(/source is invalid/u);
  });

  it('handshakes, fences commands, and only acknowledges advertised capabilities', () => {
    const bootstrap = buildPreviewRuntimeBootstrap({
      ...identity,
      availableCapabilities: ['deck', 'snapshot'],
    });
    const source = bootstrap.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const messages: unknown[] = [];
    const listeners = new Map<string, Array<(event: any) => void>>();
    const parent = { postMessage: (message: unknown) => messages.push(message) };
    const context: Record<string, any> = {
      document: { readyState: 'complete' },
      parent,
      queueMicrotask: (callback: () => void) => callback(),
      Set,
    };
    context.window = context;
    context.addEventListener = (type: string, listener: (event: any) => void) => {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    };

    vm.runInNewContext(source, context);
    expect(messages.map(parsePreviewRuntimeMessage)).toEqual([
      {
        type: 'od:preview:hello',
        protocolVersion: 1,
        ...identity,
        availableCapabilities: ['snapshot', 'deck'],
      },
      { type: 'od:preview:ready', protocolVersion: 1, ...identity },
    ]);

    const probe = (overrides: Record<string, unknown> = {}) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          source: parent,
          data: {
            type: 'od:preview:probe',
            protocolVersion: 1,
            ...identity,
            ...overrides,
          },
        });
      }
    };
    probe({ sessionId: 'stale' });
    expect(messages).toHaveLength(2);
    probe();
    expect(messages.slice(-2).map(parsePreviewRuntimeMessage)).toEqual([
      {
        type: 'od:preview:hello',
        protocolVersion: 1,
        ...identity,
        availableCapabilities: ['snapshot', 'deck'],
      },
      { type: 'od:preview:ready', protocolVersion: 1, ...identity },
    ]);

    const sendCommand = (overrides: Record<string, unknown> = {}) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          source: parent,
          data: {
            type: 'od:preview:set-capabilities',
            protocolVersion: 1,
            ...identity,
            enabledCapabilities: ['edit', 'deck', 'snapshot'],
            ...overrides,
          },
        });
      }
    };
    sendCommand({ documentVersion: 'stale' });
    expect(messages).toHaveLength(4);
    sendCommand();
    expect(parsePreviewRuntimeMessage(messages.at(-1))).toEqual({
      type: 'od:preview:capabilities-applied',
      protocolVersion: 1,
      ...identity,
      enabledCapabilities: ['snapshot', 'deck'],
    });

    for (const listener of listeners.get('message') ?? []) {
      listener({
        source: parent,
        data: {
          type: 'od:preview:presentation-state-barrier',
          protocolVersion: 1,
          ...identity,
          revision: 4,
        },
      });
    }
    expect(parsePreviewRuntimeMessage(messages.at(-1))).toEqual({
      type: 'od:preview:presentation-state-applied',
      protocolVersion: 1,
      ...identity,
      revision: 4,
    });
  });

  it('reports protocol readiness without making a visual-content claim', () => {
    const bootstrap = buildPreviewRuntimeBootstrap(identity);
    const source = bootstrap.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const messages: unknown[] = [];
    const context: Record<string, any> = {
      document: { readyState: 'complete' },
      parent: { postMessage: (message: unknown) => messages.push(message) },
      queueMicrotask: (callback: () => void) => callback(),
      Set,
    };
    context.window = context;
    context.addEventListener = () => {};

    vm.runInNewContext(source, context);

    expect(messages.map(parsePreviewRuntimeMessage)).toEqual([
      {
        type: 'od:preview:hello',
        protocolVersion: 1,
        ...identity,
        availableCapabilities: [],
      },
      { type: 'od:preview:ready', protocolVersion: 1, ...identity },
    ]);
  });

  it('installs capability modules once and applies idempotent enable/disable transitions', () => {
    const bootstrap = buildPreviewRuntimeBootstrap({
      ...identity,
      availableCapabilities: ['scroll'],
      modules: [{
        capabilities: ['scroll'],
        source: `register('scroll',function(){return {
          enable:function(){window.enableCount=(window.enableCount||0)+1;},
          disable:function(){window.disableCount=(window.disableCount||0)+1;}
        };});`,
      }],
    });
    const source = bootstrap.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const messages: unknown[] = [];
    const listeners = new Map<string, Array<(event: any) => void>>();
    const parent = { postMessage: (message: unknown) => messages.push(message) };
    const context: Record<string, any> = {
      document: { readyState: 'complete' },
      parent,
      queueMicrotask: (callback: () => void) => callback(),
      requestAnimationFrame: (callback: () => void) => callback(),
      Set,
    };
    context.window = context;
    context.addEventListener = (type: string, listener: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    vm.runInNewContext(source, context);

    const apply = (enabledCapabilities: string[]) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          source: parent,
          data: {
            type: 'od:preview:set-capabilities',
            protocolVersion: 1,
            ...identity,
            enabledCapabilities,
          },
        });
      }
    };
    apply(['scroll']);
    apply(['scroll']);
    expect(context.enableCount).toBe(1);
    expect(context.disableCount).toBeUndefined();
    apply([]);
    apply([]);
    expect(context.enableCount).toBe(1);
    expect(context.disableCount).toBe(1);
    expect(parsePreviewRuntimeMessage(messages.at(-1))).toEqual({
      type: 'od:preview:capabilities-applied',
      protocolVersion: 1,
      ...identity,
      enabledCapabilities: [],
    });
  });
});
