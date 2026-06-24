import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractComponentsManifest,
  summarizeComponentsManifestForPrompt,
} from '../packages/contracts/src/design-systems/components-manifest.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const designSystemsRoot = path.join(repoRoot, 'design-systems');
const skippedDesignSystemDirectories = new Set(['_schema']);

type BrandSources = {
  id: string;
  fixturePath: string;
  tokensCss: string;
  fixtureHtml: string;
};

type BrandDiscovery = { sources: BrandSources[]; pairingErrors: string[] };

export async function checkComponentsManifestExtraction(): Promise<boolean> {
  const { sources, pairingErrors } = await discoverBrandSources();
  const violations: string[] = [...pairingErrors];
  let selectorCount = 0;
  let groupCount = 0;

  for (const source of sources) {
    try {
      const manifest = extractComponentsManifest({
        brandId: source.id,
        fixtureHtml: source.fixtureHtml,
        tokensCss: source.tokensCss,
      });
      const summary = summarizeComponentsManifestForPrompt(manifest);

      selectorCount += manifest.fixture.selectorCount;
      groupCount += manifest.groups.filter((group) => group.present).length;

      if (manifest.fixture.styleBlockCount === 0) {
        violations.push(`[${source.id}] ${toRepositoryPath(source.fixturePath)} has no <style> blocks to summarize.`);
      }
      if (manifest.fixture.selectorCount === 0) {
        violations.push(`[${source.id}] ${toRepositoryPath(source.fixturePath)} produced a manifest with zero CSS selectors.`);
      }
      if (!summary.includes(`components.manifest schema v${manifest.schemaVersion} for ${source.id}`)) {
        violations.push(`[${source.id}] manifest summary is missing its schema/id header.`);
      }
    } catch (err) {
      violations.push(
        `[${source.id}] failed to extract manifest from ${toRepositoryPath(source.fixturePath)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (violations.length > 0) {
    console.error('Design system component manifest extraction violations:');
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    console.error('Every compiled design system must remain consumable through the structured component manifest path.');
    return false;
  }

  console.log(
    `Design system component manifest extraction passed: ${sources.length} fixtures summarized (${selectorCount} selectors across ${groupCount} present component groups).`,
  );
  return true;
}

async function discoverBrandSources(): Promise<BrandDiscovery> {
  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  const sources: BrandSources[] = [];
  const pairingErrors: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || skippedDesignSystemDirectories.has(entry.name)) continue;

    const brandRoot = path.join(designSystemsRoot, entry.name);
    const tokensPath = path.join(brandRoot, 'tokens.css');
    const fixturePath = path.join(brandRoot, 'components.html');

    const [hasTokens, hasFixture] = await Promise.all([
      access(tokensPath).then(() => true, () => false),
      access(fixturePath).then(() => true, () => false),
    ]);

    // 둘 다 없으면 prose-only 폴더(DESIGN.md 전용) — 건너뜀
    if (!hasTokens && !hasFixture) continue;

    // 한쪽만 있으면 페어링 위반 — tokens.css / components.html 은 함께 존재해야 함
    if (hasTokens !== hasFixture) {
      const present = hasTokens ? tokensPath : fixturePath;
      const missing = hasTokens ? fixturePath : tokensPath;
      pairingErrors.push(
        `${toRepositoryPath(present)} exists but ${toRepositoryPath(missing)} does not — ` +
          `token / fixture pairs must travel together so agents always have both the values and a working example.`,
      );
      continue;
    }

    // 둘 다 있으면 정상 처리
    const [tokensCss, fixtureHtml] = await Promise.all([
      readFile(tokensPath, 'utf8'),
      readFile(fixturePath, 'utf8'),
    ]);
    sources.push({
      id: entry.name,
      fixturePath,
      tokensCss,
      fixtureHtml,
    });
  }

  return { sources: sources.sort((a, b) => a.id.localeCompare(b.id)), pairingErrors };
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  checkComponentsManifestExtraction().then((passed) => {
    process.exitCode = passed ? 0 : 1;
  }, (err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
