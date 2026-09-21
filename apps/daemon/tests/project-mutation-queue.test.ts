/**
 * The per-project mutation queue: one project's mutations run in order and
 * never overlap, a failure does not block the next one, and other projects
 * are not held up.
 */
import { describe, expect, it } from 'vitest';

import { withProjectMutation } from '../src/project-mutation-queue.js';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('withProjectMutation', () => {
  it('runs one project\'s mutations strictly one after another', async () => {
    const log: string[] = [];
    const first = withProjectMutation('p1', async () => {
      log.push('first:start');
      await tick();
      await tick();
      log.push('first:end');
      return 1;
    });
    const second = withProjectMutation('p1', async () => {
      log.push('second:start');
      await tick();
      log.push('second:end');
      return 2;
    });
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('lets a failed mutation reject its caller without blocking the next one', async () => {
    const failing = withProjectMutation('p2', async () => {
      await tick();
      throw new Error('disk full');
    });
    const next = withProjectMutation('p2', async () => 'ran');
    await expect(failing).rejects.toThrow('disk full');
    expect(await next).toBe('ran');
  });

  it('does not hold one project behind another', async () => {
    const log: string[] = [];
    const slow = withProjectMutation('p3', async () => {
      await tick();
      await tick();
      await tick();
      log.push('slow');
    });
    const other = withProjectMutation('p4', async () => {
      log.push('other');
    });
    await Promise.all([slow, other]);
    expect(log).toEqual(['other', 'slow']);
  });
});
