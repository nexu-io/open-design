import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractComponentsManifest,
  summarizeComponentsManifestForPrompt,
  type ComponentsManifest,
} from '../packages/contracts/src/design-systems/components-manifest.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const designSystemsRoot = path.join(repoRoot, 'design-systems');
const skippedDesignSystemDirectories = new Set(['_schema']);

type CliOptions = {
  brandId?: string;
  outPath?: string;
  compact: boolean;
  promptSummary: boolean;
  help: boolean;
};

type ManifestCollection = {
  schemaVersion: 1;
  count: number;
  manifests: ComponentsManifest[];
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const brandIds = options.brandId === undefined ? await discoverBrandIds() : [options.brandId];
  const manifests = await Promise.all(brandIds.map((brandId) => readManifest(brandId)));

  const output = options.promptSummary
    ? manifests.map((manifest) => summarizeComponentsManifestForPrompt(manifest)).join('\n\n')
    : JSON.stringify(toCollection(manifests), null, options.compact ? 0 : 2);

  if (options.outPath === undefined) {
    console.log(output);
    return;
  }

  const resolvedOutPath = path.resolve(repoRoot, options.outPath);
  await mkdir(path.dirname(resolvedOutPath), { recursive: true });
  await writeFile(resolvedOutPath, `${output}\n`, 'utf8');
  console.log(
    `Wrote ${manifests.length} component manifest${manifests.length === 1 ? '' : 's'} to ${toRepositoryPath(resolvedOutPath)}.`,
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    compact: false,
    promptSummary: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--compact') {
      options.compact = true;
      continue;
    }
    if (arg === '--prompt-summary') {
      options.promptSummary = true;
      continue;
    }
    if (arg === '--brand' || arg === '--design-system') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a design-system id.`);
      }
      options.brandId = value;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--out requires a path.');
      }
      options.outPath = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

async function discoverBrandIds(): Promise<string[]> {
  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !skippedDesignSystemDirectories.has(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function readManifest(brandId: string): Promise<ComponentsManifest> {
  const brandRoot = path.join(designSystemsRoot, brandId);
  const fixturePath = path.join(brandRoot, 'components.html');
  const tokensPath = path.join(brandRoot, 'tokens.css');

  const [fixtureHtml, tokensCss] = await Promise.all([readFile(fixturePath, 'utf8'), readOptionalFile(tokensPath)]);
  return tokensCss === undefined
    ? extractComponentsManifest({ brandId, fixtureHtml })
    : extractComponentsManifest({ brandId, fixtureHtml, tokensCss });
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if (isAbsenceError(err)) return undefined;
    throw err;
  }
}

function isAbsenceError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function toCollection(manifests: ComponentsManifest[]): ManifestCollection {
  return {
    schemaVersion: 1,
    count: manifests.length,
    manifests,
  };
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/extract-components-manifest.ts [options]',
    '',
    'Options:',
    '  --brand <id>           Extract one design-system id instead of all ids.',
    '  --design-system <id>   Alias for --brand.',
    '  --out <path>           Write output under the repository root instead of stdout.',
    '  --compact              Emit compact JSON when not using --prompt-summary.',
    '  --prompt-summary       Emit the short text summary intended for agent prompts.',
    '  --help                 Show this help text.',
  ].join('\n');
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
