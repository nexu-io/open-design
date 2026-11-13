// An installed design system package changes under its workspace project (a
// `git pull`, a re-install). Runs read DESIGN.md from that project first, so
// untouched copies must follow the package while edited ones are kept (#8793).
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
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
} from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import { closeDatabase, getProject, insertProject, openDatabase, updateProject } from '../../src/db.js';
import { isSafeId, listFiles, readProjectFile, resolveProjectDir, writeProjectFile } from '../../src/projects.js';

const DS_ID = 'user:acme';
const PROJECT_ID = 'ds-acme';

describe('design-system workspace project follows its package', () => {
  let workRoot = '';
  let packageDir = '';
  let projectDir = '';
  let db: ReturnType<typeof openDatabase>;
  let services: ReturnType<typeof createDesignSystemServerServices>;

  const writePackage = async (rel: string, content: string) => {
    await mkdir(path.dirname(path.join(packageDir, rel)), { recursive: true });
    await writeFile(path.join(packageDir, rel), content, 'utf8');
  };
  const writeProject = async (rel: string, content: string) => {
    await mkdir(path.dirname(path.join(projectDir, rel)), { recursive: true });
    await writeFile(path.join(projectDir, rel), content, 'utf8');
  };
  const readProject = (rel: string) => readFile(path.join(projectDir, rel), 'utf8');
  const projectHas = async (rel: string) => {
    try {
      await stat(path.join(projectDir, rel));
      return true;
    } catch {
      return false;
    }
  };
  const ensure = () => services.ensureUserDesignSystemWorkspaceProject(db, DS_ID);

  beforeEach(async () => {
    workRoot = await mkdtemp(path.join(tmpdir(), 'od-ds-package-sync-'));
    const userDesignSystemsDir = path.join(workRoot, 'design-systems');
    const projectsDir = path.join(workRoot, 'projects');
    packageDir = path.join(userDesignSystemsDir, 'acme');
    projectDir = path.join(projectsDir, PROJECT_ID);
    await mkdir(packageDir, { recursive: true });
    await mkdir(projectsDir, { recursive: true });
    // An installed package: agent-managed, so OpenDesign adds nothing of its own.
    await writePackage(
      'metadata.json',
      JSON.stringify({ title: 'Acme', status: 'published', artifactMode: 'agent-managed' }),
    );
    await writePackage('DESIGN.md', '# Acme\n\nVersion 1.\n');
    await writePackage('tokens.css', ':root { --accent: #111111; }\n');
    await writePackage('preview/colors.html', '<p>colors v1</p>\n');
    db = openDatabase(workRoot, { dataDir: workRoot });
    services = createDesignSystemServerServices({
      roots: { SKILL_ROOTS: [], DESIGN_TEMPLATE_ROOTS: [], ALL_SKILL_LIKE_ROOTS: [] },
      paths: {
        PROJECTS_DIR: projectsDir,
        DESIGN_SYSTEMS_DIR: path.join(workRoot, 'built-in-design-systems'),
        USER_DESIGN_SYSTEMS_DIR: userDesignSystemsDir,
      },
      skills: { listSkills: async () => [], findSkillById: () => undefined },
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
        // Same module-resolution cast as asset-sync.test.ts.
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

  it('refreshes untouched copies and keeps edited ones after a package update', async () => {
    expect(await ensure()).not.toBeNull();
    expect(await readProject('DESIGN.md')).toBe('# Acme\n\nVersion 1.\n');

    await writeProject('preview/colors.html', '<p>my own colors</p>\n');
    await writePackage('DESIGN.md', '# Acme\n\nVersion 2.\n');
    await writePackage('tokens.css', ':root { --accent: #222222; }\n');
    await writePackage('preview/colors.html', '<p>colors v2</p>\n');
    await ensure();

    expect(await readProject('DESIGN.md')).toBe('# Acme\n\nVersion 2.\n');
    expect(await readProject('tokens.css')).toBe(':root { --accent: #222222; }\n');
    expect(await readProject('preview/colors.html')).toBe('<p>my own colors</p>\n');
  });

  it('removes a file the package dropped only while the project copy is untouched', async () => {
    await writePackage('preview/old.html', '<p>old</p>\n');
    await writePackage('preview/edited.html', '<p>edited</p>\n');
    await ensure();
    await writeProject('preview/edited.html', '<p>changed in the project</p>\n');

    await rm(path.join(packageDir, 'preview', 'old.html'));
    await rm(path.join(packageDir, 'preview', 'edited.html'));
    await ensure();

    expect(await projectHas('preview/old.html')).toBe(false);
    expect(await readProject('preview/edited.html')).toBe('<p>changed in the project</p>\n');
  });

  it('does not let a forged manifest entry delete a file outside the package folders', async () => {
    await ensure();
    await writeProject('notes.md', 'Mine.\n');
    await writeProject('exports/deck.html', '<p>deck</p>\n');
    const manifestPath = path.join(projectDir, '.od-package-sync.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, string>;
    const hash = (content: string) => createHash('sha256').update(content).digest('hex');
    manifest['notes.md'] = hash('Mine.\n');
    manifest['exports/deck.html'] = hash('<p>deck</p>\n');
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

    await ensure();

    expect(await readProject('notes.md')).toBe('Mine.\n');
    expect(await readProject('exports/deck.html')).toBe('<p>deck</p>\n');
  });

  it('only treats byte-equal files as synced in a project copied before the manifest existed', async () => {
    insertProject(db, {
      id: PROJECT_ID,
      name: 'Acme',
      designSystemId: DS_ID,
      metadata: { importedFrom: 'design-system' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeProject('DESIGN.md', '# Acme\n\nAn older copy, maybe edited.\n');
    await writeProject('tokens.css', ':root { --accent: #111111; }\n');
    await writeProject('notes.md', 'A file the package never had.\n');

    await ensure();
    expect(await readProject('DESIGN.md')).toBe('# Acme\n\nAn older copy, maybe edited.\n');
    expect(await readProject('preview/colors.html')).toBe('<p>colors v1</p>\n');

    await writePackage('tokens.css', ':root { --accent: #222222; }\n');
    await ensure();
    expect(await readProject('tokens.css')).toBe(':root { --accent: #222222; }\n');
    expect(await readProject('DESIGN.md')).toBe('# Acme\n\nAn older copy, maybe edited.\n');
    expect(await readProject('notes.md')).toBe('A file the package never had.\n');
  });

  it('leaves files recorded by a brand finalize alone in a shared project', async () => {
    await ensure();
    // A brand project is also the workspace of its design system; the brand
    // finalize records its own copies in `.od-generated.json`.
    await writeProject('guide.md', 'Brand guide.\n');
    await writeProject(
      '.od-generated.json',
      JSON.stringify({ 'guide.md': 'not-the-package-sync-record' }),
    );

    await writePackage('DESIGN.md', '# Acme\n\nVersion 2.\n');
    await ensure();

    expect(await readProject('DESIGN.md')).toBe('# Acme\n\nVersion 2.\n');
    expect(await readProject('guide.md')).toBe('Brand guide.\n');
    expect(await readProject('.od-generated.json')).toContain('guide.md');
  });
});
