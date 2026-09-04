/**
 * Web/daemon `<question-form>` parse parity (OPEND-2364).
 *
 * The clarification form has two independent parsers by design: the web
 * renderer (`apps/web/src/artifacts/question-form.ts`, `splitOnQuestionForms`)
 * decides what the user sees, and the daemon detector
 * (`apps/daemon/src/question-form-detect.ts`, `scanQuestionForms`) decides what
 * the host believes was asked. The root `AGENTS.md` boundary forbids
 * `apps/daemon` importing `apps/web/src`, so the daemon side is a deliberate
 * mirror — and its own header says to keep it in sync or promote a shared
 * parser once the two drift.
 *
 * They did drift, and the two answers are load-bearing against each other. The
 * OD Next coordinator blocks a `clarification_required` turn that rendered no
 * form (`od_next_clarification_form_missing`), settling the strategy task
 * terminal + blocked. When the web renders a form the daemon scored as absent,
 * the user is left filling in a live form belonging to an already-terminal
 * task, and submitting it returns 409 STRATEGY_TASK_STATE_MISMATCH. That is the
 * production report: an agent wrapped its form in a duplicate of its own open
 * tag, the web unwound to the inner form and rendered it, the daemon charged
 * the outer block as unrenderable and blocked the task.
 *
 * Each parser's own suite passed throughout, because neither owned the shared
 * corpus. This test does. It lives in `e2e/tests/` per the root `AGENTS.md`
 * rule that cross-app consistency checks belong here — it is the only layer
 * allowed to observe both parsers at once.
 *
 * Adding a markup shape: put it in `CORPUS` with a name that says what the
 * agent did wrong, not what the parsers should return. The expected value is
 * always "whatever the web renderer does", because the web renderer is what
 * the user sees.
 *
 * The web parser is loaded through a computed specifier, and that is load-
 * bearing rather than stylistic. A static import would pull `apps/web` source
 * into this package's TypeScript program, where it is compiled under settings
 * it was never written for — e2e resolves modules as `nodenext` with
 * `exactOptionalPropertyTypes`, `apps/web` as `bundler` without it — so
 * `pnpm typecheck` fails on the web file's own extensionless imports and
 * optional properties. Those are not defects; they are the reason the root
 * `AGENTS.md` tells an app not to borrow another app's private source, and
 * tells this layer to promote shared logic into a pure package instead.
 * Promoting the parser is the right end state and is deliberately not done
 * here: it would mean restructuring the renderer that currently defines
 * correct behavior, in the same change that fixes a production block. Until
 * then this keeps the two honest without compiling either one against the
 * other's settings; the runtime shape is asserted on load, so a rename in
 * `apps/web` fails this test loudly instead of silently skipping it.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scanQuestionForms } from '../../apps/daemon/src/question-form-detect.ts';

type FormSegment = { kind: 'text'; text: string } | { kind: 'form' };
type SplitOnQuestionForms = (input: string) => FormSegment[];

const webParserSpecifier = pathToFileURL(
  path.join(
    fileURLToPath(new URL('../../', import.meta.url)),
    'apps/web/src/artifacts/question-form.ts',
  ),
).href;

const splitOnQuestionForms: SplitOnQuestionForms = await (async () => {
  const loaded = (await import(webParserSpecifier)) as {
    splitOnQuestionForms?: SplitOnQuestionForms;
  };
  if (typeof loaded.splitOnQuestionForms !== 'function') {
    throw new Error(
      'apps/web/src/artifacts/question-form.ts no longer exports splitOnQuestionForms; '
      + 'this parity contract must be repointed, not deleted.',
    );
  }
  return loaded.splitOnQuestionForms;
})();

const BODY = '{"questions":[{"id":"surface","label":"Which surface?","type":"text"}]}';
const FORM = `<question-form id="scope">${BODY}</question-form>`;

/**
 * The prose the web renderer substitutes for a block it could not parse.
 * Derived from the parser rather than copied, so a reworded fallback cannot
 * silently turn the unrenderable half of this contract into a no-op.
 */
const WEB_INVALID_FALLBACK = (() => {
  const [segment] = splitOnQuestionForms('<question-form>not json</question-form>');
  if (!segment || segment.kind !== 'text') {
    throw new Error('web parser no longer emits a text fallback for an unparseable block');
  }
  return segment.text;
})();

