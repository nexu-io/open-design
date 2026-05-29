import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Cross-platform spawn helper for "open a system terminal and run this
// command in it." Used by the antigravity adapter's `oauth-launch`
// endpoint: agy's print mode (`-p`) cannot complete the Google
// Sign-In OAuth flow (the upstream callback page asks the user to
// paste the auth code back into agy, but `-p` has no input field), so
// the user has to run `agy` interactively at least once to populate
// the system keyring. Spawning a terminal from inside OD makes that
// a one-click action instead of a "go open Terminal yourself" task.
//
// Each platform branch uses primitives that are safe against shell
// injection BECAUSE we never accept user input here — the `command`
// argument is always a hard-coded binary name like `agy`. Adding
// caller-supplied flags or env vars to this helper would invalidate
// that guarantee, so the signature is intentionally narrow.

export type TerminalLaunchResult =
  | { ok: true; platform: NodeJS.Platform; via: string }
  | { ok: false; platform: NodeJS.Platform; reason: string };

// macOS: AppleScript via osascript. Bringing Terminal.app to the
// foreground and creating a new shell that immediately runs the
// command is the canonical macOS pattern (same one VS Code uses for
// "Open in External Terminal").
async function launchOnDarwin(command: string): Promise<TerminalLaunchResult> {
  // `do script "<cmd>"` opens a new Terminal window and runs <cmd>
  // in it; activate brings Terminal.app to the foreground so the
  // user actually sees the new window. Strict double-quote escaping
  // protects us if `command` ever grows special characters (today
  // it's just `agy`, so this is belt-and-suspenders).
  const safe = command.replace(/"/g, '\\"');
  const script = `tell application "Terminal" to do script "${safe}"\ntell application "Terminal" to activate`;
  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 5_000 });
    return { ok: true, platform: 'darwin', via: 'osascript' };
  } catch (err) {
    return {
      ok: false,
      platform: 'darwin',
      reason: `osascript failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Linux: try the Debian/Ubuntu meta-emulator first, then the common
// concrete terminals. Each attempt spawns detached so the terminal
// window's lifetime is independent from the daemon's process group.
// We resolve as soon as the child process starts (not when it exits),
// because terminals like xterm and x-terminal-emulator stay alive for
// the duration of the interactive session — waiting for exit would time
// out and kill the window mid-OAuth-flow.
async function launchOnLinux(command: string): Promise<TerminalLaunchResult> {
  // Order matters: x-terminal-emulator is the Debian alternative that
  // resolves to whichever terminal the distro chose. Otherwise try the
  // common ones. Each requires a slightly different invocation syntax
  // (`-e` vs `--` vs `-x`), captured in this table.
  const attempts: Array<{ bin: string; args: string[] }> = [
    { bin: 'x-terminal-emulator', args: ['-e', command] },
    { bin: 'gnome-terminal', args: ['--', 'sh', '-c', `${command}; exec $SHELL`] },
    { bin: 'konsole', args: ['-e', command] },
    { bin: 'xfce4-terminal', args: ['-e', command] },
    { bin: 'xterm', args: ['-e', command] },
  ];
  const errors: string[] = [];
  for (const { bin, args } of attempts) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(bin, args, { detached: true, stdio: 'ignore' });
        child.unref();
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      return { ok: true, platform: 'linux', via: bin };
    } catch (err) {
      errors.push(`${bin}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    ok: false,
    platform: 'linux',
    reason: `no system terminal worked (${errors.join('; ')})`,
  };
}

// Windows: `cmd /c start "<title>" cmd /k "<command>"` — the outer
// `start` opens a new console window (the first quoted "Open Design"
// is the window title, required by `start`'s positional-arg parser
// when the next token is also quoted), and the inner `cmd /k` keeps
// the window open after the command finishes so the user can see
// OAuth output and finish the flow before the window closes.
async function launchOnWindows(command: string): Promise<TerminalLaunchResult> {
  try {
    await execFileAsync(
      'cmd.exe',
      ['/c', 'start', 'Open Design', 'cmd.exe', '/k', command],
      { timeout: 5_000 },
    );
    return { ok: true, platform: 'win32', via: 'cmd /c start' };
  } catch (err) {
    return {
      ok: false,
      platform: 'win32',
      reason: `cmd /c start failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function launchAgentInSystemTerminal(
  command: string,
  platform: NodeJS.Platform = process.platform,
): Promise<TerminalLaunchResult> {
  switch (platform) {
    case 'darwin':
      return launchOnDarwin(command);
    case 'linux':
      return launchOnLinux(command);
    case 'win32':
      return launchOnWindows(command);
    default:
      return {
        ok: false,
        platform,
        reason: `system-terminal launch is not supported on ${platform}`,
      };
  }
}
