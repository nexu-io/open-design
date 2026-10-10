// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeliverableQualityCard } from '../../../src/components/chat/DeliverableQualityCard';
import type { ChatMessage } from '../../../src/types';

afterEach(cleanup);
const quality: NonNullable<ChatMessage['deliverableQuality']> = {
  schema: 'open-design.deliverable-quality/v1', checker: 'prototype-interaction@1',
  status: 'pass', candidateHash: 'a'.repeat(64), entryFile: 'index.html',
  checkedAt: 1, durationMs: 20, coverage: { expected: 2, checked: 2, complete: true },
  checks: [{ id: 'syntax', kind: 'syntax', status: 'pass' }, { id: 'navigation-meds', kind: 'navigation', status: 'pass', control: '药品' }],
};

describe('candidate quality feedback', () => {
  it('shows confirmed delivery only from complete evidence, with its scope', () => {
    render(<DeliverableQualityCard quality={quality} runStatus="succeeded" />);
    expect(screen.getByTestId('deliverable-quality').dataset.qualityStatus).toBe('pass');
    expect(screen.getByText(/syntax, static events and applicable main interactions/i)).toBeTruthy();
    expect(screen.getByText(/2 \/ 2/)).toBeTruthy();
  });
  it('keeps explicit faults visible despite process success', () => {
    render(<DeliverableQualityCard runStatus="succeeded" quality={{ ...quality, status: 'fail',
      checks: [{ id: 'nav', kind: 'navigation', status: 'fail', control: '药品', reason: 'target content did not change' }],
    }} />);
    expect(screen.getByTestId('deliverable-quality').dataset.qualityStatus).toBe('fail');
    expect(screen.getByText(/target content did not change/)).toBeTruthy();
  });
  it.each([
    ['unknown', undefined, 'succeeded'],
    ['unknown', { ...quality, checker: 'future-checker@2' }, 'succeeded'],
    ['unknown', { ...quality, checks: null }, 'succeeded'],
    ['unknown', { ...quality, coverage: null }, 'succeeded'],
    ['unknown', { ...quality, coverage: { expected: 1, checked: 2, complete: true } }, 'succeeded'],
    ['incomplete', { ...quality, coverage: { expected: 2, checked: 1, complete: false } }, 'succeeded'],
    ['not_applicable', { ...quality, status: 'not_applicable' }, 'succeeded'],
    ['checking', quality, 'running'],
    ['incomplete', { ...quality, candidateHash: '' }, 'succeeded'],
    ['incomplete', { ...quality, checks: [{ id: 'syntax', kind: 'syntax', status: 'pass' }] }, 'succeeded'],
    ['fail', { ...quality, checks: [{ id: 'syntax', kind: 'syntax', status: 'fail' }] }, 'succeeded'],
  ] as const)('shows %s without inventing delivery confirmation', (expected, evidence, runStatus) => {
    render(<DeliverableQualityCard quality={evidence as ChatMessage['deliverableQuality']} runStatus={runStatus} />);
    expect(screen.getByTestId('deliverable-quality').dataset.qualityStatus).toBe(expected);
    expect(screen.queryByText(/Delivery confirmed:/)).toBeNull();
  });
});
