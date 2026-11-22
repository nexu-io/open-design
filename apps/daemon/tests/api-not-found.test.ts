import { describe, expect, it } from 'vitest';

import { unmatchedApiPathShape } from '../src/http/api-not-found.js';

describe('unmatched API path shape', () => {
  const namespaces = new Set(['projects', 'runs']);

  it('keeps only a declared top-level namespace', () => {
    expect(unmatchedApiPathShape('/projects/client-alpha/legacy', namespaces)).toBe('/api/:unmatched/projects');
    expect(unmatchedApiPathShape('/private-crm/export', namespaces)).toBe('/api/:unmatched');
    expect(unmatchedApiPathShape('/', namespaces)).toBe('/api/:unmatched');
  });

  it('drops deeper segments even when they collide with declared route words', () => {
    expect(unmatchedApiPathShape('/projects/client-alpha/runs/draft', namespaces)).toBe('/api/:unmatched/projects');
  });
});
