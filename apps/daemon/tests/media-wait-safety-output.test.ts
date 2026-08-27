import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// What the agent actually reads.
//
// A refusal is only useful to a user if it survives the last hop: `od media
// wait` is the command the agent runs, and its stdout is the agent's entire
// view of the outcome. If the verdict is flattened here, no prompt wording and
// no UI can recover it -- the agent would be choosing its reply from a fact it
// was never told.

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let server: http.Server | undefined;
let baseUrl = '';
let snapshot: Record<string, unknown> = {};

beforeEach(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if ((req.url ?? '').includes('/media/tasks/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(snapshot));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function runMediaWait(): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const args = [
    '--import',
    'tsx',
    cliEntry,
    'media',
    'wait',
    'task-refused',
    '--daemon-url',
    baseUrl,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: daemonRoot,
      env: { ...process.env, OD_PROJECT_ID: 'project-1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/** The last JSON object the command prints is its machine-readable result. */
function parseResult(stdout: string): Record<string, any> {
  const line = stdout
    .trim()
    .split('\n')
    .filter((entry) => entry.trim().startsWith('{'))
    .at(-1);
  if (!line) throw new Error(`no JSON result on stdout: ${JSON.stringify(stdout)}`);
  return JSON.parse(line);
}

describe('od media wait surfaces a content-safety refusal', () => {
	it.each([
		['sensitive_words_detected', 'sensitive_words_detected'],
		['content_policy_violation', 'Content policy rejected the prompt'],
		[
			'InputTextSensitiveContentDetected',
			'The request failed because the input text may contain sensitive information',
		],
	])('relays provider error %s without remapping it', async (code, message) => {
		snapshot = {
			taskId: 'task-refused',
			status: 'failed',
			progress: [],
			nextSince: 0,
			error: { status: 400, code, message },
		};

		const payload = parseResult((await runMediaWait()).stdout);

		expect(payload.error.code).toBe(code);
		expect(payload.error.message).toBe(message);
		expect(payload.error.retryable).toBeUndefined();
	});

  it('relays the code, message, subject and retryability verbatim', async () => {
    snapshot = {
      taskId: 'task-refused',
      status: 'failed',
      progress: [],
      nextSince: 0,
      error: {
        message: 'the request was rejected by a content safety policy',
        status: 400,
        code: 'safety_rejection',
        subject: 'prompt',
        retryable: false,
      },
    };

    const result = await runMediaWait();
    const payload = parseResult(result.stdout);

    expect(payload.status).toBe('failed');
    expect(payload.error.code).toBe('safety_rejection');
    expect(payload.error.subject).toBe('prompt');
    expect(payload.error.retryable).toBe(false);
    expect(payload.error.message).toContain('content safety policy');
    // A refusal must not read as success to a caller checking the exit code.
    expect(result.code).not.toBe(0);
  });

  // Every Atlas refusal. The absent field is the signal to name both the
  // prompt and the reference images rather than blame one.
  it('omits the subject when the producer proved none', async () => {
    snapshot = {
      taskId: 'task-refused',
      status: 'failed',
      progress: [],
      nextSince: 0,
      error: {
        message: 'the request was rejected by a content safety policy',
        status: 400,
        code: 'safety_rejection',
        retryable: false,
      },
    };

    const payload = parseResult((await runMediaWait()).stdout);

    expect(payload.error.code).toBe('safety_rejection');
    expect(payload.error.subject).toBeUndefined();
  });

  // A field this binary does not understand must still reach a scripted
  // caller, or every server-side addition would need a CLI release.
  it('passes through fields it does not itself interpret', async () => {
    snapshot = {
      taskId: 'task-refused',
      status: 'failed',
      progress: [],
      nextSince: 0,
      error: {
        message: 'refused',
        status: 400,
        code: 'safety_rejection',
        policyFamily: 'a field added after this CLI shipped',
      },
    };

    const payload = parseResult((await runMediaWait()).stdout);

    expect(payload.error.policyFamily).toBe('a field added after this CLI shipped');
  });

  // The negative half: an ordinary failure must not arrive wearing a refusal's
  // clothes.
  it('keeps an ordinary failure generic', async () => {
    snapshot = {
      taskId: 'task-refused',
      status: 'failed',
      progress: [],
      nextSince: 0,
      error: {
        message: 'the image provider request failed',
        status: 502,
        code: 'provider_error',
      },
    };

    const payload = parseResult((await runMediaWait()).stdout);

    expect(payload.error.code).toBe('provider_error');
    expect(payload.error.subject).toBeUndefined();
    expect(payload.error.retryable).toBeUndefined();
  });
});
