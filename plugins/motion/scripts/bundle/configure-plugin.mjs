import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const metadata = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
assert.equal(metadata.target, process.platform === 'win32' && process.arch === 'x64' ? 'win-x64' : process.platform === 'darwin' && process.arch === 'arm64' ? 'mac-arm64' : '', 'Install the package for this OS/CPU');
const node = path.join(root, 'runtime/node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
await access(node);
const config = JSON.parse(await readFile(path.join(root, '.mcp.json'), 'utf8'));
Object.assign(config.mcpServers.motion, { command: node, args: ['--experimental-strip-types', '--import', './bootstrap.mjs', 'mcp.ts'], cwd: root });
await writeFile(path.join(root, 'plugin/.mcp.json'), JSON.stringify(config, null, 2) + '\n');
console.log('Thin plugin configured for: ' + root);
