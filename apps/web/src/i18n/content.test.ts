import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../../daemon/src/frontmatter';
import { GERMAN_CONTENT_IDS } from './content';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
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
      // Missing optional registry files are ignored, matching daemon discovery.
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
      const { data } = parseFrontmatter(raw) as { data: { name?: unknown } };
      const name = data.name;
      return typeof name === 'string' && name.trim() ? name : dir;
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

describe('German display content coverage', () => {
  it('covers every curated skill, design system, and prompt template', async () => {
    const [skillIds, designSystemIds, promptTemplateSummaries] = await Promise.all([
      readSkillIds(),
      readDesignSystemIds(),
      readPromptTemplateSummaries(),
    ]);

    expect(sorted(GERMAN_CONTENT_IDS.skills), 'skills display copy').toEqual(skillIds);
    expect(sorted(GERMAN_CONTENT_IDS.designSystems), 'design-system summaries').toEqual(
      designSystemIds,
    );
    expect(sorted(GERMAN_CONTENT_IDS.promptTemplates), 'prompt-template metadata').toEqual(
      sorted(promptTemplateSummaries.map((template) => template.id)),
    );
  });

  it('covers every curated display category and prompt tag', async () => {
    const [designSystemCategories, promptTemplateSummaries] = await Promise.all([
      readDesignSystemCategories(),
      readPromptTemplateSummaries(),
    ]);
    const promptTemplateCategories = new Set(
      promptTemplateSummaries.map((template) => template.category),
    );
    const promptTemplateTags = new Set(promptTemplateSummaries.flatMap((template) => template.tags));

    expect(sorted(GERMAN_CONTENT_IDS.designSystemCategories)).toEqual(
      expect.arrayContaining(designSystemCategories),
    );
    expect(sorted(GERMAN_CONTENT_IDS.promptTemplateCategories)).toEqual(
      expect.arrayContaining(sorted(promptTemplateCategories)),
    );
    expect(sorted(GERMAN_CONTENT_IDS.promptTemplateTags)).toEqual(
      expect.arrayContaining(sorted(promptTemplateTags)),
    );
  });
});
