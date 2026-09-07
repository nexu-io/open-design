// @vitest-environment jsdom
//
// The primitive (`workspaceResourceUrl`) has its own direct test — this
// pins that `Scene3dPanel`'s `ExportMenu` actually CALLS it. Two real
// review findings (nettee, PR #7412) were exactly this shape: the wiring
// silently dropped between a correctly-behaving primitive and the JSX that
// was supposed to use it. A test that only pins the primitive would not
// have caught either.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { ExportMenu } from '../../src/components/Scene3dPanel';

afterEach(cleanup);

const refs = [{ path: 'out/scene.glb', url: '/api/projects/p1/files/out/scene.glb' }];

const workspaceContext = {
  workspaceId: 'ws-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canShareProjects: true, canWriteSyncedFiles: true },
} as unknown as WorkspaceCollabContext;

function openMenu() {
  fireEvent.click(screen.getByRole('button', { hidden: true }));
}

describe('Scene3dPanel ExportMenu workspace scoping', () => {
  it('leaves a local project’s export link unscoped', () => {
    render(<ExportMenu label="crate" refs={refs} workspaceContext={null} />);
    openMenu();
    const link = screen.getByRole('menuitem') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/projects/p1/files/out/scene.glb');
  });

  it('appends Workspace identity to a Workspace-bound project’s export link', () => {
    render(<ExportMenu label="crate" refs={refs} workspaceContext={workspaceContext} />);
    openMenu();
    const link = screen.getByRole('menuitem') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/api/projects/p1/files/out/scene.glb?workspaceId=ws-1&workspaceMemberId=wm-1',
    );
  });
});
