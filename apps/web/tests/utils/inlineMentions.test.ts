import { describe, expect, it } from 'vitest';

import { buildInlineMentionParts, type InlineMentionEntity } from '../../src/utils/inlineMentions';

describe('buildInlineMentionParts', () => {
  it('skips entity matching when plain text has no mention marker', () => {
    const entities: InlineMentionEntity[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `file-${index}`,
      kind: 'file',
      label: `file-${index}.html`,
      token: `@file-${index}.html`,
    }));

    expect(buildInlineMentionParts('typing ordinary Chinese text without mentions', entities)).toBeNull();
  });

  it('does not normalize entities on plain text drafts', () => {
    const entity = {
      id: 'index.html',
      kind: 'file',
      label: 'index.html',
      get token() {
        throw new Error('token should not be read for plain text');
      },
    } as InlineMentionEntity;

    expect(buildInlineMentionParts('plain text only', [entity])).toBeNull();
  });

  it('still highlights known mentions when the draft contains a marker', () => {
    const parts = buildInlineMentionParts('Review @index.html', [
      { id: 'index.html', kind: 'file', label: 'index.html' },
    ]);

    expect(parts).toEqual([
      { kind: 'text', text: 'Review ' },
      {
        kind: 'mention',
        text: '@index.html',
        entity: {
          id: 'index.html',
          kind: 'file',
          label: 'index.html',
          token: '@index.html',
        },
      },
    ]);
  });
});
