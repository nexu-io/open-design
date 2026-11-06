import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEAM_MEMBERS_IDLE_TTL_MS,
  TEAM_MEMBERS_MAX_RETAINED_IDENTITIES,
  resetTeamMembersStores,
  teamMembersStoreFor,
} from '../src/collab/team-members-store';
import { workspaceContextFixture } from './helpers/workspace-context';

const CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-store-unit',
  workspaceMemberId: 'member-viewer',
});

describe('team members identity store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTeamMembersStores();
  });

  afterEach(() => {
    resetTeamMembersStores();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps last-good on failure and treats a successful empty roster as authoritative', async () => {
    const responses = [
      new Response(
        JSON.stringify({
          members: [
            {
              memberId: 'member-peer',
              displayName: 'Last good peer',
              role: 'member',
            },
          ],
        }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE' }), {
        status: 503,
      }),
      new Response(JSON.stringify({}), { status: 200 }),
      new Response(JSON.stringify({ members: [] }), { status: 200 }),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!));

    const store = teamMembersStoreFor(CONTEXT, 0)!;
    await store.revalidate();
    expect(store.getSnapshot()[0]?.displayName).toBe('Last good peer');

    await store.revalidate();
    expect(store.getSnapshot()[0]?.displayName).toBe('Last good peer');

    await store.revalidate();
    expect(store.getSnapshot()[0]?.displayName).toBe('Last good peer');

    await store.revalidate();
    expect(store.getSnapshot()).toEqual([]);
  });

  it('expires an idle last-good snapshot only at the TTL boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            members: [
              {
                memberId: 'member-peer',
                displayName: 'Warm peer',
                role: 'member',
              },
            ],
          }),
          { status: 200 },
        )),
    );

    const warm = teamMembersStoreFor(CONTEXT, 0)!;
    await warm.revalidate();
    await vi.advanceTimersByTimeAsync(TEAM_MEMBERS_IDLE_TTL_MS - 1);
    expect(teamMembersStoreFor(CONTEXT, 0)).toBe(warm);

    await vi.advanceTimersByTimeAsync(1);
    const expired = teamMembersStoreFor(CONTEXT, 0)!;
    expect(expired).not.toBe(warm);
    expect(expired.getSnapshot()).toEqual([]);
  });

  it('retains only the most recently used bounded set of idle identities', () => {
    const contexts = Array.from(
      { length: TEAM_MEMBERS_MAX_RETAINED_IDENTITIES + 1 },
      (_, index) =>
        workspaceContextFixture({
          workspaceId: `workspace-lru-${index}`,
          workspaceMemberId: `member-lru-${index}`,
        }),
    );
    const stores = contexts.map((context) => teamMembersStoreFor(context, 0)!);

    expect(teamMembersStoreFor(contexts.at(-1)!, 0)).toBe(stores.at(-1));
    expect(teamMembersStoreFor(contexts[0]!, 0)).not.toBe(stores[0]);
  });

  it('deduplicates one SSE payload fanned out to multiple consumers', async () => {
    let reads = 0;
    let resolveInvalidation!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((): Promise<Response> => {
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ members: [] }), { status: 200 }),
          );
        }
        return new Promise<Response>((resolve) => {
          resolveInvalidation = resolve;
        });
      }),
    );

    const store = teamMembersStoreFor(CONTEXT, 0)!;
    const releaseFirst = store.retain(Symbol('first'));
    const releaseSecond = store.retain(Symbol('second'));
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toBe(1);

    const payload = { type: 'members-changed' };
    store.markDirty(payload);
    store.markDirty(payload);
    expect(reads).toBe(2);

    resolveInvalidation(
      new Response(JSON.stringify({ members: [] }), { status: 200 }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toBe(2);

    releaseFirst();
    releaseSecond();
  });
});
