export const OPEN_DESIGN_TELEMETRY_RELAY_URLS = {
  test: 'https://telemetry-test.open-design.ai/api/langfuse',
  prod: 'https://telemetry.open-design.ai/api/langfuse',
} as const;

const LEGACY_TEST_RELAY_ORIGIN = 'https://telemetry-selfhost.open-design.ai';
const TEST_RELAY_ORIGIN = 'https://telemetry-test.open-design.ai';

/**
 * Keep legacy test configurations working while moving the test Worker to its
 * environment-owned hostname. Production and custom relay URLs are unchanged.
 */
export function normalizeOpenDesignTelemetryRelayUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized.startsWith(`${LEGACY_TEST_RELAY_ORIGIN}/`) ||
    normalized === LEGACY_TEST_RELAY_ORIGIN
    ? `${TEST_RELAY_ORIGIN}${normalized.slice(LEGACY_TEST_RELAY_ORIGIN.length)}`
    : normalized;
}
