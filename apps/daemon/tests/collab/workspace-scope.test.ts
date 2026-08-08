import { describe, expect, it } from 'vitest';
import { resolveWorkspaceScope } from '../../src/collab/workspace-scope.js';

// B-line handoff (vela-client-explicit-workspace-handoff): every workspace-
// scoped call resolves its target through ONE entry with a fixed priority —
// explicit per-call id → the project's pinned workspace → the locally
// persisted selection → environment — and only when all are absent does the
// request go out header-less so the server's Active Workspace fallback
// applies. The resolver never invents an id and never touches server state.
describe('resolveWorkspaceScope', () => {
  it('prefers the explicit per-call id over everything', () => {
    expect(
      resolveWorkspaceScope({
        explicit: 'ws-explicit',
        projectWorkspaceId: 'ws-project',
        localSelection: 'ws-local',
        envWorkspaceId: 'ws-env',
      }),
    ).toEqual({ workspaceId: 'ws-explicit', source: 'explicit' });
  });

  it('falls back explicit → project → local selection → environment', () => {
    expect(
      resolveWorkspaceScope({
        projectWorkspaceId: 'ws-project',
        localSelection: 'ws-local',
        envWorkspaceId: 'ws-env',
      }),
    ).toEqual({ workspaceId: 'ws-project', source: 'project' });
    expect(
      resolveWorkspaceScope({ localSelection: 'ws-local', envWorkspaceId: 'ws-env' }),
    ).toEqual({ workspaceId: 'ws-local', source: 'local-selection' });
    expect(resolveWorkspaceScope({ envWorkspaceId: 'ws-env' })).toEqual({
      workspaceId: 'ws-env',
      source: 'environment',
    });
  });

  it('treats blank and whitespace ids as absent', () => {
    expect(
      resolveWorkspaceScope({
        explicit: '  ',
        projectWorkspaceId: '',
        localSelection: '\n',
        envWorkspaceId: ' ws-env ',
      }),
    ).toEqual({ workspaceId: 'ws-env', source: 'environment' });
  });

  it('returns the server-current fallback marker when nothing is set', () => {
    expect(resolveWorkspaceScope({})).toEqual({ source: 'server-current' });
  });
});
