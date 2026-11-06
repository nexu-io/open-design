import { createInterface } from 'node:readline';
import { WorkspaceStore } from './workspace.ts';
import { ensureService, VERSION } from './preview.ts';
import { tools, callTool } from './mcp-tools.ts';
export { tools, callTool } from './mcp-tools.ts';
import { createToolRegistry, releaseProfile } from './shared/mcp-registry.ts';
import { phase1Tools, validateInput } from './shared/phase1-tools.ts';
import { workflowResources, readWorkflowResource } from './shared/workflow.ts';
import { ensureEditor, editorRequest, editorHeaders, sharedEditorEnabled } from './editor-runtime.ts';
import { isMain } from './shared/entry.ts';
import type { Selection } from './editor-runtime.ts';

export function mcpRegistry(profile = releaseProfile) { return createToolRegistry(profile === 'phase1' ? phase1Tools : tools, profile); }
export const releaseRegistry = mcpRegistry();
export const publicTools = releaseRegistry.tools;
const selections = new WeakMap<WorkspaceStore, { sessionId: string; projectId: string }>();

export async function rpc(message: any, store = new WorkspaceStore(), registry = releaseRegistry, connection?: { selection: Selection }) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  if (message.id === undefined) return null;
  const result = (value: unknown) => ({ jsonrpc: '2.0', id: message.id, result: value });
  if (message.method === 'initialize') return result({ protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2025-11-25', capabilities: { tools: {}, ...(registry.profile === 'phase1' ? { resources: {} } : {}) }, serverInfo: { name: 'motion', version: VERSION }, instructions: registry.instructions ?? 'For new films or substantial revisions without a selected route, read motion_get_workflow workflow=production section=start to select one route. A director, template or recreate route already selected by host Skill discovery, the user or an exact catalog guide starts directly at its own start section and reuses production/context without returning to the router. template and recreate are placeholders; follow their stated scope and fallback, never claim a completed specialist. Load only references needed by the current task and reuse already loaded documentId/contentHash. Reuse saved decisions for small edits. Motion wraps Hyperframes Studio and its renderer. Only for tasks that require working in the editor or authoring a project, call motion_open_preview, read its pinned authoringGuide and open previewUrl with the host built-in browser before reporting it opened. Author native HTML compositions with seekable GSAP timelines, never custom shot JSON or canvas recording. Read motion_get_project before source edits and pass its revision as expectedRevision; inspect lint/timeline afterwards. Only when the user scope includes export/final delivery, query any applicable existing export to avoid duplicate jobs and export the inspected revision in the background, wait for completed, then call motion_verify_export with that job ID/revision and the brief audio policy. Separately inspect final visuals, sound and actual player playback before claiming full verification. MCP previewUrl defaults to embed=1; preserve its query and hash. Use sessionUrl or embedded=false only for the full OpenDesign workspace. Do not restart the host Agent or ask users to start a terminal server.' });
  if (message.method === 'ping') return result({});
  if (registry.profile === 'phase1' && message.method === 'resources/list') return result({ resources: workflowResources() });
  if (registry.profile === 'phase1' && message.method === 'resources/read') {
    try { return result({ contents: [await readWorkflowResource(message.params?.uri, store.directory)] }); }
    catch (error) { return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: (error as Error).message } }; }
  }
  if (message.method === 'tools/list') return result({ tools: registry.tools });
  if (message.method === 'tools/call') {
    try {
      if (!registry.tools.some(tool => tool.name === message.params?.name)) throw new Error('MCP_TOOL_NOT_EXPOSED: ' + String(message.params?.name));
      if (registry.profile === 'phase1') {
        const name = message.params.name;
        const args = { ...(message.params.arguments ?? {}) };
        const definition = phase1Tools.find(tool => tool.name === name)!;
        validateInput(definition.inputSchema, args);
        if (name === 'motion_open_preview' && !args.projectId && !args.sessionId && args.action !== 'record_review') args.sessionId = selections.get(store)?.sessionId;
        if (args.sessionId === undefined) delete args.sessionId;
        const service = await ensureService(store), origin = new URL(service.previewUrl).origin;
        const response = await fetch(origin + '/motion-api/phase1/call', { method: 'POST', headers: await editorHeaders(store, origin),
          body: JSON.stringify({ name, arguments: args }), signal: AbortSignal.timeout(600_000) });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Tool failed');
        if (value.projectId && value.sessionId) selections.set(store, { projectId: value.projectId, sessionId: value.sessionId });
        return result({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
      }
      let value;
      if (connection && !['motion_get_workflow', 'motion_list_templates', 'motion_get_template'].includes(message.params?.name)) {
        const editor = await ensureEditor(store.directory);
        const reply = await editorRequest(editor, '/editor-api/tools/call', { name: message.params?.name, arguments: message.params?.arguments || {}, selection: connection.selection });
        connection.selection = reply.selection; value = reply.result;
      } else value = await callTool(message.params?.name, message.params?.arguments || {}, store);
      return result({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool failed';
      const code = (error as any).code || /^([A-Z][A-Z_]+):?/.exec(message)?.[1] || 'TOOL_FAILED';
      return result({ isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: { code, message,
        applied: /^(INVALID_|VERSION_CONFLICT|PROJECT_NOT_|PROJECT_SESSION_|REQUEST_ID_CONFLICT|MCP_TOOL_NOT_EXPOSED|EXPORT_NOT_|TEMPLATE_NOT_)/.test(code) ? false : 'unknown' } } });
    }
  }
  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
}
if (isMain(import.meta.url)) {
  const store = new WorkspaceStore();
  const connection = sharedEditorEnabled ? { selection: {} } : undefined;
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let response;
    try { response = await rpc(JSON.parse(line), store, releaseRegistry, connection); }
    catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
    if (response) process.stdout.write(JSON.stringify(response) + '\n');
  }
}
