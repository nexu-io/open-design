import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { LANDING_LOCALES } from '../app/i18n.ts';
import { getSolutionPageCopy, type SolutionPageKey } from '../app/solution-pages-i18n.ts';
import { EN } from '../app/solution-pages-i18n/en.ts';

const solutionsRoot = new URL('../app/pages/solutions/', import.meta.url);
const solutionStyles = readFileSync(new URL('../app/sub-pages.css', import.meta.url), 'utf8');
const solutionPages = readdirSync(solutionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    slug: entry.name,
    source: readFileSync(new URL(`${entry.name}/index.astro`, solutionsRoot), 'utf8'),
  }));

function getActionBlock(source: string, className: string): string {
  const start = source.indexOf(`<div class="${className}">`);
  assert.notEqual(start, -1, `${className}: action block is missing`);
  const end = source.indexOf('</div>', start);
  assert.notEqual(end, -1, `${className}: action block is not closed`);
  return source.slice(start, end);
}

test('solution pages prioritize the desktop client in every CTA group', () => {
  assert.equal(solutionPages.length, 19, 'expected every solution detail page to be covered');

  for (const { slug, source } of solutionPages) {
    const hero = getActionBlock(source, 'solution-hero-cta');
    assert.match(
      hero,
      /class="btn btn-primary solution-download-cta hero-download-attention" href=\{href\('\/download\/'\)\} data-download-cta data-direct-download data-download-placement="solution_hero">\{common\.downloadDesktop\}/,
      `${slug}: hero download must be a direct, emphasized primary CTA`,
    );
    assert.match(
      hero,
      /class="btn btn-ghost" href=\{REPO\}[^>]*>\{common\.starOnGithub\}/,
      `${slug}: hero GitHub Star must be secondary`,
    );
    assert.ok(
      hero.indexOf('common.downloadDesktop') < hero.indexOf('common.starOnGithub'),
      `${slug}: hero download must appear before GitHub Star`,
    );

    const footer = getActionBlock(source, 'info-cta-actions');
    assert.match(
      footer,
      /class="btn btn-primary solution-download-cta hero-download-attention" href=\{REPO_RELEASES\} data-download-cta data-direct-download data-download-placement="solution_footer"[^>]*>\{common\.downloadDesktop\}/,
      `${slug}: footer download must be a direct, emphasized primary CTA`,
    );
    assert.match(
      footer,
      /class="btn btn-ghost" href=\{REPO\}[^>]*>\{common\.starOnGithub\}/,
      `${slug}: footer GitHub Star must be secondary`,
    );
    assert.ok(
      footer.indexOf('common.downloadDesktop') < footer.indexOf('common.starOnGithub'),
      `${slug}: footer download must appear before GitHub Star`,
    );
  }
});

test('every active locale has localized copy for all 19 solution pages', () => {
  const keys = Object.keys(EN) as SolutionPageKey[];
  assert.equal(keys.length, 19, 'expected every solution copy key to be covered');

  for (const { code } of LANDING_LOCALES) {
    for (const key of keys) {
      const english = EN[key];
      const copy = getSolutionPageCopy(code, key);

      for (const field of ['title', 'heading', 'lead', 'ctaTitle'] as const) {
        assert.ok(copy[field].trim().length > 0, `${code}/${key}: ${field} is empty`);
      }

      if (code !== 'en') {
        assert.notEqual(
          copy.heading,
          english.heading,
          `${code}/${key}: solution heading fell back to English`,
        );
      }
    }
  }
});

test('solution download CTA styling keeps a strong, accessible interaction hierarchy', () => {
  assert.match(
    solutionStyles,
    /\.solution-page \.solution-download-cta\s*\{[^}]*min-height:\s*48px;[^}]*font-weight:\s*700;[^}]*box-shadow:/s,
  );
  assert.match(solutionStyles, /\.solution-page \.solution-download-cta:hover\s*\{/);
  assert.match(solutionStyles, /\.solution-page \.solution-download-cta:active\s*\{/);
  assert.match(solutionStyles, /\.solution-page \.solution-download-cta:focus-visible\s*\{/);
});
