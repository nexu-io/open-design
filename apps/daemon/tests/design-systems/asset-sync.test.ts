// Logo/asset desync fix (spec 04 §9.3, recvqb1t4FrckM): the canonical design
// system directory (USER_DESIGN_SYSTEMS_DIR/<id>) is the only place
// team-resource-share, the download archive, and the showcase ever read
// from — but until this fix, a real asset an agent regenerated (e.g.
// assets/logo.svg) only ever landed in the workspace project's editing
// mirror and never got copied back. These specs pin the two layers that fix
// it:
//
//   1. `syncUserDesignSystemAssetsFromFiles` (design-systems/index.ts) — the
//      pure write: copies real bytes into canonical, drops the
//      `.od-generated.json` fingerprint for the overwritten path so the
//      generator never reclaims it, and flips `artifactMode` to
//      'agent-managed' the first time anything real syncs.
//   2. `createDesignSystemServerServices().syncUserDesignSystemAssetsFromWorkspace`
//      — the orchestration: locates the design system's workspace project
//      the same way `ensureUserDesignSystemWorkspaceProject` does, and
//      copies whatever real files sit under that project's `assets/`
//      directory.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createUserDesignSystem,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  readUserDesignSystemFileBytes,
  syncUserDesignSystemAssetsFromFiles,
  updateUserDesignSystem,
} from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import {
  closeDatabase,
  getProject,
  insertProject,
  openDatabase,
  updateProject,
} from '../../src/db.js';
import {
  isSafeId,
  listFiles,
  readProjectFile,
  resolveProjectDir,
  writeProjectFile,
} from '../../src/projects.js';

describe('syncUserDesignSystemAssetsFromFiles', () => {
  const DIR_ID = 'acme-brand';
  const DS_ID = `user:${DIR_ID}`;
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-ds-asset-sync-'));
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('copies a real asset into canonical, drops its generated fingerprint, and switches artifactMode to agent-managed', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Acme Brand',
      body: '# Acme Brand\n\n> Category: SaaS\n> Surface: web\n\nBrand body copy.',
    });
    expect(created.id).toBe(DS_ID);

    const dir = path.join(root, DIR_ID);
    const placeholderLogo = await readFile(path.join(dir, 'assets', 'logo.svg'), 'utf8');
    expect(placeholderLogo).toContain('<svg');

    const manifestBefore = JSON.parse(
      await readFile(path.join(dir, '.od-generated.json'), 'utf8'),
    ) as Record<string, string>;
    expect(manifestBefore['assets/logo.svg']).toBeTruthy();

    const metaBefore = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8')) as {
      artifactMode?: string;
    };
    expect(metaBefore.artifactMode ?? 'generated').not.toBe('agent-managed');

    const realLogo = Buffer.from('<svg><!-- real agent-drawn logo --></svg>');
    const result = await syncUserDesignSystemAssetsFromFiles(root, DS_ID, [
      { path: 'assets/logo.svg', content: realLogo },
    ]);
    expect(result.synced).toEqual(['assets/logo.svg']);

    const syncedContent = await readFile(path.join(dir, 'assets', 'logo.svg'));
    expect(syncedContent.equals(realLogo)).toBe(true);

    const manifestAfter = JSON.parse(
      await readFile(path.join(dir, '.od-generated.json'), 'utf8'),
    ) as Record<string, string>;
    expect(manifestAfter['assets/logo.svg']).toBeUndefined();

    const metaAfter = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8')) as {
      artifactMode?: string;
    };
    expect(metaAfter.artifactMode).toBe('agent-managed');
  });

  it('keeps a synced asset intact even if a later update forces artifactMode back to generated (the fingerprint protects it, not just the artifactMode gate)', async () => {
    await createUserDesignSystem(root, {
      title: 'Acme Brand',
      body: '# Acme Brand\n\nBrand body copy.',
    });
    const dir = path.join(root, DIR_ID);
    const realLogo = Buffer.from('<svg><!-- real agent-drawn logo --></svg>');
    await syncUserDesignSystemAssetsFromFiles(root, DS_ID, [
      { path: 'assets/logo.svg', content: realLogo },
    ]);

    // Mirrors exactly what a PATCH /api/design-systems/:id body-sync call
    // does — updateUserDesignSystem calls writeGeneratedDesignSystemFiles
    // internally whenever the resolved artifactMode isn't 'agent-managed'.
    // Forcing it back to 'generated' here proves the manifest fingerprint,
    // not the artifactMode short-circuit, is what protects the real asset.
    await updateUserDesignSystem(root, DS_ID, {
      body: '# Acme Brand\n\nUpdated brand body copy.',
      artifactMode: 'generated',
    });

    const afterRegen = await readFile(path.join(dir, 'assets', 'logo.svg'));
    expect(afterRegen.equals(realLogo)).toBe(true);
  });

  it('ignores files outside assets/ and no-ops when nothing under assets/ is given', async () => {
    await createUserDesignSystem(root, { title: 'Acme Brand', body: '# Acme Brand\n\nBrand body copy.' });
    const result = await syncUserDesignSystemAssetsFromFiles(root, DS_ID, [
      { path: 'DESIGN.md', content: Buffer.from('should never land here') },
    ]);
    expect(result.synced).toEqual([]);

    const dir = path.join(root, DIR_ID);
    const meta = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8')) as {
      artifactMode?: string;
    };
    expect(meta.artifactMode ?? 'generated').not.toBe('agent-managed');
    const designMd = await readFile(path.join(dir, 'DESIGN.md'), 'utf8');
    expect(designMd).not.toBe('should never land here');
  });

  it('no-ops for an unknown design system id', async () => {
    const result = await syncUserDesignSystemAssetsFromFiles(root, 'user:does-not-exist', [
      { path: 'assets/logo.svg', content: Buffer.from('x') },
    ]);
    expect(result.synced).toEqual([]);
  });
});

