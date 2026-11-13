import { afterEach, describe, expect, it, vi } from 'vitest';

const { execAgentFileMock } = vi.hoisted(() => ({ execAgentFileMock: vi.fn() }));

vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: execAgentFileMock,
}));

import {
  fetchAntigravityModels,
  parseAntigravityModelsJson,
} from '../../src/runtimes/defs/antigravity.js';

describe('parseAntigravityModelsJson', () => {
  // `agy --output-format json models` returns { command: { data: { models:
  // [{ id, label }] } }, response: "<tab-separated human text>" }. Only the
  // `command.data.models` path is parsed; `id` here is agy's own internal
  // slug and must NOT survive into the result -- `label` becomes both the
  // returned `id` and `label`, matching this file's fallbackModels
  // convention (settings.json + the log-grep watcher both key on the label).
  it('parses the command.data.models envelope, keying every entry by label', () => {
    const stdout = JSON.stringify({
      command: {
        data: {
          models: [
            { id: 'gemini-3-pro-high', label: 'Gemini 3.1 Pro (High)' },
            { id: 'gemini-3-5-flash-low', label: 'Gemini 3.5 Flash (Low)' },
          ],
        },
      },
      response: 'id\tlabel\ngemini-3-pro-high\tGemini 3.1 Pro (High)',
    });

    const result = parseAntigravityModelsJson(stdout);

    expect(result).toEqual([
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro (High)' },
      { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash (Low)' },
    ]);
    // agy's internal slug must not leak into the picker -- it breaks the
    // `--model` flow, which only understands the display label.
    expect(JSON.stringify(result)).not.toContain('gemini-3-pro-high');
  });

  it('returns null on malformed JSON instead of throwing', () => {
    expect(parseAntigravityModelsJson('not json')).toBeNull();
    expect(parseAntigravityModelsJson('')).toBeNull();
  });

  it('returns null when command / data / models is missing at any depth', () => {
    expect(parseAntigravityModelsJson(JSON.stringify({}))).toBeNull();
    expect(parseAntigravityModelsJson(JSON.stringify({ command: {} }))).toBeNull();
    expect(
      parseAntigravityModelsJson(JSON.stringify({ command: { data: {} } })),
    ).toBeNull();
    expect(
      parseAntigravityModelsJson(
        JSON.stringify({ command: { data: { models: 'not-an-array' } } }),
      ),
    ).toBeNull();
  });

  it('returns null when models parses but is empty', () => {
    expect(
      parseAntigravityModelsJson(
        JSON.stringify({ command: { data: { models: [] } } }),
      ),
    ).toBeNull();
  });

  it('skips entries with a missing or non-string label instead of throwing', () => {
    const stdout = JSON.stringify({
      command: {
        data: {
          models: [
            { id: 'no-label' },
            { id: 'bad-label', label: 42 },
            { id: 'ok', label: 'Gemini 3.1 Pro (High)' },
          ],
        },
      },
    });

    expect(parseAntigravityModelsJson(stdout)).toEqual([
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro (High)' },
    ]);
  });
});

describe('fetchAntigravityModels', () => {
  afterEach(() => {
    execAgentFileMock.mockReset();
  });

  it('requests --output-format json models with a 30s timeout and the caller-provided env', async () => {
    execAgentFileMock.mockImplementation(() => {
      const promise = Promise.resolve({
        stdout: JSON.stringify({ command: { data: { models: [] } } }),
        stderr: '',
      });
      // @ts-expect-error test double; production shape is PromiseWithChild
      promise.child = { stdin: { end: vi.fn() } };
      return promise;
    });

    await fetchAntigravityModels('agy', { FOO: 'bar' });

    expect(execAgentFileMock).toHaveBeenCalledWith(
      'agy',
      ['--output-format', 'json', 'models'],
      { env: { FOO: 'bar' }, timeout: 30_000 },
    );
  });

  // The actual bug: agy's `models` subcommand does not answer until stdin
  // reaches EOF. `execAgentFile` sets `killSignal: 'SIGKILL'`, so its
  // `timeout` does eventually kill a held-open child and settle (reject)
  // the promise -- this is a bounded ~30s delay, not an unbounded hang --
  // but the killed child's stdout is discarded, so the caller gets nothing
  // for the wait and falls back to the static list every single probe.
  // This test's mock simplifies that to "never resolves until closed" (no
  // 30s timeout simulation) purely so a regression fails fast rather than
  // slowly: a regression that moves the `.end()` call to after the `await`
  // -- or drops it entirely -- makes the mock (and, in production, the
  // 30s-then-fallback path) never deliver real data; the race below times
  // out and the test fails, instead of silently passing on an unrelated
  // assertion.
  it('closes stdin before awaiting the result, so the probe gets real data instead of burning the full timeout', async () => {
    let stdinClosed = false;
    const end = vi.fn(() => {
      stdinClosed = true;
    });
    execAgentFileMock.mockImplementation(() => {
      let resolveFn: (value: { stdout: string; stderr: string }) => void;
      const promise = new Promise<{ stdout: string; stderr: string }>((resolve) => {
        resolveFn = resolve;
      });
      const poll = () => {
        if (stdinClosed) {
          resolveFn({
            stdout: JSON.stringify({
              command: {
                data: { models: [{ id: 'x', label: 'Gemini 3.1 Pro (High)' }] },
              },
            }),
            stderr: '',
          });
        } else {
          setImmediate(poll);
        }
      };
      setImmediate(poll);
      // @ts-expect-error test double; production shape is PromiseWithChild
      promise.child = { stdin: { end } };
      return promise;
    });

    const result = await Promise.race([
      fetchAntigravityModels('agy', {}),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(
            'DEADLOCK: fetchAntigravityModels never settled -- stdin was '
            + 'not closed before awaiting the result, exactly like the real '
            + 'agy hang this function exists to avoid',
          )),
          2_000,
        )),
    ]);

    expect(end).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro (High)' },
    ]);
  });

  it('tolerates a resolved child with no stdin handle', async () => {
    execAgentFileMock.mockImplementation(() => {
      const promise = Promise.resolve({
        stdout: JSON.stringify({ command: { data: { models: [] } } }),
        stderr: '',
      });
      // @ts-expect-error test double; no `.child` at all this time
      promise.child = undefined;
      return promise;
    });

    await expect(fetchAntigravityModels('agy', {})).resolves.toBeNull();
  });

  // detection.ts's `fetchModels()` dispatcher is the one that catches a
  // thrown error and falls back to the static `fallbackModels` list -- this
  // function itself must propagate, not swallow.
  it('propagates a rejection (e.g. execFile timeout) instead of swallowing it', async () => {
    execAgentFileMock.mockImplementation(() => {
      const promise = Promise.reject(new Error('agy timed out'));
      // @ts-expect-error test double
      promise.child = { stdin: { end: vi.fn() } };
      return promise;
    });

    await expect(fetchAntigravityModels('agy', {})).rejects.toThrow('agy timed out');
  });
});
