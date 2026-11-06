import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { phase1Skills } from '../shared/workflow.ts';
import { isMain } from '../shared/entry.ts';
import { integrationConfig } from '../shared/integration.ts';
import type { IntegrationInfo } from '../shared/integration.ts';
import { zip } from './package.ts';

// Local adapters reference one installed runtime; these ZIPs are not portable installers.
export async function exportAdapters(runtimePath: string, dataPath: string, outputPath: string) {
  assert([runtimePath, dataPath, outputPath].every(value => typeof value === 'string' && path.isAbsolute(value)), 'Provide absolute runtime, data and new output directory paths.');
  async function canonical(filename: string): Promise<string> {
    filename = path.resolve(filename);
    try { return await realpath(filename); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return path.join(await canonical(path.dirname(filename)), path.basename(filename));
    }
  }
  const runtime = await realpath(runtimePath), data = await canonical(dataPath), output = await canonical(outputPath);
  const contains = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
  };
  assert(!contains(runtime, data) && !contains(data, runtime), 'Keep user projects outside the runtime directory.');
  assert(!contains(data, output) && !contains(output, data), 'Keep exported adapters separate from user projects.');
  assert(!contains(runtime, output) && !contains(output, runtime), 'Keep exported adapters separate from the runtime.');
  const pkg = JSON.parse(await readFile(path.join(runtime, 'package.json'), 'utf8'));
  assert(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(pkg.version), 'Invalid runtime version.');
  const entry = path.join(runtime, 'mcp.ts'); await access(entry);
  const exists = async (filename: string) => {
    try { await access(filename); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  };
  const profileFile = path.join(runtime, 'shared/mcp-release.json');
  const mcpProfile = await exists(profileFile) ? JSON.parse(await readFile(profileFile, 'utf8')).profile : 'legacy';
  assert(['legacy', 'phase1'].includes(mcpProfile), 'Invalid runtime MCP release profile.');
  const bundledNode = path.join(runtime, 'runtime/node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const command = await exists(bundledNode) ? bundledNode : process.execPath;
  await access(command, constants.X_OK);
  const bootstrap = path.join(runtime, 'bootstrap.mjs');
  const args = ['--experimental-strip-types', ...(await exists(bootstrap) ? ['--import', bootstrap] : []), entry];
  const info: IntegrationInfo = { name: 'OpenDesign', version: pkg.version, previewUrl: '', dataDirectory: data,
    transport: { type: 'stdio', command, args, cwd: runtime, env: { MOTION_DATA_DIR: data } }, tools: [] };
  const documents: { name: string; data: Buffer }[] = [];
  async function readDocuments(directory: string) {
    for (const item of await readdir(path.join(runtime, directory), { withFileTypes: true })) {
      const filename = directory + '/' + item.name;
      if (mcpProfile === 'phase1' && directory === 'skills' && !phase1Skills.includes(item.name)) continue;
      if (item.isDirectory()) await readDocuments(filename);
      else {
        assert(item.isFile(), 'Adapter documents must be regular files: ' + filename);
        documents.push({ name: filename, data: await readFile(path.join(runtime, filename)) });
      }
    }
  }
  for (const directory of ['skills', 'docs']) await readDocuments(directory);
  for (const name of ['AGENTS.md', 'CLAUDE.md']) documents.push({ name, data: await readFile(path.join(runtime, name)) });
  const filmIcon = (await readFile(path.join(runtime, 'web/design-system/icons.svg'), 'utf8')).match(/<symbol id="icon-film" viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/)?.[1];
  assert(filmIcon, 'Missing shared film icon.');
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // EEXIST deliberately leaves an earlier export untouched.
  const hosts = ['codex', 'claude', 'workbuddy', 'deepseek'] as const;
  try {
    for (const host of hosts) {
      const files = [...documents];
      const text = (name: string, value: unknown) => files.push({ name, data: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n') });
      const notes = host === 'codex' ? 'Install from this local marketplace with Codex. The runtime remains external; no service source or executables are bundled.'
        : host === 'claude' ? 'Install from this local marketplace with Claude Code. The runtime remains external.'
        : host === 'workbuddy' ? 'Local MCP + Skill Connector. WorkBuddy installation and model/render acceptance must be tested on the target desktop version. Use mcp.json for manual custom MCP setup.'
        : 'Merge the insert operation into the active Harness profile or load cordis.patch.yml with --patch. Do not replace existing profile settings.';
      text('README.md', `# OpenDesign · ${host}\n\n${notes}\n\nRuntime: ${runtime}\nWorkspace: ${data}\nVersion: ${pkg.version}\n\nStart with [AGENTS.md](AGENTS.md), [the workflow](skills/motion-production/SKILL.md) and [adapter instructions](docs/agent-adapters.md). Service scripts live under scope.json runtimeRoot, not this plugin cache.\n\nGenerated on this machine. Regenerate after moving the runtime or installing on another machine. Keep user data when uninstalling an adapter.\n`);
      text('scope.json', { host, version: pkg.version, mcpProfile, machineLocal: true, runtimeIncluded: false, runtimeRoot: runtime, dataDirectory: data, clientSettingsModified: false });
      if (host === 'deepseek') text('cordis.patch.yml', integrationConfig(info, 'deepseek').text);
      else if (host === 'workbuddy') {
        // https://open.workbuddy.cn/en/docs/connector (MCP + Skill, cwd since 4.22.15).
        text('connector-meta.json', { name: 'OpenDesign Motion', name_en: 'OpenDesign Motion', source: 'openmotion', type: 'mcp', version: pkg.version,
          description: '用共用的本机创作运行时制作和修改视频，保留可继续编辑的工程与成片。',
          description_zh: '用共用的本机创作运行时制作和修改视频，保留可继续编辑的工程与成片。',
          description_en: 'Create and edit videos using the shared local OpenDesign Motion runtime.',
          examples_zh: ['查看可用的视频模板和制作流程', '修改当前视频工程并导出成片'],
          examples_en: ['List video templates and the production workflow', 'Edit the current video project and export it'], minWorkbuddyVersion: '4.22.15' });
        text('mcp.json', { mcpServers: { motion: info.transport } });
        text('icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#282828" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${filmIcon}</svg>\n`);
      }
      else {
        const manifest = { name: 'motion', version: pkg.version, description: 'OpenDesign Motion with the shared local MCP runtime.', author: { name: 'OpenDesign' }, skills: './skills/', mcpServers: './.mcp.json' };
        text(`.${host}-plugin/plugin.json`, host === 'codex' ? { ...manifest, requires_local_executor: true,
          interface: { displayName: 'OpenDesign', shortDescription: 'Motion production with the shared local runtime.' } } : manifest);
        text('.mcp.json', host === 'codex' ? { mcpServers: { motion: info.transport } } : integrationConfig(info, 'mcp').text);
      }
      const directory = path.join(output, host, 'openmotion');
      for (const file of files) {
        const destination = path.join(directory, file.name);
        await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, file.data);
      }
      await writeFile(path.join(output, `openmotion-${host}-${pkg.version}-local.zip`), zip(files.map(file => ({ ...file, name: 'openmotion/' + file.name }))));
      if (host === 'codex' || host === 'claude') {
        const marketplace = path.join(output, host, host === 'codex' ? '.agents/plugins' : '.claude-plugin');
        await mkdir(marketplace, { recursive: true });
        await writeFile(path.join(marketplace, 'marketplace.json'), JSON.stringify({ name: 'openmotion-local', owner: { name: 'OpenDesign' }, plugins: [host === 'codex'
          ? { name: 'motion', source: { source: 'local', path: './openmotion' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }
          : { name: 'motion', source: './openmotion' }] }, null, 2) + '\n');
        await writeFile(path.join(output, host, 'mcp.json'), integrationConfig(info, 'mcp').text);
      }
      if (host === 'workbuddy') await writeFile(path.join(output, host, 'mcp.json'), JSON.stringify({ mcpServers: { motion: info.transport } }, null, 2) + '\n');
    }
    await writeFile(path.join(output, 'launch-spec.json'), JSON.stringify(info.transport, null, 2) + '\n');
    return { output, version: pkg.version, hosts, runtimeIncluded: false, clientSettingsModified: false };
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
}

if (isMain(import.meta.url)) {
  const [runtime, data, output] = process.argv.slice(2);
  console.log(JSON.stringify(await exportAdapters(runtime, data, output), null, 2));
}
