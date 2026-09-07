// External-write detection for design-delivery finalization.
//
// A design run that mutated files only outside the project root used to end
// with the generic "finished without producing a deliverable project file"
// error even though its writes succeeded (and were listed in the turn's file
// summary). These tests cover the conservative mutation-path summary and the
// external_only finalization path, which keeps the persisted delivery state
// at no_result while surfacing an accurate detail message.
import { describe, expect, it } from 'vitest';
import {
  applyDesignDeliveryOutcome,
  designDeliveryFailureDetail,
  summarizeMutationPaths,
} from '../../src/components/ProjectView';
import { resolveDesignDeliveryOutcome } from '../../src/runtime/design-delivery';
import type { ChatMessage } from '../../src/types';

const ROOT = 'C:/work/site';

const writeEvent = (id: string, filePath: string) => ({
  kind: 'tool_use' as const,
  id,
  name: 'Write',
  input: { file_path: filePath },
});

const okResult = (toolUseId: string) => ({
  kind: 'tool_result' as const,
  toolUseId,
  content: 'ok',
  isError: false,
});

const errorResult = (toolUseId: string) => ({
  kind: 'tool_result' as const,
  toolUseId,
  content: 'permission denied',
  isError: true,
});

describe('summarizeMutationPaths', () => {
  it('counts an absolute write that provably lands outside the project root', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'C:\\Users\\alice\\Desktop\\notes.md'), okResult('w-1')],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 1 });
  });

  it('counts a write inside the project root as internal', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'C:/work/site/index.html'), okResult('w-1')],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 0 });
  });

  it('counts a relative-path edit as internal', () => {
    expect(
      summarizeMutationPaths(
        [
          { kind: 'tool_use' as const, id: 'e-1', name: 'Edit', input: { file_path: 'index.html' } },
          okResult('e-1'),
        ],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 0 });
  });

  it('counts a simple Bash rm of an external file as external', () => {
    expect(
      summarizeMutationPaths(
        [
          {
            kind: 'tool_use' as const,
            id: 'b-1',
            name: 'Bash',
            input: { command: 'rm C:/tmp/stale.html' },
          },
          okResult('b-1'),
        ],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 1 });
  });

  it('trusts a managed-project alias path regardless of the resolved root', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', '/data/projects/proj-1/page.html'), okResult('w-1')],
        'proj-1',
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 0 });
  });

  it('stays conservative when no project root is known', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'C:\\Users\\alice\\Desktop\\notes.md'), okResult('w-1')],
        undefined,
        null,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 0 });
  });

  it('counts a `..` escape that lexically resolves outside the root as external', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'C:/work/site/../escape.md'), okResult('w-1')],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 1 });
  });

  it('ignores reads of external paths', () => {
    expect(
      summarizeMutationPaths(
        [
          {
            kind: 'tool_use' as const,
            id: 'r-1',
            name: 'Read',
            input: { file_path: 'C:/Users/alice/Desktop/notes.md' },
          },
          okResult('r-1'),
        ],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 0, externalMutationPathCount: 0 });
  });

  it('excludes an errored external write entirely — a rejected write is not evidence', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'C:\\Users\\alice\\Desktop\\notes.md'), errorResult('w-1')],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 0, externalMutationPathCount: 0 });
  });

  it('excludes a mutation whose result never arrived', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'C:\\Users\\alice\\Desktop\\notes.md')],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 0, externalMutationPathCount: 0 });
  });

  it('summarizes mixed internal and external writes without conflating them', () => {
    expect(
      summarizeMutationPaths(
        [
          writeEvent('w-1', 'C:/work/site/index.html'),
          okResult('w-1'),
          writeEvent('w-2', 'C:\\Users\\alice\\Desktop\\notes.md'),
          okResult('w-2'),
        ],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 2, externalMutationPathCount: 1 });
  });

  it('classifies a mutation of the project root itself as internal', () => {
    expect(
      summarizeMutationPaths(
        [
          { kind: 'tool_use' as const, id: 'd-1', name: 'Delete', input: { path: 'C:/work/site' } },
          okResult('d-1'),
        ],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 0 });
  });

  it('treats Windows drive paths as case-insensitive against the root', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', 'c:/Work/Site/index.html'), okResult('w-1')],
        undefined,
        ROOT,
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 0 });
  });

  it('keeps POSIX paths case-sensitive', () => {
    expect(
      summarizeMutationPaths(
        [writeEvent('w-1', '/SRV/site/index.html'), okResult('w-1')],
        undefined,
        '/srv/site',
      ),
    ).toEqual({ mutationPathCount: 1, externalMutationPathCount: 1 });
  });
});

describe('applyDesignDeliveryOutcome — external_only finalization', () => {
  it('persists external_only as no_result with the external-only detail', () => {
    const message: ChatMessage = {
      id: 'm-1',
      role: 'assistant',
      content: 'I saved the files to your desktop.',
      events: [],
    };
    const finalized = applyDesignDeliveryOutcome(message, 'external_only');
    expect(finalized.resultDeliveryState).toBe('no_result');
    expect(finalized.resumable).toBe(false);
    const last = finalized.events?.[finalized.events.length - 1];
    expect(last).toMatchObject({
      kind: 'status',
      label: 'error',
      detail:
        'The run changed files only outside the project folder, so nothing was delivered to the project. Design runs track results as project files - use Chat mode for tasks that are not meant to produce one.',
    });
  });
});

describe('designDeliveryFailureDetail', () => {
  it('prefers the persistence error for delivery_failed', () => {
    expect(designDeliveryFailureDetail('delivery_failed', 'disk full')).toBe('disk full');
    expect(designDeliveryFailureDetail('delivery_failed')).toBe(
      'The design result was generated, but OpenDesign could not save it to the project.',
    );
  });

  it('returns the external-only detail for external_only', () => {
    expect(designDeliveryFailureDetail('external_only')).toBe(
      'The run changed files only outside the project folder, so nothing was delivered to the project. Design runs track results as project files - use Chat mode for tasks that are not meant to produce one.',
    );
  });

  it('stays accurate for a delete-only external turn — the copy says changed, not wrote', () => {
    const events = [
      {
        kind: 'tool_use' as const,
        id: 'b-1',
        name: 'Bash',
        input: { command: 'rm C:/tmp/stale.html' },
      },
      okResult('b-1'),
    ];
    const summary = summarizeMutationPaths(events, undefined, ROOT);
    expect(summary).toEqual({ mutationPathCount: 1, externalMutationPathCount: 1 });
    const outcome = resolveDesignDeliveryOutcome({
      sessionMode: 'design',
      runStatus: 'succeeded',
      content: 'Removed the stale file from C:/tmp.',
      events,
      producedFileCount: 0,
      traceObjectFileCount: 0,
      ...summary,
    });
    expect(outcome).toBe('external_only');
    expect(designDeliveryFailureDetail(outcome)).toBe(
      'The run changed files only outside the project folder, so nothing was delivered to the project. Design runs track results as project files - use Chat mode for tasks that are not meant to produce one.',
    );
  });

  it('falls back to the missing-deliverable detail otherwise', () => {
    expect(designDeliveryFailureDetail('no_result')).toBe(
      'The design run finished without producing a deliverable project file.',
    );
  });
});
