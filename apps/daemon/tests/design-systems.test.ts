import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  readDesignSystem,
  readUserDesignSystemFile,
  updateUserDesignSystem,
} from '../src/design-systems.js';

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
});
