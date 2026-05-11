// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CritiqueTheaterMount } from '../../../src/components/Theater/CritiqueTheaterMount';
import type { CritiqueAction } from '../../../src/components/Theater/state/reducer';

afterEach(() => cleanup());

interface FactoryHandle {
  send: (action: CritiqueAction) => void;
  closed: boolean;
}

function makeFactory() {
  const handles: FactoryHandle[] = [];
  const factory = (
    _projectId: string,
    onEvent: (action: CritiqueAction) => void,
  ) => {
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

describe('<CritiqueTheaterMount> (Phase 9.1)', () => {
  it('renders nothing when disabled even if a runs starts later', () => {
    const { factory } = makeFactory();
    const { container } = render(
      <CritiqueTheaterMount projectId="p-1" enabled={false} connectionFactory={factory} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while idle, then mounts the stage on run_started', () => {
    const { factory, handles } = makeFactory();
    const { container } = render(
      <CritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />,
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

  it('flips the kill button to pending and synthesizes interrupted on click', () => {
    const { factory, handles } = makeFactory();
    render(<CritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />);
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

    // Phase flips to interrupted -> collapsed surface mounts in place
    // of the live stage.
    expect(screen.getByRole('status').getAttribute('data-phase')).toBe('interrupted');
    expect(screen.getByText('Interrupted')).toBeTruthy();
  });

  it('tears down the connection when enabled flips to false', () => {
    const { factory, handles } = makeFactory();
    const { rerender } = render(
      <CritiqueTheaterMount projectId="p-1" enabled connectionFactory={factory} />,
    );
    expect(handles).toHaveLength(1);
    expect(handles[0]!.closed).toBe(false);

    rerender(
      <CritiqueTheaterMount projectId="p-1" enabled={false} connectionFactory={factory} />,
    );
    expect(handles[0]!.closed).toBe(true);
  });
});
