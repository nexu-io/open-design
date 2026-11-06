import { isMain } from '../shared/entry.ts';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { phase1Skills } from '../shared/workflow.ts';

// ZIP "store" format, so packaging has no runtime dependencies.
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0, directorySize = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const crc = crc32(entry.data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.data.length, 18); header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8); dir.writeUInt16LE(33, 14); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(entry.data.length, 20); dir.writeUInt32LE(entry.data.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    local.push(header, name, entry.data); central.push(dir, name);
    offset += header.length + name.length + entry.data.length; directorySize += dir.length + name.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
const root = fileURLToPath(new URL('../', import.meta.url));
async function main() {
  const { releaseProfile } = await import('../shared/mcp-registry.ts');
  const flags = process.argv.slice(2);
  if (flags.length > 1 || (flags.length && !/^--mcp-profile=(legacy|phase1)$/.test(flags[0]))) throw new Error('Usage: package.ts [--mcp-profile=legacy|phase1]');
  const profile = flags[0]?.split('=')[1] ?? releaseProfile;
  const { mcpRegistry } = await import('../mcp.ts');
  const registry = mcpRegistry(profile);
  const { check } = await import('./check.ts');
  await check();
  const manifest = JSON.parse(await readFile(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const files: string[] = ['.codex-plugin/plugin.json', '.mcp.json', 'server.ts', 'browser.ts', 'workspace.ts', 'mcp.ts', 'mcp-tools.ts', 'editor-runtime.ts', 'phase1.ts', 'phase1-versions.ts', 'preview.ts', 'hyperframes.ts', 'template-library.ts', 'template-catalog.ts', 'editor-server.ts', 'package.json', 'package-lock.json', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'marketplace.example.json'];
  async function walk(directory: string) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.endsWith('.map')) continue;
      const file = directory + '/' + entry.name;
      if (profile === 'phase1' && directory === 'skills' && !phase1Skills.includes(entry.name)) continue;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  for (const directory of ['web', 'shared', 'gateway', 'skills', 'scripts', 'tests', 'docs', 'templates', 'template-library', 'studio']) await walk(directory);
  const entries = await Promise.all(files.sort().map(async file => ({ name: manifest.name + '/' + file,
    data: file === 'shared/mcp-release.json' ? Buffer.from(JSON.stringify({ profile }, null, 2) + '\n') : await readFile(path.join(root, file)) })));
  await mkdir(path.join(root, 'dist'), { recursive: true });
  const output = `dist/${manifest.name}-${manifest.version}${profile === 'legacy' ? '' : '-' + profile}.zip`;
  await (await import('node:fs/promises')).writeFile(path.join(root, output), zip(entries));
  console.log(`${output}: ${entries.length} files, MCP ${profile}: ${registry.tools.length} tools (no personal media or native executables).`);
}
if (isMain(import.meta.url)) await main();
