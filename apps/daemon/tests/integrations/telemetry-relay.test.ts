import { describe, expect, it } from 'vitest';

import {
  normalizeOpenDesignTelemetryRelayUrl,
  OPEN_DESIGN_TELEMETRY_RELAY_URLS,
} from '../../src/integrations/telemetry-relay.js';

describe('Open Design telemetry relay URLs', () => {
  it('keeps production on telemetry.open-design.ai', () => {
    expect(OPEN_DESIGN_TELEMETRY_RELAY_URLS.prod).toBe(
      'https://telemetry.open-design.ai/api/langfuse',
    );
    expect(normalizeOpenDesignTelemetryRelayUrl(
      'https://telemetry.open-design.ai/api/langfuse//',
    )).toBe(OPEN_DESIGN_TELEMETRY_RELAY_URLS.prod);
  });

  it('moves legacy self-host test URLs to telemetry-test.open-design.ai', () => {
    expect(normalizeOpenDesignTelemetryRelayUrl(
      'https://telemetry-selfhost.open-design.ai/api/langfuse/',
    )).toBe(OPEN_DESIGN_TELEMETRY_RELAY_URLS.test);
  });

  it('leaves custom relay URLs unchanged', () => {
    expect(normalizeOpenDesignTelemetryRelayUrl(
      'https://telemetry.example.test/api/langfuse/',
    )).toBe('https://telemetry.example.test/api/langfuse');
  });
});
