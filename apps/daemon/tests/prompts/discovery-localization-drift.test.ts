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

// The task-type router form ships in THREE copies: the two discovery prompt
// mirrors above plus the od-default skill. All three must stay on the same
// form contract — the top-level `"lang"` tag that keys the host's in-card
// controls, and `allowCustom: false` on `taskType` (its own "Other" option IS
// the route; the host's Other chip would duplicate it). Review: PR #5573.
const taskTypeFormPaths = [
  ...promptPaths,
  'plugins/_official/scenarios/od-default/SKILL.md',
] as const;

describe('task-type form contract parity', () => {
  it.each(taskTypeFormPaths)('%s carries lang and pins taskType allowCustom: false', (path) => {
    const source = readFileSync(resolve(repoRoot, path), 'utf8');
    const formStart = source.indexOf('<question-form id="task-type"');
    expect(formStart).toBeGreaterThanOrEqual(0);
    const form = source.slice(formStart, source.indexOf('</question-form>', formStart));

    expect(form).toContain('"lang": "en"');
    const taskTypeIdx = form.indexOf('"id": "taskType"');
    expect(taskTypeIdx).toBeGreaterThanOrEqual(0);
    // allowCustom must be pinned inside the taskType question object,
    // before its options array closes the question.
    const taskTypeSlice = form.slice(taskTypeIdx, form.indexOf('"id":', taskTypeIdx + 1));
    expect(taskTypeSlice).toContain('"allowCustom": false');
  });
});
