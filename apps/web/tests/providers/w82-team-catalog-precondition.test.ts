// Red-spec (W82 item 3): three requests from one cold conversation open that
// could not have succeeded, measured in a real browser with `window.fetch`
// wrapped to record `new Error().stack`.
//
//   GET /api/workspace/projects/team  ×3, ALL 403
//        t=5046  App.resolveAuthoritativeProjectName → fetchTeamProjectCatalogEntry
//        t=5571  projectIsSharedWithWorkspace
//        (+1 more from useWorkspaceContext.loadFull in a second capture)

// `/workspace/projects/team` is not a duplicate at all — it is a request that
// CANNOT succeed. The daemon route (apps/daemon/src/routes/collab-context.ts)
// answers 403 WORKSPACE_ACCESS_DENIED whenever the verified workspace is not a
// team, and the signed-in account's active workspace here is personal
// (`/api/workspace/directory` → workspaceType: "personal"). A personal
// workspace has no team-shared catalog by construction, so every one of those
// three requests was guaranteed to fail before it left the browser. The client
// already holds the answer: `workspaceType` is a field it is about to put in
// its own request headers.
//
// The invariant pinned here is that the module refuses the read locally with
// the SAME failure shape the 403 produced, so every existing consumer branch
// is untouched: useWorkspaceContext.loadFull already catches it as "Personal /
// offline / daemon without the hub: no team-shared projects",
// projectIsSharedWithWorkspace already catches it as `false`, and App's
// catalog lookup already catches it as `{ ok: false }`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { fetchTeamProjectsCatalog } from '../../src/collab/team-projects-catalog';
import { resetWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    teamId: 'team-1',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
    ...overrides,
  };
}

const PERSONAL = context({
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  // 契约里 `teamId` 是 `string | undefined`,个人工作区是「没有这个字段」而不是「值为 null」。
  teamId: undefined,
  role: 'owner',
});

const fetchCalls: string[] = [];
let release: Array<() => void> = [];

// What the daemon answers `/api/workspace/projects/team` with. 403 is what a
// personal workspace really gets (verified against the live daemon); tests that
// exercise a team workspace flip it to 200.
let teamCatalogStatus = 403;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function bodyForUrl(url: string): unknown {
  if (url.includes('/workspace/projects/team')) {
    return teamCatalogStatus === 200
      ? { projects: [] }
      : { error: 'WORKSPACE_ACCESS_DENIED' };
  }
  return {};
}

const blockingFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  fetchCalls.push(url);
  // The team catalog answers immediately so a refused read stays a fast red on
  // the request COUNT rather than a timeout; everything else is held open so
  // overlapping readers genuinely coexist on the wire.
  if (url.includes('/workspace/projects/team')) {
    return jsonResponse(teamCatalogStatus, bodyForUrl(url));
  }
  await new Promise<void>((resolve) => {
    release.push(resolve);
  });
  return jsonResponse(200, bodyForUrl(url));
});

beforeEach(() => {
  fetchCalls.length = 0;
  release = [];
  teamCatalogStatus = 403;
  blockingFetch.mockClear();
  resetWorkspaceAccountGeneration();
  vi.stubGlobal('fetch', blockingFetch);
});

afterEach(() => {
  release.forEach((resolve) => resolve());
  vi.unstubAllGlobals();
  resetWorkspaceAccountGeneration();
});

const callsMatching = (fragment: string): string[] =>
  fetchCalls.filter((url) => url.includes(fragment));

describe('team-shared project catalog is not asked for when there is no team', () => {
  it('issues no request at all for a personal workspace', async () => {
    await expect(
      fetchTeamProjectsCatalog({ context: PERSONAL }),
    ).rejects.toThrow();
    await expect(
      fetchTeamProjectsCatalog({ context: PERSONAL, force: true }),
    ).rejects.toThrow();
    await expect(
      fetchTeamProjectsCatalog({ context: PERSONAL, coalesce: false }),
    ).rejects.toThrow();

    expect(callsMatching('/workspace/projects/team')).toHaveLength(0);
  });

  it('still reads the catalog for a team workspace', async () => {
    // Reverse control: the guard must key off the workspace TYPE, not simply
    // suppress the endpoint. A team workspace still goes to the wire.
    teamCatalogStatus = 200;
    await expect(fetchTeamProjectsCatalog({ context: context() })).resolves.toEqual([]);
    expect(callsMatching('/workspace/projects/team')).toHaveLength(1);
  });

  it('goes to the wire again as soon as the workspace becomes a team', async () => {
    // Anti-cache: the refusal is a precondition re-evaluated per call, not a
    // remembered verdict. A personal→team upgrade must not stay refused.
    await expect(fetchTeamProjectsCatalog({ context: PERSONAL })).rejects.toThrow();
    expect(callsMatching('/workspace/projects/team')).toHaveLength(0);

    teamCatalogStatus = 200;
    await expect(
      fetchTeamProjectsCatalog({
        context: context({ workspaceId: 'ws-personal', workspaceMemberId: 'wm-1' }),
      }),
    ).resolves.toEqual([]);
    expect(callsMatching('/workspace/projects/team')).toHaveLength(1);
  });
});

// `/api/plugins` is NOT part of this fix. Its two requests are an ordinary
// same-call-site replay, but `listPlugins` deliberately supports concurrent
// same-key reads and arbitrates them with `pluginCatalogCacheGenerations`
// (latest-started-wins). `tests/state/projects.test.ts` pins that race — "keeps
// the latest-started same-scope plugin read cached when responses finish in
// reverse order" — and a ttl-0 join makes it unreachable rather than merely
// handled. That is a change to the module's concurrency contract, not to a
// request count, so it is left to whoever owns that contract. See the note on
// `listPlugins`.
