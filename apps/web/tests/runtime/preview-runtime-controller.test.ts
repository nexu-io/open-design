import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_RUNTIME_PROTOCOL_VERSION } from '@open-design/contracts/runtime/preview-runtime';
import { PreviewRuntimeController } from '../../src/runtime/preview-runtime-controller';

const identity = { sessionId: 'session-1', documentVersion: 'version-1' };

describe('PreviewRuntimeController', () => {
  it('negotiates only the advertised intersection and avoids duplicate commands', () => {
    const target = { postMessage: vi.fn() };
    const controller = new PreviewRuntimeController({
      identity,
      target,
      enabledCapabilities: ['edit', 'deck', 'snapshot'],
    });
    const hello = {
      type: 'od:preview:hello',
      protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
      ...identity,
      availableCapabilities: ['snapshot', 'deck'],
    };

    controller.handleMessage({ source: target, data: hello });
    // The revision is what lets the reply be matched to this exact command,
    // so it is asserted rather than allowed through a looser matcher.
    expect(target.postMessage).toHaveBeenCalledWith({
      type: 'od:preview:set-capabilities',
      protocolVersion: 1,
      ...identity,
      enabledCapabilities: ['snapshot', 'deck'],
      revision: 1,
    }, '*');

    controller.setEnabledCapabilities(['deck', 'snapshot']);
    expect(target.postMessage).toHaveBeenCalledTimes(1);
    controller.setEnabledCapabilities(['snapshot']);
    expect(target.postMessage).toHaveBeenCalledTimes(2);
    expect(target.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      enabledCapabilities: ['snapshot'],
      // A new command, so a new revision: the previous command's reply must no
      // longer be accepted as an answer to this one.
      revision: 2,
    });
  });

  it('sends and acknowledges an explicit empty capability command', () => {
    const target = { postMessage: vi.fn() };
    const onCapabilitiesApplied = vi.fn();
    const controller = new PreviewRuntimeController({
      identity,
      target,
      callbacks: { onCapabilitiesApplied },
    });

    controller.handleMessage({
      source: target,
      data: {
        type: 'od:preview:hello',
        protocolVersion: 1,
        ...identity,
        availableCapabilities: ['scroll'],
      },
    });
    expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:preview:set-capabilities',
      enabledCapabilities: [],
    }), '*');
    controller.handleMessage({
      source: target,
      data: {
        type: 'od:preview:capabilities-applied',
        protocolVersion: 1,
        ...identity,
        enabledCapabilities: [],
      },
    });
    expect(onCapabilitiesApplied).toHaveBeenCalledWith([]);
    expect(target.postMessage).toHaveBeenLastCalledWith({
      type: 'od:preview:presentation-state-barrier',
      protocolVersion: 1,
      ...identity,
      revision: 1,
    }, '*');
  });

  it('ignores foreign and stale documents while reporting exact lifecycle signals', () => {
    const target = { postMessage: vi.fn() };
    const callbacks = {
      onCapabilitiesApplied: vi.fn(),
      onPresentationStateApplied: vi.fn(),
      onReady: vi.fn(),
    };
    const controller = new PreviewRuntimeController({ identity, target, callbacks });
    const message = (type: string, overrides: Record<string, unknown> = {}) => ({
      type,
      protocolVersion: 1,
      ...identity,
      ...overrides,
    });

    expect(controller.handleMessage({
      source: {},
      data: message('od:preview:ready'),
    })).toBeNull();
    expect(controller.handleMessage({
      source: target,
      data: message('od:preview:ready', { documentVersion: 'stale' }),
    })).toBeNull();
    controller.handleMessage({
      source: target,
      data: message('od:preview:hello', { availableCapabilities: [] }),
    });
    controller.handleMessage({ source: target, data: message('od:preview:ready') });
    controller.handleMessage({
      source: target,
      data: message('od:preview:capabilities-applied', { enabledCapabilities: ['edit'] }),
    });

    expect(callbacks.onCapabilitiesApplied).not.toHaveBeenCalled();
    controller.handleMessage({
      source: target,
      data: message('od:preview:capabilities-applied', { enabledCapabilities: [] }),
    });

    expect(callbacks.onReady).toHaveBeenCalledOnce();
    expect(callbacks.onCapabilitiesApplied).toHaveBeenCalledWith([]);
    controller.handleMessage({
      source: target,
      data: message('od:preview:presentation-state-applied', { revision: 1 }),
    });
    expect(callbacks.onPresentationStateApplied).toHaveBeenCalledOnce();
  });

  it('rejects stale presentation acknowledgements from prior commands', () => {
    const target = { postMessage: vi.fn() };
    const onPresentationStateApplied = vi.fn();
    const controller = new PreviewRuntimeController({
      identity,
      target,
      callbacks: { onPresentationStateApplied },
    });
    const message = (type: string, overrides: Record<string, unknown> = {}) => ({
      type,
      protocolVersion: 1,
      ...identity,
      ...overrides,
    });

    controller.handleMessage({
      source: target,
      data: message('od:preview:hello', { availableCapabilities: [] }),
    });
    controller.handleMessage({
      source: target,
      data: message('od:preview:capabilities-applied', { enabledCapabilities: [] }),
    });
    controller.handleMessage({
      source: target,
      data: message('od:preview:presentation-state-applied', { revision: 2 }),
    });
    expect(onPresentationStateApplied).not.toHaveBeenCalled();
    controller.handleMessage({
      source: target,
      data: message('od:preview:presentation-state-applied', { revision: 1 }),
    });
    expect(onPresentationStateApplied).toHaveBeenCalledOnce();
  });
});
