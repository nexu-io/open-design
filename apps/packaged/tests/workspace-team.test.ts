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

  it('enables the transports on production now that its Vela backend serves them', () => {
    expect(workspaceTeamTransportEnv('prod', 'https://open-design.ai/cloud')).toEqual({
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
      OD_COLLAB_TRANSPORT: 'vela-cli',
      OD_RESOURCE_TRANSPORT: 'vela-cli',
      OD_VELA_WEB_URL: 'https://open-design.ai/cloud',
    });
  });

  it('keeps an origin-less build dormant on every profile', () => {
    // Half a configuration is the dangerous one: without an injected origin the
    // packaged daemon would otherwise point Workspace Team at an unknown
    // backend. Missing origin must degrade to local-only, never to a guess.
    expect(workspaceTeamTransportEnv('feature-test', undefined)).toEqual({});
    expect(workspaceTeamTransportEnv('prod', undefined)).toEqual({});
    expect(workspaceTeamTransportEnv('prod', '   ')).toEqual({});
  });

  it('keeps an unknown profile dormant even with an origin', () => {
    expect(workspaceTeamTransportEnv('staging', 'https://vela.example')).toEqual({});
    expect(workspaceTeamTransportEnv(null, 'https://vela.example')).toEqual({});
  });
});
