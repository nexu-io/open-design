/**
 * @module toolchain
 *
 * User-level toolchain bin discovery. Single source of truth for the CLI
 * install locations a GUI-launched daemon must search even under a stripped
 * PATH — npm/pnpm/bun/cargo/deno/go/pyenv prefixes, version-manager shims
 * (asdf, volta, mise, nvm, fnm), and per-version Node install roots. Pure path
 * assembly plus best-effort directory probing; no process, command, or proxy
 * concerns.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type WellKnownUserToolchainOptions = {
  // Override homedir() so callers in sandboxed tests or namespaced launches
  // can substitute a fixture directory. Falls back to os.homedir().
  home?: string;
  // Include /opt/homebrew/bin and /usr/local/bin in the result. Defaults to
  // true on POSIX so GUI-launched processes (which inherit a minimal PATH
  // from launchd / desktop launchers) still see Homebrew-installed CLIs;
  // defaults to false on Windows because those paths are POSIX-only.
  includeSystemBins?: boolean;
  // Read $NPM_CONFIG_PREFIX / $npm_config_prefix from this map and append
  // `<prefix>/bin` if defined. Defaults to process.env so user-customised
  // npm prefixes are picked up automatically. Pass an empty object to
  // suppress lookup (useful in tests).
  env?: NodeJS.ProcessEnv;
};

/** @internal Resolve a possibly `~`-prefixed or absolute path against `home`, or `null` when it is neither. */
function resolveUserScopedHome(raw: string | undefined, home: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(home, value.slice(2));
  }
  return isAbsolute(value) ? value : null;
}

// Single source of truth for "user-level CLI install locations the daemon
// must search even when launched with a minimal PATH". GUI launchers
// (macOS .app bundles, Linux .desktop files) typically inherit a stripped
// PATH from launchd / the desktop session and do not read interactive
// shell rc files, so without this list any CLI installed under the user's
// own toolchain (`npm i -g`, `pnpm self-install`, `cargo install`, asdf,
// nvm, fnm, mise, ...) is silently undetected. Both the daemon resolver
// and the packaged sidecar PATH builder consume this so the two layers
// can never drift again.
/**
 * Assemble the ordered list of user-level toolchain bin directories to prepend
 * to PATH so a GUI-launched daemon can find CLIs installed under the user's own
 * toolchain even when it inherits a stripped PATH. Entries are search-path
 * candidates (existence is not required) except version-manager install roots,
 * which are probed and version-sorted.
 *
 * @param options - Optional `home`, `includeSystemBins`, and `env` overrides (all default to real values).
 * @returns The ordered list of candidate bin directories, most-specific first.
 */
