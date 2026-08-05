import { describe, expect, it } from 'vitest';
import {
  bearerTokenFromAuthorizationHeader,
  requestProjectOverride,
  requestRunOverride,
  toolTokenValidationStatus,
} from '../../src/runtimes/tool-authorization.js';

describe('tool authorization helpers', () => {
  it('extracts bearer tokens without changing their payload', () => {
    expect(bearerTokenFromAuthorizationHeader('  bearer   token with spaces  ')).toBe('token with spaces');
    expect(bearerTokenFromAuthorizationHeader('Bearer token')).toBe('token');
    expect(bearerTokenFromAuthorizationHeader('Basic token')).toBeUndefined();
    expect(bearerTokenFromAuthorizationHeader('Bearer')).toBeUndefined();
    expect(bearerTokenFromAuthorizationHeader(null)).toBeUndefined();
  });

  it('classifies token validation failures at the HTTP boundary', () => {
    expect(toolTokenValidationStatus('TOOL_ENDPOINT_DENIED')).toBe(403);
    expect(toolTokenValidationStatus('TOOL_OPERATION_DENIED')).toBe(403);
    expect(toolTokenValidationStatus('TOOL_TOKEN_INVALID')).toBe(401);
    expect(toolTokenValidationStatus(undefined)).toBe(401);
  });

  it('detects non-empty project and run scope overrides', () => {
    expect(requestProjectOverride('other-project', 'project')).toBe(true);
    expect(requestProjectOverride('project', 'project')).toBe(false);
    expect(requestProjectOverride('', 'project')).toBe(false);
    expect(requestProjectOverride(42, 'project')).toBe(false);
    expect(requestRunOverride('other-run', 'run')).toBe(true);
    expect(requestRunOverride('run', 'run')).toBe(false);
    expect(requestRunOverride('', 'run')).toBe(false);
    expect(requestRunOverride({}, 'run')).toBe(false);
  });
});
