import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  handleHubVerifiedConnection,
  handleHubWorkspaceContextChanged,
} from '../../src/server.js';

describe('handleHubVerifiedConnection', () => {
  it('catches up billing on the first workspace-verified connection', () => {
    const catchUpPublishedHeads = vi.fn(async () => undefined);
    const catchUpWorkspaceBilling = vi.fn();

    handleHubVerifiedConnection(
      'workspace-1',
      catchUpPublishedHeads,
      catchUpWorkspaceBilling,
    );

    expect(catchUpPublishedHeads).toHaveBeenCalledWith('workspace-1');
    expect(catchUpWorkspaceBilling).toHaveBeenCalledWith('workspace-1');
  });
});

// Regression coverage for the fix wiring the hub's real `workspace-context-changed`
// push (`startHubEventsSubscriber`'s `onEvent` in server.ts) to an immediate
// `workspaceInvalidationPoller.pollOnce()` — the same catch-up `onReconnect`
// already runs. Before this fix, the event only forwarded a thin SSE nudge to
// the web; the daemon's own last-known-membership cache (consumed by
// `enforceWorkspaceProjectMutation`'s mutation gate) had no accelerated path
// and stayed stale for up to the poller's ~15s cadence — e.g. a member removed
// from a team kept passing the mutation gate for that long even though Vela
// had already told this daemon something changed.
describe('handleHubWorkspaceContextChanged', () => {
  it('triggers an immediate workspace-invalidation poll cycle', async () => {
    const pollWorkspaceInvalidation = vi.fn(async () => undefined);

    handleHubWorkspaceContextChanged('workspace-1', pollWorkspaceInvalidation);

    expect(pollWorkspaceInvalidation).toHaveBeenCalledTimes(1);
  });

  it('never lets a poll failure throw or reject out of the hub event handler', async () => {
    const pollWorkspaceInvalidation = vi.fn(() => Promise.reject(new Error('vela unreachable')));
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);

    expect(() =>
      handleHubWorkspaceContextChanged('workspace-1', pollWorkspaceInvalidation)
    ).not.toThrow();
    // Let the fire-and-forget `.catch()` settle before asserting nothing leaked.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(pollWorkspaceInvalidation).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
    process.removeListener('unhandledRejection', unhandled);
  });
});

// Scope-boundary guard (real source, not a re-implementation): the fix is
// deliberately scoped to ONLY the `workspace-context-changed` hub event.
// `team-projects-changed`, `comment-changed`, `presence-changed`,
// `billing-changed`, `project-metadata-changed`, and `project-content-changed`
// already have their own handling and must not gain a redundant immediate
// poll trigger as a side effect of this change (or of some later edit next to
// it) — each keeps costing exactly the requests its own case already made.
describe('hub events onEvent switch (source boundary)', () => {
  const serverSourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/server.ts',
  );
  const source = fs.readFileSync(serverSourcePath, 'utf8');

  function extractOnEventSwitchBody(): string {
    const anchor = 'onEvent: (event) => {';
    const start = source.indexOf(anchor);
    expect(start, 'expected to find the hub events onEvent handler in server.ts').toBeGreaterThan(-1);
    const switchStart = source.indexOf('switch (event.type) {', start);
    expect(switchStart, 'expected a switch(event.type) right after onEvent').toBeGreaterThan(-1);
    // Walk brace depth from the switch's opening `{` to find its matching close.
    let depth = 0;
    let i = switchStart + 'switch (event.type) {'.length - 1; // position of the opening brace
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    expect(depth, 'expected the switch braces to balance').toBe(0);
    return source.slice(switchStart, i + 1);
  }

  it('calls the immediate poll trigger from exactly one case: workspace-context-changed', () => {
    const switchBody = extractOnEventSwitchBody();
    const cases = switchBody.split(/(?=case '[a-z-]+':)/g).filter((chunk) => chunk.startsWith("case '"));
    expect(cases.length).toBeGreaterThanOrEqual(7);

    const casesCallingPoll = cases.filter((chunk) => /handleHubWorkspaceContextChanged|workspaceInvalidationPoller\.pollOnce\(/.test(chunk));
    const caseNames = casesCallingPoll.map((chunk) => chunk.match(/^case '([a-z-]+)':/)?.[1]);

    expect(caseNames).toEqual(['workspace-context-changed']);
  });

  it('preserves the renamed project id and metadata kind on the workspace invalidation', () => {
    const switchBody = extractOnEventSwitchBody();
    const metadataCase = switchBody
      .split(/(?=case '[a-z-]+':)/g)
      .find((chunk) => chunk.startsWith("case 'project-metadata-changed':"));

    expect(metadataCase).toContain('projectId: event.projectId');
    expect(metadataCase).toContain("kind: 'metadata'");
  });
});
