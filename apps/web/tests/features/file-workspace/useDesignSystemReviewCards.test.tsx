// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDesignSystemReviewCards } from '../../../src/features/file-workspace/hooks/useDesignSystemReviewCards.hooks';

describe('useDesignSystemReviewCards', () => {
  it('seeds reviewDecisions from the designSystemReview prop', () => {
    // Hoisted outside the renderHook callback: the hook's sync effect depends
    // on `designSystemReview` by reference and calls a setter, so a fresh
    // object literal recreated inside the callback on every render would
    // never satisfy Object.is and the effect would loop forever.
    const designSystemReview = { Colors: { decision: 'looks-good' as const, updatedAt: '2024-01-01' } };
    const { result } = renderHook(() =>
      useDesignSystemReviewCards({ editable: true, designSystemReview }),
    );
    expect(result.current.reviewDecisions).toEqual({ Colors: 'looks-good' });
  });

  it('markSectionReview records the decision and calls onReviewDecision', () => {
    const onReviewDecision = vi.fn();
    const { result } = renderHook(() =>
      useDesignSystemReviewCards({ editable: true, onReviewDecision }),
    );
    act(() => result.current.markSectionReview('Colors', 'looks-good'));
    expect(result.current.reviewDecisions.Colors).toBe('looks-good');
    expect(onReviewDecision).toHaveBeenCalledWith('Colors', 'looks-good', undefined);
  });

  it('toggleSection flips the expanded flag for that key', () => {
    const { result } = renderHook(() => useDesignSystemReviewCards({ editable: true }));
    act(() => result.current.toggleSection('Colors'));
    expect(result.current.expandedSections.Colors).toBe(true);
    act(() => result.current.toggleSection('Colors'));
    expect(result.current.expandedSections.Colors).toBe(false);
  });

  it('openNeedsWorkFeedback is a no-op when not editable', () => {
    const { result } = renderHook(() => useDesignSystemReviewCards({ editable: false }));
    act(() => result.current.openNeedsWorkFeedback('Colors', 'inst1'));
    expect(result.current.feedbackSection).toBeNull();
  });

  it('openNeedsWorkFeedback marks needs-work, expands the section, and opens the popover', () => {
    const { result } = renderHook(() => useDesignSystemReviewCards({ editable: true }));
    act(() => result.current.openNeedsWorkFeedback('Colors', 'inst1'));
    expect(result.current.reviewDecisions.Colors).toBe('needs-work');
    expect(result.current.expandedSections.inst1).toBe(true);
    expect(result.current.feedbackSection).toBe('Colors');
  });

  it('cancelNeedsWorkFeedback clears the popover state', () => {
    const { result } = renderHook(() => useDesignSystemReviewCards({ editable: true }));
    act(() => result.current.openNeedsWorkFeedback('Colors', 'inst1'));
    act(() => result.current.setFeedbackText('needs a fix'));
    act(() => result.current.cancelNeedsWorkFeedback());
    expect(result.current.feedbackSection).toBeNull();
    expect(result.current.feedbackText).toBe('');
  });

  it('submitNeedsWorkFeedback is a no-op with blank feedback', () => {
    const onNeedsWork = vi.fn();
    const { result } = renderHook(() => useDesignSystemReviewCards({ editable: true, onNeedsWork }));
    act(() => result.current.submitNeedsWorkFeedback('Colors', ['a.css']));
    expect(onNeedsWork).not.toHaveBeenCalled();
  });

  it('submitNeedsWorkFeedback forwards trimmed feedback and records the decision', () => {
    const onNeedsWork = vi.fn(() => undefined);
    const { result } = renderHook(() => useDesignSystemReviewCards({ editable: true, onNeedsWork }));
    act(() => result.current.setFeedbackText('  fix the contrast  '));
    act(() => result.current.submitNeedsWorkFeedback('Colors', ['a.css']));
    expect(onNeedsWork).toHaveBeenCalledWith('Colors', 'fix the contrast', ['a.css']);
    expect(result.current.reviewDecisions.Colors).toBe('needs-work');
    expect(result.current.feedbackSection).toBeNull();
  });
});
