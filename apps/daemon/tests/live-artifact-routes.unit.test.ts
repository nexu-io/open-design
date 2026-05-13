import { describe, expect, it, vi } from 'vitest';
import { finalizeLiveArtifactRun } from '../src/live-artifact-routes.js';

describe('finalizeLiveArtifactRun', () => {
  it('finishes an open run as soon as the artifact is registered', () => {
    const finish = vi.fn();
    const get = vi.fn().mockReturnValue({ status: 'running' });
    const design = {
      runs: {
        get,
        finish,
        isTerminal: (status: string) => ['succeeded', 'failed', 'canceled'].includes(status),
      },
    } as never;

    expect(finalizeLiveArtifactRun(design, 'run-123')).toBe(true);
    expect(get).toHaveBeenCalledWith('run-123');
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }), 'succeeded', 0, null);
  });

  it('does nothing when run is already terminal or missing', () => {
    const finish = vi.fn();
    const get = vi.fn().mockReturnValueOnce({ status: 'failed' }).mockReturnValueOnce(null);
    const design = {
      runs: {
        get,
        finish,
        isTerminal: (status: string) => ['succeeded', 'failed', 'canceled'].includes(status),
      },
    } as never;

    expect(finalizeLiveArtifactRun(design, 'run-terminal')).toBe(false);
    expect(finalizeLiveArtifactRun(design, 'run-missing')).toBe(false);
    expect(finish).not.toHaveBeenCalled();
  });
});
