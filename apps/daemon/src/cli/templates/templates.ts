// @ts-nocheck
/** @module cli/templates/templates
 * Implements `od templates` CLI commands (list/save/delete) for project template management.
 * Mirrors the web NewProjectPanel / ExamplesTab; enables headless template snapshot and lifecycle.
 */
import { cliDaemonBaseUrl, parseFlags, positionalArgs, structuredHttpFailure, surfaceFetchError } from '../core/index.js';

// `od templates …` mirrors NewProjectPanel / ExamplesTab. Same surface,
// same /api/templates store. The CLI form is the embeddability contract:
// external agents (hermes-agent, openclaw, ...) can snapshot, list, or
// remove user-saved project templates without going through the web UI.
/** Whitelist of string flags for `od templates` commands. */
const TEMPLATES_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'description',
]);

/** Whitelist of boolean flags for `od templates` commands. */
const TEMPLATES_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);
// `od automation …` mirrors the Automations tab. Same surface, same
// /api/routines store. The CLI form is the embeddability contract:
// external agents (hermes-agent, openclaw, etc.) can drive Open Design
// automations headlessly without going through the web UI.

// `od templates …` is the headless face of NewProjectPanel /
// ExamplesTab — same /api/templates store, same DTO shapes. External
// agents (hermes-agent, openclaw, custom bots) use these to snapshot a
// project as a reusable starting point, list everything the user has
// saved, or drop one that is no longer needed. The web UI and the CLI
// share the daemon HTTP layer so neither can drift out of step.
/**
 * Entry point for `od templates` subcommands (list/save/delete).
 * Routes CRUD operations on project templates via /api/templates.
 * Handles positional argument parsing to support mixed flag/positional ordering.
 */
export async function runTemplates(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od templates list                                  List user-saved templates.
  od templates save  <projectId> --name <name>      Snapshot a project's current
                                                    files as a new template.
                     [--description <text>]
  od templates delete <id>                          Delete a saved template by id.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  let flags;
  try {
    flags = parseFlags(rest, { string: TEMPLATES_STRING_FLAGS, boolean: TEMPLATES_BOOLEAN_FLAGS });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = (await cliDaemonBaseUrl(flags));
  // Extract positional arguments while stepping past `--flag value`
  // pairs for any string-valued template flag. Without this the id has
  // to be the very first token after the sub-verb, so a headless caller
  // that prefixes shared options (`od templates save --daemon-url ...
  // proj-1 --name Cards`) would hit the missing-id usage path before
  // ever reaching the daemon. Mirrors the `positionalArgs` helper in
  // `runAutomation`.
  const positionalArgs = (values) => {
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!value) continue;
      if (value.startsWith('--')) {
        const eq = value.indexOf('=');
        const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
        if (eq < 0 && TEMPLATES_STRING_FLAGS.has(key)) i++;
        continue;
      }
      if (value.startsWith('-')) continue;
      out.push(value);
    }
    return out;
  };
  switch (sub) {
    case 'list': {
      // Wrap every fetch in try/catch so the user sees a clean
      // "failed to reach daemon at <url>: <code>" error from
      // surfaceFetchError when the daemon isn't running. Without
      // this Node throws a raw `TypeError: fetch failed`, which
      // matches the pattern the rest of the CLI uses
      // (runAutomation, the project verbs, runResearch).
      let resp;
      try {
        resp = await fetch(`${base}/api/templates`);
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const templates = Array.isArray(data?.templates) ? data.templates : [];
      if (templates.length === 0) {
        console.log('No templates. Save one with `od templates save <projectId> --name "..."`.');
        return;
      }
      for (const t of templates) console.log(`${t.id}\t${t.name}`);
      return;
    }
    case 'save': {
      // Pull <projectId> from anywhere among the positional args
      // (`positionalArgs` already skipped past `--flag value` pairs)
      // so callers can put shared options before or after the id.
      const projectId = positionalArgs(rest)[0] ?? '';
      if (!projectId) {
        console.error('Usage: od templates save <projectId> --name <name> [--description <text>]');
        process.exit(2);
      }
      const name = typeof flags.name === 'string' ? flags.name.trim() : '';
      if (!name) {
        console.error('--name required');
        process.exit(2);
      }
      const body = { name, sourceProjectId: projectId };
      if (typeof flags.description === 'string' && flags.description.length > 0) {
        body.description = flags.description;
      }
      let resp;
      try {
        resp = await fetch(`${base}/api/templates`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      // Templates POST returns 404 when sourceProjectId is unknown,
      // and 400 for body validation failures (missing name, too-long
      // fields). Both are reachable user errors with the daemon
      // already running, so default-classifying them as
      // `daemon-not-running` would send agents down the wrong recovery
      // branch. Map 404 → project-not-found and 400 → missing-input,
      // keep the default for 5xx so genuine daemon trouble still
      // surfaces as `daemon-not-running`.
      if (!resp.ok) {
        if (resp.status === 404) return structuredHttpFailure(resp, 'project-not-found');
        if (resp.status === 400) return structuredHttpFailure(resp, 'missing-input');
        return structuredHttpFailure(resp);
      }
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const id = data?.template?.id ?? '';
      const savedName = data?.template?.name ?? name;
      console.log(`[templates] saved ${savedName}${id ? ` (${id})` : ''}`);
      return;
    }
    case 'delete': {
      const id = positionalArgs(rest)[0] ?? '';
      if (!id) {
        console.error('Usage: od templates delete <id>');
        process.exit(2);
      }
      let resp;
      try {
        resp = await fetch(`${base}/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      // The daemon route `DELETE /api/templates/:id` is intentionally
      // idempotent (returns `{ ok: true }` for unknown ids), so this
      // CLI verb mirrors that contract instead of inventing a
      // template-not-found exit code the production route never emits.
      // Any unexpected non-2xx still falls through to the generic
      // structured-failure envelope.
      if (!resp.ok) return structuredHttpFailure(resp);
      if (flags.json) {
        const data = await resp.json().catch(() => ({ ok: true }));
        return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      }
      console.log(`[templates] deleted ${id}`);
      return;
    }
    default:
      console.error(`unknown subcommand: od templates ${sub}`);
      process.exit(2);
  }
}
