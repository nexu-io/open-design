#!/usr/bin/env node
// Sync design-systems/* from the upstream `getdesign` npm package.
//
// Usage:
//   1) curl -sL $(npm view getdesign dist.tarball) -o /tmp/getdesign.tgz
//      tar -xzf /tmp/getdesign.tgz -C /tmp
//   2) node --experimental-strip-types scripts/sync-design-systems.ts [/tmp/package/templates]
//
// Extra flags:
//   --dry-run      Preview changes without writing files
//   --brand <slug> Sync only one brand
//   --manifest     Generate sync-manifest.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ManifestEntry {
  brand: string;
  file: string;
  description: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || '/tmp/package/templates';

const args = process.argv.slice(3);

const hasFlag = (flag: string) => args.includes(flag);

const getArgValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY_RUN = hasFlag('--dry-run');
const FILTER = getArgValue('--brand');
const EXPORT_MANIFEST = hasFlag('--manifest');

const generated: ManifestEntry[] = [];

const CATEGORY: Record<string, string> = {
  claude: 'AI & LLM',
  cohere: 'AI & LLM',
  elevenlabs: 'AI & LLM',
  minimax: 'AI & LLM',
  'mistral.ai': 'AI & LLM',
  ollama: 'AI & LLM',
  'opencode.ai': 'AI & LLM',
  replicate: 'AI & LLM',
  runwayml: 'AI & LLM',
  'together.ai': 'AI & LLM',
  voltagent: 'AI & LLM',
  'x.ai': 'AI & LLM',

  cursor: 'Developer Tools',
  expo: 'Developer Tools',
  lovable: 'Developer Tools',
  raycast: 'Developer Tools',
  superhuman: 'Developer Tools',

  stripe: 'Fintech',
  paypal: 'Fintech',

  spotify: 'Media',
  netflix: 'Media',

  notion: 'Productivity',
  linear: 'Productivity',

  nike: 'Retail',
  adidas: 'Retail'
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w.-]/g, '');

const saveFile = (target: string, content: string) => {
  if (DRY_RUN) {
    console.log(`[dry-run] ${target}`);
    return;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
};

const insertCategory = (markdown: string, category: string) => {
  const lines = markdown.split('\n');

  if (!lines.length) return markdown;

  if (lines[0].startsWith('# ')) {
    lines.splice(1, 0, '', `> Category: ${category}`, '');
    return lines.join('\n');
  }

  return `> Category: ${category}\n\n${markdown}`;
};

const parseTemplates = (): ManifestEntry[] => {
  const manifestPath = path.join(SRC, 'manifest.json');

  try {
    const raw = readFileSync(manifestPath, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      brand: item.brand || slugify(item.name || 'unknown'),
      file: item.file || `${item.brand || 'unknown'}.md`,
      description: item.description || ''
    }));
  } catch {
    return [];
  }
};

const entries = parseTemplates();

if (!entries.length) {
  console.log('No templates found.');
  process.exit(0);
}

for (const entry of entries) {
  if (FILTER && entry.brand !== FILTER) continue;

  if (entry.brand === 'default' || entry.brand === 'warm-editorial') {
    console.log(`Skipped hand-authored: ${entry.brand}`);
    continue;
  }

  const inputFile = path.join(SRC, entry.file);

  let markdown = '';

  try {
    markdown = readFileSync(inputFile, 'utf8');
  } catch {
    console.log(`Missing source: ${inputFile}`);
    continue;
  }

  const category = CATEGORY[entry.brand] || 'General';
  const finalMarkdown = insertCategory(markdown, category);

  const outputFile = path.join(
    ROOT,
    'design-systems',
    slugify(entry.brand),
    'DESIGN.md'
  );

  saveFile(outputFile, finalMarkdown);

  generated.push({
    brand: entry.brand,
    file: outputFile,
    description: entry.description
  });
}

if (EXPORT_MANIFEST) {
  const manifestOut = path.join(ROOT, 'sync-manifest.json');
  saveFile(manifestOut, JSON.stringify(generated, null, 2));
}

console.log(`Synced ${generated.length} design systems`);

