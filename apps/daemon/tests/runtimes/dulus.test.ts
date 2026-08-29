import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dulusAgentDef, parseDulusVersion } from '../../src/runtimes/defs/dulus.js';
import { DEFAULT_MODEL_OPTION } from '../../src/runtimes/defs/shared.js';
import { detectAgent } from '../../src/runtimes/detection.js';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';

// Frames captured from a real `dulus 3.12.1` run, not authored here:
//   dulus --print --accept-all --output json -- "di hola"
const REAL_SUCCESS_STDOUT = [
  '{"type": "step_start", "sessionID": "c3ccdd26"}',
  '{"type": "text", "part": {"text": "Hola! Soy la respuesta del modelo. "}}',
  '{"type": "step_finish", "part": {"tokens": {"input": 3472, "output": 9, "cache": {"read": 0, "write": 0}}, "cost": 0.0}}',
];

// Same command with no provider credentials configured.
const REAL_AUTH_FAILURE_STDOUT = [
  '{"type": "step_start", "sessionID": "c0372473"}',
  '{"type": "error", "message": "[gemini-web] Auth file not found: /home/u/.dulus/gemini_web.json. Run /harvest-gemini."}',
];

// Everything Dulus writes to the human channel in protocol mode. Present in
// both fixtures because the whole point of `--output json` is that this noise
// never reaches the assistant stream.
const REAL_STDERR_NOISE = [
  '',
  '\u001b[33m🦅 Dulus — [FREE] Limited features. More: https://dulus.online\u001b[0m',
  '  🦅 Dulus    ●  ',
  '  ·  ⏱️ Breaking the sound barrier...',
];

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { force: true, recursive: true });
  }
});

interface FakeRun {
  events: { type: string; [key: string]: unknown }[];
  exitCode: number | null;
  argv: string[];
  stdout: string;
}

/**
 * Spawn a stand-in `dulus` through the argv the adapter builds, then feed its
 * real stdout to the real parser.
 *
 * The unit assertions below can only prove what `buildArgs` returns. This
 * crosses the process boundary the daemon actually crosses — argv is handed to
 * a spawned executable, its stdout is read back off a pipe, and the bytes are
 * parsed by `createJsonEventStreamHandler`, the same call the spawn pipeline
 * makes. A frame the parser does not understand shows up as a `raw` event, so
 * `raw` being absent is what proves the dialect matches.
 */
