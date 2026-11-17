import { expect, it, vi } from 'vitest';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { createVelaCliResourceAdapter } from '../src/collab/vela-cli-resource-adapter.js';

it('preserves the actual native pull root and immutable version through the runtime', async () => {
  const run = vi.fn(async () => JSON.stringify({ version: 7, versionId: 'landed-version-7' }));
  const runtime = createCollabRuntime({
    adapter: createVelaCliResourceAdapter({
      hasTeamIdentity: () => true,
      resolveProjectDir: () => 'fixture-dir',
      resolveResourceId: () => 'retained-catalog-root',
      run,
    }),
  });
  try {
    const principal = { teamId: 'team-1', memberId: 'member-1', role: 'member' as const,
      lifecycleState: 'active' as const, workspaceType: 'team' as const };
    expect(await runtime.pullLatest('project-1', principal)).toEqual({
      version: 7, versionId: 'landed-version-7', resourceId: 'retained-catalog-root',
    });
    expect(run).toHaveBeenCalledWith(
      ['pull', 'project', 'retained-catalog-root', 'fixture-dir', '--ref', 'published', '--json'], 'team-1',
    );
  } finally {
    runtime.dispose();
  }
});
