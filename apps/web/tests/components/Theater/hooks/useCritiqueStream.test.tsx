// @vitest-environment jsdom

/**
 * jsdom coverage for `useCritiqueStream` (Phase 7, Task 7.2). The reducer
 * itself is exercised under a node environment; this suite uses a tiny
 * harness so we can dispatch synthetic SSE events into the hook's lifecycle
 * (mount, project change, unmount) and assert the resulting state.
 */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useCritiqueStream } from '../../../../src/components/Theater/hooks/useCritiqueStream';
import type {
  CritiqueAction,
  CritiqueState,
} from '../../../../src/components/Theater/state/reducer';
import type {
  CritiqueEventsConnection,
  CritiqueEventsConnectionOptions,
} from '../../../../src/components/Theater/state/sse';

afterEach(() => {
  cleanup();
});

interface FactoryHandle {
  send: (action: CritiqueAction) => void;
  closed: boolean;
}

function makeFactory(): {
  factory: (
    projectId: string,
    onEvent: (action: CritiqueAction) => void,
    opts: CritiqueEventsConnectionOptions,
  ) => CritiqueEventsConnection;
  handles: FactoryHandle[];
} {
  const handles: FactoryHandle[] = [];
  const factory = (
    _projectId: string,
    onEvent: (action: CritiqueAction) => void,
    _opts: CritiqueEventsConnectionOptions,
  ): CritiqueEventsConnection => {
    const handle: FactoryHandle = {
      send: (action) => onEvent(action),
      closed: false,
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

interface Harness {
  state: CritiqueState;
}

function Probe({ projectId, enabled, factory, sink }: {
  projectId: string | null;
  enabled: boolean;
  factory: ReturnType<typeof makeFactory>['factory'];
  sink: Harness;
}) {
  const { state } = useCritiqueStream(projectId, enabled, { connectionFactory: factory });
  sink.state = state;
  return null;
}

describe('useCritiqueStream (Phase 7.2)', () => {
  it('returns idle state before any event lands', () => {
    const { factory } = makeFactory();
    const sink: Harness = { state: { phase: 'idle' } };
    render(<Probe projectId="proj-1" enabled factory={factory} sink={sink} />);
    expect(sink.state.phase).toBe('idle');
  });

  it('drives the reducer from synthetic SSE events through the factory', () => {
    const { factory, handles } = makeFactory();
    const sink: Harness = { state: { phase: 'idle' } };
    render(<Probe projectId="proj-1" enabled factory={factory} sink={sink} />);
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
    expect(sink.state.phase).toBe('running');
    if (sink.state.phase !== 'running') return;
    expect(sink.state.runId).toBe('r');

    act(() => {
      handles[0]!.send({
        type: 'panelist_must_fix',
        runId: 'r',
        round: 1,
        role: 'critic',
        text: 'low contrast',
      });
    });
    if (sink.state.phase !== 'running') return;
    expect(sink.state.rounds[0]?.panelists.critic?.mustFixes).toEqual(['low contrast']);
  });

  it('does NOT open a connection when enabled=false', () => {
    const { factory, handles } = makeFactory();
    const sink: Harness = { state: { phase: 'idle' } };
    render(<Probe projectId="proj-1" enabled={false} factory={factory} sink={sink} />);
    expect(handles).toHaveLength(0);
    expect(sink.state.phase).toBe('idle');
  });

  it('does NOT open a connection when projectId is null', () => {
    const { factory, handles } = makeFactory();
    const sink: Harness = { state: { phase: 'idle' } };
    render(<Probe projectId={null} enabled factory={factory} sink={sink} />);
    expect(handles).toHaveLength(0);
  });

  it('closes the connection on unmount', () => {
    const { factory, handles } = makeFactory();
    const sink: Harness = { state: { phase: 'idle' } };
    const { unmount } = render(
      <Probe projectId="proj-1" enabled factory={factory} sink={sink} />,
    );
    expect(handles).toHaveLength(1);
    expect(handles[0]!.closed).toBe(false);
    unmount();
    expect(handles[0]!.closed).toBe(true);
  });

  it('reopens the connection when projectId changes (closes prior, opens fresh)', () => {
    const { factory, handles } = makeFactory();
    const sink: Harness = { state: { phase: 'idle' } };
    const { rerender } = render(
      <Probe projectId="proj-1" enabled factory={factory} sink={sink} />,
    );
    expect(handles).toHaveLength(1);
    rerender(<Probe projectId="proj-2" enabled factory={factory} sink={sink} />);
    expect(handles).toHaveLength(2);
    expect(handles[0]!.closed).toBe(true);
    expect(handles[1]!.closed).toBe(false);
  });
});
