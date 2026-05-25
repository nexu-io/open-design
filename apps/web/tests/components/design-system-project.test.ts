import { describe, expect, it } from 'vitest';
import type { DesignSystemSummary, Project } from '../../src/types';

import {
  isDesignSystemProject,
  isPublishedDesignSystemProject,
} from '../../src/components/design-system-project';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'StackMe',
    updatedAt: 1,
    designSystemId: null,
    ...overrides,
  } as Project;
}

function system(overrides: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id: 'user:stackme',
    title: 'StackMe',
    category: 'Custom',
    summary: '',
    swatches: [],
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    ...overrides,
  };
}

describe('isDesignSystemProject', () => {
  it('matches projects imported from a design system', () => {
    expect(isDesignSystemProject(project({ metadata: { kind: 'other', importedFrom: 'design-system' } }))).toBe(true);
    expect(isDesignSystemProject(project({ metadata: { kind: 'prototype' } }))).toBe(false);
    expect(isDesignSystemProject(project())).toBe(false);
  });
});

describe('isPublishedDesignSystemProject', () => {
  const dsProject = project({
    metadata: { kind: 'other', importedFrom: 'design-system' },
    designSystemId: 'user:stackme',
  });

  it('is true when the backing design system is published, even if the run failed', () => {
    expect(isPublishedDesignSystemProject(dsProject, [system({ status: 'published' })])).toBe(true);
  });

  it('is false while the design system is still a draft', () => {
    expect(isPublishedDesignSystemProject(dsProject, [system({ status: 'draft' })])).toBe(false);
  });

  it('is false for non-design-system projects and when the system is missing', () => {
    expect(
      isPublishedDesignSystemProject(project({ metadata: { kind: 'prototype' } }), [
        system({ status: 'published' }),
      ]),
    ).toBe(false);
    expect(isPublishedDesignSystemProject(dsProject, [])).toBe(false);
  });
});
