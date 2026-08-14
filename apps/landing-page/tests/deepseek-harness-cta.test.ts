import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEEPSEEK_HARNESS_REPO,
  DOWNLOAD_HREF,
  deepseekHarnessHeroCtas,
} from '../app/cta-actions.ts';
import { getInfoPageCopy } from '../app/info-page-i18n.ts';
import { LANDING_LOCALES } from '../app/i18n.ts';
import { deepseekHarnessTutorialCopy } from '../app/deepseek-harness-page.ts';

test('DeepSeek Harness hero CTAs are complete for every active locale', () => {
  for (const { code } of LANDING_LOCALES) {
    const rich = getInfoPageCopy(code).agentGuides['deepseek-harness']?.rich;
    assert.ok(rich, `${code}: missing DeepSeek Harness rich copy`);

    const actions = deepseekHarnessHeroCtas(rich.heroCtaActions);
    assert.equal(actions.length, 2, `${code}: expected exactly two hero actions`);
    assert.equal(actions[0]?.href, DOWNLOAD_HREF, `${code}: download must be first`);
    assert.equal(actions[0]?.variant, 'primary', `${code}: download must be primary`);
    assert.equal(
      actions[1]?.href,
      DEEPSEEK_HARNESS_REPO,
      `${code}: Harness repository must be second`,
    );
    assert.equal(actions[1]?.variant, 'ghost', `${code}: repository must be secondary`);
    assert.ok(actions[0]?.label.trim(), `${code}: download label is empty`);
    assert.ok(actions[1]?.label.trim(), `${code}: repository label is empty`);

    if (code !== 'en') {
      assert.notEqual(
        actions[1]?.label,
        'Open DeepSeek Harness on GitHub',
        `${code}: repository label fell back to the English sentence`,
      );
    }
  }
});

test('DeepSeek Harness opens with localized tutorial-first copy in every active locale', () => {
  for (const { code } of LANDING_LOCALES) {
    const page = getInfoPageCopy(code).agentGuides['deepseek-harness'];
    assert.ok(page, `${code}: missing DeepSeek Harness guide`);

    const tutorial = deepseekHarnessTutorialCopy(page);
    assert.equal(tutorial.title, page.title, `${code}: localized document title changed`);
    assert.equal(tutorial.heading, page.heading, `${code}: localized H1 changed`);
    assert.notEqual(
      tutorial.heading,
      page.rich?.sections.find(({ id }) => id === 'setup')?.heading,
      `${code}: H1 repeats the first setup section heading`,
    );
    for (const [field, value] of Object.entries(tutorial)) {
      if (Array.isArray(value)) {
        assert.ok(value.length > 0, `${code}: ${field} is empty`);
        assert.ok(value.every((item) => item.trim()), `${code}: ${field} contains empty copy`);
      } else {
        assert.ok(value.trim(), `${code}: ${field} is empty`);
      }
    }

    if (code !== 'en') {
      assert.notEqual(
        tutorial.heroCtaLead,
        getInfoPageCopy('en').agentGuides['deepseek-harness']?.rich?.heroCtaLead,
        `${code}: tutorial lead fell back to English`,
      );
    }
  }
});
