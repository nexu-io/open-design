import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  listTabs,
  openDatabase,
  setTabs,
  upsertMessage,
} from '../src/db.js';
import {
  OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA,
  buildOpenDesignProjectBundle,
  importOpenDesignProjectBundle,
} from '../src/project-bundle.js';

describe('Open Design project bundle import/export', () => {
  let root = '';
  let projectsRoot = '';
  let dataDir = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'od-project-bundle-'));
    projectsRoot = path.join(root, 'projects');
    dataDir = path.join(root, 'data');
  });

  afterEach(() => {
    closeDatabase();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('round-trips project files, conversations, messages, and tabs into a new project', async () => {
    const db = openDatabase(root, { dataDir });
    const sourceProjectId = 'source-project';
    const sourceRoot = path.join(projectsRoot, sourceProjectId);
    await mkdir(path.join(sourceRoot, '.file-versions'), { recursive: true });
    await mkdir(path.join(sourceRoot, 'node_modules', 'ignored'), { recursive: true });
    await writeFile(path.join(sourceRoot, 'index.html'), '<!doctype html>source');
    await writeFile(path.join(sourceRoot, 'index.html.artifact.json'), '{"kind":"html"}');
    await writeFile(path.join(sourceRoot, '.file-versions', 'index.html.json'), '{"versions":[]}');
    await writeFile(path.join(sourceRoot, 'node_modules', 'ignored', 'skip.txt'), 'skip');

    insertProject(db, {
      id: sourceProjectId,
      name: 'Bundle Source',
      skillId: null,
      designSystemId: null,
      pendingPrompt: 'continue this project',
      metadata: {
        kind: 'prototype',
        entryFile: 'index.html',
        baseDir: sourceRoot,
      },
      createdAt: 100,
      updatedAt: 200,
    });
    insertConversation(db, {
      id: 'source-conversation',
      projectId: sourceProjectId,
      title: 'Main thread',
      sessionMode: 'design',
      createdAt: 110,
      updatedAt: 210,
    });
    upsertMessage(db, 'source-conversation', {
      id: 'source-user-message',
      role: 'user',
      content: 'make a dashboard',
      createdAt: 120,
    });
    upsertMessage(db, 'source-conversation', {
      id: 'source-assistant-message',
      role: 'assistant',
      content: 'done',
      agentId: 'codex',
      agentName: 'Codex',
      events: [{ kind: 'text', text: 'done' }],
      producedFiles: [{ path: 'index.html' }],
      runId: 'source-run',
      runStatus: 'succeeded',
      createdAt: 130,
    });
    setTabs(db, sourceProjectId, { tabs: ['index.html'], active: 'index.html' });

    const exported = await buildOpenDesignProjectBundle({
      db,
      projectsRoot,
      projectId: sourceProjectId,
      metadata: getProject(db, sourceProjectId)?.metadata,
    });
    const zip = await JSZip.loadAsync(exported.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.schema).toBe(OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA);
    expect(Object.keys(zip.files)).toContain('files/index.html');
    expect(Object.keys(zip.files)).toContain('files/index.html.artifact.json');
    expect(Object.keys(zip.files)).toContain('files/.file-versions/index.html.json');
    expect(Object.keys(zip.files)).not.toContain('files/node_modules/ignored/skip.txt');

    const imported = await importOpenDesignProjectBundle({
      db,
      projectsRoot,
      buffer: exported.buffer,
      originalName: 'bundle-source.odproject.zip',
      randomId: (() => {
        let next = 0;
        return () => `new-id-${++next}`;
      })(),
    });

    expect(imported.project?.id).not.toBe(sourceProjectId);
    expect(imported.entryFile).toBe('index.html');
    const importedRoot = path.join(projectsRoot, imported.project!.id);
    expect(await readFile(path.join(importedRoot, 'index.html'), 'utf8')).toBe('<!doctype html>source');
    expect(existsSync(path.join(importedRoot, 'index.html.artifact.json'))).toBe(true);

    const importedProject = getProject(db, imported.project!.id)!;
    expect(importedProject.metadata?.baseDir).toBeUndefined();
    expect(importedProject.metadata?.importedFrom).toBe('open-design-project');

    const conversations = listConversations(db, imported.project!.id);
    expect(conversations).toHaveLength(1);
    const importedConversation = conversations[0]!;
    expect(importedConversation.id).not.toBe('source-conversation');
    expect(importedConversation.title).toBe('Main thread');

    const messages = listMessages(db, importedConversation.id);
    expect(messages.map((message) => message.content)).toEqual(['make a dashboard', 'done']);
    const importedAssistantMessage = messages[1]!;
    expect(importedAssistantMessage.runId).toBeUndefined();
    expect(importedAssistantMessage.runStatus).toBeUndefined();
    expect(importedAssistantMessage.producedFiles).toEqual([{ path: 'index.html' }]);

    const tabs = listTabs(db, imported.project!.id);
    expect(tabs.tabs).toEqual(['index.html']);
    expect(tabs.active).toBe('index.html');
  });

  it('marks zips without an Open Design manifest as unsupported bundles', async () => {
    const db = openDatabase(root, { dataDir });
    const zip = new JSZip();
    zip.file('index.html', '<!doctype html>legacy export');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(importOpenDesignProjectBundle({
      db,
      projectsRoot,
      buffer,
      originalName: 'legacy-claude.zip',
      randomId: () => 'new-id',
    })).rejects.toMatchObject({
      code: 'PROJECT_BUNDLE_UNSUPPORTED',
    });
  });

  it('rejects project bundles with oversized files before extraction', async () => {
    const db = openDatabase(root, { dataDir });
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      schema: OPEN_DESIGN_PROJECT_BUNDLE_SCHEMA,
    }));
    zip.file('db/project.json', JSON.stringify({
      id: 'source-project',
      name: 'Oversized bundle',
    }));
    zip.file('files/large.bin', Buffer.alloc((25 * 1024 * 1024) + 1), {
      binary: true,
      compression: 'DEFLATE',
    });
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    await expect(importOpenDesignProjectBundle({
      db,
      projectsRoot,
      buffer,
      originalName: 'oversized.zip',
      randomId: () => 'new-id',
    })).rejects.toThrow('project bundle file too large: files/large.bin');
  });
});
