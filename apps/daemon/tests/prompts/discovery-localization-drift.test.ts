import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../../../..');

const promptPaths = [
  'packages/contracts/src/prompts/discovery.ts',
  'apps/daemon/src/prompts/discovery.ts',
] as const;

const languageMatchRule =
  "Match the user's chat language. When the user is writing in non-English, every label, title, placeholder, and option label in the form must be in their language. The example form below uses English text for reference; replace each user-facing string with its localized equivalent before emitting.";

const localizationBullet =
  '- Localize every user-facing string in the form (\\`title\\`, \\`description\\`, the per-question \\`label\\`, \\`placeholder\\`, and option \\`label\\`s) to the user\'s chat language — write what a native speaker would naturally say, never a word-for-word translation (the Chinese title is 快速确认 · 30秒, not the literal 快速简报). Set the top-level \\`"lang"\\` field to the BCP-47 tag of that language (e.g. \\`"zh-CN"\\`, \\`"ja"\\`) so the host renders its built-in controls (the "Other" chip, the custom-answer field) in the same language. \\`id\\`, \\`type\\`, option \\`value\\`, and the stable branch values (\\`pick_direction\\`, \\`brand_spec\\`, \\`reference_match\\`) MUST stay in English because later branch rules match against them.';

describe('discovery prompt localization rules', () => {
  it.each(promptPaths)('%s includes the localized form wording', (promptPath) => {
    const source = readFileSync(resolve(repoRoot, promptPath), 'utf8');

    expect(source).toContain(languageMatchRule);
    expect(source).toContain(localizationBullet);
  });
});

describe('task-type form ownership', () => {
  it.each(promptPaths)('%s does not duplicate the od-default task-type form', (path) => {
    const source = readFileSync(resolve(repoRoot, path), 'utf8');
    expect(source).not.toContain('<question-form id="task-type"');
  });

  it('keeps the single conditional task-type form in od-default', () => {
    const source = readFileSync(
      resolve(repoRoot, 'plugins/_official/scenarios/od-default/SKILL.md'),
      'utf8',
    );
    const formStart = source.indexOf('<question-form id="task-type"');
    expect(formStart).toBeGreaterThanOrEqual(0);
    const form = source.slice(formStart, source.indexOf('</question-form>', formStart));
    expect(form).toContain('"lang": "en"');
    expect(form).toContain('"id": "taskType"');
    expect(form).toContain('"allowCustom": false');
    expect(source).toContain('only when two or more routes remain materially plausible');
    expect(source).toContain('does not by itself require a question form');
  });
});

describe('active skill clarification policy', () => {
  it.each([
    {
      path: 'plugins/_official/examples/html-ppt/SKILL.md',
      required: 'ask only when blocked',
      forbidden: ['ALWAYS ask or recommend', 'Only after those are clear'],
    },
    {
      path: 'design-templates/html-ppt/SKILL.md',
      required: 'ask only when blocked',
      forbidden: ['ALWAYS ask or recommend', 'Only after those are clear'],
    },
    {
      path: 'plugins/_official/examples/audio-jingle/SKILL.md',
      required: 'Missing metadata is not\nan instruction to ask',
      forbidden: ['(unknown — ask)'],
    },
    {
      path: 'design-templates/audio-jingle/SKILL.md',
      required: 'Missing metadata is not\nan instruction to ask',
      forbidden: ['(unknown — ask)'],
    },
    {
      path: 'design-templates/image-poster/SKILL.md',
      required: 'Ask only when the choice would materially change',
      forbidden: ['(unknown\n— ask)'],
    },
    {
      path: 'plugins/_official/examples/image-poster/SKILL.md',
      required: 'Ask only when the choice would materially change',
      forbidden: ['(unknown\n— ask)'],
    },
    {
      path: 'design-templates/contact-widget/SKILL.md',
      required: 'Ask one\n   consolidated form only if a missing value would materially change',
      forbidden: ['Ask the user for: primary color'],
    },
    {
      path: 'design-templates/guizang-ppt/SKILL.md',
      required: 'Infer a direction; ask only when comparison is requested',
      forbidden: ['mandatory first step', 'first let the user pick', 'questions one by one'],
    },
    {
      path: 'plugins/_official/examples/guizang-ppt/SKILL.md',
      required: 'Infer a direction; ask only when comparison is requested',
      forbidden: ['mandatory first step', 'first let the user pick', 'questions one by one'],
    },
    {
      path: 'design-templates/guizang-ppt/references/styles.md',
      required: 'Show the choices\nonly when the user explicitly asks',
      forbidden: ['first let the user pick'],
    },
    {
      path: 'plugins/_official/examples/guizang-ppt/references/styles.md',
      required: 'Show the choices\nonly when the user explicitly asks',
      forbidden: ['first let the user pick'],
    },
    {
      path: 'plugins/_official/atoms/direction-picker/SKILL.md',
      required: 'Do not\nemit direction cards proactively',
      forbidden: ['lets the user choose before final generation'],
    },
    {
      path: 'plugins/community/hallmark/SKILL.md',
      required: 'Ask only when an unresolved choice\nwould materially change the result',
      forbidden: [
        'Hallmark **always** asks',
        'Default is to ask',
        'There is no "the brief looks complete" exception',
      ],
    },
  ])('$path does not restore a fixed clarification gate', ({ path, required, forbidden }) => {
    const source = readFileSync(resolve(repoRoot, path), 'utf8');
    expect(source).toContain(required);
    for (const phrase of forbidden) {
      expect(source).not.toContain(phrase);
    }
  });
});

describe('product clarification copy', () => {
  it.each([
    {
      path: 'design-templates/open-design-landing/inputs.example.json',
      required: 'When unresolved choices would materially change the result',
    },
    {
      path: 'design-templates/open-design-landing/example.html',
      required: 'When unresolved choices would materially change the result',
    },
    {
      path: 'plugins/_official/examples/open-design-landing/example.html',
      required: 'When unresolved choices would materially change the result',
    },
    {
      path: 'design-templates/open-design-landing-deck/inputs.example.json',
      required: 'only when they materially affect the result',
    },
    {
      path: 'design-templates/replit-deck/examples/README.md',
      required: 'clarify material unknowns when needed',
    },
  ])('$path describes clarification as on demand', ({ path, required }) => {
    const source = readFileSync(resolve(repoRoot, path), 'utf8');
    expect(source).toContain(required);
    expect(source).not.toContain('Turn 1 is a question form');
    expect(source).not.toContain('pops before a single pixel');
    expect(source).not.toContain('30s question form locks');
  });
});
