import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createUserDesignSystem,
  createUserDesignSystemRevision,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  readDesignSystem,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  readUserDesignSystemRevision,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from '../../src/design-systems/index.js';

describe('design systems registry', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-design-systems-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists bundled design systems as published and non-editable', async () => {
    await mkdir(path.join(root, 'acme'), { recursive: true });
    await writeFile(
      path.join(root, 'acme', 'DESIGN.md'),
      '# Acme\n\n> Category: Custom\n> Surface: web\n\nAcme brand.\n',
    );

    const systems = await listDesignSystems(root);

    expect(systems).toMatchObject([
      {
        id: 'acme',
        title: 'Acme',
        category: 'Custom',
        status: 'published',
        source: 'built-in',
        isEditable: false,
      },
    ]);
  });

  it('parses a DESIGN.md with a pathological marker run without catastrophic backtracking', async () => {
    // Regression: the swatch parser's Form A regex had overlapping star-consumers
    // (`[\s>*-]*\**\s*`), so a long run of `*` at a line start was O(n^2) — a large
    // installed DESIGN.md could hang the daemon during `listDesignSystems`
    // (reachable via GET /api/design-systems). The collapsed prefix is linear.
    await mkdir(path.join(root, 'acme'), { recursive: true });
    await writeFile(
      path.join(root, 'acme', 'DESIGN.md'),
      `# Acme\n\n${'*'.repeat(24000)}\n`,
    );
    const start = performance.now();
    const systems = await listDesignSystems(root);
    const elapsedMs = performance.now() - start;
    expect(systems.map((s) => s.id)).toContain('acme');
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('creates, updates, reads, and deletes user design systems with prefixed ids', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Acme Product',
      summary: 'Dense product UI.',
      category: 'Custom',
      status: 'draft',
      provenance: {
        companyBlurb: 'Acme builds dense product UI.',
        githubUrls: ['https://github.com/acme/product'],
        localCodeFiles: ['src/components/Button.tsx'],
        figFiles: ['brand.fig'],
        assetFiles: ['logo.svg'],
        notes: 'Use compact review flows.',
      },
    });

    expect(created.id).toBe('user:acme-product');
    expect(created.source).toBe('user');
    expect(created.isEditable).toBe(true);
    expect(created.status).toBe('draft');
    expect(created.provenance).toMatchObject({
      companyBlurb: 'Acme builds dense product UI.',
      githubUrls: ['https://github.com/acme/product'],
      localCodeFiles: ['src/components/Button.tsx'],
      figFiles: ['brand.fig'],
      assetFiles: ['logo.svg'],
      notes: 'Use compact review flows.',
    });
    const files = await listUserDesignSystemFiles(root, created.id);
    expect(files?.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'DESIGN.md',
        'README.md',
        'SKILL.md',
        'context/provenance.json',
        'context/provenance.md',
        'colors_and_type.css',
        'preview/colors-primary.html',
        'preview/typography-specimens.html',
        'assets/logo.svg',
        'ui_kits/app/index.html',
        'ui_kits/app/README.md',
        'ui_kits/app/components/App.jsx',
        'ui_kits/app/components/Sidebar.jsx',
        'ui_kits/app/components/AssistantsList.jsx',
        'ui_kits/app/components/ChatArea.jsx',
        'ui_kits/app/components/InputBar.jsx',
        'ui_kits/app/components/MessageBubble.jsx',
      ]),
    );
    await expect(readUserDesignSystemFile(root, created.id, 'ui_kits/app/index.html'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('ReactDOM.createRoot'),
      });
    await expect(readUserDesignSystemFile(root, created.id, 'ui_kits/app/index.html'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('components/App.jsx'),
      });
    await expect(readUserDesignSystemFile(root, created.id, 'ui_kits/app/components/App.jsx'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('<Sidebar'),
      });
    await expect(readUserDesignSystemFile(root, created.id, 'ui_kits/app/components/App.jsx'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('window.App = App'),
      });
    await expect(readUserDesignSystemFile(root, created.id, 'README.md'))
      .resolves
      .toMatchObject({
        path: 'README.md',
        kind: 'document',
        content: expect.stringContaining('Acme Product'),
      });
    await expect(readUserDesignSystemFile(root, created.id, 'context/provenance.json'))
      .resolves
      .toMatchObject({
        path: 'context/provenance.json',
        kind: 'data',
        content: expect.stringContaining('https://github.com/acme/product'),
      });
    await expect(readUserDesignSystemFile(root, created.id, 'context/provenance.md'))
      .resolves
      .toMatchObject({
        path: 'context/provenance.md',
        kind: 'document',
        content: expect.stringContaining('Acme builds dense product UI.'),
      });
    await expect(readUserDesignSystemFile(root, created.id, '../metadata.json'))
      .resolves
      .toBeNull();

    const linked = await linkUserDesignSystemProject(root, created.id, 'ds-acme-product');
    expect(linked?.projectId).toBe('ds-acme-product');
    await expect(listDesignSystems(root, { idPrefix: 'user:' }))
      .resolves
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: created.id, projectId: 'ds-acme-product' }),
      ]));

    const updated = await updateUserDesignSystem(root, created.id, {
      title: 'Acme Product System',
      status: 'published',
      body: '# Acme Product System\n\n> Category: Custom\n> Surface: web\n\nPublished.\n',
    });

    expect(updated?.status).toBe('published');
    expect(updated?.title).toBe('Acme Product System');
    expect(updated?.projectId).toBe('ds-acme-product');
    await expect(readDesignSystem(root, created.id, { idPrefix: 'user:' }))
      .resolves
      .toContain('Published.');

    await expect(deleteUserDesignSystem(root, created.id)).resolves.toBe(true);
    await expect(listDesignSystems(root, { idPrefix: 'user:' })).resolves.toEqual([]);
  });

  it('rejects traversal ids when reading design systems', async () => {
    await expect(readDesignSystem(root, '../package')).resolves.toBeNull();
    await expect(readDesignSystem(root, 'user:../package', { idPrefix: 'user:' }))
      .resolves
      .toBeNull();
  });

  it('backfills generated files for older user design systems', async () => {
    await mkdir(path.join(root, 'legacy'), { recursive: true });
    await writeFile(
      path.join(root, 'legacy', 'DESIGN.md'),
      '# Legacy System\n\n> Category: Custom\n> Surface: web\n\nLegacy body.\n',
    );

    const files = await listUserDesignSystemFiles(root, 'user:legacy');

    expect(files?.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'README.md',
        'SKILL.md',
        'context/provenance.json',
        'colors_and_type.css',
        'preview/colors-primary.html',
        'ui_kits/app/components/App.jsx',
        'ui_kits/app/components/Sidebar.jsx',
        'ui_kits/app/components/AssistantsList.jsx',
        'ui_kits/app/components/ChatArea.jsx',
        'ui_kits/app/components/InputBar.jsx',
        'ui_kits/app/components/MessageBubble.jsx',
      ]),
    );
  });

  it('leaves revision acceptance pending when file-change writes fail', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Atomic Product',
      status: 'draft',
      artifactMode: 'agent-managed',
      body: '# Atomic Product\n\n> Category: Custom\n> Surface: web\n\nOriginal guidance.\n',
    });
    const originalBody = await readDesignSystem(root, created.id, { idPrefix: 'user:' });
    await writeFile(path.join(root, 'atomic-product', 'source'), 'not a directory');

    const revision = await createUserDesignSystemRevision(root, created.id, {
      feedback: 'Rebuild token contract from source evidence.',
      baseBody: originalBody ?? '',
      proposedBody: '# Atomic Product\n\n> Category: Custom\n> Surface: web\n\nAccepted guidance.\n',
      fileChanges: [{
        path: 'source/token-contract.rebuild-request.md',
        baseContent: '',
        proposedContent: '# Token Contract Rebuild Request\n',
      }],
    });

    await expect(updateUserDesignSystemRevisionStatus(
      root,
      created.id,
      revision?.id ?? '',
      'accepted',
    )).rejects.toThrow();

    await expect(readDesignSystem(root, created.id, { idPrefix: 'user:' }))
      .resolves
      .toBe(originalBody);
    await expect(readFile(path.join(root, 'atomic-product', 'source'), 'utf8'))
      .resolves
      .toBe('not a directory');
    await expect(readUserDesignSystemRevision(root, created.id, revision?.id ?? ''))
      .resolves
      .toMatchObject({ status: 'pending' });
  });

  it('migrates older review artifact names into the Claude-style package structure', async () => {
    await mkdir(path.join(root, 'legacy', 'preview'), { recursive: true });
    await mkdir(path.join(root, 'legacy', 'ui_kits', 'generated_interface'), { recursive: true });
    await writeFile(
      path.join(root, 'legacy', 'DESIGN.md'),
      '# Legacy System\n\n> Category: Custom\n> Surface: web\n\nLegacy body.\n',
    );
    await writeFile(
      path.join(root, 'legacy', 'README.md'),
      '# Legacy\n\nReview preview/typography-scale.html and ui_kits/generated_interface/index.html first.\n',
    );
    await writeFile(
      path.join(root, 'legacy', 'SKILL.md'),
      '# Legacy Skill\n\nUse preview/colors-ui-palette.html, preview/spacing-system.html, and ui_kits/generated_interface/.\n',
    );
    await writeFile(path.join(root, 'legacy', 'preview', 'colors-ui-palette.html'), '<!doctype html><html><body>colors</body></html>');
    await writeFile(path.join(root, 'legacy', 'preview', 'colors-node-types.html'), '<!doctype html><html><body>nodes</body></html>');
    await writeFile(path.join(root, 'legacy', 'preview', 'typography-scale.html'), '<!doctype html><html><body>type</body></html>');
    await writeFile(path.join(root, 'legacy', 'preview', 'spacing-system.html'), '<!doctype html><html><body>spacing</body></html>');
    await writeFile(path.join(root, 'legacy', 'preview', 'logo-variants.html'), '<!doctype html><html><body>logo</body></html>');
    await writeFile(
      path.join(root, 'legacy', 'ui_kits', 'generated_interface', 'index.html'),
      '<!doctype html><html><body>legacy app kit</body></html>',
    );

    const files = await listUserDesignSystemFiles(root, 'user:legacy');

    expect(files?.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'preview/colors-primary.html',
        'preview/colors-theme-light.html',
        'preview/colors-theme-dark.html',
        'preview/typography-specimens.html',
        'preview/spacing-tokens.html',
        'preview/spacing-radius.html',
        'preview/spacing-shadows.html',
        'preview/components-buttons.html',
        'preview/components-inputs.html',
        'preview/brand-assets.html',
        'ui_kits/app/index.html',
        'ui_kits/app/README.md',
        'ui_kits/app/components/App.jsx',
        'ui_kits/app/components/Sidebar.jsx',
        'ui_kits/app/components/AssistantsList.jsx',
        'ui_kits/app/components/ChatArea.jsx',
        'ui_kits/app/components/InputBar.jsx',
        'ui_kits/app/components/MessageBubble.jsx',
      ]),
    );
    expect(files?.map((file) => file.path)).not.toEqual(
      expect.arrayContaining([
        'preview/colors-ui-palette.html',
        'preview/colors-node-types.html',
        'preview/typography-scale.html',
        'preview/spacing-system.html',
        'preview/logo-variants.html',
        'ui_kits/generated_interface/index.html',
      ]),
    );
    await expect(readUserDesignSystemFile(root, 'user:legacy', 'ui_kits/app/index.html'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('legacy app kit'),
      });
    await expect(readUserDesignSystemFile(root, 'user:legacy', 'README.md'))
      .resolves
      .toMatchObject({
        content: expect.not.stringContaining('ui_kits/generated_interface'),
      });
    await expect(readUserDesignSystemFile(root, 'user:legacy', 'README.md'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('ui_kits/app/index.html'),
      });
    await expect(readUserDesignSystemFile(root, 'user:legacy', 'SKILL.md'))
      .resolves
      .toMatchObject({
        content: expect.not.stringContaining('preview/colors-ui-palette.html'),
      });
  });

  it('adds modular UI-kit components to existing app kits', async () => {
    await mkdir(path.join(root, 'legacy', 'ui_kits', 'app'), { recursive: true });
    await writeFile(
      path.join(root, 'legacy', 'DESIGN.md'),
      '# Legacy System\n\n> Category: Custom\n> Surface: web\n\nLegacy body.\n',
    );
    await writeFile(path.join(root, 'legacy', 'README.md'), '# Legacy\n');
    await writeFile(path.join(root, 'legacy', 'ui_kits', 'app', 'index.html'), '<!doctype html><html><body>app kit</body></html>');

    const files = await listUserDesignSystemFiles(root, 'user:legacy');

    expect(files?.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'ui_kits/app/components/App.jsx',
        'ui_kits/app/components/Sidebar.jsx',
        'ui_kits/app/components/AssistantsList.jsx',
        'ui_kits/app/components/ChatArea.jsx',
        'ui_kits/app/components/InputBar.jsx',
        'ui_kits/app/components/MessageBubble.jsx',
      ]),
    );
    await expect(readUserDesignSystemFile(root, 'user:legacy', 'ui_kits/app/components/App.jsx'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('<Sidebar'),
      });
    await expect(readUserDesignSystemFile(root, 'user:legacy', 'ui_kits/app/components/App.jsx'))
      .resolves
      .toMatchObject({
        content: expect.stringContaining('window.App = App'),
      });
  });

  it('does not backfill agent-managed review artifacts before the agent writes them', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Agent Managed',
      summary: 'The agent will create review artifacts in the workspace.',
      status: 'draft',
      artifactMode: 'agent-managed',
    });

    const initialFiles = await listUserDesignSystemFiles(root, created.id);

    expect(initialFiles?.map((file) => file.path)).toEqual(['DESIGN.md']);
    expect(initialFiles?.map((file) => file.path)).not.toEqual(expect.arrayContaining(['README.md', 'preview/colors-primary.html']));
    await expect(readUserDesignSystemFile(root, created.id, 'README.md'))
      .resolves
      .toBeNull();

    const contextDir = path.join(root, created.id.slice('user:'.length), 'context');
    await mkdir(contextDir, { recursive: true });
    await writeFile(
      path.join(contextDir, 'source-context.md'),
      '# Source Context\n\nConnector evidence remains available as project context.\n',
      'utf8',
    );

    const generatedFiles = await listUserDesignSystemFiles(root, created.id);

    expect(generatedFiles?.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'DESIGN.md',
        'context/source-context.md',
      ]),
    );
    expect(generatedFiles?.map((file) => file.path)).not.toEqual(expect.arrayContaining(['README.md']));
  });

  // Regression #556 (issue #323): updating a generated design system used to
  // unconditionally rewrite every derived file, clobbering user-authored
  // components/docs and forcing users to redo work. Regeneration must now only
  // refresh files the user has not customized.
  const dirOf = (id: string): string => path.join(root, id.slice('user:'.length));

  const seedUserEdits = async (dir: string): Promise<void> => {
    await writeFile(
      path.join(dir, 'ui_kits', 'app', 'components', 'App.jsx'),
      'MY CUSTOM APP',
      'utf8',
    );
    await mkdir(path.join(dir, 'src', 'components'), { recursive: true });
    await writeFile(
      path.join(dir, 'src', 'components', 'MyButton.tsx'),
      'export const MyButton = () => null;\n',
      'utf8',
    );
    await mkdir(path.join(dir, 'ui_kits', 'app', 'custom'), { recursive: true });
    await writeFile(
      path.join(dir, 'ui_kits', 'app', 'custom', 'Panel.jsx'),
      'CUSTOM PANEL',
      'utf8',
    );
  };

  it('preserves user-created files and edits when updating a generated design system', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Retention Kit',
      category: 'Custom',
      status: 'draft',
      body: '# Retention Kit\n\n> Category: Custom\n> Surface: web\n\nOriginal.\n',
    });
    const dir = dirOf(created.id);
    await seedUserEdits(dir);

    const updated = await updateUserDesignSystem(root, created.id, { title: 'Retention Kit Pro' });
    expect(updated?.title).toBe('Retention Kit Pro');

    await expect(readFile(path.join(dir, 'ui_kits', 'app', 'components', 'App.jsx'), 'utf8'))
      .resolves
      .toBe('MY CUSTOM APP');
    await expect(readFile(path.join(dir, 'src', 'components', 'MyButton.tsx'), 'utf8'))
      .resolves
      .toBe('export const MyButton = () => null;\n');
    await expect(readFile(path.join(dir, 'ui_kits', 'app', 'custom', 'Panel.jsx'), 'utf8'))
      .resolves
      .toBe('CUSTOM PANEL');
  });

  it('preserves user edits when accepting a design-system revision', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Revision Kit',
      body: '# Revision Kit\n\n> Category: Custom\n> Surface: web\n\nBase.\n',
    });
    const dir = dirOf(created.id);
    await seedUserEdits(dir);

    const baseBody = await readDesignSystem(root, created.id, { idPrefix: 'user:' });
    const revision = await createUserDesignSystemRevision(root, created.id, {
      feedback: 'Tighten guidance from source evidence.',
      baseBody: baseBody ?? '',
      proposedBody: '# Revision Kit\n\n> Category: Custom\n> Surface: web\n\nRevised guidance.\n',
    });
    await updateUserDesignSystemRevisionStatus(root, created.id, revision?.id ?? '', 'accepted');

    await expect(readDesignSystem(root, created.id, { idPrefix: 'user:' }))
      .resolves
      .toContain('Revised guidance.');
    await expect(readFile(path.join(dir, 'ui_kits', 'app', 'components', 'App.jsx'), 'utf8'))
      .resolves
      .toBe('MY CUSTOM APP');
    await expect(readFile(path.join(dir, 'src', 'components', 'MyButton.tsx'), 'utf8'))
      .resolves
      .toBe('export const MyButton = () => null;\n');
  });

  it('still refreshes untouched generated docs when the title changes', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Refresh Kit',
      body: '# Refresh Kit\n\n> Category: Custom\n> Surface: web\n\nOriginal.\n',
    });
    const dir = dirOf(created.id);
    await expect(readFile(path.join(dir, 'README.md'), 'utf8')).resolves.toContain('Refresh Kit');

    await updateUserDesignSystem(root, created.id, { title: 'Polished System' });

    // README was never user-edited, so regeneration must still refresh it.
    await expect(readFile(path.join(dir, 'README.md'), 'utf8')).resolves.toContain('Polished System');
  });

  it('does not generate derived files for agent-managed systems on update', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Agent Managed Kit',
      artifactMode: 'agent-managed',
      body: '# Agent Managed Kit\n\n> Category: Custom\n> Surface: web\n\nBase.\n',
    });

    await updateUserDesignSystem(root, created.id, { title: 'Agent Managed Renamed' });

    const files = await listUserDesignSystemFiles(root, created.id);
    expect(files?.map((file) => file.path)).toEqual(['DESIGN.md']);
  });

  it('preserves user edits when regenerating after README deletion (read path)', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Read Path Kit',
      body: '# Read Path Kit\n\n> Category: Custom\n> Surface: web\n\nBase.\n',
    });
    const dir = dirOf(created.id);
    await writeFile(
      path.join(dir, 'ui_kits', 'app', 'components', 'App.jsx'),
      'MY CUSTOM APP',
      'utf8',
    );
    await rm(path.join(dir, 'README.md'), { force: true });

    // Listing files triggers ensureGeneratedDesignSystemFiles, which regenerates
    // when README is missing. The missing README must be restored without
    // clobbering the user's edited App.jsx.
    const files = await listUserDesignSystemFiles(root, created.id);
    expect(files?.map((file) => file.path)).toEqual(expect.arrayContaining(['README.md']));
    await expect(readFile(path.join(dir, 'ui_kits', 'app', 'components', 'App.jsx'), 'utf8'))
      .resolves
      .toBe('MY CUSTOM APP');
  });

  it('keeps a revision file-change to a generated doc across later updates', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'FileChange Kit',
      body: '# FileChange Kit\n\n> Category: Custom\n> Surface: web\n\nBase.\n',
    });
    const dir = dirOf(created.id);
    const baseBody = await readDesignSystem(root, created.id, { idPrefix: 'user:' });
    const revision = await createUserDesignSystemRevision(root, created.id, {
      feedback: 'Hand-author the README in this revision.',
      baseBody: baseBody ?? '',
      proposedBody: baseBody ?? '',
      fileChanges: [{
        path: 'README.md',
        baseContent: '',
        proposedContent: '# Hand-authored README\n\nCustom.\n',
      }],
    });
    await updateUserDesignSystemRevisionStatus(root, created.id, revision?.id ?? '', 'accepted');
    await expect(readFile(path.join(dir, 'README.md'), 'utf8'))
      .resolves
      .toBe('# Hand-authored README\n\nCustom.\n');

    // A later metadata-only update must not overwrite the revision's README.
    await updateUserDesignSystem(root, created.id, { title: 'FileChange Kit Renamed' });
    await expect(readFile(path.join(dir, 'README.md'), 'utf8'))
      .resolves
      .toBe('# Hand-authored README\n\nCustom.\n');
  });

  it('preserves edits and backfills gaps for legacy systems without a manifest', async () => {
    // Simulate an older generated system: derived files exist on disk but there
    // is no .od-generated.json fingerprint manifest yet.
    await mkdir(path.join(root, 'legacy', 'ui_kits', 'app', 'components'), { recursive: true });
    await writeFile(
      path.join(root, 'legacy', 'DESIGN.md'),
      '# Legacy\n\n> Category: Custom\n> Surface: web\n\nBody.\n',
      'utf8',
    );
    await writeFile(path.join(root, 'legacy', 'README.md'), 'USER EDITED README', 'utf8');

    const updated = await updateUserDesignSystem(root, 'user:legacy', { title: 'Legacy Renamed' });
    expect(updated?.title).toBe('Legacy Renamed');

    const dir = path.join(root, 'legacy');
    // Pre-existing (possibly user-edited) file with no fingerprint is preserved.
    await expect(readFile(path.join(dir, 'README.md'), 'utf8')).resolves.toBe('USER EDITED README');
    // Missing derived files are still backfilled.
    await expect(readFile(path.join(dir, 'SKILL.md'), 'utf8')).resolves.toContain('Legacy Renamed');
  });

  it('does not expose the generated-fingerprint manifest through file surfaces', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Manifest Privacy Kit',
      body: '# Manifest Privacy Kit\n\n> Category: Custom\n> Surface: web\n\nBase.\n',
    });
    const dir = dirOf(created.id);
    // The manifest exists on disk after generation.
    await expect(readFile(path.join(dir, '.od-generated.json'), 'utf8')).resolves.toContain('README.md');

    const files = await listUserDesignSystemFiles(root, created.id);
    expect(files?.map((file) => file.path)).not.toContain('.od-generated.json');
    await expect(
      readDesignSystemStaticFile(root, created.id, '.od-generated.json', { idPrefix: 'user:' }),
    ).resolves.toBeNull();
  });
});
