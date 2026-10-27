import { describe, expect, it } from 'vitest';
import { classifyVelaCommandFailure } from '../src/collab/public-file-failure.js';

// Vela CLI output contract (vela-cli 0.0.33 – 0.1.3): a failed command exits 1
// and prints `Error: <err>` on stderr; API rejections read
// `API request failed with status <N>[: <code>]`.
function rejected(stderr: string): Error {
  return Object.assign(new Error('Command failed'), { code: 1, stderr });
}

describe('classifyVelaCommandFailure', () => {
  it.each([
    ['daemon timeout', Object.assign(new Error('vela command timed out after 600000ms'), { code: 'ETIMEDOUT' }), { reason: 'timeout' }],
    ['daemon abort', Object.assign(new Error('vela command aborted'), { code: 'ABORT_ERR' }), { reason: 'aborted' }],
    ['missing binary', new Error('vela binary not found; install vela or configure VELA_BIN'), { reason: 'cli_missing' }],
    ['API rejection with code', rejected('Error: API request failed with status 401: unauthorized\n'), { reason: 'upstream_http', upstreamStatus: 401, upstreamCode: 'unauthorized' }],
    ['API rejection without code', rejected('Error: API request failed with status 500\n'), { reason: 'upstream_http', upstreamStatus: 500 }],
    ['object store transport', rejected('Error: upload blob to object store: Put "https://r2": EOF\n'), { reason: 'object_store' }],
    ['not signed in', rejected('Error: saved profile is missing control key; run `vela login`\n'), { reason: 'not_signed_in' }],
    ['network', rejected('Error: Post "https://api": dial tcp: lookup api: no such host\n'), { reason: 'network' }],
    ['anything else', rejected('Error: something new\n'), { reason: 'unknown' }],
    ['non-error value', 'boom', { reason: 'unknown' }],
  ])('%s', (_name, error, expected) => {
    expect(classifyVelaCommandFailure('push', error)).toEqual({ stage: 'push', ...expected });
  });

  it('drops an upstream code that is not token-shaped', () => {
    expect(classifyVelaCommandFailure('snapshot', rejected(
      'Error: API request failed with status 400: {"weird":"body"}\n',
    ))).toEqual({ stage: 'snapshot', reason: 'upstream_http', upstreamStatus: 400 });
  });
});
