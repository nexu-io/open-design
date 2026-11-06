import { describe, expect, it, vi } from 'vitest';
import {
  createRevokedWorkspaceRunCancellation,
  workspaceRunActorKey,
} from '../../src/services/cancel-revoked-workspace-runs.js';

function actor(userId = 'member-a', profile = 'local', apiUrl = 'http://api.local') {
  return workspaceRunActorKey({
    login: { loggedIn: true, profile, user: { id: userId } },
    control: { profile, apiUrl, user: { id: userId } },
    credentialOverrides: false,
  })!;
}

interface Run {
  id: string;
  agentId: string;
  status: string;
  cancelRequested?: boolean;
  workspaceScope: { workspaceId: string; workspaceMemberId: string };
}
function run(id: string, workspaceId = 'go'): Run {
  return { id, agentId: 'amr', status: 'running', workspaceScope: { workspaceId, workspaceMemberId: 'project-creator' } };
}
function harness(runs: Run[]) {
  const cancel = vi.fn(async (r: Run, _origin: 'unknown') => {
    r.cancelRequested = true;
    r.status = 'canceled';
  });
  const onError = vi.fn();
  const coordinator = createRevokedWorkspaceRunCancellation({
    listRuns: () => runs,
    isTerminal: (status) => ['canceled', 'succeeded', 'failed'].includes(status),
    cancel,
    onError,
  });
  return { coordinator, cancel, onError };
}

describe('authenticated workspace run actor', () => {
  it('keeps the same account across refresh, key rotation and config rewrites', () => {
    const before = {
      login: { loggedIn: true, profile: 'local', user: { id: 'member-a' }, credentialRevision: 'old-key-and-mtime' },
      control: { profile: 'local', apiUrl: 'http://api.local', user: { id: 'member-a' }, configMtimeMs: 10, controlKey: 'old-test-key' },
      credentialOverrides: false,
    };
    const after = {
      ...before,
      login: { ...before.login, credentialRevision: 'rotated-key-and-mtime' },
      control: { ...before.control, configMtimeMs: 20, controlKey: 'new-test-key' },
    };
    expect(workspaceRunActorKey(after)).toBe(workspaceRunActorKey(before));
  });

  it('separates users, API deployments and profiles', () => {
    expect(actor('member-b')).not.toBe(actor());
    expect(actor('member-a', 'test')).not.toBe(actor());
    expect(actor('member-a', 'local', 'http://another-api.local')).not.toBe(actor());
  });

  it('does not invent an actor for unknown runtime credentials or mixed users', () => {
    const evidence = {
      login: { loggedIn: true, profile: 'local', user: { id: 'member-a' } },
      control: { profile: 'local', apiUrl: 'http://api.local', user: { id: 'member-b' } },
      credentialOverrides: false,
    };
    expect(workspaceRunActorKey(evidence)).toBeNull();
    expect(workspaceRunActorKey({
      ...evidence,
      control: { ...evidence.control, user: { id: 'member-a' } },
      credentialOverrides: true,
    })).toBeNull();
    expect(workspaceRunActorKey({ ...evidence, login: { ...evidence.login, user: null } })).toBeNull();
  });
});

