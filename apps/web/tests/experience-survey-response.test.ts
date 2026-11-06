// The experience survey is api-mode: PostHog stores the responses but never
// sees the UI, so nothing on the PostHog side validates that the client sent
// the right question ids. A wrong or stale id does not error — it silently
// files answers under a question nobody is reading, and the loss is only
// visible weeks later when the analysis comes up empty. These tests pin the
// wire shape.
import { describe, expect, it, vi } from 'vitest';

import {
  trackExperienceSurveyDismissed,
  trackExperienceSurveySent,
  trackExperienceSurveyShown,
} from '../src/analytics/events';
import {
  EXPERIENCE_SURVEY_ID,
  EXPERIENCE_SURVEY_IMPROVEMENT_CHOICES,
  EXPERIENCE_SURVEY_QUESTION_IDS,
  EXPERIENCE_SURVEY_TRIGGER,
} from '../src/analytics/experience-survey-contract';

const ids = EXPERIENCE_SURVEY_QUESTION_IDS;

function capture() {
  const track = vi.fn();
  return {
    track,
    event: () => track.mock.calls[0]?.[0] as string,
    props: () => track.mock.calls[0]?.[1] as Record<string, unknown>,
  };
}

describe('experience survey response reporting', () => {
  it('sends both answers under their own question ids', () => {
    const t = capture();
    trackExperienceSurveySent(t.track, { recommendation: 9, improvement: 0 });

    expect(t.event()).toBe('survey sent');
    expect(t.props()).toMatchObject({
      $survey_id: EXPERIENCE_SURVEY_ID,
      [`$survey_response_${ids.recommendation}`]: 9,
      [`$survey_response_${ids.improvement}`]: EXPERIENCE_SURVEY_IMPROVEMENT_CHOICES[0],
    });
  });

  it('reports the improvement choice as its canonical English label', () => {
    // The card renders a localized label; sending that would split one answer
    // into nineteen buckets, one per locale.
    const t = capture();
    trackExperienceSurveySent(t.track, { recommendation: 3, improvement: 4 });

    expect(t.props()[`$survey_response_${ids.improvement}`]).toBe('Gets stuck or fails');
  });

  it('omits a skipped follow-up instead of sending null', () => {
    // The follow-up's response count has to stay honest about how many people
    // actually answered it.
    const t = capture();
    trackExperienceSurveySent(t.track, { recommendation: 8 });

    const props = t.props();
    expect(props[`$survey_response_${ids.recommendation}`]).toBe(8);
    expect(props).not.toHaveProperty(`$survey_response_${ids.improvement}`);
    expect(props.$survey_questions).toHaveLength(1);
  });

  it('carries the question text so the event is readable without a join', () => {
    const t = capture();
    trackExperienceSurveySent(t.track, { recommendation: 10 });

    expect(t.props().$survey_questions).toEqual([
      { id: ids.recommendation, question: expect.stringContaining('recommend'), response: 10 },
    ]);
  });

  it('reports a zero score rather than treating it as unanswered', () => {
    // 0 on the 0–10 scale is a detractor, the most valuable answer we get, and
    // the one a falsy check would silently drop.
    const t = capture();
    trackExperienceSurveySent(t.track, { recommendation: 0, improvement: 0 });

    const props = t.props();
    expect(props[`$survey_response_${ids.recommendation}`]).toBe(0);
    expect(props[`$survey_response_${ids.improvement}`]).toBe(
      EXPERIENCE_SURVEY_IMPROVEMENT_CHOICES[0],
    );
    expect(props.$survey_questions).toHaveLength(2);
  });

  it('uses the reserved event names PostHog survey analytics reads', () => {
    const shown = capture();
    trackExperienceSurveyShown(shown.track);
    expect(shown.event()).toBe('survey shown');
    expect(shown.props()).toEqual({
      $survey_id: EXPERIENCE_SURVEY_ID,
      trigger: EXPERIENCE_SURVEY_TRIGGER,
    });

    const dismissed = capture();
    trackExperienceSurveyDismissed(dismissed.track);
    expect(dismissed.event()).toBe('survey dismissed');
    expect(dismissed.props()).toEqual({
      $survey_id: EXPERIENCE_SURVEY_ID,
      trigger: EXPERIENCE_SURVEY_TRIGGER,
    });
  });

  // The trigger moved from a successful export to a delivered artifact. Every
  // response carries which regime produced it, so the score before and after
  // the move can be read apart instead of averaged together.
  it('stamps every survey event with the trigger that armed the card', () => {
    const sent = capture();
    trackExperienceSurveySent(sent.track, { recommendation: 7 });
    expect(sent.props().trigger).toBe(EXPERIENCE_SURVEY_TRIGGER);
  });
});

describe('experience survey "other" answer', () => {
  it('reports the typed text as the improvement response', () => {
    // PostHog's open-choice convention: the response IS the free text, not the
    // word "Other" with the text tucked somewhere else.
    const t = capture();
    trackExperienceSurveySent(t.track, {
      recommendation: 4,
      improvementOther: '导出的 PDF 字体全变了',
    });

    expect(t.props()[`$survey_response_${ids.improvement}`]).toBe('导出的 PDF 字体全变了');
  });

  it('still reports the choice when "other" is picked but nothing is typed', () => {
    // "None of these fit" is an answer. Dropping it would turn those people
    // into non-responders and quietly overstate the listed choices.
    const t = capture();
    trackExperienceSurveySent(t.track, { recommendation: 4, improvementOther: '   ' });

    expect(t.props()[`$survey_response_${ids.improvement}`]).toBe('Other');
    expect(t.props().$survey_questions).toHaveLength(2);
  });

  it('prefers the typed text over a stale choice index', () => {
    const t = capture();
    trackExperienceSurveySent(t.track, {
      recommendation: 4,
      improvement: 0,
      improvementOther: 'PDF fonts break on export',
    });

    expect(t.props()[`$survey_response_${ids.improvement}`]).toBe('PDF fonts break on export');
  });
});
