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
