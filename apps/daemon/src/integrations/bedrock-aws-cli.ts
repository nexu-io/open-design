// Amazon Bedrock BYOK, AWS-profile mode: the daemon never signs requests
// itself. On the run path OpenCode's `amazon-bedrock` loader resolves the
// named profile through the AWS credential chain; here the connection test
// leans on the AWS CLI v2 the same profile already works with, so an IAM
// Identity Center (SSO) profile can be refreshed through the browser exactly
// the way the user does it in a terminal.
//
// Three steps, each with its own bounded child process:
//   1. `aws sts get-caller-identity` proves the profile resolves. An expired
//      SSO token is the one failure with a recovery we can drive: spawn
//      `aws sso login --profile <p>`, which opens the browser, wait for it
//      within the test budget, then retry.
//   2. `aws bedrock-runtime converse` runs the same one-line smoke prompt the
//      HTTP providers get, against the same inference id the run will use.
//   3. Classify the CLI's stderr into the shared `ConnectionTestKind` set.
import { spawn } from 'node:child_process';
import {
  bedrockInferenceModelId,
  type ConnectionTestKind,
  type ConnectionTestResponse,
} from '@open-design/contracts';
import { resolveOnPath } from '../runtimes/executables.js';

export const AWS_CLI_BIN = 'aws';
const IDENTITY_TIMEOUT_MS = 20_000;
const CONVERSE_TIMEOUT_MS = 45_000;
// A browser sign-in needs a human; give it the same order of magnitude an
// interactive login takes. The child is left running if the budget runs out
// so the user can still finish the flow and simply re-run the test.
export const SSO_LOGIN_TIMEOUT_MS = 120_000;
const SMOKE_PROMPT = 'Reply with only: ok';
const SMOKE_MAX_TOKENS = 100;
const STREAM_TAIL_BYTES = 600;

const SSO_EXPIRED_RE =
  /(token has expired|error loading sso token|sso session|expired or is otherwise invalid|run: aws sso login|aws sso login)/i;
const PROFILE_MISSING_RE = /(could not be found|profile .* not found|config profile .* could not be found)/i;
const NO_CREDENTIALS_RE = /(unable to locate credentials|no credentials|credential_process|invalidclienttokenid|unrecognizedclientexception|expiredtoken|invalidsignature|security token)/i;
const CLI_V1_RE = /invalid choice: ?'bedrock-runtime'|argument command: invalid choice/i;

export interface BedrockProfileConnectionInput {
  profile: string;
  region: string;
  model: string;
  /** Runtime endpoint; forwarded as `--endpoint-url` when it is not the regional default. */
  baseUrl: string;
  signal?: AbortSignal | undefined;
  /** Wall-clock budget for the whole test, login included. */
  timeoutMs: number;
}

export interface CliRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: Error;
}

export type CliRunner = (
  bin: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal | undefined; stdio?: 'pipe' | 'ignore' },
) => Promise<CliRunResult>;

export interface BedrockProfileConnectionDeps {
  resolveAwsCli?: () => string | null;
  runCli?: CliRunner;
  now?: () => number;
}

export function runAwsCli(
  bin: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal | undefined; stdio?: 'pipe' | 'ignore' },
): Promise<CliRunResult> {
  return new Promise((resolve) => {
    const stdio = options.stdio ?? 'pipe';
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(bin, args, {
      stdio: stdio === 'pipe' ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      shell: false,
      env: {
        ...process.env,
        // The CLI pages JSON output through `less` on a TTY-less spawn in
        // some configurations; never block on a pager.
        AWS_PAGER: '',
      },
    });
    const finish = (result: CliRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => {
      child.kill('SIGTERM');
      finish({ code: null, signal: 'SIGTERM', stdout, stderr, timedOut: false });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      // Leave `aws sso login` alive on timeout: the browser flow may still
      // complete and the next test run then passes without another prompt.
      if (!(args[0] === 'sso' && args[1] === 'login')) child.kill('SIGTERM');
      finish({ code: null, signal: null, stdout, stderr, timedOut: true });
    }, options.timeoutMs);
    timer.unref?.();
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', (err) => {
      finish({ code: null, signal: null, stdout, stderr, timedOut, spawnError: err });
    });
    child.once('close', (code, signal) => {
      finish({ code, signal, stdout, stderr, timedOut });
    });
  });
}

function tail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > STREAM_TAIL_BYTES
    ? trimmed.slice(trimmed.length - STREAM_TAIL_BYTES)
    : trimmed;
}

export function isSsoTokenExpiredError(stderr: string): boolean {
  return SSO_EXPIRED_RE.test(stderr);
}

export function classifyBedrockCliFailure(stderr: string): {
  kind: ConnectionTestKind;
  detail: string;
} {
  const text = tail(stderr);
  if (CLI_V1_RE.test(text)) {
    return {
      kind: 'agent_not_installed',
      detail:
        'The installed AWS CLI does not know `bedrock-runtime`. AWS CLI v2 is required for the AWS profile mode.',
    };
  }
  if (isSsoTokenExpiredError(text)) {
    return { kind: 'agent_auth_required', detail: text };
  }
  if (PROFILE_MISSING_RE.test(text)) return { kind: 'auth_failed', detail: text };
  if (NO_CREDENTIALS_RE.test(text)) return { kind: 'auth_failed', detail: text };
  if (/accessdeniedexception|not authorized to perform/i.test(text)) {
    return { kind: 'forbidden', detail: text };
  }
  if (/resourcenotfoundexception|could not resolve the foundation model|model identifier is invalid|on-demand throughput isn.t supported/i.test(text)) {
    return { kind: 'not_found_model', detail: text };
  }
  if (/throttlingexception|too many requests/i.test(text)) {
    return { kind: 'rate_limited', detail: text };
  }
  if (/serviceunavailable|internalserver|modelnotready|could not connect to the endpoint/i.test(text)) {
    return { kind: 'upstream_unavailable', detail: text };
  }
  return { kind: 'unknown', detail: text };
}

