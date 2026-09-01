import { describe, expect, it } from 'vitest';

import {
  countRenderableQuestionForms,
  emittedRenderableQuestionForm,
  scanQuestionForms,
} from '../src/question-form-detect.js';

// A renderable question-form body — JSON with a non-empty `questions` array.
// Same fixture style as tests/runtimes/run-artifacts.test.ts: the detector
// requires a closed, renderable block, not a bare tag.
const RENDERABLE_BODY = '{"questions":[{"id":"surface","label":"Which surface?"}]}';
const RENDERABLE_FORM = `<question-form id="q">${RENDERABLE_BODY}</question-form>`;

// The exact production regression (OD Next strategy turn, PR #7016): the agent
// declared it had nothing to ask AND still emitted the literal marker, with
// prose instead of a body and no close tag.
const STRAY_MARKER_TURN = '策略判断信息充足，将直接进入生产。\n\n<question-form> 无需提出';

describe('scanQuestionForms', () => {
  it('reports plain prose as carrying no marker at all', () => {
    expect(scanQuestionForms('Just an ordinary answer with no markup.')).toEqual({
      renderable: 0,
      unrenderable: 0,
      unterminated: false,
    });
  });

  it('counts a closed, renderable block', () => {
    expect(scanQuestionForms(`Quick check ${RENDERABLE_FORM}`)).toEqual({
      renderable: 1,
      unrenderable: 0,
      unterminated: false,
    });
  });

  // The defect: an open tag whose body is prose and which never closes used to
  // be indistinguishable from "the turn asked nothing" — the scan returned 0
  // and raised nothing, so every downstream consumer read it as silence.
  it('distinguishes an unterminated marker from an absent one', () => {
    expect(scanQuestionForms(STRAY_MARKER_TURN)).toEqual({
      renderable: 0,
      unrenderable: 0,
      unterminated: true,
    });
  });

  it('flags a closed block whose body is not a parseable form', () => {
    expect(scanQuestionForms('<question-form>无需提出</question-form>')).toEqual({
      renderable: 0,
      unrenderable: 1,
      unterminated: false,
    });
  });

  it('flags the <ask-question> alias the same way', () => {
    expect(scanQuestionForms('<ask-question id="q"> nothing to ask')).toEqual({
      renderable: 0,
      unrenderable: 0,
      unterminated: true,
    });
  });

  it('treats non-string input as carrying no marker', () => {
    expect(scanQuestionForms(undefined)).toEqual({
      renderable: 0,
      unrenderable: 0,
      unterminated: false,
    });
    expect(scanQuestionForms(null)).toEqual({
      renderable: 0,
      unrenderable: 0,
      unterminated: false,
    });
  });

  it('reports both a spent closed block and a later unterminated marker', () => {
    expect(
      scanQuestionForms(`<question-form>prose</question-form>\ntail <question-form> more prose`),
    ).toEqual({ renderable: 0, unrenderable: 1, unterminated: true });
  });
});

// OPEND-2364. Every case below is markup the chat DOES render into a form
// card: `splitOnQuestionForms` gives up on an open marker only when no other
// open marker is left to retry from. Scoring any of them as zero renderable
// forms blocks the OD Next task on `od_next_clarification_form_missing` while
// the user is still looking at the form, so their answer returns 409
// STRATEGY_TASK_STATE_MISMATCH. The cross-parser corpus lives in
// `e2e/tests/question-form-parity.test.ts`; these pin the daemon's own scan.
describe('scanQuestionForms recovers wherever the web renderer does', () => {
  it('counts the inner form when the agent duplicates its own open tag', () => {
    expect(
      scanQuestionForms(
        `<question-form id="q" title="T">\n<question-form id="q" title="T">\n${RENDERABLE_BODY}\n</question-form>\n</question-form>`,
      ),
    ).toEqual({ renderable: 1, unrenderable: 0, unterminated: false });
  });

  it('counts an inner form reached through an unterminated outer marker', () => {
    expect(
      scanQuestionForms(`<question-form id="outer">\n${RENDERABLE_FORM}`),
    ).toEqual({ renderable: 1, unrenderable: 0, unterminated: false });
  });

  it('counts a form the model wrapped in the other tag name', () => {
    expect(
      scanQuestionForms(`<question-form id="outer">\n<ask-question>${RENDERABLE_BODY}</ask-question>\n</question-form>`),
    ).toEqual({ renderable: 1, unrenderable: 0, unterminated: false });
  });

  it('counts a real form that follows the tag name quoted in prose', () => {
    expect(
      scanQuestionForms(`the \`<question-form>\` markup\n${RENDERABLE_FORM}`),
    ).toEqual({ renderable: 1, unrenderable: 0, unterminated: false });
  });

  // `parseForm` reads a bare top-level array as the questions list, so the UI
  // renders this. Requiring the `questions` key here made a displayed form
  // invisible to every daemon consumer.
  it('accepts a bare top-level questions array', () => {
    expect(
      scanQuestionForms('<question-form>[{"id":"surface","label":"Which surface?"}]</question-form>'),
    ).toEqual({ renderable: 1, unrenderable: 0, unterminated: false });
  });

  // Recovery must not become permissiveness: a wrapper that holds no further
  // marker is still the unrenderable block it always was.
  it('still charges a failed block with no inner marker to retry from', () => {
    expect(
      scanQuestionForms('<question-form>{"questions":[]}</question-form>'),
    ).toEqual({ renderable: 0, unrenderable: 1, unterminated: false });
  });

  // Two forms the chat renders separately stay two, so the one-round protocol
  // still catches the ambiguity instead of silently picking one.
  it('keeps a recovered form distinct from a sibling form', () => {
    expect(
      scanQuestionForms(
        `${RENDERABLE_FORM}\n<question-form>\n${RENDERABLE_FORM}\n</question-form>`,
      ),
    ).toEqual({ renderable: 2, unrenderable: 0, unterminated: false });
  });
});

// The renderable count is the contract every existing consumer already relies
// on; teaching the scan to report malformed markers must not move it.
describe('countRenderableQuestionForms stays the renderable-only count', () => {
  it('still ignores a stray marker', () => {
    expect(countRenderableQuestionForms(STRAY_MARKER_TURN)).toBe(0);
    expect(emittedRenderableQuestionForm(STRAY_MARKER_TURN)).toBe(false);
  });

  it('still counts two genuine forms', () => {
    expect(countRenderableQuestionForms(`${RENDERABLE_FORM}\n${RENDERABLE_FORM}`)).toBe(2);
  });
});
