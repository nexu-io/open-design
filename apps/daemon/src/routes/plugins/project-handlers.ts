// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// Strangler-fig MOVE of the plugin project/share handlers; do NOT copy.
/** @module routes/plugins/project-handlers
 * Plugin project/share/candidate/trust/stats/export route handlers, relocated
 * out of server.ts's inline pluginRouteHelpers into the routes/plugins domain.
 * Explicit-ctx factory: server.ts-local bindings arrive via ctx; module-level
 * helpers are imported directly. resolvedPort is read live via ctx.resolvedPortRef.
 */

import path from 'node:path';
import type { PluginShareAction } from '../../services/plugin-share-tasks.js';
import { connectorService } from '../../connectors/service.js';
import { getProject, insertConversation, insertProject } from '../../db.js';
import { sendApiError } from '../../http/api-errors.js';
import { isLocalSameOrigin } from '../../origin-validation.js';
import { PLUGIN_SHARE_ACTION_LABELS, USER_PLUGIN_SOURCE_KINDS, copyPluginFolderForProjectContext, githubRepoNameFromPluginName, normalizePluginShareAction, renderPluginSharePrompt } from '../../plugin-share.js';
import { buildConnectorProbe, generateSkillPluginDraft, getInstalledPlugin, installPlugin, listInstalledPlugins, resolvePluginSnapshot } from '../../plugins/index.js';
import { ensureProject, resolveProjectDir } from '../../projects.js';
import { normalizeProjectPluginFolderPath, resolveProjectChildDirectory } from '../../services/plugin-installation.js';
import { execCommandViaLoginShell } from '../../shell/commands.js';
import { PLUGIN_SHARE_ACTION_PLUGIN_IDS } from '@open-design/contracts';