export function extractConverseText(data: unknown): string {
  const output = (data as { output?: { message?: { content?: unknown } } }).output;
  const content = output?.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (block && typeof (block as { text?: unknown }).text === 'string'
      ? (block as { text: string }).text
      : ''))
    .join('');
}

function identityArn(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as { Arn?: unknown };
    return typeof parsed.Arn === 'string' ? parsed.Arn : null;
  } catch {
    return null;
  }
}

export async function testBedrockProfileConnection(
  input: BedrockProfileConnectionInput,
  deps: BedrockProfileConnectionDeps = {},
): Promise<ConnectionTestResponse> {
  const now = deps.now ?? Date.now;
  const runCli = deps.runCli ?? runAwsCli;
  const start = now();
  const model = input.model.trim();
  const profile = input.profile.trim();
  const elapsed = () => now() - start;
  const remaining = () => Math.max(0, input.timeoutMs - elapsed());
  const fail = (kind: ConnectionTestKind, detail: string): ConnectionTestResponse => ({
    ok: false,
    kind,
    latencyMs: elapsed(),
    model,
    detail,
  });

  const awsBin = (deps.resolveAwsCli ?? (() => resolveOnPath(AWS_CLI_BIN)))();
  if (!awsBin) {
    return fail(
      'agent_not_installed',
      'AWS CLI v2 (`aws`) was not found on PATH. The AWS profile mode needs it to resolve the profile and to sign in through the browser; install it or switch to a Bedrock API key.',
    );
  }

  const identityArgs = ['--profile', profile, '--region', input.region, 'sts', 'get-caller-identity', '--output', 'json'];
  let identity = await runCli(awsBin, identityArgs, {
    timeoutMs: Math.min(IDENTITY_TIMEOUT_MS, remaining()),
    signal: input.signal,
  });
  if (identity.spawnError) {
    return fail('agent_spawn_failed', identity.spawnError.message);
  }
  if (identity.code !== 0 && isSsoTokenExpiredError(identity.stderr)) {
    // Browser sign-in. `aws sso login` blocks until the device flow completes
    // or the user closes the browser tab, so its exit is the signal to retry.
    const loginBudget = Math.min(SSO_LOGIN_TIMEOUT_MS, remaining());
    const login = await runCli(awsBin, ['sso', 'login', '--profile', profile], {
      timeoutMs: loginBudget,
      signal: input.signal,
      stdio: 'ignore',
    });
    if (login.timedOut) {
      return fail(
        'agent_auth_required',
        `Browser sign-in for AWS profile "${profile}" is still in progress. Finish it in the browser, then run the test again.`,
      );
    }
    if (login.code !== 0) {
      return fail(
        'agent_auth_required',
        `\`aws sso login --profile ${profile}\` did not complete (exit ${login.signal ?? login.code}). Sign in from a terminal, then run the test again.`,
      );
    }
    identity = await runCli(awsBin, identityArgs, {
      timeoutMs: Math.min(IDENTITY_TIMEOUT_MS, remaining()),
      signal: input.signal,
    });
  }
  if (identity.timedOut) return fail('timeout', 'aws sts get-caller-identity timed out');
  if (identity.code !== 0) {
    const classified = classifyBedrockCliFailure(identity.stderr);
    return fail(classified.kind, classified.detail || `aws sts get-caller-identity exited with ${identity.code}`);
  }
  const arn = identityArn(identity.stdout);

  const inferenceModelId = bedrockInferenceModelId(model, input.region);
  const defaultEndpoint = `https://bedrock-runtime.${input.region}.amazonaws.com`;
  const endpoint = input.baseUrl.trim().replace(/\/+$/, '');
  const converseArgs = [
    '--profile', profile,
    '--region', input.region,
    ...(endpoint && endpoint !== defaultEndpoint ? ['--endpoint-url', endpoint] : []),
    'bedrock-runtime', 'converse',
    '--model-id', inferenceModelId,
    '--messages', JSON.stringify([{ role: 'user', content: [{ text: SMOKE_PROMPT }] }]),
    '--inference-config', JSON.stringify({ maxTokens: SMOKE_MAX_TOKENS }),
    '--output', 'json',
  ];
  const converse = await runCli(awsBin, converseArgs, {
    timeoutMs: Math.min(CONVERSE_TIMEOUT_MS, remaining()),
    signal: input.signal,
  });
  if (converse.spawnError) return fail('agent_spawn_failed', converse.spawnError.message);
  if (converse.timedOut) return fail('timeout', 'aws bedrock-runtime converse timed out');
  if (converse.code !== 0) {
    const classified = classifyBedrockCliFailure(converse.stderr);
    return fail(classified.kind, classified.detail || `aws bedrock-runtime converse exited with ${converse.code}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(converse.stdout);
  } catch {
    return fail('unknown', `unexpected converse output: ${tail(converse.stdout)}`);
  }
  const sample = extractConverseText(data).trim().slice(0, 120);
  return {
    ok: true,
    kind: 'success',
    latencyMs: elapsed(),
    model,
    ...(inferenceModelId !== model ? { resolvedModel: inferenceModelId } : {}),
    ...(sample ? { sample } : {}),
    ...(arn ? { detail: `AWS identity: ${arn}` } : {}),
  };
}
