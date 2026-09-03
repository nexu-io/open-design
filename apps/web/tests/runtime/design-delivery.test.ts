import { describe, expect, it } from 'vitest';
import {
  designDeliveryReconciliationStale,
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

  it('requires file delivery once the turn attempted to write project files', () => {
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
          events: [attempt],
          producedFileCount: 0,
          traceObjectFileCount: 0,
          // Snapshot could not confirm any deletion — the attempt was
          // a Write/Edit (no in-tree file left to verify) or a Bash whose
          // targets weren't tracked. Without confirmation, the run stays a
          // `no_result` so the user can retry instead of seeing a phantom
          // success card (#7744).
          confirmedDeletions: 0,
        }),
      ).toBe('no_result');
    }
  });

  // #7744 — a Bash `rm` of an existing project file. The file snapshot
  // proves the deletion landed (the path was listed pre-turn and is missing
  // post-turn), so the run should be `delivered`, not `no_result`.
  it('treats a snapshot-confirmed Bash deletion as delivered', () => {
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Removed two stale scaffolding files.',
        events: [
          {
            kind: 'tool_use',
            id: 'b-1',
            name: 'Bash',
            input: {
              command:
                'rm -f scripts/sketch-i2i.py tests/texture/prompt-fox-refs.txt',
            },
          },
        ],
        producedFileCount: 0,
        traceObjectFileCount: 0,
        confirmedDeletions: 2,
      }),
    ).toBe('delivered');
  });

  it('does not treat unconfirmed mutation attempts as delivered', () => {
    // A Bash `rm` whose targets the project file snapshot cannot confirm
    // (e.g. outside the project root, or already absent pre-turn) must not
    // silently become a delivery. The run stays `no_result` so the user
    // can retry, and the call site can inspect the snapshot diff to surface
    // a better error if the agent actually accomplished its task.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Tried to clean up.',
        events: [
          { kind: 'tool_use', id: 'b-1', name: 'Bash', input: { command: 'rm /tmp/outside.js' } },
        ],
        producedFileCount: 0,
        traceObjectFileCount: 0,
        confirmedDeletions: 0,
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
        artifactCount: 1,
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

  it('does not latch a no-clarification turn to awaiting_input on a stray open tag', () => {
    // Production repro: an OD Next strategy turn that needed no clarification
    // narrated its decision into an open <question-form> tag. The tail is
    // prose, so no form was ever asked — the turn must be judged on its
    // deliverables, not parked as awaiting input.
    const content =
      '策略判断信息充足，将直接进入生产。\n\n<question-form> 无需提出';
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content,
        events: [],
        producedFileCount: 2,
        traceObjectFileCount: 0,
      }),
    ).toBe('delivered');
    // Same tag, same absence of a real ask: a zero-file report turn is
    // report_only, not awaiting_input.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content,
        events: [],
        producedFileCount: 0,
        traceObjectFileCount: 0,
      }),
    ).toBe('report_only');
    expect(
      designDeliveryVerificationPending({
        sessionMode: 'design',
        runStatus: 'succeeded',
        resultDeliveryState: undefined,
        content,
        events: [],
        producedFiles: undefined,
        traceObjectFiles: undefined,
      }),
    ).toBe(true);
  });

  it('still treats a mid-stream question-form body as awaiting input', () => {
    // A truncated but still-plausible JSON body is a real ask that simply has
    // not finished streaming — it must keep its awaiting_input classification.
    expect(
      resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Quick brief first.\n<question-form id="brief">{"questions":[',
        events: [],
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

describe('designDeliveryReconciliationStale', () => {
  const now = 1_000_000;

  it('treats a run that finished long ago as stale (no more auto-replay)', () => {
    expect(
      designDeliveryReconciliationStale(
        {
          sessionMode: 'design',
          runStatus: 'succeeded',
          endedAt: now - 24 * 60 * 60 * 1000,
        },
        now,
      ),
    ).toBe(true);
  });

  it('keeps a freshly completed run reconcilable', () => {
    expect(
      designDeliveryReconciliationStale(
        {
          sessionMode: 'design',
          runStatus: 'succeeded',
          endedAt: now - 30_000,
        },
        now,
      ),
    ).toBe(false);
  });

  it('does not mark a row with no timestamp at all as stale', () => {
    expect(
      designDeliveryReconciliationStale(
        { sessionMode: 'design', runStatus: 'succeeded' },
        now,
      ),
    ).toBe(false);
  });

  it('treats a legacy row without endedAt as stale when its start time is old', () => {
    // #6505 rows persisted before `endedAt` existed carry only `startedAt`;
    // the age bound falls back to it so reloads stop auto-replaying.
    expect(
      designDeliveryReconciliationStale(
        { sessionMode: 'design', runStatus: 'succeeded', startedAt: now - 24 * 60 * 60 * 1000 },
        now,
      ),
    ).toBe(true);
  });

  it('ignores already-resolved deliveries and non-design/non-succeeded rows', () => {
    expect(
      designDeliveryReconciliationStale(
        { sessionMode: 'design', runStatus: 'succeeded', resultDeliveryState: 'delivered', endedAt: 1 },
        now,
      ),
    ).toBe(false);
    expect(
      designDeliveryReconciliationStale(
        { sessionMode: 'chat', runStatus: 'succeeded', endedAt: 1 },
        now,
      ),
    ).toBe(false);
    expect(
      designDeliveryReconciliationStale(
        { sessionMode: 'design', runStatus: 'failed', endedAt: 1 },
        now,
      ),
    ).toBe(false);
  });
});
