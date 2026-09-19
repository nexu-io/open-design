// @vitest-environment jsdom
//
// Red spec for inspect styling that disappears on the next save.
//
// Inspect overrides are persisted inside the artifact itself, as a
// `<style data-od-inspect-overrides>` block. `applyInspectOverridesToSource`
// places that block just inside `<head>`, and has three cases: before
// `</head>`, after `<head ...>`, and — when the document has neither — a bare
//
//   return block + out;
//
// That last branch puts the style ahead of everything, which for a document
// that opens with `<!doctype html>` means ahead of the doctype. The bytes look
// fine and read back fine, so the styling appears to persist. It only comes
// apart on the next save: `applyManualEditPatch` parses and re-serializes, the
// parser moves the stray leading style out of the way, and the block is gone
// with the user's styling in it.
//
// An HTML document with no literal `<head>` is legal and the browser supplies
// one, so nothing upstream refuses it — and the no-head branch exists precisely
// because the author expected such documents to arrive.
//
// The control is the same flow on a document that does have a `<head>`, which
// passes today. Without it a fix that simply stopped writing the block at all
// would look like a pass.

import { describe, expect, it } from 'vitest';

import {
  applyInspectOverridesToSource,
  parseInspectOverridesFromSource,
  serializeInspectOverrides,
} from '../../src/components/FileViewer';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';

const OVERRIDES = {
  support: { selector: '[data-od-id="support"]', props: { color: 'rgb(1, 2, 3)' } },
};

const BODY =
  '<p>Intro</p>'
  + '<h3 data-od-id="pricing">Pricing</h3>'
  + '<h3 data-od-id="support">Support</h3>';

const WITH_HEAD = `<!doctype html><html><head><title>t</title></head><body>${BODY}</body></html>`;
const WITHOUT_HEAD = `<!doctype html><html><body>${BODY}</body></html>`;

/** Persist an inspect override, then save an unrelated text edit over it. */
function persistThenSave(source: string): string {
  const withOverride = applyInspectOverridesToSource(
    source,
    serializeInspectOverrides(OVERRIDES).trim(),
  );
  // The block has to survive the round trip, not merely be written.
  expect(
    parseInspectOverridesFromSource(withOverride),
    'the override must read back before anything else happens',
  ).toHaveProperty('support');

  const saved = applyManualEditPatch(withOverride, {
    id: 'pricing',
    kind: 'set-text',
    value: 'Pricing rewritten',
  });
  expect(saved.ok).toBe(true);
  return saved.source;
}

describe('inspect overrides survive a later save', () => {
  it.each([
    ['a document with a head', WITH_HEAD],
    ['a document with no head', WITHOUT_HEAD],
  ])('keeps the persisted styling: %s', (_label, source) => {
    expect(parseInspectOverridesFromSource(persistThenSave(source))).toHaveProperty('support');
  });

  /**
   * The same thing said about the bytes, because "reads back" and "is inside
   * the document" are not the same claim: a block written ahead of the doctype
   * parses back out of the raw string perfectly well, and is still lost the
   * moment anything re-serializes it.
   */
  it.each([
    ['a document with a head', WITH_HEAD],
    ['a document with no head', WITHOUT_HEAD],
  ])('writes the block inside the document: %s', (_label, source) => {
    const withOverride = applyInspectOverridesToSource(
      source,
      serializeInspectOverrides(OVERRIDES).trim(),
    );
    expect(
      withOverride.indexOf('data-od-inspect-overrides'),
      'the style block must not precede the doctype',
    ).toBeGreaterThan(withOverride.toLowerCase().indexOf('<!doctype'));
  });
});
