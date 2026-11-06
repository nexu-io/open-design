import { compareVideos } from './shared/video-compare.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WorkspaceStore } from './workspace.ts';
import type { FileEdit } from './workspace.ts';
import { ensureService, openPreview, previewUrl, VERSION } from './preview.ts';
import { ensureRuntime, HYPERFRAMES_VERSION, inspectProject } from './hyperframes.ts';
import { templates, findTemplate } from './template-library.ts';
import { listTemplates, readTemplate } from './template-catalog.ts';
import { getWorkflow, workflowNames, workflowSections } from './shared/workflow.ts';
import { verifyExport } from './scripts/verify-export.ts';
import type { ExportExpectation } from './shared/export-spec.ts';
import { creationModes, creationMode } from './shared/session.ts';
import { sessionPath } from './shared/workspace-url.ts';
import { gatewayFor } from './gateway/service.ts';
import type { GenerateInput } from './shared/gateway.ts';
import { editorHeaders } from './editor-runtime.ts';

const revision = { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Opaque content revision from motion_get_project. Includes Studio edits and local assets. Read again after a conflict.' };
const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const reads = { readOnlyHint: true, openWorldHint: false };
const empty = { type: 'object', properties: {}, additionalProperties: false };
const mediaKind = { type: 'string', enum: ['image', 'video', 'audio'] };
const providerKind = { type: 'string', enum: ['codex', 'atlascloud', 'fal'] };
const modelParameters = { type: 'object', description: 'Provider-native input fields, e.g. duration, resolution, image_url or voice. No model, prompt, credentials or webhook_url. Check the chosen model API for required fields.', additionalProperties: true };
export const tools = [
  { name: 'design_get_session', description: 'Read the current OpenDesign conversation, mode, skill and owned artifacts. Sessions are independent of Motion projects. Select an artifact from this session before editing it with the motion tools.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, additionalProperties: false }, annotations: reads },
  { name: 'design_append_message', description: 'Append a real user request or Agent reply to the shared conversation. Supply a stable message UUID for safe retries. This records content only; it does not execute a model or report artifact generation as completed.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, id: { type: 'string' }, role: { enum: ['user', 'assistant'], default: 'assistant' }, content: { type: 'string', minLength: 1, maxLength: 8000 } }, required: ['sessionId', 'id', 'content'], additionalProperties: false }, annotations: { ...writes, idempotentHint: true } },
  { name: 'design_create_session', description: 'Create a host-independent Agent conversation first, then optionally generate its mode/template artifact. Uses the same session API as the OpenDesign Agent UI. Set createArtifact=false to converse before producing an artifact. Returns a default embedded previewUrl and an explicit full-workspace sessionUrl. On generation failure the conversation is preserved for retry.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, mode: { enum: creationModes.map(mode => mode.id) }, title: { type: 'string' }, instruction: { type: 'string', maxLength: 8000 }, templateId: { type: 'string' }, createArtifact: { type: 'boolean', default: true }, embedded: { type: 'boolean', default: true, description: 'Default: Viewer only for host browsers. Set false for the full conversation workspace.' } }, additionalProperties: false }, annotations: writes },
  { name: 'design_create_artifact', description: 'Generate another artifact in an existing conversation using its mode and the selected template. A failed generation keeps the conversation and its previous artifacts. Returns previewUrl showing only the Artifact Viewer by default in Codex or another host browser.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, templateId: { type: 'string' }, title: { type: 'string' }, expectedRevision: revision, embedded: { type: 'boolean', default: true } }, required: ['sessionId', 'expectedRevision'], additionalProperties: false }, annotations: writes },
  { name: 'design_open_artifact', description: 'Open an existing artifact owned by a specific conversation. Wait for Studio saves before switching. Returns the selected project and default embedded previewUrl plus full sessionUrl; re-read motion_get_project before editing.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, artifactId: { type: 'string' }, expectedRevision: revision, embedded: { type: 'boolean', default: true } }, required: ['sessionId', 'artifactId', 'expectedRevision'], additionalProperties: false }, annotations: writes },
  { name: 'motion_get_capabilities', description: 'Inspect the shared Model Gateway: local Agent installation/login/image support, configured cloud providers, image/video/audio capabilities and default routes. Cloud credentials stay unverified until a generation succeeds; catalogue discovery does not verify quota. Never returns keys.', inputSchema: { ...empty, properties: { refresh: { type: 'boolean' } } }, annotations: reads },
  { name: 'motion_list_models', description: 'Search media models by provider and output modality. refresh fetches public Atlas/fal catalogues; offline entries are explicitly labelled. Follow nextOffset to paginate. Provider model IDs and generation modes are returned; configure credentials separately.',
    inputSchema: { ...empty, properties: { provider: providerKind, modality: mediaKind, query: { type: 'string', maxLength: 200 }, refresh: { type: 'boolean' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } } }, annotations: { ...reads, openWorldHint: true } },
  { name: 'motion_configure_provider', description: 'Configure a Model Gateway provider in this local workspace. API keys are write-only and excluded from projects/exports. apiKey=null removes the stored key (an environment key may remain); enabled=false disables the provider. Codex uses its own login and accepts no key.',
    inputSchema: { ...empty, properties: { provider: providerKind, apiKey: { type: ['string', 'null'] }, enabled: { type: 'boolean' } }, required: ['provider'] }, annotations: { ...writes, idempotentHint: true } },
  { name: 'motion_set_model_route', description: 'Choose the default model key for image, video or audio. null restores automatic selection. A selected unavailable model fails explicitly; there is no automatic paid-provider fallback.',
    inputSchema: { ...empty, properties: { modality: mediaKind, model: { type: ['string', 'null'] } }, required: ['modality', 'model'] }, annotations: { ...writes, idempotentHint: true } },
  { name: 'motion_register_model', description: 'Register a provider model missing from the catalogue, with its exact endpoint ID, output modality, mode and optional provider-native defaults. Uses the existing Atlas or fal adapter; registration is not proof of remote availability.',
    inputSchema: { ...empty, properties: { provider: { enum: ['atlascloud', 'fal'] }, modelId: { type: 'string' }, label: { type: 'string' }, modality: mediaKind, mode: { type: 'string', description: 'e.g. text-to-image, image-to-video, text-to-speech' }, defaults: modelParameters }, required: ['provider', 'modelId', 'label', 'modality', 'mode'] }, annotations: { ...writes, idempotentHint: true } },
  { name: 'motion_generate_asset', description: 'Queue image, video or audio generation via the shared Model Gateway. Uses the selected local Codex login or configured paid provider. Returns queued, not a finished asset. Poll motion_get_generation; only completed assets may be composed into a video. Files are imported under assets/generated in the project captured at submission. Does not edit a composition. Supply an idempotencyKey to avoid duplicate paid requests.',
    inputSchema: { ...empty, properties: { modality: mediaKind, prompt: { type: 'string', minLength: 1, maxLength: 20000 }, model: { type: 'string', description: 'Gateway model key from motion_list_models; omit to use default route' }, projectId: { type: 'string' }, referenceAsset: { type: 'string', description: 'Optional project-relative PNG/JPEG/WebP under 20 MB to edit. Requires a model with supportsImageReference (currently Codex). Snapshotted when queued; does not modify the original.' }, parameters: modelParameters, idempotencyKey: { type: 'string', maxLength: 100 }, usage: { type: 'object', properties: { compositionId: { type: 'string' }, elementId: { type: 'string' }, property: { type: 'string' } }, additionalProperties: false } }, required: ['modality', 'prompt'] }, annotations: { ...writes, openWorldHint: true } },
  { name: 'motion_get_generation', description: 'Read one generation job. completed includes real imported asset paths, MIME types and sizes. Failed/cancelled jobs are not resubmitted automatically. Use the returned projectId and assets[].path when authoring native compositions.', inputSchema: { ...empty, properties: { jobId: { type: 'string' } }, required: ['jobId'] }, annotations: reads },
  { name: 'motion_list_generations', description: 'List the most recent 50 generation jobs, optionally scoped to a project.', inputSchema: { ...empty, properties: { projectId: { type: 'string' } } }, annotations: reads },
  { name: 'motion_cancel_generation', description: 'Cancel a pending or running generation. Stops local execution and import; requests fal cancellation when supported. Remote provider work/charges may still complete.', inputSchema: { ...empty, properties: { jobId: { type: 'string' } }, required: ['jobId'] }, annotations: { ...writes, idempotentHint: true, openWorldHint: true } },
  { name: 'motion_get_workflow', description: 'Read packaged Motion instructions. Start with production/start to select one route; a specialist already selected by host Skill discovery, the user or an exact catalog guide starts directly and reuse production/context without restarting the router. Changes to existing content use shared production/edit. director covers creative motion quality; template serves template-to-video; recreate rebuilds a reference video as a film for the user; video-to-template is a separate reusable-template production route. Follow conditional references and reuse documentId/contentHash to avoid duplicate reads. Legacy section-only calls read production. Read-only; does not start a preview or change a project.',
    inputSchema: { type: 'object', properties: { workflow: { type: 'string', enum: workflowNames, default: 'production' }, section: { type: 'string', enum: workflowSections, default: 'start' } }, additionalProperties: false }, annotations: reads },
  { name: 'motion_open_preview', description: 'Start or reuse the Motion mode in OpenDesign. Initializes a native HTML project and compatible conversation only when empty. By default previewUrl contains embed=1 and returns only the Artifact Viewer, with global sidebar and conversation hidden, for Codex or another host browser. Also returns full session and embedded links. The tool itself does not open a browser.', inputSchema: { type: 'object', properties: { embedded: { type: 'boolean', default: true, description: 'Default: Viewer only for host browsers. Set false for the full conversation workspace.' } }, additionalProperties: false }, annotations: { ...writes, idempotentHint: true } },
  { name: 'motion_get_project', description: 'Read the active projectId, saved user conversation and native Hyperframes project: index.html source, project directory, file inventory and content revision. Studio and Agent share these exact files; no separate shot JSON. Media bytes are omitted. Check projectId against the requested project before editing.', inputSchema: empty, annotations: reads },
  { name: 'motion_list_templates', description: 'Search and paginate the complete Hyperframes reference, clip, block, component and example catalog plus bundled editable projects. Follow next to continue. Read motion_get_template for an exact selected ID.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 200 }, category: { enum: ['featured', 'all', 'clone', 'ads', 'motion', 'script', 'builtin'] }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 60 } }, additionalProperties: false }, annotations: reads },
  { name: 'motion_get_template', description: 'Read the exact selected template ID, kind, original video/source URLs and workflowGuide. builtin/registry route to template; video-only reference routes to recreate. template serves the implemented template-to-video Skill; recreate rebuilds a reference video as a film for the user. Reuse the selected ID and existing project; this read-only tool does not create or recreate a project.',
    inputSchema: { type: 'object', properties: { templateId: { type: 'string' } }, required: ['templateId'], additionalProperties: false }, annotations: reads },
  { name: 'motion_apply_template', description: 'Create a user-selected Hyperframes template as a new Motion artifact in the specified or current conversation. Preserves previous artifacts and assets. Agent and Studio switch to the new project together. Cold startup does not initialize an unrelated starter. Read the latest revision first.', inputSchema: { type: 'object', properties: { expectedRevision: revision, sessionId: { type: 'string' }, embedded: { type: 'boolean', default: true }, templateId: { type: 'string', enum: templates.map(template => template.id) } }, required: ['expectedRevision', 'templateId'], additionalProperties: false }, annotations: writes },
  { name: 'motion_read_file', description: 'Read a Hyperframes composition, CSS, JS, captions or other text source file by project-relative path.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false }, annotations: reads },
  { name: 'motion_write_files', description: 'Write native Hyperframes HTML/CSS/JS source. Use data-composition-id, data-start/duration, data-width/height/fps, class="clip", data-track-index, data-media-start and a paused GSAP timeline registered in window.__timelines[compositionId]. Use assets/gsap.min.js for the bundled GSAP. Studio reloads the same files. Re-read revision before writing, then run motion_inspect_project view=lint. Does not translate a custom motion DSL.',
    inputSchema: { type: 'object', properties: { expectedRevision: revision, files: { type: 'array', minItems: 1, maxItems: 100, items: {
      type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false,
    } } }, required: ['expectedRevision', 'files'], additionalProperties: false }, annotations: writes },
  { name: 'motion_import_asset', description: 'Copy a local media, font or reference file into the native project assets directory. Use its relative path in Hyperframes HTML. Supports video, audio and images; no base64 media in tool responses.',
    inputSchema: { type: 'object', properties: { expectedRevision: revision, sourcePath: { type: 'string', description: 'Absolute local source path' }, targetPath: { type: 'string', description: 'Project-relative destination under assets/' } }, required: ['expectedRevision', 'sourcePath', 'targetPath'], additionalProperties: false }, annotations: writes },
  { name: 'motion_inspect_project', description: 'Delegate project inspection to the pinned Hyperframes CLI. info returns composition metadata, timeline returns native clips and timing, lint returns official syntax/runtime-contract diagnostics. Fix lint errors before rendering.',
    inputSchema: { type: 'object', properties: { view: { enum: ['info', 'timeline', 'lint'] } }, required: ['view'], additionalProperties: false }, annotations: reads },
  { name: 'motion_request_export', description: 'Snapshot the requested native project revision and queue a background MP4 render using Hyperframes renderer, including audio. Starts only the background service if needed, without launching Studio or changing active source. Real external edits still cause a revision conflict. No foreground browser or MediaRecorder required. Returns pending; use motion_get_export until completed.',
    inputSchema: { type: 'object', properties: { expectedRevision: revision }, required: ['expectedRevision'], additionalProperties: false }, annotations: writes },
  { name: 'motion_get_export', description: 'Read the latest Hyperframes render status. Only completed means a real MP4 exists. Returns output path and downloadUrl after completion; failed includes the renderer diagnostics.', inputSchema: empty, annotations: reads },
  { name: 'motion_verify_export', description: 'Verify the completed job and its revision against specifications captured from the immutable Hyperframes snapshot: MP4/H.264, dimensions, fps, duration, audio policy, full video/audio decode and representative seeks. Returns technical evidence with SHA-256; visual and player review remain separate. Set audio required or silent from the brief; optional only permits either.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' }, expectedRevision: { ...revision, description: 'Revision of the completed export job, which may differ from the active project.' }, audio: { enum: ['required', 'silent', 'optional'], default: 'optional' } }, required: ['jobId', 'expectedRevision'], additionalProperties: false }, annotations: reads },
  { name: 'motion_compare_video', description: 'Optional diagnostic comparison of two absolute video file paths (candidate also accepts latest-export); export projects before comparing. Delegates to native HyperFrames diff. Reports measurements, not human visual acceptance; does not register templates.',
    inputSchema: { type: 'object', properties: { reference: { type: 'string' }, candidate: { type: 'string' } }, required: ['reference', 'candidate'], additionalProperties: false }, annotations: reads },
];
const projectTools = new Set(['motion_open_preview', 'motion_get_project', 'motion_read_file', 'motion_write_files', 'motion_import_asset', 'motion_inspect_project', 'motion_request_export', 'motion_get_export', 'motion_verify_export']);
for (const tool of tools) {
  if (projectTools.has(tool.name)) tool.inputSchema = { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, projectId: { type: 'string', description: 'Explicit native project identity. On macOS omitted values use this MCP connection\'s last selected project, never another connection\'s selection.' } } } as typeof tool.inputSchema;
  if (tool.name === 'motion_get_export') tool.inputSchema = { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, jobId: { type: 'string', description: 'Stable export ID; omit for the latest job of the selected project.' } } } as typeof tool.inputSchema;
}
function viewerLinks(origin: string, sessionId: string, projectId?: string, embedded = true) {
  const sessionUrl = origin + sessionPath(sessionId, projectId, { openArtifact: Boolean(projectId) });
  const embeddedPreviewUrl = projectId ? origin + sessionPath(sessionId, projectId, { embedded: true }) : undefined;
  return { sessionUrl, embeddedPreviewUrl, previewUrl: embedded && embeddedPreviewUrl ? embeddedPreviewUrl : sessionUrl };
}
async function designRequest(origin: string, path: string, data: object, store: WorkspaceStore) {
  const response = await fetch(`${origin}/design-api${path}`, { method: 'POST', headers: await editorHeaders(store, origin), body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '会话操作失败');
  return result;
}
export async function callTool(name: string, args: Record<string, unknown> = {}, store = new WorkspaceStore()) {
  if (!tools.some(tool => tool.name === name)) throw new Error('Unknown tool: ' + name);
  if (args.projectId !== undefined) {
    if (typeof args.projectId !== 'string') throw new Error('工程编号无效');
    store = store.forProject(args.projectId);
  }
  if (name === 'design_append_message') {
    if (typeof args.sessionId !== 'string' || typeof args.id !== 'string' || typeof args.content !== 'string') throw new Error('需要 sessionId、id 和 content');
    return store.addSessionMessage(args.sessionId, args.id, args.content, (args.role ?? 'assistant') as 'user' | 'assistant');
  }
  if (name === 'design_get_session') {
    const session = await store.session(typeof args.sessionId === 'string' ? args.sessionId : store.projectCatalog().activeSessionId!);
    return { ...session, modeConfig: creationMode(session.mode), skill: creationMode(session.mode).skill };
  }
  if (name === 'design_create_session') {
    creationMode(args.mode ?? 'motion');
    const opened = await openPreview(store), origin = new URL(opened.previewUrl).origin;
    const result = await designRequest(origin, '/sessions', args, store);
    if (args.createArtifact === false) return { ...result, ...viewerLinks(origin, result.sessionId) };
    if (result.session.artifacts.length) {
      const artifact = result.session.artifacts.find((item: { id: string }) => item.id === result.session.activeArtifactId) ?? result.session.artifacts[0];
      return { ...result, projectId: artifact.projectId, ...viewerLinks(origin, result.sessionId, artifact.projectId, args.embedded !== false) };
    }
    try {
      const current = await store.status();
      const artifact = await designRequest(origin, `/sessions/${result.sessionId}/artifacts`, { expectedRevision: current.revision, expectedProjectId: current.projectId }, store);
      return { ...artifact, session: await store.session(result.sessionId), ...viewerLinks(origin, result.sessionId, artifact.projectId, args.embedded !== false) };
    } catch (error) { return { ...result, artifactError: (error as Error).message, ...viewerLinks(origin, result.sessionId) }; }
  }
  const gateway = gatewayFor(store);
  if (name === 'motion_get_capabilities') return gateway.status(args.refresh === true);
  if (name === 'motion_list_models') return gateway.listModels(args);
  if (name === 'motion_configure_provider') return gateway.configureProvider(args.provider, args);
  if (name === 'motion_set_model_route') return gateway.setRoute(args.modality, args.model);
  if (name === 'motion_register_model') return gateway.registerModel(args);
  if (name === 'motion_generate_asset') {
    await openPreview(store);
    return { job: await gateway.submit({ ...args, projectId: args.projectId ?? store.projectId } as GenerateInput) };
  }
  if (name === 'motion_get_generation') return { job: await gateway.getJob(args.jobId) };
  if (name === 'motion_list_generations') {
    if (args.projectId !== undefined && typeof args.projectId !== 'string') throw new Error('Invalid projectId');
    return { jobs: (await gateway.listJobs(args.projectId as string | undefined)).slice(0, 50) };
  }
  if (name === 'motion_cancel_generation') return { job: await gateway.cancel(args.jobId) };
  if (name === 'motion_get_workflow') {
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !['section', 'workflow'].includes(key))) throw new Error('Workflow arguments must contain only workflow and section.');
    return getWorkflow(args.section, args.workflow);
  }
  if (name === 'motion_open_preview') {
    const opened = await openPreview(store), catalog = store.projectCatalog();
    const session = catalog.sessions!.find(item => item.artifacts.some(artifact => artifact.projectId === store.projectId))!;
    const links = viewerLinks(opened.previewUrl, session.id, store.projectId, args.embedded !== false);
    return { ...opened, ...links, studioUrl: links.previewUrl, serverUrl: opened.previewUrl, sessionId: session.id, projectId: store.projectId };
  }
  if (name === 'motion_list_templates') {
    if ((args.query !== undefined && typeof args.query !== 'string') || (args.category !== undefined && typeof args.category !== 'string')) throw new Error('模板查询参数无效');
    const page = listTemplates(args as Parameters<typeof listTemplates>[0]);
    return { ...page, templates: page.items };
  }
  if (name === 'motion_get_template') {
    if (typeof args.templateId !== 'string') throw new Error('需要 templateId');
    return readTemplate(args.templateId);
  }
  if (name === 'motion_get_project') {
    const current = await store.lock(async () => {
      const projectId = store.projectId;
      const sessionId = store.projectCatalog().sessions!.find(item => item.artifacts.some(artifact => artifact.projectId === projectId))!.id;
      return { ...await store.get(), projectId, conversation: await store.conversation(projectId), session: await store.session(sessionId) };
    });
    return { ...current, engine: 'hyperframes', engineVersion: HYPERFRAMES_VERSION, ...viewerLinks(await previewUrl(store), current.session.id, current.project ? current.projectId : undefined), dataDirectory: store.directory };
  }
  if (name === 'motion_read_file') {
    if (typeof args.path !== 'string') throw new Error('需要 path');
    return store.readFile(args.path);
  }
  if (name === 'motion_inspect_project') {
    if (!(await store.get()).project) throw new Error('请先调用 motion_open_preview 创建工程');
    if (typeof args.view !== 'string' || !['info', 'timeline', 'lint'].includes(args.view)) throw new Error('view 必须为 info、timeline 或 lint');
    return inspectProject(await ensureRuntime(store.directory), store.projectDirectory, args.view);
  }
  if (name === 'motion_get_export') {
    if (args.jobId !== undefined && typeof args.jobId !== 'string') throw new Error('导出任务编号无效');
    const job = (await store.status(args.jobId as string | undefined)).exportJob;
    if (args.jobId && !job) throw new Error('该工程没有此导出任务');
    return { job, ...(job?.state === 'completed' ? { path: path.join(store.directory, job.file!), downloadUrl: `${await previewUrl(store)}/api/exports/${job.id}/file` } : {}) };
  }
  if (name === 'motion_compare_video') {
    if (typeof args.reference !== 'string' || typeof args.candidate !== 'string') throw new Error('需要 reference 和 candidate');
    const reference = args.reference;
    let candidate = args.candidate;
    if (candidate === 'latest-export') {
      const job = (await store.status()).exportJob;
      if (!job || job.state !== 'completed') throw new Error('没有已完成的导出');
      candidate = path.join(store.directory, job.file!);
    } else if (candidate === 'project') throw new Error('请先导出工程，再使用视频路径或 latest-export');
    for (const item of [reference, candidate]) if (!path.isAbsolute(item) || !existsSync(item)) throw new Error('路径必须是存在的绝对路径：' + item);
    return compareVideos(await ensureRuntime(store.directory), store.directory, reference, candidate, path.join(store.directory, 'diffs', 'compare-' + Date.now()));
  }
  if (typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(args.expectedRevision)) throw new Error('需要 motion_get_project 返回的 expectedRevision');
  if (name === 'design_create_artifact') {
    if (typeof args.sessionId !== 'string') throw new Error('需要 sessionId');
    await store.session(args.sessionId);
    const current = await store.status(), opened = await ensureService(store), origin = new URL(opened.previewUrl).origin;
    const result = await designRequest(origin, `/sessions/${args.sessionId}/artifacts`, { ...args, expectedProjectId: current.projectId }, store);
    return { ...result, session: await store.session(args.sessionId), ...viewerLinks(origin, args.sessionId, result.projectId, args.embedded !== false) };
  }
  if (name === 'design_open_artifact') {
    if (typeof args.sessionId !== 'string' || typeof args.artifactId !== 'string') throw new Error('需要 sessionId 和 artifactId');
    const session = await store.session(args.sessionId), artifact = session.artifacts.find(item => item.id === args.artifactId);
    if (!artifact) throw new Error('该产物不属于此会话');
    const current = await store.status();
    if (current.revision !== args.expectedRevision) throw new (await import('./workspace.ts')).Conflict();
    const opened = await ensureService(store), origin = new URL(opened.previewUrl).origin;
    const response = await fetch(`${origin}/motion-api/sessions/${session.id}/open`, { method: 'POST', headers: await editorHeaders(store, origin), body: JSON.stringify({ projectId: artifact.projectId, expectedRevision: args.expectedRevision, expectedProjectId: current.projectId }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '打开产物失败');
    return { ...result, sessionId: session.id, artifactId: artifact.id, ...viewerLinks(origin, session.id, artifact.projectId, args.embedded !== false) };
  }
  if (name === 'motion_verify_export') {
    if (typeof args.jobId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(args.jobId)) throw new Error('请提供已完成导出任务的 jobId 和对应 revision');
    const job = (await store.status(typeof args.jobId === 'string' ? args.jobId : undefined)).exportJob;
    if (!job || job.state !== 'completed' || job.id !== args.jobId || job.revision !== args.expectedRevision) {
      throw new Error('请提供当前已完成导出任务的 jobId 和对应 revision；不能校验等待中、失败或其他版本的任务。');
    }
    if (!job.expected) throw new Error('旧导出任务没有快照规格记录，请重新导出已检查的工程版本后再校验。');
    const expected = { ...job.expected, audio: (args.audio ?? job.expected.audio) as ExportExpectation['audio'] };
    return { jobId: job.id, revision: job.revision, ...await verifyExport(path.join(store.directory, 'exports', job.id + '.mp4'), expected) };
  }
  if (name === 'motion_apply_template') {
    if (typeof args.templateId !== 'string') throw new Error('需要 templateId');
    const template = findTemplate(args.templateId);
    const sessionId = typeof args.sessionId === 'string' ? args.sessionId : store.selectedProjectId === undefined ? store.projectCatalog().activeSessionId! : store.projectCatalog().sessions!.find(session => session.artifacts.some(artifact => artifact.projectId === store.projectId))!.id;
    await store.session(sessionId);
    if ((await store.get()).revision !== args.expectedRevision) throw new (await import('./workspace.ts')).Conflict();
    const opened = await ensureService(store);
    const response = await fetch(`${opened.previewUrl}/motion-api/sessions/${sessionId}/artifacts`, { method: 'POST', headers: await editorHeaders(store, opened.previewUrl), body: JSON.stringify({ expectedRevision: args.expectedRevision, expectedProjectId: store.projectId, templateId: template.id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '打开模板失败');
    store = store.forProject(result.projectId);
    return { ...await store.get(), sessionId, projectId: result.projectId, ...viewerLinks(opened.previewUrl, sessionId, result.projectId, args.embedded !== false), dataDirectory: store.directory };
  }
  if (name === 'motion_write_files') return store.writeFiles(args.expectedRevision, args.files as FileEdit[]);
  if (name === 'motion_import_asset') {
    if (typeof args.sourcePath !== 'string' || typeof args.targetPath !== 'string') throw new Error('需要 sourcePath 和 targetPath');
    return store.importAsset(args.expectedRevision, args.sourcePath, args.targetPath);
  }
  if (name === 'motion_request_export') {
    if ((await store.get()).revision !== args.expectedRevision) throw new (await import('./workspace.ts')).Conflict();
    await ensureService(store);
    return { job: await store.requestExport(args.expectedRevision), message: 'Hyperframes 将在后台渲染；用 motion_get_export 查询真实完成状态。' };
  }
  throw new Error('Unknown tool: ' + name);
}
