import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const exec = promisify(execFile);
const rejectNetwork = 'data:text/javascript,' + encodeURIComponent(
  'globalThis.fetch = () => { process.stderr.write("Unexpected media network request\\n"); process.exit(97); };',
);
let dataDir: string;

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'od-media-cli-help-'));
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function runMedia(args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    const result = await exec(process.execPath, [
      '--import', 'tsx', '--import', rejectNetwork, cliEntry, 'media', ...args,
    ], {
      cwd: daemonRoot,
      timeout: 10_000,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        OD_DATA_DIR: dataDir,
        OD_DAEMON_URL: 'http://offline.invalid',
        OD_PROJECT_ID: '',
        OD_TOOL_TOKEN: '',
        OD_WORKSPACE_ID: '',
        OD_WORKSPACE_MEMBER_ID: '',
        OPEN_DESIGN_VELA_TELEMETRY: 'off',
        ...env,
      },
    });
    return { code: 0, ...result };
  } catch (error) {
    if (!error || typeof error !== 'object' || !('stdout' in error) || !('stderr' in error)) throw error;
    return {
      code: 'code' in error ? error.code : undefined,
      stdout: String(error.stdout),
      stderr: String(error.stderr),
    };
  }
}

function expectHelp(result: Awaited<ReturnType<typeof runMedia>>) {
  expect(result, result.stderr).toMatchObject({ code: 0, stderr: '' });
  expect(result.stdout).toContain('media generate --surface <image|video|audio> --model <id>');
  expect(result.stdout).toContain('--model    Model id from /api/media/models');
}

describe('od media help', () => {
  it.each(['--help', '--h'])('prints generate %s before requiring project or generation parameters', async flag => {
    expectHelp(await runMedia(['generate', flag]));
  });

  it('prints generate help in the injected project context used by coding agents', async () => {
    expectHelp(await runMedia(['generate', '--help'], { OD_PROJECT_ID: 'project-media' }));
  });

  it('does not dispatch a fully specified generation when help is requested', async () => {
    expectHelp(await runMedia([
      'generate', '--surface', 'image', '--model', 'vela/gpt-image-2',
      '--prompt', 'A geometric poster', '--help',
    ], { OD_PROJECT_ID: 'project-media' }));
  });

  it.each([['--help'], ['help'], ['scaffold', '--help']])('preserves existing help entry %j', async (...args) => {
    expectHelp(await runMedia(args));
  });

  it.each([
    { args: ['generate'], env: {}, message: 'project id required.' },
    { args: ['generate'], env: { OD_PROJECT_ID: 'project-media' }, message: '--surface must be one of: image | video | audio' },
    { args: ['generate', '--surface', 'image'], env: { OD_PROJECT_ID: 'project-media' }, message: '--model required' },
  ])('still rejects a real generation missing required inputs: $message', async ({ args, env, message }) => {
    const result = await runMedia(args, env);
    expect(result).toMatchObject({ code: 2, stdout: '' });
    expect(result.stderr).toContain(message);
    expect(result.stderr).not.toContain('Unexpected media network request');
  });
});
