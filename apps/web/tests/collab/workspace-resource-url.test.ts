// `workspaceResourceUrl` is the one mechanism a browser-native navigation
// (`<a href>`, `<img src>`) has for carrying Workspace authority — those
// requests can't attach the `x-od-workspace-*` headers `workspaceProjectHeaders`
// puts on a real `fetch`. Every download/export surface in the app depends on
// this function appending the right query params in the right shape; a scene3d
// review (nettee, PR #7412) found the export menu and proof-frame images
// skipping it entirely, so this pins the primitive itself, previously untested.

import { describe, expect, it } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { workspaceResourceUrl } from '../../src/collab/workspace-identity';

const context = {
  workspaceId: 'ws-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canShareProjects: true, canWriteSyncedFiles: true },
} as unknown as WorkspaceCollabContext;

describe('workspaceResourceUrl', () => {
  it('passes a local (non-Workspace) path through unchanged', () => {
    expect(workspaceResourceUrl('/api/projects/p1/files/out/scene.glb', null)).toBe(
      '/api/projects/p1/files/out/scene.glb',
    );
    expect(workspaceResourceUrl('/api/projects/p1/files/out/scene.glb', undefined)).toBe(
      '/api/projects/p1/files/out/scene.glb',
    );
  });

  it('appends both identity fields as a query string for a Workspace-bound path', () => {
    const url = workspaceResourceUrl('/api/projects/p1/files/out/scene.glb', context);
    expect(url).toBe(
      '/api/projects/p1/files/out/scene.glb?workspaceId=ws-1&workspaceMemberId=wm-1',
    );
  });

  it('joins with & rather than ? when the path already carries a query', () => {
    const url = workspaceResourceUrl('/api/projects/p1/files/out/scene.glb?v=1', context);
    expect(url).toBe(
      '/api/projects/p1/files/out/scene.glb?v=1&workspaceId=ws-1&workspaceMemberId=wm-1',
    );
  });

  it('encodes ids that need it', () => {
    const weird = { ...context, workspaceId: 'a b', workspaceMemberId: 'c&d' } as
      WorkspaceCollabContext;
    const url = workspaceResourceUrl('/api/projects/p1/files/x.png', weird);
    expect(url).toBe('/api/projects/p1/files/x.png?workspaceId=a%20b&workspaceMemberId=c%26d');
  });
});