describe('revoked workspace host runs', () => {
  it('exposes only the verified launch member to project-scoped tool checks', () => {
    const active = run('tool-run');
    const h = harness([active]);
    h.coordinator.begin(active);
    expect(h.coordinator.pinnedMember(active)).toBeNull();
    expect(h.coordinator.pin(active, actor(), 'active-other')).toBe(true);
    expect(h.coordinator.pinnedMember(active)).toBe('active-other');
    expect(h.coordinator.pinnedMember(run('unrelated'))).toBeNull();
  });

  it('cancels only the exact workspace and authenticated actor, never the creator or ambient selection', async () => {
    const matching = run('matching');
    const personal = run('personal', 'personal');
    const otherActor = run('other-actor');
    const terminal = { ...run('terminal'), status: 'succeeded' };
    const otherAgent = { ...run('other-agent'), agentId: 'codex' };
    const h = harness([matching, personal, otherActor, terminal, otherAgent]);
    for (const r of [matching, personal, otherActor, terminal, otherAgent]) {
      h.coordinator.begin(r);
      h.coordinator.pin(r, r === otherActor ? actor('member-b') : actor());
    }

    await h.coordinator.revoke('go', actor());

    expect(h.cancel).toHaveBeenCalledExactlyOnceWith(matching, 'unknown');
    expect(matching.status).toBe('canceled');
    expect(personal.status).toBe('running');
    expect(otherActor.status).toBe('running');
    expect(otherAgent.status).toBe('running');
  });

  it('keeps a rejoined member running when the old verified member is revoked', async () => {
    const old = run('old-member');
    const rejoined = run('rejoined-member');
    rejoined.workspaceScope.workspaceMemberId = 'new-member';
    const h = harness([old, rejoined]);
    for (const r of [old, rejoined]) {
      h.coordinator.begin(r);
      h.coordinator.pin(r, actor(), r === old ? 'removed-actor-member' : 'new-actor-member');
    }
    await h.coordinator.revoke('go', actor(), 'removed-actor-member');
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith(old, 'unknown');
    expect(rejoined.status).toBe('running');
    expect(h.coordinator.pin(rejoined, actor(), 'new-actor-member')).toBe(true);
  });

  it('fences only the verified removed member while setup is awaiting its actor', async () => {
    const old = run('old-setup');
    const rejoined = run('new-setup');
    rejoined.workspaceScope.workspaceMemberId = 'new-member';
    const h = harness([old, rejoined]);
    h.coordinator.begin(old);
    h.coordinator.begin(rejoined);
    await h.coordinator.revoke('go', actor(), 'removed-actor-member');
    expect(h.coordinator.pin(old, actor(), 'removed-actor-member')).toBe(false);
    expect(h.coordinator.pin(rejoined, actor(), 'new-actor-member')).toBe(true);
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith(old, 'unknown');
  });

  it('does not authorize cancellation from a project creator when the actual member is unknown', async () => {
    const r = run('unknown-member');
    const h = harness([r]);
    h.coordinator.begin(r);
    h.coordinator.pin(r, actor(), null);
    await h.coordinator.revoke('go', actor(), r.workspaceScope.workspaceMemberId);
    expect(r.status).toBe('running');
    expect(h.coordinator.pin(r, actor(), null)).toBe(true);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('does not re-pin a known actual member on retry after rejoining', () => {
    const r = run('rejoined-retry');
    const h = harness([r]);
    h.coordinator.begin(r);
    expect(h.coordinator.pin(r, actor(), 'old-actor-member')).toBe(true);
    expect(h.coordinator.pin(r, actor(), 'new-actor-member')).toBe(false);
    expect(r.status).toBe('canceled');
  });

  it('uses the launch actor rather than a shared project creator for directory removal', async () => {
    const removedActor = run('current-account-b');
    const priorAccount = run('prior-account-c');
    const opaqueActor = run('opaque-runtime');
    // A transferred project may retain the same creator namespace for all
    // these Runs; it is deliberately different from actual member proof.
    const h = harness([removedActor, priorAccount, opaqueActor]);
    for (const r of [removedActor, priorAccount, opaqueActor]) h.coordinator.begin(r);
    h.coordinator.pin(removedActor, actor('account-b'), 'actual-member-b');
    h.coordinator.pin(priorAccount, actor('account-c'), 'actual-member-c');
    h.coordinator.pin(opaqueActor, null, null);
    await h.coordinator.revoke('go', actor('account-b'), 'actual-member-b');
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith(removedActor, 'unknown');
    expect(priorAccount.status).toBe('running');
    expect(opaqueActor.status).toBe('running');
  });

  it('still stops an older run after the same account credentials refresh', async () => {
    const r = run('before-refresh');
    const h = harness([r]);
    h.coordinator.begin(r);
    h.coordinator.pin(r, actor());
    await h.coordinator.revoke('go', actor('member-a', 'local', 'http://api.local/'));
    expect(r.status).toBe('canceled');
  });

  it('fences a verified revocation received before setup can pin the actual child actor', async () => {
    const r = run('setting-up');
    const h = harness([r]);
    h.coordinator.begin(r);
    await h.coordinator.revoke('go', actor());
    expect(h.cancel).not.toHaveBeenCalled();

    expect(h.coordinator.pin(r, actor())).toBe(false);
    expect(r.status).toBe('canceled');
  });

  it('does not consume a different actor or space revocation while setup is awaiting', async () => {
    const r = run('setting-up');
    const h = harness([r]);
    h.coordinator.begin(r);
    await h.coordinator.revoke('go', actor('member-b'));
    await h.coordinator.revoke('personal', actor());
    expect(h.coordinator.pin(r, actor())).toBe(true);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('does not re-pin an existing run to another account on retry', () => {
    const r = run('retry');
    const h = harness([r]);
    h.coordinator.begin(r);
    expect(h.coordinator.pin(r, actor())).toBe(true);
    h.coordinator.begin(r);
    expect(h.coordinator.pin(r, actor('member-b'))).toBe(false);
    expect(r.status).toBe('canceled');
  });

  it('keeps setup fenced while physical cancellation is still awaiting child exit', async () => {
    const r = run('child-pending');
    let resolveExit!: () => void;
    const exited = new Promise<void>((resolve) => { resolveExit = resolve; });
    const cancel = vi.fn(async (active: Run) => {
      active.cancelRequested = true;
      await exited;
      active.status = 'canceled';
    });
    const coordinator = createRevokedWorkspaceRunCancellation({
      listRuns: () => [r], isTerminal: (status) => status === 'canceled', cancel,
    });
    coordinator.begin(r);
    coordinator.pin(r, actor());
    const canceled = coordinator.revoke('go', actor());
    const duplicate = coordinator.revoke('go', actor());
    expect(r.cancelRequested).toBe(true);
    expect(coordinator.pin(r, actor())).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    resolveExit();
    await Promise.all([canceled, duplicate]);
    expect(coordinator.pin(r, actor())).toBe(false);
  });

  it('leaves an unproven actor alone and permits a newly authorized future run', async () => {
    const old = run('unproven');
    const fresh = run('new-after-rejoin');
    const h = harness([old, fresh]);
    h.coordinator.begin(old);
    h.coordinator.pin(old, null);
    await h.coordinator.revoke('go', actor());
    h.coordinator.begin(fresh);
    expect(h.coordinator.pin(fresh, actor())).toBe(true);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('continues stopping sibling runs if one cancellation fails', async () => {
    const runs = [run('first'), run('second')];
    const h = harness(runs);
    h.cancel.mockRejectedValueOnce(new Error('child teardown unavailable'));
    for (const r of runs) { h.coordinator.begin(r); h.coordinator.pin(r, actor()); }
    await h.coordinator.revoke('go', actor());
    expect(h.cancel).toHaveBeenCalledTimes(2);
    expect(h.onError).toHaveBeenCalledWith(runs[0]);
    expect(runs[1]!.status).toBe('canceled');
  });
});
