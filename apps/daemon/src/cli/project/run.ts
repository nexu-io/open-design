// @ts-nocheck
/** @module cli/project/run
 * Implements the od run command dispatcher for agent runs (start, redesign, watch, cancel, list, info, result-package).
 * Collaborators: PROJECT_*_FLAGS, postJsonToDaemon, streamRunEvents from project.ts and core respectively.
 */
import { exitWithStructuredError, parseFlags, readPromptFromFlags, streamRunEvents, structuredHttpFailure } from '../core/index.js';
import { PROJECT_BOOLEAN_FLAGS, PROJECT_STRING_FLAGS, basenameForCli, collectCliPositionals, postImportFolderToDaemon, postJsonToDaemon, projectDaemonUrl, resolveFolderPathForCli } from './project.js';

/**
 * @internal
 * Reads a run message from `--message`, `--prompt`/`--prompt-file`, or the `fallback` argument.
 * Returns `null` when none is provided; a message is optional when a skill id is specified instead.
 */
async function readRunMessageFromFlags(flags, fallback = null) {
  if (typeof flags.message === 'string' && flags.message.length > 0) {
    return flags.message;
  }
  const prompt = await readPromptFromFlags(flags);
  if (typeof prompt === 'string' && prompt.length > 0) return prompt;
  return fallback;
}

/**
 * Main dispatcher for `od run` subcommands (start, redesign, watch, cancel, list, info, result-package).
 * `redesign` auto-imports a folder when no `--project` is given; `start` requires `--project`.
 */
