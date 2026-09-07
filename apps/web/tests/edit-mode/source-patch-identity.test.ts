// @vitest-environment jsdom
//
// Red spec for an edit that lands on a different element than the user picked.
//
// Manual Edit identifies an element by `data-od-source-path`, a POSITIONAL
// ordinal — `source-0`, `source-1`, … — assigned by walking the source in order
// and counting discovery tags (`ManualEditSourceAnnotator`). The daemon stamps
// those onto the HTML it serves, the runtime reads one back as the patch id
// (`stableId`), and the host resolves it against the source it is about to
// patch (`findEditableElement`).
//
// The numbering is only an identity while the document's shape holds still.
// `applyManualEditPatch` writes by parsing the source and re-serializing it,
// and an HTML parser is not a pass-through: it closes a `<p>` before a block
// child and leaves the stray `</p>` behind as an empty one, it materializes the
// `<tbody>` a table never wrote, it re-parents what was misplaced. Every one of
// those adds or removes a discovery tag, and every ordinal after the change
// point shifts by one.
//
// Nothing tells the rest of the session. The document on screen was mirrored
// rather than replaced, so it still carries the ids it was served with; the
// host's selection, its history entries and its live style map all still hold
// pre-save ids. The next patch resolves one of those against the renumbered
// source and quietly writes to the neighbouring element. The user clicked one
// heading and a different heading changed.
//
// The shapes below are ordinary authored HTML, not adversarial: a `<p>` around
// a block element and a `<table>` written without `<tbody>` are two of the most
// common things a generator emits.

import { describe, expect, it } from 'vitest';
import { annotateManualEditSourceOrdinals } from '@open-design/preview-runtime/manual-edit-source';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';

/**
 * The editable elements of the document as the user's browser receives it:
 * annotated the way the daemon annotates it, then parsed the way a browser
 * parses it. This is where the ids the host later patches by come from.
 */
function servedElements(html: string): { id: string; tag: string; text: string }[] {
  const doc = new DOMParser().parseFromString(annotateManualEditSourceOrdinals(html), 'text/html');
  return Array.from(doc.querySelectorAll('[data-od-source-path]')).map((el) => ({
    id: el.getAttribute('data-od-source-path')!,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').replace(/\s+/gu, ' ').trim(),
  }));
}

function idOfText(html: string, text: string): string {
  const match = servedElements(html).find((element) => element.text === text);
  if (!match) throw new Error(`no served element carries ${JSON.stringify(text)}`);
  return match.id;
}

function textOfId(html: string, id: string): string | undefined {
  return servedElements(html).find((element) => element.id === id)?.text;
}

/** Authored HTML the browser's parser rewrites on the way in. */
const P_AROUND_BLOCK =
  '<!doctype html><html><body>'
  + '<p>Intro<div>Body copy</div></p>'
  + '<h3>Pricing</h3>'
  + '<h3>Support</h3>'
  + '</body></html>';

const TABLE_WITHOUT_TBODY =
  '<!doctype html><html><body>'
  + '<div>Body copy</div>'
  + '<table><tr><td>Starter</td></tr></table>'
  + '<h3>Pricing</h3>'
  + '<h3>Support</h3>'
  + '</body></html>';

/** Nothing for the parser to rewrite — the control. */
const ALREADY_NORMALIZED =
  '<!doctype html><html><body>'
  + '<div>Body copy</div>'
  + '<h3>Pricing</h3>'
  + '<h3>Support</h3>'
  + '</body></html>';

describe('Manual Edit element identity across a save', () => {
  /**
   * The ordinals really do move, on ordinary authored HTML. This is the fact
   * everything else rests on, so it is pinned directly rather than inferred.
   */
  it.each([
    ['a paragraph wrapped around a block element', P_AROUND_BLOCK],
    ['a table written without a tbody', TABLE_WITHOUT_TBODY],
  ])('reports a save that renumbered the document: %s', (_label, source) => {
    const saved = applyManualEditPatch(source, {
      id: idOfText(source, 'Body copy'),
      kind: 'set-text',
      value: 'Body copy rewritten',
    });

    expect(saved.ok).toBe(true);
    expect(saved.identitiesRenumbered).toBe(true);
  });

  /**
   * And the flag has to be earned, or a caller that trusts it learns nothing:
   * a document the parser has nothing to rewrite keeps every id it had.
   */
  it('reports no renumbering when the document was already normalized', () => {
    const before = servedElements(ALREADY_NORMALIZED);
    const editedId = idOfText(ALREADY_NORMALIZED, 'Body copy');
    const saved = applyManualEditPatch(ALREADY_NORMALIZED, {
      id: editedId,
      kind: 'set-text',
      value: 'Body copy rewritten',
    });

    expect(saved.ok).toBe(true);
    expect(saved.identitiesRenumbered).toBe(false);
    for (const element of before) {
      if (element.id === editedId) continue;
      expect(textOfId(saved.source, element.id), `${element.tag} ${element.id}`).toBe(element.text);
    }
  });

  /**
   * The contract the host depends on, stated as the thing that must never
   * happen: a save that says it renumbered nothing must not have renumbered
   * anything. A false negative here is the silent wrong-element edit.
   */
  it.each([
    ['a paragraph wrapped around a block element', P_AROUND_BLOCK],
    ['a table written without a tbody', TABLE_WITHOUT_TBODY],
    ['an already-normalized document', ALREADY_NORMALIZED],
  ])('never claims stability it does not have: %s', (_label, source) => {
    const before = servedElements(source);
    const editedId = idOfText(source, 'Body copy');
    const saved = applyManualEditPatch(source, {
      id: editedId,
      kind: 'set-text',
      value: 'Body copy rewritten',
    });
    expect(saved.ok).toBe(true);
    if (saved.identitiesRenumbered) return;

    for (const element of before) {
      if (element.id === editedId) continue;
      expect(textOfId(saved.source, element.id), `${element.tag} ${element.id}`).toBe(element.text);
    }
  });
});
