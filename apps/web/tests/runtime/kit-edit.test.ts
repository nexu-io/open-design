import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

const registryMocks = vi.hoisted(() => ({
  deleteProjectFile: vi.fn(),
  fetchProjectFileText: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => registryMocks);

import {
  readDesignMd,
  replaceDesignMdColorAtIndex,
  updateBrandColor,
} from '../../src/runtime/kit-edit';

function brandJson(role: string, seed: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'Acme',
    tagline: '',
    description: '',
    sourceUrl: 'https://acme.test',
    logo: { primary: null, alternates: [], notes: '' },
    colors: [{ role, name: role, hex: '#FFA500', usage: '' }],
    typography: {
      display: { family: 'Inter', fallbacks: [], weights: [400, 700] },
      body: { family: 'Inter', fallbacks: [], weights: [400, 700] },
    },
    voice: {
      adjectives: [],
      tone: '',
      messagingPillars: [],
      vocabulary: { use: [], avoid: [] },
    },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
    seed,
  });
}

function lastWrittenBrand(): Record<string, unknown> {
  const body = registryMocks.writeProjectTextFile.mock.calls.at(-1)?.[2];
  if (typeof body !== 'string') throw new Error('brand.json was not written');
  return JSON.parse(body) as Record<string, unknown>;
}

describe('kit-edit brand color persistence', () => {
  beforeEach(() => {
    registryMocks.deleteProjectFile.mockReset();
    registryMocks.fetchProjectFileText.mockReset();
    registryMocks.writeProjectTextFile.mockReset();
    registryMocks.writeProjectTextFile.mockResolvedValue({ name: 'brand.json' });
  });

  it('keeps accent palette edits and seed primary tokens in sync', async () => {
    const workspaceContext = {
      workspaceId: 'workspace-a',
    } as WorkspaceCollabContext;
    registryMocks.fetchProjectFileText.mockResolvedValue(
      brandJson('accent', { colorPrimary: '#FFA500', colorInfo: '#FFA500' }),
    );

    await expect(
      updateBrandColor('project-1', 0, '#63fe13', workspaceContext),
    ).resolves.toBe(true);

    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith(
      'project-1',
      'brand.json',
      { cache: 'no-store', workspaceContext },
    );
    const written = lastWrittenBrand();
    expect(written.colors).toEqual([
      expect.objectContaining({ role: 'accent', hex: '#63FE13' }),
    ]);
    expect(written.seed).toEqual(expect.objectContaining({
      colorPrimary: '#63FE13',
      colorInfo: '#63FE13',
    }));
  });

  it('keeps secondary, foreground, and background seed fields aligned with edited roles', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(
      JSON.stringify({
        ...JSON.parse(brandJson('accent-secondary', { colorLink: '#0099FF' })),
        colors: [
          { role: 'accent-secondary', name: 'secondary', hex: '#0099FF', usage: '' },
          { role: 'foreground', name: 'foreground', hex: '#111111', usage: '' },
          { role: 'background', name: 'background', hex: '#FFFFFF', usage: '' },
        ],
      }),
    );

    await expect(updateBrandColor('project-1', 0, '#0e9f77')).resolves.toBe(true);
    let written = lastWrittenBrand();
    expect(written.seed).toEqual(expect.objectContaining({
      colorLink: '#0E9F77',
      colorSuccess: '#0E9F77',
    }));

    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify(written));
    await expect(updateBrandColor('project-1', 1, '#04070d')).resolves.toBe(true);
    written = lastWrittenBrand();
    expect(written.seed).toEqual(expect.objectContaining({ colorTextBase: '#04070D' }));

    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify(written));
    await expect(updateBrandColor('project-1', 2, '#f6fff0')).resolves.toBe(true);
    written = lastWrittenBrand();
    expect(written.seed).toEqual(expect.objectContaining({ colorBgBase: '#F6FFF0' }));
  });
});

describe('kit-edit design-system reads', () => {
  beforeEach(() => {
    registryMocks.fetchProjectFileText.mockReset();
  });

  it('reads DESIGN.md under the pinned project identity', async () => {
    const workspaceContext = {
      workspaceId: 'workspace-a',
    } as WorkspaceCollabContext;
    registryMocks.fetchProjectFileText.mockResolvedValue('# Acme');

    await expect(readDesignMd('project-1', workspaceContext)).resolves.toBe('# Acme');

    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith(
      'project-1',
      'DESIGN.md',
      { cache: 'no-store', workspaceContext },
    );
  });
});

describe('replaceDesignMdColorAtIndex', () => {
  it('replaces the selected unique DESIGN.md color token', () => {
    const body = [
      '# Acme',
      '',
      '## Color Palette',
      '',
      '| Role | Name | Hex | Usage |',
      '| --- | --- | --- | --- |',
      '| background | Background | `#FFFFFF` | page |',
      '| accent | Accent | `#315EFB` | links |',
      '| accent-copy | Accent Copy | `#315EFB` | duplicate |',
    ].join('\n');

    const next = replaceDesignMdColorAtIndex(body, 1, '#4E6EF2');

    expect(next).not.toBeNull();
    expect(next).toContain('`#4E6EF2` | links');
    expect(next).toContain('`#315EFB` | duplicate');
  });

  it('returns null for invalid input or a missing color index', () => {
    expect(replaceDesignMdColorAtIndex('# Acme', 0, '#123456')).toBeNull();
    expect(replaceDesignMdColorAtIndex('# Acme\n#FFFFFF', 0, 'blue')).toBeNull();
  });
});
