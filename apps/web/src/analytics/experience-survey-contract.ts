// Wire contract between the in-app experience survey and its PostHog record.
//
// The survey is `type: api` in PostHog: PostHog stores and analyses the
// responses, but renders nothing — `ExperienceSurvey` owns the UI so the card
// follows the app's material, theme and all 19 locales. That split means the
// client is responsible for emitting the survey events in the shape PostHog's
// survey analytics expects, which is what this module encodes.
//
// The ids below are the PostHog survey's own. They are stable once created, so
// hard-coding them keeps the client free of a fetch-before-render round trip.
//
//   Survey: https://us.posthog.com/project/420348/surveys/01a00fd1-ed7e-0000-d38e-63bce21fb816
//
// EDITING THE QUESTIONS IN POSTHOG REGENERATES NOTHING HERE. If a question is
// added, removed or reordered there, update this file in the same change or
// responses will land under the wrong question id.

export const EXPERIENCE_SURVEY_ID = '01a00fd1-ed7e-0000-d38e-63bce21fb816';

export const EXPERIENCE_SURVEY_QUESTION_IDS = {
  recommendation: '146fefc0-9c11-4003-9869-1fd81be1650f',
  improvement: 'e487f41a-8111-4a87-8795-1358c9a11b55',
} as const;

/**
 * The question text as PostHog stores it. Sent alongside each response so the
 * `$survey_questions` payload is self-describing in the events table — a reader
 * should not have to join against the survey definition to know what was asked.
 */
export const EXPERIENCE_SURVEY_QUESTION_TEXT = {
  recommendation: 'How likely are you to recommend OpenDesign to a colleague or friend?',
  improvement: 'Which one should we improve first?',
} as const;

/**
 * Improvement choices in the order the card renders them. The card shows the
 * localized label but reports the canonical English choice, so responses stay
 * comparable across all 19 locales instead of splitting into 19 buckets.
 */
export const EXPERIENCE_SURVEY_IMPROVEMENT_CHOICES = [
  'Not what I asked for',
  'Claimed done, nothing changed',
  'Hard to use',
  'Too many upgrade prompts',
  'Gets stuck or fails',
  'Too slow',
  "Doesn't look good",
  'Breaks other things',
] as const;
