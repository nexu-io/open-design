// @ts-nocheck
/**
 * @module cli/plugin/dev
 */
import { libraryDaemonUrl, parseFlags } from '../core/index.js';
import { execFileBuffered } from './github.js';
import { pluginDaemonUrl } from './manage.js';
import { basename } from 'node:path';

// Phase 4 / spec §14.1 — `od plugin scaffold` interactive starter.
//
// Side-effect: writes a SKILL.md + open-design.json starter under
// `<targetDir>/<id>/`. Default targetDir is process.cwd() so a code
// agent can drop the scaffold into the current repo root.
export async function runPluginScaffold(rest) {
  const flags = parseFlags(rest, {
    string: new Set([
      'id', 'title', 'description', 'task-kind', 'mode', 'scenario', 'out',
    ]),
    boolean: new Set(['help', 'h', 'json', 'with-claude-plugin']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin scaffold --id <id> [--title "<title>"] [--description "<text>"]
                     [--task-kind new-generation|code-migration|figma-migration|tune-collab]
                     [--mode <mode>] [--scenario <scenario>]
                     [--out <dir>] [--with-claude-plugin]

Writes <out|cwd>/<id>/{SKILL.md,open-design.json,README.md}.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const id = typeof flags.id === 'string' && flags.id.length > 0
    ? flags.id
    : rest.find((a) => !a.startsWith('-'));
  if (!id) {
    console.error('Usage: od plugin scaffold --id <id>');
    process.exit(2);
  }
  const targetDir = typeof flags.out === 'string' && flags.out.length > 0
    ? flags.out
    : process.cwd();
  const { scaffoldPlugin, ScaffoldError } = await import('./plugins/scaffold.js');
  try {
    const input = {
      targetDir,
      id,
      ...(flags.title       ? { title: flags.title }             : {}),
      ...(flags.description ? { description: flags.description } : {}),
      ...(flags['task-kind']
        ? { taskKind: flags['task-kind'] }
        : {}),
      ...(flags.mode        ? { mode: flags.mode }               : {}),
      ...(flags.scenario    ? { scenario: flags.scenario }       : {}),
      withClaudePlugin: Boolean(flags['with-claude-plugin']),
    };
    const result = await scaffoldPlugin(input);
    if (flags.json) return process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    console.log(`[scaffold] ${result.folder}`);
    for (const file of result.files) console.log(`  ${file}`);
    console.log(`\nNext: od plugin install ${result.folder}`);
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`[scaffold] ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
}

// Phase 4 / spec §11.5 / plan §3.W1 — `od plugin validate <folder>`.
//
// Pre-install lint pass against an author's working dir. Optionally
// fetches the daemon's registry view so skill / DS / atom refs in
// the manifest can be checked too; falls back to an empty registry
// when --no-daemon is set or the daemon is unreachable.
export async function runPluginValidate(rest) {
  const flags = parseFlags(rest, {
    string:  new Set(['daemon-url']),
    boolean: new Set(['help', 'h', 'json', 'no-daemon']),
  });
  if (flags.help || flags.h || rest.length === 0 || rest[0]?.startsWith('-')) {
    console.log(`Usage:
  od plugin validate <folder> [--json] [--no-daemon] [--daemon-url <url>]

Runs the plugin doctor against an unfinished plugin folder before
install. Validates manifest shape, atom ids, until expressions, and
context refs against the live daemon registry (skip with --no-daemon).

Exit codes:
  0  doctor.ok = true
  4  doctor.ok = false (errors present)
  2  CLI usage error / folder unreadable`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const folder = rest[0];

  // Try to load the daemon's registry view; the validator works
  // offline too — emits warnings instead of errors for refs we
  // can't resolve.
  let registry;
  if (!flags['no-daemon']) {
    const base = (await libraryDaemonUrl(flags)).replace(/\/$/, '');
    try {
      const [skillsResp, dsResp, atomsResp] = await Promise.all([
        fetch(`${base}/api/skills`).catch(() => null),
        fetch(`${base}/api/design-systems`).catch(() => null),
        fetch(`${base}/api/atoms`).catch(() => null),
      ]);
      const skills = (skillsResp?.ok ? (await skillsResp.json())?.skills : []) ?? [];
      const designSystems = (dsResp?.ok ? (await dsResp.json())?.designSystems : []) ?? [];
      const atoms = (atomsResp?.ok ? (await atomsResp.json())?.atoms : []) ?? [];
      registry = {
        skills:        skills.map((s) => ({ id: s.id, title: s.name ?? s.title, description: s.description })),
        designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
        craft:         [],
        atoms:         atoms.map((a) => ({ id: a.id, label: a.label })),
      };
    } catch {
      registry = undefined;
    }
  }

  let result;
  try {
    const { validatePluginFolder, flattenValidationDiagnostics } = await import('./plugins/validate.js');
    result = await validatePluginFolder({ folder, ...(registry ? { registry } : {}) });
    if (flags.json) {
      const flat = flattenValidationDiagnostics(result);
      process.stdout.write(JSON.stringify({
        ok:      result.ok,
        folder:  result.folder,
        ...(result.doctor ? { freshDigest: result.doctor.freshDigest, pluginId: result.doctor.pluginId } : {}),
        diagnostics: flat,
      }, null, 2) + '\n');
    } else {
      console.log(`[validate] folder: ${result.folder}`);
      if (result.doctor) {
        console.log(`[validate] pluginId: ${result.doctor.pluginId}`);
        console.log(`[validate] freshDigest: ${result.doctor.freshDigest.slice(0, 12)}\u2026`);
      }
      const diagnostics = (await import('./plugins/validate.js')).flattenValidationDiagnostics(result);
      const errors = diagnostics.filter((d) => d.severity === 'error');
      const warnings = diagnostics.filter((d) => d.severity === 'warning');
      const infos = diagnostics.filter((d) => d.severity === 'info');
      for (const d of errors)   console.error(`  [error]   ${d.code}: ${d.message}`);
      for (const d of warnings) console.warn (`  [warning] ${d.code}: ${d.message}`);
      for (const d of infos)    console.log  (`  [info]    ${d.code}: ${d.message}`);
      if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
        console.log('[validate] no issues');
      }
      console.log(`[validate] ok=${result.ok}`);
    }
  } catch (err) {
    console.error(`[validate] failed: ${err?.message ?? err}`);
    process.exit(2);
  }
  process.exit(result.ok ? 0 : 4);
}

// Phase 4 / spec §14 / plan §3.X1 — `od plugin pack <folder>`.
//
// Produces a gzip-compressed tar archive ready to install via the
// installer's HTTPS-tarball path. The output path is folder-base +
// version when the manifest exposes a version, otherwise folder-base.
export async function runPluginPack(rest) {
  const flags = parseFlags(rest, {
    string:  new Set(['out']),
    boolean: new Set(['help', 'h', 'json']),
  });
  if (flags.help || flags.h || rest.length === 0 || rest[0]?.startsWith('-')) {
    console.log(`Usage:
  od plugin pack <folder> [--out <path>] [--json]

Builds a gzip-compressed tar archive of <folder> at --out (default
'<folder>/../<basename>-<manifest.version>.tgz'). The archive is the
exact shape \`od plugin install --source <https://...>\` consumes.

Skipped when packing:
  node_modules / .git / .next / dist / build / out / coverage /
  .turbo / .cache / .pnpm-store / .parcel-cache / .svelte-kit /
  .nuxt / .astro / .vercel / .vscode / .DS_Store / Thumbs.db
  (matches the installer's tarball-extract skiplist).
Symlinks are rejected at pack time (consistent with extract-time
rejection at install).

Exit codes:
  0  archive written
  2  CLI usage error
  4  pack-time error (missing open-design.json, invalid JSON, etc)`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const folder = rest[0];
  try {
    const { packPlugin, PackPluginError } = await import('./plugins/pack.js');
    let result;
    try {
      result = await packPlugin({
        folder,
        ...(typeof flags.out === 'string' ? { out: flags.out } : {}),
      });
    } catch (err) {
      if (err instanceof PackPluginError) {
        if (flags.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: err.message }, null, 2) + '\n');
        } else {
          console.error(`[pack] ${err.message}`);
        }
        process.exit(4);
      }
      throw err;
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({
        ok:            true,
        outPath:       result.outPath,
        bytes:         result.bytes,
        fileCount:     result.files.length,
        pluginId:      result.pluginId,
        pluginVersion: result.pluginVersion,
      }, null, 2) + '\n');
    } else {
      const idStr = result.pluginVersion
        ? `${result.pluginId ?? 'plugin'}@${result.pluginVersion}`
        : result.pluginId ?? 'plugin';
      console.log(`[pack] packed ${idStr}`);
      console.log(`[pack] out:    ${result.outPath}`);
      console.log(`[pack] files:  ${result.files.length}`);
      console.log(`[pack] bytes:  ${result.bytes}`);
      console.log(`\nNext: od plugin install --source ${result.outPath}`);
    }
  } catch (err) {
    console.error(`[pack] failed: ${err?.message ?? err}`);
    process.exit(2);
  }
}