describe('createDesignSystemServerServices().syncUserDesignSystemAssetsFromWorkspace', () => {
  let workRoot = '';
  let userDesignSystemsDir = '';
  let projectsDir = '';
  let db: ReturnType<typeof openDatabase>;
  let services: ReturnType<typeof createDesignSystemServerServices>;

  beforeEach(async () => {
    workRoot = await mkdtemp(path.join(tmpdir(), 'od-ds-workspace-sync-'));
    userDesignSystemsDir = path.join(workRoot, 'design-systems');
    projectsDir = path.join(workRoot, 'projects');
    await mkdir(userDesignSystemsDir, { recursive: true });
    await mkdir(projectsDir, { recursive: true });
    db = openDatabase(workRoot, { dataDir: workRoot });
    services = createDesignSystemServerServices({
      roots: { SKILL_ROOTS: [], DESIGN_TEMPLATE_ROOTS: [], ALL_SKILL_LIKE_ROOTS: [] },
      paths: {
        PROJECTS_DIR: projectsDir,
        DESIGN_SYSTEMS_DIR: path.join(workRoot, 'built-in-design-systems'),
        USER_DESIGN_SYSTEMS_DIR: userDesignSystemsDir,
      },
      skills: {
        listSkills: async () => [],
        findSkillById: () => undefined,
      },
      designSystems: {
        listDesignSystems,
        readDesignSystem,
        readDesignSystemPackageInfo,
        readDesignSystemStaticFile,
        listUserDesignSystemFiles,
        readUserDesignSystemFile,
        readUserDesignSystemFileBytes,
        linkUserDesignSystemProject,
        syncUserDesignSystemAssetsFromFiles,
        LEGACY_DESIGN_SYSTEM_ARTIFACTS,
        // The real design-systems/index.ts types (readonly `as const` array,
        // `DesignSystemSource` literal union) are strictly narrower than the
        // DI factory's own locally declared (looser) option/array shapes —
        // real callers (server.ts) never trip this because their broader
        // import graph resolves the module's types under a single
        // resolution mode; this isolated test file resolves it under both
        // an import- and require-flavored instantiation, so TS sees two
        // nominally distinct `DesignSystemListOptions`. Widen with a cast
        // rather than fighting the module-resolution quirk here.
      } as unknown as Parameters<typeof createDesignSystemServerServices>[0]['designSystems'],
      projects: {
        getProject,
        insertProject,
        updateProject,
        readProjectFile,
        writeProjectFile,
        listFiles,
        resolveProjectDir,
        isSafeId,
      },
    });
  });

  afterEach(async () => {
    closeDatabase();
    if (workRoot) await rm(workRoot, { recursive: true, force: true });
  });

  it('locates the workspace project via the ds-<id> naming convention and copies its real assets into canonical', async () => {
    const created = await createUserDesignSystem(userDesignSystemsDir, {
      title: 'Acme Brand',
      body: '# Acme Brand\n\nBrand body copy.',
    });
    const dirId = created.id.replace(/^user:/, '');
    const projectId = `ds-${dirId}`;
    insertProject(db, {
      id: projectId,
      name: 'Acme Brand',
      designSystemId: created.id,
      metadata: { importedFrom: 'design-system' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const projectAssetsDir = path.join(projectsDir, projectId, 'assets');
    await mkdir(projectAssetsDir, { recursive: true });
    const realLogo = Buffer.from('<svg><!-- real workspace logo --></svg>');
    await writeFile(path.join(projectAssetsDir, 'logo.svg'), realLogo);
    // A non-asset project file must not get pulled into canonical by this sync.
    await writeFile(path.join(projectsDir, projectId, 'DESIGN.md'), '# stale copy', 'utf8');

    const outcome = await services.syncUserDesignSystemAssetsFromWorkspace(db, created.id);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.synced).toEqual(['assets/logo.svg']);

    const canonicalLogo = await readFile(path.join(userDesignSystemsDir, dirId, 'assets', 'logo.svg'));
    expect(canonicalLogo.equals(realLogo)).toBe(true);

    const meta = JSON.parse(
      await readFile(path.join(userDesignSystemsDir, dirId, 'metadata.json'), 'utf8'),
    ) as { artifactMode?: string };
    expect(meta.artifactMode).toBe('agent-managed');
  });

  it('prepares the canonical share directory from workspace assets before publishing', async () => {
    const created = await createUserDesignSystem(userDesignSystemsDir, {
      title: 'Share Ready Brand',
      body: '# Share Ready Brand\n\nBrand body copy.',
    });
    const dirId = created.id.replace(/^user:/, '');
    const projectId = `ds-${dirId}`;
    insertProject(db, {
      id: projectId,
      name: 'Share Ready Brand',
      designSystemId: created.id,
      metadata: { importedFrom: 'design-system' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const projectAssetsDir = path.join(projectsDir, projectId, 'assets');
    await mkdir(projectAssetsDir, { recursive: true });
    const latestWorkspaceLogo = Buffer.from('<svg><!-- latest workspace logo --></svg>');
    await writeFile(path.join(projectAssetsDir, 'logo.svg'), latestWorkspaceLogo);

    const resolveShareDir = (
      services as typeof services & {
        resolveUserDesignSystemShareDirectory(
          dbHandle: typeof db,
          id: string,
        ): Promise<string>;
      }
    ).resolveUserDesignSystemShareDirectory;
    const shareDir = await resolveShareDir(db, created.id);

    expect(shareDir).toBe(path.join(userDesignSystemsDir, dirId));
    const publishedLogo = await readFile(path.join(shareDir, 'assets', 'logo.svg'));
    expect(publishedLogo.equals(latestWorkspaceLogo)).toBe(true);
  });

  it('fails closed instead of returning a stale canonical share directory when workspace sync is unavailable', async () => {
    const created = await createUserDesignSystem(userDesignSystemsDir, {
      title: 'Unbound Brand',
      body: '# Unbound Brand\n\nBrand body copy.',
    });
    const dirId = created.id.replace(/^user:/, '');
    const staleCanonicalLogo = await readFile(
      path.join(userDesignSystemsDir, dirId, 'assets', 'logo.svg'),
    );

    const resolveShareDir = (
      services as typeof services & {
        resolveUserDesignSystemShareDirectory(
          dbHandle: typeof db,
          id: string,
        ): Promise<string>;
      }
    ).resolveUserDesignSystemShareDirectory;

    await expect(resolveShareDir(db, created.id)).rejects.toThrow(
      'design_system_share_asset_sync_failed:no-workspace-project',
    );
    await expect(
      readFile(path.join(userDesignSystemsDir, dirId, 'assets', 'logo.svg')),
    ).resolves.toEqual(staleCanonicalLogo);
  });

  it('reports no-workspace-project when the design system has no bound project row yet', async () => {
    const created = await createUserDesignSystem(userDesignSystemsDir, {
      title: 'No Workspace Yet',
      body: '# No Workspace Yet\n\nBody copy.',
    });

    const outcome = await services.syncUserDesignSystemAssetsFromWorkspace(db, created.id);
    expect(outcome).toEqual({ ok: false, reason: 'no-workspace-project' });
  });

  it('reports not-found for an unknown design system id', async () => {
    const outcome = await services.syncUserDesignSystemAssetsFromWorkspace(db, 'user:missing');
    expect(outcome).toEqual({ ok: false, reason: 'not-found' });
  });
});
