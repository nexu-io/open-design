import { describe, expect, it } from 'vitest';

import { workspaceTeamTransportEnv } from '../src/workspace-team.js';

describe('workspaceTeamTransportEnv', () => {
  it('enables every Workspace Team transport in feature-test with a normalized Vela URL', () => {
    expect(
      workspaceTeamTransportEnv('feature-test', 'https://feature-test.vela.example/'),
    ).toEqual({
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
      OD_COLLAB_TRANSPORT: 'vela-cli',
      OD_RESOURCE_TRANSPORT: 'vela-cli',
      OD_VELA_WEB_URL: 'https://feature-test.vela.example',
    });
  });

  it('keeps production and an origin-less feature-test dormant', () => {
    expect(workspaceTeamTransportEnv('prod', 'https://vela.example')).toEqual({});
    expect(workspaceTeamTransportEnv('feature-test', undefined)).toEqual({});
  });
});
