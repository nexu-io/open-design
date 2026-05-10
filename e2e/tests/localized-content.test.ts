import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>;
  }
}

type LocalizedContentIds = {
  skills: string[];
  designSystems: string[];
  designSystemCategories: string[];
  promptTemplates: string[];
  promptTemplateCategories: string[];
  promptTemplateTags: string[];
};

type LocalizedContentModule = {
  LOCALIZED_CONTENT_IDS: Record<string, LocalizedContentIds>;
};

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const webContentModules = import.meta.glob<LocalizedContentModule>(
  '../../apps/web/src/i18n/content.ts',
  { eager: true },
);
const localizedContentModule = Object.values(webContentModules)[0];

if (localizedContentModule == null) {
  throw new Error('Failed to load apps/web localized content ids');
}

const { LOCALIZED_CONTENT_IDS } = localizedContentModule;

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function uniqueSorted(values: Iterable<string>): string[] {
  return sorted(new Set(values));
}

function findMissingIds(localizedIds: Iterable<string>, discoveredIds: Iterable<string>): string[] {
  const localized = new Set(localizedIds);
  const discovered = new Set(discoveredIds);
  return sorted([...discovered].filter((id) => !localized.has(id)));
}

function expectExactResourceCoverage(
  label: string,
  localizedIds: Iterable<string>,
  discoveredIds: Iterable<string>,
): void {
  const missing = findMissingIds(localizedIds, discoveredIds);
  expect(missing, `${label} should cover every discovered resource`).toEqual([]);
}

async function entriesWithFile(root: string, fileName: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(root, entry.name, fileName);
    try {
      if ((await stat(filePath)).isFile()) {
        ids.push(entry.name);
      }
    } catch {
      // Missing optional registry files are ignored, matching resource discovery.
    }
  }
  return sorted(ids);
}

async function readSkillIds(): Promise<string[]> {
  const skillsRoot = path.join(repoRoot, 'skills');
  const dirs = await entriesWithFile(skillsRoot, 'SKILL.md');
  const ids = await Promise.all(
    dirs.map(async (dir) => {
      const raw = await readFile(path.join(skillsRoot, dir, 'SKILL.md'), 'utf8');
      return readFrontmatterName(raw) ?? dir;
    }),
  );
  return sorted(ids);
}

async function readDesignSystemIds(): Promise<string[]> {
  return entriesWithFile(path.join(repoRoot, 'design-systems'), 'DESIGN.md');
}

async function readDesignSystemCategories(): Promise<string[]> {
  const systemsRoot = path.join(repoRoot, 'design-systems');
  const ids = await readDesignSystemIds();
  const categories = await Promise.all(
    ids.map(async (id) => {
      const raw = await readFile(path.join(systemsRoot, id, 'DESIGN.md'), 'utf8');
      return /^>\s*Category:\s*(.+?)\s*$/im.exec(raw)?.[1] ?? 'Uncategorized';
    }),
  );
  return sorted(new Set(categories));
}

async function readPromptTemplateSummaries(): Promise<
  Array<{ id: string; category: string; tags: string[] }>
> {
  const templatesRoot = path.join(repoRoot, 'prompt-templates');
  const summaries: Array<{ id: string; category: string; tags: string[] }> = [];
  for (const surface of ['image', 'video']) {
    const dir = path.join(templatesRoot, surface);
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const raw = JSON.parse(await readFile(path.join(dir, entry.name), 'utf8')) as {
        id?: unknown;
        category?: unknown;
        tags?: unknown;
      };
      if (typeof raw.id !== 'string' || !raw.id) continue;
      summaries.push({
        id: raw.id,
        category: typeof raw.category === 'string' ? raw.category : 'General',
        tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      });
    }
  }
  return summaries;
}

function readFrontmatterName(src: string): string | null {
  const text = src.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (match == null) return null;
  const nameMatch = /^name:\s*(.*?)\s*$/im.exec(match[1] ?? '');
  if (nameMatch == null) return null;
  const name = unquoteYamlScalar(nameMatch[1] ?? '').trim();
  return name || null;
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

describe('localized display content coverage', () => {
  for (const [locale, ids] of Object.entries(LOCALIZED_CONTENT_IDS)) {
    it(`covers every curated skill, design system, and prompt template for ${locale}`, async () => {
      const [skillIds, designSystemIds, promptTemplateSummaries] = await Promise.all([
        readSkillIds(),
        readDesignSystemIds(),
        readPromptTemplateSummaries(),
      ]);

      expectExactResourceCoverage('skills display copy', ids.skills, skillIds);
      expectExactResourceCoverage(
        'design-system summaries',
        ids.designSystems,
        designSystemIds,
      );
      expectExactResourceCoverage(
        'prompt-template metadata',
        ids.promptTemplates,
        uniqueSorted(promptTemplateSummaries.map((template) => template.id)),
      );
    });

    it(`covers every curated display category and prompt tag for ${locale}`, async () => {
      const [designSystemCategories, promptTemplateSummaries] = await Promise.all([
        readDesignSystemCategories(),
        readPromptTemplateSummaries(),
      ]);
      const promptTemplateCategories = new Set(
        promptTemplateSummaries.map((template) => template.category),
      );
      const promptTemplateTags = new Set(
        promptTemplateSummaries.flatMap((template) => template.tags),
      );

      expect(sorted(ids.designSystemCategories)).toEqual(
        expect.arrayContaining(designSystemCategories),
      );
      expect(sorted(ids.promptTemplateCategories)).toEqual(
        expect.arrayContaining(sorted(promptTemplateCategories)),
      );
      expect(sorted(ids.promptTemplateTags)).toEqual(
        expect.arrayContaining(sorted(promptTemplateTags)),
      );
    });
  }
});
