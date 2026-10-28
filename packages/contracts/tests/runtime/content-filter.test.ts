import { describe, expect, it } from 'vitest';

import { isContentFilterError } from '../../src/runtime/content-filter.js';

describe('provider content refusal diagnostics', () => {
  it.each([
    '{"error":{"name":"ContentFilterError","data":{"message":"blocked"}}}',
    "The response was blocked by the provider's content filter",
    'The request was rejected by the content safety policy',
    '{"error":{"code":"content_policy_violation"}}',
    '{"code":"safety_rejection"}',
  ])('recognizes positive refusal evidence: %s', (diagnostic) => {
    expect(isContentFilterError(diagnostic)).toBe(true);
  });

  it.each([
    null,
    undefined,
    '',
    '503 service unavailable: content filter service unavailable',
    'content safety policy check could not be reached',
    'Windows security policy blocked program startup',
    'The proxy rejected the connection',
    'No output produced',
    'Request failed with status 403',
  ])('does not infer a content refusal from %s', (diagnostic) => {
    expect(isContentFilterError(diagnostic)).toBe(false);
  });
});
