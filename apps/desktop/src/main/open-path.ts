import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path';

/**
 * Open a validated absolute directory in the host platform's native file
 * manager. Pulled out of the `shell:open-path` IPC handler so the routing
 * decision (Electron's default opener vs. WSL → Explorer pivot) can be unit
 * tested without booting Electron.
 *
 * **WSL routing rationale (#1581).** On WSL Electron, `shell.openPath`
 * delegates to xdg-open on Linux, and `xdg-open` typically routes
 * `inode/directory` MIME through the default browser (Chrome on common WSL
 * setups via `wslu`) rather than Explorer or a native Linux file manager.
 * Route through `wslpath -w <dir>` + `explorer.exe <windows-path>` so the
 * Windows host's Explorer opens the resolved folder, matching what the
 * "Continue in CLI" flow promised users.
 *
 * Non-WSL Linux installs with proper `xdg-open` MIME associations, plus
 * macOS and native Windows, are untouched — they still hit `shell.openPath`.
 * If the WSL helpers fail (missing `wslpath`, missing `explorer.exe`,
 * non-standard WSL setup), the routing falls back to `shell.openPath`
 * rather than surfacing a WSL-specific error.
 */
export interface OpenPathDeps {
  release: () => string;
  execFile: (command: string, args: readonly string[]) => Promise<{ stdout: string }>;
  openPath: (path: string) => Promise<string>;
}

/**
 * Returns `""` on success (matching Electron's `shell.openPath` contract so
 * the IPC return value is unchanged across platforms), or an error message
 * string on failure.
 */
export async function openValidatedDirectory(
  resolvedPath: string,
  deps: OpenPathDeps,
): Promise<string> {
  if (deps.release().toLowerCase().includes("microsoft")) {
    let windowsPath: string;
    try {
      const { stdout } = await deps.execFile("wslpath", ["-w", resolvedPath]);
      windowsPath = stdout.trim();
    } catch {
      return await deps.openPath(resolvedPath);
    }
    if (windowsPath.length > 0) {
      try {
        await deps.execFile("explorer.exe", [windowsPath]);
      } catch (err) {
        // explorer.exe routinely exits non-zero (typically 1) even after
        // opening the folder successfully, so a rejected execFile here
        // does NOT mean Explorer failed to launch — it just means the
        // process exited non-zero. Only fall back to shell.openPath when
        // explorer.exe never spawned at all (ENOENT/EACCES); for every
        // other error code, treat Explorer as having opened the folder
        // and short-circuit the success path. Without this distinction,
        // the WSL happy path would still surface the Chrome file://
        // listing that #1581 is about, because the post-launch exit-1
        // would look identical to a missing binary.
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: unknown }).code
            : undefined;
        if (code === "ENOENT" || code === "EACCES") {
          return await deps.openPath(resolvedPath);
        }
      }
      return "";
    }
  }
  return await deps.openPath(resolvedPath);
}

/** Dependencies for revealing a validated file in the native file manager. */
export interface RevealPathDeps {
  release: () => string;
  execFile: (command: string, args: readonly string[]) => Promise<{ stdout: string }>;
  showItemInFolder: (path: string) => void;
}

/**
 * Reveals a validated file in the native file manager (Finder on macOS,
 * Explorer on Windows, native file manager on Linux). On WSL2, routes
 * through `wslpath -w <file>` + `explorer.exe /select,<windows-path>` so
 * Windows Explorer selects/reveals the file rather than falling back to
 * xdg-open (which either fails or opens Chrome with file://).
 */
export async function revealValidatedFile(
  resolvedFilePath: string,
  deps: RevealPathDeps,
): Promise<string> {
  if (deps.release().toLowerCase().includes('microsoft')) {
    let windowsPath: string;
    try {
      const { stdout } = await deps.execFile('wslpath', ['-w', resolvedFilePath]);
      windowsPath = stdout.trim();
    } catch {
      deps.showItemInFolder(resolvedFilePath);
      return '';
    }
    if (windowsPath.length > 0) {
      try {
        await deps.execFile('explorer.exe', [`/select,${windowsPath}`]);
      } catch (err) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code?: unknown }).code
            : undefined;
        if (code === 'ENOENT' || code === 'EACCES') {
          deps.showItemInFolder(resolvedFilePath);
          return '';
        }
      }
      return '';
    }
  }
  deps.showItemInFolder(resolvedFilePath);
  return '';
}

