import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>;
  }
}

type LocalizedContentModule = {
  localizeDesignSystemCategory: (locale: string, category: string) => string;
  localizeDesignSystemSummary: (locale: string, system: DesignSystemResource) => string;
  localizePromptTemplateSummary: (
    locale: string,
    template: PromptTemplateResource,
  ) => PromptTemplateResource;
  localizeSkillDescription: (locale: string, skill: SkillResource) => string;
};

type SkillResource = { id: string; description: string };
type DesignSystemResource = { id: string; category: string; summary: string | null };
type PromptTemplateResource = { id: string; category: string; tags: string[]; title: string; summary: string };

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const webContentModules = import.meta.glob<LocalizedContentModule>(
  '../../apps/web/src/i18n/content.ts',
  { eager: true },
);
const localizedContentModule = Object.values(webContentModules)[0];

if (localizedContentModule == null) {
  throw new Error('Failed to load apps/web localized content ids');
}

const {
  localizeDesignSystemCategory,
  localizeDesignSystemSummary,
  localizePromptTemplateSummary,
  localizeSkillDescription,
} = localizedContentModule;
const COVERAGE_LOCALES = ['de', 'fr', 'ru'] as const;
const RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function uniqueSorted(values: Iterable<string>): string[] {
  return sorted(new Set(values));
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertResourceId(id: string, label: string): void {
  invariant(RESOURCE_ID_PATTERN.test(id), `${label} has malformed resource id: ${id}`);
}

async function assertDirectory(root: string, label: string): Promise<void> {
  let info;
  try {
    info = await stat(root);
  } catch (error) {
    throw new Error(`${label} root is missing: ${root}`, { cause: error });
  }
  invariant(info.isDirectory(), `${label} root is not a directory: ${root}`);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractYamlScalar(frontmatter: string, key: string): string | null {
  const lines = frontmatter.split(/\r?\n/);
  const keyPattern = new RegExp(`^${key}:\\s*(.*?)\\s*$`);
  const keyIndex = lines.findIndex((line) => keyPattern.test(line));
  if (keyIndex === -1) return null;

  const keyLine = lines[keyIndex];
  invariant(keyLine, `YAML key ${key} is missing after lookup`);
  const rawValue = keyPattern.exec(keyLine)?.[1]?.trim() ?? '';
  invariant(
    !rawValue.startsWith('|') || /^([|])[-+]?$/.test(rawValue),
    `Skill frontmatter key ${key} has malformed block scalar marker: ${rawValue}`,
  );
  invariant(
    !rawValue.startsWith('>') || /^([>])[-+]?$/.test(rawValue),
    `Skill frontmatter key ${key} has malformed block scalar marker: ${rawValue}`,
  );
  const blockMarker = /^([|>])[-+]?$/.exec(rawValue)?.[1];
  if (blockMarker) {
    const blockLines: string[] = [];
    for (const line of lines.slice(keyIndex + 1)) {
      if (/^\S/.test(line)) break;
      blockLines.push(line.replace(/^\s{2}/, ''));
    }
    const value = normalizeText(blockLines.join(blockMarker === '>' ? ' ' : '\n'));
    return value || null;
  }

  invariant(
    !rawValue.startsWith('"') || rawValue.endsWith('"'),
    `Skill frontmatter key ${key} has malformed quoted scalar`,
  );
  invariant(
    !rawValue.startsWith("'") || rawValue.endsWith("'"),
    `Skill frontmatter key ${key} has malformed quoted scalar`,
  );
  invariant(
    !rawValue.endsWith('"') || rawValue.startsWith('"'),
    `Skill frontmatter key ${key} has malformed quoted scalar`,
  );
  invariant(
    !rawValue.endsWith("'") || rawValue.startsWith("'"),
    `Skill frontmatter key ${key} has malformed quoted scalar`,
  );

  const value = unquoteYamlScalar(rawValue);
  return value ? normalizeText(value) : null;
}

function parseFrontmatter(filePath: string, src: string): string {
  const text = src.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  invariant(match?.[1], `Skill frontmatter is missing: ${filePath}`);
  return match[1];
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

async function readSkillRootResources(rootName: 'skills' | 'design-templates'): Promise<SkillResource[]> {
  const skillsRoot = path.join(repoRoot, rootName);
  await assertDirectory(skillsRoot, rootName);

  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const resources = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const filePath = path.join(skillsRoot, entry.name, 'SKILL.md');
        let raw: string;
        try {
          raw = await readFile(filePath, 'utf8');
        } catch (error) {
          throw new Error(`${rootName} resource is missing required file: ${filePath}`, { cause: error });
        }
        const frontmatter = parseFrontmatter(filePath, raw);
        const id = extractYamlScalar(frontmatter, 'name') ?? entry.name;
        assertResourceId(id, `${rootName} ${entry.name}`);
        const description = extractYamlScalar(frontmatter, 'description');
        invariant(
          description,
          `${rootName} ${id} is missing required English fallback field: description`,
        );
        return { id, description };
      }),
  );

  return resources.sort((a, b) => a.id.localeCompare(b.id));
}