async function runFakeDulus(
  stdoutLines: string[],
  exitCode: number,
  prompt = 'di hola',
): Promise<FakeRun> {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-dulus-fixture-'));
  tempDirs.push(dir);
  const argvLog = path.join(dir, 'argv.json');
  const script = path.join(dir, 'fake-dulus.cjs');
  writeFileSync(
    script,
    `const { writeFileSync } = require('node:fs');\n`
      + `writeFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv.slice(2)));\n`
      + `for (const line of ${JSON.stringify(REAL_STDERR_NOISE)}) process.stderr.write(line + '\\n');\n`
      + `for (const line of ${JSON.stringify(stdoutLines)}) process.stdout.write(line + '\\n');\n`
      + `process.exit(${exitCode});\n`,
    'utf8',
  );

  let bin = script;
  if (process.platform === 'win32') {
    bin = path.join(dir, 'fake-dulus.cmd');
    writeFileSync(bin, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`, 'utf8');
  } else {
    bin = path.join(dir, 'fake-dulus');
    writeFileSync(
      bin,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
      'utf8',
    );
    chmodSync(bin, 0o755);
  }
  const spawnArgs = dulusAgentDef.buildArgs(prompt, [], [], {});

  const events: { type: string; [key: string]: unknown }[] = [];
  const handler = createJsonEventStreamHandler('opencode', (event) => {
    events.push(event as { type: string });
  });

  let stdout = '';
  const exit = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(bin, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      handler.feed(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
  handler.flush();

  return {
    events,
    exitCode: exit,
    argv: JSON.parse(readFileSync(argvLog, 'utf8')) as string[],
    stdout,
  };
}

describe('dulus buildArgs', () => {
  it('requests protocol output and passes the prompt behind an option terminator', () => {
    const args = dulusAgentDef.buildArgs('di hola', [], [], {});

    expect(args).toEqual([
      '--print',
      '--accept-all',
      '--output',
      'json',
      '--',
      'di hola',
    ]);
  });

  // Dulus parses the prompt as an argparse positional, so a composed prompt
  // that opens with a dash would otherwise be read as an unknown flag.
  it('keeps a dash-leading prompt out of option parsing', () => {
    const prompt = '--- section divider prompt';
    const args = dulusAgentDef.buildArgs(prompt, [], [], {});

    expect(args.indexOf('--')).toBeLessThan(args.indexOf(prompt));
    expect(args.at(-1)).toBe(prompt);
  });

  it('appends --model before the terminator for a non-default model', () => {
    const args = dulusAgentDef.buildArgs('prompt', [], [], { model: 'gpt-5.2' });

    expect(args).toEqual([
      '--print',
      '--accept-all',
      '--output',
      'json',
      '--model',
      'gpt-5.2',
      '--',
      'prompt',
    ]);
  });

  it('omits --model for the default sentinel', () => {
    const args = dulusAgentDef.buildArgs('prompt', [], [], {
      model: DEFAULT_MODEL_OPTION.id,
    });

    expect(args).not.toContain('--model');
  });
});

describe('dulus definition metadata', () => {
  it('declares the runtime identity', () => {
    expect(dulusAgentDef.id).toBe('dulus');
    expect(dulusAgentDef.name).toBe('Dulus');
    expect(dulusAgentDef.bin).toBe('dulus');
  });

  it('consumes the OpenCode event dialect over an argv-delivered prompt', () => {
    expect(dulusAgentDef.streamFormat).toBe('json-event-stream');
    expect(dulusAgentDef.eventParser).toBe('opencode');
    expect(dulusAgentDef.maxPromptArgBytes).toBe(30_000);
  });
});

describe('dulus process boundary', () => {
  it('delivers the built argv intact to the spawned executable', async () => {
    const run = await runFakeDulus(REAL_SUCCESS_STDOUT, 0, 'di hola');

    expect(run.argv).toEqual(dulusAgentDef.buildArgs('di hola', [], [], {}));
    expect(run.argv.at(-1)).toBe('di hola');
  });

  it('surfaces only the assistant reply from a successful run', async () => {
    const run = await runFakeDulus(REAL_SUCCESS_STDOUT, 0);

    expect(run.exitCode).toBe(0);
    expect(run.events.map((event) => event.type)).toEqual([
      'status',
      'text_delta',
      'usage',
    ]);
    expect(
      run.events
        .filter((event) => event.type === 'text_delta')
        .map((event) => event.delta)
        .join(''),
    ).toBe('Hola! Soy la respuesta del modelo. ');
    expect(run.events.find((event) => event.type === 'usage')?.usage).toEqual({
      input_tokens: 3472,
      output_tokens: 9,
      cached_read_tokens: 0,
      cached_write_tokens: 0,
    });
  });

  // The regression that blocked the first attempt at this adapter: the banner
  // reached the assistant stream, and a failed run looked like a success whose
  // answer was Dulus's startup output.
  it('keeps the startup banner out of the assistant stream', async () => {
    const run = await runFakeDulus(REAL_SUCCESS_STDOUT, 0);

    expect(run.stdout).not.toContain('🦅 Dulus');
    const assistantText = run.events
      .filter((event) => event.type === 'text_delta')
      .map((event) => event.delta)
      .join('');
    expect(assistantText).not.toContain('Dulus');
    expect(assistantText).not.toContain('[FREE]');
  });

  it('reports an auth failure as an error and never as assistant text', async () => {
    const run = await runFakeDulus(REAL_AUTH_FAILURE_STDOUT, 1);

    expect(run.exitCode).toBe(1);
    expect(run.events.map((event) => event.type)).toEqual(['status', 'error']);
    expect(run.events.find((event) => event.type === 'error')?.message).toContain(
      'Auth file not found',
    );
    expect(run.events.some((event) => event.type === 'text_delta')).toBe(false);
    expect(run.events.some((event) => event.type === 'usage')).toBe(false);
  });

  // An unrecognised frame degrades to `raw`, which the daemon does not render
  // as an assistant message. Absence of `raw` is what proves Dulus's dialect
  // and the `opencode` parser actually agree.
  it('leaves no frame unparsed in either outcome', async () => {
    const success = await runFakeDulus(REAL_SUCCESS_STDOUT, 0);
    const failure = await runFakeDulus(REAL_AUTH_FAILURE_STDOUT, 1);

    expect(success.events.some((event) => event.type === 'raw')).toBe(false);
    expect(failure.events.some((event) => event.type === 'raw')).toBe(false);
  });
});

// `dulus --version` prints exactly `dulus v<semver>` on stdout (its argparse
// handler answers before the REPL banner). A fake bin reproduces that one line
// so the gate is exercised across the real process boundary the detector
// crosses — spawn the executable, read its stdout, apply the version policy.
function writeVersionBin(dir: string, versionLine: string): string {
  const bin = path.join(dir, process.platform === 'win32' ? 'dulus.cmd' : 'dulus');
  if (process.platform === 'win32') {
    writeFileSync(bin, `@echo off\r\necho ${versionLine}\r\n`);
  } else {
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' '${versionLine}'\n`);
    chmodSync(bin, 0o755);
  }
  return bin;
}

