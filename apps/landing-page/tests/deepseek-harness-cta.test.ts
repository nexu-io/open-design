import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEEPSEEK_HARNESS_REPO,
  DOWNLOAD_HREF,
  OPEN_DESIGN_DISCORD,
  OPEN_DESIGN_FEISHU,
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
    assert.equal(actions.length, 3, `${code}: expected exactly three hero actions`);
    assert.equal(actions[0]?.href, DOWNLOAD_HREF, `${code}: download must be first`);
    assert.equal(actions[0]?.variant, 'primary', `${code}: download must be primary`);
    assert.equal(actions[1]?.href, OPEN_DESIGN_DISCORD, `${code}: Discord must be second`);
    assert.equal(actions[2]?.href, OPEN_DESIGN_FEISHU, `${code}: Feishu must be third`);
    assert.equal(actions[1]?.variant, 'ghost', `${code}: Discord must be secondary`);
    assert.equal(actions[2]?.variant, 'ghost', `${code}: Feishu must be secondary`);
    assert.ok(actions[0]?.label.trim(), `${code}: download label is empty`);
    assert.ok(actions[1]?.label.trim(), `${code}: Discord label is empty`);
    assert.ok(actions[2]?.label.trim(), `${code}: Feishu label is empty`);

    if (code !== 'en') {
      assert.notEqual(
        actions[1]?.label,
        'Join Open Design Discord',
        `${code}: Discord label fell back to the English sentence`,
      );
      assert.notEqual(
        actions[2]?.label,
        'Join the Feishu group',
        `${code}: Feishu label fell back to the English sentence`,
      );
    }
  }
});

