import { describe, expect, it } from 'vitest';
import {
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
  buildPreviewObservabilityBridge,
  parsePreviewObservabilityMessage,
} from '../../src/runtime/preview-observability.js';

describe('preview observability contract', () => {
  it('builds one bounded bridge for runtime, resource, console, and white-screen failures', () => {
    const bridge = buildPreviewObservabilityBridge();

    expect(bridge).toContain(PREVIEW_OBSERVABILITY_BRIDGE_MARKER);
    expect(bridge).toContain(PREVIEW_OBSERVABILITY_MESSAGE_TYPE);
    expect(bridge).toContain("send('runtime_error'");
    expect(bridge).toContain("send('unhandled_rejection'");
    expect(bridge).toContain("send('console_error'");
    expect(bridge).toContain("send('resource_error'");
    expect(bridge).toContain("send('white_screen'");
    expect(bridge).toContain('stack: text(value.stack, 2000)');
    expect(bridge).toContain('detail.source_url = text(event && event.filename, 1000)');
    expect(bridge).toContain('var MAX_EVENTS = 12');
    expect(bridge).not.toContain('JSON.stringify(arguments)');
  });

  it('accepts only the versioned preview observability wire shape', () => {
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      message: 'boom',
    })).toMatchObject({ event: 'runtime_error', message: 'boom' });

    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 2,
      event: 'runtime_error',
    })).toBeNull();
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'arbitrary_event',
    })).toBeNull();
  });

  it('normalizes untrusted fields before returning a bounded payload', () => {
    const parsed = parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      message: `  ${'x'.repeat(600)}  `,
      stack: 'line one\nline two',
      line: 12.6,
      viewport_width: 20_000_000,
      ignored: 'not part of the protocol',
    });

    expect(parsed).toMatchObject({
      event: 'runtime_error',
      message: 'x'.repeat(500),
      stack: 'line one line two',
      line: 13,
      viewport_width: 10_000_000,
    });
    expect(parsed).not.toHaveProperty('ignored');
  });

  it('rejects known fields with invalid types', () => {
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      message: { nested: 'boom' },
    })).toBeNull();
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      line: '12',
    })).toBeNull();
  });
});
