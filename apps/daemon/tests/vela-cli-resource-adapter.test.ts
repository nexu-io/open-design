import { describe, expect, it } from 'vitest';
import {
  buildVelaResourceEnv,
  contextHasTeamIdentity,
  createVelaCliResourceAdapter,
  shouldUseVelaCliResourceTransport,
} from '../src/collab/vela-cli-resource-adapter.js';

function recordingRun(outputs: Record<string, string>) {
  const calls: string[][] = [];
  const run = async (args: string[]): Promise<string> => {
    calls.push(args);
    return outputs[args[0] ?? ''] ?? '';
  };
  return { run, calls };
}

const OPTS = {
  resolveProjectDir: (id: string) => `/projects/${id}`,
  resolvePullDir: (id: string) => `/copies/${id}`,
  resourceIdFor: (id: string) => `project-${id}`,
  kind: 'design_system',
  hasTeamIdentity: () => true,
};

describe('createVelaCliResourceAdapter', () => {
  it('publishes by spawning `push … --ref published --json` and parses the version', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 7, id: 'v7' }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    const result = await adapter.publish({ projectId: 'p1', reason: 'edit' });
    expect(result).toEqual({ version: 7 });
    expect(calls[0]).toEqual([
      'push',
      'design_system',
      'project-p1',
      '/projects/p1',
      '--ref',
      'published',
      '--json',
    ]);
  });

  it('passes project metadata to the resource index when available', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 7, id: 'v7' }) });
    const adapter = createVelaCliResourceAdapter({
      ...OPTS,
      describeProject: () => ({ name: 'Launch Deck', metadata: { kind: 'deck' } }),
      run,
    });
    await adapter.publish({ projectId: 'p1', reason: 'edit' });
    expect(calls[0]).toEqual([
      'push',
      'design_system',
      'project-p1',
      '/projects/p1',
      '--ref',
      'published',
      '--json',
      '--metadata-json',
      JSON.stringify({ name: 'Launch Deck', metadata: { kind: 'deck' } }),
    ]);
  });

  it('reports the head version via `head` without pulling', async () => {
    const { run, calls } = recordingRun({ head: JSON.stringify({ version: 3 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toEqual({ version: 3 });
    expect(calls[0]).toEqual(['head', 'project-p1', '--ref', 'published', '--json']);
  });

  it('treats a null head version (nothing published) as no result', async () => {
    const { run } = recordingRun({ head: JSON.stringify({ resourceId: 'project-p1', ref: 'published', version: null }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toBeNull();
  });

  it('pulls into the pull dir', async () => {
    const { run, calls } = recordingRun({ pull: '{}' });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await adapter.pull!({ projectId: 'p1' });
    expect(calls[0]).toEqual(['pull', 'design_system', 'project-p1', '/copies/p1', '--ref', 'published', '--json']);
  });

  it('removes a project from the team resource index', async () => {
    const { run, calls } = recordingRun({ remove: JSON.stringify({ ok: true }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, run });
    await adapter.unpublish!({ projectId: 'p1' });
    expect(calls[0]).toEqual(['remove', 'project-p1', '--json']);
  });

  it('no-ops (never spawns) when there is no team identity', async () => {
    const { run, calls } = recordingRun({ push: JSON.stringify({ version: 1 }) });
    const adapter = createVelaCliResourceAdapter({ ...OPTS, hasTeamIdentity: () => false, run });
    expect(await adapter.publish({ projectId: 'p1', reason: 'edit' })).toBeNull();
    expect(await adapter.syncLatest!({ projectId: 'p1' })).toBeNull();
    await adapter.pull!({ projectId: 'p1' });
    await adapter.unpublish!({ projectId: 'p1' });
    expect(calls.length).toBe(0);
  });
});

describe('transport selection', () => {
  it('opts into the CLI transport for explicit or Vela-backed team modes', () => {
    expect(shouldUseVelaCliResourceTransport({ OD_RESOURCE_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({ OD_RESOURCE_TRANSPORT: 'sdk' })).toBe(false);
    expect(shouldUseVelaCliResourceTransport({ OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({ OD_COLLAB_TRANSPORT: 'vela-cli' })).toBe(true);
    expect(shouldUseVelaCliResourceTransport({})).toBe(false);
  });

  it('preserves an explicit VELA_PROFILE over the daemon default profile', () => {
    expect(
      buildVelaResourceEnv({
        OPEN_DESIGN_AMR_PROFILE: 'prod',
        VELA_PROFILE: 'local',
        AMR_HOME: '/tmp/member',
      }).VELA_PROFILE,
    ).toBe('local');
  });

  it('gates team identity on a live team workspace context', () => {
    expect(
      contextHasTeamIdentity({ workspaceType: 'team', teamId: 't1' } as never),
    ).toBe(true);
    expect(contextHasTeamIdentity({ workspaceType: 'personal' } as never)).toBe(false);
    expect(contextHasTeamIdentity(null)).toBe(false);
  });
});
