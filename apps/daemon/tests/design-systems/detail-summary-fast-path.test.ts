import { describe, expect, it, vi } from 'vitest';

import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';

describe('design-system detail summary fast path', () => {
  it('reads only the requested bundled summary instead of listing the catalog', async () => {
    const listDesignSystems = vi.fn(async () => {
      throw new Error('catalog scan must not run for a bundled detail');
    });
    const readDesignSystemSummary = vi.fn(async (_root: string, id: string) => ({
      id,
      title: 'Airtable',
      category: 'Product',
      summary: 'Bundled preset.',
      swatches: [],
      surface: 'web' as const,
      body: '# Airtable',
      source: 'user' as const,
      status: 'draft' as const,
      isEditable: true,
    }));
    const services = createDesignSystemServerServices({
      roots: {
        SKILL_ROOTS: [],
        DESIGN_TEMPLATE_ROOTS: [],
        ALL_SKILL_LIKE_ROOTS: [],
      },
      paths: {
        PROJECTS_DIR: '/tmp/projects',
        DESIGN_SYSTEMS_DIR: '/tmp/design-systems',
        USER_DESIGN_SYSTEMS_DIR: '/tmp/user-design-systems',
      },
      skills: {
        listSkills: async () => [],
        findSkillById: () => undefined,
      },
      designSystems: {
        listDesignSystems,
        readDesignSystemSummary,
      } as unknown as Parameters<typeof createDesignSystemServerServices>[0]['designSystems'],
      projects: {} as Parameters<typeof createDesignSystemServerServices>[0]['projects'],
    });

    await expect(services.readAvailableDesignSystemSummary('airtable')).resolves.toMatchObject({
      id: 'airtable',
      body: '# Airtable',
      source: 'built-in',
      status: 'published',
      isEditable: false,
    });
    expect(readDesignSystemSummary).toHaveBeenCalledWith('/tmp/design-systems', 'airtable');
    expect(listDesignSystems).not.toHaveBeenCalled();
  });
});
