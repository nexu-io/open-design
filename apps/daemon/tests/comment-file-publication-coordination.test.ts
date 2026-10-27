import { expect, it, vi } from 'vitest';
import { createCommentFilePublicationCoordination } from '../src/collab/comment-file-publication-coordination.js';
const principal = { teamId: 'w', memberId: 'creator', role: 'member' as const, lifecycleState: 'active' as const };
it('preserves pending root work until the last physical run ends, without UI subscription', async () => {
  let active = 2;
  const wake = vi.fn();
  const publish = vi.fn(async () => 'receipt');
  const coordination = createCommentFilePublicationCoordination({ isBusy: () => active > 0, wake });
  await expect(coordination.run('p', principal, publish)).rejects.toThrow('COMMENT_FILE_PROJECT_BUSY');
  expect(publish).not.toHaveBeenCalled();
  active = 1; coordination.settled('p');
  expect(wake).not.toHaveBeenCalled();
  active = 0; coordination.settled('p');
  expect(wake).toHaveBeenCalledExactlyOnceWith('p', principal);
  coordination.settled('p');
  expect(wake).toHaveBeenCalledTimes(1);
  expect(await coordination.run('p', principal, publish)).toBe('receipt');
});
it('does not block an unrelated project and lets failures propagate instead of successful ACK', async () => {
  const coordination = createCommentFilePublicationCoordination({ isBusy: id => id === 'busy', wake: vi.fn() });
  await expect(coordination.run('busy', principal, async () => 'bad')).rejects.toThrow();
  await expect(coordination.run('idle', principal, async () => { throw new Error('unknown receipt'); })).rejects.toThrow('unknown receipt');
});
