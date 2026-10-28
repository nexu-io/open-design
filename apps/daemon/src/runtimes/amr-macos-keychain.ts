import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type LauncherInput = {
  opencodeBin: string;
  keychainPath: string;
  sessionRoot: string;
  securityBin?: string;
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Initialize only an unconfigured Vela session home, before native tools run. */
export function buildAmrMacKeychainLauncher(input: LauncherInput): string {
  const security = shellQuote(input.securityBin ?? '/usr/bin/security');
  const keychain = shellQuote(input.keychainPath);
  return `#!/bin/sh
case "\${HOME:-}" in
  ${shellQuote(`${input.sessionRoot}/`)}*)
    preferences="$HOME/Library/Preferences/com.apple.security.plist"
    if [ ! -e "$preferences" ] && [ ! -L "$preferences" ] &&
       ! ${security} default-keychain -d user >/dev/null 2>&1; then
      (
        umask 077
        /bin/mkdir -p "$HOME/Library/Preferences" "$HOME/Library/Keychains" &&
        ${security} default-keychain -d user -s ${keychain} &&
        ${security} list-keychains -d user -s ${keychain}
      ) || printf '%s\\n' 'OpenDesign: could not initialize the AMR macOS keychain reference' >&2
    fi
    ;;
esac
exec ${shellQuote(input.opencodeBin)} "$@"
`;
}

function findDefaultKeychain(env: NodeJS.ProcessEnv): string | null {
  try {
    // This reads the keychain's path, never a password or a Safe Storage value.
    const output = execFileSync('/usr/bin/security', ['default-keychain', '-d', 'user'], {
      env, encoding: 'utf8', timeout: 2_000, maxBuffer: 4096,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const keychain: unknown = JSON.parse(output);
    return typeof keychain === 'string' && path.isAbsolute(keychain) ? keychain : null;
  } catch {
    return null;
  }
}

/**
 * Vela replaces HOME after it starts. An inner OpenCode launcher can initialize
 * that home's native Keychain preferences without changing its isolated HOME,
 * XDG roots, or the host keychain's contents and access controls.
 */
export function prepareAmrMacKeychainLauncher(
  env: NodeJS.ProcessEnv,
  opencodeBin: string,
  options: {
    platform?: NodeJS.Platform;
    findDefaultKeychain?: (env: NodeJS.ProcessEnv) => string | null;
  } = {},
): string {
  if ((options.platform ?? process.platform) !== 'darwin') return opencodeBin;
  const dataDir = env.OD_DATA_DIR?.trim();
  const hostHome = env.HOME?.trim();
  if (!dataDir || !path.isAbsolute(dataDir) || !hostHome || !path.isAbsolute(hostHome)) {
    return opencodeBin;
  }
  const configuredHome = env.AMR_HOME?.trim();
  const amrHome = configuredHome === '~'
    ? hostHome
    : configuredHome?.startsWith('~/')
      ? path.join(hostHome, configuredHome.slice(2))
      : configuredHome || path.join(hostHome, '.amr');
  if (!path.isAbsolute(amrHome)) return opencodeBin;
  const keychainPath = (options.findDefaultKeychain ?? findDefaultKeychain)(env);
  if (!keychainPath) return opencodeBin;
  const input = {
    opencodeBin, keychainPath, sessionRoot: path.join(amrHome, 'opencode-sessions'),
  };
  const script = buildAmrMacKeychainLauncher(input);
  const id = createHash('sha256').update(script).digest('hex').slice(0, 16);
  const directory = path.join(dataDir, 'amr', 'launchers');
  const launcher = path.join(directory, `opencode-macos-keychain-${id}`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    let previous: string | null = null;
    try {
      previous = readFileSync(launcher, 'utf8');
    } catch {
      // First launch for this selected companion/keychain pair.
    }
    if (previous !== script) writeFileSync(launcher, script, { mode: 0o700 });
    chmodSync(launcher, 0o700);
    return launcher;
  } catch (error) {
    console.warn(
      'OpenDesign: could not prepare the AMR macOS keychain launcher; using the selected companion:',
      error instanceof Error ? error.message : String(error),
    );
    return opencodeBin;
  }
}
