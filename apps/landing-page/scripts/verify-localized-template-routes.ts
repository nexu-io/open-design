/**
 * Post-build assertion for localized template detail URLs.
 *
 * The localized wrapper reuses the shared template renderer, so a regression
 * can leave the page canonical localized while its share action and breadcrumb
 * JSON-LD point back to English. Inspect the generated Japanese routes to keep
 * those three public URL surfaces aligned.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.join(SCRIPT_DIR, '..', 'out', 'ja', 'templates');
const SITE = 'https://open-design.ai';

assert.ok(existsSync(TEMPLATE_ROOT), 'generated Japanese template routes are missing');

const slugs = readdirSync(TEMPLATE_ROOT).filter((slug) =>
  existsSync(path.join(TEMPLATE_ROOT, slug, 'index.html')),
);
assert.ok(slugs.length > 0, 'expected at least one generated Japanese template detail route');

for (const slug of slugs) {
  const html = readFileSync(path.join(TEMPLATE_ROOT, slug, 'index.html'), 'utf8');
  const detailUrl = `${SITE}/ja/templates/${slug}/`;

  assert.ok(
    html.includes(`<link rel="canonical" href="${detailUrl}">`),
    `${slug}: localized canonical URL is missing`,
  );
  assert.ok(
    html.includes(`data-copy-link="${detailUrl}"`),
    `${slug}: share link does not match the localized canonical URL`,
  );

  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)]
    .map((match) => JSON.parse(match[1]!));
  const breadcrumb = jsonLdBlocks.find((entry) => entry['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumb, `${slug}: breadcrumb JSON-LD is missing`);
  assert.deepEqual(
    breadcrumb.itemListElement.map((item: { item: string }) => item.item),
    [`${SITE}/ja/`, `${SITE}/ja/templates/`, detailUrl],
    `${slug}: breadcrumb URLs do not match the localized route`,
  );
}

console.log(`Verified ${slugs.length} localized Japanese template detail routes.`);
