import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DEEPSEEK_SKILLS } from '../app/_lib/deepseek-design';
import { DEFAULT_LOCALE, LANDING_LOCALES } from '../app/i18n';

interface StaticPath {
  params: { locale: string };
}

async function readRoute(url: URL): Promise<string | undefined> {
  try {
    return await readFile(url, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function localizedStaticPaths(source: string): StaticPath[] {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1];
  assert.ok(frontmatter, 'localized wrapper must have Astro frontmatter');

  const executable = frontmatter
    .replace(/^import .*;$/gm, '')
    .replace('export function getStaticPaths()', 'function getStaticPaths()');
  const evaluate = new Function(
    'LANDING_LOCALES',
    'DEFAULT_LOCALE',
    `${executable}\nreturn getStaticPaths();`,
  ) as (locales: typeof LANDING_LOCALES, defaultLocale: string) => StaticPath[];

  return evaluate(LANDING_LOCALES, DEFAULT_LOCALE);
}

test('every curated DeepSeek plugin has canonical and localized detail wrappers', async () => {
  const routeIssues: string[] = [];

  for (const { slug } of DEEPSEEK_SKILLS) {
    const canonical = await readRoute(
      new URL(`../app/pages/plugins/${slug}/index.astro`, import.meta.url),
    );
    const localized = await readRoute(
      new URL(`../app/pages/[locale]/plugins/${slug}/index.astro`, import.meta.url),
    );

    if (!canonical) {
      routeIssues.push(`/plugins/${slug}/: missing canonical wrapper`);
    } else {
      if (!canonical.includes("DeepseekSkillDetail from '../../../_components/deepseek-skill-detail.astro'")) {
        routeIssues.push(`/plugins/${slug}/: canonical wrapper uses the wrong detail component`);
      }
      if (!canonical.includes(`getDeepseekSkill('${slug}')!`)) {
        routeIssues.push(`/plugins/${slug}/: canonical wrapper is not bound to ${slug}`);
      }
    }

    if (!localized) {
      routeIssues.push(`/{locale}/plugins/${slug}/: missing localized wrapper`);
    } else {
      if (!localized.includes(`../../../plugins/${slug}/index.astro`)) {
        routeIssues.push(`/{locale}/plugins/${slug}/: localized wrapper is not bound to ${slug}`);
      }
      const expectedPaths = LANDING_LOCALES
        .filter((locale) => locale.code !== DEFAULT_LOCALE)
        .map((locale) => ({ params: { locale: locale.code } }));
      try {
        assert.deepEqual(localizedStaticPaths(localized), expectedPaths);
      } catch {
        routeIssues.push(`/{locale}/plugins/${slug}/: localized wrapper emits the wrong active locales`);
      }
    }
  }

  assert.deepEqual(routeIssues, []);
});
