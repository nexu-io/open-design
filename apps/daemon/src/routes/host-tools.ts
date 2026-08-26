// Hand-off surface — paseo-style "open project in <local app>".
//
// The daemon owns the editor catalogue, probes each entry's CLI shim on
// $PATH at request time, and on POST spawns the chosen app with the
// project's resolvedDir as its single argument. This is the same shape
// paseo uses (see getpaseo/paseo packages/server/src/server/editor-
// targets.ts) — declarative catalogue + `which` probe + detached spawn.
//
// Why not `shell.openPath`? The desktop bridge can already open the OS
// file manager at a project's resolvedDir, but it cannot pick a specific
// editor — `shell.openPath` is whatever the OS associates with the path.
// For "open in Cursor specifically" we have to invoke a CLI shim
// directly, which means the daemon (not the renderer) is the layer with
// access to spawn + $PATH probing.

import { spawn } from 'node:child_process';
import { access, constants as fsConstants } from 'node:fs/promises';
import path from 'node:path';
import { createCommandInvocation } from '@open-design/platform';
import type { Express } from 'express';
import type {
  HostEditor,
  HostEditorId,
  HostEditorsResponse,
  OpenProjectInEditorResponse,
} from '@open-design/contracts';
import type { RouteDeps } from '../server-context.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';

export interface RegisterHostToolsRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'projectFiles'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export type RealPlatform = 'darwin' | 'win32' | 'linux';
export type Platform = RealPlatform | 'unknown';

export interface CatalogueEntry {
  id: HostEditorId;
  label: string;
  icon: string;
  // CLI shim name to probe on $PATH. Mutually exclusive with `macOpenBundle`.
  command?: string;
  commandArgs?: (resolvedDir: string) => string[];
  // macOS-only fallback: when the CLI shim is missing, look for an app
  // bundle by name and launch it via `open -a "<name>"`. Lets us list
  // Xcode / Qoder / Antigravity / Warp / IntelliJ without forcing users
  // to also install their CLI shim.
  macOpenBundle?: string | readonly string[];
  macOpenArgs?: (bundleName: string, resolvedDir: string) => string[];
  platforms?: RealPlatform[];
  excludedPlatforms?: RealPlatform[];
}

const MAC_OPEN_COMMAND = '/usr/bin/open';

// The catalogue covers the apps shown in the user's reference screenshot
// (image 4): Qoder, Cursor, Zed, Windsurf, Antigravity, Finder, Terminal,
// Warp, Xcode, IntelliJ IDEA — plus a few cross-platform staples.
export const CATALOGUE: ReadonlyArray<CatalogueEntry> = [
  { id: 'cursor', label: 'Cursor', icon: 'sparkles', command: 'cursor', macOpenBundle: 'Cursor' },
  { id: 'vscode', label: 'VS Code', icon: 'file-code', command: 'code', macOpenBundle: 'Visual Studio Code' },
  { id: 'windsurf', label: 'Windsurf', icon: 'sparkles', command: 'windsurf', macOpenBundle: 'Windsurf' },
  { id: 'zed', label: 'Zed', icon: 'edit', command: 'zed', macOpenBundle: 'Zed' },
  { id: 'qoder', label: 'Qoder', icon: 'sparkles', command: 'qoder', macOpenBundle: ['Qoder', 'QoderWork'] },
  { id: 'antigravity', label: 'Antigravity', icon: 'orbit', command: 'antigravity', macOpenBundle: ['Antigravity', 'Google Antigravity'] },
  { id: 'webstorm', label: 'WebStorm', icon: 'edit', command: 'webstorm', macOpenBundle: 'WebStorm' },
  { id: 'idea', label: 'IntelliJ IDEA', icon: 'edit', command: 'idea', macOpenBundle: 'IntelliJ IDEA' },
  { id: 'xcode', label: 'Xcode', icon: 'file-code', macOpenBundle: ['Xcode', 'Xcode-beta', 'Xcode Beta'], platforms: ['darwin'] },
  { id: 'finder', label: 'Finder', icon: 'folder', command: MAC_OPEN_COMMAND, commandArgs: (resolvedDir) => ['-R', resolvedDir], platforms: ['darwin'] },
  { id: 'explorer', label: 'Explorer', icon: 'folder', command: 'explorer', platforms: ['win32'] },
  { id: 'file-manager', label: 'File Manager', icon: 'folder', command: 'xdg-open', platforms: ['linux'] },
  { id: 'terminal', label: 'Terminal', icon: 'sliders', macOpenBundle: 'Terminal', platforms: ['darwin'] },
  // darwin-only: Warp cold-starts ignore the cwd argument on win32/linux, so
  // the "open in Warp" UX is broken on those platforms. Revisit if/when
  // warpdotdev/Warp#6357 ships cross-platform cwd support. (#4544)
  { id: 'warp', label: 'Warp', icon: 'sliders', macOpenBundle: 'Warp', platforms: ['darwin'] },
];

function currentPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'win32';
    case 'linux':
      return 'linux';
    default:
      return 'unknown';
  }
}

function pathDirs(): string[] {
  const raw = process.env.PATH ?? '';
  const sep = process.platform === 'win32' ? ';' : ':';
  // macOS GUI apps inherit a very thin PATH (no /usr/local/bin, no
  // /opt/homebrew/bin), so add the common locations the user's shell
  // would have on first login. Without this, Cursor / Zed / VS Code
  // shims installed via "Install '...' command" are invisible to the
  // daemon launched by `open Open Design.app`.
  const extras = process.platform === 'darwin'
    ? ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin', `${process.env.HOME ?? ''}/.local/bin`]
    : process.platform === 'linux'
      ? ['/usr/local/bin', '/usr/bin', '/bin', `${process.env.HOME ?? ''}/.local/bin`]
      : [];
  return [...raw.split(sep), ...extras].filter(Boolean);
}

async function probeCommandOnPath(command: string): Promise<string | null> {
  if (command.includes('/')) {
    try {
      await access(command, fsConstants.X_OK);
      return command;
    } catch {
      return null;
    }
  }
  const dirs = pathDirs();
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const candidate = `${dir}/${command}${suffix}`;
      try {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

async function resolveMacOpenCommand(): Promise<string> {
  try {
    await access(MAC_OPEN_COMMAND, fsConstants.X_OK);
    return MAC_OPEN_COMMAND;
  } catch {
    return await probeCommandOnPath('open') ?? MAC_OPEN_COMMAND;
  }
}

async function probeMacBundle(name: string | readonly string[]): Promise<{ name: string; path: string } | null> {
  if (process.platform !== 'darwin') return null;
  const names = Array.isArray(name) ? name : [name];
  const candidates = [
    (bundleName: string) => `/Applications/${bundleName}.app`,
    (bundleName: string) => `${process.env.HOME ?? ''}/Applications/${bundleName}.app`,
    (bundleName: string) => `/System/Applications/${bundleName}.app`,
    (bundleName: string) => `/System/Applications/Utilities/${bundleName}.app`,
    (bundleName: string) => `/System/Library/CoreServices/${bundleName}.app`,
  ];
  for (const bundleName of names) {
    for (const candidate of candidates) {
      const path = candidate(bundleName);
      try {
        await access(path, fsConstants.R_OK);
        return { name: bundleName, path };
      } catch {
        // not here
      }
    }
  }
  return null;
}

export interface ResolveEntryDeps {
  platform: Platform;
  probeCommandOnPath: typeof probeCommandOnPath;
  probeMacBundle: typeof probeMacBundle;
  resolveMacOpenCommand: typeof resolveMacOpenCommand;
}

function defaultResolveEntryDeps(): ResolveEntryDeps {
  return {
    platform: currentPlatform(),
    probeCommandOnPath,
    probeMacBundle,
    resolveMacOpenCommand,
  };
}

async function resolveEntry(
  entry: CatalogueEntry,
  deps: ResolveEntryDeps = defaultResolveEntryDeps(),
): Promise<{
  available: boolean;
  resolvedPath?: string;
  launch?: { command: string; argsForDir: (resolvedDir: string) => string[] };
}> {
  // On macOS, prefer macOpenBundle over CLI for entries that have both.
  // This avoids launching agent-only CLI wrappers (e.g. Cursor's `cursor`)
  // that exit 1 immediately instead of opening the editor (#6610).
  if (entry.macOpenBundle && deps.platform === 'darwin') {
    const bundle = await deps.probeMacBundle(entry.macOpenBundle);
    if (bundle) {
      return {
        available: true,
        resolvedPath: bundle.path,
        launch: {
          command: await deps.resolveMacOpenCommand(),
          argsForDir: entry.macOpenArgs
            ? ((resolvedDir) => entry.macOpenArgs?.(bundle.name, resolvedDir) ?? ['-a', bundle.name, resolvedDir])
            : ((resolvedDir) => ['-a', bundle.name, resolvedDir]),
        },
      };
    }
  }
  if (entry.command) {
    const resolved = await deps.probeCommandOnPath(entry.command);
    if (resolved) {
      return {
        available: true,
        resolvedPath: resolved,
        launch: { command: resolved, argsForDir: entry.commandArgs ?? ((resolvedDir) => [resolvedDir]) },
      };
    }
  }
  return { available: false };
}

export interface HostToolLaunchPlan {
  available: boolean;
  resolvedPath?: string;
  command?: string;
  args?: string[];
}

export async function resolveHostToolLaunchPlan(
  editorId: HostEditorId,
  resolvedDir: string,
  deps?: ResolveEntryDeps,
): Promise<HostToolLaunchPlan> {
  const entry = CATALOGUE.find((c) => c.id === editorId);
  if (!entry) return { available: false };
  const probe = await resolveEntry(entry, deps);
  if (!probe.available || !probe.launch) {
    return {
      available: false,
      ...(probe.resolvedPath ? { resolvedPath: probe.resolvedPath } : {}),
    };
  }
  return {
    available: true,
    ...(probe.resolvedPath ? { resolvedPath: probe.resolvedPath } : {}),
    command: probe.launch.command,
    args: probe.launch.argsForDir(resolvedDir),
  };
}

const HOST_TOOL_EXIT_GRACE_MS = 500;

// Spawn a detached host-tool launch and wait briefly for an immediate failure.
// Node emits `spawn` once the child is running and `error` when the launch
// is refused (missing binary, quarantine, EACCES). A wrapper may also spawn
// successfully and exit non-zero immediately, so wait for that failure class
// before reporting success (#3871, #6610).
export function launchHostTool(
  command: string,
  args: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    // Detached so the daemon doesn't keep the child alive; same shape paseo
    // uses (CLI shim, `open -a`, Explorer, xdg-open, etc.).
    //
    // Do NOT pass `shell: true`. On Windows that runs the launch through cmd.exe,
    // which shell-interprets the args — and one of them is the (project-derived)
    // directory path, so a path containing `&`, `|`, `^`, `>` etc. would inject
    // commands. `command` is already a resolved absolute path (incl. .exe/.cmd),
    // so route it through `createCommandInvocation`, which runs a .cmd/.bat via
    // cmd.exe with CommandLineToArgvW-safe verbatim args and everything else
    // directly — no shell, no metacharacter interpretation.
    const invocation = createCommandInvocation({ command, args });
    // The packaged daemon needs this flag to run under Electron as Node, but
    // external Electron-based GUI apps inherit it and may then exit immediately.
    // Strip it only from this child process; leave the daemon environment intact.
    const childEnv = { ...process.env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(invocation.command, invocation.args, {
      detached: true,
      env: childEnv,
      stdio: 'ignore',
      windowsHide: process.platform === 'win32',
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    let settled = false;
    let spawned = false;
    let exitGraceTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      if (exitGraceTimer) clearTimeout(exitGraceTimer);
      if (spawned) child.unref();
      resolve(result);
    };

    child.once('spawn', () => {
      if (settled) return;
      spawned = true;
      exitGraceTimer = setTimeout(() => settle({ ok: true }), HOST_TOOL_EXIT_GRACE_MS);
    });
    child.once('error', (err) => {
      settle({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      if (code === 0) {
        settle({ ok: true });
        return;
      }
      const error = signal
        ? `Host tool was terminated by signal ${signal}`
        : typeof code === 'number'
          ? `Host tool exited with code ${code}`
          : 'Host tool exited before reporting a status';
      settle({ ok: false, error });
    });
  });
}

export function applicableForPlatform(entry: CatalogueEntry, platform: Platform): boolean {
  if (platform === 'unknown') return false;
  if (entry.platforms && !entry.platforms.includes(platform)) return false;
  if (entry.excludedPlatforms && entry.excludedPlatforms.includes(platform)) return false;
  return true;
}

function projectHostOpenDir(
  projectsRoot: string,
  project: { id: string; metadata?: { baseDir?: unknown } | null },
  resolveProjectDir: (
    projectsRoot: string,
    projectId: string,
    metadata?: unknown,
    opts?: { allowUnavailableSandboxImportedProject?: boolean },
  ) => string,
): string {
  const importedBaseDir =
    typeof project.metadata?.baseDir === 'string'
      ? path.normalize(project.metadata.baseDir)
      : '';
  if (importedBaseDir && path.isAbsolute(importedBaseDir)) {
    return importedBaseDir;
  }
  return resolveProjectDir(projectsRoot, project.id, project.metadata, {
    allowUnavailableSandboxImportedProject: true,
  });
}

export function registerHostToolsRoutes(app: Express, ctx: RegisterHostToolsRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { resolveProjectDir } = ctx.projectFiles;

  app.get('/api/editors', async (_req, res) => {
    try {
      const platform = currentPlatform();
      const filtered = CATALOGUE.filter((entry) => applicableForPlatform(entry, platform));
      const editors: HostEditor[] = await Promise.all(
        filtered.map(async (entry) => {
          const probe = await resolveEntry(entry);
          return {
            id: entry.id,
            label: entry.label,
            icon: entry.icon,
            available: probe.available,
            ...(probe.resolvedPath ? { resolvedPath: probe.resolvedPath } : {}),
            ...(entry.platforms ? { platforms: entry.platforms } : {}),
          };
        }),
      );
      const body: HostEditorsResponse = { editors, platform };
      res.json(body);
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.post('/api/projects/:id/open-in', async (req, res) => {
    try {
      const projectId = req.params.id;
      const editorId = (req.body?.editorId ?? '') as HostEditorId;
      if (!editorId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'editorId is required');
      }
      const entry = CATALOGUE.find((c) => c.id === editorId);
      if (!entry) {
        return sendApiError(res, 400, 'BAD_REQUEST', `unknown editor: ${editorId}`);
      }
      const platform = currentPlatform();
      if (!applicableForPlatform(entry, platform)) {
        return sendApiError(res, 400, 'BAD_REQUEST', `${entry.label} is not available on ${platform}`);
      }
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await ctx.authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      const resolvedDir = projectHostOpenDir(
        PROJECTS_DIR,
        project,
        resolveProjectDir,
      );
      const launchPlan = await resolveHostToolLaunchPlan(editorId, resolvedDir);
      if (!launchPlan.available || !launchPlan.command || !launchPlan.args) {
        return sendApiError(res, 409, 'EDITOR_NOT_AVAILABLE', `${entry.label} is not installed`);
      }
      // Wait for the OS to confirm the launch before replying. Previously
      // this returned ok:true synchronously and swallowed the child's `error`
      // event, so a refused launch was reported as success and the user saw
      // nothing happen — the web button only surfaces an error on a non-OK
      // response (#3871).
      const launch = await launchHostTool(launchPlan.command, launchPlan.args);
      if (!launch.ok) {
        return sendApiError(
          res,
          500,
          'EDITOR_LAUNCH_FAILED',
          `Failed to launch ${entry.label}: ${launch.error}`,
        );
      }
      const body: OpenProjectInEditorResponse = {
        ok: true,
        editorId,
        path: resolvedDir,
      };
      res.json(body);
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });
}