// Phase 4 / spec §14 — `od plugin export <projectId> --as <target>`.
//
// Produces a publish-ready folder from the AppliedPluginSnapshot
// behind a given project (or directly from a snapshot id). Three
// targets: 'od', 'claude-plugin', 'agent-skill'.
export async function runPluginExport(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['daemon-url', 'as', 'out', 'snapshot-id', 'project']),
    boolean: new Set(['help', 'h', 'json']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin export <projectId> --as od|claude-plugin|agent-skill --out <dir>
  od plugin export --snapshot-id <id> --as od|claude-plugin|agent-skill --out <dir>

The export resolves through the daemon HTTP \`POST /api/applied-plugins/export\`
endpoint so the running daemon's installed_plugins / applied_plugin_snapshots
view is the single source of truth.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const positional = rest.find((a) => !a.startsWith('-'));
  const projectId = flags.project ?? positional ?? null;
  const snapshotId = typeof flags['snapshot-id'] === 'string' ? flags['snapshot-id'] : null;
  if (!projectId && !snapshotId) {
    console.error('Usage: od plugin export <projectId> --as <target> --out <dir>');
    process.exit(2);
  }
  const target = String(flags.as ?? 'od');
  if (target !== 'od' && target !== 'claude-plugin' && target !== 'agent-skill') {
    console.error(`--as must be one of: od, claude-plugin, agent-skill (got "${target}")`);
    process.exit(2);
  }
  const out = typeof flags.out === 'string' && flags.out.length > 0
    ? flags.out
    : process.cwd();
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  const resp = await fetch(`${base}/api/applied-plugins/export`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({
      ...(snapshotId ? { snapshotId } : { projectId }),
      target,
      outDir: out,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`POST /api/applied-plugins/export failed: ${resp.status} ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  console.log(`[export] ${data.folder} (snapshot ${data.snapshotId})`);
  for (const f of data.files ?? []) console.log(`  ${f}`);
}

export async function pluginCliValidateFolder(folder) {
  const result = await execFileBuffered(process.execPath, [process.argv[1], 'plugin', 'validate', folder], {
    timeout: 120_000,
  });
  if (!result.ok) {
    console.error('[plugin validate] failed after manifest normalization');
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
  return result;
}