async function readSkillResources(): Promise<SkillResource[]> {
  const [skills, designTemplates] = await Promise.all([
    readSkillRootResources('skills'),
    readSkillRootResources('design-templates'),
  ]);
  return [...skills, ...designTemplates].sort((a, b) => a.id.localeCompare(b.id));
}

async function readDesignSystemResources(): Promise<DesignSystemResource[]> {
  const systemsRoot = path.join(repoRoot, 'design-systems');
  await assertDirectory(systemsRoot, 'design systems');

  const entries = await readdir(systemsRoot, { withFileTypes: true });
  const resources = await Promise.all(
    entries
      // Skip meta-directories whose names begin with `_` (e.g. `_schema/`,
      // which holds the shared token contract — not a brand). This mirrors
      // the leading-underscore-is-meta convention used by Jekyll, Hugo,
      // SCSS partials, etc. The daemon's listDesignSystems already filters
      // these out implicitly (it requires DESIGN.md); doing the same here
      // keeps the localized-content guard aligned with the runtime registry.
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(async (entry) => {
        assertResourceId(entry.name, `Design system directory ${entry.name}`);
        const filePath = path.join(systemsRoot, entry.name, 'DESIGN.md');
        let raw: string;
        try {
          raw = await readFile(filePath, 'utf8');
        } catch (error) {
          throw new Error(`Design system resource is missing required file: ${filePath}`, {
            cause: error,
          });
        }

        const category = normalizeText(/^>\s*Category:\s*(.+?)\s*$/im.exec(raw)?.[1] ?? '');
        invariant(
          category,
          `Design system ${entry.name} is missing required English fallback field: category`,
        );

        const summaryLine = raw
          .split(/\r?\n/)
          .find((line) => /^>\s*(?!Category:)(.+?)\s*$/i.test(line));
        const summary = summaryLine ? normalizeText(summaryLine.replace(/^>\s*/, '')) : null;

        invariant(
          summary || category,
          `Design system ${entry.name} is missing required English fallback field: summary or category fallback`,
        );

        return { id: entry.name, category, summary };
      }),
  );

  return resources.sort((a, b) => a.id.localeCompare(b.id));
}

