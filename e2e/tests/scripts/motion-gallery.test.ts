import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'vitest';
import { agentPrompt, loadCatalog, orderedTemplates, repoRoot, type Locale } from '../../../scripts/motion-templates/catalog.ts';

const catalog = await loadCatalog();
const items = orderedTemplates(catalog);
const byId = new Map(items.map(item => [item.id, item]));

for (const locale of ['en', 'zh-CN'] as const satisfies readonly Locale[]) {
  test(`${locale} copied gallery briefs resolve the exact published OpenMotion reference`, async () => {
    const filename = locale === 'zh-CN' ? 'README.zh-CN.md' : 'README.md';
    const markdown = await readFile(path.join(repoRoot, 'docs/motion-templates', filename), 'utf8');
    const briefs = [...markdown.matchAll(/```markdown\n([^\n]+)\n```/g)].map(match => match[1]!);
    assert.equal(briefs.length, items.length);

    for (const [index, item] of items.entries()) {
      const brief = briefs[index]!;
      // The template tool looks up the complete ID, including its namespace.
      const resolved = brief.split(/\s+/).map(token => byId.get(token)).filter(Boolean);
      assert.deepEqual(resolved.map(reference => reference?.id), [item.id], `${item.code}: copied text must resolve its published ID exactly`);
      assert.match(brief, /\bOpenMotion\b/, `${item.code}: identify the tool for the receiving agent`);
      assert.equal(brief, agentPrompt(item, locale, 'card'));
    }
  });
}