describe('parseDulusVersion (fail-closed 3.12.1 floor)', () => {
  it.each([
    // The floor and everything above it normalizes to a bare semver.
    ['dulus v3.12.1', '3.12.1'],
    ['dulus v3.12.2', '3.12.2'],
    ['dulus v3.13.0', '3.13.0'],
    ['dulus v4.0.0', '4.0.0'],
    // Tolerates surrounding text and build metadata.
    ['dulus v3.12.1+build.9', '3.12.1'],
  ])('accepts %s -> %s', (raw, expected) => {
    expect(parseDulusVersion(raw)).toBe(expected);
  });

  it.each([
    // The exact build with the false-success bug, plus everything below it.
    'dulus v3.12.0',
    'dulus v3.11.22',
    'dulus v3.0.0',
    'dulus v2.99.99',
    // A prerelease of the floor precedes the release and is still a pre-fix
    // build, so it is rejected too.
    'dulus v3.12.1-rc.1',
    // Unusable lines fail closed rather than defaulting to available.
    'dulus preview',
    '',
  ])('rejects %s -> null', (raw) => {
    expect(parseDulusVersion(raw)).toBeNull();
  });
});

describe('dulus version gate (detector boundary)', () => {
  const detectTempDirs: string[] = [];
  afterEach(() => {
    while (detectTempDirs.length) {
      const dir = detectTempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    // version line, expected available, expected reported version, warn reason
    ['dulus v3.12.1', true, '3.12.1', undefined],
    ['dulus v3.13.0', true, '3.13.0', undefined],
    // Off the exercised release line but parseable and above the floor: stays
    // available with an untested-version warning, like every other adapter.
    ['dulus v4.5.0', true, '4.5.0', 'untested-version'],
  ] as const)('exposes %s as available', async (versionLine, available, version, reason) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-dulus-gate-'));
    detectTempDirs.push(dir);
    const detected = await detectAgent(dulusAgentDef, {
      DULUS_BIN: writeVersionBin(dir, versionLine),
    });
    expect(detected.available).toBe(available);
    expect(detected.version).toBe(version);
    expect(detected.diagnostics?.[0]?.reason).toBe(reason);
  });

  it.each([
    // 3.12.0 is the whole point: it must be unavailable, not available-with-warning.
    'dulus v3.12.0',
    'dulus v3.11.22',
    'dulus v3.12.1-rc.1',
  ])('marks the pre-fix build %s unavailable', async (versionLine) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-dulus-gate-'));
    detectTempDirs.push(dir);
    const detected = await detectAgent(dulusAgentDef, {
      DULUS_BIN: writeVersionBin(dir, versionLine),
    });
    expect(detected.available).toBe(false);
    expect(detected.diagnostics?.[0]?.reason).toBe('version-probe-failed');
  });
});
