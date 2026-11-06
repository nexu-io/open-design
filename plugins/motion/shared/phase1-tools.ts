const id = { type: 'string', minLength: 1, maxLength: 100 };
const projectId = { type: 'string', pattern: '^(project|[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})$' };
const revision = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const text = { type: 'string', minLength: 1, maxLength: 8000 };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const review = object({ objectId: id, versionId: id, range: object({ start: { type: 'number', minimum: 0 }, end: { type: 'number', minimum: 0 } }, ['start', 'end']),
  conclusion: { enum: ['passed', 'failed', 'pending', 'unable_to_view'] }, evidence: text, source: { enum: ['agent', 'user'] } }, ['objectId', 'versionId', 'conclusion', 'evidence', 'source']);
const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const phase1Tools = [
  { name: 'motion_create_project', description: 'Create an independent editable native Motion project from a prompt, an editable template ID or reference-video ID. The host Agent authors the film; creation does not generate a finished video. Persist requirements and source, return project/session IDs and the initial content version. A requestId is required for safe retries.',
    inputSchema: object({ requestId: id, projectType: { enum: ['natural_language', 'template', 'reference_video'] }, title: { type: 'string', minLength: 1, maxLength: 100 }, requirements: text,
      sessionId: projectId, templateId: id, referenceVideoId: id, referenceUrl: { type: 'string', maxLength: 2000 } }, ['requestId', 'projectType', 'title', 'requirements']), annotations: write },
  { name: 'motion_open_preview', description: 'Open the named project in the shared editable Studio. Without projectId use only an explicitly bound OpenMotion session, never the global most-recent project. Returns the actual URL and checks; the host must open it. action=record_review records evidence about a previously viewed frozen version without changing source.',
    inputSchema: object({ action: { enum: ['open', 'record_review'] }, projectId, sessionId: projectId, embedded: { type: 'boolean' }, requestId: id, review }, []), annotations: write },
  { name: 'motion_import_assets', description: 'Persist a batch of real local attachments into this project, probe actual media, and return per-item asset IDs, types, sizes, paths and errors. Successful items survive other failures. Existing history is not overwritten. Import does not place media on the timeline. Reuse the same requestId/itemId to retry without duplicate assets.',
    inputSchema: object({ projectId, requestId: id, items: { type: 'array', minItems: 1, maxItems: 100, items: object({ itemId: id, sourcePath: { type: 'string', minLength: 1, maxLength: 4096 }, name: { type: 'string', maxLength: 200 } }, ['itemId', 'sourcePath']) } }, ['projectId', 'requestId', 'items']), annotations: write },
  { name: 'motion_get_project', description: 'Without projectId list projects in the current workspace, newest creation first, exactly five per page (except the last); use nextCursor. With projectId read that project, current revision/version, requirements, native file inventory, asset references and associated export state. file supports bounded UTF-8 reads; exportJobId reads a historical task. This does not switch Studio or create projects.',
    inputSchema: object({ projectId, sessionId: projectId, cursor: { type: 'string', maxLength: 2000 }, file: object({ path: { type: 'string', minLength: 1, maxLength: 240 }, offset: { type: 'integer', minimum: 0 }, length: { type: 'integer', minimum: 1, maximum: 2097152 } }, ['path']), expectedRevision: revision, exportJobId: id }, []), annotations: read },
  { name: 'motion_edit_project', description: 'Save the host Agent\'s native text-file batch and associated requirements into the explicitly named project. Check both expectedRevision and expectedVersionId, commit all files or none, protect GUI writes, record one complete content version and let Studio refresh. The service does not generate code. Read project/version again after conflicts.',
    inputSchema: object({ projectId, requestId: id, expectedRevision: revision, expectedVersionId: id, requirements: text, summary: { type: 'string', maxLength: 300 },
      files: { type: 'array', maxItems: 100, items: object({ path: { type: 'string', minLength: 1, maxLength: 240 }, content: { type: 'string' } }, ['path', 'content']) } }, ['projectId', 'requestId', 'expectedRevision', 'expectedVersionId', 'files']), annotations: write },
  { name: 'motion_export_request', description: 'Queue a background MP4 of the explicit project version and immutable source/media snapshot. Automatically lint and fully technically verify the result. Return jobId; read progress/results with motion_get_project exportJobId. Repeated requestId returns the original task. action=record_review only records actual playback/visual/audio evidence for an existing job; it never starts another render.',
    inputSchema: object({ action: { enum: ['request', 'record_review'] }, projectId, requestId: id, expectedRevision: revision, versionId: id, jobId: id,
      audio: { enum: ['required', 'silent', 'optional'] }, review }, ['projectId', 'requestId']), annotations: write },
  { name: 'motion_list_versions', description: 'List consistent project content snapshots, not individual file save counts. Return current-version identity and five snapshots per page with a cursor for older pages, including stable IDs, vN labels, source, summary and restorability. Five is a page size, not a retention limit.',
    inputSchema: object({ projectId, cursor: { type: 'string', maxLength: 2000 } }, ['projectId']), annotations: read },
  { name: 'motion_restore_version', description: 'Restore the explicitly selected project snapshot as a NEW version. Restoring v3 while current is v5 produces v6 with v3 content; v4 and v5 remain. Check current version/revision, restore native source, styles, timing and retained media together, and reject missing historical resources without changing the current project.',
    inputSchema: object({ projectId, requestId: id, versionId: id, expectedRevision: revision, expectedVersionId: id }, ['projectId', 'requestId', 'versionId', 'expectedRevision', 'expectedVersionId']), annotations: write },
  { name: 'motion_export_cancel', description: 'Cancel the specified export owned by this project. Distinguish cancellation accepted/cancelling from a confirmed cancelled terminal state. A completed task stays completed. Cancellation does not restore source, delete older results or promise a refund. Stopping a host conversation does not automatically call this tool.',
    inputSchema: object({ projectId, requestId: id, jobId: id }, ['projectId', 'requestId', 'jobId']), annotations: write },
];

export function validateInput(schema: any, value: any, field = 'arguments'): void {
  if (schema.enum && !schema.enum.includes(value)) throw new Error('INVALID_ARGUMENT: ' + field);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ARGUMENT: ' + field + ' must be an object');
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) throw new Error('INVALID_ARGUMENT: ' + field + '.' + key + ' is required');
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error('INVALID_ARGUMENT: unknown ' + field + '.' + key);
      validateInput(schema.properties[key], child, field + '.' + key);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) throw new Error('INVALID_ARGUMENT: ' + field);
    value.forEach((item, i) => validateInput(schema.items, item, field + '[' + i + ']'));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error('INVALID_ARGUMENT: ' + field);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error('INVALID_ARGUMENT: ' + field);
  else if (['number', 'integer'].includes(schema.type) && (typeof value !== 'number' || !Number.isFinite(value) || schema.type === 'integer' && !Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw new Error('INVALID_ARGUMENT: ' + field);
}