export function createPluginProjectHandlers(ctx: any) {
  const {
    db,
    resolvedPortRef,
    loadPluginRegistryView,
    pluginShareTaskStore,
    OD_BIN,
    OD_NODE_BIN,
    PROJECTS_DIR,
    PLUGIN_REGISTRY_ROOTS,
    randomId,
  } = ctx;
  return {
    handleShareProject: async (req, res) => {
      try {
        const sourcePlugin = getInstalledPlugin(db, req.params.id);
        if (!sourcePlugin) return sendApiError(res, 404, 'NOT_FOUND', 'plugin not found');
        if (!USER_PLUGIN_SOURCE_KINDS.has(sourcePlugin.sourceKind)) return res.status(409).json({ ok: false, code: 'plugin-not-shareable', message: 'Only user-installed plugins can start a share project.' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const action = normalizePluginShareAction(body.action);
        if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'action must be publish-github or contribute-open-design');
        const actionPluginId = PLUGIN_SHARE_ACTION_PLUGIN_IDS[action];
        const actionPlugin = getInstalledPlugin(db, actionPluginId);
        if (!actionPlugin) return res.status(409).json({ ok: false, code: 'share-action-plugin-missing', message: `The bundled action plugin "${actionPluginId}" is not installed. Restart the daemon so bundled plugins are registered.` });
        const now = Date.now(); const id = randomId(); const cid = randomId(); const sourceSlug = githubRepoNameFromPluginName(sourcePlugin.id); const stagedPath = `plugin-source/${sourceSlug}`; const prompt = renderPluginSharePrompt({ action, sourcePlugin, stagedPath }); const metadata = { kind: 'prototype' }; const projectRoot = await ensureProject(PROJECTS_DIR, id, metadata); await copyPluginFolderForProjectContext(sourcePlugin.fsPath, path.join(projectRoot, 'plugin-source', sourceSlug));
        insertProject(db, { id, name: `${PLUGIN_SHARE_ACTION_LABELS[action]}: ${sourcePlugin.title || sourcePlugin.id}`, skillId: null, designSystemId: null, pendingPrompt: prompt, metadata, createdAt: now, updatedAt: now });
        insertConversation(db, { id: cid, projectId: id, title: null, createdAt: now, updatedAt: now });
        const registry = await loadPluginRegistryView(); const connectorProbe = buildConnectorProbe(connectorService); const resolved = resolvePluginSnapshot({ db, body: { pluginId: actionPluginId, pluginInputs: { source_plugin_id: sourcePlugin.id, source_plugin_title: sourcePlugin.title || sourcePlugin.id, source_plugin_version: sourcePlugin.version, source_plugin_path: sourcePlugin.fsPath, plugin_context_path: stagedPath }, locale: typeof body.locale === 'string' ? body.locale : undefined }, projectId: id, conversationId: cid, registry, connectorProbe });
        if (resolved && !resolved.ok) return res.status(resolved.status).json(resolved.body);
        const project = getProject(db, id); if (!project) return sendApiError(res, 500, 'INTERNAL_ERROR', 'created project could not be loaded');
        res.json({ ok: true, project, conversationId: cid, ...(resolved?.ok ? { appliedPluginSnapshotId: resolved.snapshotId } : {}), actionPluginId, sourcePluginId: sourcePlugin.id, stagedPath, prompt, message: `Created a ${PLUGIN_SHARE_ACTION_LABELS[action]} task for ${sourcePlugin.title || sourcePlugin.id}.` });
      } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handlePluginTrust: async (req, res) => {
      try {
        const plugin = getInstalledPlugin(db, req.params.id); if (!plugin) return res.status(404).json({ error: 'plugin not found' });
        const body = req.body && typeof req.body === 'object' ? req.body : {}; const action = body.action === 'revoke' ? 'revoke' : 'grant';
        const { validateCapabilityList, grantCapabilities, revokeCapabilities } = await import('../../plugins/trust.js');
        const { accepted, rejected } = validateCapabilityList(body.capabilities);
        if (rejected.length > 0) return res.status(400).json({ error: { code: 'invalid-capability', message: `Capability validation failed: ${rejected.map((r) => r.capability).join(', ')}`, data: { rejected } } });
        if (accepted.length === 0) return res.status(400).json({ error: { code: 'no-capabilities', message: 'capabilities[] is required and must contain at least one entry' } });
        const next = action === 'revoke' ? revokeCapabilities({ db, pluginId: req.params.id, capabilities: accepted }) : grantCapabilities({ db, pluginId: req.params.id, capabilities: accepted });
        const updated = getInstalledPlugin(db, req.params.id);
        try { const { recordPluginEvent } = await import('../../plugins/events.js'); recordPluginEvent({ kind: 'plugin.trust-changed', pluginId: req.params.id, details: { action, capabilities: accepted, total: next.length } }); } catch {}
        res.status(action === 'grant' ? 201 : 200).json({ ok: true, id: req.params.id, action, capabilitiesGranted: next, plugin: updated });
      } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handlePluginStats: async (res) => {
      try { const { pluginInventoryStats, snapshotInventoryStats } = await import('../../plugins/stats.js'); const installed = listInstalledPlugins(db); const inventoryRows = db.prepare(`SELECT status, project_id, run_id, applied_at FROM applied_plugin_snapshots`).all(); res.json({ plugins: pluginInventoryStats(installed), snapshots: snapshotInventoryStats(inventoryRows), generatedAt: Date.now() }); } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handleAppliedPluginExport: async (req, res) => {
      try { const body = req.body && typeof req.body === 'object' ? req.body : {}; const target = body.target === 'od' || body.target === 'claude-plugin' || body.target === 'agent-skill' ? body.target : null; if (!target) return res.status(400).json({ error: 'target must be one of: od, claude-plugin, agent-skill' }); const outDir = typeof body.outDir === 'string' && body.outDir.length > 0 ? body.outDir : null; if (!outDir) return res.status(400).json({ error: 'outDir is required' }); const { exportPlugin, ExportError } = await import('../../plugins/export.js'); try { const result = await exportPlugin({ db, target, outDir, ...(typeof body.snapshotId === 'string' ? { snapshotId: body.snapshotId } : {}), ...(typeof body.projectId === 'string' ? { projectId: body.projectId } : {}) }); res.json({ ok: true, ...result }); } catch (err) { if (err instanceof ExportError) return res.status(404).json({ error: err.message }); throw err; } } catch (err) { res.status(500).json({ error: String(err) }); }
    },
    handleProjectInstallFolder: async (req, res) => {
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const warnings = []; const log = []; let plugin = null; let message = 'Install finished.'; for await (const ev of installPlugin(db, { source: folder, roots: PLUGIN_REGISTRY_ROOTS })) { if (ev.message) log.push(ev.message); if (Array.isArray(ev.warnings)) warnings.splice(0, warnings.length, ...ev.warnings); if (ev.kind === 'success') { plugin = ev.plugin; message = `Installed ${ev.plugin.title}.`; break; } if (ev.kind === 'error') { message = ev.message; break; } } res.status(plugin ? 200 : 400).json({ ok: Boolean(plugin), plugin, warnings, message, log }); } catch (err) { const code = err && err.code; const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400; sendApiError(res, status, status === 404 ? 'PLUGIN_FOLDER_NOT_FOUND' : 'BAD_REQUEST', String(err?.message || err)); }
    },
    handleProjectPluginCli: async (req, res, action) => {
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const subcommand = action === 'publish-github' ? 'publish-repo' : 'open-design-pr'; const timeout = action === 'publish-github' ? 240_000 : 300_000; const result = await execCommandViaLoginShell(OD_NODE_BIN, [OD_BIN, 'plugin', subcommand, folder, '--json'], { timeout }); const payload = result.stdout ? JSON.parse(result.stdout) : null; if (!result.ok || !payload?.ok) return res.status(500).json({ ok: false, code: payload?.error?.label || (action === 'publish-github' ? 'publish-repo-failed' : 'open-design-pr-failed'), message: payload?.error?.stderr || payload?.error?.stdout || (action === 'publish-github' ? 'GitHub repo publish failed.' : 'Open Design PR creation failed.'), log: payload?.steps?.map((step) => step.stderr || step.stdout || step.command).filter(Boolean) ?? [result.stderr || result.stdout || `${subcommand} failed`] }); res.json({ ok: true, message: action === 'publish-github' ? (payload.repoUrl ? `Published plugin to ${payload.repoUrl}.` : 'Published plugin to GitHub.') : (payload.prUrl ? `Opened Open Design PR flow at ${payload.prUrl}.` : 'Opened Open Design PR flow.'), ...(payload.repoUrl ? { url: payload.repoUrl } : {}), ...(payload.prUrl ? { url: payload.prUrl } : {}), log: payload.steps?.map((step) => step.stderr || step.stdout || step.command).filter(Boolean) ?? [] }); } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err), log: [] }); }
    },
    handleCandidateDraft: async (req, res) => {
      if (!isLocalSameOrigin(req, resolvedPortRef.current)) return res.status(403).json({ error: 'cross-origin request rejected' });
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const result = await generateSkillPluginDraft(db, projectRoot, req.params.id, req.params.candidateId); if (!result) return sendApiError(res, 404, 'NOT_FOUND', 'plugin candidate not found'); res.status(result.ok ? 200 : 422).json(result); } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handleCandidateShareTask: async (req, res) => {
      if (!isLocalSameOrigin(req, resolvedPortRef.current)) return res.status(403).json({ error: 'cross-origin request rejected' });
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const action = body.action === 'publish-github' || body.action === 'contribute-open-design' ? body.action : null; if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'plugin share action is required'); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const draft = await generateSkillPluginDraft(db, projectRoot, req.params.id, req.params.candidateId); if (!draft) return sendApiError(res, 404, 'NOT_FOUND', 'plugin candidate not found'); if (!draft.validation.ok) return res.status(422).json({ ok: false, code: 'plugin-draft-invalid', message: 'Generated plugin draft is invalid.', draft }); const task = pluginShareTaskStore.createAndStart(req.params.id, { action, path: draft.draftPath }, draft.folder); res.status(202).json({ taskId: task.id, action, path: draft.draftPath, status: task.status, startedAt: task.startedAt, draft }); } catch (err) { res.status(400).json({ ok: false, message: String(err?.message || err) }); }
    },
    handleProjectShareTask: async (req, res) => {
      if (!isLocalSameOrigin(req, resolvedPortRef.current)) return res.status(403).json({ error: 'cross-origin request rejected' });
      try { const project = getProject(db, req.params.id); if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const body = req.body && typeof req.body === 'object' ? req.body : {}; const action: PluginShareAction | null = body.action === 'publish-github' || body.action === 'contribute-open-design' ? body.action : null; if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'plugin share action is required'); const relativePath = normalizeProjectPluginFolderPath(body.path); const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata); const folder = await resolveProjectChildDirectory(projectRoot, relativePath); const task = pluginShareTaskStore.createAndStart(req.params.id, { action, path: relativePath }, folder); res.status(202).json({ taskId: task.id, action, path: relativePath, status: task.status, startedAt: task.startedAt }); } catch (err) { const code = err && err.code; const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400; sendApiError(res, status, status === 404 ? 'PLUGIN_FOLDER_NOT_FOUND' : 'BAD_REQUEST', String(err?.message || err)); }
    },
  };
}
