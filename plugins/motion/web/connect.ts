import { integrationHost, hostNames, hostDescriptions, setupPrompt, manualConnection, agentGuide, apiDiscoveryCommand } from '../shared/integration';
import type { IntegrationInfo } from '../shared/integration';
import { mountTemplates } from './template-gallery';

export function mountConnection(root: HTMLElement, options: { close: () => void; useTemplate: (id: string) => void; initialHost?: string | null }) {
  const element = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  let host = integrationHost(options.initialHost ?? null), info: IntegrationInfo | null = null;
  let checking = false;
  let feedbackTimer: ReturnType<typeof setTimeout>;
  const copiedButtons = new Map<HTMLButtonElement, Node[]>();
  let galleryController: ReturnType<typeof mountTemplates> | undefined;
  const lifetime = new AbortController();
  const blocked = () => host === 'chatgpt';

  function glyph(name: string) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ui-icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/web/design-system/icons.svg#icon-' + name); svg.append(use); return svg;
  }
  function buttonLabel(button: HTMLButtonElement, text: string, icon: string) {
    const label = document.createElement('span'); label.textContent = text; button.replaceChildren(glyph(icon), label);
  }
  function resetCopied() {
    copiedButtons.forEach((nodes, button) => button.replaceChildren(...nodes)); copiedButtons.clear();
    clearTimeout(feedbackTimer); element('connect-feedback').classList.remove('is-visible');
  }
  async function copy(value: string, label: string, button?: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(value); resetCopied();
      if (button) { copiedButtons.set(button, [...button.childNodes]); buttonLabel(button, '已复制', 'check'); }
      element('connect-feedback').textContent = `${label}已复制，粘贴到 ${hostNames[host]} 即可。`;
      element('connect-feedback').classList.add('is-visible'); feedbackTimer = setTimeout(resetCopied, 3000);
    } catch {
      element<HTMLTextAreaElement>('copy-fallback').value = value;
      element<HTMLDialogElement>('copy-dialog').showModal();
      element<HTMLTextAreaElement>('copy-fallback').focus(); element<HTMLTextAreaElement>('copy-fallback').select();
    }
  }
  function scrollTo(id: string) {
    const target = element(id);
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  root.querySelectorAll<HTMLButtonElement>('[data-close-connect]').forEach(button => button.onclick = options.close);
  root.querySelectorAll<HTMLButtonElement>('[data-scroll]').forEach(button => button.onclick = () => scrollTo(button.dataset.scroll!));
  element('close-copy').onclick = () => element<HTMLDialogElement>('copy-dialog').close();
  element('close-guide').onclick = () => element<HTMLDialogElement>('guide-dialog').close();

  function renderHost() {
    const primary = host === 'chatgpt' ? 'mcp' : host;
    for (const id of ['host-name', 'command-host', 'step-host']) element(id).textContent = hostNames[host];
    element('host-description').textContent = hostDescriptions[host];
    element('setup-action').textContent = blocked() ? '接入条件 · ' : '复制这句指令，发送到 ';
    element('setup-frequency').hidden = blocked(); element('setup-steps').hidden = blocked();
    element('template-intro').textContent = blocked()
      ? '先查看模板与参考。复制复刻指令、交给 Agent 继续创作时，请选择可用的本机客户端。'
      : `找到喜欢的作品，一键复制给 ${hostNames[host]}，开始复刻。`;
    root.querySelectorAll<HTMLButtonElement>('[data-host]').forEach(button => {
      const selected = button.dataset.host === primary;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    element('host-panel').setAttribute('aria-labelledby', `host-${primary}`);
    element('other-hosts').hidden = primary !== 'mcp';
    root.querySelectorAll<HTMLButtonElement>('[data-other-host]').forEach(button => {
      const selected = button.dataset.otherHost === host;
      button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('ui-button--ghost', !selected);
    });
    element('host-unavailable').hidden = !blocked();
    element<HTMLAnchorElement>('download-config').href = `/connect/config?host=${host}`;
    element('download-config').hidden = !info || blocked();
    for (const id of ['copy-setup', 'copy-config', 'copy-preview-template']) element<HTMLButtonElement>(id).disabled = !info || blocked();
    element('setup-prompt').textContent = info ? setupPrompt(info, host) : '暂时无法读取接入地址，请检查工作区服务后重试。';
    element('manual-config').textContent = info ? manualConnection(info, host) : '恢复工作区连接后即可查看配置。';
    element('config-description').textContent = host === 'deepseek' ? '将以下插件条目合并到 Harness 配置，保留已有插件。' : host === 'chatgpt' ? '当前工作区使用本机 stdio，尚未提供远程 MCP 服务。' : '使用以下配置接入，保留已有的其他服务。';
    element('connection-help').textContent = host === 'deepseek'
      ? '通过 @deepseek-ai/dsh-mcp-client 启动本机服务。重新加载后，调用 mcp__motion__motion_get_project 核对工作区；DeepSeek 模型凭据在 Harness 中单独配置。'
      : host === 'chatgpt' ? '本机预览地址不能作为 ChatGPT 云端 MCP 地址。可先选择本机客户端继续创作。'
      : '配置绑定当前工作区。已有同名 motion 服务时，先核对数据目录；需要时重新打开宿主会话加载工具。';
    element('api-section').hidden = host !== 'mcp';
    element('api-command').textContent = info ? apiDiscoveryCommand(info) : '工作区恢复连接后可查询。';
    element<HTMLButtonElement>('copy-api').disabled = !info;
    galleryController?.updateConnection();
  }
  function chooseHost(value: string) { resetCopied(); host = integrationHost(value); renderHost(); }
  root.querySelectorAll<HTMLButtonElement>('[data-host]').forEach(button => button.onclick = () => chooseHost(button.dataset.host!));
  root.querySelectorAll<HTMLButtonElement>('[data-other-host]').forEach(button => button.onclick = () => chooseHost(button.dataset.otherHost!));
  element('host-tabs').onkeydown = event => {
    const buttons = [...element('host-tabs').querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); chooseHost(buttons[next].dataset.host!);
  };
  element<HTMLButtonElement>('copy-setup').onclick = event => { if (info && !blocked()) void copy(setupPrompt(info, host), '接入指令', event.currentTarget as HTMLButtonElement); };
  element<HTMLButtonElement>('copy-config').onclick = event => { if (info && !blocked()) void copy(manualConnection(info, host), '配置', event.currentTarget as HTMLButtonElement); };
  element<HTMLButtonElement>('copy-api').onclick = event => { if (info) void copy(apiDiscoveryCommand(info), 'API 命令', event.currentTarget as HTMLButtonElement); };
  element('show-api').onclick = () => { chooseHost('mcp'); scrollTo('manual-settings'); };
  root.querySelectorAll<HTMLButtonElement>('[data-open-guide]').forEach(button => button.onclick = () => {
    element('guide-title').textContent = `${hostNames[host]} · 接入指引`;
    element('guide-content').textContent = info ? agentGuide(info, host) : '暂时无法读取工作区配置。请关闭指引，在“手动配置与连接状态”中重新检查。';
    element<HTMLButtonElement>('copy-guide').disabled = !info;
    element<HTMLDialogElement>('guide-dialog').showModal();
  });
  element<HTMLButtonElement>('copy-guide').onclick = event => { if (info) void copy(agentGuide(info, host), '接入指引', event.currentTarget as HTMLButtonElement); };

  const toolDescriptions: Record<string, string> = {
    motion_open_preview: '打开本地编辑器，自动启动或复用预览服务。', motion_get_project: '读取工程、分镜、素材信息和版本号。',
    motion_list_templates: '搜索完整模板目录，按分类、关键词和页码浏览。', motion_get_template: '读取选定模板的参考视频、源码、制作要求与工程格式。', motion_apply_template: '创建本地模板副本，保留原工程与素材。', motion_write_files: '写入原生 HTML、CSS 与 JS，编辑器同步更新。', motion_get_workflow: '读取制作、检查与交付流程。',
    motion_request_export: '请求导出当前版本的 MP4 视频。', motion_get_export: '查询导出进度，取得已完成视频的下载地址。',
  };
  async function checkConnection() {
    if (checking) return; checking = true;
    element<HTMLButtonElement>('check-connection').disabled = true;
    element('service-status').textContent = '正在检查工作区'; element('service-dot').dataset.ready = 'false';
    try {
      const response = await fetch('/motion-api/integration', { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error('工作区暂不可达，请确认 OpenDesign 服务正在运行。');
      const value = await response.json() as IntegrationInfo;
      if (lifetime.signal.aborted) return;
      if (!['OpenDesign', 'OpenMotion', 'OpenDesign Motion'].includes(value.name) || value.transport?.type !== 'stdio' || !value.transport.command || !Array.isArray(value.transport.args) || !value.transport.env?.MOTION_DATA_DIR || !Array.isArray(value.tools)) throw new Error('接入配置无效，请更新或重启当前 OpenDesign 服务。');
      info = value; element('service-status').textContent = `工作区可达 · v${info.version}`;
      element('service-dot').dataset.ready = 'true'; element('workspace-url').textContent = info.previewUrl;
      element('workspace-directory').textContent = info.dataDirectory; element('connection-error').hidden = true;
      element('tool-list').replaceChildren(...info.tools.map(tool => {
        const item = document.createElement('article'), name = document.createElement('code'), description = document.createElement('p');
        item.className = 'connect-tool'; name.textContent = tool.name; description.textContent = toolDescriptions[tool.name] || tool.description;
        item.append(name, description); return item;
      }));
    } catch (error) {
      if (lifetime.signal.aborted) return;
      info = null; element('service-status').textContent = '工作区暂不可达';
      element('workspace-url').textContent = '—'; element('workspace-directory').textContent = '—';
      element('connection-error').textContent = error instanceof Error && error.name !== 'TimeoutError' ? error.message : '连接超时，请检查本地服务并重试。';
      element('connection-error').hidden = false; element('tool-list').textContent = '服务恢复后可查看当前工具列表。';
    } finally { checking = false; if (!lifetime.signal.aborted) { element<HTMLButtonElement>('check-connection').disabled = false; renderHost(); } }
  }
  element('check-connection').onclick = () => void checkConnection();

  galleryController = mountTemplates(root, { info: () => info, host: () => host, copy, useTemplate: options.useTemplate });
  renderHost();
  return {
    showTemplates() { galleryController!.showAll(); scrollTo('templates'); },
    resume() { void checkConnection(); galleryController!.resume(); },
    suspend() { galleryController!.suspend(); resetCopied(); root.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close()); },
    destroy() { lifetime.abort(); galleryController!.destroy(); resetCopied(); root.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close()); },
  };
}
