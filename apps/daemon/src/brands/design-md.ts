// brandToDesignMd — render a Brand as a DESIGN.md the design-systems registry
// can parse. The frontmatter carries a `colors:` map (so the picker shows
// swatches) plus name/category/surface; the body opens with an `# <name>` H1
// (the registry's title source) followed by Color Palette, Typography, Voice &
// Tone, Imagery, and Layout sections.
//
// This is the body passed to createUserDesignSystem so a brand becomes an
// applyable, swatch-listed user design system.

import type { Brand, BrandColor, BrandFontSpec } from '@open-design/contracts';

/** Escape a value so it is safe as a double-quoted YAML scalar. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Slugify a color name into a stable, unique-friendly frontmatter map key. */
function colorKey(color: BrandColor, used: Set<string>): string {
  const base =
    (color.name || color.role)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || color.role;
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}-${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

/** Frontmatter `colors:` block — a `<name>: <hex>` map the registry reads to
 *  derive swatches. */
function colorsFrontmatter(colors: BrandColor[]): string {
  if (colors.length === 0) return '';
  const used = new Set<string>();
  const lines = colors
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex))
    .map((c) => `  ${colorKey(c, used)}: ${yamlString(c.hex.toLowerCase())}`);
  if (lines.length === 0) return '';
  return ['colors:', ...lines].join('\n');
}

function fontLine(label: string, spec: BrandFontSpec | undefined): string {
  if (!spec) return '';
  const weights = spec.weights.length > 0 ? spec.weights.join(', ') : '400, 700';
  const fallbacks = spec.fallbacks.length > 0 ? ` — fallbacks: ${spec.fallbacks.join(', ')}` : '';
  const notes = spec.notes ? ` (${spec.notes})` : '';
  return `- **${label}:** ${spec.family} — weights ${weights}${fallbacks}${notes}`;
}

function bulletList(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '- (none)';
}

/**
 * Render a Brand into DESIGN.md markdown with YAML frontmatter. The body's
 * Color Palette table and frontmatter `colors:` map both reference the same
 * hex values, so the registry's swatch extraction (frontmatter map OR table
 * row) resolves the palette either way.
 */
export function brandToDesignMd(brand: Brand): string {
  const colorsBlock = colorsFrontmatter(brand.colors);
  const frontmatter = [
    '---',
    `name: ${yamlString(brand.name)}`,
    'category: Brands',
    'surface: web',
    ...(colorsBlock ? [colorsBlock] : []),
    '---',
  ].join('\n');

  const paletteRows = brand.colors
    .map((c) => `| ${c.role} | ${c.name} | \`${c.hex}\` | ${c.usage || '—'} |`)
    .join('\n');

  const sections: string[] = [];

  sections.push(`# ${brand.name}`);
  sections.push('> Category: Brands');
  sections.push('> Surface: web');
  if (brand.tagline) sections.push(`*${brand.tagline}*`);
  if (brand.description) sections.push(brand.description);

  sections.push(
    [
      '## Color Palette',
      '',
      '| Role | Name | Hex | Usage |',
      '| --- | --- | --- | --- |',
      paletteRows,
    ].join('\n'),
  );

  sections.push(
    [
      '## Typography',
      '',
      fontLine('Display', brand.typography.display),
      fontLine('Body', brand.typography.body),
      ...(brand.typography.mono ? [fontLine('Mono', brand.typography.mono)] : []),
    ]
      .filter(Boolean)
      .join('\n'),
  );

  sections.push(
    [
      '## Voice & Tone',
      '',
      `- **Adjectives:** ${brand.voice.adjectives.length > 0 ? brand.voice.adjectives.join(', ') : '(none yet)'}`,
      `- **Tone:** ${brand.voice.tone || '(none yet)'}`,
      '',
      '### Messaging pillars',
      bulletList(brand.voice.messagingPillars),
      '',
      '### Vocabulary',
      `- **Use:** ${brand.voice.vocabulary.use.length > 0 ? brand.voice.vocabulary.use.join(', ') : '(none yet)'}`,
      `- **Avoid:** ${brand.voice.vocabulary.avoid.length > 0 ? brand.voice.vocabulary.avoid.join(', ') : '(none yet)'}`,
    ].join('\n'),
  );

  sections.push(
    [
      '## Imagery',
      '',
      `- **Style:** ${brand.imagery.style || '(none yet)'}`,
      `- **Subjects:** ${brand.imagery.subjects.length > 0 ? brand.imagery.subjects.join(', ') : '(none yet)'}`,
      `- **Treatment:** ${brand.imagery.treatment || '(none yet)'}`,
      `- **Avoid:** ${brand.imagery.avoid.length > 0 ? brand.imagery.avoid.join(', ') : '(none yet)'}`,
    ].join('\n'),
  );

  sections.push(
    [
      '## Layout',
      '',
      `- **Radius:** ${brand.layout.radius}`,
      `- **Border weight:** ${brand.layout.borderWeight}`,
      `- **Spacing:** ${brand.layout.spacing}`,
      '',
      '### Posture rules',
      bulletList(brand.layout.postureRules),
    ].join('\n'),
  );

  return `${frontmatter}\n\n${sections.join('\n\n')}\n`;
}

/**
 * Short prose brand guide, stored alongside brand.json and surfaced as the
 * BrandDetailResponse `guide`. A light wrapper over the same fields — the rich
 * agent-authored guide can replace it during a later enrichment pass.
 */
export function brandGuideMd(brand: Brand): string {
  const lines: string[] = [`# ${brand.name} — Brand Guide`, ''];
  if (brand.tagline) lines.push(`*${brand.tagline}*`, '');
  if (brand.description) lines.push(brand.description, '');
  if (brand.sourceUrl) lines.push(`Extracted from ${brand.sourceUrl}.`, '');

  lines.push('## Color roles', '');
  for (const c of brand.colors) {
    lines.push(`- **${c.name}** (\`${c.hex}\`) — ${c.role}${c.usage ? `: ${c.usage}` : ''}`);
  }
  lines.push('');

  lines.push('## Typography', '');
  lines.push(`- Display: ${brand.typography.display.family}`);
  lines.push(`- Body: ${brand.typography.body.family}`);
  if (brand.typography.mono) lines.push(`- Mono: ${brand.typography.mono.family}`);
  lines.push('');

  if (brand.voice.messagingPillars.length > 0) {
    lines.push('## Messaging pillars', '');
    for (const p of brand.voice.messagingPillars) lines.push(`- ${p}`);
    lines.push('');
  }

  return lines.join('\n');
}
