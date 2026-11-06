// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { CritiqueTheaterMount } from '../../../src/components/Theater/CritiqueTheaterMount';
import type { CritiqueAction } from '../../../src/components/Theater/state/reducer';
import type { CritiqueEventsConnectionOptions } from '../../../src/components/Theater/state/sse';
import { WORKSPACE_CONTEXT_REFRESH_EVENT } from '../../../src/collab/useWorkspaceContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function TestCritiqueTheaterMount(
  props: Omit<ComponentProps<typeof CritiqueTheaterMount>, 'workspaceContext'>,
) {
  return <CritiqueTheaterMount {...props} workspaceContext={null} />;
}

interface FactoryHandle {
  send: (action: CritiqueAction) => void;
  closed: boolean;
  workspaceContext: WorkspaceCollabContext | null;
}

function makeFactory() {
  const handles: FactoryHandle[] = [];
  const factory = (
    _projectId: string,
    onEvent: (action: CritiqueAction) => void,
    options: CritiqueEventsConnectionOptions,
  ) => {
    const handle: FactoryHandle = {
      send: (action) => onEvent(action),
      closed: false,
      workspaceContext: options.workspaceContext ?? null,
    };
    handles.push(handle);
    return {
      close(): void {
        handle.closed = true;
      },
    };
  };
  return { factory, handles };
}

function teamContext(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: `team-${workspaceId}`,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
  };
}

