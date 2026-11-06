import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function checkTransport(config, expectedVersion) {
  if (!config?.enabled || config.transport?.type !== 'stdio') throw new Error('OpenDesign MCP 未启用或不是 stdio 服务');
  const transport = config.transport;
  if (JSON.stringify([transport.command, transport.cwd, transport.args]).includes('${')) throw new Error('Codex 解析后的启动配置仍含未展开占位符，不能启动 MCP；请更新 OpenDesign 配置');
  if (!path.isAbsolute(transport.cwd || '') || !fs.statSync(transport.cwd).isDirectory()) throw new Error('Codex 解析后的 MCP 工作目录不存在');
  if (transport.command !== 'node' || JSON.stringify(transport.args) !== JSON.stringify(['--experimental-strip-types', 'mcp.ts'])) throw new Error('OpenDesign 的实际启动命令与当前插件不一致，已停止预检');
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'motion-install-check', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ];
  const result = spawnSync(transport.command, transport.args, { cwd: transport.cwd,
    env: { ...process.env, ...(transport.env || {}) }, encoding: 'utf8', timeout: 15_000,
    input: messages.map(message => JSON.stringify(message)).join('\n') + '\n' });
  if (result.error || result.status !== 0) throw new Error('按 Codex 实际配置启动 MCP 失败：' + (result.error?.message || result.stderr.slice(-1000)));
  const responses = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  const initialization = responses.find(response => response.id === 1)?.result;
  const listed = responses.find(response => response.id === 2)?.result?.tools;
  if (initialization?.serverInfo?.version !== expectedVersion) throw new Error('实际启动的 OpenDesign 版本与待安装版本不同');
  const names = listed?.map(tool => tool.name) || [];
  const expected = ['motion_create_project', 'motion_open_preview', 'motion_import_assets', 'motion_get_project', 'motion_edit_project', 'motion_export_request', 'motion_list_versions', 'motion_restore_version', 'motion_export_cancel'];
  if (names.length !== expected.length || !expected.every(name => names.includes(name))) throw new Error('实际 MCP 未严格返回一期 9 个 motion_ Tool，请更新 OpenMotion 插件');
  return { version: expectedVersion, cwd: transport.cwd, tools: names };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const version = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8')).version;
    const result = spawnSync('codex', ['mcp', 'get', 'motion', '--json'], { encoding: 'utf8', timeout: 15_000 });
    if (result.error || result.status !== 0) throw new Error('无法读取 Codex 实际 MCP 配置：' + (result.error?.message || result.stderr.slice(-500)));
    const checked = checkTransport(JSON.parse(result.stdout), version);
    console.log('安装预检通过：Codex 解析后的真实启动命令可完成 MCP 握手并列出工具。');
    console.log(JSON.stringify(checked, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
