import { describe, expect, it } from 'vitest';

import {
  decideDeliverableSyntaxRepair,
  renderDeliverableSyntaxRepairPrompt,
} from '../../src/artifacts/deliverable-syntax-repair.js';

const repairable = (candidateHash: string) => ({
  status: 'repairable' as const,
  checker: 'web-syntax@1' as const,
  candidateHash,
  checkedFiles: ['index.html'],
  diagnostics: [{
    code: 'JS_UNTERMINATED_STRING_CONSTANT',
    file: 'index.html',
    line: 12,
    column: 8,
    message: 'Unterminated string constant.',
    source: 'inline_script' as const,
  }],
});

describe('deliverable syntax repair policy', () => {
  it('passes immediately without consuming the retry budget', () => {
    expect(decideDeliverableSyntaxRepair({
      result: {
        status: 'pass',
        checker: 'web-syntax@1',
        candidateHash: 'valid',
        checkedFiles: ['index.html'],
        diagnostics: [],
      },
      previous: undefined,
      maxAttempts: 3,
    })).toEqual({ action: 'accept', next: undefined });
  });

  it('skips non-Web deliverables and incomplete checks without retrying', () => {
    expect(decideDeliverableSyntaxRepair({
      result: {
        status: 'skipped',
        checker: 'web-syntax@1',
        reason: 'non_web_deliverable',
        candidateHash: null,
        checkedFiles: [],
        diagnostics: [],
      },
      previous: undefined,
      maxAttempts: 3,
    }).action).toBe('accept');

    expect(decideDeliverableSyntaxRepair({
      result: {
        status: 'incomplete',
        checker: 'web-syntax@1',
        reason: 'file_unreadable',
        candidateHash: 'incomplete',
        checkedFiles: [],
        diagnostics: [],
      },
      previous: undefined,
      maxAttempts: 3,
    }).action).toBe('accept');
  });

  it('retries only after a confirmed syntax error and stops after a later pass', () => {
    const first = decideDeliverableSyntaxRepair({
      result: repairable('candidate-1'),
      previous: undefined,
      maxAttempts: 3,
    });
    expect(first).toMatchObject({ action: 'retry', next: { attempt: 1, maxAttempts: 3 } });

    expect(decideDeliverableSyntaxRepair({
      result: {
        status: 'pass',
        checker: 'web-syntax@1',
        candidateHash: 'candidate-2',
        checkedFiles: ['index.html'],
        diagnostics: [],
      },
      previous: first.next,
      maxAttempts: 3,
    })).toEqual({ action: 'accept', next: first.next });
  });

  it('allows at most three repair attempts', () => {
    let previous;
    for (const [index, hash] of ['a', 'b', 'c'].entries()) {
      const decision = decideDeliverableSyntaxRepair({
        result: repairable(hash),
        previous,
        maxAttempts: 3,
      });
      expect(decision).toMatchObject({
        action: 'retry',
        next: { attempt: index + 1, maxAttempts: 3 },
      });
      previous = decision.next;
    }

    expect(decideDeliverableSyntaxRepair({
      result: repairable('d'),
      previous,
      maxAttempts: 3,
    })).toMatchObject({ action: 'block', reason: 'attempt_limit_reached' });
  });

  it('blocks early when the failed candidate did not change', () => {
    const first = decideDeliverableSyntaxRepair({
      result: repairable('same'),
      previous: undefined,
      maxAttempts: 3,
    });
    expect(decideDeliverableSyntaxRepair({
      result: repairable('same'),
      previous: first.next,
      maxAttempts: 3,
    })).toMatchObject({ action: 'block', reason: 'no_progress' });
  });

  it('renders a narrow repair prompt with the diagnostic and bounded attempt', () => {
    const prompt = renderDeliverableSyntaxRepairPrompt({
      result: repairable('candidate-1'),
      attempt: 2,
      maxAttempts: 3,
    });
    expect(prompt).toContain('attempt="2"');
    expect(prompt).toContain('max_attempts="3"');
    expect(prompt).toContain('index.html:12:8');
    expect(prompt).toContain('Unterminated string constant.');
    expect(prompt).toContain('Do not redesign');
    expect(prompt).toContain('Do not perform a self-review');
    expect(prompt).toContain('node --check');
    expect(prompt).toContain('wrapper exactly once');
    expect(prompt).toContain('stop immediately');
  });
});
