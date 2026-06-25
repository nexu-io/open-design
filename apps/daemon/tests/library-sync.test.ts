// Daemon-side core of "see everything in the Library": reconcileLibrary mirrors
// user design systems and agent-produced project deliverables into the Library
// as *referenced* rows, classified into the Agent / Generated / Upload / Design
// system buckets the grid filters on. This pins:
//   - design systems become one `design-system` card (linking to /design-systems/:id),
//   - agent-authored pages → agent-task, generated media → generated, files the
//     user dropped in → manual-upload, and scaffolding (css/js) is excluded,
//   - the timeline buckets by the artifact's own mtime (not sync time), and
//   - the pass is idempotent (re-running indexes nothing new).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { listLibraryAssets } from '../src/library-store.js';
import { reconcileLibrary } from '../src/library-sync.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let dataDir: string;
let projectsDir: string;
let designSystemsDir: string;
let libraryDir: string;

const PROJECT_ID = 'proj-1';
const DS_DIR = 'acme';
// A fixed past day so we can assert the timeline buckets by file mtime.
const ARTIFACT_DATE = '2021-04-08';
const ARTIFACT_TS = new Date(`${ARTIFACT_DATE}T12:00:00`).getTime();

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-library-sync-'));
  projectsDir = path.join(dataDir, 'projects');
  designSystemsDir = path.join(dataDir, 'design-systems');
  libraryDir = path.join(dataDir, 'library');
  await mkdir(projectsDir, { recursive: true });
  await mkdir(designSystemsDir, { recursive: true });
  db = openDatabase(dataDir, { dataDir });
});

afterEach(async () => {
  closeDatabase();
  await rm(dataDir, { recursive: true, force: true });
});

async function seedProject(): Promise<void> {
  const now = Date.now();
  insertProject(db, { id: PROJECT_ID, name: 'Proj', createdAt: now, updatedAt: now });
  insertConversation(db, {
    id: 'conv-1',
    projectId: PROJECT_ID,
    title: 'C',
    createdAt: now,
    updatedAt: now,
  });

  const dir = path.join(projectsDir, PROJECT_ID);
  await mkdir(dir, { recursive: true });
  // index.html + render.png are agent-produced; logo.png is a user drop-in;
  // styles.css is scaffolding (must be excluded).
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Deck</h1>');
  // Distinct bytes per png so content-hash dedup keeps them separate assets.
  await writeFile(path.join(dir, 'render.png'), pngBytes('render'));
  await writeFile(path.join(dir, 'logo.png'), pngBytes('logo'));
  await writeFile(path.join(dir, 'styles.css'), 'h1{color:red}');
  // Stamp the deliverables with a known past mtime to assert timeline bucketing.
  const stamp = new Date(ARTIFACT_TS);
  for (const f of ['index.html', 'render.png', 'logo.png']) {
    await utimes(path.join(dir, f), stamp, stamp);
  }

  upsertMessage(db, 'conv-1', {
    id: 'msg-1',
    role: 'assistant',
    content: 'made a deck',
    producedFiles: [
      { path: 'index.html', name: 'index.html', kind: 'html', size: 24, mtime: ARTIFACT_TS },
      { path: 'render.png', name: 'render.png', kind: 'image', size: 70, mtime: ARTIFACT_TS },
    ],
  });
}

async function seedDesignSystem(): Promise<void> {
  const root = path.join(designSystemsDir, DS_DIR);
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, 'DESIGN.md'),
    '---\nname: Acme\ncategory: Brand\n---\n\n# Acme\n\nAcme brand system.\n',
  );
  await writeFile(
    path.join(root, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'od-design-system-project/v1',
      id: DS_DIR,
      name: 'Acme',
      category: 'Brand',
      files: { design: 'DESIGN.md', tokens: 'tokens.css', components: 'components.html' },
    }),
  );
  await writeFile(path.join(root, 'components.html'), '<!doctype html><button>Acme</button>');
}

// A tiny valid 1x1 PNG so dimension sniffing / mime detection have real bytes.
// `tag` trailing bytes (ignored by decoders, magic bytes intact) make otherwise
// identical pngs hash differently so they stay distinct Library assets.
function pngBytes(tag: string): Buffer {
  const base = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  return Buffer.concat([base, Buffer.from(`\n<!-- ${tag} -->`)]);
}

