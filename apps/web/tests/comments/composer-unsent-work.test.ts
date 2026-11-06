import { describe, expect, it } from 'vitest';

import { composerHasUnsentWork } from '../../src/comments/composer-unsent-work';

const empty = { draft: '', queuedNoteCount: 0, freshImageCount: 0, savedNote: null };

describe('composerHasUnsentWork', () => {
  it('holds nothing for an empty or whitespace-only new comment', () => {
    expect(composerHasUnsentWork(empty)).toBe(false);
    expect(composerHasUnsentWork({ ...empty, draft: '  \n ' })).toBe(false);
  });

  it('counts draft text, queued notes, and freshly attached images', () => {
    expect(composerHasUnsentWork({ ...empty, draft: 'Tighten this' })).toBe(true);
    expect(composerHasUnsentWork({ ...empty, queuedNoteCount: 1 })).toBe(true);
    expect(composerHasUnsentWork({ ...empty, freshImageCount: 1 })).toBe(true);
  });

  it('treats an opened saved comment as unsent only when the draft differs from its note', () => {
    const opened = { ...empty, savedNote: 'Saved note' };
    expect(composerHasUnsentWork({ ...opened, draft: 'Saved note' })).toBe(false);
    expect(composerHasUnsentWork({ ...opened, draft: ' Saved note \n' })).toBe(false);
    expect(composerHasUnsentWork({ ...opened, draft: 'Saved note, edited' })).toBe(true);
    expect(composerHasUnsentWork({ ...opened, draft: '' })).toBe(true);
    expect(composerHasUnsentWork({ ...opened, draft: 'Saved note', freshImageCount: 1 })).toBe(true);
  });
});
