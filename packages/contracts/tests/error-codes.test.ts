import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES, type ApiErrorCode } from '../src/errors';

describe('shared API error codes', () => {
  it('exposes every public workspace project-creation failure code', () => {
    expect(API_ERROR_CODES).toEqual(expect.arrayContaining([
      'WORKSPACE_CONTEXT_INCOMPLETE',
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      'WORKSPACE_AUTHORITY_UNAVAILABLE',
    ]));
  });

  it('exposes AGENT_RUNTIME_DEF_INVALID for runtime-def validation failures', () => {
    // Chat-run startup emits this code through the shared SSE/status error
    // envelopes when a checked-in runtime def is invalid. Keeping the
    // assertion in the contracts package ensures contract-only refactors
    // cannot drop the literal without this package's own test lane failing.
    expect(API_ERROR_CODES).toContain('AGENT_RUNTIME_DEF_INVALID');
  });

  it('keeps AGENT_RUNTIME_DEF_INVALID assignable to ApiErrorCode', () => {
    const code: ApiErrorCode = 'AGENT_RUNTIME_DEF_INVALID';
    expect(code).toBe('AGENT_RUNTIME_DEF_INVALID');
  });

  it('exposes every deploy-provider error emitted across the web/daemon contract', () => {
    const deployProviderCodes = [
      'NOT_HTML',
      'MISSING_REFERENCES',
      'PROVIDER_FORBIDDEN',
      'VERCEL_TOKEN_REQUIRED',
      'VERCEL_DEPLOY_FAILED',
      'VERCEL_BAD_RESPONSE',
      'CF_TOKEN_REQUIRED',
      'CF_ACCOUNT_ID_REQUIRED',
      'CF_PROJECT_NAME_UNRESOLVED',
      'CF_ZONE_REQUIRED',
      'CF_ZONE_INVALID',
      'CF_ZONE_MISMATCH',
      'CF_ZONE_INACTIVE',
      'CF_ZONE_PARTIAL',
      'CF_SUBDOMAIN_INVALID',
      'CF_DOMAIN_ALREADY_BOUND',
      'CF_DNS_RECORD_CONFLICT',
      'CF_DNS_RECORD_MISSING',
      'CF_UNKNOWN_ASSET_HASH',
      'CF_ASSET_TOO_LARGE',
      'CF_BAD_RESPONSE',
    ] satisfies ApiErrorCode[];

    expect(API_ERROR_CODES).toEqual(expect.arrayContaining(deployProviderCodes));
  });
});