if (FILTER) {
  console.log(`Filtered brand: ${FILTER}`);
}  vercel: 'Developer Tools', warp: 'Developer Tools',
  // Backend & Data
  clickhouse: 'Backend & Data', composio: 'Backend & Data',
  hashicorp: 'Backend & Data', mongodb: 'Backend & Data',
  posthog: 'Backend & Data', sanity: 'Backend & Data',
  sentry: 'Backend & Data', supabase: 'Backend & Data',
  // Productivity & SaaS
  cal: 'Productivity & SaaS', intercom: 'Productivity & SaaS',
  'linear.app': 'Productivity & SaaS', mintlify: 'Productivity & SaaS',
  notion: 'Productivity & SaaS', resend: 'Productivity & SaaS',
  zapier: 'Productivity & SaaS',
  // Design & Creative
  airtable: 'Design & Creative', clay: 'Design & Creative',
  figma: 'Design & Creative', framer: 'Design & Creative',
  miro: 'Design & Creative', webflow: 'Design & Creative',
  // Fintech & Crypto
  binance: 'Fintech & Crypto', coinbase: 'Fintech & Crypto',
  kraken: 'Fintech & Crypto', mastercard: 'Fintech & Crypto',
  revolut: 'Fintech & Crypto', stripe: 'Fintech & Crypto', wise: 'Fintech & Crypto',
  // E-Commerce & Retail
  airbnb: 'E-Commerce & Retail', meta: 'E-Commerce & Retail',
  nike: 'E-Commerce & Retail', shopify: 'E-Commerce & Retail',
  starbucks: 'E-Commerce & Retail',
  // Media & Consumer
  apple: 'Media & Consumer', ibm: 'Media & Consumer',
  nvidia: 'Media & Consumer', pinterest: 'Media & Consumer',
  playstation: 'Media & Consumer', spacex: 'Media & Consumer',
  spotify: 'Media & Consumer', theverge: 'Media & Consumer',
  uber: 'Media & Consumer', vodafone: 'Media & Consumer', wired: 'Media & Consumer',
  // Automotive
  bmw: 'Automotive', bugatti: 'Automotive', ferrari: 'Automotive',
  lamborghini: 'Automotive', renault: 'Automotive', tesla: 'Automotive',
} as const;

type Brand = keyof typeof CATEGORY;

const slugOf = (brand: string): string => brand.replace(/\./g, '-');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readManifest(): ManifestEntry[] {
  const raw = readFileSync(path.join(SRC, 'manifest.json'), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('manifest.json must contain an array');
  }
  return parsed.map((entry) => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'brand' in entry &&
      'file' in entry &&
      'description' in entry &&
      typeof entry.brand === 'string' &&
      typeof entry.file === 'string' &&
      typeof entry.description === 'string'
    ) {
      return entry;
    }
    throw new Error('manifest.json contains an invalid entry');
  });
}

function main(): void {
  let manifest: ManifestEntry[];
  try {
    manifest = readManifest();
  } catch (error) {
    console.error(`Could not read manifest.json under ${SRC}: ${errorMessage(error)}`);
    console.error('Did you extract the getdesign tarball? See scripts/sync-design-systems.ts header.');
    process.exit(1);
  }

  const written: string[] = [];
  const skipped: string[] = [];

  for (const entry of manifest) {
    const { brand, file, description } = entry;
    const cat = CATEGORY[brand as Brand];
    if (!cat) { skipped.push(`${brand} (unmapped category)`); continue; }
    const slug = slugOf(brand);
    let raw: string;
    try {
      raw = readFileSync(path.join(SRC, file), 'utf8');
    } catch (error) {
      skipped.push(`${brand} (${errorMessage(error)})`);
      continue;
    }
    const lines = raw.split(/\r?\n/);
    const h1 = lines.findIndex((line) => /^#\s+/.test(line));
    if (h1 < 0) { skipped.push(`${brand} (no H1)`); continue; }
    const head = lines.slice(0, h1 + 1);
    const tail = lines.slice(h1 + 1);
    while (tail[0] === '') tail.shift();
    const body = [
      ...head,
      '',
      `> Category: ${cat}`,
      `> ${description}`,
      '',
      ...tail,
    ].join('\n');
    const dir = path.join(ROOT, 'design-systems', slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'DESIGN.md'), body);
    written.push(slug);
  }

  console.log(`wrote ${written.length} design systems → design-systems/`);
  if (skipped.length) {
    console.log('skipped:');
    for (const entry of skipped) console.log(`  - ${entry}`);
  }
}

main();