export async function runRun(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od run start --project <projectId> [--conversation <id>] [--message "<text>"]
               [--plugin <id>] [--inputs <json>] [--grant-caps a,b]
               [--agent claude|codex|opencode] [--model <id>] [--follow] [--json]
  od run redesign [--path <folder>] [--message "<text>" | --prompt-file <path|->]
               [--agent claude] [--model <id>] [--follow] [--json]
  od run watch  <runId>                     ND-JSON event stream on stdout.
  od run cancel <runId>                     Request cancellation.
  od run list   [--project <id>]            List recent runs.
  od run info   <runId>                     One run's status.
  od run result-package <runId> [--json]    Inspect run outputs and workspace
                                            provenance without applying them.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const url = flags.project
        ? `${base}/api/runs?projectId=${encodeURIComponent(flags.project)}`
        : `${base}/api/runs`;
      const resp = await fetch(url);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const runs = data?.runs ?? [];
      for (const r of runs) {
        console.log(`${r.id}\t${r.status}\tproject=${r.projectId ?? '-'}\tplugin=${r.pluginId ?? '-'}`);
      }
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run info <runId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp, 'run-not-found');
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    case 'result-package': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run result-package <runId> [--json]');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}/result-package`);
      if (!resp.ok) return structuredHttpFailure(resp, 'run-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const run = data?.run ?? {};
      const workspace = data?.workspace ?? {};
      const storage = workspace.storage ?? {};
      const provenance = workspace.provenance ?? null;
      console.log(`run\t${run.id ?? id}\t${run.status ?? '-'}`);
      console.log(`workspace\t${storage.kind ?? '-'}\t${storage.baseDir ?? '-'}`);
      console.log(`provenance\t${provenance?.kind ?? '-'}\twriteback=${provenance?.writeback ?? '-'}`);
      console.log(`project\t${data?.project?.id ?? '-'}\tfiles=${data?.project?.fileCount ?? 0}`);
      const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : [];
      for (const artifact of artifacts) {
        console.log(`artifact\t${artifact.file ?? '-'}\t${artifact.kind ?? '-'}\t${artifact.title ?? '-'}`);
      }
      return;
    }
    case 'cancel': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run cancel <runId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      if (!resp.ok) return structuredHttpFailure(resp, 'run-not-found');
      console.log(`[run] cancelled ${id}`);
      return;
    }
    case 'watch': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od run watch <runId>');
        process.exit(2);
      }
      await streamRunEvents(base, id);
      return;
    }
    case 'redesign': {
      const parts = collectCliPositionals(rest, PROJECT_STRING_FLAGS);
      const promptFromArgs = parts.join(' ').trim();
      const defaultMessage =
        'Use the redesign-existing-projects skill. Audit the current UI first, then redesign it to premium quality without breaking functionality. Preserve the existing product structure, routes, and behavior.';
      const message = await readRunMessageFromFlags(
        flags,
        promptFromArgs || defaultMessage,
      );
      const skillId = flags.skill ?? 'redesign-existing-projects';
      const designSystemId = flags['design-system'] ?? 'default';
      let projectId = flags.project;
      let conversationId = flags.conversation;
      let imported = null;

      if (!projectId) {
        const folderPath = await resolveFolderPathForCli(flags.path ?? flags.dir);
        imported = await postImportFolderToDaemon(base, {
          baseDir:        folderPath,
          name:           typeof flags.name === 'string' && flags.name.length > 0
            ? flags.name
            : await basenameForCli(folderPath),
          skillId,
          designSystemId,
        }, folderPath);
        projectId = imported.project?.id;
        conversationId = conversationId ?? imported.conversationId;
        if (!projectId) {
          console.error('POST /api/import/folder did not return project.id');
          process.exit(1);
        }
        if (!flags.json || flags.follow) {
          console.log(`[project] imported ${projectId} from ${folderPath} (conversation ${conversationId ?? '-'})`);
        }
      }

      const body = {
        projectId,
        ...(conversationId ? { conversationId } : {}),
        ...(message ? { message } : {}),
        skillId,
        designSystemId,
        ...(flags.agent ? { agentId: flags.agent } : {}),
        ...(flags.model ? { model: flags.model } : {}),
      };
      const data = await postJsonToDaemon(base, '/api/runs', body);
      if (flags.json && !flags.follow) {
        return process.stdout.write(JSON.stringify({
          ...data,
          project: imported?.project ?? null,
          conversationId: conversationId ?? null,
        }, null, 2) + '\n');
      }
      console.log(`[run] started ${data.runId}`);
      if (flags.follow) await streamRunEvents(base, data.runId);
      return;
    }
    case 'start': {
      if (!flags.project) {
        console.error('--project <projectId> is required');
        process.exit(2);
      }
      const body = { projectId: flags.project };
      if (flags.conversation) body.conversationId = flags.conversation;
      const message = await readRunMessageFromFlags(flags);
      if (message) body.message = message;
      if (flags.plugin) body.pluginId = flags.plugin;
      if (flags.skill) body.skillId = flags.skill;
      if (flags['design-system']) body.designSystemId = flags['design-system'];
      if (flags.agent) body.agentId = flags.agent;
      if (flags.model) body.model = flags.model;
      if (flags.inputs) {
        try { body.pluginInputs = JSON.parse(flags.inputs); } catch (err) {
          console.error(`--inputs must be valid JSON: ${err.message}`);
          process.exit(2);
        }
      }
      if (flags['grant-caps']) {
        body.grantCaps = String(flags['grant-caps']).split(',').map((c) => c.trim()).filter(Boolean);
      }
      if (flags['snapshot-id']) body.appliedPluginSnapshotId = flags['snapshot-id'];
      const resp = await fetch(`${base}/api/runs`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409 && data?.error?.code === 'capabilities-required') {
          return exitWithStructuredError({
            code:    'capabilities-required',
            message: data.error.message,
            data:    data.error.data,
          });
        }
        if (resp.status === 422 && data?.error?.code === 'missing-input') {
          return exitWithStructuredError({
            code:    'missing-input',
            message: data.error.message,
            data:    data.error.data,
          });
        }
        console.error(`POST /api/runs failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json && !flags.follow) {
        return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      }
      console.log(`[run] started ${data.runId}`);
      if (flags.follow) await streamRunEvents(base, data.runId);
      return;
    }
    default:
      console.error(`unknown subcommand: od run ${sub}`);
      process.exit(2);
  }
}
