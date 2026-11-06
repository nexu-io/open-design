import { isMain } from '../shared/entry.ts';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { releaseProfile } from '../shared/mcp-registry.ts';
import { checkDesign } from './design-check.ts';
import { getWorkflow, workflowRegistry, phase1WorkflowNames } from '../shared/workflow.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

// Hosts parse SKILL.md frontmatter as YAML, so a plain value containing ": " or " #"
// is a parse error there even though a line-based regex accepts it.
export function assertSkillFrontmatterYaml(frontmatter: string, skill: string) {
  for (const line of frontmatter.split('\n')) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const field = line.match(/^([A-Za-z_][\w-]*):(?: (.*))?$/);
    assert.ok(field, `${skill} frontmatter line is not a YAML key: ${line}`);
    const value = (field[2] ?? '').trim();
    if (!value || /^[>|][+-]?$/.test(value) || /^'[^']*'$|^"(?:[^"\\]|\\.)*"$/.test(value)) continue;
    assert.ok(!/^[-?:,[\]{}#&*!|>'"%@`]/.test(value) && !/: | #|:$/.test(value),
      `${skill} frontmatter ${field[1]} is not a valid plain YAML value; use a folded block (>-) or quotes`);
  }
}

export async function check() {
  const manifest = JSON.parse(await readFile(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const marketplace = JSON.parse(await readFile(path.join(root, 'marketplace.example.json'), 'utf8'));
  assert.equal(manifest.name, marketplace.plugins[0].name);
  assert.equal(manifest.skills, './skills/');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.equal(pkg.dependencies.hyperframes, '0.9.7');
  assert.equal(lock.packages['node_modules/hyperframes'].version, pkg.dependencies.hyperframes);
  assert.equal(manifest.mcpServers, './.mcp.json');
  const mcp = JSON.parse(await readFile(path.join(root, '.mcp.json'), 'utf8'));
  assert.equal(mcp.mcpServers.motion.type, 'stdio');
  assert.deepEqual(mcp.mcpServers.motion.args, ['--experimental-strip-types', 'mcp.ts']);
  assert.equal(mcp.mcpServers.motion.cwd, '.');
  assert.ok(!JSON.stringify(mcp).includes('${'), 'MCP launch paths cannot depend on placeholder expansion');
  assert.equal(marketplace.plugins[0].source.path, './');
  for (const folder of ['web', 'shared', 'scripts', 'tests', 'gateway']) {
    for (const file of await readdir(path.join(root, folder))) {
      if (file.endsWith('.ts')) stripTypeScriptTypes(await readFile(path.join(root, folder, file), 'utf8'), { mode: 'strip' });
    }
  }
  for (const file of ['server.ts', 'browser.ts', 'workspace.ts', 'mcp.ts', 'mcp-tools.ts', 'editor-runtime.ts', 'phase1.ts', 'phase1-versions.ts', 'preview.ts', 'hyperframes.ts', 'template-library.ts', 'template-catalog.ts', 'editor-server.ts']) stripTypeScriptTypes(await readFile(path.join(root, file), 'utf8'), { mode: 'strip' });
  for (const entry of await readdir(path.join(root, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const document = await readFile(path.join(root, 'skills', entry.name, 'SKILL.md'), 'utf8');
    const frontmatter = document.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
    assert.ok(frontmatter, `Missing skill frontmatter: ${entry.name}`);
    assert.match(frontmatter, /^name: [a-z0-9-]+$/m);
    assert.match(frontmatter, /^description: .+$/m);
    assertSkillFrontmatterYaml(frontmatter, entry.name);
    assert.equal(document.match(/^name: (.+)$/m)?.[1], entry.name);
  }
  for (const [workflow, definition] of Object.entries(workflowRegistry)) {
    if (releaseProfile === 'phase1' && !phase1WorkflowNames.includes(workflow)) continue;
    for (const section of Object.keys(definition.sections)) {
      const document = await getWorkflow(section, workflow);
      assert.ok(document.content.trim(), `Empty workflow section: ${workflow}/${section}`);
      for (const reference of document.references) {
        const linked = await getWorkflow(reference.section, reference.workflow);
        assert.equal(linked.documentId, reference.documentId, `Unreachable workflow link from ${document.documentId}`);
      }
    }
  }
  assert.match(await readFile(path.join(root, 'templates/index.html'), 'utf8'), /data-composition-id/);
  await checkDesign();
  console.log('Plugin manifest, marketplace, skill and TypeScript syntax checks passed.');
}
if (isMain(import.meta.url)) await check();
