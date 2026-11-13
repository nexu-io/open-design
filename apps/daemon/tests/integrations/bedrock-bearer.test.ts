import { describe, expect, it } from 'vitest';

import {
  BEDROCK_BEARER_MAX_SECONDS,
  BedrockProfileBearerError,
  mintBedrockBearerToken,
  resolveBedrockBearerForProfile,
} from '../../src/integrations/bedrock-bearer.js';
import type { CliRunner } from '../../src/integrations/bedrock-aws-cli.js';

const CREDS = {
  accessKeyId: 'ASIAEXAMPLEKEYID',
  secretAccessKey: 'example-secret-access-key',
  sessionToken: 'example-session-token',
};
const NOW = () => new Date('2026-09-11T10:00:00.000Z');

function decode(token: string): { host: string; query: URLSearchParams } {
  expect(token.startsWith('bedrock-api-key-')).toBe(true);
  const presigned = Buffer.from(token.slice('bedrock-api-key-'.length), 'base64').toString('utf8');
  const [host, query] = presigned.split('/?');
  return { host: host!, query: new URLSearchParams(query) };
}

describe('mintBedrockBearerToken', () => {
  it('produces a presigned CallWithBearerToken request in the bedrock-api-key format', () => {
    const { host, query } = decode(mintBedrockBearerToken(CREDS, 'eu-west-1', { now: NOW, expiresSeconds: 900 }));
    expect(host).toBe('bedrock.amazonaws.com');
    expect(query.get('Action')).toBe('CallWithBearerToken');
    expect(query.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(query.get('X-Amz-Credential')).toBe('ASIAEXAMPLEKEYID/20260911/eu-west-1/bedrock/aws4_request');
    expect(query.get('X-Amz-Date')).toBe('20260911T100000Z');
    expect(query.get('X-Amz-Expires')).toBe('900');
    expect(query.get('X-Amz-SignedHeaders')).toBe('host');
    expect(query.get('X-Amz-Security-Token')).toBe('example-session-token');
    expect(query.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(query.get('Version')).toBe('1');
  });

  it('omits the security token for static credentials and caps the lifetime at 12 hours', () => {
    const { query } = decode(
      mintBedrockBearerToken(
        { accessKeyId: CREDS.accessKeyId, secretAccessKey: CREDS.secretAccessKey },
        'us-east-1',
        { now: NOW, expiresSeconds: 999_999 },
      ),
    );
    expect(query.has('X-Amz-Security-Token')).toBe(false);
    expect(query.get('X-Amz-Expires')).toBe(String(BEDROCK_BEARER_MAX_SECONDS));
  });

  it('is deterministic for the same inputs and changes with the region', () => {
    const a = mintBedrockBearerToken(CREDS, 'us-east-1', { now: NOW });
    const b = mintBedrockBearerToken(CREDS, 'us-east-1', { now: NOW });
    const c = mintBedrockBearerToken(CREDS, 'eu-west-1', { now: NOW });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('resolveBedrockBearerForProfile', () => {
  const cli = (stdout: string, stderr = '', code = 0): CliRunner => {
    const calls: string[][] = [];
    const runner: CliRunner = async (_bin, args) => {
      calls.push(args);
      return { code, signal: null, stdout, stderr, timedOut: false };
    };
    return Object.assign(runner, { calls });
  };

  it('exports the profile credentials through the AWS CLI and mints a bearer', async () => {
    const runner = cli(JSON.stringify({ Version: 1, AccessKeyId: CREDS.accessKeyId, SecretAccessKey: CREDS.secretAccessKey, SessionToken: CREDS.sessionToken }));
    const token = await resolveBedrockBearerForProfile('sandbox', 'eu-west-1', {
      resolveAwsCli: () => '/usr/local/bin/aws',
      runCli: runner,
      now: NOW,
    });
    expect((runner as unknown as { calls: string[][] }).calls).toEqual([
      ['configure', 'export-credentials', '--profile', 'sandbox', '--format', 'process'],
    ]);
    expect(token).toBe(mintBedrockBearerToken(CREDS, 'eu-west-1', { now: NOW }));
  });

  it('reports an expired SSO session without launching a login', async () => {
    const runner = cli('', 'Error loading SSO Token: Token for https://example.awsapps.com/start has expired', 255);
    await expect(
      resolveBedrockBearerForProfile('sandbox', 'eu-west-1', { resolveAwsCli: () => '/usr/local/bin/aws', runCli: runner }),
    ).rejects.toMatchObject({ name: 'BedrockProfileBearerError', reason: 'sso_expired' });
    expect((runner as unknown as { calls: string[][] }).calls.some((args) => args[0] === 'sso')).toBe(false);
  });

  it('fails clearly when the AWS CLI is missing or returns no credentials', async () => {
    await expect(
      resolveBedrockBearerForProfile('sandbox', 'eu-west-1', { resolveAwsCli: () => null }),
    ).rejects.toBeInstanceOf(BedrockProfileBearerError);
    await expect(
      resolveBedrockBearerForProfile('sandbox', 'eu-west-1', { resolveAwsCli: () => '/usr/local/bin/aws', runCli: cli('{}') }),
    ).rejects.toMatchObject({ reason: 'credentials_unavailable' });
  });

  it('reports a CLI that could not start or did not answer in time, instead of blaming the credentials', async () => {
    const spawnFailed: CliRunner = async () => ({
      code: null, signal: null, stdout: '', stderr: '', timedOut: false, spawnError: new Error('spawn aws EACCES'),
    });
    await expect(
      resolveBedrockBearerForProfile('sandbox', 'eu-west-1', { resolveAwsCli: () => '/usr/local/bin/aws', runCli: spawnFailed }),
    ).rejects.toMatchObject({ reason: 'credentials_unavailable', message: expect.stringContaining('EACCES') });
    const timedOut: CliRunner = async () => ({ code: null, signal: 'SIGKILL', stdout: '', stderr: '', timedOut: true });
    await expect(
      resolveBedrockBearerForProfile('sandbox', 'eu-west-1', { resolveAwsCli: () => '/usr/local/bin/aws', runCli: timedOut }),
    ).rejects.toMatchObject({ reason: 'credentials_unavailable', message: expect.stringContaining('in time') });
  });
});
