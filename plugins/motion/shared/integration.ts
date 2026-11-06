export const integrationHosts = ['codex', 'claude', 'deepseek', 'chatgpt', 'mcp'] as const;
export type IntegrationHost = typeof integrationHosts[number];
export const hostNames: Record<IntegrationHost, string> = { codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness', chatgpt: 'ChatGPT', mcp: 'MCP / CLI' };
export const hostDescriptions: Record<IntegrationHost, string> = {
  codex: '从 Codex 桌面端或 CLI 出发，把视频创作交给你的 Agent。',
  claude: '在 Claude Code 里，从参考视频到第一稿，再用对话继续打磨。',
  deepseek: '在 DeepSeek Harness 中连接创作工具，让长程任务一路做到成片。',
  chatgpt: '在熟悉的对话里开始创作。ChatGPT 云端接入需要远程工作区。',
  mcp: '连接你喜欢的 MCP 客户端，也可以从终端和脚本开始。',
};
export type IntegrationInfo = {
  name: string; version: string; previewUrl: string; dataDirectory: string;
  transport: { type: 'stdio'; command: string; args: string[]; cwd: string; env: Record<string, string> };
  tools: { name: string; description: string }[];
};
export function integrationHost(value: string | null): IntegrationHost {
  return integrationHosts.includes(value as IntegrationHost) ? value as IntegrationHost : 'codex';
}
function shellQuote(value: string) { return "'" + value.replaceAll("'", "'\"'\"'") + "'"; }

// Harness loads a Cordis plugin entry, not an mcpServers JSON object.
// https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md
export function deepseekConfig(info: IntegrationInfo) {
  const { command, args, cwd, env } = info.transport;
  const entry = [
    '- id: mcp-openmotion', "  name: '@deepseek-ai/dsh-mcp-client'", '  config:',
    '    serverName: motion', '    transport: stdio', `    command: ${JSON.stringify(command)}`,
    `    args: ${JSON.stringify(args)}`, `    cwd: ${JSON.stringify(cwd)}`, '    env:',
    ...Object.entries(env).map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`),
    '    failOnStartupError: true', '    toolCallTimeoutMs: 180000',
  ];
  return '- insert:\n' + entry.map(line => '    ' + line).join('\n') + '\n';
}

export function integrationConfig(info: IntegrationInfo, host: IntegrationHost) {
  if (host === 'chatgpt') throw new Error('当前工作区提供本机 stdio 服务，尚无可供 ChatGPT 云端连接的远程 MCP 地址。');
  if (host === 'deepseek') return { filename: 'openmotion-dsh.yaml', contentType: 'text/yaml; charset=utf-8', text: deepseekConfig(info) };
  const { command, args, cwd, env } = info.transport;
  if (host === 'codex') return {
    filename: 'openmotion-codex.toml', contentType: 'text/plain; charset=utf-8',
    text: `[mcp_servers.motion]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\ncwd = ${JSON.stringify(cwd)}\n\n[mcp_servers.motion.env]\n${Object.entries(env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n`,
  };
  return { filename: 'openmotion.mcp.json', contentType: 'application/json; charset=utf-8',
    text: JSON.stringify({ mcpServers: { motion: { type: 'stdio', command, args, env } } }, null, 2) + '\n' };
}

export function manualConnection(info: IntegrationInfo, host: IntegrationHost, locale: 'zh-CN' | 'en' = 'zh-CN') {
  if (host === 'deepseek') return deepseekConfig(info);
  if (host === 'chatgpt' && locale === 'en') return 'Current workspace: local stdio\nChatGPT cloud requires an accessible HTTPS MCP service with compatible authorization.\nThis version has no remote MCP endpoint. Use Codex, Claude Code, or DeepSeek Harness locally.';
  if (host === 'chatgpt') return '当前工作区：本机 stdio\nChatGPT 云端需要：可访问的 HTTPS MCP 服务与兼容的授权方式\n此版本尚未提供远程 MCP 端点，可先使用 Codex、Claude Code 或 DeepSeek Harness。';
  if (host === 'mcp') return integrationConfig(info, host).text;
  const { command, args, env } = info.transport;
  const prefix = host === 'codex' ? 'codex mcp add motion' : 'claude mcp add --transport stdio motion';
  const environment = Object.entries(env).map(([key, value]) => `--env ${shellQuote(`${key}=${value}`)}`).join(' ');
  return `${prefix} ${environment} -- ${[command, ...args].map(shellQuote).join(' ')}\n${host === 'codex' ? 'codex' : 'claude'} mcp get motion`;
}

export function apiDiscoveryCommand(info: IntegrationInfo) {
  return `curl --fail-with-body ${shellQuote(info.previewUrl + '/api/integration')}\ncurl --fail-with-body ${shellQuote(info.previewUrl + '/api/project/status')}`;
}

export function guideUrl(info: IntegrationInfo, host: IntegrationHost, templateId?: string) { return `${info.previewUrl}/connect/guide?host=${host}${templateId ? '&template=' + encodeURIComponent(templateId) : ''}`; }
export function setupPrompt(info: IntegrationInfo, host: IntegrationHost, locale: 'zh-CN' | 'en' = 'zh-CN') {
  if (locale === 'en') {
    if (host === 'chatgpt') return 'ChatGPT cloud requires a public HTTPS MCP service. This workspace uses local stdio. Choose Codex, Claude Code, or DeepSeek Harness to start creating.';
    return `Read ${guideUrl(info, host)} and connect OpenDesign to ${hostNames[host]}. Verify the connection, then help me start creating.`;
  }
  if (host === 'chatgpt') return 'ChatGPT 云端需要公开 HTTPS MCP 服务。当前工作区使用本机 stdio，可先选择 Codex、Claude Code 或 DeepSeek Harness 开始创作。';
  return `请读取 ${guideUrl(info, host)}，将 OpenDesign 接入 ${hostNames[host]}，验证后带我开始创作。`;
}
export function templatePrompt(info: IntegrationInfo, host: IntegrationHost, template: { id: string; title: string }) {
  return `请读取 ${guideUrl(info, host, template.id)} 并在 OpenDesign 复刻模板 ${template.id}，完成后打开可编辑工程。`;
}

export function agentGuide(info: IntegrationInfo, host: IntegrationHost) {
  if (host === 'chatgpt') return `# OpenDesign · ChatGPT 接入\n\n${manualConnection(info, host)}\n\n本地工作区：${info.previewUrl}\n请从 MCP 接入弹框选择可用的本机客户端。\n`;
  return `# OpenDesign · ${hostNames[host]} 接入指引

OpenDesign — Agent 会话、Motion 模板与可编辑产物。
Hyperframes 原生动画与视频工作室。
在对话中编辑，在本地工作区预览，保留可继续修改的工程。

## 当前工作区

- 编辑器：${info.previewUrl}
- 数据目录：${JSON.stringify(info.dataDirectory)}
- 版本：${info.version}
- MCP：本机 stdio，由客户端启动 Node.js 进程。编辑器 URL 不是 HTTP MCP 端点。
- 使用同一台电脑上的 Codex、Claude Code、DeepSeek Harness 或支持 stdio 的 MCP 客户端。

## 接入

先检查已有的 motion 服务或 OpenDesign 插件；已经指向同一工作区时直接使用。
用户要求连接时，可合并以下配置，保留其他 MCP 服务。若同名服务指向其他工作区，先说明区别，不直接覆盖。

\`\`\`${host === 'deepseek' ? 'yaml' : host === 'mcp' ? 'json' : 'sh'}
${manualConnection(info, host)}
\`\`\`

客户端配置文件片段：

\`\`\`${host === 'deepseek' ? 'yaml' : host === 'codex' ? 'toml' : 'json'}
${integrationConfig(info, host).text}\`\`\`

配置中的绝对路径、MOTION_DATA_DIR 和 PORT 来自正在运行的服务，不要换成其他副本。必要时新建会话加载工具。
通过 initialize 和 tools/list 确认工具加载，再调用 motion_get_project，核对返回的 dataDirectory。
网页可达或复制配置不代表 MCP 已连接。只验证接入时不要修改工程。
${host === 'deepseek' ? '\n将上方条目合并到 Harness 当前配置，保留其他插件。配置模型后重新加载会话，验证工具 mcp__motion__motion_get_project；以工具列表中的实际名称为准。MCP 启动不需要 DeepSeek 模型 API Key，模型凭据由 Harness 自身管理。官方配置：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md\n' : ''}

## 工具

${info.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

## API / Skill

可通过以下本地只读接口发现工具与工程状态：
\`\`\`sh
${apiDiscoveryCommand(info)}
\`\`\`
OpenMotion 一期只公开 tools/list 中的 9 个 motion_ Tool。总入口是 skills/motion-production/SKILL.md；已有专业路线直接续用。安装的 Skill 文档或 resources/list、resources/read 读取相同指引，起点为 motion://workflow/production/start，固定引擎指南为 motion://engine/SKILL.md。

## 创建与编辑

新项目用 motion_create_project，提供 requestId、projectType、title、requirements。可编辑内置模板 ID 从 Studio 画廊或已有指引选择；参考视频创建的是重建载体，由宿主 Agent 看参考并编写内容，不宣称已经生成影片。现有项目先 motion_get_project 列表/详情核对 projectId、sessionId、revision 与 currentVersionId。

素材通过 motion_import_assets 批量持久导入实际本机附件，检查逐项结果；再用 motion_edit_project 保存原生 HTML/CSS/JS 和可选需求，传 expectedRevision、expectedVersionId 及稳定 requestId。冲突时重新读，不盲目覆盖 GUI 修改。媒体生成使用宿主或 Studio 已有能力，本期 MCP 不公开生成/供应商配置入口。

motion_open_preview 打开指定已有项目，宿主浏览器打开完整 previewUrl 后才能说已打开；保留查询参数和路由。未绑定的宿主不能用全局最近项目猜测当前会话。

## 版本与导出

motion_list_versions 每页5条内容快照；motion_restore_version 恢复旧快照为新版本并保留后续历史。需要成片时才 motion_export_request，传 projectId、versionId、expectedRevision、requestId 和 audio 策略；后台冻结本地源文件/媒体，渲染 MP4 并自动技术验证。用 motion_get_project 的 exportJobId 查同一任务，只有 completed 才返回实际视频。motion_export_cancel 区分 cancelling 与 cancelled；宿主停止对话不等于任务取消。

观看最终画面、声音和真实播放器的播放/跳转/重播。可用预览/导出的 record_review 记录真实证据；未执行的检查记 not_run，技术验证不替代审片或用户验收。
`;
}
