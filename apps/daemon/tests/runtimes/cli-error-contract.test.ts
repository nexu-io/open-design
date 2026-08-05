import { describe, expect, it } from 'vitest';
import {
  classifyStructuredHttpFailure,
  normalizeRecoverableErrorCode,
} from '../../src/runtimes/cli-error-contract.js';

function response(body: unknown, status = 500, text = '') {
  return {
    status,
    json: async () => body,
    text: async () => text,
  };
}

describe('CLI structured HTTP error contract', () => {
  it('preserves recoverable nested errors and their structured data', async () => {
    await expect(classifyStructuredHttpFailure(response({
      error: { code: 'project-not-found', message: 'missing', details: { id: 'p1' }, retryable: false },
    }, 404))).resolves.toEqual({
      code: 'project-not-found',
      message: 'missing',
      data: { details: { id: 'p1' }, retryable: false },
    });
  });

  it('normalizes legacy flat errors while retaining the caller fallback code', async () => {
    await expect(classifyStructuredHttpFailure(response({ error: 'source project not found' }, 404), 'project-not-found'))
      .resolves.toEqual({ code: 'project-not-found', message: 'source project not found' });
  });

  it('uses response text when JSON is unavailable and no recoverable code exists', async () => {
    await expect(classifyStructuredHttpFailure({
      status: 502,
      json: async () => { throw new Error('not json'); },
      text: async () => 'upstream unavailable',
    })).resolves.toEqual({ code: 'daemon-not-running', message: 'HTTP 502: upstream unavailable' });
  });

  it('keeps special desktop authorization normalization in the shared contract', () => {
    expect(normalizeRecoverableErrorCode('DESKTOP_AUTH_PENDING', '')).toBe('desktop-auth-pending');
    expect(normalizeRecoverableErrorCode('FORBIDDEN', 'desktop import token rejected')).toBe('desktop-import-token-rejected');
  });
});