function paths() {
  return {
    LIBRARY_DIR: libraryDir,
    PROJECTS_DIR: projectsDir,
    USER_DESIGN_SYSTEMS_DIR: designSystemsDir,
  };
}

describe('reconcileLibrary', () => {
  it('mirrors design systems + agent deliverables, classifies sources, excludes scaffolding', async () => {
    await seedProject();
    await seedDesignSystem();

    const result = await reconcileLibrary(db, paths());

    expect(result.designSystems).toBe(1);
    // index.html + render.png + logo.png; styles.css excluded.
    expect(result.projectAssets).toBe(3);
    expect(result.total).toBe(4);

    const assets = listLibraryAssets(db, {});
    const byRel = new Map(assets.map((a) => [a.relPath, a]));

    // No scaffolding leaked in.
    expect([...byRel.keys()]).not.toContain('styles.css');

    const sourceKindFor = (rel: string) => byRel.get(rel)?.sources?.[0]?.sourceKind;
    expect(sourceKindFor('index.html')).toBe('agent-task'); // authored page
    expect(sourceKindFor('render.png')).toBe('generated'); // agent media
    expect(sourceKindFor('logo.png')).toBe('manual-upload'); // user drop-in

    // The design system is one `design-system` card linking back to itself.
    const ds = assets.find((a) => a.kind === 'design-system');
    expect(ds).toBeTruthy();
    expect(ds?.sources?.[0]?.sourceKind).toBe('design-system');
    expect(ds?.sources?.[0]?.designSystemId).toBe(`user:${DS_DIR}`);

    // Project assets are referenced (bytes stay in the project) and back-link it.
    const html = byRel.get('index.html')!;
    expect(html.storage).toBe('referenced');
    expect(html.originProjectId).toBe(PROJECT_ID);
    expect(html.sources?.[0]?.projectId).toBe(PROJECT_ID);

    // Timeline buckets by the artifact's own mtime, not the sync time.
    expect(html.archivedDate).toBe(ARTIFACT_DATE);
  });

  it('is idempotent — a second pass indexes nothing new', async () => {
    await seedProject();
    await seedDesignSystem();

    const first = await reconcileLibrary(db, paths());
    expect(first.total).toBe(4);
    const countAfterFirst = listLibraryAssets(db, {}).length;

    const second = await reconcileLibrary(db, paths());
    expect(second.total).toBe(0);
    expect(second.deduped).toBeGreaterThanOrEqual(4);
    expect(listLibraryAssets(db, {}).length).toBe(countAfterFirst);
  });

  it('skips manifest preview paths that escape the design-system root', async () => {
    const root = path.join(designSystemsDir, DS_DIR);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(designSystemsDir, 'outside.html'), '<!doctype html><h1>Secret</h1>');
    await writeFile(
      path.join(root, 'DESIGN.md'),
      '---\nname: Acme\ncategory: Brand\n---\n\n# Acme\n',
    );
    await writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 'od-design-system-project/v1',
        id: DS_DIR,
        name: 'Acme',
        preview: { pages: [{ path: '../outside.html', role: 'overview' }] },
      }),
    );
    await writeFile(path.join(root, 'components.html'), '<!doctype html><button>Safe</button>');

    const result = await reconcileLibrary(db, paths());

    expect(result.designSystems).toBe(1);
    const ds = listLibraryAssets(db, {}).find((asset) => asset.kind === 'design-system');
    expect(ds?.relPath).toBe('components.html');
    expect(await realpath(path.resolve(ds?.filePath ?? ''))).toBe(
      await realpath(path.join(root, 'components.html')),
    );
  });

  it('does not register a design-system preview that is a symlink', async () => {
    const root = path.join(designSystemsDir, DS_DIR);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(designSystemsDir, 'outside.html'), '<!doctype html><h1>Secret</h1>');
    await writeFile(
      path.join(root, 'DESIGN.md'),
      '---\nname: Acme\ncategory: Brand\n---\n\n# Acme\n',
    );
    await writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 'od-design-system-project/v1',
        id: DS_DIR,
        name: 'Acme',
        preview: { pages: [{ path: 'components.html', role: 'overview' }] },
      }),
    );
    await symlink(path.join(designSystemsDir, 'outside.html'), path.join(root, 'components.html'));

    const result = await reconcileLibrary(db, paths());

    expect(result.designSystems).toBe(0);
    expect(listLibraryAssets(db, {}).filter((asset) => asset.kind === 'design-system')).toEqual([]);
  });
});
