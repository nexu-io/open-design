import { describe, expect, it } from 'vitest';

import { workspaceProjectGroupCountProperties } from '../src/routes/project/analytics.js';

describe('workspace project group analytics', () => {
  it('updates total count only from unfiltered total-capable views', () => {
    expect(workspaceProjectGroupCountProperties({
      view: 'all',
      owner: 'all',
      visibility: 'all',
      projectCount: 12,
    })).toEqual({ project_count: 12 });

    expect(workspaceProjectGroupCountProperties({
      view: 'recent',
      owner: 'all',
      visibility: 'all',
      projectCount: 9,
    })).toEqual({ project_count: 9 });

    expect(workspaceProjectGroupCountProperties({
      view: 'all',
      owner: 'mine',
      visibility: 'all',
      projectCount: 3,
    })).toBeNull();
  });

  it('keeps draft and team counts as separate group properties', () => {
    expect(workspaceProjectGroupCountProperties({
      view: 'drafts',
      owner: 'mine',
      visibility: 'personal',
      projectCount: 4,
    })).toEqual({ draft_project_count: 4 });
    expect(workspaceProjectGroupCountProperties({
      view: 'team',
      owner: 'all',
      visibility: 'team',
      projectCount: 8,
    })).toEqual({ team_project_count: 8 });
  });
});
