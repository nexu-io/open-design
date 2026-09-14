import { describe, expect, it } from 'vitest';

import { projectReadOnlyClaim } from '../../src/components/project-readonly-claim';

const t = (key: string, vars?: Record<string, string>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

describe('projectReadOnlyClaim', () => {
  it('names the owner once the share is confirmed', () => {
    expect(projectReadOnlyClaim({
      isSharedNonOwner: true,
      ownerDisplayName: '麻薯',
      t,
    })).toBe('workspace.readonlyNoticeBy:{"owner":"麻薯"}');
  });

  it('falls back to the name-less notice when the share is confirmed but the owner is not', () => {
    expect(projectReadOnlyClaim({
      isSharedNonOwner: true,
      ownerDisplayName: null,
      t,
    })).toBe('workspace.readonlyNotice');
  });

  // The whole point. A read-only surface may be read-only for reasons that are
  // not "someone shared this with you" — most commonly, ownership has simply
  // not resolved yet. Saying nothing is correct there; saying the shared-project
  // copy is a false claim about the viewer's own project.
  it('claims nothing while the share is unproven', () => {
    expect(projectReadOnlyClaim({
      isSharedNonOwner: false,
      ownerDisplayName: '麻薯',
      t,
    })).toBeUndefined();
  });
});
