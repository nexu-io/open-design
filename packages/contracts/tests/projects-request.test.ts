// Contract-level pinning for the `CreateProjectRequest` shape (#2404
// round-7 reviewer follow-up). Both `pendingPrompt` and
// `customInstructions` must accept `null` so the typed HTTP caller in
// `apps/web/src/state/projects.ts` and the MCP `create_project` tool
// (`apps/daemon/src/mcp.ts`) can express the same request shape
// without casts. UpdateProjectRequest has always carried the union;
// the create side was lagging and produced a contract split visible
// only at use-site.

import { describe, expect, it } from 'vitest';
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
} from '../src/api/projects.js';

describe('CreateProjectRequest accepts null for clearable fields (#2404 round-7)', () => {
  it('pendingPrompt accepts string, null, and omission', () => {
    // The `as` casts here are about pinning the shape — any future
    // narrowing of the union (back to `string` only, or to a
    // discriminated tuple, etc.) makes one of these assignments fail
    // to compile, which is the regression we are guarding against.
    const withString: CreateProjectRequest = { name: 'x', pendingPrompt: 'go' };
    const withNull: CreateProjectRequest = { name: 'x', pendingPrompt: null };
    const omitted: CreateProjectRequest = { name: 'x' };
    expect(withString.pendingPrompt).toBe('go');
    expect(withNull.pendingPrompt).toBeNull();
    expect(omitted.pendingPrompt).toBeUndefined();
  });

  it('customInstructions accepts string, null, and omission', () => {
    const withString: CreateProjectRequest = { name: 'x', customInstructions: 'be terse' };
    const withNull: CreateProjectRequest = { name: 'x', customInstructions: null };
    const omitted: CreateProjectRequest = { name: 'x' };
    expect(withString.customInstructions).toBe('be terse');
    expect(withNull.customInstructions).toBeNull();
    expect(omitted.customInstructions).toBeUndefined();
  });

  it('the create and update shapes agree on pendingPrompt / customInstructions nullability', () => {
    // Use a tiny pair of variables that must remain assignable in
    // both directions for the field portion that the daemon route
    // shares. If create ever drops `null` again the second
    // assignment becomes a type error.
    const update: Pick<UpdateProjectRequest, 'pendingPrompt' | 'customInstructions'> = {
      pendingPrompt: null,
      customInstructions: null,
    };
    const create: Pick<CreateProjectRequest, 'pendingPrompt' | 'customInstructions'> = update;
    expect(create.pendingPrompt).toBeNull();
    expect(create.customInstructions).toBeNull();
  });
});
