import { describe, expect, it } from 'vitest';
import {
  designDeliveryVerificationPending,
  resolveDesignDeliveryOutcome,
} from '../../src/runtime/design-delivery';

describe('resolveDesignDeliveryOutcome', () => {
  it('requires file delivery for a successfully completed Design-mode turn', () => {
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'I finished the design.',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('no_result');
  });

  it('accepts newly produced or successfully modified project files as delivery evidence', () => {
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '',
        events: [],
        producedFileCount: 1,
        traceObjectFileCount: 0,
      }),
    ).toBe('delivered');
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 1,
      }),
    ).toBe('delivered');
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
        persistenceSucceeded: true,
      }),
    ).toBe('delivered');
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '',
        events: [
          {
            kind: 'live_artifact',
            action: 'created',
            projectId: 'project-1',
            artifactId: 'artifact-1',
            title: 'Dashboard',
          },
        ],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('delivered');
  });

  it('distinguishes a failed artifact save from a run that produced no result', () => {
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '<artifact type="text/html">broken</artifact>',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
        persistenceFailed: true,
      }),
    ).toBe('delivery_failed');
  });

  it('does not fail clarification turns or turns with explicitly unfinished work', () => {
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '<question-form id="brief">{"questions":[]}</question-form>',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('awaiting_input');
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '',
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                { id: 'step-1', content: 'Build the page', status: 'in_progress' },
                { id: 'step-2', content: 'Verify the preview', status: 'pending' },
              ],
            },
          },
        ],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('awaiting_input');
  });

  it('does not impose artifact delivery on Chat/Plan or already-failed runs', () => {
    for (const sessionMode of ['chat', 'plan'] as const) {
      expect(
        resolveDesignDeliveryOutcome({
          sessionMode,
          runStatus: 'succeeded',
          content: 'Text-only response',
          events: [],
          producedFileCount: 0,
          traceObjectFileCount: 0,
        }),
      ).toBe('not_required');
    }
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'failed',
        content: '',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('not_required');
  });

  it('holds completion feedback until Design-mode file verification settles', () => {
    expect(
      designDeliveryVerificationPending({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Done.',
        events: [],
      }),
    ).toBe(true);
    expect(
      designDeliveryVerificationPending({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Done.',
        events: [],
        producedFiles: [],
        traceObjectFiles: [],
      }),
    ).toBe(false);
    expect(
      designDeliveryVerificationPending({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '<question-form id="brief">{"questions":[]}</question-form>',
        events: [],
      }),
    ).toBe(false);
  });
});
