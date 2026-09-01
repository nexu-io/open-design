import { describe, expect, it } from 'vitest';
import { resolveWorkspaceScope } from '../../src/collab/workspace-scope.js';

// B-line handoff (vela-client-explicit-workspace-handoff): every workspace-
// scoped call resolves its target through ONE entry with a fixed priority —
// explicit per-call id → the project's pinned workspace → the locally
// persisted selection → environment. When all are absent the result stays
// unresolved; the caller must not fall back to server-side workspace state.
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

  it('returns unresolved when no explicit or local scope exists', () => {
    expect(resolveWorkspaceScope({})).toEqual({ source: 'unresolved' });
  });
});
