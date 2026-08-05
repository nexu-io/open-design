import { describe, expect, it, vi } from 'vitest';
import { runPollUntilDoneOrBudget, type MediaPollCliDeps } from '../src/media/poll-cli.js';

function deps(response: Response): MediaPollCliDeps & { fetch: ReturnType<typeof vi.fn> } {
  return {
    fetch: vi.fn(async () => response),
    surfaceFetchError: vi.fn(),
    writeStdout: vi.fn(),
    writeStderr: vi.fn(),
    exit: vi.fn((code: number): never => { throw new Error(`exit:${code}`); }),
    now: vi.fn(() => 1_000),
  };
}

describe('media poll CLI boundary', () => {
  it('renders progress and exits successfully for a completed task', async () => {
    const injected = deps(new Response(JSON.stringify({
      status: 'done',
      nextSince: 4,
      progress: ['queued', 'rendering'],
      file: { name: 'hero.png', size: 12, warnings: [] },
    }), { status: 200 }));

    await expect(runPollUntilDoneOrBudget('http://daemon/', 'task-1', 0, {}, injected))
      .rejects.toThrow('exit:0');

    expect(injected.fetch).toHaveBeenCalledWith(
      'http://daemon/api/media/tasks/task-1/wait',
      expect.objectContaining({ body: JSON.stringify({ since: 0, timeoutMs: 4000 }) }),
    );
    expect(injected.writeStdout).toHaveBeenCalledWith('# queued\n');
    expect(injected.writeStdout).toHaveBeenCalledWith(JSON.stringify({
      file: { name: 'hero.png', size: 12, warnings: [] },
    }) + '\n');
  });

  it('maps a failed task to its structured status and exit code', async () => {
    const injected = deps(new Response(JSON.stringify({
      status: 'failed',
      error: { message: 'provider unavailable', status: 7 },
    }), { status: 200 }));

    await expect(runPollUntilDoneOrBudget('http://daemon', 'task-2', 3, {}, injected))
      .rejects.toThrow('exit:7');

    expect(injected.writeStderr).toHaveBeenCalledWith('task failed: provider unavailable\n');
    expect(injected.writeStdout).toHaveBeenCalledWith(expect.stringContaining('"status":"failed"'));
  });
});
