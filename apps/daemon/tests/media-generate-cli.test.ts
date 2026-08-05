import { describe, expect, it } from 'vitest';
import { runMediaGenerate, type MediaGenerateCliDeps } from '../src/media/generate-cli.js';

function makeDeps(overrides: Partial<MediaGenerateCliDeps> = {}): MediaGenerateCliDeps {
  return {
    resolveDaemonUrl: async () => 'http://127.0.0.1:7456/',
    env: {},
    fetch: async () => new Response(JSON.stringify({ taskId: 'task-1', status: 'queued' }), { status: 202 }),
    surfaceFetchError: () => undefined,
    pollUntilDoneOrBudget: async () => undefined,
    writeStderr: () => undefined,
    printHelp: () => undefined,
    exit: (code) => { throw new Error(`exit ${code}`); },
    ...overrides,
  };
}

describe('media generate CLI', () => {
  it('posts a project generation request and delegates the queued task', async () => {
    let requestUrl = '';
    let requestBody: Record<string, unknown> | undefined;
    let pollInput;
    const stderr: string[] = [];
    await runMediaGenerate([
      '--project', 'project/one', '--surface', 'audio', '--model', 'suno-v5',
      '--prompt', 'ambient', '--duration', '12', '--audio-kind', 'music', '--loop',
    ], makeDeps({
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ taskId: 'task-1', status: 'accepted' }), { status: 202 });
      },
      pollUntilDoneOrBudget: async (daemonUrl, taskId, since, options) => {
        pollInput = { daemonUrl, taskId, since, options };
      },
      writeStderr: (text) => stderr.push(text),
    }));

    expect(requestUrl).toBe('http://127.0.0.1:7456/api/projects/project%2Fone/media/generate');
    expect(requestBody).toMatchObject({
      surface: 'audio', model: 'suno-v5', prompt: 'ambient', duration: 12, audioKind: 'music', loop: true,
    });
    expect(pollInput).toEqual({
      daemonUrl: 'http://127.0.0.1:7456/', taskId: 'task-1', since: 0, options: { stillRunningExitCode: 0 },
    });
    expect(stderr).toContain('task task-1 queued (accepted)\n');
  });

  it('uses the tool endpoint and authorization token when injected', async () => {
    let requestUrl = '';
    let authorization = '';
    await runMediaGenerate(['--surface', 'image', '--model', 'gpt-image-2'], makeDeps({
      env: { OD_TOOL_TOKEN: 'tool-token' },
      fetch: async (input, init) => {
        requestUrl = String(input);
        authorization = String(new Headers(init?.headers).get('authorization'));
        return new Response(JSON.stringify({ taskId: 'task-2' }), { status: 202 });
      },
    }));

    expect(requestUrl).toBe('http://127.0.0.1:7456/api/tools/media/generate');
    expect(authorization).toBe('Bearer tool-token');
  });

  it('rejects missing project/token and invalid generation flags before fetching', async () => {
    let fetchCalls = 0;
    const errors: string[] = [];
    await expect(runMediaGenerate(['--surface', 'image', '--model', 'm'], makeDeps({
      fetch: async () => { fetchCalls++; return new Response(); },
      writeStderr: (text) => errors.push(text),
    }))).rejects.toThrow('exit 2');
    expect(errors[0]).toContain('project id required');
    expect(fetchCalls).toBe(0);

    await expect(runMediaGenerate(['--project', 'p1', '--surface', 'image', '--model', 'm', '--typo'], makeDeps({
      writeStderr: (text) => errors.push(text),
    }))).rejects.toThrow('exit 2');
    expect(errors[1]).toContain('unknown flag: --typo');
  });
});