async function readPromptTemplateResources(): Promise<PromptTemplateResource[]> {
  const templatesRoot = path.join(repoRoot, 'prompt-templates');
  await assertDirectory(templatesRoot, 'prompt templates');

  const resources: PromptTemplateResource[] = [];
  for (const surface of ['image', 'video']) {
    const dir = path.join(templatesRoot, surface);
    await assertDirectory(dir, `prompt templates/${surface}`);
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const filePath = path.join(dir, entry.name);
      let rawText: string;
      try {
        rawText = await readFile(filePath, 'utf8');
      } catch (error) {
        throw new Error(`Prompt template resource is unreadable: ${filePath}`, { cause: error });
      }

      let raw: unknown;
      try {
        raw = JSON.parse(rawText);
      } catch (error) {
        throw new Error(`Prompt template JSON is malformed: ${filePath}`, { cause: error });
      }

      invariant(
        Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw),
        `Prompt template ${filePath} must be a JSON object`,
      );

      const template = raw as Record<string, unknown>;

      invariant(
        typeof template.id === 'string' && template.id.trim().length > 0,
        `Prompt template ${filePath} is missing or has malformed required id`,
      );
      const id = template.id.trim();
      assertResourceId(id, `Prompt template ${filePath}`);
      invariant(
        template.surface === surface,
        `Prompt template ${id} has mismatched surface metadata: expected ${surface}`,
      );
      invariant(
        typeof template.title === 'string' && template.title.trim().length > 0,
        `Prompt template ${id} is missing required English fallback field: title`,
      );
      invariant(
        typeof template.prompt === 'string' && template.prompt.trim().length >= 20,
        `Prompt template ${id} is missing or has malformed required prompt`,
      );

      const source = template.source;
      invariant(
        Boolean(source) && typeof source === 'object' && !Array.isArray(source),
        `Prompt template ${id} is missing or has malformed source metadata`,
      );
      const sourceRecord = source as Record<string, unknown>;
      invariant(
        typeof sourceRecord.repo === 'string' && typeof sourceRecord.license === 'string',
        `Prompt template ${id} is missing source.repo or source.license`,
      );

      const summary = typeof template.summary === 'string' ? normalizeText(template.summary) : '';
      invariant(
        summary,
        `Prompt template ${id} is missing required English fallback field: summary`,
      );
      const category =
        typeof template.category === 'string' ? normalizeText(template.category) || 'General' : 'General';
      const tags = Array.isArray(template.tags)
        ? template.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => normalizeText(tag))
            .filter((tag) => tag.length > 0)
        : [];

      resources.push({
        id,
        title: normalizeText(template.title),
        summary,
        category,
        tags,
      });
    }
  }

  return resources.sort((a, b) => a.id.localeCompare(b.id));
}

describe('localized display content coverage', () => {
  it('derives displayable resources from discovered English fallback content', async () => {
    const [skills, designSystems, promptTemplates] = await Promise.all([
      readSkillResources(),
      readDesignSystemResources(),
      readPromptTemplateResources(),
    ]);

    expect(uniqueSorted(skills.map((skill) => skill.id)), 'Expected discovered skills to be readable').not.toEqual([]);
    expect(
      uniqueSorted(designSystems.map((system) => system.id)),
      'Expected discovered design systems to be readable',
    ).not.toEqual([]);
    expect(
      uniqueSorted(promptTemplates.map((template) => template.id)),
      'Expected discovered prompt templates to be readable',
    ).not.toEqual([]);

    for (const locale of COVERAGE_LOCALES) {
      for (const skill of skills) {
        expect(
          normalizeText(localizeSkillDescription(locale, skill)),
          `${locale} should display a skill description for ${skill.id}`,
        ).not.toEqual('');
      }

      for (const system of designSystems) {
        expect(
          normalizeText(localizeDesignSystemSummary(locale, system)),
          `${locale} should display a design-system summary for ${system.id}`,
        ).not.toEqual('');
      }

      for (const template of promptTemplates) {
        const localized = localizePromptTemplateSummary(locale, template);
        expect(
          normalizeText(localized.title),
          `${locale} should display a prompt-template title for ${template.id}`,
        ).not.toEqual('');
        expect(
          normalizeText(localized.summary),
          `${locale} should display a prompt-template summary for ${template.id}`,
        ).not.toEqual('');
      }
    }
  });

  for (const locale of COVERAGE_LOCALES) {
    it(`falls back to source design-system and prompt-template metadata for ${locale} when dictionary entries are missing`, () => {
      const localized = localizePromptTemplateSummary(locale, {
        id: 'missing-template-translation',
        category: 'Untranslated Category',
        tags: ['untranslated-tag', '3d'],
        title: ' English title from source ',
        summary: ' English summary from source ',
      });

      expect(localizeDesignSystemCategory(locale, 'Untranslated Category')).toBe(
        'Untranslated Category',
      );
      expect(localized.title).toBe(' English title from source ');
      expect(localized.summary).toBe(' English summary from source ');
      expect(localized.category).toBe('Untranslated Category');
      expect(localized.tags[0]).toBe('untranslated-tag');
      expect(normalizeText(localized.tags[1] ?? ''), `${locale} should still localize known tags`).not.toEqual(
        '3d',
      );
    });
  }
});
