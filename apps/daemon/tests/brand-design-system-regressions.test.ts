import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { brandNameFromTitle } from '../src/brands/prefetch.js';
import {
  createUserDesignSystem,
  readDesignSystemStaticFile,
  updateUserDesignSystem,
} from '../src/design-systems/index.js';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'od-ds-regression-'));
}

/** A brand-extracted DESIGN.md: YAML frontmatter first, then the title H1. */
function brandDesignMd(title: string): string {
  return [
    '---',
    `name: "${title}"`,
    'category: Brands',
    'surface: web',
    'colors:',
    '  background: "#ffffff"',
    '---',
    '',
    `# ${title}`,
    '',
    '> Category: Brands',
    '',
    '*A tagline.*',
    '',
    '## Color Palette',
    '',
    '| Role | Name | Hex | Usage |',
    '| --- | --- | --- | --- |',
    '',
  ].join('\n');
}

describe('design-system header rewrite keeps frontmatter parseable', () => {
  it('does not add a second H1 above the frontmatter when the title is unchanged', async () => {
    // Publishing an extracted brand (PATCH /api/design-systems/:id) re-applies
    // the header with the SAME title. That used to prepend a duplicate H1 above
    // the `---` block, which stopped the frontmatter from parsing at all and
    // rendered the raw YAML as identity prose.
    const root = tmpRoot();
    const title = 'Stripe | Financial Infrastructure to Grow Your Revenue';
    const created = await createUserDesignSystem(root, {
      title,
      category: 'Brands',
      surface: 'web',
      body: brandDesignMd(title),
      artifactMode: 'agent-managed',
    });

    await updateUserDesignSystem(root, created.id, { status: 'published' });

    const dirId = created.id.replace(/^user:/, '');
    const body = fs.readFileSync(path.join(root, dirId, 'DESIGN.md'), 'utf8');
    expect(body.startsWith('---\n')).toBe(true);
    expect(body.match(/^#[ \t]+/gm)?.length).toBe(1);
  });

  it('repairs a package whose frontmatter was already pushed below the heading', async () => {
    // Packages corrupted before the guard existed heal on the next write.
    const root = tmpRoot();
    const corrupted = [
      '# Acme',
      '',
      '---',
      'name: "Acme"',
      'category: Brands',
      '---',
      '',
      'Body copy.',
      '',
    ].join('\n');
    const created = await createUserDesignSystem(root, {
      title: 'Acme',
      category: 'Brands',
      surface: 'web',
      body: corrupted,
      artifactMode: 'agent-managed',
    });

    await updateUserDesignSystem(root, created.id, { status: 'published' });

    const dirId = created.id.replace(/^user:/, '');
    const body = fs.readFileSync(path.join(root, dirId, 'DESIGN.md'), 'utf8');
    expect(body.startsWith('---\n')).toBe(true);
    expect(body.match(/^#[ \t]+/gm)?.length).toBe(1);
  });

  it('inserts a missing H1 below the frontmatter, never above it', async () => {
    const root = tmpRoot();
    const headless = ['---', 'name: "Acme"', 'category: Brands', '---', '', 'Body copy.', ''].join('\n');
    const created = await createUserDesignSystem(root, {
      title: 'Acme',
      category: 'Brands',
      surface: 'web',
      body: headless,
      artifactMode: 'agent-managed',
    });

    await updateUserDesignSystem(root, created.id, { title: 'Acme' });

    const dirId = created.id.replace(/^user:/, '');
    const body = fs.readFileSync(path.join(root, dirId, 'DESIGN.md'), 'utf8');
    expect(body.startsWith('---\n')).toBe(true);
    expect(body.indexOf('# Acme')).toBeGreaterThan(body.indexOf('\n---\n'));
  });

  it('leaves ordinary horizontal rules under a heading exactly where the author put them', async () => {
    // `# Title` followed by two `---` rules is also plain Markdown. Only a block
    // that parses as real frontmatter may be hoisted; a fenced section must
    // survive a metadata write byte-for-byte.
    const root = tmpRoot();
    const authored = [
      '# Acme',
      '',
      '---',
      'Introduction',
      '---',
      '',
      'Details',
      '',
    ].join('\n');
    const created = await createUserDesignSystem(root, {
      title: 'Acme',
      category: 'Brands',
      surface: 'web',
      body: authored,
      artifactMode: 'agent-managed',
    });
    const dirId = created.id.replace(/^user:/, '');
    const designPath = path.join(root, dirId, 'DESIGN.md');
    const before = fs.readFileSync(designPath, 'utf8');

    await updateUserDesignSystem(root, created.id, { status: 'published' });

    const after = fs.readFileSync(designPath, 'utf8');
    // The only permitted difference is the header metadata this write adds.
    expect(after.replace(/^> (?:Category|Surface): .*$\n?/gm, '')).toBe(before);
    expect(after.indexOf('# Acme')).toBeLessThan(after.indexOf('---'));
    expect(after).toContain('---\nIntroduction\n---');
  });

  it('leaves a colon-bearing fenced section in place (prose is valid YAML too)', async () => {
    // `Introduction: hello` parses as the mapping { Introduction: 'hello' }, so
    // "non-empty mapping" is not a strong enough predicate either. Only a block
    // carrying real design-system metadata may be hoisted.
    const root = tmpRoot();
    const authored = [
      '# Acme',
      '',
      '---',
      'Introduction: hello',
      '---',
      '',
      'Details',
      '',
    ].join('\n');
    const created = await createUserDesignSystem(root, {
      title: 'Acme',
      category: 'Brands',
      surface: 'web',
      body: authored,
      artifactMode: 'agent-managed',
    });
    const dirId = created.id.replace(/^user:/, '');
    const designPath = path.join(root, dirId, 'DESIGN.md');
    const before = fs.readFileSync(designPath, 'utf8');

    await updateUserDesignSystem(root, created.id, { status: 'published' });

    const after = fs.readFileSync(designPath, 'utf8');
    expect(after.replace(/^> (?:Category|Surface): .*$\n?/gm, '')).toBe(before);
    expect(after.indexOf('# Acme')).toBeLessThan(after.indexOf('---'));
    expect(after).toContain('---\nIntroduction: hello\n---');
  });

  it('renames the real H1, not a `#` comment line inside the frontmatter', async () => {
    // `# …` is a YAML comment, so a naive first-`#` search lands inside the
    // frontmatter: the comment gets rewritten, the title never changes, and the
    // `> Category:` line is spliced into the YAML block.
    const root = tmpRoot();
    const withComment = [
      '---',
      '# harvested 2026-01-01',
      'name: "Acme"',
      'category: Brands',
      'surface: web',
      '---',
      '',
      '# Acme',
      '',
      'Body copy.',
      '',
    ].join('\n');
    const created = await createUserDesignSystem(root, {
      title: 'Acme',
      category: 'Brands',
      surface: 'web',
      body: withComment,
      artifactMode: 'agent-managed',
    });

    await updateUserDesignSystem(root, created.id, { title: 'Acme Renamed' });

    const dirId = created.id.replace(/^user:/, '');
    const body = fs.readFileSync(path.join(root, dirId, 'DESIGN.md'), 'utf8');
    expect(body).toContain('# harvested 2026-01-01');
    expect(body).toContain('# Acme Renamed');
    // Metadata belongs under the H1, never inside the YAML block.
    expect(body.indexOf('> Category:')).toBeGreaterThan(body.indexOf('# Acme Renamed'));
    expect(body.match(/^#[ \t]+/gm)?.length).toBe(2); // the comment + one H1
  });
});

describe('brand package serves its own kit assets', () => {
  it('allows brand.json and harvested logo/imagery files through static reads', async () => {
    // The scaffold project an extraction runs in is disposable; the package copy
    // is what keeps a design system's logo rendering after that project is gone.
    const root = tmpRoot();
    const created = await createUserDesignSystem(root, {
      title: 'Acme',
      category: 'Brands',
      surface: 'web',
      body: brandDesignMd('Acme'),
      artifactMode: 'agent-managed',
    });
    const dirId = created.id.replace(/^user:/, '');
    fs.writeFileSync(
      path.join(root, dirId, 'brand.json'),
      JSON.stringify({ name: 'Acme', logo: { primary: 'logos/mark.svg', alternates: [] } }),
    );
    fs.mkdirSync(path.join(root, dirId, 'logos'), { recursive: true });
    fs.writeFileSync(path.join(root, dirId, 'logos', 'mark.svg'), '<svg/>');

    const brand = await readDesignSystemStaticFile(root, created.id, 'brand.json', {
      idPrefix: 'user:',
    });
    expect(brand?.bytes.toString('utf8')).toContain('logos/mark.svg');

    const logo = await readDesignSystemStaticFile(root, created.id, 'logos/mark.svg', {
      idPrefix: 'user:',
    });
    expect(logo?.bytes.toString('utf8')).toBe('<svg/>');

    // Traversal and unrelated files stay blocked.
    expect(
      await readDesignSystemStaticFile(root, created.id, '../secret.txt', { idPrefix: 'user:' }),
    ).toBeNull();
  });
});

describe('brand name from a marketing page title', () => {
  it('keeps the brand and drops the tagline when the hostname agrees', () => {
    expect(
      brandNameFromTitle('Stripe | Financial Infrastructure to Grow Your Revenue', 'https://stripe.com/'),
    ).toBe('Stripe');
    expect(brandNameFromTitle('Linear – Plan and build products', 'https://linear.app')).toBe('Linear');
  });

  it('leaves titles alone when splitting would be a guess', () => {
    // No separator at all.
    expect(brandNameFromTitle('Acme Corporation', 'https://acme.com')).toBe('Acme Corporation');
    // Lead segment is long and the tail is short: not the "Brand | promise" shape.
    const wordy = 'Everything you need to know about widgets | Blog';
    expect(brandNameFromTitle(wordy, 'https://example.org')).toBe(wordy);
  });

  it('returns an empty string for an empty title', () => {
    expect(brandNameFromTitle('', 'https://acme.com')).toBe('');
  });
});
