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
import type { Express } from 'express';
import type {
  HostEditor,
  HostEditorId,
  HostEditorsResponse,
  OpenProjectInEditorResponse,
} from '@open-design/contracts';
import type { RouteDeps } from './server-context.js';

export interface RegisterHostToolsRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'projectFiles'> {}

type RealPlatform = 'darwin' | 'win32' | 'linux';
type Platform = RealPlatform | 'unknown';

interface CatalogueEntry {
  id: HostEditorId;
  label: string;
  icon: string;
  // CLI shim name to probe on $PATH. Mutually exclusive with `macOpenBundle`.
  command?: string;
  // macOS-only fallback: when the CLI shim is missing, look for an app
  // bundle by name and launch it via `open -a "<name>"`. Lets us list
  // Xcode / Qoder / Antigravity / Warp / IntelliJ without forcing users
  // to also install their CLI shim.
  macOpenBundle?: string;
  platforms?: RealPlatform[];
  excludedPlatforms?: RealPlatform[];
}

// The catalogue covers the apps shown in the user's reference screenshot
// (image 4): Qoder, Cursor, Zed, Windsurf, Antigravity, Finder, Terminal,
// Warp, Xcode, IntelliJ IDEA — plus a few cross-platform staples.
const CATALOGUE: ReadonlyArray<CatalogueEntry> = [
  { id: 'cursor', label: 'Cursor', icon: 'sparkles', command: 'cursor', macOpenBundle: 'Cursor' },
  { id: 'vscode', label: 'VS Code', icon: 'file-code', command: 'code', macOpenBundle: 'Visual Studio Code' },
  { id: 'windsurf', label: 'Windsurf', icon: 'sparkles', command: 'windsurf', macOpenBundle: 'Windsurf' },
  { id: 'zed', label: 'Zed', icon: 'edit', command: 'zed', macOpenBundle: 'Zed' },
  { id: 'qoder', label: 'Qoder', icon: 'sparkles', command: 'qoder', macOpenBundle: 'Qoder' },
  { id: 'antigravity', label: 'Antigravity', icon: 'orbit', command: 'antigravity', macOpenBundle: 'Antigravity' },
  { id: 'webstorm', label: 'WebStorm', icon: 'edit', command: 'webstorm', macOpenBundle: 'WebStorm' },
  { id: 'idea', label: 'IntelliJ IDEA', icon: 'edit', command: 'idea', macOpenBundle: 'IntelliJ IDEA' },
  { id: 'xcode', label: 'Xcode', icon: 'file-code', command: 'xed', macOpenBundle: 'Xcode', platforms: ['darwin'] },
  { id: 'finder', label: 'Finder', icon: 'folder', command: 'open', platforms: ['darwin'] },
  { id: 'explorer', label: 'Explorer', icon: 'folder', command: 'explorer', platforms: ['win32'] },
  { id: 'file-manager', label: 'File Manager', icon: 'folder', command: 'xdg-open', platforms: ['linux'] },
  { id: 'terminal', label: 'Terminal', icon: 'sliders', macOpenBundle: 'Terminal', platforms: ['darwin'] },
  { id: 'warp', label: 'Warp', icon: 'sliders', command: 'warp-cli', macOpenBundle: 'Warp' },
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
    ? ['/usr/local/bin', '/opt/homebrew/bin', `${process.env.HOME ?? ''}/.local/bin`]
    : process.platform === 'linux'
      ? ['/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`]
      : [];
  return [...raw.split(sep), ...extras].filter(Boolean);
}

async function probeCommandOnPath(command: string): Promise<string | null> {
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

async function probeMacBundle(name: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  const candidates = [
    `/Applications/${name}.app`,
    `${process.env.HOME ?? ''}/Applications/${name}.app`,
  ];
  for (const path of candidates) {
    try {
      await access(path, fsConstants.R_OK);
      return path;
    } catch {
      // not here
    }
  }
  return null;
}

async function resolveEntry(entry: CatalogueEntry): Promise<{
  available: boolean;
  resolvedPath?: string;
  launch?: { command: string; args: string[] };
}> {
  if (entry.command) {
    const resolved = await probeCommandOnPath(entry.command);
    if (resolved) {
      return { available: true, resolvedPath: resolved, launch: { command: resolved, args: [] } };
    }
  }
  if (entry.macOpenBundle && process.platform === 'darwin') {
    const bundle = await probeMacBundle(entry.macOpenBundle);
    if (bundle) {
      return {
        available: true,
        resolvedPath: bundle,
        launch: { command: 'open', args: ['-a', entry.macOpenBundle] },
      };
    }
  }
  return { available: false };
}

function applicableForPlatform(entry: CatalogueEntry, platform: Platform): boolean {
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
      const resolvedDir = projectHostOpenDir(
        PROJECTS_DIR,
        project,
        resolveProjectDir,
      );
      const probe = await resolveEntry(entry);
      if (!probe.available || !probe.launch) {
        return sendApiError(res, 409, 'EDITOR_NOT_AVAILABLE', `${entry.label} is not installed`);
      }
      // Detached spawn so the daemon doesn't keep the child alive; same
      // shape paseo uses. We append the project's resolved directory as
      // the last positional argument — every entry in the catalogue
      // accepts "<exe> <dir>" semantics (open -a Foo /path, cursor
      // /path, code /path, explorer C:\path, xdg-open /path).
      const child = spawn(probe.launch.command, [...probe.launch.args, resolvedDir], {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      child.on('error', () => {
        // Swallow — best-effort; the client will see ok:true but the OS
        // might still have refused (e.g. quarantine). Real diagnostic
        // path is `od project open-in --debug`.
      });
      child.unref();
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