export function wellKnownUserToolchainBins(
  options: WellKnownUserToolchainOptions = {},
): string[] {
  const home = options.home ?? homedir();
  const includeSystemBins = options.includeSystemBins ?? process.platform !== "win32";
  const env = options.env ?? process.env;
  const dirs: string[] = [];
  // Vite+ global installs expose CLI shims from VP_HOME/bin (default
  // ~/.vite-plus/bin). An explicit VP_HOME is the most specific signal for
  // vp-managed shims, so it wins over other global package-manager prefixes
  // when a CLI name exists in multiple stores.
  const vpHome = resolveUserScopedHome(env.VP_HOME, home);
  if (vpHome) {
    dirs.push(join(vpHome, "bin"));
  }
  // The user's *explicit* npm prefix outranks every conventional
  // location below — including `~/.local/bin`. The env var is the
  // user's current npm configuration, so a binary installed via
  // `npm i -g` today lives at `<prefix>/bin`. Conventional locations
  // (`~/.local/bin`, `~/.npm-global`, `~/.npm-packages`) routinely
  // hold *stale* installs from an older prefix the user has since
  // rewritten, and `~/.local/bin` in particular is also a shared
  // dumping ground for pip --user / cargo install / hand-built
  // binaries that may collide with old npm artefacts. Putting the
  // env-driven prefix first matches npm's own resolution order
  // (env > .npmrc > default) and gives "explicit beats convention"
  // semantics across the whole list, not just the npm-prefix block.
  // Trim before length-checking so accidental whitespace-only values
  // (`NPM_CONFIG_PREFIX=" "`) do not produce a `/bin`-suffixed garbage
  // entry.
  const npmPrefixRaw = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (typeof npmPrefixRaw === "string") {
    const npmPrefix = npmPrefixRaw.trim();
    if (npmPrefix.length > 0) {
      // Unix: npm global binaries live in <prefix>/bin. Always add it as a
      // search-path candidate — existence is irrelevant for a PATH directory,
      // and this preserves the long-standing helper contract.
      dirs.push(join(npmPrefix, "bin"));
      // Windows: npm installs global binaries directly into the prefix root
      // (there is no /bin subdirectory), so add the root as well. Additive —
      // the <prefix>/bin entry above is left untouched for cross-platform
      // parity.
      if (process.platform === "win32") {
        dirs.push(npmPrefix);
      }
    }
  }
  // Windows: %APPDATA%\npm is npm's default global prefix. NPM_CONFIG_PREFIX /
  // npm_config_prefix are npm-internal vars that are usually absent in Electron
  // child-process environments, so the block above no-ops for most Windows
  // users. Add the default location unconditionally — consistent with the
  // conventional dirs below, which are also added without an existence check.
  if (process.platform === "win32") {
    dirs.push(join(home, "AppData", "Roaming", "npm"));
  }
  dirs.push(
    join(home, ".local", "bin"),
    join(home, ".vite-plus", "bin"),
    join(home, ".kimi-code", "bin"),
    join(home, ".opencode", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".asdf", "shims"),
    join(home, "Library", "pnpm"),
    join(home, ".cargo", "bin"),
    // Common user-level npm prefixes for sudo-free global installs.
    // ~/.npm-global is the dominant non-canonical convention shipped
    // in most third-party "fix npm EACCES" tutorials, and
    // ~/.npm-packages is the second-most common variant. Without
    // these, GUI-launched daemons miss `npm i -g`'d CLIs even though
    // they resolve cleanly from the user's shell. See open-design
    // issue #442.
    join(home, ".npm-global", "bin"),
    join(home, ".npm-packages", "bin"),
    // Other common user-level toolchains that install CLI shims outside the
    // Node ecosystem but still ship agent CLIs (or their dependencies):
    // Deno's install root, Go's default GOBIN, and pyenv's shim dir. All are
    // best-effort — a missing dir contributes nothing.
    join(home, ".deno", "bin"),
    join(home, "go", "bin"),
    join(home, ".pyenv", "shims"),
  );

  // Windows-only user install roots that GUI launches miss. Scoop drops
  // shims under ~/scoop/shims, and npm's global prefix on Windows defaults
  // to %APPDATA%\npm rather than a `bin` subdir.
  if (process.platform === "win32") {
    dirs.push(join(home, "scoop", "shims"));
    const appData = typeof env.APPDATA === "string" ? env.APPDATA.trim() : "";
    if (appData.length > 0) {
      dirs.push(join(appData, "npm"));
    }
  }

  // Mise shims: makes every tool installed with `mise install` visible to
  // GUI-launched daemons even when the process inherits a stripped PATH.
  // Respect MISE_DATA_DIR (the official way to relocate the whole mise tree).
  // We only fall back to the legacy ~/.mise/shims path when no explicit
  // MISE_DATA_DIR override is provided.
  const miseDataOverride = resolveUserScopedHome(env.MISE_DATA_DIR, home);
  const miseData = miseDataOverride || join(home, ".local", "share", "mise");
  dirs.push(join(miseData, "shims"));

  if (!miseDataOverride) {
    dirs.push(join(home, ".mise", "shims"));
  }

  if (includeSystemBins) {
    dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  }
  // Per-version Node toolchains: scan the install root and surface every
  // version directory's bin folder. Best-effort — missing roots simply
  // contribute nothing.
  // When MISE_DATA_DIR is set we use the same root for consistency with shims.
  const miseInstalls = join(miseData, "installs");
  dirs.push(...existingMiseNpmPackageBinDirs(miseInstalls));
  const nodeInstallRoots: Array<{ root: string; segments: string[] }> = [
    {
      root: join(miseInstalls, "node"),
      segments: ["bin"],
    },
    {
      root: join(home, ".nvm", "versions", "node"),
      segments: ["bin"],
    },
    {
      root: join(home, ".local", "share", "fnm", "node-versions"),
      segments: ["installation", "bin"],
    },
    {
      root: join(home, ".fnm", "node-versions"),
      segments: ["installation", "bin"],
    },
  ];
  // Windows fnm keeps Node installs under <fnm-root>\node-versions\<ver>\
  // installation, with node.exe — and any `npm i -g`'d CLI shim such as
  // codex.cmd — directly in `installation` (no POSIX-style `bin` subdir).
  // The fnm root is %APPDATA%\fnm or %LOCALAPPDATA%\fnm depending on the
  // install, and `FNM_DIR` overrides both. A GUI-launched packaged app
  // inherits a stripped PATH and reads no shell rc, so without an explicit
  // probe fnm-managed Node — and every agent CLI it runs — is silently
  // undetected on Windows. See issues #3517 and #3062.
  if (process.platform === "win32") {
    const fnmDirOverride = typeof env.FNM_DIR === "string" ? env.FNM_DIR.trim() : "";
    const fnmRoots: string[] = [];
    if (fnmDirOverride.length > 0) {
      fnmRoots.push(fnmDirOverride);
    } else {
      for (const base of [env.LOCALAPPDATA, env.APPDATA]) {
        const trimmed = typeof base === "string" ? base.trim() : "";
        if (trimmed.length > 0) fnmRoots.push(join(trimmed, "fnm"));
      }
    }
    for (const fnmRoot of fnmRoots) {
      nodeInstallRoots.push({ root: join(fnmRoot, "node-versions"), segments: ["installation"] });
    }
  }
  for (const installRoot of nodeInstallRoots) {
    for (const dir of existingChildBinDirs(installRoot.root, installRoot.segments)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

/** @internal Surface bin dirs for npm-packaged toolchains installed under a mise installs root (e.g. `npm-openai-codex`). */
function existingMiseNpmPackageBinDirs(root: string): string[] {
  const out: string[] = [];
  for (const packageName of ["npm-openai-codex"]) {
    const packageRoot = join(root, packageName);
    out.push(...existingChildBinDirs(packageRoot, ["bin"]));
  }
  return out;
}

/** @internal List existing `<root>/<versionDir>/<...segments>` directories, version-sorted, skipping non-directories. */
function existingChildBinDirs(root: string, segments: string[]): string[] {
  const out: string[] = [];
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = readdirSync(root, { encoding: "utf8", withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of sortVersionedDirEntries(entries)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const candidate = join(root, entry.name, ...segments);
    if (existsSync(candidate)) out.push(candidate);
  }
  return out;
}

type SemverParts = [major: number, minor: number, patch: number];

/** @internal Sort directory entries by semver-like name (newest first), falling back to locale order. */
function sortVersionedDirEntries(entries: import("node:fs").Dirent<string>[]): import("node:fs").Dirent<string>[] {
  return [...entries].sort((left, right) => compareVersionLikeDirNames(left.name, right.name));
}

/** @internal Compare two version-like directory names descending; semver-parseable names precede non-parseable ones. */
function compareVersionLikeDirNames(left: string, right: string): number {
  const leftSemver = parseVersionLikeDirName(left);
  const rightSemver = parseVersionLikeDirName(right);
  if (leftSemver && rightSemver) {
    for (let index = 0; index < leftSemver.length; index += 1) {
      const difference = rightSemver[index] - leftSemver[index];
      if (difference !== 0) return difference;
    }
  } else if (leftSemver) {
    return -1;
  } else if (rightSemver) {
    return 1;
  }
  return left.localeCompare(right);
}

/** @internal Parse a `vX.Y.Z` / `X.Y.Z` directory name into its numeric parts, or `null` when it does not match. */
function parseVersionLikeDirName(name: string): SemverParts | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(name);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
