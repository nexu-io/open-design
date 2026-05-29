import { describe, expect, it, vi } from 'vitest';
import { getActiveRoute, postActiveRoute } from '../src/active-context-routes.js';
import { ACTIVE_CONTEXT_TTL_MS } from '../src/constants.js';

interface MockStore {
  current:
    | {
        projectId: string;
        fileName: string | null;
        ts: number;
      }
    | null;
}

function makeDeps(now = 1_000) {
  const store: MockStore = { current: null };
  // Annotated return type widens the mock so `.mockReturnValue(null)` is
  // allowed by the inferred Mock type later in the file.
  const getProject = vi.fn(
    (_db: unknown, id: string): { name?: string | null } | null | undefined => ({
      name: `Project ${id}`,
    }),
  );
  return {
    store,
    db: { fake: true },
    getProject,
    now: () => now,
  };
}

const EMPTY_INPUT = { body: {}, query: {}, params: {} };

describe('active context — POST /api/active', () => {
  it('clears the store when body.active === false', async () => {
    const deps = makeDeps();
    deps.store.current = { projectId: 'p1', fileName: 'a.html', ts: 1 };
    const parsed = postActiveRoute.parse({ ...EMPTY_INPUT, body: { active: false } });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = await postActiveRoute.handle(parsed.value, deps);
    expect(out).toEqual({ ok: true, value: { active: false } });
    expect(deps.store.current).toBeNull();
  });

  it('rejects when projectId is missing', () => {
    const parsed = postActiveRoute.parse({ ...EMPTY_INPUT, body: {} });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('BAD_REQUEST');
    expect(parsed.error.message).toBe('projectId is required');
  });

  it('stores projectId + fileName + timestamp on success', async () => {
    const deps = makeDeps(5_000);
    const parsed = postActiveRoute.parse({
      ...EMPTY_INPUT,
      body: { projectId: 'p1', fileName: 'index.html' },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = await postActiveRoute.handle(parsed.value, deps);
    expect(out).toEqual({
      ok: true,
      value: { active: true, projectId: 'p1', fileName: 'index.html', ts: 5_000 },
    });
    expect(deps.store.current).toEqual({ projectId: 'p1', fileName: 'index.html', ts: 5_000 });
  });

  it('treats empty fileName as null', async () => {
    const deps = makeDeps(7_000);
    const parsed = postActiveRoute.parse({
      ...EMPTY_INPUT,
      body: { projectId: 'p1', fileName: '' },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = await postActiveRoute.handle(parsed.value, deps);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value).toMatchObject({ active: true, fileName: null });
  });
});

describe('active context — GET /api/active', () => {
  it('returns inactive when nothing is stored', async () => {
    const deps = makeDeps();
    const out = await getActiveRoute.handle(undefined, deps);
    expect(out).toEqual({ ok: true, value: { active: false } });
  });

  it('returns inactive and clears when TTL has expired', async () => {
    const deps = makeDeps(10_000 + ACTIVE_CONTEXT_TTL_MS);
    deps.store.current = { projectId: 'p1', fileName: null, ts: 9_000 };
    const out = await getActiveRoute.handle(undefined, deps);
    expect(out).toEqual({ ok: true, value: { active: false } });
    expect(deps.store.current).toBeNull();
  });

  it('returns active payload with project name + ageMs when fresh', async () => {
    const deps = makeDeps(2_500);
    deps.store.current = { projectId: 'p7', fileName: 'plan.md', ts: 2_000 };
    const out = await getActiveRoute.handle(undefined, deps);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value).toEqual({
      active: true,
      projectId: 'p7',
      projectName: 'Project p7',
      fileName: 'plan.md',
      ts: 2_000,
      ageMs: 500,
    });
    expect(deps.getProject).toHaveBeenCalledWith(deps.db, 'p7');
  });

  it('tolerates a missing project (projectName = null)', async () => {
    const deps = makeDeps(3_000);
    deps.getProject.mockReturnValue(null);
    deps.store.current = { projectId: 'p9', fileName: null, ts: 2_500 };
    const out = await getActiveRoute.handle(undefined, deps);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value).toMatchObject({ active: true, projectName: null });
  });
});
