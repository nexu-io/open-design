// @vitest-environment jsdom

// Plan §3.Q1 / spec §21.5 — diff-review native UI on the
// GenUISurfaceRenderer.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenUISurfaceRenderer } from '../../src/components/GenUISurfaceRenderer';
import type { GenUISurfaceSpec } from '@open-design/contracts';

afterEach(() => cleanup());

const diffReviewSurface = (over: Partial<GenUISurfaceSpec> = {}): GenUISurfaceSpec => ({
  id:      '__auto_diff_review_review',
  kind:    'choice',
  persist: 'run',
  trigger: { stageId: 'review', atom: 'diff-review' },
  prompt:  'Review the diff and choose how to proceed.',
  schema: {
    type:       'object',
    properties: {
      decision:        { type: 'string', enum: ['accept', 'reject', 'partial'] },
      accepted_files:  { type: 'array', items: { type: 'string' } },
      rejected_files:  { type: 'array', items: { type: 'string' } },
      reason:          { type: 'string' },
    },
    required: ['decision'],
  },
  ...over,
});

describe('GenUISurfaceRenderer — diff-review choice surface', () => {
  it('Accept all submits a decision payload covering every touched file', async () => {
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: diffReviewSurface(),
          runId:   'run-1',
          context: { touchedFiles: ['Button.tsx', 'Button.css'] },
        }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-diff-accept'));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith({
      decision:        'accept',
      accepted_files:  ['Button.tsx', 'Button.css'],
      rejected_files:  [],
    }));
  });

  it('Reject all submits a decision payload covering every touched file', async () => {
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: diffReviewSurface(),
          runId:   'run-1',
          context: { touchedFiles: ['x.ts'] },
        }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-diff-reject'));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith({
      decision:        'reject',
      accepted_files:  [],
      rejected_files:  ['x.ts'],
    }));
  });

  it('Partial reveals per-file accept/reject toggles + submits the union', async () => {
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: diffReviewSurface(),
          runId:   'run-1',
          context: { touchedFiles: ['a.ts', 'b.ts'] },
        }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-diff-partial'));
    fireEvent.click(screen.getByTestId('genui-diff-file-accept-a.ts'));
    fireEvent.click(screen.getByTestId('genui-diff-file-reject-b.ts'));
    fireEvent.click(screen.getByTestId('genui-diff-partial-submit'));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith({
      decision:       'partial',
      accepted_files: ['a.ts'],
      rejected_files: ['b.ts'],
    }));
  });

  it('Partial submit refuses when a file is left undecided', async () => {
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: diffReviewSurface(),
          runId:   'run-1',
          context: { touchedFiles: ['a.ts', 'b.ts'] },
        }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-diff-partial'));
    fireEvent.click(screen.getByTestId('genui-diff-file-accept-a.ts'));
    fireEvent.click(screen.getByTestId('genui-diff-partial-submit'));
    // a.ts decided, b.ts left undecided → submit is blocked locally
    // and onAnswered is never called.
    await new Promise((r) => setTimeout(r, 10));
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it('disables Partial when no touched-file context is supplied', () => {
    render(
      <GenUISurfaceRenderer
        pending={{ surface: diffReviewSurface(), runId: 'run-1' }}
        onAnswered={vi.fn()}
      />,
    );
    expect((screen.getByTestId('genui-diff-partial') as HTMLButtonElement).disabled).toBe(true);
  });

  it('forwards the optional reason field on accept', async () => {
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: diffReviewSurface(),
          runId:   'run-1',
          context: { touchedFiles: ['x.ts'] },
        }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.change(screen.getByTestId('genui-diff-reason'), {
      target: { value: 'looks good' },
    });
    fireEvent.click(screen.getByTestId('genui-diff-accept'));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith({
      decision:       'accept',
      accepted_files: ['x.ts'],
      rejected_files: [],
      reason:         'looks good',
    }));
  });
});

describe('GenUISurfaceRenderer — generic single-enum choice', () => {
  it('renders one button per enum value and submits the picked value', async () => {
    const onAnswered = vi.fn();
    const surface: GenUISurfaceSpec = {
      id: 'direction',
      kind: 'choice',
      persist: 'run',
      prompt: 'Pick a direction.',
      schema: {
        type: 'object',
        properties: {
          choice: { type: 'string', enum: ['cool', 'warm', 'neutral'] },
        },
        required: ['choice'],
      },
    };
    render(
      <GenUISurfaceRenderer
        pending={{ surface, runId: 'run-1' }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-choice-warm'));
    await waitFor(() =>
      expect(onAnswered).toHaveBeenCalledWith({ choice: 'warm' }),
    );
  });
});
