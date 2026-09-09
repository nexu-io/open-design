import { describe, expect, it, vi } from 'vitest';

import {
  classifyBedrockCliFailure,
  extractConverseText,
  isSsoTokenExpiredError,
  testBedrockProfileConnection,
  type CliRunResult,
  type CliRunner,
} from '../../src/integrations/bedrock-aws-cli.js';

const ok = (stdout = '', stderr = ''): CliRunResult => ({
  code: 0,
  signal: null,
  stdout,
  stderr,
  timedOut: false,
});
const fail = (stderr: string, code = 255): CliRunResult => ({
  code,
  signal: null,
  stdout: '',
  stderr,
  timedOut: false,
});

const IDENTITY = JSON.stringify({
  UserId: 'AROA:antoine',
  Account: '123456789012',
  Arn: 'arn:aws:sts::123456789012:assumed-role/AWSAdministratorAccess/antoine',
});
const CONVERSE = JSON.stringify({
  output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
  stopReason: 'end_turn',
});

function scriptedRunner(steps: Array<(args: string[]) => CliRunResult>): { run: CliRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: CliRunner = vi.fn(async (_bin, args) => {
    calls.push(args);
    const step = steps.shift();
    if (!step) throw new Error(`unexpected aws call: ${args.join(' ')}`);
    return step(args);
  });
  return { run, calls };
}

const baseInput = {
  profile: 'sandbox',
  region: 'eu-west-1',
  model: 'anthropic.claude-sonnet-5',
  baseUrl: 'https://bedrock-runtime.eu-west-1.amazonaws.com',
  timeoutMs: 60_000,
};

describe('testBedrockProfileConnection', () => {
  it('resolves the profile with sts, then runs the converse smoke on the regional inference id', async () => {
    const { run, calls } = scriptedRunner([
      () => ok(IDENTITY),
      () => ok(CONVERSE),
    ]);

    const result = await testBedrockProfileConnection(baseInput, {
      resolveAwsCli: () => '/usr/local/bin/aws',
      runCli: run,
    });

    expect(result).toMatchObject({
      ok: true,
      kind: 'success',
      model: 'anthropic.claude-sonnet-5',
      resolvedModel: 'eu.anthropic.claude-sonnet-5',
      sample: 'ok',
    });
    expect(result.detail).toContain('arn:aws:sts::123456789012:assumed-role');
    expect(calls[0]).toEqual([
      '--profile', 'sandbox', '--region', 'eu-west-1', 'sts', 'get-caller-identity', '--output', 'json',
    ]);
    expect(calls[1]).toEqual(expect.arrayContaining([
      'bedrock-runtime', 'converse', '--model-id', 'eu.anthropic.claude-sonnet-5', '--output', 'json',
    ]));
    // The regional default endpoint is never forwarded as --endpoint-url.
    expect(calls[1]).not.toContain('--endpoint-url');
  });

  it('opens the browser SSO login when the token expired, then retries and succeeds', async () => {
    const { run, calls } = scriptedRunner([
      () => fail('Error when retrieving token from sso: Token has expired and refresh failed'),
      (args) => {
        expect(args).toEqual(['sso', 'login', '--profile', 'sandbox']);
        return ok();
      },
      () => ok(IDENTITY),
      () => ok(CONVERSE),
    ]);

    const result = await testBedrockProfileConnection(baseInput, {
      resolveAwsCli: () => '/usr/local/bin/aws',
      runCli: run,
    });

    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.slice(0, 2).join(' '))).toEqual([
      '--profile sandbox',
      'sso login',
      '--profile sandbox',
      '--profile sandbox',
    ]);
  });

  it('reports agent_auth_required when the browser login is still pending at the deadline', async () => {
    const { run } = scriptedRunner([
      () => fail('The SSO session associated with this profile has expired or is otherwise invalid.'),
      () => ({ code: null, signal: null, stdout: '', stderr: '', timedOut: true }),
    ]);

    const result = await testBedrockProfileConnection(baseInput, {
      resolveAwsCli: () => '/usr/local/bin/aws',
      runCli: run,
    });

    expect(result).toMatchObject({ ok: false, kind: 'agent_auth_required' });
    expect(result.detail).toContain('still in progress');
  });

  it('reports agent_not_installed when the AWS CLI is missing', async () => {
    const runCli = vi.fn<CliRunner>();
    const result = await testBedrockProfileConnection(baseInput, {
      resolveAwsCli: () => null,
      runCli,
    });
    expect(result).toMatchObject({ ok: false, kind: 'agent_not_installed' });
    expect(runCli).not.toHaveBeenCalled();
  });

  it('classifies an AccessDeniedException on converse as forbidden', async () => {
    const { run } = scriptedRunner([
      () => ok(IDENTITY),
      () => fail(
        'An error occurred (AccessDeniedException) when calling the Converse operation: You don\'t have access to the model with the specified model ID.',
        254,
      ),
    ]);

    const result = await testBedrockProfileConnection(baseInput, {
      resolveAwsCli: () => '/usr/local/bin/aws',
      runCli: run,
    });

    expect(result).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(result.detail).toContain('AccessDeniedException');
  });

  it('forwards a custom endpoint as --endpoint-url', async () => {
    const { run, calls } = scriptedRunner([
      () => ok(IDENTITY),
      () => ok(CONVERSE),
    ]);
    await testBedrockProfileConnection(
      { ...baseInput, baseUrl: 'https://bedrock-runtime.eu-west-1.vpce-0abc.amazonaws.com' },
      { resolveAwsCli: () => '/usr/local/bin/aws', runCli: run },
    );
    expect(calls[1]).toEqual(expect.arrayContaining([
      '--endpoint-url', 'https://bedrock-runtime.eu-west-1.vpce-0abc.amazonaws.com',
    ]));
  });
});

describe('bedrock CLI helpers', () => {
  it('recognizes the SSO expiry wordings of AWS CLI v2', () => {
    expect(isSsoTokenExpiredError('Error loading SSO Token: Token for sandbox does not exist')).toBe(true);
    expect(isSsoTokenExpiredError('Token has expired and refresh failed')).toBe(true);
    expect(isSsoTokenExpiredError('Unable to locate credentials')).toBe(false);
  });

  it('classifies CLI v1 (no bedrock-runtime command) as agent_not_installed', () => {
    expect(
      classifyBedrockCliFailure("aws: error: argument command: Invalid choice, valid choices are: ..."),
    ).toMatchObject({ kind: 'agent_not_installed' });
  });

  it('classifies throttling and unknown models', () => {
    expect(classifyBedrockCliFailure('An error occurred (ThrottlingException) ...').kind).toBe('rate_limited');
    expect(
      classifyBedrockCliFailure('An error occurred (ResourceNotFoundException) when calling the Converse operation: Could not resolve the foundation model').kind,
    ).toBe('not_found_model');
  });

  it('extracts the assistant text from a Converse response', () => {
    expect(extractConverseText(JSON.parse(CONVERSE))).toBe('ok');
    expect(extractConverseText({})).toBe('');
  });
});
