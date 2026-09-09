// Renderable `<question-form>` detection, shared across daemon consumers.
//
// The implementation now lives in `packages/contracts/src/api/question-form-markup.ts`.
// It moved there when the web chat footer needed the same answer — a turn that
// rendered a form handed the baton back to the user, so it did not "stop with
// unfinished work" (`turnEndedByAskingUser` in `api/run-completeness.ts`). The
// original header here already named that promotion as the remedy for exactly
// this case, and the app boundary forbids `apps/web` importing daemon source,
// so a second web-side detector was the only alternative — precisely the
// divergence `run-completeness.ts` exists to make unrepresentable.
//
// This module stays as the daemon's import surface so every existing consumer
// (the missing-artifacts guard, awaiting-input status, run analytics, the OD
// Next coordinator) and `e2e/tests/question-form-parity.test.ts` keep their
// current import path. Add nothing here: new logic belongs in the contract.
export {
  QUESTION_FORM_OPEN_RE,
  countRenderableQuestionForms,
  emittedRenderableQuestionForm,
  findQuestionFormCloseTag,
  questionFormBodyIsRenderable,
  scanQuestionForms,
} from '@open-design/contracts';
export type { QuestionFormScan } from '@open-design/contracts';
