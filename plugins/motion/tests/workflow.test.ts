import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore } from '../workspace.ts';
import { getWorkflow, workflowReferences, workflowRegistry, workflowSections } from '../shared/workflow.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflows = ['production', 'director', 'template', 'recreate'];
const productionSections = ['start', 'intake', 'templates', 'production', 'verification', 'context', 'native', 'edit', 'portable'];
const entries = Object.entries(workflowRegistry).filter(([name]) => workflows.includes(name)).flatMap(([workflow, definition]) =>
  Object.entries(definition.sections).map(([section, documentId]) => ({ workflow, section, documentId, status: definition.status })));

function stdio(directory: string, messages: Record<string, unknown>[], entry = path.join(root, 'mcp.ts')) {
  const child = spawnSync(process.execPath, ['--experimental-strip-types', entry], {
    cwd: directory, input: messages.map(message => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n',
    encoding: 'utf8', env: { ...process.env, MOTION_DATA_DIR: directory }, timeout: 10_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr);
  const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(responses.length, messages.length);
  return new Map(responses.map(response => [response.id, response.error ? { isError: true, content: [{ text: response.error.message }] } : response.result.contents ? { structuredContent: JSON.parse(response.result.contents[0].text) } : response.result]));
}

function workflowCall(id: number, args?: any) {
  const valid = args === undefined || args && !Array.isArray(args) && typeof args === 'object' && Object.keys(args).every(key => ['workflow', 'section'].includes(key)) && (args.workflow === undefined || typeof args.workflow === 'string') && (args.section === undefined || typeof args.section === 'string');
  return { id, method: 'resources/read', params: { uri: valid ? `motion://workflow/${args?.workflow ?? 'production'}/${args?.section ?? 'start'}` : 'invalid' } };
}

test('MCP-only client discovers and reads the packaged workflow without starting a preview', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-workflow-mcp-'));
  try {
    const sections = productionSections.slice(0, 5);
    const responses = stdio(directory, [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { id: 2, method: 'tools/list' }, workflowCall(3),
      ...sections.map((section, index) => workflowCall(index + 4, { section })),
    ]);
    assert.match(responses.get(1).instructions, /resources\/read/);
    assert.ok(!responses.get(2).tools.some((tool: any) => tool.name === 'motion_get_workflow'));
    assert.equal(responses.get(3).structuredContent.documentId, 'skills/motion-production/SKILL.md');
    for (const [index, section] of sections.entries()) {
      const result = responses.get(index + 4).structuredContent;
      assert.equal(result.workflow, 'production');
      assert.equal(result.section, section);
      assert.ok(result.content.length > 100);
      assert.deepEqual(result.sections, productionSections);
      assert.deepEqual({ ...await getWorkflow(section), workflows }, result);
    }
    const store = new WorkspaceStore(directory);
    assert.match((await store.get()).revision, /^[a-f0-9]{64}$/);
    assert.equal((await store.get()).project, null);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('every workflow document and linked reference is reachable over MCP with canonical identity, without changing an existing project', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-workflow-documents-'));
  try {
    const store = new WorkspaceStore(directory);
    await mkdir(store.projectDirectory);
    await writeFile(path.join(store.projectDirectory, 'index.html'), '<main data-composition-id="existing">Existing work</main>');
    const before = await store.get();
    const filesBefore = await readdir(directory, { recursive: true });
    const responses = stdio(directory, entries.map(({ workflow, section }, index) => workflowCall(index + 1, { workflow, section })));
    const returned = new Map<string, any>();
    for (const [index, entry] of entries.entries()) {
      const response = responses.get(index + 1);
      assert.ok(!response.isError, JSON.stringify(response));
      const result = response.structuredContent;
      assert.equal(result.workflow, entry.workflow);
      assert.equal(result.section, entry.section);
      assert.equal(result.status, entry.status);
      assert.equal(result.documentId, entry.documentId);
      assert.equal(result.path, path.join(root, entry.documentId));
      assert.equal(result.content, await readFile(path.join(root, entry.documentId), 'utf8'));
      assert.equal(result.contentHash, createHash('sha256').update(result.content).digest('hex'));
      assert.deepEqual(result.workflows, workflows);
      assert.deepEqual(result.sections, Object.keys(workflowRegistry[entry.workflow as keyof typeof workflowRegistry].sections));
      assert.equal(new Set(result.references.map((reference: { documentId: string }) => reference.documentId)).size, result.references.length);
      returned.set(result.documentId, result);
    }
    for (const document of returned.values()) {
      for (const reference of document.references) {
        const target = returned.get(reference.documentId);
        assert.ok(target, `${document.documentId} links to an unreachable document`);
        assert.equal(target.workflow, reference.workflow);
        assert.equal(target.section, reference.section);
      }
    }
    assert.equal(returned.get('skills/template-to-video/SKILL.md').status, 'ready');
    assert.equal(returned.get('skills/template-to-video/SKILL.md').workflow, 'template');
    assert.equal(returned.get('skills/motion-recreate/SKILL.md').status, 'ready');
    for (const route of workflows) {
      assert.ok(returned.get(workflowRegistry[route as keyof typeof workflowRegistry].sections.start).references.some((reference: { documentId: string }) =>
        reference.documentId === 'skills/motion-production/references/edit.md'), `${route} must expose the shared edit workflow`);
    }
    assert.deepEqual(await store.get(), before);
    assert.deepEqual(await readdir(directory, { recursive: true }), filesBefore);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Markdown references resolve across workflows, deduplicate canonical paths, and reject missing internal instructions', () => {
  const documentId = 'skills/motion-director/SKILL.md';
  const refs = workflowReferences([
    '[sound](references/sound-narrative.md#anchors)',
    '[sound again](./references/sound-narrative.md?version=1)',
    '[shared context](<../motion-production/references/context.md> "Common context")',
    '[actions][script]', '[script]: references/action-script.md',
    '[external](https://example.com/other.md)', '[protocol-relative](//example.com/other.md)', '[anchor](#local)',
    '`[example](not-a-document.md)`', '```markdown', '[example](also-not-a-document.md)', '```',
  ].join('\n'), documentId);
  assert.deepEqual(refs, [
    { workflow: 'director', section: 'sound', documentId: 'skills/motion-director/references/sound-narrative.md' },
    { workflow: 'production', section: 'context', documentId: 'skills/motion-production/references/context.md' },
    { workflow: 'director', section: 'actions', documentId: 'skills/motion-director/references/action-script.md' },
  ]);
  for (const target of ['missing.md', '../../../outside.md', '/absolute.md', '..%2F..%2Foutside.md']) {
    assert.throws(() => workflowReferences(`[missing](${target})`, documentId), /Unregistered workflow Markdown link/);
  }
});

test('MCP rejects unknown routes, invalid route-section pairs and arbitrary paths without creating workspace files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-workflow-invalid-'));
  try {
    const invalid = [
      { workflow: 'unknown' }, { workflow: '__proto__' }, { workflow: '../director' }, { workflow: null }, { workflow: [] },
      { section: '../.env' }, { section: 'constructor' }, { section: null }, { section: 1 }, { section: {} },
      { workflow: 'director', section: 'intake' }, { workflow: 'template', section: 'production' }, { workflow: 'recreate', section: 'native' },
      { workflow: 'production', section: 'sound' }, { path: 'skills/motion-director/SKILL.md' }, [], 'director',
      { workflow: 'video-to-template', section: 'intake' }, { workflow: 'template-to-video' }, { workflow: 'motion-template' },
    ];
    const responses = stdio(directory, invalid.map((args, index) => workflowCall(index + 1, args)));
    for (const [index, args] of invalid.entries()) assert.equal(responses.get(index + 1).isError, true, JSON.stringify(args));
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('MCP starts through a symlinked installation path from another working directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-linked-mcp-'));
  try {
    const linked = path.join(directory, 'linked-plugin');
    await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
    const responses = stdio(directory, workflows.map((workflow, index) => workflowCall(index + 1, { workflow })), path.join(linked, 'mcp.ts'));
    for (const [index, workflow] of workflows.entries()) {
      const result = responses.get(index + 1).structuredContent;
      assert.ok(result, JSON.stringify(responses.get(index + 1)));
      assert.equal(result.workflow, workflow);
      assert.equal(result.section, 'start');
      assert.equal(result.documentId, workflowRegistry[workflow as keyof typeof workflowRegistry].sections.start);
      assert.equal(result.contentHash, (await getWorkflow('start', workflow)).contentHash);
    }
    assert.deepEqual(await readdir(directory), ['linked-plugin']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