test('DeepSeek Harness opens with localized tutorial-first copy in every active locale', () => {
  for (const { code } of LANDING_LOCALES) {
    const page = getInfoPageCopy(code).agentGuides['deepseek-harness'];
    assert.ok(page, `${code}: missing DeepSeek Harness guide`);
    assert.equal(
      page.rich?.heroImage?.src,
      '/agents/deepseek-harness-design/deepseek-harness-design-dsh-web-ui.webp',
      `${code}: hero must show the DeepSeek Harness interface`,
    );

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

test('DeepSeek Harness tutorial exposes the official resources and connection walkthrough', () => {
  const expectedImages = [
    '/agents/deepseek-harness-design/deepseek-harness-design-open-design-settings.webp',
    '/agents/deepseek-harness-design/deepseek-harness-design-open-design-workspace.webp',
  ];

  for (const { code } of LANDING_LOCALES) {
    const page = getInfoPageCopy(code).agentGuides['deepseek-harness'];
    assert.ok(page, `${code}: missing DeepSeek Harness guide`);
    assert.ok(
      page.links.some(({ href }) => href === 'https://www.deepseek.com/harness/'),
      `${code}: missing the official DeepSeek Harness website`,
    );
    assert.ok(
      page.links.some(({ href }) => href === DEEPSEEK_HARNESS_REPO),
      `${code}: missing the official DeepSeek Harness repository`,
    );

    const connectionSection = page.rich?.sections.find(({ id }) => id === 'open-design');
    assert.ok(connectionSection, `${code}: missing the Open Design connection section`);
    const connectionSteps = connectionSection.blocks.find((block) => block.kind === 'steps');
    assert.ok(connectionSteps, `${code}: missing the numbered connection steps`);
    assert.deepEqual(
      connectionSteps.items.map(({ label }) => label.match(/^\d/)?.[0]),
      ['2', '3', '4', '5'],
      `${code}: connection steps are out of order`,
    );
    assert.match(
      connectionSteps.items.map(({ label, body }) => `${label} ${body}`).join(' '),
      /0\.19\.1/,
      `${code}: missing the minimum Open Design version`,
    );
    const imageSources = connectionSection.blocks.flatMap((block) =>
      block.kind === 'image' ? [block.src] : [],
    );
    for (const src of expectedImages) {
      assert.ok(imageSources.includes(src), `${code}: missing connection tutorial image ${src}`);
    }
    assert.ok(
      connectionSection.blocks.some(
        (block) => block.kind === 'code' && block.code.includes('DESIGN.md'),
      ),
      `${code}: missing the design-task prompt`,
    );

    const setupSection = page.rich?.sections.find(({ id }) => id === 'setup');
    assert.ok(setupSection, `${code}: missing the local Harness setup section`);
    assert.doesNotMatch(
      JSON.stringify(page.rich),
      /open-design\.ai\/install-dsh\.(?:sh|ps1|cmd)/,
      `${code}: unpublished one-line installer leaked into the public tutorial`,
    );
    assert.ok(
      !setupSection.blocks.some(
        (block) =>
          block.kind === 'image' &&
          block.src ===
            '/agents/deepseek-harness-design/deepseek-harness-design-dsh-web-ui.webp',
      ),
      `${code}: Harness interface image is duplicated in the setup section`,
    );
    assert.ok(
      setupSection.blocks.some(
        (block) => block.kind === 'code' && block.code.includes('@deepseek-ai/dsh@0.1.0-rc.6'),
      ),
      `${code}: missing the pinned local dsh install command`,
    );
    const setupSteps = setupSection.blocks.find((block) => block.kind === 'steps');
    assert.equal(setupSteps?.items.length, 3, `${code}: expected three Harness setup steps`);
    const setupCopy = JSON.stringify(setupSection);
    assert.match(setupCopy, /platform\.deepseek\.com\/api_keys/, `${code}: missing API key link`);
    assert.match(setupCopy, /DEEPSEEK_API_KEY=\.\.\./, `${code}: missing key-format warning`);
    assert.match(setupCopy, /MISSING_CREDENTIAL/, `${code}: missing credential troubleshooting`);
    assert.match(setupCopy, /Ctrl\+C/, `${code}: missing Web UI shutdown guidance`);
  }
});

test('DeepSeek Harness page leads with the design search intent', () => {
  const en = getInfoPageCopy('en').agentGuides['deepseek-harness'];
  const zh = getInfoPageCopy('zh').agentGuides['deepseek-harness'];
  assert.ok(en?.rich, 'missing English DeepSeek Harness rich guide');
  assert.ok(zh?.rich, 'missing Chinese DeepSeek Harness rich guide');

  assert.match(en.title, /DeepSeek Harness.*UI Design/);
  assert.equal(en.heading, 'Design with DeepSeek Harness.');
  assert.equal(
    en.rich.sections.find(({ id }) => id === 'why-design')?.heading,
    'Can DeepSeek Harness do design?',
  );
  assert.match(zh.title, /DeepSeek Harness.*设计/);
  assert.equal(zh.heading, '用 DeepSeek Harness 做设计。');
  assert.equal(
    zh.rich.sections.find(({ id }) => id === 'why-design')?.heading,
    'DeepSeek Harness 能做设计吗？',
  );

  const enSetup = en.rich.sections.find(({ id }) => id === 'setup');
  const zhSetup = zh.rich.sections.find(({ id }) => id === 'setup');
  assert.equal(enSetup?.heading, 'Step 1: Install and configure DeepSeek Harness');
  assert.equal(zhSetup?.heading, '第 1 步：安装并配置 DeepSeek Harness');
  assert.match(JSON.stringify(enSetup), /API key and model/);
  assert.match(JSON.stringify(enSetup), /takes effect immediately/);
  assert.match(JSON.stringify(enSetup), /Ctrl\+C/);
  assert.match(JSON.stringify(zhSetup), /API Key 与模型/);
  assert.match(JSON.stringify(zhSetup), /立即生效/);
  assert.match(JSON.stringify(zhSetup), /Ctrl\+C/);

  const enConnection = en.rich.sections.find(({ id }) => id === 'open-design');
  const zhConnection = zh.rich.sections.find(({ id }) => id === 'open-design');
  assert.match(JSON.stringify(enConnection), /click Test/);
  assert.match(JSON.stringify(zhConnection), /点击“测试”/);
});
