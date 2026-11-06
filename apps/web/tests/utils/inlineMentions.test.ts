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

  it('reuses the normalized mention index across draft updates', () => {
    let tokenReads = 0;
    const entities: InlineMentionEntity[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `file-${index}`,
      kind: 'file',
      label: `file-${index}.html`,
      get token() {
        tokenReads += 1;
        return `@file-${index}.html`;
      },
    }));

    expect(buildInlineMentionParts('@missing-one', entities)).toEqual([
      {
        kind: 'mention',
        text: '@missing-one',
        entity: {
          id: 'unknown:@missing-one',
          kind: 'unknown',
          label: 'missing-one',
          token: '@missing-one',
          title: '@missing-one',
        },
      },
    ]);
    expect(buildInlineMentionParts('@missing-two', entities)).toEqual([
      {
        kind: 'mention',
        text: '@missing-two',
        entity: {
          id: 'unknown:@missing-two',
          kind: 'unknown',
          label: 'missing-two',
          token: '@missing-two',
          title: '@missing-two',
        },
      },
    ]);
    expect(tokenReads).toBe(entities.length);
  });

  it('preserves longest known mentions that contain spaces', () => {
    const parts = buildInlineMentionParts('Open @docs/read me.md now', [
      { id: 'docs/read me.md', kind: 'file', label: 'docs/read me.md' },
    ]);

    expect(parts).toEqual([
      { kind: 'text', text: 'Open ' },
      {
        kind: 'mention',
        text: '@docs/read me.md',
        entity: {
          id: 'docs/read me.md',
          kind: 'file',
          label: 'docs/read me.md',
          token: '@docs/read me.md',
        },
      },
      { kind: 'text', text: ' now' },
    ]);
  });
});
