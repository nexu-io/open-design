import { describe, expect, it } from 'vitest';
import { runMediaWait, type MediaWaitCliDeps } from '../src/media/wait-cli.js';

function makeDeps(overrides: Partial<MediaWaitCliDeps> = {}): MediaWaitCliDeps {
  return {
    resolveDaemonUrl: async () => 'http://127.0.0.1:7456/',
    pollUntilDoneOrBudget: async () => undefined,
    writeStderr: () => undefined,
    printHelp: () => undefined,
    exit: (code) => { throw new Error(`exit ${code}`); },
    ...overrides,
  };
}

describe('media wait CLI', () => {
  it('resolves flags and delegates the long-poll operation', async () => {
    let resolvedFlags;
    let pollInput;
    await runMediaWait(['task-123', '--since', '7', '--daemon-url', 'http://example.test/'], makeDeps({
      resolveDaemonUrl: async (flags) => {
        resolvedFlags = flags;
        return 'http://example.test/';
      },
      pollUntilDoneOrBudget: async (daemonUrl, taskId, since, options) => {
        pollInput = { daemonUrl, taskId, since, options };
      },
    }));

    expect(resolvedFlags).toEqual({ since: '7', 'daemon-url': 'http://example.test/' });
    expect(pollInput).toEqual({
      daemonUrl: 'http://example.test/',
      taskId: 'task-123',
      since: 7,
      options: { totalBudgetMs: 120_000 },
    });
  });

  it('defaults an absent since cursor to zero', async () => {
    let since = -1;
    await runMediaWait(['task-123'], makeDeps({
      pollUntilDoneOrBudget: async (_daemonUrl, _taskId, cursor) => { since = cursor; },
    }));

    expect(since).toBe(0);
  });

  it('rejects missing task ids and invalid flags before polling', async () => {
    const errors: string[] = [];
    await expect(runMediaWait([], makeDeps({
      writeStderr: (text) => errors.push(text),
    }))).rejects.toThrow('exit 2');
    expect(errors[0]).toContain('usage: od media wait');

    await expect(runMediaWait(['task-123', '--typo'], makeDeps({
      writeStderr: (text) => errors.push(text),
    }))).rejects.toThrow('exit 2');
    expect(errors[1]).toContain('unknown flag: --typo');
  });
});
