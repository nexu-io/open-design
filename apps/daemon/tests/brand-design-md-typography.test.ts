import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { readBrandDetail, startBrandExtraction } from '../src/brands/index.js';
import { closeDatabase, openDatabase } from '../src/db.js';

const skillsRoot = fileURLToPath(new URL('../../../skills', import.meta.url));
const palette = `Accent: #B8422E
Background: #F7F5F2
Foreground: #1A1C1E`;
const families = `Display: Barlow Condensed
Body: Barlow`;
const noAssetFallback = async () => ({ changed: false });

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-typography-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

it.each([
  { heading: 'Brand tokens', markdown: `## Brand tokens\n${families}\n${palette}` },
  { heading: 'Typography', markdown: `## Brand tokens\n${palette}\n\n## Typography\n${families}` },
])('persists plain font role labels from $heading in the brand and component kit', async ({ markdown }) => {
  const brandsRoot = path.join(tempDir, 'brands');
  const projectsRoot = path.join(tempDir, 'projects');
  let backgroundExtraction: Promise<unknown> | undefined;

  const result = await startBrandExtraction({
    designMd: `# Heritage\n\n${markdown}`,
    brandsRoot,
    projectsRoot,
    skillsRoot,
    db: openDatabase(tempDir, { dataDir: tempDir }),
    userDesignSystemsRoot: path.join(tempDir, 'user-design-systems'),
    logoFallback: noAssetFallback,
    imageryFallback: noAssetFallback,
    onBackgroundExtraction: (settled) => {
      backgroundExtraction = settled;
    },
  });
  if (!backgroundExtraction) throw new Error('expected background extraction to start');
  await backgroundExtraction;

  const detail = readBrandDetail(brandsRoot, result.id);
  expect(detail?.meta.status).toBe('ready');
  expect(detail?.brand?.typography.display.family).toBe('Barlow Condensed');
  expect(detail?.brand?.typography.body.family).toBe('Barlow');

  const systemDir = path.join(projectsRoot, result.projectId, 'system');
  expect(readFileSync(path.join(systemDir, 'kit.html'), 'utf8')).toContain(
    "h1,h2,h3{font-family:'Barlow Condensed',",
  );
  expect(readFileSync(path.join(systemDir, 'variables.css'), 'utf8')).toContain(
    '--brand-font-family: Barlow,',
  );
});