/** What the user actually ends up looking at for `text`. */
function webRender(text: string): { renderable: number; unrenderable: number } {
  const segments = splitOnQuestionForms(text);
  return {
    renderable: segments.filter((s) => s.kind === 'form').length,
    unrenderable: segments.filter(
      (s) => s.kind === 'text' && s.text === WEB_INVALID_FALLBACK,
    ).length,
  };
}

const CORPUS: Record<string, string> = {
  'no markup at all': 'A plain answer with nothing to ask.',
  'one well-formed form': `Quick check.\n${FORM}`,
  'two well-formed forms': `${FORM}\n${FORM}`,
  'the <ask-question> alias': `<ask-question id="scope">${BODY}</ask-question>`,
  'an upper-cased tag': `<QUESTION-FORM>${BODY}</QUESTION-FORM>`,
  'a fenced JSON body': `<question-form>\n\`\`\`json\n${BODY}\n\`\`\`\n</question-form>`,
  'a bare top-level questions array': '<question-form>[{"id":"surface","label":"Which?"}]</question-form>',
  'an empty questions array': '<question-form>{"questions":[]}</question-form>',
  'questions holding no objects': '<question-form>{"questions":["surface"]}</question-form>',
  'prose where the body should be': '<question-form>无需提出</question-form>',
  'an open marker narrating instead of asking': '信息充足。\n\n<question-form> 无需提出',
  'a body that stops mid-JSON': '<question-form>\n{"questions":[',
  // The production shape. Everything below it is the same defect wearing a
  // different hat: an outer marker that cannot parse, with the real form
  // inside it.
  'the agent duplicating its own open tag': `<question-form id="scope" title="T">\n<question-form id="scope" title="T">\n${BODY}\n</question-form>\n</question-form>`,
  'a wrapper carrying attrs the inner form omits': `<question-form id="discovery" title="Quick">\n<question-form>\n${BODY}\n</question-form>\n</question-form>`,
  'a wrapper switching to the alias mid-emission': `<question-form id="scope">\n<ask-question>${BODY}</ask-question>\n</question-form>`,
  'a wrapper that never closes': `<question-form id="scope">\n${FORM}`,
  'the tag name quoted in prose before the real form': `see \`<question-form>\` markup\n${FORM}`,
  'three levels of wrapper': `<question-form>\n<question-form>\n<question-form>${BODY}</question-form>\n</question-form>\n</question-form>`,
  'a clean form followed by a wrapped one': `${FORM}\n<question-form>\n${FORM}\n</question-form>`,
  'a wrapper whose inner marker also fails': '<question-form>\n<question-form>无需提出</question-form>\n</question-form>',
};

describe('question-form parse parity between web and daemon', () => {
  for (const [shape, text] of Object.entries(CORPUS)) {
    it(`[P1] agrees on ${shape}`, () => {
      const web = webRender(text);
      const daemon = scanQuestionForms(text);
      expect({ renderable: daemon.renderable, unrenderable: daemon.unrenderable })
        .toEqual(web);
    });
  }

  // The corpus above only covers shapes someone thought of. This covers the
  // ones nobody did: the seed is fixed so a failure reproduces, and the
  // fragments are the pieces a drifting model actually emits.
  it('[P1] agrees on randomly assembled markup', () => {
    const PIECES = [
      '<question-form>',
      '<question-form id="scope" title="Quick">',
      '<ask-question>',
      '<ASK-QUESTION id="scope">',
      '</question-form>',
      '</ask-question>',
      '</QUESTION-FORM>',
      BODY,
      '[{"id":"surface","label":"Which?"}]',
      '{"questions":[]}',
      '{"questions":["surface"]}',
      `\`\`\`json\n${BODY}\n\`\`\``,
      '无需提出',
      'Planning complete.\n',
      'see `<question-form>` in the docs',
      '{',
      '}',
      '\n',
    ];
    let seed = 20260827;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const mismatches: string[] = [];
    for (let i = 0; i < 20000; i++) {
      let text = '';
      for (let k = 1 + Math.floor(next() * 7); k > 0; k--) {
        text += PIECES[Math.floor(next() * PIECES.length)];
      }
      const web = webRender(text);
      const daemon = scanQuestionForms(text);
      if (
        (web.renderable !== daemon.renderable || web.unrenderable !== daemon.unrenderable)
        && mismatches.length < 10
      ) {
        mismatches.push(
          `web=${JSON.stringify(web)} daemon=${JSON.stringify(daemon)} :: ${JSON.stringify(text)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
