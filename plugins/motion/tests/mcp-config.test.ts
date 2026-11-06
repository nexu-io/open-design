import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTransport } from '../scripts/check-installed-mcp.mjs';
import { VERSION } from '../preview.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
test('packaged relative cwd launches exactly as the Codex host resolves it, without placeholder substitution', async () => {
  const config = JSON.parse(await readFile(new URL('../.mcp.json', import.meta.url), 'utf8')).mcpServers.motion;
  assert.equal(config.cwd, '.'); assert.ok(!JSON.stringify(config).includes('${'));
  const resolved = { enabled: true, transport: { ...config, cwd: path.resolve(root, config.cwd) } };
  const checked = checkTransport(resolved, VERSION);
  for (const name of ['motion_create_project', 'motion_open_preview', 'motion_edit_project', 'motion_import_assets', 'motion_list_versions', 'motion_restore_version', 'motion_export_request', 'motion_export_cancel']) assert.ok(checked.tools.includes(name));
  assert.equal(checked.tools.length, 9);
});
test('installation check catches the exact installed placeholder bug before reporting success', () => {
  assert.throws(() => checkTransport({ enabled: true, transport: { type: 'stdio', command: 'node',
    args: ['--experimental-strip-types', '${PLUGIN_ROOT}/mcp.ts'], cwd: path.join(root, '${PLUGIN_ROOT}') } }, VERSION), /未展开占位符/);
});