describe('<TestCritiqueTheaterMount> (Phase 9.1)', () => {
  it('renders nothing when disabled even if a runs starts later', () => {
    const { factory } = makeFactory();
    const { container } = render(
      <TestCritiqueTheaterMount projectId="p-1" enabled={false} connectionFactory={factory} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while idle, then mounts the stage on run_started', () => {
    const { factory, handles } = makeFactory();
    const { container } = render(
      <TestCritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />,
    );
    // Idle pre-event: no DOM.
    expect(container.firstChild).toBeNull();
    expect(handles).toHaveLength(1);

    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'r',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });

    expect(screen.getByRole('region').getAttribute('data-phase')).toBe('running');
  });

  it('flips the kill button to pending and synthesizes interrupted on click', async () => {
    const { factory, handles } = makeFactory();
    render(
      <TestCritiqueTheaterMount
        projectId="p-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={vi.fn(async () => new Response(null, { status: 204 }))}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'r',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
      handles[0]!.send({
        type: 'round_end',
        runId: 'r',
        round: 1,
        composite: 7.4,
        mustFix: 0,
        decision: 'continue',
        reason: 'below threshold',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));

    // Daemon ack lands asynchronously: the dispatch waits for the
    // POST response before terminalizing (Siri-Ray + lefarcen P1 on
    // PR #1316). Wait for the collapsed surface to appear.
    await waitFor(() => {
      expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    });
    expect(screen.getByText('Interrupted')).toBeTruthy();
  });

  it('tears down the connection when enabled flips to false', () => {
    const { factory, handles } = makeFactory();
    const { rerender } = render(
      <TestCritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />,
    );
    expect(handles).toHaveLength(1);
    expect(handles[0]!.closed).toBe(false);

    rerender(
      <TestCritiqueTheaterMount projectId="p-1" enabled={false} connectionFactory={factory} />,
    );
    expect(handles[0]!.closed).toBe(true);
  });

  it('POSTs to the daemon interrupt endpoint on Interrupt click (PR #1315 review)', () => {
    // Lefarcen + codex P1: the previous revision did the optimistic
    // local dispatch only, so the daemon-side run kept running while
    // the UI ignored the real terminal event. Fire the kill request
    // alongside the optimistic dispatch.
    const { factory, handles } = makeFactory();
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetchInterrupt = vi.fn(async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    render(
      <TestCritiqueTheaterMount
        projectId="proj-42"
        enabled
        connectionFactory={factory}
        fetchInterrupt={fetchInterrupt}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-abc',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));

    expect(fetchInterrupt).toHaveBeenCalledTimes(1);
    expect(fetchCalls[0]!.url).toBe(
      '/api/projects/proj-42/critique/run-abc/interrupt',
    );
    expect(fetchCalls[0]!.init.method).toBe('POST');
  });

  it('sends the exact persisted project identity on interrupt', () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const { factory, handles } = makeFactory();
    let interruptInit: RequestInit | undefined;
    const fetchInterrupt = vi.fn(async (_url: string, init: RequestInit) => {
      interruptInit = init;
      return new Response(null, { status: 204 });
    });
    render(
      <CritiqueTheaterMount
        projectId="project-a"
        enabled
        workspaceContext={workspaceA}
        connectionFactory={factory}
        fetchInterrupt={fetchInterrupt}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-a',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));

    const headers = new Headers(interruptInit?.headers);
    expect(headers.get('x-od-workspace-id')).toBe('workspace-a');
    expect(headers.get('x-od-workspace-member-id')).toBe('member-a');
  });

  it('pins project A through a shell Workspace refresh instead of reconnecting as B or unbound', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    let releaseRefresh: (() => void) | null = null;
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/api/projects/project-a/workspace-scope')) {
        return new Response(null, { status: 404 });
      }
      reads += 1;
      if (reads > 1) {
        await new Promise<void>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      return Response.json({
        scope: {
          kind: 'team',
          projectId: 'project-a',
          workspaceId: 'workspace-a',
          context: workspaceA,
        },
      });
    }));
    const { factory, handles } = makeFactory();
    render(
      <CritiqueTheaterMount
        projectId="project-a"
        enabled
        callerWorkspaceContext={workspaceA}
        persistedProjectWorkspaceId="workspace-a"
        connectionFactory={factory}
      />,
    );

    await waitFor(() => {
      expect(handles).toHaveLength(1);
    });
    const firstScopeRead = vi.mocked(fetch).mock.calls[0]!;
    const firstScopeHeaders = new Headers(firstScopeRead[1]?.headers);
    expect(firstScopeHeaders.get('x-od-workspace-id')).toBe('workspace-a');
    expect(firstScopeHeaders.get('x-od-workspace-member-id')).toBe('member-a');
    expect(handles[0]!.workspaceContext?.workspaceId).toBe('workspace-a');

    // The navigation rail broadcasts this when the shell moves to B. The
    // project scope endpoint remains the only authority and is intentionally
    // held pending here to expose any headerless reconnect.
    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));
    });
    await waitFor(() => {
      expect(reads).toBeGreaterThan(1);
    });
    expect(handles).toHaveLength(1);
    expect(handles[0]!.closed).toBe(false);
    expect(handles[0]!.workspaceContext?.workspaceId).toBe('workspace-a');

    act(() => {
      releaseRefresh?.();
    });
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    expect(handles).toHaveLength(1);
  });

  it('leaves the UI in running phase when the daemon rejects the interrupt (Siri-Ray P1 on PR #1316)', async () => {
    // Previously a rejected fetch (network error OR 404 / 409 from
    // the daemon) still optimistically terminalized the run, which
    // meant a real later SSE event for the same run was ignored by
    // the sticky `interrupted` phase. The new flow only terminalizes
    // on a successful daemon ack; rejection clears interruptPending
    // so the user can retry and the live run keeps emitting SSE.
    const { factory, handles } = makeFactory();
    const fetchInterrupt = vi.fn(async () => {
      throw new Error('boom');
    });
    render(
      <TestCritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={fetchInterrupt}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-abc',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    // Wait for the rejected promise to resolve through the catch
    // handler. The button should clear back to enabled, and the
    // theater should NOT have terminalized.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Interrupt' }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    expect(screen.getByRole('region').getAttribute('data-phase')).toBe('running');
  });

  it('leaves the UI in running phase when the daemon returns a non-2xx response (Siri-Ray P1 on PR #1316)', async () => {
    // Same as the rejection case but for an HTTP failure: fetch
    // resolves with `ok: false` instead of throwing, and the old
    // flow swallowed that too. The new flow treats every non-2xx
    // as "do not terminalize".
    const { factory, handles } = makeFactory();
    const fetchInterrupt = vi.fn(
      async () => new Response(null, { status: 404 }),
    );
    render(
      <TestCritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={fetchInterrupt}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-abc',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Interrupt' }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    expect(screen.getByRole('region').getAttribute('data-phase')).toBe('running');
  });

  it('resets interruptPending when a fresh run starts after an interrupt (codex P2 on PR #1315)', async () => {
    // Previously `interruptPending` stayed true forever once clicked,
    // so a second run on the same mount would render the kill
    // button stuck in the "Interrupting…" state.
    const { factory, handles } = makeFactory();
    render(
      <TestCritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={vi.fn(async () => new Response(null, { status: 204 }))}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-1',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    // Daemon ack is async; wait for the collapsed surface to mount.
    await waitFor(() => {
      expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    });

    // Daemon emits a fresh run_started for the next rerun. The
    // collapsed badge should give way to a live stage with a fresh
    // Interrupt button that is NOT pending.
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-2',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
    });
    const btn = screen.getByRole('button', { name: 'Interrupt' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('synthesizes interrupted with the round paired to the composite (PerishCode P3 on PR #1315)', async () => {
    // Previously bestRoundOf returned the LAST round that had a composite,
    // and bestCompositeOf returned the MAX composite. With non-monotonic
    // composites (round 1 closes at 8.5, round 2 closes at 6.0) the two
    // helpers disagreed: the synthesized interrupted action shipped
    // bestRound: 2 paired with composite: 8.5 -- a pair that never
    // existed. Folded into a single bestRoundAndComposite helper so the
    // round and the score it advertises always refer to the same round.
    const { factory, handles } = makeFactory();
    render(
      <TestCritiqueTheaterMount
        projectId="proj-1"
        enabled
        connectionFactory={factory}
        fetchInterrupt={vi.fn(async () => new Response(null, { status: 204 }))}
      />,
    );
    act(() => {
      handles[0]!.send({
        type: 'run_started',
        runId: 'run-multi',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      });
      handles[0]!.send({
        type: 'round_end',
        runId: 'run-multi',
        round: 1,
        composite: 8.5,
        mustFix: 0,
        decision: 'continue',
        reason: 'borderline',
      });
      handles[0]!.send({
        type: 'round_end',
        runId: 'run-multi',
        round: 2,
        composite: 6.0,
        mustFix: 1,
        decision: 'continue',
        reason: 'regression',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    await waitFor(() => {
      expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    });
    // The collapsed surface should advertise round 1 / composite 8.5
    // (the round with the highest composite), not round 2 / 8.5
    // (the buggy split-helper pair that crosses two rounds).
    expect(screen.getByText(/Interrupted at round 1/)).toBeTruthy();
    expect(screen.queryByText(/Interrupted at round 2/)).toBeNull();
  });
});
