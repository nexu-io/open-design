// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

const registryMocks = vi.hoisted(() => ({
  fetchProjectFileText: vi.fn(),
  uploadProjectFile: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => registryMocks);

import {
  useKitModuleUpload,
  type KitModuleUpload,
} from '../../src/runtime/kit-upload';

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: 'team-a',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
}

let latestUpload: KitModuleUpload | null = null;

function Harness({
  workspaceContext,
  onError,
}: {
  workspaceContext: WorkspaceCollabContext;
  onError?: (module: 'logo' | 'image' | 'font', message: string) => void;
}) {
  latestUpload = useKitModuleUpload({
    projectId: 'project-a',
    title: 'Acme',
    workspaceContext,
    onError,
  });
  return null;
}

afterEach(() => {
  cleanup();
  latestUpload = null;
  vi.clearAllMocks();
});

describe('useKitModuleUpload Workspace reads', () => {
  it('reads the existing Team brand under the pinned identity before patching it', async () => {
    const workspaceContext = teamContext();
    const existingBrand = {
      name: 'Acme',
      tagline: 'Never erase this',
      description: 'Existing description',
      sourceUrl: 'https://acme.test',
      logo: { primary: 'logos/old.svg', alternates: [], notes: 'keep' },
      colors: [{ role: 'accent', name: 'Brand', hex: '#123456', usage: 'buttons' }],
      typography: {
        display: { family: 'Inter', fallbacks: [], weights: [400] },
        body: { family: 'Inter', fallbacks: [], weights: [400] },
      },
      voice: {
        adjectives: ['clear'],
        tone: 'direct',
        messagingPillars: ['quality'],
        vocabulary: { use: ['simple'], avoid: ['vague'] },
      },
      imagery: {
        style: 'editorial',
        subjects: ['people'],
        treatment: 'natural',
        avoid: ['stock'],
        samples: [],
      },
      layout: {
        radius: '8px',
        borderWeight: '1px',
        spacing: '8px',
        postureRules: ['calm'],
      },
    };
    registryMocks.uploadProjectFile.mockResolvedValue({
      name: 'logos/new.svg',
      size: 10,
      mtime: 1,
      kind: 'image',
      mime: 'image/svg+xml',
    });
    registryMocks.fetchProjectFileText.mockImplementation(
      async (_projectId: string, name: string, options?: { workspaceContext?: WorkspaceCollabContext }) =>
        name === 'brand.json' && options?.workspaceContext === workspaceContext
          ? JSON.stringify(existingBrand)
          : null,
    );
    registryMocks.writeProjectTextFile.mockResolvedValue({ name: 'brand.json' });

    render(<Harness workspaceContext={workspaceContext} />);
    await act(async () => {
      await latestUpload?.uploadModule(
        'logo',
        new File(['svg'], 'new.svg', { type: 'image/svg+xml' }),
      );
    });

    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith(
      'project-a',
      'brand.json',
      { cache: 'no-store', workspaceContext },
    );
    const written = JSON.parse(String(registryMocks.writeProjectTextFile.mock.calls[0]?.[2]));
    expect(written).toEqual(expect.objectContaining({
      tagline: 'Never erase this',
      description: 'Existing description',
      sourceUrl: 'https://acme.test',
      colors: existingBrand.colors,
      voice: existingBrand.voice,
    }));
    expect(written.logo).toEqual(expect.objectContaining({
      primary: 'logos/new.svg',
      alternates: ['logos/old.svg'],
      notes: 'keep',
    }));
  });

  it('never replaces a Team brand with an empty fallback when the guarded read fails', async () => {
    const workspaceContext = teamContext();
    const onError = vi.fn();
    registryMocks.uploadProjectFile.mockResolvedValue({
      name: 'logos/new.svg',
      size: 10,
      mtime: 1,
      kind: 'image',
      mime: 'image/svg+xml',
    });
    registryMocks.fetchProjectFileText.mockResolvedValue(null);

    render(<Harness workspaceContext={workspaceContext} onError={onError} />);
    await act(async () => {
      await latestUpload?.uploadModule(
        'logo',
        new File(['svg'], 'new.svg', { type: 'image/svg+xml' }),
      );
    });

    expect(registryMocks.writeProjectTextFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('logo', 'brand-read-failed');
  });
});
