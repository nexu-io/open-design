import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { LANDING_LOCALES, localizedHref } from '../app/i18n.ts';

const PPT_TUTORIAL_PATH = '/tutorials/open-design-ai-ppt-tutorial/';
const EVENT_PARTIALS = [
  'open-design-osaka-meetup-main',
  'open-design-shanghai-workshop-main',
] as const;

function localizeInternalLinks(html: string, locale: (typeof LANDING_LOCALES)[number]['code']) {
  return html.replace(
    /href="(\/[^\"]+)"/g,
    (_match, pathname: string) => `href="${localizedHref(pathname, locale)}"`,
  );
}

test('event recaps keep canonical-only tutorial links valid in every active locale', async () => {
  for (const eventPartial of EVENT_PARTIALS) {
    for (const { code } of LANDING_LOCALES) {
      const localeSuffix = code === 'en' ? '' : `.${code}`;
      const partial = await readFile(
        new URL(`../app/_partials/${eventPartial}${localeSuffix}.html`, import.meta.url),
        'utf8',
      );
      const rendered = localizeInternalLinks(partial, code);

      assert.match(
        partial,
        new RegExp(`href="${PPT_TUTORIAL_PATH}"`),
        `${eventPartial}.${code}: fixture no longer links to the canonical tutorial`,
      );
      assert.match(
        rendered,
        new RegExp(`href="${PPT_TUTORIAL_PATH}"`),
        `${eventPartial}.${code}: canonical tutorial link was rewritten`,
      );
      assert.doesNotMatch(
        rendered,
        new RegExp(`href="/${code}${PPT_TUTORIAL_PATH}"`),
        `${eventPartial}.${code}: generated link points at a missing localized tutorial route`,
      );
    }
  }
});
