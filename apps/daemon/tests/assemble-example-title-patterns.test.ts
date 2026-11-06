// Regression (#6795): `assembleExample` interpolates skill-derived slide HTML
// and titles verbatim. A string replacement would expand `$$`, `$&`, `$`` and
// `$'` through String.prototype.replace's GetSubstitution and corrupt them.
import assert from 'node:assert/strict';

import { test } from 'vitest';

import { assembleExample } from '../src/routes/static-resource.js';

test('assembleExample keeps replacement-pattern sequences verbatim', () => {
  const template = '<html><head><title>Old</title></head><body><!-- SLIDES_HERE --></body></html>';
  const slides = '<section>Save $$$ deck</section>';
  for (const title of ['Save $$$ This Quarter', "Rock $'n Roll Tour", 'Before $& After', 'Backtick $` Pattern']) {
    assert.equal(
      assembleExample(template, slides, title),
      `<html><head><title>${title} | OpenDesign Example</title></head><body>${slides}</body></html>`,
    );
  }
});
