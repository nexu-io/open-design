import { describe, expect, it } from 'vitest';
import {
  designDeliveryVerificationPending,
  resolveDesignDeliveryOutcome,
} from '../../src/runtime/design-delivery';

describe('resolveDesignDeliveryOutcome', () => {
  it('treats a text answer without any file-write attempt as a report-only result', () => {
    // Image analysis / report-only audits legitimately end with prose and no
    // new project file (#5714, #5718). Only fail delivery when the agent
    // actually attempted to write files and nothing landed.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'The hero image uses low contrast; increase it for readability.',
        events: [
          { kind: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: 'hero.png' } },
        ],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('report_only');
    // BYOK API runs have no tool events at all; a substantive text answer is
    // still a report-only result, not a missing artifact.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'I finished the design.',
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('report_only');
  });

  it('treats a successful edit-only turn as delivered even without new project files (#5753)', () => {
    // When the agent edits (or deletes) an existing project file in design
    // mode and the run succeeds, the file mutation itself is the delivery.
    // Requiring a *new* project file here surfaces the false-negative
    // "without producing a deliverable project file" toast when the user is
    // already looking at the freshly edited file in the preview pane.
    //
    // #5776 (PerishCode review): the mutation must have a non-error
    // tool_result — a failed write/edit/delete must NOT be delivered.
    for (const attempt of [
      { kind: 'tool_use' as const, id: 'w-1', name: 'Write', input: { file_path: 'index.html' } },
      { kind: 'tool_use' as const, id: 'e-1', name: 'Edit', input: { file_path: 'index.html' } },
      { kind: 'tool_use' as const, id: 'b-1', name: 'Bash', input: { command: 'rm stale.html' } },
    ]) {
      expect(
        resolveDesignDeliveryOutcome({
          sessionMode: 'design',
          runStatus: 'succeeded',
          content: 'I finished the design.',
          events: [
            attempt,
            { kind: 'tool_result', toolUseId: attempt.id, isError: false, content: 'Wrote index.html' },
          ],
          producedFileCount: 0,
          traceObjectFileCount: 0,
        }),
      ).toBe('delivered');
    }
  });

  it('treats a failed mutation turn as no_result, not delivered (#5776)', () => {
    // PerishCode review: a turn that attempted to mutate files but every
    // attempt errored must NOT be flipped to delivered by hasFileMutationToolUse.
    // It must fall through to no_result, surfacing a retry affordance.
    for (const attempt of [
      { kind: 'tool_use' as const, id: 'w-2', name: 'Write', input: { file_path: 'index.html' } },
      { kind: 'tool_use' as const, id: 'e-2', name: 'Edit', input: { file_path: 'index.html' } },
      { kind: 'tool_use' as const, id: 'b-2', name: 'Bash', input: { command: 'rm stale.html' } },
    ]) {
      // With substantive text + a failed mutation → no_result (matcher is
      // allMutationsFailed AND content; the report_only branch is intentionally
      // skipped because an attempted-and-failed mutation is not the same as
      // never trying — the user owes the agent a retry, not a pass).
      expect(
        resolveDesignDeliveryOutcome({
          sessionMode: 'design',
          runStatus: 'succeeded',
          content: 'I tried but the tool errored.',
          events: [
            attempt,
            { kind: 'tool_result', toolUseId: attempt.id, isError: true, content: 'Edit failed: no match' },
          ],
          producedFileCount: 0,
          traceObjectFileCount: 0,
        }),
      ).toBe('no_result');
    }
  });

  it('treats a mutation attempt with no tool_result yet as no_result (still running)', () => {
    // While the tool call is in flight (no tool_result paired), deriveFileOps
    // marks it "running" — neither a successful mutation nor a confirmed
    // failure. The turn should not flip to delivered prematurely.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '',
        events: [
          { kind: 'tool_use', id: 'w-3', name: 'Write', input: { file_path: 'index.html' } },
        ],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('no_result');
  });

  it('does not accept an empty answer as a report-only result', () => {
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: '   ',
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

  it('keeps a failed artifact save a failure even without file-write tool calls', () => {
    // A BYOK <artifact> block that failed to persist is a delivery failure;
    // the report-only escape must never mask it.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Here is the landing page you asked for.',
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