export interface RevealProjectFileDeps extends RevealPathDeps {
  fetchResolvedProjectDir: (
    apiBaseUrl: string,
    projectId: string,
  ) => Promise<{ ok: true; context: { fromTrustedPicker: boolean; hasBaseDir: boolean; resolvedDir: string } } | { ok: false; reason: string }>;
  isOpenPathAllowedForProject: (
    context: { fromTrustedPicker: boolean; hasBaseDir: boolean; resolvedDir: string },
  ) => { ok: true } | { ok: false; reason: string };
  validateExistingDirectory: (
    dir: string,
  ) => Promise<{ ok: true; resolved: string } | { ok: false; reason: string }>;
  resolveProjectRelativeFile: (
    projectRoot: string,
    relativePath: string,
  ) => Promise<{ ok: true; resolved: string } | { ok: false; reason: string }>;
}

/**
 * Full IPC pipeline for revealing a project-relative file:
 * 1. resolve project directory via daemon API trust boundary
 * 2. verify folder-import trust status
 * 3. validate existing directory
 * 4. resolve relative file against project root with security gates
 * 5. reveal in file manager (with WSL routing)
 */
export async function handleRevealProjectFile(
  apiBaseUrl: string | null,
  projectId: string,
  relativePath: string,
  deps: RevealProjectFileDeps,
): Promise<string> {
  if (!apiBaseUrl) {
    return 'reveal-file: daemon API URL not available';
  }
  const resolved = await deps.fetchResolvedProjectDir(apiBaseUrl, projectId);
  if (!resolved.ok) return `reveal-file: ${resolved.reason}`;
  const allowed = deps.isOpenPathAllowedForProject(resolved.context);
  if (!allowed.ok) return `reveal-file: ${allowed.reason}`;
  const validated = await deps.validateExistingDirectory(resolved.context.resolvedDir);
  if (!validated.ok) return `reveal-file: ${validated.reason}`;
  const resolvedFile = await deps.resolveProjectRelativeFile(validated.resolved, relativePath);
  if (!resolvedFile.ok) return `reveal-file: ${resolvedFile.reason}`;
  try {
    return await revealValidatedFile(resolvedFile.resolved, deps);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Resolves and validates a project-relative file path against a canonical
 * project directory. Rejects absolute paths, null bytes, directory traversal
 * escaping the project root, non-existent files, and directories.
 */
export async function resolveProjectRelativeFile(
  projectRoot: string,
  relativePath: string,
): Promise<{ ok: true; resolved: string } | { ok: false; reason: string }> {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    return { ok: false, reason: 'relative path must be a non-empty string' };
  }
  if (relativePath.includes(String.fromCharCode(0))) {
    return { ok: false, reason: 'relative path contains null bytes' };
  }
  if (
    isAbsolute(relativePath) ||
    posix.isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.startsWith('\\')
  ) {
    return { ok: false, reason: 'relative path must not be absolute' };
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(projectRoot);
  } catch {
    canonicalRoot = resolve(projectRoot);
  }

  const targetPath = resolve(canonicalRoot, relativePath);
  const rel = relative(canonicalRoot, targetPath);
  if (
    rel === '..' ||
    rel.startsWith('..' + sep) ||
    rel.startsWith('../') ||
    rel.startsWith('..\\') ||
    isAbsolute(rel) ||
    rel === ''
  ) {
    return { ok: false, reason: 'path escapes project root' };
  }

  let realFilePath: string;
  try {
    realFilePath = await realpath(targetPath);
  } catch {
    return { ok: false, reason: 'file does not exist' };
  }

  const relReal = relative(canonicalRoot, realFilePath);
  if (
    relReal === '..' ||
    relReal.startsWith('..' + sep) ||
    relReal.startsWith('../') ||
    relReal.startsWith('..\\') ||
    isAbsolute(relReal) ||
    relReal === ''
  ) {
    return { ok: false, reason: 'path escapes project root' };
  }

  let st;
  try {
    st = await stat(realFilePath);
  } catch {
    return { ok: false, reason: "file could not be stat'd" };
  }

  if (st.isDirectory()) {
    return { ok: false, reason: 'path is a directory, not a file' };
  }

  return { ok: true, resolved: realFilePath };
}
