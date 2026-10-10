import { describe, expect, it } from 'vitest';
import { DeployError } from '../src/deploy.js';
import { classifyDeployFailure } from '../src/deploy/failure-detail.js';

const classify = (error: unknown) =>
  classifyDeployFailure('provider', error, error instanceof DeployError);

describe('classifyDeployFailure', () => {
  it('keeps a coded DeployError as coded without claiming the daemon status is upstream', () => {
    expect(classify(new DeployError('Missing refs', 400, undefined, 'MISSING_REFERENCES')))
      .toEqual({ stage: 'provider', reason: 'coded' });
  });

  it('separates a rejected Vercel token from a real permission failure', () => {
    const body = { error: { code: 'forbidden', message: 'Not authorized', invalidToken: true } };
    expect(classify(new DeployError("You don't have permission to create a project.", 403, body, 'PROVIDER_FORBIDDEN')))
      .toEqual({ stage: 'provider', reason: 'provider_token_invalid', upstreamStatus: 403, upstreamCode: 'forbidden' });
    const permission = { error: { code: 'forbidden', message: 'Team permission required' } };
    expect(classify(new DeployError("You don't have permission to create a project.", 403, permission, 'PROVIDER_FORBIDDEN')))
      .toEqual({ stage: 'provider', reason: 'coded', upstreamCode: 'forbidden' });
  });

  it('reports a provider rejection with its status and provider code', () => {
    expect(classify(new DeployError('Too many requests.', 429, { error: { code: 'too_many_requests' } })))
      .toEqual({ stage: 'provider', reason: 'provider_rejected', upstreamStatus: 429, upstreamCode: 'too_many_requests' });
    expect(classify(new DeployError('Invalid request headers', 400, { success: false, errors: [{ code: 6003 }] })))
      .toEqual({ stage: 'provider', reason: 'provider_rejected', upstreamStatus: 400, upstreamCode: '6003' });
  });

  it('recognises an unreachable provider behind a fetch failure', () => {
    const fetchFailed = new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });
    expect(classify(fetchFailed)).toEqual({ stage: 'provider', reason: 'provider_unreachable' });
    expect(classify(Object.assign(new Error('aborted'), { name: 'TimeoutError' })))
      .toEqual({ stage: 'provider', reason: 'provider_unreachable' });
  });

  it('separates local file errors from everything else', () => {
    const enoent = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT', syscall: 'open' });
    expect(classifyDeployFailure('file_plan', enoent, false)).toEqual({ stage: 'file_plan', reason: 'local_file' });
    expect(classify(new Error('unexpected'))).toEqual({ stage: 'provider', reason: 'internal' });
    expect(classify(undefined)).toEqual({ stage: 'provider', reason: 'internal' });
  });
});
